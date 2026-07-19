# Cashout Planner — Build Brief (Phase 7)

Captured: 19 Jul 2026 strategy session (v3.10.0 baseline). This is the execution spec
for the flagship Pro feature agreed with Rudi. Any future session should be able to
build this cold from this document + STATE.md. Read STATE.md FIRST — it carries all
delivery conventions, code rules, and the current launch-gate status.

**Decision record (19 Jul 2026):**
- Cashout Planner ships FIRST as the flagship Pro feature (before Steam Market history
  import, which is parked post-launch — see "Deferred" at the bottom).
- Free tier stays a broad tracker (no narrowing).
- Build AFTER the Paddle chain is moving (accountant decision → legal names →
  code-signing cert → Paddle verification → Phase 4b checkout wiring), ideally
  BEFORE the Dec–Jan marketing push — this is the demo feature for the launch video.

---

## 1. What it is

A portfolio-wide "what do my skins actually turn into as cash, and what's the tax"
planner. Per-holding direct-vs-routed net cash comparison, portfolio totals, and a
CGT overlay on the planned disposals using the live tax engine. The one line no
competitor can print: **net cash AFTER estimated tax**.

Replaces nothing. The existing single-item Cash Out Calculator (`openCashOutCalc` /
`updateCashOutCalc`) stays untouched — the Planner is a new surface.

## 2. Scope v1

Per-holding row (all currently-priced holdings, qty > 0):
- Current best price via `getBestPrice(h)` (unchanged, phase-blind — see Non-goals)
- **Direct** column: CSFloat sell → −2% CSFloat fee → −withdraw fee (default 2%,
  user-adjustable) → net cash
- **Routed** column: Steam sell → −15% → wallet → bridge skin → CSFloat sell at
  bridge discount (default: bridge sells at 95% of wallet value, i.e. ~5% haircut —
  same default as `updateCashOutCalc`) → −2% → −withdraw → net cash
- Winner highlighted per row; both figures in GBP base (display ccy via `fmtMoney`
  as usual; tax lines via `fmtTaxCcy`)
- Checkbox per row: include/exclude from the plan (default: all included).
  "Partial cashout" is just unticking rows.

Per-holding pricing nuance:
- Items whose `getPricingPlatform(h)` is Steam-only or Steam-first (cases, stickers,
  TUF, agents — see STATE.md Price Priority Logic) may have NO CSFloat price →
  Direct column shows "—" and Routed is the only path (agents: Steam-only, routed
  only). Never invent a CSFloat price.
- Holdings with no live price at all: excluded from the plan, counted in a footer
  note ("N holdings unpriced — refresh prices first").

Portfolio summary (over ticked rows):
- Gross value, total net cash Direct-where-possible-else-Routed ("best mix"),
  total net cash all-Routed, blended recovery %
- **CGT overlay**: estimated tax on the planned disposals under the active
  jurisdiction profile + a **net-after-tax** headline figure
