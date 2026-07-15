// Server-side PDF rendering of a Candidate Marketing Brief using pdf-lib.
// Pure JS, runs on Cloudflare Workers. Layout mirrors the web renderer.

import {
	PDFDocument,
	PDFFont,
	PDFName,
	PDFPage,
	PDFString,
	StandardFonts,
	rgb,
	type RGB,
} from "pdf-lib";
import type { StoredBrief } from "./brief";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const GREEN = rgb(45 / 255, 93 / 255, 82 / 255);
const GREEN_TINT = rgb(0.93, 0.96, 0.95);
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.36, 0.39, 0.38);
const WHITE = rgb(1, 1, 1);

// Standard fonts use WinAnsi encoding; strip anything it can't represent.
function sanitize(value: unknown): string {
	return String(value ?? "")
		.replace(/[‘’‚]/g, "'")
		.replace(/[“”„]/g, '"')
		.replace(/[–—]/g, "-")
		.replace(/…/g, "...")
		.replace(/•/g, "-")
		.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "")
		.replace(/[ \t]+\n/g, "\n");
}

class BriefPdfWriter {
	private page!: PDFPage;
	private y = 0;

	constructor(
		private doc: PDFDocument,
		private regular: PDFFont,
		private bold: PDFFont,
	) {
		this.addPage();
	}

	private addPage(): void {
		this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		this.y = PAGE_HEIGHT - MARGIN;
	}

	private ensure(space: number): void {
		if (this.y - space < MARGIN) this.addPage();
	}

	private wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
		const lines: string[] = [];
		for (const word of text.split(/ +/)) {
			const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
			if (lines.length && font.widthOfTextAtSize(candidate, size) <= maxWidth) {
				lines[lines.length - 1] = candidate;
			} else {
				lines.push(word);
			}
		}
		return lines.length ? lines : [""];
	}

	text(
		raw: unknown,
		{
			font = this.regular,
			size = 10.5,
			color = MUTED,
			lineHeight = 1.45,
			spaceAfter = 8,
			indent = 0,
		}: {
			font?: PDFFont;
			size?: number;
			color?: RGB;
			lineHeight?: number;
			spaceAfter?: number;
			indent?: number;
		} = {},
	): void {
		const content = sanitize(raw);
		if (!content) return;
		const step = size * lineHeight;
		for (const paragraph of content.split("\n")) {
			if (!paragraph.trim()) {
				this.y -= step * 0.6;
				continue;
			}
			for (const line of this.wrapLine(paragraph, font, size, CONTENT_WIDTH - indent)) {
				this.ensure(step);
				this.y -= step;
				this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color });
			}
		}
		this.y -= spaceAfter;
	}

	brandHeader(): void {
		const size = 22;
		this.page.drawRectangle({
			x: MARGIN,
			y: this.y - size,
			width: size,
			height: size,
			color: GREEN,
		});
		this.page.drawText("FC", {
			x: MARGIN + 4.5,
			y: this.y - size + 6.5,
			size: 10,
			font: this.bold,
			color: WHITE,
		});
		this.page.drawText("FURUM CONSULTING", {
			x: MARGIN + size + 9,
			y: this.y - size + 7.5,
			size: 9,
			font: this.bold,
			color: GREEN,
		});
		this.y -= size + 24;
	}

	kicker(label: string): void {
		this.text(label.toUpperCase(), {
			font: this.bold,
			size: 8.5,
			color: GREEN,
			spaceAfter: 4,
		});
	}

	sectionHeading(label: string): void {
		this.ensure(60);
		this.y -= 14;
		this.text(label, { font: this.bold, size: 14, color: INK, spaceAfter: 7 });
		this.page.drawRectangle({
			x: MARGIN,
			y: this.y,
			width: 26,
			height: 2.5,
			color: GREEN,
		});
		this.y -= 12;
	}

	label(raw: unknown): void {
		this.text(raw, { font: this.bold, size: 11, color: INK, spaceAfter: 3 });
	}

	bullet(raw: unknown): void {
		const content = sanitize(raw);
		if (!content) return;
		const size = 10.5;
		this.ensure(size * 1.45);
		this.page.drawCircle({
			x: MARGIN + 3,
			y: this.y - size * 1.05,
			size: 1.8,
			color: GREEN,
		});
		this.text(content, { indent: 12, spaceAfter: 5 });
	}

	tag(labelText: string): void {
		const size = 8.5;
		const paddingX = 6;
		const width = this.bold.widthOfTextAtSize(labelText, size) + paddingX * 2;
		this.ensure(24);
		this.y -= 16;
		this.page.drawRectangle({
			x: MARGIN,
			y: this.y - 4,
			width,
			height: 16,
			color: GREEN_TINT,
		});
		this.page.drawText(labelText, {
			x: MARGIN + paddingX,
			y: this.y,
			size,
			font: this.bold,
			color: GREEN,
		});
		this.y -= 10;
	}

	ctaBox(message: string, buttonLabel: string, url: string): void {
		const boxPadding = 16;
		const messageSize = 10.5;
		const messageLines = this.wrapLine(
			sanitize(message),
			this.regular,
			messageSize,
			CONTENT_WIDTH - boxPadding * 2,
		);
		const buttonHeight = 26;
		const boxHeight =
			boxPadding * 2 + messageLines.length * messageSize * 1.45 + 10 + buttonHeight;
		this.ensure(boxHeight + 18);
		this.y -= 18;

		const boxTop = this.y;
		this.page.drawRectangle({
			x: MARGIN,
			y: boxTop - boxHeight,
			width: CONTENT_WIDTH,
			height: boxHeight,
			color: GREEN_TINT,
		});

		let cursor = boxTop - boxPadding;
		for (const line of messageLines) {
			cursor -= messageSize * 1.45;
			this.page.drawText(line, {
				x: MARGIN + boxPadding,
				y: cursor,
				size: messageSize,
				font: this.regular,
				color: INK,
			});
		}

		cursor -= 10 + buttonHeight;
		const buttonWidth = this.bold.widthOfTextAtSize(buttonLabel, 10) + 28;
		this.page.drawRectangle({
			x: MARGIN + boxPadding,
			y: cursor,
			width: buttonWidth,
			height: buttonHeight,
			color: GREEN,
		});
		this.page.drawText(buttonLabel, {
			x: MARGIN + boxPadding + 14,
			y: cursor + 8.5,
			size: 10,
			font: this.bold,
			color: WHITE,
		});

		const link = this.doc.context.register(
			this.doc.context.obj({
				Type: "Annot",
				Subtype: "Link",
				Rect: [MARGIN + boxPadding, cursor, MARGIN + boxPadding + buttonWidth, cursor + buttonHeight],
				Border: [0, 0, 0],
				A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
			}),
		);
		this.page.node.set(PDFName.of("Annots"), this.doc.context.obj([link]));

		this.page.drawText(sanitize(url), {
			x: MARGIN + boxPadding + buttonWidth + 10,
			y: cursor + 9,
			size: 8.5,
			font: this.regular,
			color: MUTED,
		});
		this.y = cursor - boxPadding;
	}
}

