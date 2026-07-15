import type { APIContext, APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import {
	BRIEF_SYSTEM_PROMPT,
	BRIEF_TTL_SECONDS,
	MAX_RESUME_BYTES,
	MIN_FORM_SECONDS,
	checkAndIncrementRateLimit,
	isPdf,
	isValidEmail,
	parseBriefJson,
	toBase64,
	type StoredBrief,
} from "../../lib/brief";
import { upsertContact } from "../../lib/emailoctopus";

const encoder = new TextEncoder();

function getEnv(locals: APIContext["locals"], key: string): string | undefined {
	const runtimeValue = (locals.runtime?.env as Record<string, unknown> | undefined)?.[key];
	if (typeof runtimeValue === "string" && runtimeValue) return runtimeValue;
	const buildValue = (import.meta.env as Record<string, unknown>)[key];
	return typeof buildValue === "string" && buildValue ? buildValue : undefined;
}

function jsonError(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function sseChunk(event: string, data: unknown): Uint8Array {
	return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const POST: APIRoute = async ({ request, locals }) => {
	const apiKey = getEnv(locals, "ANTHROPIC_API_KEY");
	if (!apiKey) {
		console.error("generate-brief: ANTHROPIC_API_KEY is not set");
		return jsonError("The tool is not configured yet. Please try again later.", 503);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return jsonError("Invalid form submission.", 400);
	}

	// Honeypot: real users never fill this hidden field.
	if (typeof form.get("website") === "string" && (form.get("website") as string).length > 0) {
		return jsonError("Something went wrong. Please try again.", 400);
	}

	// Timing check: reject submissions faster than a human could manage.
	const loadedAt = Number(form.get("loadedAt"));
	if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < MIN_FORM_SECONDS * 1000) {
		return jsonError("Please take a moment to review the form before submitting.", 400);
	}

	const firstName = String(form.get("firstName") ?? "").trim();
	const email = String(form.get("email") ?? "").trim().toLowerCase();
	const resume = form.get("resume");

	if (!firstName || firstName.length > 100) {
		return jsonError("Please enter your first name.", 400);
	}
	if (!isValidEmail(email)) {
		return jsonError("Please use a valid, permanent email address.", 400);
	}
	if (!(resume instanceof File)) {
		return jsonError("Please attach a resume PDF.", 400);
	}
	if (resume.size > MAX_RESUME_BYTES) {
		return jsonError("Resume must be under 5 MB.", 400);
	}

	const resumeBytes = new Uint8Array(await resume.arrayBuffer());
	if (!isPdf(resumeBytes, resume)) {
		return jsonError("The file doesn't look like a PDF. Please upload a PDF resume.", 400);
	}

	const kv = locals.runtime.env.BRIEFS;
	const today = new Date().toISOString().slice(0, 10);
	const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		checkAndIncrementRateLimit(kv, `rl:email:${email}:${today}`),
		checkAndIncrementRateLimit(kv, `rl:ip:${ip}:${today}`),
	]);
	if (!emailAllowed || !ipAllowed) {
		return jsonError("Daily limit reached (3 briefs per day). Come back tomorrow.", 429);
	}

	const briefId = crypto.randomUUID();
	const briefUrl = `${new URL(request.url).origin}/brief/${briefId}`;
	const pdfUrl = `${briefUrl}.pdf`;
	const emailEnv = {
		EMAILOCTOPUS_API_KEY: getEnv(locals, "EMAILOCTOPUS_API_KEY"),
		EMAILOCTOPUS_LIST_ID: getEnv(locals, "EMAILOCTOPUS_LIST_ID"),
	};
	const waitUntil = (promise: Promise<unknown>) => {
		try {
			locals.runtime.ctx.waitUntil(promise);
		} catch {
			promise.catch((error) => console.error(error));
		}
	};

	// Capture the lead immediately; generation success is not a precondition.
	waitUntil(upsertContact(emailEnv, { email, fields: { FirstName: firstName } }));

	const anthropic = new Anthropic({ apiKey });
	const stream = anthropic.messages.stream({
		model: "claude-sonnet-4-6",
		max_tokens: 8192,
		system: BRIEF_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "document",
						source: {
							type: "base64",
							media_type: "application/pdf",
							data: toBase64(resumeBytes),
						},
					},
					{ type: "text", text: "Candidate resume attached. Generate the marketing brief." },
				],
			},
		],
	});

	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			controller.enqueue(sseChunk("meta", { id: briefId, url: briefUrl, pdfUrl }));
			let fullText = "";
			try {
				for await (const event of stream) {
					if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
						fullText += event.delta.text;
						controller.enqueue(sseChunk("delta", { text: event.delta.text }));
					}
				}

				const brief = parseBriefJson(fullText);
				if (!brief) {
					controller.enqueue(
						sseChunk("error", { message: "The brief came back malformed. Please try again." }),
					);
					return;
				}
				if (brief.error) {
					controller.enqueue(sseChunk("error", { message: brief.error }));
					return;
				}

				const stored: StoredBrief = {
					id: briefId,
					firstName,
					email,
					brief,
					createdAt: new Date().toISOString(),
				};
				await kv.put(`brief:${briefId}`, JSON.stringify(stored), {
					expirationTtl: BRIEF_TTL_SECONDS,
				});

				// Tag triggers the EmailOctopus automation that emails the brief PDF link.
				waitUntil(
					upsertContact(emailEnv, {
						email,
						fields: { FirstName: firstName, BriefURL: briefUrl, BriefPDF: pdfUrl },
						tags: { "candidate-brief-tool": true },
					}),
				);

				controller.enqueue(sseChunk("done", { id: briefId, url: briefUrl, pdfUrl }));
			} catch (error) {
				console.error("generate-brief: generation failed", error);
				controller.enqueue(
					sseChunk("error", { message: "Generation failed. Please try again in a minute." }),
				);
			} finally {
				controller.close();
			}
		},
		cancel() {
			stream.abort();
		},
	});

	return new Response(body, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
