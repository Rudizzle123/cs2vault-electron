# CS2 Vault — Project State

Last updated: June 2026 | Current version: v2.5.0

---

## What's Been Built (Complete)

### Phase 1 — Price History + Sparklines ✅
- Price log records CSFloat/Steam prices on every refresh
- Inline SVG sparklines per item (30-day trend, green=up red=down)
- Click sparkline → full Chart.js modal with 7d/30d/90d/All toggles
- Chart shows gradient fill, volume bars, buy price reference line
- 90-day auto-pruning of local price log on app launch

### Phase 2 — Auto-Updater ✅
- electron-updater checks GitHub Releases on startup
- Silent background download — slim green progress bar slides up from bottom of screen
- Shows download percentage, then "Restarting in 3s" countdown, then auto-installs
- No user action required — fully hands-free
- GitHub Actions workflow: push a version tag → auto-builds .exe → publishes draft release
- NSIS installer with desktop/start menu shortcuts (one-click silent install as of v2.4.6 — no dialogs)

### Phase 3 — Arbitrage Detection (removed v2.3.9)
- Removed — tab was unused

### Phase 4 — CSV Import/Export ✅
- Export: all holdings with per-platform prices, TUF flag to CSV
- Import: parse CSV with column auto-detection, duplicate checking, preview
- Trade history export
- File dialogs via native OS

### Phase 5 — Portfolio Health Report ✅
- Health score 0-100 with letter grade (A-F) and animated ring
- Concentration risk, diversification score (Herfindahl index)
- Signals: concentration warnings, profit-taking suggestions, stale data alerts
- Data freshness checker, performance outliers

### v2.3.0 — Platform Cleanup + TUF Tagging ✅
- Skinport removed entirely
- Compare mode removed — always shows CSFloat + Steam columns side by side
- Sticker pricing — stickers use Steam price for P&L
- TUF tagging — checkbox in add/edit modal; green badge; filterable
- Sell modal — CSFloat/Steam/Custom only

### v2.3.1–v2.3.4 — Steam Sticker Price Fixes ✅
- Full retry logic for all sticker variants (Holo, Glitter, Foil, Lenticular)
- Capitalisation fixes (From the Deep → From The Deep, Axia → AXIA)
- All sticker types now fetch Steam prices correctly

### v2.3.5–v2.3.7 — Play Skins Fixes ✅
- Fixed sell not removing items from Play Skins tab
- Fixed agent pricing (Steam only, correct market hash)
- Fixed Glock-18 Axia capitalisation for Steam lookup

### v2.3.9 — Cleanup ✅
- Silent auto-updater with slim bottom progress bar and 3-second auto-restart
- Arbitrage tab removed entirely
- Legacy browser import removed from Settings

### v2.4.0 — Case Intel: Real Supply Tracking + Price Momentum ✅
- **Real supply tracking** — replaces fake peakSupply depletion % with real data:
  - Each analysis run fetches live Steam listing count per case via `search/render` endpoint
  - Snapshots saved to `cs2vault_case_supply` (keyed by market hash, array of `{ ts, count }`)
  - Subsequent runs show actual delta vs previous snapshot: ↓ 3.2K (-4%) in green (shrinking) or ↑ 1.1K (+2%) in red (growing)
  - First run saves baseline — "first snapshot" shown until a second run is done
  - Snapshots pruned after 6 months on launch alongside price log pruning
- **Price momentum columns** — 7D and 30D % price change per case:
  - Pulled from existing `cs2vault_price_log` — zero new API calls
  - Shows +3.2% / -1.4% coloured green/red on both cards and table
  - Shows — until enough price log history exists (needs 2+ data points in window)
- **Table updated**: Depletion column removed, replaced with Supply Trend, 7D, 30D
- **Cards updated**: metrics row now shows Supply (with trend), 7D, 30D, Disc. (removed vs ATL)

### v2.4.1 — Richer Disposal Data ✅
- **Per-disposal data model expanded** — every sale (holdings + play skins) now stores four extra fields on the trade record:
  - `platform` ('csfloat'/'steam'/'custom') — already existed, now consistently captured
  - `feeAmount` (£) — actual fee paid, not just the %
  - `gross` (£) — gross sale price (sellPrice × qty)
  - `netRealised` (£) — what was actually pocketed (gross − fees)
