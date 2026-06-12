# CS2 Vault — Desktop Portfolio Tracker

Professional CS2 investment portfolio tracker built with Electron. Track holdings across cases, stickers, skins, charms, and armory items with multi-platform pricing from CSFloat and Steam Market.

---

## Architecture

**Stack:** Electron 29 + vanilla JS + Chart.js 4.4 + electron-store

**Key files:**
- `src/app.js` — all application logic (~4,550 lines): pricing, rendering, analytics, health report, CGT tracker, trending, charts
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

**External APIs used:**
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

## Features (current as of v2.6.0)

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

### Sell Modal
- Platform quick-select buttons: CSFloat (2%), Steam (15%), Custom
- Two input modes: per-unit sell price OR total received after fees
- Works for both holdings and play skins

> **Modal behaviour (v2.4.7+):** all input modals (add/edit/sell/top-up/manual price/etc.) stay open on backdrop click — close only via ✕, Cancel, or Save, so a stray click can't discard input. The price-history chart popup is the exception and still closes on backdrop click.

### Trade History Tab
- All completed trades with buy/sell/fee/realised/net profit — each disposal stores platform, fee %, fee amount (£), gross (£), and net realised (£ = gross − fees)
- Colour-coded platform badges (CSFloat / Steam / Custom) — platform is resolved via `tradePlatform()`; records lacking an explicit platform are inferred from the fee rate (15% = Steam, 2% = CSFloat) and backfilled on launch, so a Steam sale never mislabels as CSFloat or wrongly counts toward CGT
- Per-sale CGT badge on every row: green `✓ CGT` (counts) or grey `✕ not CGT` (Steam Wallet sale, excluded)
- CGT Summary: tax year, realised gains, losses, net gain, allowance usage bar, estimated tax
- **Dual allowance view** — allowance/tax shown two ways when the year has Steam sales: the live **CSFloat-only** position plus a dimmed **incl. Steam** hypothetical (the stricter reading where a Steam-to-Steam disposal also counts). Informational only; the app's default CGT position is unchanged
- Cash Out Calculator (Steam sell → bridge skin → CSFloat sell → withdraw → cash in hand)
- CGT tax report export (CSV with full disposal schedule incl. Platform and Net Realised columns)
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
- Neutral grades only (S/A–F) plus a factual Active/Discontinued status chip — no buy/sell signal labels
- Snapshots pruned after 6 months on launch
- Table columns: Score, Grade, Steam Listings, Supply Trend, 7D, 30D, Months Discontinued, Current Price, vs 90D Low, Holdings

### Settings Tab
- CSFloat API key management with test connection
- Pricempire API key management with test connection
- Data management (backup/restore/clear)

### Infrastructure
- Auto-updater via GitHub Releases (electron-updater) — silent download, auto-restart
- GitHub Actions CI/CD: push a version tag → builds Windows NSIS installer automatically
- Steam historical price data fetcher (parses embedded data from market listing pages)

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
