# CS2 Vault — Desktop Portfolio Tracker

Professional CS2 investment portfolio tracker built with Electron. Track holdings across cases, stickers, skins, charms, and armory items with multi-platform pricing from CSFloat and Steam Market.

---

## Architecture

**Stack:** Electron 29 + vanilla JS + Chart.js 4.4 + electron-store

**Key files:**
- `src/app.js` — all application logic (~6,300 lines): pricing, rendering, analytics, health report, multi-jurisdiction tax engine, cost-basis lot matching, trending, charts
- `src/index.html` — UI layout + CSS (~1,250 lines): all tabs, modals, styles
- `src/main.js` — Electron main process (~280 lines): window management, IPC handlers, HTTP proxy with Brotli/gzip decompression, auto-updater
- `src/preload.js` — IPC bridge exposing `window.cs2vault` API to renderer
- `src/storage-bridge.js` — electron-store initialisation and key management
- `package.json` — dependencies, electron-builder config, GitHub publish config

**Data storage:** electron-store (JSON file at `%APPDATA%/cs2vault/`)

**Storage keys:**
- `cs2vault_holdings` — main portfolio holdings array
- `cs2vault_history` — completed trade history
- `cs2vault_snapshots` — monthly portfolio snapshots
- `cs2vault_skins` — play skins (separate from investment holdings)
- `cs2vault_watchlist` — items being watched
- `cs2vault_alerts` — price alert configurations
- `cs2vault_apikey` — CSFloat API key
- `cs2vault_pricempire_key` — Pricempire API key
- `cs2vault_price_log` — per-item price history from refreshes
- `cs2vault_steam_history` — Steam Market historical price data (parsed from listing pages)
- `cs2vault_case_supply` — Case Intel supply snapshots (listing counts over time, keyed by market hash)
- `cs2vault_fx_cache` — historical FX rates (keyed `date|from|to`, cached permanently)
- `cs2vault_display_currency` — display currency setting (default GBP)
- `cs2vault_tax_jurisdiction` — active tax jurisdiction (UK / US / DE / CA / SE / PL / AU / NO / DK / FI; default UK)
- `cs2vault_cost_basis_method` — active cost-basis method (pooling / fifo / specific)
- `cs2vault_licence` — Vault Pro licence key (paste from purchase email)
- `cs2vault_licence_state` — cached licence-validation result (status, checkedAt, plan)
- `cs2vault_trial_start` — ISO date the 14-day no-card Pro trial began

**External APIs used:**
- frankfurter.app (no auth, ECB rates) — FX conversion, live + historical; open.er-api.com as fallback
- CSFloat API (requires API key) — primary pricing for skins/knives/armory/charms
- Steam Market (no auth) — pricing for cases, stickers, and TUF-tagged skins
- Pricempire API (free Trader tier, 30k calls/month) — CSFloat historical prices
- SteamAPIs (no auth) — item images via CDN

**Pricing logic by item type:**
- **Cases** → Steam price first, CSFloat fallback
- **Stickers** → Steam price first, CSFloat fallback
- **TUF-tagged skins** → Steam price first, CSFloat fallback
- **Everything else** (skins, knives, armory, charms) → CSFloat first, Steam fallback

**Note on sticker market hashes:** Stickers are stored with the full `Sticker | Name (Variant)` format matching CSFloat's sticker_index table. The Steam lookup layer handles normalisation automatically (prepends prefix, applies capitalisation fixes, strips variant suffixes on retry).

**Auto-updater:** electron-updater checks GitHub Releases on startup. Downloads silently in background, shows a slim green progress bar at the bottom of the screen, then auto-restarts with a 3-second countdown. No user action needed.

---

## Features (current as of v3.3.0)

