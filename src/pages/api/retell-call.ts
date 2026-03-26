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
    const webhookResponse = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone: phone.replace(/\s/g, ""),
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error("Webhook error:", webhookResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to submit your details. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook request failed:", err);
    return new Response(
      JSON.stringify({ error: "Service unavailable. Please try again later." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
};
