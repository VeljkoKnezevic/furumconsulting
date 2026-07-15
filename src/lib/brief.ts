// Shared types and helpers for the Candidate Marketing Brief tool.

export interface SellingAngle {
	angle: string;
	why_it_sells: string;
	evidence: string;
}

export interface TargetCompanyProfile {
	description: string;
	company_signals: string[];
	likely_pain: string;
}

export interface MpcEmail {
	subject: string;
	body: string;
}

export interface ObjectionPreempt {
	objection: string;
	counter: string;
}

export interface FollowupStep {
	day: number;
	type: string;
	message: string;
}

export interface CandidateBrief {
	error?: string;
	positioning_headline?: string;
	candidate_snapshot?: string;
	selling_angles?: SellingAngle[];
	target_company_profile?: TargetCompanyProfile;
	mpc_email?: MpcEmail;
	linkedin_message?: string;
	objection_preempts?: ObjectionPreempt[];
	followup_sequence?: FollowupStep[];
}

export interface StoredBrief {
	id: string;
	firstName: string;
	email: string;
	brief: CandidateBrief;
	createdAt: string;
}

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const BRIEF_TTL_SECONDS = 90 * 24 * 60 * 60;
export const RATE_LIMIT_PER_DAY = 3;
export const MIN_FORM_SECONDS = 3;

// Common disposable email providers; obvious throwaways only, not exhaustive.
const DISPOSABLE_DOMAINS = new Set([
	"mailinator.com",
	"guerrillamail.com",
	"guerrillamail.net",
	"sharklasers.com",
	"10minutemail.com",
	"10minutemail.net",
	"temp-mail.org",
	"tempmail.com",
	"tempmail.dev",
	"throwawaymail.com",
	"yopmail.com",
	"getnada.com",
	"maildrop.cc",
	"dispostable.com",
	"fakeinbox.com",
	"trashmail.com",
	"mytemp.email",
	"mail.tm",
	"emailondeck.com",
	"mohmal.com",
]);

export function isValidEmail(email: string): boolean {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
	const domain = email.split("@")[1].toLowerCase();
	return !DISPOSABLE_DOMAINS.has(domain);
}

export function isPdf(bytes: Uint8Array, file: File): boolean {
	if (bytes.length < 5) return false;
	// %PDF- magic bytes
	const magic = String.fromCharCode(...bytes.subarray(0, 5));
	if (magic !== "%PDF-") return false;
	return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

// The model is instructed to return bare JSON, but strip fences defensively.
export function parseBriefJson(text: string): CandidateBrief | null {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end <= start) return null;
	try {
		return JSON.parse(text.slice(start, end + 1)) as CandidateBrief;
	} catch {
		return null;
	}
}

export async function checkAndIncrementRateLimit(
	kv: KVNamespace,
	key: string,
): Promise<boolean> {
	const raw = await kv.get(key);
	const count = raw ? Number.parseInt(raw, 10) : 0;
	if (count >= RATE_LIMIT_PER_DAY) return false;
	await kv.put(key, String(count + 1), { expirationTtl: 86400 });
	return true;
}

export const BRIEF_SYSTEM_PROMPT = `You are a senior recruitment BD strategist at a top-performing staffing agency. You are given a candidate's resume. Your job is to produce a "Candidate Marketing Brief": a practical, specific plan for marketing this candidate to prospective client companies as an MPC (most placeable candidate) campaign.

Rules:
- Fully anonymize the candidate. Never output their name, email, phone, address, or current employer's name. Refer to employers by category (e.g., "a top-20 US bank", "a Series B logistics SaaS company").
- Be specific and confident. No hedging, no generic filler like "strong communication skills". Every claim must be grounded in something actually on the resume.
- Write like a sharp recruiter, not a marketer. Short sentences. Concrete details.
- If the resume is low-quality, sparse, or not a resume at all, still do your best with what's there; if it's clearly not a resume, return the JSON with an "error" field explaining the file doesn't appear to be a resume.

Return ONLY valid JSON (no markdown fences, no preamble) with this exact schema:

{
  "positioning_headline": "One punchy sentence positioning this candidate, e.g. 'Senior .NET engineer with rare legacy-migration + cloud-native depth in fintech'",
  "candidate_snapshot": "2-3 sentence anonymized summary: seniority, domain, years, standout combination",
  "selling_angles": [
    {
      "angle": "Short name of the angle",
      "why_it_sells": "Why this is marketable right now — scarcity, in-demand combination, timing",
      "evidence": "The specific resume detail that backs it"
    }
    // 3 to 4 angles, ranked strongest first
  ],
  "target_company_profile": {
    "description": "What kind of companies should receive this candidate and why they'd care",
    "company_signals": ["3-5 concrete signals to look for, e.g. 'hiring multiple backend roles', 'recently raised Series B', 'posted this role 45+ days ago'"],
    "likely_pain": "The hiring pain these companies have that this candidate solves"
  },
  "mpc_email": {
    "subject": "Subject line, under 8 words, specific not clickbait",
    "body": "Ready-to-send MPC email, 90-130 words, anonymized candidate, references the selling angles, ends with a low-friction CTA like offering to share the full profile. No placeholders except {FirstName} for the recipient."
  },
  "linkedin_message": "Shorter LinkedIn DM variant, under 60 words, same angle, conversational",
  "objection_preempts": [
    {
      "objection": "Likely client pushback about this profile",
      "counter": "The recruiter's best response"
    }
    // 2 to 3
  ],
  "followup_sequence": [
    {"day": 3, "type": "bump", "message": "Short bump email body, 30-50 words"},
    {"day": 7, "type": "value-add", "message": "Second follow-up adding a new angle or market insight, 50-80 words"},
    {"day": 12, "type": "breakup", "message": "Polite breakup email, 30-50 words"}
  ]
}`;