### Vault Pro — Payments, Licensing & Trial (v3.3.0 — Phase 4b)
- **Paddle checkout** (merchant of record — handles global VAT/sales tax for a solo dev). Settings → Vault Pro shows Monthly/Annual buttons that open Paddle's hosted checkout in the browser. The price shown is a display string in `PRO_CONFIG`; the real charge is set on the Paddle price IDs (no amount is hardcoded in the app)
- **Paddle-native licence validation** — after purchase, Paddle emails a licence key; paste it into Settings → Activate. The app validates it against a Cloudflare Worker and caches the result. **14-day offline grace** keeps Pro unlocked if validation can't reach the network, so a flaky connection never locks out a paying user
- **14-day no-card trial** — starts automatically on a fresh install; the tier badge shows `PRO · TRIAL` with days remaining. Free tier stays fully usable after it ends
- **Dev/preview override** (Settings) — a local switch that always unlocks Pro for evaluation/support; it takes precedence over licence state
- **Single config block** (`PRO_CONFIG` in `src/app.js`) — Paddle token, price IDs, Worker URL, display prices, trial/grace knobs. Until it's filled in, checkout shows a "not configured" notice and the override/trial still work. Setup steps: **PADDLE-SETUP.md**, **worker/DEPLOY.md**, **CODE-SIGNING.md**
- **Cloudflare Worker** (`worker/licence-worker.js`) — separate from the app; receives Paddle webhooks (signature-verified) and answers the "did they pay?" check from a KV store. Free-tier hosting
- **Code signing** — wired into GitHub Actions; signs the installer when `CSC_LINK`/`CSC_KEY_PASSWORD` secrets are present, builds unsigned otherwise
- **Privacy Policy + Terms of Service** — bundled pages (Settings → About & Legal), with the "estimates, not tax advice" disclaimer
- **Licence is preserved on Clear All Data** (so a data-clear never voids a purchase) and included in the JSON backup
- ⚠ **Before the first paid sale:** re-verify all tax figures against primary government sources, complete the Paddle/Worker/cert setup, and fill the legal-name placeholders in the legal pages. See STATE.md → LAUNCH GATE

### Multi-Jurisdiction Tax Engine (v3.0.0 — Vault Pro Phase 3; expanded to 10 jurisdictions in v3.2.0)
- **Pluggable tax profiles** — Settings → Tax & Cost Basis selects your jurisdiction, which sets the full tax profile: tax-year boundary, allowance/exemption, rates, cost-basis method, holding-period rules, and the currency your tax figures are reported in. **Ten profiles** (UK is free; the rest are Vault Pro):
  - **United Kingdom** — Capital Gains Tax in GBP, 6 Apr–5 Apr tax year, £3,000 annual exempt amount, 18%/24% bands, Section 104 pooling (with same-day + 30-day rules). Steam Wallet sales excluded as the app's chosen position, with the informational "incl. Steam" stricter-reading view
  - **United States** — USD, calendar tax year, no annual exemption, FIFO/specific. Each disposal split into **short-term** (held ≤12 months, taxed as ordinary income) vs **long-term** (>12 months, 0/15/20% bands). Disclosed edge cases (not auto-calculated): knives/rare items may be "collectibles" taxed up to 28%; 1099-K marketplace reporting is on **gross** proceeds, so your cost-basis records are your defence
  - **Germany** — EUR, calendar year, FIFO. Under §23 EStG a private sale is **tax-free if held over one year**; only sub-12-month disposals are taxable. The €1,000 Freigrenze is a **cliff, not an allowance** — total in-year private-sale gains below €1,000 are fully tax-free, but at €1,000+ the **entire** gain is taxable from the first euro. (The Freigrenze pools ALL your private sales for the year — crypto, gold, etc. — so the skins-only view is partial)
  - **Canada** — CAD, calendar year, ACB pooling, **50% inclusion rate** (only half a net capital gain is taxable). The **$1,000 personal-use-property floor** is applied per disposal (both cost and proceeds deemed ≥ CAD $1,000), so cheap-bought items don't show fake gains. (LPP loss ring-fencing is disclosed but not modelled — all gains/losses are pooled)
  - **Sweden** — SEK, calendar year, **flat 30%** on capital gains, no holding-period rule (pooling / genomsnittsmetoden). Simplified loss deductibility is disclosed
  - **Poland** — PLN, calendar year, **flat 19%** (the personal tax-free amount does not apply to capital gains), no holding-period rule. The 5-year same-source loss carry-forward is not modelled
  - **Australia** — AUD, **1 Jul–30 Jun tax year**, marginal rate (indicative), with the **50% CGT discount applied per disposal for assets held more than 12 months** (short-held or unknown-acquisition-date disposals are taxed on the full gain and flagged). The $10,000 personal-use-asset exemption is NOT applied; the 2027 indexation reform is not yet modelled (current pre-July-2027 rules)
  - **Norway** — NOK, calendar year, **flat 22%**. Skins are treated as a general (crypto-like) asset — the 1.72 share/dividend uplift (effective 37.84%) does NOT apply. FIFO
  - **Denmark** — DKK, calendar year. Speculative personal-asset gains are taxed as **personal income at your marginal rate (up to ~52%)**; the app shows an indicative ~42% and an emphatic disclaimer that your real rate depends on your bracket. Strict same-asset loss rules disclosed (not modelled). FIFO
  - **Finland** — EUR, calendar year, **two-tier 30% (up to €30,000 capital income) / 34% (above)**. The €1,000 small-sales exemption (really on total annual proceeds) is approximated as a €1,000 gains cliff; the deemed-acquisition-cost option is not modelled. FIFO