- **Allowance headroom line** (the killer sub-feature): for deductible-allowance
  jurisdictions (UK), "you can realise ~£X more gain this tax year before tax";
  for cliff jurisdictions (DE gains cliff, FI proceeds cliff), a warning line when
  the plan crosses the cliff ("this plan crosses the €1,000 Freigrenze — the FULL
  gain becomes taxable"). Reuse `_applyExemption` / `_exemptionUsed` semantics —
  do NOT reimplement the regimes.

## 3. Non-goals v1 (explicit, do not scope-creep)

- NO phase-aware Doppler pricing — v1 uses `getBestPrice` as-is. Doppler-phase
  holdings (name contains "— Phase"/gem, marketHash phase-less by v3.9.0 design)
  get a small footnote marker on their row ("phase-blind price"). Phase-aware
  CSFloat lookups are the natural v2 follow-up (CSFloat supports phase filters;
  would need a phase-aware key in the pricing path).
- NO plan export (CSV/PDF) — later.
- NO writing to holdings/history — the Planner is entirely hypothetical. It must
  never call `saveData`/`saveHistory` or mutate storage.
- NO per-row manual price overrides in v1.
- NO lot-level selection (whole-holding qty only in v1).

## 4. Architecture

Follow the `su-merge-plan.js` pattern exactly (STATE.md v3.9.0):

**New pure module `src/cashout-plan.js`** — UMD-ish (`window.cashoutPlan` in the
renderer via a script tag before app.js; `require()`-able in Node for the harness).
Pure functions, no DOM, no storage, no fetch:
- `planRow(holding, price, opts)` → `{ direct, routed, best, path }` — all the fee
  math. `opts` = `{ csfloatFeePct, withdrawFeePct, bridgeDiscountPct, steamFeePct }`
  with the defaults above. Handles the no-CSFloat / Steam-only / routed-only cases.
- `planTotals(rows, ticked)` → gross / bestMix / allRouted / recovery %
- `buildHypotheticalDisposals(rows, ticked, today)` → an array shaped like trade
  records (name, type, qty, sellPrice = net-of-platform-fee GBP figure, sellDate =
  today, platform, feePercent, feeAmount, gross, netRealised) suitable for feeding
  the tax rollup. **Platform choice matters for jurisdictions/positions where
  `disposalCounts` differs** (UK profile excludes Steam-wallet sales): the disposal
  is the CSFloat leg in both Direct and Routed paths (cash lands via CSFloat either
  way), so `platform: 'csfloat'` for every planned disposal. Record this rationale
  in code comments — it is a deliberate position, consistent with the app's
  Steam-exclusion stance.

**Tax overlay path (in app.js, not the pure module):** the tricky part. The planner
must estimate tax on (existing in-year real disposals + hypothetical planned
disposals) WITHOUT touching stored history. Approach:
- Extract the core of `calculateCGT()` so it can run on a supplied trades array —
  either a `calculateCGTFor(trades)` refactor with `calculateCGT()` delegating to it
  (preferred; back-compat identical), or a documented simulation call path.
  The cost-basis matcher (`recomputeCGTGains` / `_matchItemTimeline`) already runs
  on event arrays — feed it real history + hypothetical sells appended.
- The number shown = (tax on real+planned) − (tax on real only) = **incremental tax
  of the plan**, plus the absolute total. Show both; the incremental figure is the
  honest "this plan costs you £X in tax".
- Async tax-currency path: reuse `calculateCGTWithTaxCurrency` machinery for non-GBP
  jurisdictions. Planned disposals use today's rate (live `getRate`).
- Cliff regimes: the incremental calc naturally captures cliff-crossing (DE/FI) —
  surface the warning line whenever the planned disposals flip `_applyExemption`
  from 0 to full.

**UI:** new modal `cashoutPlannerModal` in index.html (mirror the steamImport /
suImport modal patterns — injection-safe `createElement`/`textContent` rows, no
innerHTML with user data). Entry point: button on the Analytics tab (near the CGT
summary) + optionally next to the existing Cash Out Calculator link. Fee inputs at
the top (csfloat/withdraw/bridge-discount), live recompute on change.

**Gating:** new `FEATURES` key `cashoutPlanner: { tier: 'pro', label: 'Cashout
Planner', blurb: '…' }` + `syncProBadges` map entry + `proLockPanel('cashoutPlanner')`
in the locked state. Standard `featureUnlocked()` guard on open and on the tax
overlay path.

## 5. Test harness

**New `test-cashout-plan.js`** (repo root, offline, same style as the other three):
- Fee math: direct vs routed for a normal skin, a Steam-only agent (routed-only),
  a case (Steam-first with CSFloat fallback present/absent), zero/one-sided prices
- Bridge discount edges (0%, custom %), withdraw fee 0
- `planTotals` over mixed ticked/unticked sets, empty set
- `buildHypotheticalDisposals` shape: platform csfloat, fee fields consistent with
  netRealised, qty > 1
- Incremental-tax logic sanity via the extracted `calculateCGTFor` (if refactored):
  UK allowance headroom, DE cliff-crossing flip, loss-position plan (Rudi's own
  portfolio is currently a net capital LOSS on full cashout — see STATE.md; a plan
  showing £0 tax with losses is a valid and important case)
- **All four harnesses must pass before delivery:** tax 87/87, schema 66/66,
  su-merge-plan 48/48, plus this one.

## 6. Session plan (2–3 sessions)

1. **Session 1:** `src/cashout-plan.js` pure module + harness + modal skeleton with
   per-row Direct/Routed table and totals (no tax overlay). Fully usable planner
   minus tax.
2. **Session 2:** tax overlay — `calculateCGTFor` extraction (back-compat verified
   by the untouched 87/87 harness), incremental tax + net-after-tax headline +
   allowance-headroom / cliff-warning lines. Tax-currency async path.
3. **Session 3 (optional polish):** row footnotes (phase-blind marker, unpriced
   count), UX pass, launch-video-friendly summary card.

Version bumps: one minor per session (e.g. v3.11.0 / v3.12.0). Standard delivery
(zip, `node -c` on every touched JS file, exact git chain, STATE.md updated at
session close).

## 7. Constraints checklist (from STATE.md — re-read it, but headlines)

- Vanilla JS, no frameworks. `window.cs2vault.fetch` only. No localStorage.
- String-concatenation style where nested backticks would bite.
- Atomic storage pattern N/A here (Planner never writes) — but if ANY write path
  sneaks in, re-read-before-mutate applies.
- `fmtGBP` for tax-locked surfaces, `fmtTaxCcy` for jurisdiction currency,
  `fmtMoney` for display-ccy portfolio figures.
- electron-store stays ^8. protobufjs override stays. Don't touch deps for this.
- Python3 inline scripts with `src.count(old) == 1` assertions for edits in app.js.

## 8. Deferred (post-launch, in order)

1. **Steam Market history import** — real cost basis from Valve's own records via
   `steam-user` `webLogOn()` web-session cookies → `market/myhistory` parse.
   Agreed "interested, after launch gates" (19 Jul 2026). Strengthens the Planner
   (real acquisition data → real gain figures). Biggest moat feature; nobody can
   follow without the GC/auth stack.
2. **Phase-aware CSFloat pricing** — folds into the Planner as v2; serves
   knife-heavy (high-value) portfolios.
3. **Plan export (PDF)** — extend toward the polished "accountant pack" PDF.

## 9. What NOT to build (standing strategy, 19 Jul 2026 review)

More jurisdictions (10 is enough — verify, don't expand), more analytics widgets,
Case Intel enhancements, price-alert background service, QR login, themes. Every
hour there is an hour not spent on the Planner, the deferred list, or distribution
(the actual bottleneck per LAUNCH-PLAN.md).
