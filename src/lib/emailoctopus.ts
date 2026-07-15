// EmailOctopus API v2 client (https://emailoctopus.com/api-documentation/v2).
// All calls are best-effort: failures are logged and never block the user flow.

const API_BASE = "https://api.emailoctopus.com";

export interface EmailOctopusEnv {
	EMAILOCTOPUS_API_KEY?: string;
	EMAILOCTOPUS_LIST_ID?: string;
}

interface UpsertContactOptions {
	email: string;
	fields?: Record<string, string>;
	// Upsert endpoint takes tags as an object of tag -> add/remove booleans.
	tags?: Record<string, boolean>;
}

export async function upsertContact(
	env: EmailOctopusEnv,
	{ email, fields, tags }: UpsertContactOptions,
): Promise<void> {
	const apiKey = env.EMAILOCTOPUS_API_KEY;
	const listId = env.EMAILOCTOPUS_LIST_ID;
	if (!apiKey || !listId) {
		console.error("EmailOctopus: EMAILOCTOPUS_API_KEY or EMAILOCTOPUS_LIST_ID not set; skipping contact sync");
		return;
	}

	try {
		const response = await fetch(`${API_BASE}/lists/${listId}/contacts`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email_address: email,
				status: "subscribed",
				...(fields ? { fields } : {}),
				...(tags ? { tags } : {}),
			}),
		});
		if (!response.ok) {
			console.error(
				`EmailOctopus: upsert failed with ${response.status}: ${await response.text()}`,
			);
		}
	} catch (error) {
		console.error("EmailOctopus: upsert request failed", error);
	}
}