- **Tax-currency reporting** — non-UK profiles render every tax figure in the local tax currency (USD/EUR/CAD/SEK/PLN/AUD/NOK/DKK), converted from the GBP base at each transaction's own FX rate (sell legs at the sell-date rate, cost basis at the acquisition-date rate) — never a single blended or year-end rate, so the real FX gain/loss is preserved. UK stays GBP throughout
- **Holding-period aware** — disposals are classified by how long the matched lots were held (US long/short, Germany 1-year exemption), derived from the Phase 2 lot acquisition dates. Trades imported before lot tracking (no acquisition date) degrade to the conservative reading (US short-term / Germany taxable) and are clearly flagged
- **Per-jurisdiction CGT report export** — correct tax-year label, allowance/exemption/inclusion lines, rate bands, and holding-period columns (acquisition date, holding, classification) where relevant. Per-profile disclaimer
- **Gating + payments** — the tax engine is gated behind `isPro()` (free-vs-Pro framework, Phase 4a / v3.1.0). As of **v3.3.0 (Phase 4b)** real payments are wired in: Paddle checkout, Paddle-native licence validation with 14-day offline grace, a 14-day no-card trial, a Cloudflare Worker webhook receiver, and CI code-signing. The payment layer is inert until `PRO_CONFIG` is filled in (Paddle account + deployed Worker), so the app runs free/trial/override out of the box. See the Vault Pro section above

### Configurable Cost Basis (v2.10.0 — Vault Pro Phase 2)
- **Lot-aware data model** — every holding tracks individual buy lots (qty, unit cost, date, currency, FX rate); disposals consume lots per the active method
- **Cost-basis methods** — **Average cost / Section 104 pooling** (UK, with same-day + 30-day bed-and-breakfast matching; Canada ACB), **FIFO** (first-in first-out; US default, Germany), **Specific identification** (US optional). Method is a per-jurisdiction setting; UK is locked to pooling
- Fixes the implicit specific-identification behaviour of the old row-based selling. Legacy trades without buy lots are grandfathered to their stored cost

### Multi-Currency (v2.9.0 — Vault Pro Phase 1)
- **Display currency** — Settings → Display Currency (12 ECB currencies). Portfolio values, P&L, analytics, health report, and charts render in the chosen currency, converted from the GBP base at the live ECB rate
- **Multi-currency entry** — buy, sell, and top-up amounts can be entered in any supported currency via a select next to the price field; converted to GBP at the rate **on the transaction date** (frankfurter.app historical rates, cached permanently) and stored with full FX provenance (`origCurrency`, `origAmount`, `fxRate`)
- **GBP remains the internal base** — all stored amounts are GBP; tax surfaces (CGT summary, trade history, cash-out calculator, all CSV exports) are always shown in £ GBP regardless of display currency
- One-time launch migration backfills GBP provenance on all existing records (lossless)

