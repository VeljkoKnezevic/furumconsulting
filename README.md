# Furum Consulting

Marketing site for Furum Consulting: done-for-you, pay-on-results client
acquisition for recruiting agencies. Astro, deployed to Cloudflare Workers.

## Commands

```bash
npm run dev
npm run build
npm run preview
```

## Structure

- `src/pages/index.astro` - the funnel: hero, VSL, Cal.com booking (`#book`), ROI calculator, what we cover, offer. This is the only place a visitor can book, so "Book a call" everywhere else links to `/#book`.
- `src/pages/how-it-works.astro` - the four steps, brand protection, deliverables, FAQ.
- `src/pages/about.astro` - story, founders, how we work.
- `src/pages/contact.astro` - email, booking, LinkedIn.
- `src/pages/privacy.astro`, `src/pages/terms.astro` - legal, both `noindex`.
- `src/pages/api/roi.ts` - server endpoint behind the ROI calculator. The only route that is not prerendered.
- `src/lib/roi.ts` - the funnel and pricing assumptions. Server-side only: importing this from a client `<script>` would publish the numbers.
- `src/layouts/Layout.astro` - head, header, footer shell for every page.
- `src/components/BaseHead.astro` - shared metadata, fonts, and schema.
- `src/styles/global.css` - Tailwind import plus Furum tokens (white background, brand green accent) and the shared `.container` / `.section` / `.btn` / `.card` / `.prose` utilities.
- `public/` - logo, founder photos, favicon.
