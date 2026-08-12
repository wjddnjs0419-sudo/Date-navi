# Date Navi Public Site Design

## Goal

Make the existing public Vercel site suitable for App Store Connect's Marketing URL and Support URL while preserving its invite-link behavior.

## Routes

- `/`: a bilingual marketing page that explains Date Navi's AI-assisted date planning, shared plans, and memories. It provides a Store button when `NEXT_PUBLIC_APP_STORE_URL` is configured and a restrained coming-soon state otherwise.
- `/support`: a bilingual support page with practical FAQs, a direct mail link to `jake051096@gmail.com`, and a clear route back to the marketing page.
- `/invite`: unchanged functionally; it inherits the shared document metadata and remains the entry point for couple-invite links.

## Language and content

Both new routes resolve Korean or English from the visitor's `Accept-Language` header using the site's existing language helper. Korean is the primary editorial language. Copy will accurately describe only the app's current features: nearby-place date recommendations, partner invitations, shared plans, ratings, and memories.

## Visual direction

Use the existing Date Navi palette: warm pink gradients, light blush surfaces, dark charcoal text, rounded cards, and the existing mascot. Build with server-rendered React and small, route-local inline style objects so no client JavaScript or new packages are needed.

## Store handoff

After deployment, App Store Connect URLs are:

- Marketing URL: `https://date-navi.vercel.app/`
- Support URL: `https://date-navi.vercel.app/support`

The App Store URL must be populated in `NEXT_PUBLIC_APP_STORE_URL` after the store listing is created; until then the marketing CTA must not lead to a broken link.

## Verification

Run `npm run typecheck` and `npm run build` from `web/`. Manually confirm the two URLs render in Korean and English by changing the request's language header or browser language.