### Branding (v2.8.1)
- New logo: two-layer green diamond + gold price line, transparent background (clean taskbar icon, no black square)
- `assets/`: `header-logo.png` (512, header + Settings tab), `icon.png` (256, window/notifications), `icon.ico` (multi-res 16–256; 16–48px use a simplified single-diamond variant for legibility)
- Source SVG masters (`full.svg`, `small.svg`) and a full web/Steam branding pack (transparent PNGs 16–1024, Steam avatar 184, favicon, apple-touch-icon, og-square) live in the separately delivered `cs2vault-branding.zip` — re-render any size from the SVGs

### Holdings Tab
- **Allocation strip (v2.5.0)** — stacked bar + legend under the stat cards showing portfolio value split across Cases / Stickers / TUF / Skins / Knives / Armory / Other; click a segment to filter the table, click again to clear
- Add/edit/delete holdings with name, type, qty, buy price, date, market hash, notes
- **Steam Market autocomplete (v2.6.0)** — type 3+ letters in the Item Name or Market Hash field of any add/edit modal (holdings + play skins) and a dropdown of real Steam market items appears (thumbnail + price); selecting one auto-fills the name, exact market hash, and inferred type. Debounced + session-cached; manual entry still works as before
- **TUF (Trade-up Filler) tagging** — checkbox in edit modal, green TUF badge on row, filterable via dropdown
- Dual-platform price display: CSFloat and Steam side by side (no toggle needed)
- P&L calculation uses correct platform per item type (see pricing logic above)
- Target price system with progress bar
- Sparkline charts (inline SVG) showing 30-day price trend per item
- Click sparkline → full price history modal with Chart.js chart (7d/30d/90d/All)
- Price history charts show gradient fill, volume bars (from Steam data), buy price reference line
- Heatmap view for visual price changes
- CSV export (with per-platform prices, TUF flag) and CSV import
- Bulk sell modal
- **Bulk edit/delete (v2.8.0)** — checkbox per row + select-all (visible rows); action bar shows selection count/units/£ invested with Bulk Edit (Type / TUF / Category — untouched fields stay as-is), Delete Selected (does not record sales), and Clear. All writes atomic against concurrent refreshes

### Price Refreshing (v2.7.0)
- **Two-lane engine** — bulk refreshes run CSFloat (6 parallel requests) and Steam (sequential, adaptive 1.5–6s delay) as independent lanes; each row updates the moment both lanes finish for that item. Roughly halves full-refresh time vs the old single sequential chain
- **Staleness skip** — items refreshed within the last 30 minutes are skipped (toast shows the count); if everything is fresh, clicking refresh forces a full pass
- **Background auto-refresh** — Settings → Background Auto-Refresh (Off / 1h / 3h default / 6h). Silently refreshes stale holdings + play skin prices on the interval and once ~15s after launch, so prices are already warm when you open the app
- Single-item ↻ buttons always fetch immediately (no staleness skip)

### Sell Modal
- Platform quick-select buttons: CSFloat (2%), Steam (15%), Custom
- Two input modes: per-unit sell price OR total received after fees
- Works for both holdings and play skins

> **Modal behaviour (v2.4.7+):** all input modals (add/edit/sell/top-up/manual price/etc.) stay open on backdrop click — close only via ✕, Cancel, or Save, so a stray click can't discard input. The price-history chart popup is the exception and still closes on backdrop click.

