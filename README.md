# Furum Consulting

Single-page VSL call funnel for Furum Consulting: headline, video (step 1 of 2),
Cal.com booking (step 2 of 2), what you'll learn on the call, and the offer.

## Commands

```bash
npm run dev
npm run build
npm run preview
```

## Structure

- `src/pages/index.astro` - the entire funnel: hero, video step, booking step, learn section, offer, and CTA.
- `src/pages/candidate-brief.astro` - lead-magnet tool: upload a resume, stream back an MPC candidate marketing brief.
- `src/pages/brief/[id].astro` - server-rendered permalink for a stored brief (90-day expiry, noindex).
- `src/pages/brief/[id].pdf.ts` - downloadable branded PDF of a stored brief, generated with pdf-lib.
- `src/pages/api/generate-brief.ts` - streaming endpoint: validates the upload, rate limits, calls Claude, stores the brief in KV, syncs EmailOctopus.
- `src/lib/` - brief types + system prompt, shared brief renderer, PDF generator, EmailOctopus client.
- `src/components/BaseHead.astro` - shared metadata, fonts, and schema.
- `src/styles/global.css` - Tailwind import plus Furum color and typography tokens (white background, brand green accent).
- `src/styles/brief.css` - brief layout + print stylesheet shared by the live tool and permalinks.
- `public/` - logo and favicon assets.

## Candidate Brief tool setup

Env vars (see `.env.example`): `ANTHROPIC_API_KEY`, `EMAILOCTOPUS_API_KEY`, `EMAILOCTOPUS_LIST_ID`, `PUBLIC_BOOKING_URL`.

- **Local dev**: copy `.env.example` to `.env` (used by `astro dev`) and to `.dev.vars` (used by `wrangler dev` / the platform proxy).
- **Production**: `PUBLIC_BOOKING_URL` is baked in at build time from `.env`; the three secrets are set once with `npx wrangler secret put ANTHROPIC_API_KEY` (and likewise for the two EmailOctopus vars).

Storage is Cloudflare KV (binding `BRIEFS` in `wrangler.json`) - briefs expire after 90 days, and the same namespace backs the 3-per-day rate limit per email/IP.

Manual EmailOctopus setup (one time):

1. On the list, create three custom fields with tags `FirstName` (text), `BriefURL` (text), and `BriefPDF` (text).
2. Create an automation triggered by the `candidate-brief-tool` tag being added. EmailOctopus can't attach files, so the email links to the hosted PDF instead. Suggested shape:
   - Short welcome: "Hi {{FirstName}}, your candidate marketing brief is ready."
   - A "Download your brief (PDF)" button linked to `{{BriefPDF}}` (the web version lives at `{{BriefURL}}`).
   - A closing CTA button to book a call (paste the booking URL directly).

Notes: uploaded resumes are processed in memory and never stored; only the generated (anonymized) brief JSON is kept. The tool degrades gracefully if EmailOctopus is down - generation still completes and the failure is logged.