export async function generateBriefPdf(
	stored: StoredBrief,
	bookingUrl: string,
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.setTitle("Candidate Marketing Brief");
	doc.setAuthor("Furum Consulting");
	doc.setCreator("furumconsulting.com");

	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const writer = new BriefPdfWriter(doc, regular, bold);
	const brief = stored.brief;

	writer.brandHeader();
	writer.kicker("Candidate marketing brief");
	if (brief.positioning_headline) {
		writer.text(brief.positioning_headline, {
			font: bold,
			size: 19,
			color: INK,
			lineHeight: 1.25,
			spaceAfter: 6,
		});
	}
	if (brief.candidate_snapshot) {
		writer.text(brief.candidate_snapshot, { size: 11, spaceAfter: 4 });
	}

	if (brief.selling_angles?.length) {
		writer.sectionHeading("Selling angles");
		brief.selling_angles.forEach((angle, index) => {
			writer.label(`${String(index + 1).padStart(2, "0")}. ${sanitize(angle.angle)}`);
			if (angle.why_it_sells) writer.text(angle.why_it_sells, { spaceAfter: 3 });
			if (angle.evidence) writer.text(`Evidence: ${sanitize(angle.evidence)}`, { size: 9.5, spaceAfter: 12 });
		});
	}

	const target = brief.target_company_profile;
	if (target && (target.description || target.company_signals?.length || target.likely_pain)) {
		writer.sectionHeading("Target company profile");
		if (target.description) writer.text(target.description);
		for (const signal of target.company_signals ?? []) writer.bullet(signal);
		if (target.likely_pain) {
			writer.label("The pain this candidate solves");
			writer.text(target.likely_pain);
		}
	}

	if (brief.mpc_email?.subject || brief.mpc_email?.body) {
		writer.sectionHeading("MPC outreach email");
		if (brief.mpc_email.subject) writer.label(`Subject: ${sanitize(brief.mpc_email.subject)}`);
		if (brief.mpc_email.body) writer.text(brief.mpc_email.body);
	}

	if (brief.linkedin_message) {
		writer.sectionHeading("LinkedIn message");
		writer.text(brief.linkedin_message);
	}

	if (brief.objection_preempts?.length) {
		writer.sectionHeading("Objection preempts");
		for (const objection of brief.objection_preempts) {
			writer.label(`"${sanitize(objection.objection)}"`);
			if (objection.counter) writer.text(objection.counter, { spaceAfter: 12 });
		}
	}

	if (brief.followup_sequence?.length) {
		writer.sectionHeading("Follow-up sequence");
		for (const step of brief.followup_sequence) {
			writer.tag(`DAY ${sanitize(step.day)}${step.type ? ` - ${sanitize(step.type).toUpperCase()}` : ""}`);
			writer.text(step.message, { spaceAfter: 10 });
		}
	}

	writer.ctaBox(
		"This is a preview of what we build for staffing agencies at scale: full MPC campaigns, target lists, and outbound infrastructure. Book 15 minutes.",
		"Book 15 Minutes",
		bookingUrl,
	);

	return doc.save();
}
