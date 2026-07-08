# Deploying the CS2 Vault website (Cloudflare Pages, free)

> **Status (Jul 2026): live.** Custom domain **https://cs2vault.app** is attached to the
> Pages project and is the canonical domain (canonical/og:url tags, sitemap.xml and
> robots.txt all use it). The `.pages.dev` URL still works as an alias but nothing
> should link to it. Deploy = `git push` (Git-integrated). The steps below are the
> original setup instructions, kept for reference.

The `website/` folder is a complete static site — no build step.

## First deploy (drag & drop, ~2 minutes)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Upload assets**
2. Project name: `cs2vault` → gives you **https://cs2vault.pages.dev** (pick another
   name if taken — this becomes your Paddle-verified domain)
3. Drag the CONTENTS of the `website/` folder in (index.html at the top level) → Deploy
4. Verify all five URLs load:
   - https://<name>.pages.dev/
   - https://<name>.pages.dev/pricing/
   - https://<name>.pages.dev/terms/
   - https://<name>.pages.dev/privacy/
   - https://<name>.pages.dev/refund/

## Then in Paddle ("Tell us about your website")
- Web domain: `<name>.pages.dev`
- Pricing page: `/pricing/` URL  ·  Terms: `/terms/`  ·  Privacy: `/privacy/`  ·  Refund: `/refund/`
- ⚠ The pricing page shows **$6.99/mo · $49/yr** — create the Paddle price IDs at
  exactly these amounts (LAUNCH-PLAN.md pricing decision) and set the matching
  `priceMonthlyDisplay`/`priceAnnualDisplay` strings in `PRO_CONFIG`.

## Before go-live (not needed for Paddle verification)
- Replace the red `[ACTION REQUIRED]` markers on /terms, /privacy, /refund with your
  legal/trading name + contact email (same decision as legal/*.html in the app —
  keep them consistent).
- Optional: attach a custom domain later (Pages → Custom domains); Paddle lets you
  update the domain.

## Updating the site later
Re-upload via the same drag-and-drop (Pages keeps deploy history), or connect the
GitHub repo with build output directory `website` for auto-deploys on push.
