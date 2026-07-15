// Client-side rendering for Candidate Marketing Briefs.
// Used by /candidate-brief (progressive streaming render) and /brief/[id] (stored render).

import type { CandidateBrief } from "./brief";

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function copyBlock(text: string, inner: string): string {
	return `
		<div class="copy-block" data-copy="${esc(text)}">
			<button class="copy-btn no-print" type="button" aria-label="Copy to clipboard">Copy</button>
			${inner}
		</div>`;
}

export function renderBrief(brief: CandidateBrief): string {
	const parts: string[] = [];

	if (brief.positioning_headline || brief.candidate_snapshot) {
		parts.push(`
			<header class="brief-hero">
				<p class="brief-kicker">Candidate marketing brief</p>
				${brief.positioning_headline ? `<h2 class="brief-headline">${esc(brief.positioning_headline)}</h2>` : ""}
				${brief.candidate_snapshot ? `<p class="brief-snapshot">${esc(brief.candidate_snapshot)}</p>` : ""}
			</header>`);
	}

	if (brief.selling_angles?.length) {
		const cards = brief.selling_angles
			.map(
				(a, i) => `
				<article class="brief-card">
					<strong>${String(i + 1).padStart(2, "0")}. ${esc(a.angle)}</strong>
					${a.why_it_sells ? `<p>${esc(a.why_it_sells)}</p>` : ""}
					${a.evidence ? `<p class="brief-evidence">${esc(a.evidence)}</p>` : ""}
				</article>`,
			)
			.join("");
		parts.push(`
			<section class="brief-section">
				<h3>Selling angles</h3>
				<div class="brief-cards">${cards}</div>
			</section>`);
	}

	const target = brief.target_company_profile;
	if (target && (target.description || target.company_signals?.length || target.likely_pain)) {
		const signals = (target.company_signals ?? []).map((s) => `<li>${esc(s)}</li>`).join("");
		parts.push(`
			<section class="brief-section">
				<h3>Target company profile</h3>
				${target.description ? `<p class="brief-body-text">${esc(target.description)}</p>` : ""}
				${signals ? `<ul class="brief-signals">${signals}</ul>` : ""}
				${
					target.likely_pain
						? `<div class="brief-card"><strong>The pain this candidate solves</strong><p>${esc(target.likely_pain)}</p></div>`
						: ""
				}
			</section>`);
	}

	if (brief.mpc_email?.subject || brief.mpc_email?.body) {
		const subject = brief.mpc_email.subject ?? "";
		const emailBody = brief.mpc_email.body ?? "";
		parts.push(`
			<section class="brief-section">
				<h3>MPC outreach email</h3>
				${copyBlock(
					`Subject: ${subject}\n\n${emailBody}`,
					`${subject ? `<p class="copy-subject">Subject: ${esc(subject)}</p>` : ""}
					<pre class="copy-text">${esc(emailBody)}</pre>`,
				)}
			</section>`);
	}

	if (brief.linkedin_message) {
		parts.push(`
			<section class="brief-section">
				<h3>LinkedIn message</h3>
				${copyBlock(brief.linkedin_message, `<pre class="copy-text">${esc(brief.linkedin_message)}</pre>`)}
			</section>`);
	}

	if (brief.objection_preempts?.length) {
		const cards = brief.objection_preempts
			.map(
				(o) => `
				<article class="brief-card">
					<strong>&ldquo;${esc(o.objection)}&rdquo;</strong>
					${o.counter ? `<p>${esc(o.counter)}</p>` : ""}
				</article>`,
			)
			.join("");
		parts.push(`
			<section class="brief-section">
				<h3>Objection preempts</h3>
				<div class="brief-cards brief-cards--stack">${cards}</div>
			</section>`);
	}

	if (brief.followup_sequence?.length) {
		const steps = brief.followup_sequence
			.map(
				(f) => `
				<div class="followup-step">
					<span class="followup-day">Day ${esc(f.day)}</span>
					${copyBlock(f.message ?? "", `<pre class="copy-text">${esc(f.message)}</pre>`)}
				</div>`,
			)
			.join("");
		parts.push(`
			<section class="brief-section">
				<h3>Follow-up sequence</h3>
				<div class="brief-cards brief-cards--stack">${steps}</div>
			</section>`);
	}

	return parts.join("");
}

export function initCopyButtons(root: HTMLElement): void {
	root.addEventListener("click", (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".copy-btn");
		if (!button) return;
		const text = button.closest(".copy-block")?.getAttribute("data-copy") ?? "";
		navigator.clipboard
			.writeText(text)
			.then(() => {
				button.textContent = "Copied";
				setTimeout(() => {
					button.textContent = "Copy";
				}, 1500);
			})
			.catch(() => {
				button.textContent = "Press Ctrl+C";
			});
	});
}

// Best-effort parse of a JSON document that is still streaming in: close any
// open strings/objects/arrays; if that fails, trim the incomplete trailing
// token and retry. Returns null until enough of the document has arrived.
export function parsePartialBrief(raw: string): CandidateBrief | null {
	const start = raw.indexOf("{");
	if (start === -1) return null;
	let text = raw.slice(start).trimEnd();

	for (let attempt = 0; attempt < 40 && text.length > 1; attempt++) {
		try {
			return JSON.parse(text + closersFor(text)) as CandidateBrief;
		} catch {
			const cut = Math.max(text.lastIndexOf(","), text.lastIndexOf("{"), text.lastIndexOf("["));
			if (cut <= 0) return null;
			text = (text[cut] === "," ? text.slice(0, cut) : text.slice(0, cut + 1)).trimEnd();
		}
	}
	return null;
}

function closersFor(text: string): string {
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	for (const ch of text) {
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{" || ch === "[") stack.push(ch);
		else if (ch === "}" || ch === "]") stack.pop();
	}
	let closers = inString ? '"' : "";
	for (let i = stack.length - 1; i >= 0; i--) {
		closers += stack[i] === "{" ? "}" : "]";
	}
	return closers;
}
