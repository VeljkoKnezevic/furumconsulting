import type { APIRoute } from "astro";
import { calculateRoi } from "../../lib/roi";

// Rendered on request so the pricing model in src/lib/roi.ts stays on the server.
export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const revenue = Number(url.searchParams.get("revenue"));
  const close = Number(url.searchParams.get("close"));

  if (!Number.isFinite(revenue) || !Number.isFinite(close)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(calculateRoi(revenue, close)), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=86400",
    },
  });
};