- **Trade history** now shows a new "Realised" column (net of fees) alongside Net Profit
- **CGT report export** gained Platform and Net Realised columns in the disposal schedule
- **Trade-history CSV export** gained Platform, Fee Amount, and Net Realised columns
- **Backwards compatible** — old trades without the new fields fall back to recomputing from `sellPrice × qty`, so existing history renders and reports correctly
- **Bulk grouping** — confirmed the existing sell modal already takes qty + per-unit price and records one grouped row with auto-calculated maths (e.g. 50 cases @ £2.50 = one row: gross £125, fee £2.50, realised £122.50). No structural change needed
- Steam-Wallet-excluded-from-CGT logic left untouched; new data is captured for all platforms regardless, so it's available if that treatment is ever revisited

### v2.4.2 — Dual CGT View + Per-Sale CGT Badges ✅
- **Dual allowance display** — the CGT Summary "Allowance Used" card now shows two bars when the tax year contains any Steam sales:
  - Top bar (full colour) — current app position, **CSFloat only** (the live CGT figure), tagged "CSFloat only"
  - Second bar (dimmed, ~55% opacity) — **incl. Steam** hypothetical: what allowance usage would be if Steam-to-Steam sales counted as disposals, with the disposal count shown
  - Second bar only renders when Steam sales exist in the year (i.e. when the two figures differ)
- **Est. Tax Owed card** gained an "incl. Steam" sub-line when the stricter reading would create a taxable gain
- **Per-sale CGT badge** — every trade-history row now shows a clear status badge next to the platform: green `✓ CGT` (counts toward CGT — CSFloat/custom) or grey `✕ not CGT` (excluded — Steam Wallet sale). Replaces the faint "not CGT" text. Hover tooltip explains why
- **`calculateCGT()` refactored** — now computes both views in one pass via an internal `rollup()` helper. Returns the current (excl-Steam) figures at top level plus an `inclSteam` object and the full `inYear` trade list. Backwards compatible — all existing callers (summary, report export, cash-out calc) still read the same top-level fields
- Disclaimer reworded to explain the "incl. Steam" figure reflects the stricter legal reading (Steam-to-Steam as a disposal) — the app shows the chosen position alongside the debatable one rather than asserting either as settled
- New CSS: `.cgt-tag`, `.cgt-tag-yes` (green), `.cgt-tag-no` (grey) in index.html
- App's Steam-exclusion remains the default/live CGT position; the dual view is informational only

### v2.4.3 — Play Skins Sell Persistence Fix ✅
- **Root cause**: a read-modify-write race. Selling a play skin mutated the in-memory `skins` array and saved it, but a concurrent price-refresh loop (the 3s-per-item `refreshSkinPrices` loop, or a single `refreshSingleSkin` ↻) held a stale snapshot of `skins` and re-persisted it afterwards — resurrecting the just-sold item. Symptom: sold MAC-10 Stalker kept reappearing in Play Skins, leading to it being sold twice
- **Skin sell is now atomic** — `confirmSell` (skin branch) re-reads the canonical array from storage via `loadSkins()`, mutates a fresh copy, then writes back. No longer trusts the module-level snapshot. Also captures `buyPrice` before the filter so the toast can't read a dropped reference
- **Both refresh loops re-sync before saving** — `refreshSkinPrices` and `refreshSingleSkin` now re-read storage each iteration and only merge fresh prices into items that still exist; an item sold mid-refresh is never written back
- No data model change; purely a concurrency/persistence hardening

