import type { APIRoute } from "astro";
import { generateBriefPdf } from "../../lib/brief-pdf";
import type { StoredBrief } from "../../lib/brief";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params, locals }) => {
	const id = params.id;
	if (!id || !UUID_PATTERN.test(id)) {
		return new Response("Not found", { status: 404 });
	}

	const stored = await locals.runtime.env.BRIEFS.get<StoredBrief>(`brief:${id}`, "json");
	if (!stored) {
		return new Response("This brief has expired or doesn't exist.", { status: 404 });
	}

	const bookingUrl =
		(import.meta.env.PUBLIC_BOOKING_URL as string | undefined) ||
		"https://cal.com/furumconsulting/discovery-call";

	const pdfBytes = await generateBriefPdf(stored, bookingUrl);

	return new Response(pdfBytes, {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": 'attachment; filename="candidate-marketing-brief.pdf"',
			"Cache-Control": "private, max-age=3600",
			"X-Robots-Tag": "noindex",
		},
	});
};
