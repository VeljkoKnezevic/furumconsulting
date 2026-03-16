export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env as Cloudflare.Env;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { firstName, lastName, email, phone } = body as {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };

  if (!firstName || !lastName || !email || !phone) {
    return new Response(
      JSON.stringify({ error: "All fields are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new Response(
      JSON.stringify({ error: "Invalid email address" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
    return new Response(
      JSON.stringify({ error: "Invalid phone number. Use E.164 format (e.g. +15551234567)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const retellResponse = await fetch(
      "https://api.retellai.com/v2/create-phone-call",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.RETELL_API_KEY}`,
        },
        body: JSON.stringify({
          from_number: env.RETELL_FROM_NUMBER,
          to_number: phone.replace(/\s/g, ""),
          override_agent_id: env.RETELL_AGENT_ID,
          retell_llm_dynamic_variables: {
            FIRST_NAME: firstName,
            LAST_NAME: lastName,
            EMAIL: email,
          },
        }),
      }
    );

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text();
      console.error("Retell API error:", retellResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to initiate call. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await retellResponse.json();
    return new Response(JSON.stringify({ success: true, callId: (data as any).call_id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Retell API request failed:", err);
    return new Response(
      JSON.stringify({ error: "Service unavailable. Please try again later." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
};