### v2.4.5 — Trade Platform / CGT Tag Fix ✅
- **Bug**: Several trade-history rows showed a 15% fee (Steam Market) but were tagged **CSFloat** and given a green ✓ CGT badge — meaning Steam Wallet sales were being wrongly counted toward CGT. Root cause: those trade records had no `platform` field, and all platform-defaulting logic fell back to `'csfloat'`, so a 15%-fee Steam sale rendered as CSFloat and counted as a taxable disposal
- **New `tradePlatform(t)` helper** — single source of truth for a trade's effective platform: explicit `platform` wins; otherwise inferred from fee rate (`feePercent >= 13` → `steam`, else `csfloat`). Steam Market total fee is 15%, CSFloat is 2%, so the fee rate unambiguously identifies the platform for legacy records
- **Wired `tradePlatform()` into all four read sites**: trade-row badge + CGT badge, `calculateCGT()` Steam-exclusion filter, CGT report CSV export, and trade-history CSV export. No more `t.platform || 'csfloat'` fallbacks anywhere
- **One-time migration on launch** — `seedNewItems()` now backfills the `platform` field on any stored history record missing it (inferred from fee rate) and re-persists `cs2vault_history`, so existing data is cleaned permanently, not just at render time
- **Seed/sample trade data** updated with explicit `platform` on every row (15%-fee rows → `steam`, 2%-fee rows → `csfloat`)
- Result: Gamma Case, FAMAS BAD TRIP, FAMAS STYX, Austin Contenders, G2 Austin (all 15% fee) now correctly show the **Steam** badge and grey ✕ not CGT, and drop out of the CGT calculation

### v2.4.6 — Silent One-Click Auto-Updates ✅
- **Problem**: The auto-updater showed an NSIS "Choose Installation Options / who should this be installed for" dialog on every update, requiring manual clicks. Root cause was the NSIS config, not the updater code (which already requested a silent install via `quitAndInstall(false, true)`)
- **Fix in `package.json`**: `nsis.oneClick` `false` → `true` (assisted installer → one-click silent installer); added `perMachine: false`; `allowToChangeInstallationDirectory` `true` → `false`. With `oneClick: false` NSIS ignores the silent flag and always shows the assisted dialog — `oneClick: true` installs with no dialogs and no clicks
- **No code change** — `main.js` updater logic was already correct
- **Caveat noted to Rudi**: the silent behaviour fully applies from the *next* update onward. The installed v2.4.5 was built with the old assisted config, so its uninstaller (invoked during the v2.4.5 → v2.4.6 upgrade) may still flash one dialog this one time; v2.4.6+ updates are fully silent
- **Restart is unavoidable** — Windows locks the running .exe, so every Electron auto-updater must quit → swap files → relaunch. One-click reduces this to a brief flicker with zero user interaction (matches VS Code / Slack / Discord behaviour). There is no in-place hot-swap for a packaged Electron app

### v2.5.0 — Tab Consolidation + Holdings Allocation Strip + Case Intel Rebuild ✅
- **Tabs trimmed 11 → 7**: Holdings, Trade History, Analytics, Play Skins, Watchlist, Case Intel, Settings
  - **Trade-Up tab removed entirely** (panel, ~150 lines of TUC JS, all `.tuc-` CSS) — same fate as Arbitrage; unused
  - **Alerts merged into Watchlist** — alerts UI now lives as a "🔔 Price Alerts" section below the watchlist (all IDs/functions unchanged; the price-refresh re-render hook now checks `tab-watchlist`)
  - **Health Report + Portfolio History folded into Analytics** as sections with dividers (original headers, refresh buttons and all element IDs kept — render functions untouched)
  - `switchTab` rewired: `analytics` → `renderPortfolio()` + `renderHealthReport()`; `watchlist` → `renderWatchlist()` + `renderAlerts()`; removed branches for portfolio/alerts/health/tradeup
