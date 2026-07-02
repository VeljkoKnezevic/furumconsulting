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
- `src/components/BaseHead.astro` - shared metadata, fonts, and schema.
- `src/styles/global.css` - Tailwind import plus Furum color and typography tokens (white background, brand green accent).
- `public/` - logo and favicon assets.