### Trade History Tab
- All completed trades with buy/sell/fee/realised/net profit — each disposal stores platform, fee %, fee amount (£), gross (£), and net realised (£ = gross − fees)
- Colour-coded platform badges (CSFloat / Steam / Custom) — platform is resolved via `tradePlatform()`; records lacking an explicit platform are inferred from the fee rate (15% = Steam, 2% = CSFloat) and backfilled on launch, so a Steam sale never mislabels as CSFloat or wrongly counts toward CGT
- Per-sale tax badge on every row: green `✓ CGT` / `✓ taxable` (counts as a disposal) or grey `✕ not CGT` (Steam Wallet sale, excluded under the UK profile). The badge follows the active jurisdiction's disposal definition
- CGT Summary: tax year, realised gains, losses, net gain, allowance/exemption usage, estimated tax — rendered in the active jurisdiction's tax currency, with US short/long-term net chips, Germany exempt-disposal count, and an unknown-acquisition-date flag where relevant
- **Dual allowance view (UK)** — allowance/tax shown two ways when the year has Steam sales: the live **CSFloat-only** position plus a dimmed **incl. Steam** hypothetical (the stricter reading where a Steam-to-Steam disposal also counts). Informational only; the app's default UK position is unchanged
- Cash Out Calculator (Steam sell → bridge skin → CSFloat sell → withdraw → cash in hand) — CGT estimate uses the active profile's allowance and inclusion rate
- Per-jurisdiction CGT tax report export (CSV with full disposal schedule; tax-currency figures, allowance/exemption/inclusion lines, and acquisition-date/holding/classification columns for US + Germany)
- Bulk-sold cases/stickers record as a single grouped row (qty × unit price, auto-calculated)
- Delete button (✕) on each trade row — removes a single history record (atomic; does not restore the item to holdings/play skins)
- Search/filter trades

### Analytics Tab
*(v2.5.0: now also contains the Portfolio History and Portfolio Health sections — previously separate tabs)*
- Trending: Top 5 Gainers/Losers with Steam item images, 7d/30d/90d toggle, category filter
- Portfolio Allocation doughnut chart by item type
- By Type breakdown with invested/value/P&L
- Top/Bottom 5 performers
- Monthly P&L summary

### Portfolio History (section of Analytics)
- Monthly portfolio snapshots with chart
- Benchmark comparison (indexed to 100)
- Auto-snapshot on the 3rd of each month

### Play Skins Tab
- Separate tracking for skins you use (not investment holdings)
- **Add Play Skin** — add skins directly from the tab (name, type [skin/knife/agent], qty, buy price, market hash)
- **Edit / Delete** per row — edit any field, or remove a skin (delete does not record a sale)
- CSFloat + Steam pricing
- Sell functionality (records to trade history) — sell + price-refresh writes are atomic (re-read storage, mutate, write back), so a sale persists even if a refresh is running
- Add/edit/delete writes are likewise atomic against concurrent refreshes

### Portfolio Health (section of Analytics)
- Overall health score (0-100) with letter grade and ring visualisation
- Concentration risk, diversification score, signals & recommendations
- Data freshness checker
- Performance outliers (>+20% and <-20%)

### Watchlist Tab (incl. Price Alerts)
- Watchlist — track items you don't own yet; prices fetch with the main refresh
- Price Alerts section (merged from the old Alerts tab in v2.5.0) — target price + direction (above/below), native Windows notifications when triggered

