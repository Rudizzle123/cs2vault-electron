# CS2 Vault — Launch Plan & Readiness Assessment

Captured: July 2026 strategy session (v3.5.1 baseline). Companion doc: MARKETING.md.
Purpose: lets any future session pick up the go-to-market work without re-deriving it.

---

## The verdict (from the full-product review)

**Product thesis is right. Product is ~85% ready. Distribution is 0% ready.**

Competitive scan (July 2026): SteamLedger, SkinFolio, Steamfolio, Pricempire portfolio,
SkinSpecter — **all free trackers, none do tax.** The tax engine (10 jurisdictions, lot
matching, transaction-date FX, primary-source-verified once on 14 Jun 2026) is a genuine
moat nobody else has. The "Koinly for CS2 skins" framing holds up. Demand signal is real:
skin-tax threads on Reddit/Steam forums are full of confusion and bad advice; dedicated
CS2-tax guide articles now exist and rank.

### Gaps, in order of severity
1. **Zero distribution** — no website, no SEO, no community footprint, no content.
   This is now the bottleneck, not the code. See MARKETING.md.
2. **Onboarding friction** — new users manually enter or CSV-import holdings while free
   web competitors sync a Steam inventory in 30 seconds. Defensible for a tax tool
   (Koinly also requires data import for accuracy), BUT:
   **DECISION: Phase 5 (Steam floating-inventory import) is pulled forward to
   pre-launch.** Empty-app trials don't convert. Build it before soft launch.
3. **Trust hurdle** — paid tax software from an anonymous solo dev with an unsigned
   .exe won't convert. The code-signing cert (CODE-SIGNING.md) is a conversion
   requirement, not polish. Same for a professional-looking website.
4. **Tax buyers don't naturally subscribe monthly** — peak value moment is once a year
   (filing). Pricing must push annual (below).

---

## Pricing (DECIDED with Rudi, July 2026)

Two tiers, annual-first:

| Plan | Price | Role |
|------|-------|------|
| Monthly | **$6.99/mo** | Anchor + low-commitment tax-season entry. Expect Jan-subscribe/Feb-cancel churn — that's fine, annual is the real product |
| Annual | **$49/yr** (≈$4/mo, "save 40%") | The plan everyone should land on |

Rationale:
- Deliberately priced ABOVE SkinKeeper Pro ($4.99/$34.99) — we're selling a defensible
  tax position on a five-figure portfolio, not tracker features. Cheap pricing
  undermines a trust-sensitive product. Nobody holding £40k of skins haggles over £15/yr.
- Per-tax-year report pricing (Koinly style, $49–199/report) was considered and parked —
  the subscription model was Rudi's preference and fits the existing Paddle wiring.
  Revisit only if annual churn after tax season proves brutal.
- Keep the 14-day no-card trial exactly as built.
- Action when setting up Paddle: create the price IDs at $6.99/$49 and set
  `priceMonthlyDisplay: '$6.99 / mo'`, `priceAnnualDisplay: '$49 / yr'` in `PRO_CONFIG`.

---

## Timeline — anchored to UK self-assessment deadline, 31 Jan 2027

Peak search volume + panic-buying season for the biggest single market (UK).
Working backwards:

### Now – Aug 2026: unblock Paddle (longest external dependency)
- [ ] **Build the website** — as a CONTENT site, not a bare landing page (see
      MARKETING.md → SEO). Pages: landing, /pricing ($6.99/$49), /terms, /privacy,
      /refund, plus the jurisdiction tax guides. Host: Cloudflare Pages.
      Open inputs needed from Rudi: domain (real domain vs free .pages.dev to start),
      and legal name vs placeholder (depends on sole-trader-vs-Ltd, below).
- [ ] Submit domain + page URLs to Paddle → seller verification
- [ ] Deploy the licence Worker (worker/DEPLOY.md), fill `PRO_CONFIG`
- [ ] Sandbox end-to-end test (PADDLE-SETUP.md checklist)
- [ ] Buy the code-signing cert (OV pragmatic choice, ~£200–400/yr) → add
      `CSC_LINK`/`CSC_KEY_PASSWORD` secrets

### Sep 2026: product gates
- [ ] **Launch-month tax re-verification of all 10 jurisdictions vs primary government
      pages** — THE correctness gate (STATE.md → LAUNCH GATE). Resolve the deferred
      Canada loss-classification decision here.
- [ ] **Build Phase 5: Steam floating-inventory import** (free tier) — pulled forward
      from "later" to pre-launch. Spec in TRANSITION-PLAN.md Phase 5.
- [ ] Sole trader vs Ltd decision (accountant + Paddle support on entity-change process)
- [ ] Fill `[ACTION REQUIRED]` legal-name markers in legal/privacy.html + legal/terms.html

### Oct – Nov 2026: soft launch
- [ ] Flip Paddle to production, one real self-purchase to verify the live flow
- [ ] First YouTube videos live (MARKETING.md)
- [ ] Begin Reddit/Discord presence (MARKETING.md)

### Dec 2026 – Jan 2027: tax-season push
- [ ] Content cadence up; UK-deadline-focused videos/posts through 31 Jan
- [ ] US filing season (Jan–Apr) content follows immediately after

---

## Open decisions (blocking specific tasks)

1. **Domain** — buy real (e.g. cs2vault.app) vs start free .pages.dev subdomain for
   Paddle verification, attach custom domain later. (Blocks: website build.)
2. **Sole trader vs Ltd** — needs accountant input; Paddle entity-change process to
   confirm. (Blocks: legal pages final text, Paddle production details.)
3. **Canada loss-classification** — deferred from v3.3.3; resolve during the Sep
   re-verification pass (likely: investor = ordinary capital property → drop PUP floor,
   keep deductible losses).

## Standing personal task (separate from product)
- **Rudi's ~£41k full-cashout CGT model** — real taxable gain after acquisition costs,
  spread across multiple years' £3,000 allowances. Doubles as the launch YouTube video
  ("I calculated the REAL tax bill on my £41k CS2 portfolio"). Needs his rough total
  acquisition cost as input.