- **Holdings allocation strip** — stacked bar + legend under the stat cards showing portfolio value split by bucket (Cases / Stickers / TUF / Skins / Knives / Armory / Other). TUF items bucket separately regardless of type. Clicking a segment or legend chip applies the matching `filterType` filter (click again clears); non-selected segments dim. Rendered by `renderAllocBar()` from `updateStats()`; hidden when portfolio is empty
- **Case Intel scoring rebuilt on real signals only** — all fabricated data removed:
  - Deleted `UNBOX_HISTORY` (hardcoded estimate table), `getUnboxTrendScore()`, hardcoded `atl`/`unboxTrend`/`peakSupply` fields in `CASE_INTEL_DATA` (now released/discontinued dates only), and the whole BUY/HOLD/AVOID `getSignal()` system
  - New weights: **Supply Trend 35%** (real snapshot delta % vs previous run), **Disc. Age 30%** (factual dates, same curve as before), **Price vs 90D Low 20%** (new `getTrailingLow(itemId, days)` — min price from the app's own price log; requires 3+ points spanning 14+ days), **30D Momentum 15%** (falls back to 7D)
  - Components without enough history score a **neutral 50**, render dimmed with a tooltip, and each card shows an honest "N/4 signals live" confidence chip (green ● when all four are live)
  - Old absolute-listing-count thresholds dropped — Steam listings are only a slice of true supply, so only the *trend* is scored
  - **Neutral grades only** — signal labels (STRONG BUY etc.) removed everywhere; cards show grade + factual ⚡ ACTIVE DROP / DISCONTINUED Xmo chip; table's Signal and Unbox Trend columns replaced by a "vs 90D Low" column; summary's "Buy Signals" stat replaced by "Supply Shrinking N/M cases"
  - Legend updated with new weights and a note that all four signals are measured from data the app collects, improving with use
- index.html now ~1,250 lines; app.js ~4,560 lines

### v2.4.7 — Add/Edit/Delete Play Skins + Sticky Modals ✅
- **Add Play Skin** — the Play Skins tab now has a "+ Add Play Skin" button (previously skins could only be seeded/imported, never added from the UI). New `skinModal` in index.html (name, type [skin/knife/agent], qty, buy price, market hash) plus `openAddSkinModal()`/`saveSkin()`
- **Edit + Delete per skin row** — each row gained an **Edit** button (`openEditSkinModal()`) and a **✕** delete button (`deleteSkin()`, with confirm dialog noting it does NOT record a sale). Row actions are now: ↻ / Edit / ✓ Sell / ✕
- **Atomic skin writes** — `saveSkin` and `deleteSkin` re-read storage via `loadSkins()` before mutating and writing back, matching the v2.4.3 concurrency-hardening pattern so a price refresh in flight can't resurrect or clobber items
- **Sticky modals** — modals no longer close when you click the backdrop. They close only via the ✕, Cancel, or Save buttons, so an accidental click outside the add/edit/sell/top-up/price modal no longer discards input. The price-history chart popup (`priceHistoryModal`) is the one exception — it still dismisses on backdrop click since it has no save action
- Play-skin stats remain holdings-separate by design; `saveSkin`/`deleteSkin` call `updateStats()` only to keep realised/trade figures fresh

### v2.4.4 — Delete Trade History Entries ✅
- **Delete button (✕) on every trade-history row** — calls new `deleteTrade(id)`
- `deleteTrade()` is atomic (re-reads `cs2vault_history`, removes by `id`, writes back), shows a confirm dialog with trade details, and warns that it only removes the history record — it does NOT restore the item to holdings/play skins
- `.sold-card` grid widened from 5 to 6 trailing columns to fit the action cell; new `.sold-col-action` CSS
- Rows without an `id` simply render no delete button (defensive; all real trades have a `uid()`)
- Built to let Rudi clear the duplicate MAC-10 Stalker record created by the pre-v2.4.3 double-sell

### Bonus Features ✅
- Enhanced sell modal — platform buttons, "total received after fees" mode
- Play skins sellable — records to trade history
- New logo + green colour scheme
- Trending — top 5 gainers/losers with Steam item images, 7d/30d/90d toggle
- Steam historical data — fetch years of daily price data from Steam market listing pages
- Cash Out Calculator — full fee chain: Steam sell → bridge skin → CSFloat sell → withdraw → cash
- CGT tracker — realised gains/losses, £3,000 allowance usage bar, estimated tax
- CGT report export — CSV with summary + full disposal schedule
- Pricempire integration — API key management, historical CSFloat price fetching
- Portfolio allocation pie chart — doughnut chart on Analytics tab by item type
- CGT platform filtering — platform saved with every trade, Steam sales excluded from CGT

---

## Known Issues / Bugs

### 🔴 Critical
- None currently known

### 🟡 Needs Fixing
1. **Case Intel — score confidence builds over time (by design)**
   - Supply Trend needs a 2nd analysis run on a later day; Price vs 90D Low needs 3+ price-log points spanning 14+ days; Momentum needs 2+ points in window
   - Until then those components score neutral 50 and the card shows "N/4 signals live" — expected behaviour, improves automatically with regular use

2. **Steam historical data — not tested by user**
   - The "📈 Fetch Steam History" button on Analytics tab was built but user hasn't confirmed it works
   - Could fail if Steam rate-limits or if the HTML parsing breaks on certain items

### 🟢 Minor / Polish
- Portfolio History chart annotation labels could overlap on narrow windows
- Settings tab still shows old diamond shape icon instead of new logo
- `settingsVersion` hardcoded to "Desktop App v1.0.0" in fallback function
- Case Intel momentum columns show — until price log has enough history (expected behaviour)

---

## Next Steps (Prioritised)

### Short-term
- **Test Steam historical data fetcher** — verify the 📈 button works, fix any parsing issues
- **Pricempire historical data** — the API integration is built but `fetchPricempireHistory()` isn't wired into the price charts yet as a toggleable data source
- **Case Intel drop pool status badge** — hardcode Active/Rare/Discontinued status per case (no API needed), show as badge on each card and table row

### Medium-term
- **£41k full-cashout tax modelling** — Rudi wants to model his actual CGT position if he sold his entire ~£41k portfolio and realised it to his bank: the real taxable gain after deducting acquisition costs, and spreading disposals across tax years to use multiple £3,000 allowances. Needs his rough total acquisition cost as input. Revisit in a future session
- **Bulk edit/delete** — multi-select holdings with checkboxes for batch operations
- **Phase 6 — Steam inventory import** — limited usefulness for users with storage units (items in storage units are invisible to Steam's inventory API). Worth building for floating inventory items only

### Ideas (not yet scoped)
- Case Intel squeeze score — composite chip combining the now-real supply trend + momentum + discontinued status (post-v2.5.0 the inputs all exist)
- Case Intel drop pool status badge (Active / Rare / Discontinued) — hardcoded, no API needed
- Auto-refresh on a schedule (Steam can run silently every X hours)
- Seed initial price history from current prices on first install
- Dark/light theme toggle

---

## Technical Notes

### Price Priority Logic (`getBestPrice`)
- **Cases:** Steam → CSFloat fallback
- **Stickers:** Steam → CSFloat fallback
- **TUF-tagged skins:** Steam → CSFloat fallback
- **Agents:** Steam only (not listed on CSFloat)
- **Everything else (skins, knives, armory, charms):** CSFloat → Steam fallback

### Case Intel Scoring (v2.5.0 — real signals only)
- **Supply Trend 35%**: % delta in Steam listing count vs previous snapshot (24h+ old). Shrinking → high score (≤-10% → 95), growing → low (≥+10% → 10). No previous snapshot → neutral 50, flagged
- **Disc. Age 30%**: factual months since discontinuation; sweet spot 12–48mo (88), active cases score 5
- **Price vs 90D Low 20%**: current price ÷ `getTrailingLow(id, 90)` (min of own price log; needs 3+ points spanning 14+ days, else neutral 50)
- **30D Momentum 15%**: 30D % change from price log (7D fallback); +10% → 90, -10% → 12, none → neutral 50
- Neutral fallbacks are flagged per case (`neutralFlags`) and surfaced as a "N/4 signals live" chip — score confidence builds automatically with regular use
- No hardcoded ATLs, no unbox estimates, no buy/sell signals — grades (S/A–F) only, plus factual Active/Discontinued status

### Case Supply Snapshot Logic
- Storage key: `cs2vault_case_supply` — object keyed by `marketHash`, value is array of `{ ts, count }`
- `recordCaseSupplySnapshot(marketHash, count)` — appends a new snapshot on each analysis run
- `getPreviousSupplySnapshot(marketHash)` — returns most recent snapshot older than 24 hours (avoids same-session comparison)
- `pruneCaseSupply()` — removes entries older than 6 months, called on app launch
- Supply Trend shown as: arrow + absolute delta in K + % change vs previous snapshot

### Price Momentum Logic (`getPriceMomentum`)
- Takes `itemId` and `days` (7 or 30)
- Filters price log entries within the window, sorts by timestamp
- Returns % change from earliest to latest entry in the window
- Returns `null` if fewer than 2 data points exist

### Steam Sticker Lookup Logic
1. Auto-prepend `Sticker | ` if missing
2. Apply capitalisation fixes (e.g. `From the Deep` → `From The Deep`, `| Axia` → `| AXIA`)
3. Try exact hash against Steam first
4. If no result, strip variant suffix `(Holo)`/`(Glitter)`/`(Foil)`/`(Lenticular)` and retry

### Agent Market Hash Convention
Agents stored with full Steam name e.g. `Number K | The Professionals`. CSFloat skipped entirely.

### Platform Fees
- CSFloat: 2% seller fee
- Steam Market: 15% total (13% Valve + 2% game-specific)

### CGT Rules (UK)
- £3,000 annual CGT allowance (2024/25 and 2025/26)
- 18% basic rate / 24% higher rate on gains above allowance (disposals on/after 30 Oct 2024)
- App treats Steam Wallet sales as NOT taxable disposals — only real-money cashouts count (this is the app's chosen position, left unchanged through v2.4.2). As of v2.4.2 the CGT Summary also shows an informational "incl. Steam" figure alongside the live CSFloat-only figure, so the stricter reading is visible without changing the default treatment
- ⚠ LEGAL NUANCE (researched June 2026): Under strict UK CGT principle, a "disposal" includes *exchanging* one asset for another (CG12700/CG12701), mirroring how HMRC treats crypto token-to-token swaps (CRYPTO22100) — so a Steam-to-Steam sell-then-buy is arguably a disposal at GBP market value even without cashing out. The locked/non-withdrawable nature of Steam Wallet affects valuation (quantum), not whether a disposal happened. The genuinely unsettled question is whether a Valve-licensed skin is "property" at all (R v Lakeman; Property (Digital Assets etc) Act 2025). The app's Steam-exclusion is a defensible-but-debatable position; richer per-disposal data is now captured for all platforms so the treatment can be revisited. Rudi to consult a digital-asset-literate accountant before filing.
- Platform fees are allowable deductions
- Losses can offset gains within the same tax year
- Chattels exemption (£6,000, tangible moveable property) does NOT apply — skins are intangible
- Trade records store: `platform`, `feePercent`, `feeAmount` (£), `gross` (£), `netRealised` (£), plus name/type/qty/buyPrice/sellPrice/sellDate
- `calculateCGT()` (v2.4.2) computes two rollups in one pass: top-level fields = current CSFloat-only position; `.inclSteam` = hypothetical all-platforms position; `.inYear` = all in-year trades. Internal `rollup(trades)` helper does the gain/loss/allowance/tax maths
- Old trades without a `platform` field are migrated on launch (v2.4.5): platform is inferred from fee rate (`feePercent >= 13` → Steam, else CSFloat) via `tradePlatform(t)` and re-persisted to `cs2vault_history`. All platform reads (badge, CGT filter, CSV exports) route through `tradePlatform()`. Old trades without gross/feeAmount/netRealised still fall back to recomputing from sellPrice × qty

### Steam Inventory Import — Storage Unit Limitation
- Steam's public inventory API (`/inventory/{steamId}/730/2`) returns only live inventory items
- Items stored in Storage Units are "consumed" and completely invisible to the API
- Not worth prioritising for users with heavy storage unit usage (30+ units)
- CSV import is the practical alternative for bulk-adding stored holdings

---

## File Delivery Process
When receiving updated files from Claude:

**Step 1 — Download the zip**
- Claude always delivers `cs2vault-update.zip`
- Save it into: `C:\Users\44748\OneDrive\Documents\CS2 Vault\cs2vault-electron\`

**Step 2 — Extract**
```bash
unzip -o ~/OneDrive/Documents/"CS2 Vault"/cs2vault-update.zip -d ~/OneDrive/Documents/"CS2 Vault"/cs2vault-electron/
```

**Step 3 — Commit, tag, push**

Claude provides the exact command at the end of every delivery — just copy and run it:
```bash
git add . && git commit -m "v2.x.x - Description" && git tag v2.x.x && git push origin main --tags
```

**⚠️ Tag conflict:** If the tag already exists, tell Claude — the next patch version will be repackaged with the corrected version number.

**⚠️ Never extract via Windows File Explorer** — it doesn't overwrite files in subdirectories. Always use `unzip -o` in Git Bash.