### Case Intel Tab
- Case investment scoring built **entirely on measured data** (v2.5.0): Supply Trend 35% (real listing-count delta vs previous snapshot), Discontinuation Age 30% (factual dates), Price vs 90D Low 20% (from the app's own price log), 30D Momentum 15%
- Components without enough history yet score a neutral 50, render dimmed, and each card shows a "N/4 signals live" confidence chip — accuracy builds automatically with regular use
- **Real supply tracking** — fetches live Steam listing counts on each analysis run, saves snapshots to `cs2vault_case_supply`. On subsequent runs shows actual supply delta vs previous snapshot (e.g. ↓ 3.2K (-4%)) — green = shrinking supply, red = growing
- **Price momentum columns** — 7D and 30D % price change pulled from existing price log, shown on both cards and table
- Neutral grades only (S/A–F) plus a **drop-pool status badge (v2.8.0)** on every card and table row: ⚡ ACTIVE DROP / RARE DROP / ARMORY · STILL SOLD / DISCONTINUED — hardcoded per case, verified June 2026 (Valve removed the entire rare drop pool 17 Dec 2025, so legacy cases no longer drop at all; Armory cases like Fever are still sold in-game). Disc. Age scoring is pool-aware — no buy/sell signal labels
- Snapshots pruned after 6 months on launch
- Table columns: Score, Grade, Drop Pool, Steam Listings, Supply Trend, 7D, 30D, Months Discontinued, Current Price, vs 90D Low, Holdings

### Settings Tab
- **Tax & Cost Basis** — tax jurisdiction selector (UK / US / Germany / Canada / Sweden / Poland / Australia / Norway / Denmark / Finland) sets the full tax profile and reporting currency; cost-basis method selector (pooling / FIFO / specific — UK locked to pooling). Mid-year change warnings when disposals already exist in the current tax year
- Display currency (12 ECB currencies) — portfolio values render in your chosen currency; tax surfaces follow the jurisdiction's tax currency
- CSFloat API key management with test connection
- Pricempire API key management with test connection
- Background Auto-Refresh schedule (Off / 1h / 3h / 6h)
- Data management (backup/restore/clear) — includes the FX cache, display currency, tax jurisdiction, and cost-basis method keys

### Infrastructure
- Auto-updater via GitHub Releases (electron-updater) — silent download, auto-restart
- GitHub Actions CI/CD: push a version tag → builds Windows NSIS installer automatically
- Steam historical price data fetcher (parses embedded data from market listing pages; sends browser-like headers, v2.7.2)
- HTTP proxy follows redirects with cookie carry (v2.7.1) — required for Steam community pages
- Resilient tab switching + global error toasts (v2.7.1) — a render exception can never blank a tab; uncaught errors surface on screen

---

## Setup for Development

### Requirements
- Node.js 20+ (LTS)
- Git
- Windows 10/11

### Install & Run
```bash
git clone https://github.com/Rudizzle123/cs2vault-electron.git
cd cs2vault-electron
npm install
npm start
```

Or use `START.bat` / `START-DEV.bat` (opens with DevTools).

### Build Installer
```bash
npm run build      # Local build (dist/ folder)
npm run release    # Build + publish to GitHub Releases
```

---

## Release Workflow

```bash
git add . && git commit -m "v2.x.x - Description" && git tag v2.x.x && git push origin main --tags
```

1. GitHub Actions builds the .exe installer (~2 minutes)
2. Go to GitHub Releases, edit the draft, publish as latest
3. Installed apps auto-detect the update on next launch and install silently

---

## File Delivery Process (receiving updates from Claude)

**Step 1 — Download** `cs2vault-update.zip` into:
`C:\Users\44748\OneDrive\Documents\CS2 Vault\cs2vault-electron\`

**Step 2 — Extract**
```bash
unzip -o ~/OneDrive/Documents/"CS2 Vault"/cs2vault-update.zip -d ~/OneDrive/Documents/"CS2 Vault"/cs2vault-electron/
```

**Step 3 — Commit, tag, push**

Claude provides the exact command at the end of every delivery:
```bash
git add . && git commit -m "v2.x.x - Description" && git tag v2.x.x && git push origin main --tags
```

**⚠️ Tag conflict:** Tell Claude — the next patch version will be repackaged.

**⚠️ Never extract via Windows File Explorer** — use `unzip -o` in Git Bash only.

---

## Data Location

All user data is stored locally:
- **Windows:** `C:\Users\[you]\AppData\Roaming\cs2vault\`
- Data persists across app updates (stored separately from install)

---

## API Keys

| Service | Where to get it | Cost | Used for |
|---------|----------------|------|----------|
| CSFloat | csfloat.com → Profile → API | Free | Live pricing for skins, knives, armory, charms |
| Pricempire | pricempire.com → Subscribe → Trader | Free (30k calls/month) | CSFloat historical prices |
| Steam | No key needed | Free | Case + sticker pricing, historical data |
