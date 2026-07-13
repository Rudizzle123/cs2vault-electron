# CS2 Vault — Project State

Last updated: July 2026 (v3.10.0: Electron EOL upgrade — 29 → 43, builder 24 → 26, audit 0 vulns; launch-gate item 5 CLEARED, code-signing cert purchase unblocked) | Current version: v3.10.0

---

## What's Been Built (Complete)

### v3.10.0 — Electron EOL upgrade: 29 → 43, builder 24 → 26, audit clean (launch-gate item 5) ✅
Dependency-only release — **zero src/*.js code changes**. Clears the EOL runtime + the remaining 6 high-severity vulns and **unblocks the code-signing certificate purchase** (gate item 6).

- **Versions:** `electron ^29.1.0 → ^43.1.0` (current stable, 14 majors in one jump; Chrome 150, Node 22 inside), `electron-builder ^24.13.3 → ^26.15.3` (kills the `tar` high), `electron-updater ^6.1.8 → ^6.8.9` (same major — feed format + GitHub publish config unchanged; pairs with builder 26). Fresh `package-lock.json`. **`npm audit` → 0 vulnerabilities total** (was 6 high)
- **electron-store deliberately stays ^8.2.0:** v9+ is ESM-only and the app is CJS with no build tools. 8.2.0 verified loading clean in the new tree (`conf` 10.x fine on Node 22). Do not bump without an ESM/bundler strategy
- **`protobufjs ^7.6.5` override untouched and re-verified:** steam-user + globaloffensive + steam-appticket all load and construct against pb 7.6.5 under the new tree (v3.7.1 clean-reinstall check)
- **Breaking-change review 30 → 43 vs the app's API surface** (app/BrowserWindow/ipcMain/Notification/shell/dialog/safeStorage/contextBridge; HTTP via Node http+https): Electron 32 `File.path` removal — unused (all file IO via main-process dialogs); Electron 40 renderer-clipboard deprecation — unused; safeStorage already only touched post-`whenReady` (the real newer-major gotcha); electron-updater 6.x events/`quitAndInstall` unchanged; contextIsolation/sandbox already modern — all no-ops. Two accepted behaviour changes: **(a) Electron 42+ downloads its binary on first `bin` run instead of postinstall** — first `npm start`/START-DEV after `npm install` pulls ~110MB once; CI packaging unaffected (electron-builder fetches its own dist); **(b) Electron 43 dialogs default to Downloads when no `defaultPath`** — the import/restore dialog now opens in Downloads instead of the OS-remembered last dir (export already passes `defaultPath`); cosmetic, accepted for scope discipline
- **CI: `.github/workflows/build.yml` Node 20 → 22** — the electron@43 npm package declares `engines: node >= 22.12.0`. ⚠ **Rudi's local machine also needs Node ≥ 22.12** to `npm install` this version
- **Builder-26 config validated by a real packaging run in the sandbox:** schema accepted unchanged (win/nsis/publish/files/compression all consumed), Electron 43.1.0 dist resolved, asar packed **with integrity resource** into the exe, `app-update.yml` byte-identical shape (github/owner/repo) — auto-update feed continuity confirmed. Run stopped only at final NSIS assembly (`wine ENOENT` — Linux sandbox, environmental; `windows-latest` CI builds NSIS natively). asar verified to contain `src/*`, `assets/schema-snapshot.json`, `legal/*`, `package.json`
- **Verification:** `node -c` clean on all 7 src JS files; all three harnesses pass untouched — tax **87/87**, schema **66/66**, SU merge-plan **48/48**
- Delivery: `package.json`, `package-lock.json`, `.github/workflows/build.yml`, `STATE.md`
- ⚠ **Live-test checklist for Rudi:** (1) check `node -v` ≥ 22.12 BEFORE pulling, then `npm install` (expect the one-off Electron binary download on first START-DEV); (2) START-DEV boots, holdings render, a price fetch works (`window.cs2vault.fetch` IPC path); (3) Storage Units end-to-end on the new runtime: saved-session reconnect → casket list → view contents → names resolve (exercises safeStorage/DPAPI + GC + schema); (4) **packaged-build check** — tag push → GitHub-Actions .exe builds on Node 22, installs, boots, and the auto-updater still sees the GitHub feed; (5) export + import/restore dialogs open sensibly (restore now defaults to Downloads — expected)

### v3.9.0 — Storage-Unit import, session 3 of 3: merge into holdings (Phase 6 COMPLETE) ✅
Storage-unit contents now import into holdings — per-unit or all units at once. Pro-gated (inherits the SU lock panel + `isPro()` guards on the preview and commit paths). Phase 6 is done: connect (v3.7.0) → names (v3.8.0) → merge (v3.9.0). Rudi's approved calls: (a) all-units scan included, (b) Doppler phases split into separate holdings, (c) straight v3.6.0 diff semantics.

- **Two entry points, one flow:** "Import into Holdings" on the per-unit contents panel (`suImportThisUnit`, appears once contents load), and **"Import all units"** in the connected header (`suImportAllUnits`) — reads all caskets **sequentially** with per-unit progress in the count line, tolerates individual unit read failures (counted, surfaced in the preview note, never aborts the batch), aggregates everything, one combined preview. Rationale recorded: identical items span multiple units (Clutch Case across Clutch/Clutch2/3/4), so aggregate-then-compare-once is the only ordering where the NEW/MORE/TRACKED math stays correct without committing between units
- **New pure module `src/su-merge-plan.js`** (UMD-ish: `window.suMergePlan` in the renderer via a script tag before app.js, `require()`-able in Node for the harness). `aggregate(batches)` → grouped rows; `planMerge(rows, holdings)` → NEW/MORE/TRACKED plan; `kindToType()` → resolver kind → holding type (knife/gloves→knife, weapon→skin, sticker/patch/graffiti→sticker, charm/music→armory, `other` falls back to name text: " case"/"package"/" crate"→case, "sticker"/"capsule"→sticker, "charm"/"patch"/"pin"→armory, default skin — agents land as skin)
- **Doppler phase split (approved b):** grouping key = displayName = market hash + " — Phase N"/gem, so each phase is its own row → its own holding. `name` field carries the phase-decorated display name; **`marketHash` stays the phase-less Steam name** so all existing pricing keeps working. Tradeoff on record: **pricing is phase-blind until phase-aware CSFloat lookups land — Rudi flagged this as important, natural companion to the Cashout Planner** (CSFloat supports phase filters; `getBestPrice` would need a phase-aware key). `customName` (name tags) deliberately ignored for grouping — cosmetic, doesn't change market identity
- **Phase-aware matching:** plan rows match existing holdings by exact displayName first (a phase-named holding beats everything), then by phase-less marketHash **preferring holdings whose name is not phase-decorated** — the harness caught the original bug here (Phase 2/3 rows matched a "— Sapphire"-named holding because its marketHash also equals the phase-less hash and it sat first in the array). When 2+ rows still resolve to the same holding, they're flagged `sharedMatch` (⚠ in the preview: "check quantities manually") but keep per-row diff semantics — predictable beats clever
- **Diff semantics (approved c, v3.6.0 verbatim):** storage qty vs tracked qty; surplus → "+N MORE", import the difference as a new lot; equal-or-less → TRACKED, unticked; no match → NEW, import all. Matching is case-insensitive against `holding.marketHash` OR `holding.name` (covers holdings with empty marketHash)
- **Commit path mirrors `confirmSteamImport`:** default buy price + currency + date with per-row overrides (no invented cost basis — CGT correctness), one FX probe via `toBaseGBP`, **atomic write** (fresh `loadData()` → mutate → `saveData()`), merge = `ensureLots` + `makeLot` push + `recalcHoldingFromLots` + note "+N via storage-unit import on date", new = full lot + FX provenance + notes `Imported from storage unit "X"` (or "from N storage units"), `logActivity` per row, `renderHoldings()` + `updateStats()` on completion
- **Unmapped items excluded** from import (no market hash → no pricing possible); counted in the preview note. New `suImportModal` in index.html mirrors the steamImport step-2 layout (injection-safe createElement/textContent preview rows); `suImportCcy` added to the startup currency-select population list; per-unit contents schema-meta line no longer says "arrives in the next update"
- **New offline harness `test-su-merge-plan.js` (48/48)** — kind→type mapping (incl. souvenir packages, capsules, pins, agents), cross-unit aggregation, phase splitting, StatTrak separation, customName grouping, unmapped exclusion, all NEW/MORE/TRACKED edges (equal/more/less/zero-tracked/case-insensitive/empty-marketHash-fallback), phase-aware matching + sharedMatch flag, null/empty holdings. **Run all three harnesses after any related change:** `node test-su-merge-plan.js` + `node test-schema-mapping.js` (66/66) + `node test-tax-engine.js` (87/87)
- Delivery: `src/su-merge-plan.js` + `test-su-merge-plan.js` (new), `src/app.js`, `src/index.html`, `package.json`. `node -c` clean on app.js, su-merge-plan.js, steam-gc.js, schema.js, main.js
- ⚠ **Live-test checklist for Rudi (session-3 field test — real holdings will be written, consider a backup/export first):** (1) per-unit: open "Clutch and TUFS" → Import into Holdings → expect Clutch Case badged vs your tracked position (MORE/TRACKED with the right diff), unmatched Gallery skins NEW; (2) set a default price + date, untick anything doubtful, import a SMALL selection first and verify the holdings rows, lots, notes provenance and activity log look right; (3) all-units: "Import all units" — watch the per-unit progress, expect one aggregated preview where Clutch Case's qty is the SUM across all Clutch* units before the diff; (4) any Doppler knives should appear as separate phase rows with the ⚠ shared-match marker if you already track one; (5) confirm imported holdings price correctly (marketHash is phase-less) and P&L updates; (6) re-running the same import afterwards should show everything TRACKED (idempotence)

### v3.8.0 — Storage-Unit import, session 2 of 3: defindex → market_hash_name schema mapping (Phase 6, Pro) ✅
Turns v3.7.0's raw GC identities ("def 4471 ×342", "def 8 · paint 121") into real market hash names in the storage-unit contents preview. **Still read-only** — merge-into-holdings is session 3. No tax-engine, pricing, or payments changes (tax harness 87/87 untouched).

- **Sourcing strategy (decided per Rudi's lean, tradeoffs recorded):** fetched-and-cached with a bundled fallback, from the raw Valve files on the **SteamDatabase/GameTracking-CS2 mirror** (auto-updated on every CS2 patch): `items_game.txt` (7.8MB) + `csgo_english.txt` (4.7MB), ~12.5MB total per refresh. Rejected alternatives: bundled-only (goes stale within weeks of every new case/operation — new items would render as raw defindexes until an app update) and ByMykel/CSGO-API pre-processed JSON (smaller parse but a third party's schema shape that can drift; raw Valve files parsed in-house are only marginally bigger and fully under our control). Load chain: in-memory → disk cache (`{userData}/cs2vault-schema.json`, plain fs — deliberately NOT electron-store, so the ~540KB distilled schema never bloats the main store's whole-file rewrites) → **bundled snapshot `assets/schema-snapshot.json`** (generated at build time by the SAME distiller, so offline first-runs always resolve names). If the loaded schema is >7 days old a **background refetch** runs (fetch → parse → distill → cache swap, ~3s measured incl. download); a fetch failure never breaks anything — the app keeps whatever schema it has. Schema work all lives in the **main process** (new module `src/schema.js`, initialised from `steam-gc.js`'s register); the renderer never sees the schema, only resolved names on IPC results
- **`src/schema.js` (new, main process):** tolerant VDF/KeyValues parser (comments, duplicate-key section merging — items_game repeats section names), csgo_english loc parser (UTF-8 BOM, escaped quotes, case-insensitive tokens), `distillSchema()` → compact mapping (~540KB: 2,053 items / 1,480 paint kits / 11,209 sticker kits / 100 music / 143 charms / 19 graffiti tints), and the pure `resolveGCItem(slim, schema)` composer. Item kind derived from the prefab chain (`melee_unusual`→knife, `hands_paintable`→gloves, `weapon_*`+`weapon_base`→weapon, else other/named-item); weapon display names resolved through multi-parent prefab inheritance
- **Composition rules (all validated against the real schema):** weapons `[StatTrak™ |Souvenir ]Weapon | Paint (Wear)`; knives/gloves `★ [StatTrak™ ]Name | Paint (Wear)`; **vanilla knives** (paint 0/null) `★ Bayonet` — no paint, no wear, StatTrak variant supported; cases/capsules/keys/pins/passes/agents = localized item name verbatim (incl. Steam's genuine double-space quirk in agent names, e.g. "Ground Rebel  | Elite Crew"); `Sticker | X` / `Patch | X` / `Sealed Graffiti | X (Tint)` / `Charm | X` / `[StatTrak™ ]Music Kit | X`. **Wear brackets min-inclusive** (exactly 0.07 → MW, 0.15 → FT, 0.38 → WW, 0.45 → BS). **Souvenir = quality 12**, prefix suppressed on ★/StatTrak items
- **Doppler/Gamma Doppler phases:** derived from paint-kit internal names (`phaseN`/ruby/sapphire/blackpearl/emerald markers — covers all 24 Doppler-family kits incl. the newer widow + Glock Gamma Doppler ranges), gated on the localized paint name being exactly "Doppler"/"Gamma Doppler" (so e.g. "Emerald Pinstripe" can't false-positive). **Steam market hash names exclude the phase** — `resolveGCItem` returns it as a separate `phase` field; the preview shows "★ Karambit | Doppler (Factory New) — Phase 2"; CSFloat pricing (session 3) can consume the field
- **`slimGCItem` extended** (steam-gc.js): reads uint32-LE GC attributes straight off the raw item's `attribute` array — sticker/patch/graffiti kit (attr 113, with a fallback to globaloffensive's parsed `stickers[0].sticker_id`), music id (166), charm/keychain id (299), graffiti tint (233); all four confirmed `stored_as_integer` in items_game. **Kit reads are gated on the tool defindexes** (1209 sticker / 4609 patch / 1348 graffiti / 1314 music / 1355 charm) so a weapon's APPLIED stickers are never misread as the item's own identity. `readU32Attr` exported for the harness
- **`getCasketContents`** now resolves every item against the loaded schema (never blocks on network — cache/bundled always answers) and attaches `name`/`phase`/`wearName`/`kind` per item plus a `schema` meta block (origin/generated/fetchedAt) on the response; `gc:caskets` warms the schema so it's ready before the first contents view. Renderer (`suViewCasket`) groups by resolved name (+phase, +custom name), keeps the session-1 raw "def N · paint N" string as a dimmed monospace fallback for anything unmapped (with a tooltip + "N unmapped" count in the title), and shows a schema-status line (`suSchemaMeta` in index.html — replaces the session-1 "mapping arrives in the next update" note)
- **Fixture validation against the live "Clutch and TUFS" unit:** def 4471 → **Clutch Case** ✓; def 8 · paint 121 → **AUG | Luxe Trim** ✓, def 14 · paint 120 → **M249 | Hypnosis** ✓, def 38 · paint 117 → **SCAR-20 | Trail Blazer** ✓ (all three Gallery Collection, matching Rudi's TUF description). ⚠ **Fixture discrepancy flagged:** "def 23 · paint 1100" — paint kit 1100 (`cu_glock_snackattack`) pairs ONLY with weapon_glock (def 4) in items_game item sets, so the canonical item is **Glock-18 | Snack Attack** (Riptide Collection); "def 23" was almost certainly a transcription slip (def 4). The mapper composes faithfully off whatever the GC reports either way — **verify on the live unit** during the session-2 field test
- **New offline harness `test-schema-mapping.js` (repo, 66/66)** — runs entirely against the bundled snapshot (no network), covering: all wear boundary values, the live fixtures, StatTrak™/Souvenir prefixes (+ mutual exclusion), painted/vanilla/StatTrak knives, all Doppler phase/gem mappings incl. Glock Gamma Doppler, gloves, stickers/patches/graffiti (kit-from-attribute + applied-sticker-vs-own-kit distinction), charms, music kits (+ StatTrak), agents, unknown-def/paint fallbacks, raw-attribute buffer edge cases (Uint8Array, short buffer), and end-to-end raw-GC-item → slim → resolve. Run alongside the tax harness after any schema/mapping change
- **Live-verified in the build sandbox:** real fetch of both files from SteamDatabase → distill (1.1s parse) → cache write → resolve, 3.2s end-to-end; stale-cache detection triggers the background refresh correctly
- Delivery: `src/schema.js` + `assets/schema-snapshot.json` + `test-schema-mapping.js` (new), `src/steam-gc.js`, `src/app.js`, `src/index.html`, `package.json`. `node -c` clean on app.js, main.js, preload.js, steam-gc.js, schema.js; tax harness **87/87**
- ⚠ **Live-test checklist for Rudi (session-2 field test):** (1) open the "Clutch and TUFS" unit — expect Clutch Case ×342 and the Gallery skins by name with wear brackets; (2) confirm whether the paint-1100 stack shows **Glock-18 | Snack Attack** (expected) — if it really renders as MP5-SD | Snack Attack, screenshot it (that would mean the GC genuinely reports def 23 and needs a look); (3) any Doppler knives should show "— Phase N"/gem after the name; (4) check the schema line under the table says bundled/cached + a July 2026 date, and that a later reopen (after 7+ days) flips it to a fresher date; (5) **packaged-build check** — assets/schema-snapshot.json loads from inside the asar (it's under the existing `assets/**/*` files glob, but verify the GitHub-Actions .exe resolves names, not just START-DEV)

### v3.7.1 — Dependency audit: protobufjs critical killed via npm override ✅
v3.7.0's new `steam-user` tree pulled in a **critical-severity nested `protobufjs@6.11.6`** (inside `steam-appticket`, a steam-user sub-dep the app never exercises — game-server auth tickets). Fixed with a **`package.json` `overrides` entry** forcing `steam-appticket → protobufjs ^7.6.5` (the patched version the rest of the tree already dedupes to). Clean-reinstall verified: `steam-user`, `globaloffensive`, and `steam-appticket` all load and construct against pb7. Audit: **16 vulns (1 critical) → 6 high, 0 critical**. ⚠ Minor accepted risk: steam-appticket's *decode* path is untested against pb7 — irrelevant unless app tickets are ever used (they aren't).
- **Remaining 6 highs are two deliberate-upgrade items, NOT `audit fix --force` material:** (1) **Electron 29 is EOL/unpatched** — added to the LAUNCH GATE below (the app will hold Steam credentials + payment licences; shipping the first paid build on an EOL runtime is not acceptable); (2) `tar` via electron-builder ≤24 — build-machine only, never ships to users, roll into the same modernisation pass
- Rule of thumb recorded: after any `npm install` that adds deps, run `npm audit`; fix transitive pins with `overrides` where the patched major matches; treat `--force` suggestions (they proposed *downgrading* steam-user to 3.x) as noise

### v3.7.0 — Storage-Unit import, session 1 of 3: GC connect + casket enumeration (Phase 6, Pro) ✅ code-complete, ⏳ awaiting Rudi's live-account test
First slice of the TRANSITION-PLAN Phase 6 headline feature. **Read-only** — nothing writes to holdings yet. Scope: Steam login, encrypted session persistence, CS2 Game Coordinator connect, storage-unit (casket) list, and a raw contents preview. Sessions 2–3 add the defindex→market-hash-name schema mapping and the merge-into-holdings flow (reusing the v3.6.0 preview UX).

- **New deps: `steam-user` ^5.3.0 + `globaloffensive` ^3.3.0** (both MIT — safe for the licensing model; Casemove's GPL-3 source remains untouched, libraries only). ⚠ npm package is **`globaloffensive`**, NOT `node-globaloffensive` (that's just the repo name — the latter 404s). **Run `npm install` after pulling this version.**
- **New main-process module `src/steam-gc.js`** — all Steam/GC work stays in the main process; the renderer only sees IPC results:
  - `startLogon()` flow resolves one of `ok` (logged on + GC session), `ok-nogc` (logged on, GC timed out — e.g. CS2 actually running), `guard` (Steam Guard code needed), `error` (EResult mapped to human messages: wrong password, rate-limited ~30min, wrong 2FA code, session replaced)
  - **Token model:** password used once, never stored; Steam's own **refresh token** is persisted encrypted via **Electron `safeStorage`** (Windows DPAPI) under main-store key **`cs2vault_steam_gc_token`** — deliberately NOT in the renderer `STORE_KEYS`, never exported in backups, cleared by Clear All Data (via `gc:clearToken`) and by "Forget session". If `safeStorage.isEncryptionAvailable()` is false the token simply isn't saved (session won't survive restart — graceful)
  - GC session: `setPersona(Invisible)` + `gamesPlayed([730])`, 45s GC-connect timeout, 30s casket-fetch timeout; `extractCaskets()` filters `def_index === 1201` (or a `casket_contained_item_count`), excludes casket-contained items, returns `{id, name, count}` sorted by name
  - IPC surface (preload `window.cs2vault.gc`): `status`, `login(account, password)`, `guard(code)`, `loginToken()`, `caskets()`, `casketContents(id)`, `logout()`, `clearToken()`
- **Renderer**: new **🗄 Storage Units** toolbar button (Holdings, next to ⇩ Steam Import) with the standard `pro-inline-badge`; `storageUnitImport` added to `FEATURES` (Pro) + the `syncProBadges` map; locked state renders `proLockPanel()` inside the modal. Two-step modal: (1) connect — saved-session row when a token exists, account/password (autocomplete off, password field cleared on success), Steam Guard row appears on demand with email-vs-authenticator labelling, transparency copy (password never stored / DPAPI token / "In-Game: CS2" while connected); (2) casket table (name, item count, View contents) + raw-contents preview grouped by `def defindex · paint N · StatTrak · "custom name"` with counts — explicitly labelled as raw pending session-2 name mapping. All rows `createElement`/`textContent` (injection-safe). Modal close leaves the GC session up (relogins are rate-limited); Disconnect is explicit
- **Session-1 known limits (by design):** contents shown as raw GC identities (no market names yet); no import/merge; single account at a time; QR login not implemented (credentials + Guard only — QR can come with the session-2 polish if wanted)
- ⚠ **Live-test checklist for Rudi (can't be tested from the build sandbox — needs a real Steam account):** (1) fresh credentials login incl. Steam Guard; (2) relaunch app → "Connect with saved session" works without password; (3) casket list shows all ~30+ units with correct names/counts; (4) View contents on a big unit (~1,000 items) returns within the 30s timeout; (5) confirm account shows "In-Game: CS2" during sync and the app behaves if CS2 is genuinely running (expect `ok-nogc`); (6) **packaged-build check** — steam-user loads its protobuf assets from inside the asar; verify the GitHub-Actions-built .exe connects, not just `START-DEV`
- Offline harness (`/tmp` scratch, 20/20): casket extraction (contained-item exclusion, default naming, sorting, defensive count branch), `slimGCItem` (nulls, StatTrak, stickers), EResult mapping (5/84/88, message-regex fallback, null-safe). Tax-engine harness **87/87** (no tax/pricing surfaces touched). `node -c` clean on app.js, main.js, preload.js, steam-gc.js

### v3.6.4 — Benchmark dual-source: stooq + Yahoo fallback ✅ (field-confirmed)
v3.6.3's stooq-only benchmark fetch failed on Rudi's machine (rate-limited/blocked — the exact failure the v3.6.3 caveat predicted), leaving the static fallback's flat lines. Fixes:
- **Per-series dual source**: stooq CSV first, then Yahoo Finance chart API (`query1.finance.yahoo.com/v8/finance/chart/`, symbols `^GSPC` / `BTC-USD` / `GC=F`, `range=2y&interval=1d`, JSON `timestamp` + `indicators.quote[0].close`, null closes skipped)
- **No silent failure**: if any shown benchmark lacks a live series, an amber warning renders under the summary cards naming the series and pointing at the console; per-series console diagnostics log source, point count, latest date on success, or HTTP status + first 80 chars of body on failure
- **Field result (Jul 8 2026)**: stooq fails, **Yahoo works for all three** (`sp500: 502 pts`, `btc: 731 pts`, `gold: 504 pts`, latest 2026-07-08) — Yahoo is effectively the primary source on Rudi's machine. Real data materially changed the picture: BTC over the chart range went from the static table's +30.2% to **-44.4%** (the old hardcoded values were wrong, not just stale)
- Known nuance (disclosed, not a bug): benchmarks index in USD terms vs the GBP portfolio — indexing cancels currency levels per line, but GBP/USD drift over the period is embedded in the comparison
- v3.6.3's snapshot fixes also field-confirmed in the same session: sawtooth gone, diagonal annotation gone, chart starts at the 2025-09-03 historical seed
- Delivery: `src/app.js` + `package.json` only. Yahoo-parse harness 4/4; tax harness untouched 87/87


### v3.6.3 — Analytics correctness pass: trending pricing, live benchmarks, snapshot integrity, storage batching, backup restore ✅
One tag covering two work passes (v3.6.2 was folded in unpushed). Triggered by Rudi spotting wrong Trending figures and flat benchmark lines; a codebase audit followed. **No tax-engine changes** (harness still 87/87).

**Trending / price-history platform routing (the v3.6.2 pass):**
- `recordPrice()` stored `best = min(csfloat, steam)` — contradicted `getBestPrice` routing (cases/stickers/TUF/agents = Steam first, else CSFloat first). Now routes identically; signature changed to `recordPrice(item, prices)` (5 call sites)
- `getPriceHistory()` silently swapped the whole series to Steam median-sale history whenever it had more points than the local log — after a "Fetch Steam History" run, ALL trends (including CSFloat-priced skins) ran on Steam medians. Now platform-aware: Steam-priced items use Steam history (correct platform, richer series wins); CSFloat-priced items use the local CSFloat series, falling back to Steam only when local has <2 points, flagged `source:'steam'` and badged **"Steam est."** in the UI. Old log entries fixed on read (best re-derived from stored per-platform prices — no migration)
- `calculateTrends()`: current price = live `getBestPrice` so Trending matches Holdings; in Steam-estimate mode it stays entirely within the Steam series (never mixes platforms in one % figure)
- Trending/analytics revamp: sparklines + was-price + clickable rows (→ price history modal) in trend rows, By Type proportion bars, allocation donut centre label (total invested), performer thumbnails, Monthly P&L moved full-width (killed the orphan grid cell)
- ⚠ Behaviour change: trend %s visibly differ post-update — skins now trend on CSFloat data (correct, not a regression)

**Benchmarks (Compare vs Market):**
- `BENCHMARK_DATA` was a hardcoded table ending 2026-03-14 → flat lines after mid-March, and it was indexed to Sep 2025 regardless of chart range (the summary-card %s didn't measure the labelled range). Now fetched live from **stooq.com daily-close CSV** (no API key: `^spx`, `btcusd`, `xauusd`), cached 24h in new key **`cs2vault_benchmarks`** (in STORE_KEYS + clearAllData; NOT in backups — refetchable cache). All series re-indexed to 100 at the chart's first visible date at render time. Static table retained as offline fallback only; `benchmarkValueAt()` never mixes sources (base and value always from the same source). ⚠ stooq was unverifiable from the dev environment — if lines are flat with console warnings, swap sources (Yahoo `query1.finance.yahoo.com/v8/finance/chart/` is the fallback candidate)

**Snapshot integrity (root cause of the sawtooth chart + diagonal annotation glitch):**
- Old `checkAutoSnapshot()` "backfilled" missed months by writing TODAY'S portfolio values onto PAST dates, one fake per launch — interleaved with case-only historical seeds this produced the sawtooth; duplicate date labels made the chartjs annotation plugin draw event lines diagonally. Backfill removed: auto snapshots are only ever dated the day measured (window opens on the 3rd; fires if the month has no snapshot yet). New snapshots carry `createdAt`
- One-shot `cleanupSnapshotArtifacts()` on init deletes fabricated autos (within 3 days of a historical point, no `createdAt`) and collapses duplicate dates (manual > auto > historical)
- Unclassifiable pre-fix autos show an amber **AUTO ⚠** tag in Snapshot History with a hover explanation — ⚑ Rudi should manually review/delete suspicious rows (e.g. the May 2025 point)

**Audit fixes:** £0-buy-price items no longer rank +Infinity% (performers/health/holdings displays guarded); `escHtml` added to 5 unescaped innerHTML sinks (health signal titles, sold-item options); NaN guard on health totals; **local dates everywhere** — `todayStr()` and new `localDateStr()` replace all `toISOString().split('T')[0]` sites (UTC meant midnight–1am BST stamped yesterday's date on snapshots/value points/prefilled dates)

**Storage batching (electron-store rewrites the WHOLE file per set):**
- Price log batch mode: bulk refresh loops wrap in `beginPriceLogBatch()`/`flushPriceLogBatch()` (in `finally`) — N per-item writes → 1. Single-item refreshes unchanged
- `saveData(holdings)` in bulk loops throttled to every 10th item + guaranteed final save; play-skins bulk refresh defers to one `saveSkins` via new `mergeSkinPrices(skin, prices, deferSave)` param (atomic re-read merge unchanged)
- **`cs2vault_steam_history` split into its own store file** (`cs2vault-history.json`) — main-process routing via `storeFor(key)`, one-shot migration on launch (console logs `[Store] Migrated cs2vault_steam_history`), renderer code untouched. `fetchAllSteamHistory` saves every 10 items instead of every item

**Backups now complete + restorable:**
- `exportAllData` adds `priceLog`, `steamHistory`, `caseSupply` (previously a restore silently lost all sparklines/trends). API keys deliberately never exported
- New **`importAllData()`** + "↑ Restore From Backup" Settings button — the restore half never existed. Full-replace semantics: mapped keys overwritten, keys absent from the backup deleted, EXCEPT the licence trio (`cs2vault_licence`/`_licence_state`/`_trial_start`) which is never deleted (matches clearAllData convention — restoring a pre-purchase backup must not sign a paying user out of Pro). Validates file shape, shows a content summary before the final confirm, awaits all writes, then `location.reload()`. `import:open` IPC gained optional caller filters (backwards compatible with the CSV import caller)

**Delivery note:** this zip included `src/main.js` + `src/preload.js` for the first time. Offline harnesses this session: routing 6/6, benchmark/cleanup 12/12, batching/restore 14/14; `node -c` clean on all three JS files.


### Website — all 10 jurisdiction tax guides live + Cloudflare Pages deployed ✅ (website-only, no version)
The MARKETING.md Lane 3 content site is complete and **live at https://cs2vault.app/** (custom domain attached to the Cloudflare Pages project Jul 2026; `cs2vault-electron.pages.dev` remains as a working alias but nothing links to it). Git-integrated: every push to `main` auto-deploys the `website/` output directory — deploy = push.

- **Guide batches 2+3 (Jul 2026)**: 7 new guide pages — `website/guides/ca|au|se|fi|no|dk|pl/index.html` — joining UK/US/DE from batch 1. Guides hub (`website/guides/index.html`) now shows **all 10 jurisdictions live, zero "coming soon"**. Every figure verified against primary government sources at write time (CRA/Canada.ca, ATO, Skatteverket, Vero.fi, Skatteetaten, Skattestyrelsen/skat.dk + Jun-2025 Supreme Court ruling, PL art. 30b/PIT-38 references); all pages carry the "verified July 2026" footer and the standard estimates-not-tax-advice block. CA guide reflects the v3.6.1 investor classification (no floor, losses deductible, PUP + business-income disclosed)
- **Flags from the batch-2+3 verification pass** (for the launch-month re-verify): (1) **AU loss ordering** — ATO applies capital losses *before* the 50% discount; the engine's per-disposal path discounts gains then subtracts full losses, which can under-state tax in long-gains-only loss years (guides teach the correct ATO ordering); (2) **DK loss asymmetry is now settled law** (Jun 2025 Supreme Court: gains = personal income up to ~52%, losses = ~26% assessed deduction, no cross-holding netting) — app pools and discloses; DK guide tells users to file from gross per-disposal figures; (3) **AU 2027 reform confirmed** — 2026 budget replaces the CGT discount with cost-base indexation + a new capital-gains rate from 1 Jul 2027; AU profile + guide are current pre-July-2027 rules and MUST be re-verified next year
- **Paddle website prerequisite is now satisfied**: `/pricing`, `/terms`, `/privacy`, `/refund` are publicly hosted on a verified-able domain (now on the custom domain **https://cs2vault.app** — even better for Paddle domain verification than the `.pages.dev` subdomain)
- ✅ **Domain decision resolved (Jul 2026): final domain is https://cs2vault.app**. `canonical` + `og:url` tags added to **all 16 pages** (landing, /pricing, /terms, /privacy, /refund, /guides/ hub, all 10 guide pages) using the trailing-slash directory URLs the site serves. `website/sitemap.xml` (all 16 URLs on the final domain) and `website/robots.txt` (allow all, points at the sitemap) added in the same pass — submit the sitemap in Google Search Console when convenient. No content in `website/` ever linked to the `.pages.dev` URL, so no swaps were needed; DEPLOY-WEBSITE.md carries a status note recording the custom domain
- **Security & Open Source page (Jul 2026)** — `website/security/index.html` (`https://cs2vault.app/security/`), shipped with the stay-public decision (Launch Gate item 9). Makes the local-first + open-source case deliberately: data never leaves the machine, repo linked for auditing, Phase 6 Steam-credential handling described accurately (login in main process, refresh token only via Electron `safeStorage`/DPAPI, password never stored, Steam Guard intact), Paddle payment isolation, and an honest-limits section (no "unhackable" claims; not-a-warranty disclaimer). Footer "Security" link added after Refunds on all 16 existing pages; sitemap.xml now lists 17 URLs; canonical + og:url on the new page
- Website-only convention (unchanged): no version bump, no tag; deploy via `git add . && git commit && git push`

### v3.6.1 — Canada loss-classification resolved: investor = ordinary capital property (PUP floor removed) ✅
Resolves the classification deferred from v3.3.3. **Decision (signed off, CRA primary sources):** skins held via CS2 Vault are investment holdings, so they are **ordinary capital property**, not personal-use property — ITA s.54's PUP definition is a *use* test ("used primarily for the personal use or enjoyment of the taxpayer"), which investment holdings fail. CRA's 2023 STEP Roundtable answer (2023-0961341C6) confirms the flip side: property merely stored/held for sale is not PUP, s.46(1) doesn't apply, and losses are deductible normally. The old code was an incoherent hybrid (applied the s.46 $1,000 floor *and* deducted losses, wrong under both readings); this pass makes it self-consistent under the investor reading.

- **`TAX_PROFILES.CA`**: `pupFloor: 1000` **removed** (with an in-code classification comment citing s.54 / s.46(1) / s.40(2)(g)(iii)). `inclusionRate: 0.5`, ACB pooling, deductible losses unchanged — `rollup()` already nets losses against gains, so no engine logic was added, only the floor removed
- **`calculateCGTWithTaxCurrency()`**: the generic `pupFloor` branch + per-disposal `pupApplied` flag deleted (grossTax/costBasisTax back to `const`); `renderCGTSummary()` `pupAppliedCount` + "$1,000 PUP floor applied to N disposals" footer line deleted; `exportCGTReport()` PUP-floor row deleted. All were guarded on `profile.pupFloor`, so the other 9 profiles are untouched
- **New CA disclaimer** states the ordinary-capital-property basis confidently, then discloses (not models): the alternative PUP reading ($1,000 floor, losses deemed nil per s.40(2)(g)(iii), LPP losses ring-fenced to LPP gains) for genuinely enjoyment-held skins, and the business-income risk (100% inclusion) for habitual business-like flipping. `knownLimits` swapped to match. This **closes the separate "LPP loss ring-fencing" backlog item** — LPP is a subset of PUP, so under the investor classification it cannot apply; it lives on as disclosure only
- **Website copy**: the two CA rule lines (`website/index.html` hero jurisdictions grid, `website/guides/index.html` hub card) updated from "$1,000 personal-use-property floor" to "investor capital-property treatment (losses deductible)". No CA guide page exists yet — when the CA guide ships (sessions 2–4 batches), include the classification rationale + both alternative readings
- **Tests**: `test-tax-engine.js` CA block rewritten — 15 assertions: floor removed, real gain/loss on cheap disposals (no fake $0s), loss-offsets-gain → 50% inclusion ($1,000 − $300 → $350 taxable), net-loss year → 0, and disclaimer/knownLimits content (ordinary-capital basis, losses deductible, PUP + LPP + business-income disclosures). **87/87 passing** (was 73). `node -c` clean on both files
- ⚠ **Behaviour change for any CA user**: small disposals that previously netted to $0 under the floor now show their real gains/losses, and cheap-cost items no longer get a deemed $1,000 cost basis (gains can be LARGER). This is the correct investor treatment
- Launch-month re-verify note: CA re-check now covers the 50% inclusion rate + this classification (confirm no CRA guidance on digital collectibles has landed since Jul 2026)

### v3.6.0 — Steam floating-inventory import (Phase 5) ✅
**Pre-launch acquisition feature per LAUNCH-PLAN.md — free tier, no `isPro()` gate.** Pulls the user's public floating CS2 inventory via Steam's community endpoint and merges it into Holdings with a dedupe/merge preview. No tax-engine, pricing-logic, or payments changes.

- **New "⇩ Steam Import" button** on the Holdings toolbar (next to Import CSV) opens `steamImportModal` — a two-step flow:
  - **Step 1 — identify the account.** Accepts a bare SteamID64, a `/profiles/…` URL, a `/id/…` URL, or a bare vanity name (`parseSteamIdInput`). Vanity names resolve to SteamID64 via the no-key profile XML endpoint (`https://steamcommunity.com/id/{vanity}/?xml=1`, `resolveSteamVanity`). Last-used input is remembered in the new **`cs2vault_steam_id`** key and prefilled next time
  - **Step 2 — dedupe/merge preview** (nothing saved until Import Selected). Per-row: include checkbox, item name, status badge (**NEW** / **+N MORE** / **TRACKED**), editable type select, editable qty, per-row buy-price override. A defaults bar sets **default buy price + currency + buy date** applied to every row without an override (Steam doesn't know buy prices). Currency select is registered in `populateCcySelects` so the free-tier GBP lock applies (multi-currency entry stays Pro)
- **Inventory fetch** (`fetchSteamInventory`): public endpoint `/inventory/{steamId64}/730/2?l=english&count=2000` via `window.cs2vault.fetch` (never browser fetch), **paginated** with `more_items`/`last_assetid` (`start_assetid` param), 1.5s delay between pages, capped at 10 pages (20k items, `truncated` flagged). **Errors surfaced as clear toasts**: 403 or literal `"null"` body → "inventory is private" (with the fix: set inventory privacy to Public), 429 → rate-limited/try again, parse/network → generic failure. Items grouped by `market_hash_name` with summed quantities; **non-marketable items skipped** (medals, coins, storage-unit containers themselves) and counted in the status line
- **Type inference reuses `inferTypeFromSteamResult(item, 'holding')`** — each description's Steam `type` string + hash maps to case/sticker/skin/knife/armory, editable per row in the preview
- **Dedupe/merge semantics** (matched by `marketHash` or exact name, case-insensitive, against a fresh `loadData()` read):
  - No match → **NEW**, ticked, full Steam qty
  - Match with Steam qty > tracked qty → **+N MORE**, ticked, qty prefilled to the *difference*; on import the units are **merged into the existing holding as a new lot** (`ensureLots` → `makeLot` push → `recalcHoldingFromLots`, same pattern as top-up), with a note appended and an **edit** logged with a before→after diff
  - Match fully covered → **TRACKED**, unticked by default (still importable manually)
- **Full lot data + FX provenance on every import** — per-unit entered price converts to base GBP at the chosen buy date via `toBaseGBP` (one rate for the whole batch — single currency+date, historical rates cached permanently); items carry `origCurrency`/`origAmount`/`fxRate` + `lots[]` exactly like the v3.4.1 `importCSV` path. New items log an **add** to the activity log; merges log an **edit**
- **Atomic write**: `loadData()` re-read immediately before mutating, single `saveData()` at the end (v2.4.3 pattern)
- **Known limit documented in-app (step 1 of the modal): items inside Storage Units are invisible to this endpoint** — only the floating inventory imports. Storage-unit import is Phase 6 (Pro, GC session)
- Preview rows built with `createElement`/`textContent` (injection-safe — hash names can contain quotes/`<`)
- `cs2vault_steam_id` registered in **`STORE_KEYS`** (index.html, 23 keys now), `exportAllData` backup, and `clearAllData`
- Offline harness (`/tmp` scratch, 21/21): input parsing (ID64/URLs/vanity/garbage), vanity resolution + not-found, private (403 and `"null"` body), 429, two-page pagination with cross-page quantity grouping, non-marketable skip, type inference, and merge maths (lot append → weighted-average recalc). Tax-engine harness still **73/73**. `node -c src/app.js` clean

### v3.5.1 — Value chart split: Steam/CSFloat → Invested vs Unrealised P&L ✅
The line under the Portfolio Value header originally showed a **Steam £X / CSFloat £Y** split. This was misleading: it was a *pricing-source* breakdown (which platform drives each item's P&L price — Steam for cases/stickers/TUF/agents, CSFloat for everything else), not a cross-platform value comparison. For a case/sticker-heavy portfolio it dumped ~98% of value into the "Steam" bucket, reading like the CSFloat value was wrong. Replaced with the more useful **Invested £X · ▲ Unrealised P&L ±£Y** line.

- New shared helper **`_valueSplitHtml(invested, value)`** renders the line: muted-grey "Invested" figure + a colour-coded (green ▲ up / red ▼ down) "Unrealised P&L" figure. Called from both `renderValueChart()` branches (the <2-points empty state via live `computeValueSplit()`, and the main chart via the latest stored point)
- **No data migration** — every value-history point has stored `invested` since v3.5.0, so the P&L line works on existing daily points and the seeded monthly points immediately
- CSS: `.vc-split-steam`/`.vc-split-csfloat` replaced by `.vc-split-invested` (grey) + `.vc-split-pnl` (P&L colour set inline). `node -c src/app.js` clean

### v3.5.0 — Portfolio Value over-time chart (Skin Ledger-style) ✅
A clean, dense **value-over-time area chart** at the top of the Analytics tab (replacing the top of the old Portfolio History section), modelled on Skin Ledger's portfolio view. **Free-tier feature — no `isPro()` gate** (matches Skin Ledger, where this is free; the moat stays the tax engine). No tax-engine, pricing, or payments changes.

- **New daily value-history series** (`cs2vault_value_history` key) — one value-only point per calendar day: `{ date, steam, csfloat, value, invested }`. Captured automatically on every app launch (`recordValueSnapshot()` in initApp) and again after any full price refresh, so the point reflects the latest prices. Deduped per day (latest write wins), capped at **730 days** (`VALUE_HISTORY_MAX`), pruned on launch
- **Big value header + range toggle** — current value in large type, period delta colour-coded (green up / red down) with %, and a **1 / 7 / 30 / 90 / 180 / 365 / All** day range toggle (`setValueRange()`, default 365). Delta is computed over the *visible range*, not all-time
- **Filled green area line** (Chart.js) in the app's colourway — gradient fill, green when up / red when down over the range, hover tooltip showing value at each date
- **Seeded from existing monthly snapshots** (`seedValueHistoryFromSnapshots()`, runs once, idempotent via a `seeded` flag) so the 365/All ranges aren't empty on first run — the developer's historical case figures populate immediately. Short ranges (1/7/30) fill in densely over the first weeks of real use (it does NOT fabricate daily points it never recorded)
- **Helpers**: `loadValueHistory`/`saveValueHistory`, `computeValueSplit()` (value by pricing platform + invested), `recordValueSnapshot()`, `seedValueHistoryFromSnapshots()`, `pruneValueHistory()`, `setValueRange()`, `_valueRangeSlice()`, `renderValueChart()`. New `valueChart` Chart.js instance + `currentValueRange` state
- **Kept the old Portfolio History below it** — monthly snapshots, benchmark comparison (S&P/BTC/Gold indexed), CS2 event overlays, and the snapshot table are untouched (they do a different job: indexed apples-to-apples benchmarking). Only the section header/order changed
- Registered `cs2vault_value_history` in `STORE_KEYS` (index.html, 22 keys now), `exportAllData` backup, and `clearAllData`. `node -c src/app.js` clean
- ⚠ **Note (v3.5.0 only, superseded by v3.5.1):** the header sub-line originally showed a Steam/CSFloat pricing-source split, which read as misleading — replaced with Invested vs Unrealised P&L in v3.5.1 (see above)

### v3.4.2 — Steam priceoverview 429 retry + backoff (blank cheap-sticker prices) ✅
Cheap, high-volume stickers intermittently showed no Steam price (— in the Steam column). Root cause: Steam's `priceoverview` endpoint returns HTTP 429 (rate limited) under bulk refresh, and the HTML-listing-page fallback is unreliable for these items, so a transient 429 left the price blank. Fix: `priceoverview` lookups now **retry with backoff on 429**, and the broken HTML fallback is **skipped on persistent 429** rather than attempted (it was returning bad data and burning request budget). No data-model change; pricing path only. `node -c src/app.js` clean.

### v3.4.1 — Activity log wired into CSV import + top-up (were unlogged) ✅
Two data-entry paths were bypassing the v3.4.0 activity log: items added via **"Add to Position"** (the top-up modal) and via **CSV import**. Both now log correctly. `saveTopup` records an **edit** with a before→after diff; `importCSV` records an **add** per imported item, and also writes full **FX provenance** (`origCurrency`/`origAmount`/`fxRate`) + lot data on imported items so they match manually-added items. `node -c src/app.js` clean.

### v3.4.0 — Activity Log for manual entries (Holdings + Play Skins) ✅
A persistent, read-only record of manual data entry so a fat-fingered price/qty/name can be spotted after the fact. **Free-tier tracker feature — no `isPro()` gate. No tax-engine, pricing, or payments changes.**

- New **📋 Log** button in the Holdings toolbar (next to ☑ Select) opens `activityLogModal` — entries newest-first, with a search box (matches name / market hash / action / scope), **Export CSV**, and **Clear Log** (wipes only the log, never holdings/skins; double-confirmed)
- **Logged events**: add / edit / delete on **holdings** *and* **play skins**. Edits record a field-level **before→after diff** (name, type, qty, buy price, currency, buy date, market hash) — the diff is where mistypes show up (e.g. `Buy price: 12.5 → 1.25`). Wired into `saveItem`, `deleteItem`, `bulkDeleteSelected`, `saveBulkEdit` (logs Type/TUF/Category changes), `saveSkin`, `deleteSkin`. **Sells are NOT logged** — Trade History already covers disposals
- **Storage**: new `cs2vault_activity_log` key, stored newest-first, **capped at 500 events** and pruned on each write. Snapshot stores the user-meaningful fields only. Added to `STORE_KEYS`, the backup export (`exportAllData`), and `clearAllData`
- Helpers: `logActivity(action, scope, snapshot, diff)`, `_logSnapshot()`, `_logDiff()`, `loadActivityLog()`/`saveActivityLog()`, plus modal fns `openActivityLog` / `renderActivityLog` / `filterActivityLog` / `clearActivityLog` / `exportActivityLog`. Log rows built with `createElement`/`textContent` (no innerHTML) so item names with quotes/`<` are injection-safe
- **Not retroactive** — only records events from v3.4.0 onward. `node -c src/app.js` clean

### v3.3.4 — Holdings checkbox hidden behind a Select toggle (UI) ✅
The bulk-select checkbox column on the Holdings table was always visible, cluttering every row. It's now hidden by default and revealed only when bulk-selecting.

- New **☑ Select** button in the Holdings toolbar (next to *Show Heatmap*) toggles a `.bulk-mode` class on `#holdingsTable`. Off by default → the checkbox column (header `bulkAllCb` + per-row `.bulk-cb`, both now tagged `.bulk-col`) is collapsed via CSS (`display:none`, zero width/padding). On → checkboxes appear and the button flips to **✕ Done**
- Exiting select mode calls `bulkClearSelection()`, so leaving the mode drops any selection and hides the bulk action bar. Selecting rows / select-all / Bulk Edit / Delete / Clear are otherwise unchanged
- Pure UI: no data-model, pricing, or tax-engine changes. `_bulkMode` state lives in app.js alongside the existing `_bulkSel`. `node -c src/app.js` clean

### v3.3.3 — Finland Proceeds-Cliff Fix + PL/US Disclaimer Corrections (tax-engine correctness) ✅
Acts on the primary-source verification pass (`09-tax-rules-verification.md`, 14 Jun 2026), which checked all 10 jurisdictions against the actual government tax authorities. **Engine + disclaimers only — the gating layer (`FEATURES`/`isPro()`) and the payments layer (v3.3.0) are untouched.** Back-compat return shape of `calculateCGT()` preserved. The verification found exactly **one genuine under-statement bug (Finland)**; the rest were wording/scope, and two flagged "criticals" (Norway 22% no-1.72-uplift, Canada 50% inclusion) were confirmed **already correct** in the code.

- **🔴 Finland €1,000 exemption is now a PROCEEDS cliff, not a gains cliff (the one real bug).** Per TVL §48.6 the small-sales exemption makes gains tax-free only if **total annual sale PROCEEDS ≤ €1,000** — not if the *gain* is ≤ €1,000. The old `allowanceIsCliff` modelling under-stated tax for high-turnover/low-margin sellers (a €900 gain on €8,000 of sales was wrongly exempt; it is taxable in Finland). Fixed with a new **`allowanceIsProceedsCliff`** flag on the FI profile (replacing `allowanceIsCliff`):
  - `_applyExemption(netGain, profile, proceedsTotal)` and `_exemptionUsed(netGain, profile, proceedsTotal)` gained an **optional third arg**. For a proceeds cliff the tax-free decision keys off `proceedsTotal` (≤ allowance → whole gain tax-free; above → whole gain taxable); the DE gains-cliff and UK deductible-allowance regimes are byte-identical and ignore the new arg
  - **Proceeds threaded through all five exemption call sites**: sync `rollup()` (accumulates `totalProceeds` from each taxable disposal's `gross`, now also returned in the rollup object), async `renderCGTSummary()` tax-currency path (sums `taxFx[id].grossTax` → real **EUR** proceeds), `exportCGTReport()` (EUR proceeds + a "Total Sale Proceeds" / "Exemption Status" row pair), and `updateCashOutCalc()` (feeds year proceeds + the hypothetical cash-out's proceeds)
  - **UI**: FI summary card relabelled "Small-Sales Exemption (proceeds)" with a proceeds-aware status note ("proceeds within/over €1,000 — gains tax-free/taxable"); the cash-out calc shows "Small-sales exemption (proceeds) · €1,000 proceeds cap"; the CGT report shows the proceeds total + exemption status
  - FI disclaimer + knownLimits rewritten: the exemption is now described correctly as proceeds-based (TVL §48.6) and **no longer hedged as an approximation** (it tracks real proceeds). The deemed-acquisition-cost (hankintameno-olettama) omission and the partial-view limitation remain disclosed
  - ⚠ **Known seam (acceptable):** the sync GBP `rollup()` compares GBP proceeds against the €1,000 literal (a back-compat approximation — at ~£1k≈€1.17k it's slightly looser); the **async EUR path is exact** and is what every FI-visible surface (summary, report, badges, cash-out) actually renders. Not worth fixing unless the sync GBP figure is ever surfaced for FI
- **Poland loss/cost carry-forward wording corrected** — the disclaimer said "5-year same-source carry-forward (with annual caps)", which is the **shares** rule mis-attributed. For crypto-like income, excess acquisition costs roll into the **next year's costs with no 5-year cap** (income floored at zero, so a "loss" can't arise). Disclaimer + knownLimits rewritten; knownLimits now also notes FIFO is a label only (PL pools all in-year costs against proceeds, no lot-matching). No calc change (carry-forward was never modelled either way)
- **US 1099-K threshold added** — the disclaimer now states the federal reporting threshold **reverted to $20,000 AND 200+ transactions** (OBBB Act, 2025 onward) with a note that states may set lower thresholds. Previously cited no figure (so not wrong, just incomplete). Disclosure only — no calc impact
- **Denmark — no change needed.** The verification flagged a stale "+ AM-bidrag" note, but the shipped code never had an AM-bidrag reference (that flag was against the old spec, not the source). Confirmed clean
- **Canada — deliberately deferred.** The verification's substantive CA finding (the app pools all gains *and* losses, fitting neither the PUP-floor-with-denied-losses nor the investor-ordinary-capital-property reading cleanly, which can under-state tax) is a real classification decision but was **scoped out this pass** — small CA CS2 market, low priority. Revisit if a CA customer asks. The $1,000 PUP floor and 50% inclusion (both confirmed correct) are unchanged. *(Historical note: resolved in v3.6.1 — investor = ordinary capital property, floor removed.)*
- **Offline tests** (`test-tax-engine.js`, **73/73 passing**, up from 63) — the 10 old FI gains-cliff assertions replaced with 16 proceeds-cliff cases: the headline bug fix (€900 gain / €8,000 proceeds → €900 taxable), proceeds within/at/over the €1,000 cap, the defensive no-proceeds-arg path, and `_exemptionUsed` proceeds tracking; plus three explicit guards that the **DE gains cliff and UK deductible allowance are unaffected** by the new third arg. The harness's helper-extraction was also hardened from fixed line-counts to **brace-aware slicing** (`fnEnd()`), so it no longer silently truncates when a helper grows. All v3.1.1 + v3.2.0 regressions stay green
- `node -c src/app.js` clean
- ⚠ **The launch-month primary-source re-verification of ALL 10 jurisdictions is still the #1 correctness gate** — separate from these specific fixes. `09-tax-rules-verification.md` confirmed today's figures, but allowances/bands shift each tax year, so re-check in the actual launch month (see Known Issues)

### v3.3.2 — CI build fix (empty CSC_LINK) ✅
The v3.3.1 build got past the config-validation error and packaged the app, then failed at the signing stage: `Env WIN_CSC_LINK is not correct, cannot resolve: …\cs2vault-electron not a file`. Cause: the workflow always passed `CSC_LINK: ${{ secrets.CSC_LINK }}` to electron-builder, but the signing-cert secret isn't set yet, so it resolved to an **empty string** — and electron-builder treats an empty `CSC_LINK` as "a cert path was given but is blank" (not the same as unset) and tries to resolve it as a file. Fix: the workflow now computes a job-level `HAS_CSC` flag from the secret and runs **two mutually exclusive build steps** — "Build and publish (signed)" (only when `CSC_LINK` is set) and "Build and publish (unsigned)" (otherwise). With no cert yet, only the unsigned step runs and no empty `CSC_LINK` is ever passed. (`secrets` can't be used in a step `if:`, so it's surfaced via `env` first.) Adding the `CSC_LINK`/`CSC_KEY_PASSWORD` secrets later flips it to signed builds with no further edits. No app-code change; CODE-SIGNING.md updated.

### v3.3.1 — CI build fix (signtoolOptions) ✅
The v3.3.0 GitHub Actions build failed: `configuration.win has an unknown property 'signtoolOptions'`. That property doesn't exist in electron-builder **24.13.3** (it's a newer-version key), so the whole config was rejected and the build died before producing an installer. Fix: removed the `signtoolOptions` block from `package.json` entirely. It was never required — electron-builder auto-signs from the `CSC_LINK` / `CSC_KEY_PASSWORD` env vars (set as GitHub secrets) on its own, so no signing capability is lost. Docs (`CODE-SIGNING.md`, STATE.md) updated to drop the stale reference. No app-code change; v3.3.0's payments/licensing layer is unchanged.

### v3.3.0 — Payments, Licensing & Code Signing (Vault Pro Phase 4b) ✅
**The monetisation layer — turns the finished tax engine into a sellable product.** Plugs real Paddle payments + licence validation in *behind* the existing `isPro()` check. **Payments-only: the tax engine (through v3.2.0) and the v3.1.0 gating framework (`FEATURES`/`isPro()` callers) are untouched.** `isPro()`'s body is the single swap point — it now checks, in order: dev override → validated Paddle licence (within offline grace) → in-date trial. All ~15 gated call sites are unchanged.

- **🔴 Latent persistence bug fixed (prerequisite for everything else).** The inline `STORE_KEYS` array in `index.html` loaded only **7 of the 20 keys** the app actually reads — so `cs2vault_pro_override`, `cs2vault_tax_jurisdiction`, `cs2vault_display_currency`, `cs2vault_cost_basis_method`, `cs2vault_onboarded`, `cs2vault_install_state`, `cs2vault_fx_cache`, `cs2vault_autorefresh`, `cs2vault_pricempire_key`, `cs2vault_price_log`, `cs2vault_steam_history`, `cs2vault_case_supply` were **written to disk but never reloaded on the next launch** — they only existed after an in-session write. This silently reset the Pro override, tax jurisdiction, display currency and onboarding flag on every restart. `STORE_KEYS` now loads the full set (incl. the three new Phase 4b licence keys). Without this, a persisted licence token would vanish on relaunch and drop a paying user back to free tier
- **Single pricing config constant** — `PRO_CONFIG` (one block in `src/app.js`) is the only place anything payment-related is configured: Paddle token + environment, monthly/annual price IDs, the Cloudflare Worker URL, display-only price strings, and trial/grace/revalidation knobs. **No charge amount is hardcoded** anywhere — the real price lives in the Paddle dashboard; `PRO_CONFIG` carries display strings only. `proConfigured()` / `licenceApiReady()` gate the UI on whether Rudi has filled it in
- **Paddle checkout** (`startProCheckout(plan)`) — opens Paddle's hosted checkout in the user's browser via the existing `shell.openExternal` window-open handler (no Paddle.js bundled → CSP unchanged). Monthly/annual buttons in Settings → Vault Pro. Until `PRO_CONFIG` is filled in, the buttons are hidden and a "not configured — see PADDLE-SETUP.md" notice shows instead; the dev override still unlocks Pro for evaluation
- **Licence validation + 14-day offline grace** (`validateLicence`, `_licenceIsActive`, `refreshLicenceIfDue`) — the app calls the Cloudflare Worker (`GET {licenceApiBase}/validate?key=…&product=cs2vault`), which answers `{ active, plan, cancelledAt }`. Result cached locally in `cs2vault_licence_state` with a `checkedAt` timestamp. **A network failure NEVER downgrades a previously-active user inside the grace window** — that's the whole point. Re-validates at most once per `revalidateHours` (24h) on launch, fire-and-forget, never blocks the UI. If no Worker URL is set yet, a pasted key is accepted locally as `pending` so Rudi isn't blocked during setup
- **14-day no-card trial** (`ensureTrialStarted`, `trialDaysLeft`, `_trialIsActive`) — starts automatically on a genuinely fresh install (gated on `isFreshInstall()`), stored as an ISO date in `cs2vault_trial_start`. Honour-system (local clock; acceptable for a solo indie product). The tier badge shows `PRO · TRIAL` and the status line shows days remaining
- **Licence activation UI** (Settings → Vault Pro) — paste-key field with **Activate** / **Remove** buttons (`activateLicenceFromInput`, `deactivateLicence`), a live status line (`syncLicenceUI` → `licenceStatusLine`) that distinguishes override / active licence / trial / grace-expired / trial-expired / free, and the dev override toggle (kept, now clearly labelled "always wins — leave OFF to see your real tier"). `proStatus()` is the single source of truth for which of these is active
- **Licence preserved on Clear All Data** — `cs2vault_licence` / `cs2vault_licence_state` / `cs2vault_trial_start` are deliberately NOT wiped by Clear All Data (wiping a paid licence on a data-clear would lock a customer out of their own purchase). Use Settings → Remove licence to sign out of Pro on a machine. All three ARE included in the JSON backup export
- **Cloudflare Worker** (`worker/licence-worker.js` + `wrangler.toml` + `DEPLOY.md`) — **separate file, does NOT run in the Electron app.** Receives Paddle webhooks (`subscription.*`, `transaction.completed`, payment-failed), verifies the `Paddle-Signature` HMAC-SHA256, and upserts paid state into a KV namespace keyed by licence key. Answers the app's `/validate` check. Free-tier Cloudflare Workers (100k req/day) covers this comfortably
- **Code signing wired into CI** — `.github/workflows/build.yml` now passes `CSC_LINK` / `CSC_KEY_PASSWORD` from GitHub secrets; electron-builder auto-signs **when the secrets exist** and builds unsigned (but succeeds) until then. electron-builder auto-signs from the env vars with no extra `package.json` config (an earlier `signtoolOptions` key was removed in v3.3.1 — unsupported by electron-builder 24.13.3). EV-cert path (cloud HSM e.g. Azure Trusted Signing) documented separately — EV certs can't be exported as a `.pfx` so they need a custom `win.sign` hook, not `CSC_LINK`
- **Privacy Policy + Terms of Service** (`legal/privacy.html`, `legal/terms.html`) — themed to match the app, bundled into the package (`files` now includes `legal/**/*`), opened via Settings → About & Legal (`openLegal`). Templates with `[ACTION REQUIRED]` markers for Rudi's legal name + governing-law jurisdiction; both carry the "estimates, not tax advice" disclaimer prominently
- **Setup docs** — `PADDLE-SETUP.md` (account → product/prices → token → fill `PRO_CONFIG` → wire Worker → webhook + email checklist) and `CODE-SIGNING.md` (OV vs EV, base64-pfx → secrets, EV/cloud-HSM hook). Both written for a non-code-literate solo dev
- ⚠ **External prerequisites Rudi must obtain before the first paid sale** (code is built to the boundary for each): (1) **Paddle account** (seller approval can take days) → paste token + price IDs into `PRO_CONFIG`; (2) **Cloudflare Worker deploy** → paste URL into `PRO_CONFIG.licenceApiBase`; (3) **code-signing cert** (~£200–400/yr) → add `CSC_LINK`/`CSC_KEY_PASSWORD` secrets; (4) **finalise the price** in Paddle and update the two `*Display` strings. See PADDLE-SETUP.md / worker/DEPLOY.md / CODE-SIGNING.md
- ⚠ **TAX FIGURES STILL NEED PRIMARY-SOURCE RE-VERIFICATION BEFORE THE FIRST PAID SALE.** All 10 jurisdictions' rates/thresholds/rules (v3.0.0–v3.2.0) were implemented from secondary sources. Now that payments are wired, this is the last correctness gate before charging anyone — re-check every figure against primary government pages (HMRC, IRS, BZSt, CRA, Skatteverket, KAS, ATO, Skatteetaten, Skattestyrelsen, Vero.fi) in the actual launch month. See the carried-forward caveat in Known Issues
- `node -c src/app.js` clean; new function names verified wired to their HTML handlers; Worker JS syntax-checked

### v3.2.0 — Six New Tax Jurisdictions (Sweden, Poland, Australia, Norway, Denmark, Finland) ✅
Expands the `TAX_PROFILES` engine from 4 → **10 jurisdictions**, targeting the biggest CS2 player markets missing from launch. **Engine + Settings/onboarding dropdowns only — the v3.1.0 gating layer (`FEATURES`/`isPro()`) is untouched** (all new jurisdictions are Pro, gated by the existing `multiJurisdiction` feature flag, same as US/DE/CA). Back-compat return shape of `calculateCGT()` preserved. **Every figure was sourced from current (2026) tax references during the build** — see the re-verify caveat in Known Issues.

- **Sweden (SE)** — SEK, calendar year, **flat 30%** on capital gains (kapitalvinst), no holding-period rule, no allowance for this asset class. Pooling (genomsnittsmetoden) default. Disclaimer notes the simplified loss-deductibility (Sweden restricts non-share loss offset to ~70%; app pools in full)
- **Poland (PL)** — PLN, calendar year, **flat 19%**, no holding-period rule. The general personal tax-free amount explicitly does NOT apply to capital gains. FIFO default. Disclaimer notes the 5-year same-source loss carry-forward is not modelled
- **Australia (AU)** — AUD, **1 Jul–30 Jun tax year** (new `taxYearStart`/`taxYearLabel` logic), indicative marginal rate, **50% CGT discount gated on >12-month holding period**. This needed a new engine path: **`perDisposalInclusion: true`** — inclusion is decided PER DISPOSAL via `classifyGain` (returns `inclusion: 0.5` for >12mo, `1` for ≤12mo or unknown-acq-date, the latter flagged), not a flat profile `inclusionRate` like CA. The rollup, `renderCGTSummary`, and `exportCGTReport` all gained a per-disposal-inclusion branch (gains discounted, losses applied in full, summed, floored at 0). Holding-period report columns (Acq/Holding/Classification) now show for AU too. Disclaimer notes the $10,000 personal-use-asset exemption is NOT applied (low-value items may be over-counted) and the 2027 indexation reform is not yet modelled (this profile is the current pre-July-2027 rules)
- **Norway (NO)** — NOK, calendar year, **flat 22%**. Critical classification call: skins are treated as a **general (crypto-like) asset at 22%**, NOT a share — so the **1.72 upward adjustment factor** (which pushes shares/dividends to an effective 37.84%) does NOT apply. Disclaimer + knownLimits flag this classification explicitly so it can be revisited if the tax office treats skins as a financial instrument. FIFO default
- **Denmark (DK)** — DKK, calendar year. The messiest profile: Denmark taxes speculative personal-asset gains (the crypto/skins category) as **PERSONAL INCOME at the user's marginal rate, up to ~52%** — there is no clean flat rate the app can compute. Modelled with an **indicative 42%** and an emphatic disclaimer that the real rate is marginal and the app can't know the bracket. Strict same-asset loss rules are disclosed (not modelled — app pools). FIFO default
- **Finland (FI)** — EUR, calendar year, **two-tier 30% (up to €30,000 capital income) / 34% (above)** — a new rate shape (`rates: { lower, upper, threshold }`) wired into the rollup, summary, and report tax estimates. The **€1,000 small-sales exemption** (really on TOTAL annual proceeds) was *originally* approximated as a **gains cliff** reusing the DE `allowanceIsCliff` machinery; the proceeds-vs-gains nuance and the deemed-acquisition-cost (hankintameno-olettama) option were disclosed as known limits. FIFO default. **⚠ Superseded by v3.3.3** — the gains-cliff approximation was a real under-statement bug and is now a correct **proceeds cliff** (`allowanceIsProceedsCliff`); see v3.3.3 above
- **Engine additions (all back-compat):**
  - `perDisposalInclusion` profile flag → per-disposal inclusion weighting in `rollup()`, `renderCGTSummary()` (async tax-currency path), and `exportCGTReport()`. CA's flat `inclusionRate: 0.5` path is byte-identical (it doesn't set the flag), and UK/US/DE are untouched
  - FI two-tier rate branch in all three tax-estimate sites
  - `_rateBandLabel()` extended for AU/FI/NO/DK (SE/PL fall through to the generic flat-rate label)
  - `JURISDICTION_METHODS` map gained AU/SE/NO/FI/DK/PL defaults (so `setTaxJurisdiction` accepts them and picks a sensible cost-basis method)
  - `showHP` (holding-period report columns) extended to AU
  - Settings + onboarding jurisdiction dropdowns gained all six (onboarding hint reworded: "all other jurisdictions are Pro")
- **Offline tests** (`test-tax-engine.js`, extended to **63/63 passing**) — the v3.1.1 regressions (DE cliff, UK deductible allowance, CA floor, UK 18/24%) stay green, plus: SE 30% / PL 19% / NO 22% rates and currencies; AU tax-year boundary (Aug→2026-07-01, Mar→2025-07-01), AU per-disposal inclusion (long $1,000→$500 taxable, short $1,000→$1,000, mixed→$900, gain+loss→$200), AU unknown-date conservative full inclusion + flag; FI cliff boundaries (€999 vs €1,000) and two-tier maths (€20k→€6,000, €50k→€15,800, €30k→€9,000); NO disclaimer flags the no-1.72-uplift classification; DK disclaimer flags the indicative/marginal rate; every new profile has a "not tax advice" disclaimer + knownLimits
- ⚠ **Re-verify before launch (carried forward and EXPANDED):** all 10 jurisdictions' figures were implemented from 2026 web tax references, not primary government sources. Before charging anyone, re-check every rate/threshold/rule against primary government pages — now including **Skatteverket (SE), Skattemyndigheten/KAS (PL), the ATO (AU) — especially the 2027 CGT-discount→indexation reform timing, Skatteetaten (NO) — especially the share-vs-general-asset classification for skins, Skattestyrelsen (DK) — especially the speculative-intent test and marginal-rate reality, and Vero.fi (FI) — especially the €1,000 proceeds exemption vs the app's gains-cliff approximation.** Allowances and bands change yearly

### v3.1.1 — Tax-Engine Correctness Pass ✅
Focused correctness fixes to the v3.0.0 multi-jurisdiction tax engine, flagged by Cowork research (`05-tax-rules.md`, 13 Jun 2026) and deferred out of the v3.1.0 gating push. **Engine-only — the v3.1.0 gating layer (`FEATURES`/`isPro()`) was not touched.** Back-compat return shape of `calculateCGT()` preserved (all 100+ callers unaffected).

- **Germany Freigrenze is now a CLIFF, not a deductible allowance (highest-impact fix).** The €1,000 figure was being applied like UK's £3,000 allowance (`taxable = max(0, gain − 1000)`), which under-taxed every German disposal. It is a `Freigrenze`: total in-year private-sale gains **below €1,000 are fully tax-free; at €1,000+ the ENTIRE gain is taxable from the first euro** — all-or-nothing. Implemented via two new profile-aware helpers, `_applyExemption(netGain, profile)` and `_exemptionUsed(netGain, profile)`, that branch on a new `allowanceIsCliff: true` flag on the DE profile. **UK's £3,000 stays genuinely deductible** (no `allowanceIsCliff` flag). The €1,000 value itself was already correct and is unchanged
  - Routed ALL four allowance-application sites through the helpers: the sync `rollup()` in `calculateCGT()`, the async tax-currency totals in `renderCGTSummary()`, the `exportCGTReport()` summary, and `updateCashOutCalc()`. No site computes the allowance inline any more
  - **UI**: the DE summary card now shows a "below cliff — fully tax-free" / "cliff crossed — entire gain taxable" status line; the cash-out calc's "Remaining allowance" row becomes "Freigrenze (cliff) · all-or-nothing" for DE; the CGT report shows "Annual Freigrenze (cliff)" + a "Freigrenze Status" line
- **Canada $1,000 personal-use-property (PUP) floor implemented.** For personal-use property, both cost and proceeds are deemed to be at least CAD $1,000 per disposal — so a cheap-bought item sold cheaply no longer shows a fake gain. Applied in `calculateCGTWithTaxCurrency()` **in the tax currency** (CAD) so the $1,000 is applied as-is, not an FX-shifted GBP equivalent: `grossTax`/`costBasisTax` are each floored to `pupFloor` before `gainTax` is recomputed, and a `pupApplied` flag is recorded per disposal. New `pupFloor: 1000` on the CA profile. The summary footer shows "$1,000 PUP floor applied to N disposals"; the report notes the floor
  - **LPP loss ring-fencing: disclosed, not modelled** (agreed scope for this pass). Listed personal property (art, jewellery, rare coins/stamps/books) losses can only offset LPP gains, but the app has no reliable LPP signal, so it pools all gains/losses together. This simplification is stated in the CA disclaimer **and** a new machine-readable `knownLimits` field surfaced as a "Known limit" footer line + a report "KNOWN LIMITS" section
- **US collectibles 28% edge case + 1099-K awareness — disclosed (no calc change).** Knives/rare skins may qualify as "collectibles" (long-term gains taxed up to 28%, not the 0/15/20% bands the engine shows). Flagged in the US disclaimer + `knownLimits`. Added a one-line 1099-K note: marketplaces may report **gross** proceeds to the IRS; the app's per-disposal cost-basis records are the user's defence for reporting the actual gain. No bracket-dependent calc was added (the app can't know the user's marginal rate or which items are collectibles)
- **UK rates confirmed 18%/24%** (not legacy 10%/20%) — verified in code (`rates: { basic: 18, higher: 24 }`), no change needed
- **DE disclaimer scope caveat added** — the €1,000 Freigrenze pools ALL of a person's private sales in the year (crypto, gold, other valuables), so the app's skins-only view is necessarily partial; users must add their other §23 disposals before judging whether the cliff is crossed. This is a scope caveat, not a premise hedge
- **Design premise (locked in):** the app treats CS2 skins as chargeable/taxable assets, full stop — that's the product's niche. No "is a skin even a chargeable asset?" hedging anywhere in disclaimers/UI. Standard "educational, not tax advice, consult a professional" boilerplate retained per profile
- **New `knownLimits` profile field** (optional) — short machine-readable "known limits" note per jurisdiction (US, DE, CA populated), rendered in the summary footer and the CGT report
- **Offline tests** (`test-tax-engine.js`, node harness stubbing `window._store`, extracts the real `TAX_PROFILES` + helpers from `src/app.js` rather than reimplementing them): **36/36 passing** — DE cliff boundaries (€999 vs €1,000 vs €1,001 vs €1,500 vs €5,000, losses), UK deductible-allowance regression (£2,999/£3,000/£3,500/£10,000), CA $1,000 floor (cheap buy/sell → no fake gain; cheap-cost expensive-sell → cost floored; both-above-floor untouched; 50% inclusion on a floored gain), CA LPP-style loss flows into the pool (confirming the documented non-ring-fenced behaviour), and disclaimer-content assertions (collectibles 28%, 1099-K, DE pooling caveat, UK 18/24%)
- ⚠ **Re-verify before launch**: per the research's own caveat, do NOT ship these figures on `05-tax-rules.md` alone. Every allowance/rate/threshold (UK £3,000 & 18/24%, DE €1,000 & §23 1-year rule, US 0/15/20 & 28% collectibles & 1099-K, CA 50% inclusion & $1,000 PUP floor & LPP rules) must be re-checked against **primary government pages** (HMRC, IRS, BZSt/Finanzamt, CRA) in the actual launch month, as allowances and bands change yearly

### v3.1.0 — Feature-Gating Foundation + Onboarding (Vault Pro Phase 4a) ✅
- **Free-vs-Pro gating framework** — single `FEATURES` map (each feature tagged `tier: 'free' | 'pro'`) + one `isPro()` check (reads a local override flag for now; Phase 4b plugs Paddle in behind it). `featureUnlocked()` / `showProToast()` gate at feature level with a PRO/FREE tier badge — not nag popups. **Free** = core tracker (holdings, play skins, trade history, basic pricing, watchlist, Case Intel); **Pro** = multi-jurisdiction tax engine, multi-currency display + reports, cost-basis methods, CGT export (signed off with Rudi before coding)
- **First-run onboarding wizard** (`onboardModal`) — display currency, jurisdiction, API keys; skippable; runs once via the `cs2vault_onboarded` flag
- **Fresh installs start EMPTY** — Rudi's personal seed data stripped from the new-install path; migration-safe (only genuinely new installs start empty, existing data untouched)
- ⚠ **This v3.1.0 gating layer is FROZEN for the v3.1.1 engine pass** — `FEATURES`/`isPro()` were not modified

### v3.0.0 — Multi-Jurisdiction Tax Engine (Vault Pro Phase 3) ✅
**The paywall feature — the tax engine is now COMPLETE.** (As of v3.1.0 it is gated behind `isPro()`; the engine itself was tax-complete at v3.0.0.)

- **`calculateCGT()` refactored from hardcoded-UK into a pluggable `TaxProfile` system** (`TAX_PROFILES` map, selected by `getTaxJurisdiction()`). Each profile defines: `taxCurrency`, `taxYearStart(now)`/`taxYearLabel(now)`, `allowance`, `rates`, `feeDeductible`, `disposalCounts(trade)` (the disposal-definition hook), `classifyGain(disposal)` (holding-period logic), and `disclaimer`. The Phase 2 lot/matching engine (`recomputeCGTGains`) is **reused untouched** — profiles only decide what happens to the per-disposal gains afterward
- **Four launch profiles:**
  - **UK** — CGT, GBP, tax year 6 Apr–5 Apr, £3,000 annual exempt amount, 18%/24% bands, Section 104 pooling (+ same-day + 30-day B&B from Phase 2). Steam-Wallet sales excluded as the chosen position (`disposalCounts` returns false for Steam). Keeps the v2.4.2 dual-view "incl. Steam" stricter reading. **GBP-locked, no FX conversion** (round-trips exactly)
  - **US** — USD, calendar tax year, no annual exemption, FIFO/specific. Each disposal classified **short-term (held ≤12mo, ordinary-income band 22–37% indicative)** vs **long-term (>12mo, 0/15/20% band)**. Every sale is a disposal (`disposalCounts` → true)
  - **Germany** — EUR, calendar year, FIFO. **§23 EStG private-sale rule: gain is TAX-FREE if the asset was held >12 months**; only sub-12-month disposals are taxable, above the €1,000 Freigrenze. Exempt disposals are still listed (flagged "exempt") but dropped from the taxable totals
  - **Canada** — CAD, calendar year, ACB/pooling, **50% inclusion rate** (only half the net gain is taxable via `profile.inclusionRate`), indicative marginal rate on the taxable portion
- **Holding-period date sourcing** (the Phase 2 dependency): the matcher (`_matchItemTimeline` → `consumeFromPool`) now records the **dates of the lots it consumes** (`dateParts` on each `lotMatch`, plus the existing same-day/B&B `date`). `_disposalAcqDate(rc)` derives each disposal's effective acquisition date as the **earliest matched real lot date** (most conservative for a >12mo test). `_monthsHeld(acq, sell)` computes the holding period
- **Legacy-trade degradation** (pre-v2.10.0 trades have no buy lots → `legacy-fallback` match → no acquisition date): **US degrades to short-term**, **DE degrades to taxable** (both the conservative reading), each **flagged** in the UI ("N disposals with unknown acquisition date") and the report ("Classification: short-term (acq. date unknown)")
- **Dual-view generalised per-jurisdiction** — the chosen-position vs stricter-reading pattern is kept but no longer hardcodes the UK Steam-exclusion into the engine; it's a UK-profile `disposalCounts` choice. The "incl. Steam" hypothetical only renders for UK (the only profile that excludes anything)
- **Tax-currency rendering at transaction-date FX** (`calculateCGTWithTaxCurrency()`, async): non-UK profiles render every tax figure in their own tax currency (US→USD, DE→EUR, CA→CAD) by converting the GBP-base values at **transaction-date** rates via the Phase 1 FX layer — **sell legs at the sell-date rate, cost basis at the acquisition-date rate** — never a single year-end or live blended rate (that would erase the real FX gain/loss component). UK short-circuits to `fmtGBP` (no conversion). **Verified round-trip**: a value entered in USD, stored as GBP, rendered back to USD at the same transaction-date rate reproduces the original entered amount exactly. New `fmtTaxCcy(v, ccy, dp)` formatter
- **`renderCGTSummary()` is now async + profile-aware** — tax-year label, allowance/Freigrenze/taxable-amount card, rate-band label (`_rateBandLabel`), US long/short net chips (`_usBucketChips`), DE exempt-count line, unknown-acq-date flag line, and an FX-incomplete warning. Renders in the profile's tax currency with a currency tag
- **`exportCGTReport()` per-jurisdiction** — correct jurisdiction header, tax-year label, reporting-currency line (notes transaction-date FX for non-UK), allowance/Freigrenze/inclusion-rate lines, per-profile rate bands, and **holding-period columns (Acq. Date / Holding / Classification) for US + DE**. Disposal figures in tax currency. Per-profile disclaimer. CSV format kept; filename includes the jurisdiction code
- **Per-row trade-history CGT badge is profile-aware** — UK shows ✓ CGT / ✕ not CGT (Steam excluded); other jurisdictions show ✓ taxable on every disposal (via `profile.disposalCounts(t)`)
- **Cash-out calculator** uses the active profile's allowance + inclusion rate; the Steam-Wallet-not-taxable note only shows for UK
- **Per-profile disclaimers** — educational-tool-not-tax-advice wording per jurisdiction (UK keeps the unsettled-property nuance; DE notes §23 EStG; US notes short/long + unknown-date handling; CA notes ACB + 50% inclusion)
- **Settings copy updated** — jurisdiction dropdown describes each profile's currency/method/rules; non-UK no longer "early-access"; cost-basis dropdown unlocks for non-UK (UK still locked to pooling)
- **Backwards-compatible return shape** — `calculateCGT()` keeps all existing top-level fields (`totalGains`, `netGain`, `taxableGain`, `allowanceUsed`, `taxBasic`/`taxHigher`, `inclSteam`, `inYear`, `yearTrades`, `gainMap`, `method`) so every existing caller works. New additive fields: `profile`, `taxCurrency`, `disposals`, `allDisposals`, `excludesAny`, `exemptCount`, `flaggedCount`, `buckets`, `inclusionRate`, `allowance`. `CGT_ALLOWANCE`/`CGT_RATES`/`getTaxYearStart()`/`getCurrentTaxYear()` retained as UK-derived back-compat shims (the last two now delegate to the active profile)
- Engine logic verified offline across all four profiles: US long/short split, DE >1yr exemption, CA 50% inclusion, UK Steam exclusion, and the USD→GBP→USD round-trip

### v2.10.0 — Configurable Cost Basis (Vault Pro Phase 2) ✅
- **Lot-aware data model** — every holding carries a `lots[]` array (each lot: `qty`, `unitCost` GBP, `date`, `origCurrency`, `fxRate`, `origAmount`); `buyPrice`/`qty` on the holding are a derived weighted-average mirror so the 100+ existing read sites keep working. `makeLot()`, `ensureLots()` (lossless single-lot backfill), `recalcHoldingFromLots()`, `consumeLotsInPlace()`
- **Matching engine** (`recomputeCGTGains(method)` → `_matchItemTimeline`) — reconstructs each item's buy/sell timeline (open lots + add-back of disposed qty at stored cost) and replays disposals against it per the active method, annotating each with `{ costBasis, gain, lotMatches }`
- **Methods**: **pooling** (UK Section 104 average cost + same-day + 30-day bed-and-breakfast matching), **FIFO** (oldest lots first), **specific** (stored lot order — mirrors the old row-based behaviour). Fixes the implicit specific-identification bug
- **Per-jurisdiction settings** — `getTaxJurisdiction()` / `getCostBasisMethod()` with `cs2vault_tax_jurisdiction` / `cs2vault_cost_basis_method` keys; UK locked to pooling; mid-year method/jurisdiction-change warnings (`_hasDisposalsThisTaxYear`); Settings UI (`syncCostBasisSettingsUI`)
- **Dual-view CGT preserved** on top of the new lot engine; legacy trades without buy lots fall back to stored buyPrice (grandfathered)

### v2.9.0 — Multi-Currency Foundation (Vault Pro Phase 1) ✅
- **Architecture: GBP stays the internal base.** All stored amounts (`buyPrice`, `sellPrice`, `gross`, `feeAmount`, `netRealised`, price log, snapshots) keep their existing GBP semantics — zero blast radius on the 100+ read sites. New **FX provenance fields** on every holding/skin/trade record: `origCurrency`, `origAmount` (what the user actually typed), `fxRate` (orig→GBP at the **transaction date**)
- **FX layer** (`getRate(from, to, date?)`) — frankfurter.app (ECB, no key) primary with open.er-api fallback; historical rates cached permanently in new `cs2vault_fx_cache` storage key (keyed `date|from|to` — historical rates never change); in-flight promise memoisation per pair (keeps the v2.7.0 single-FX-fetch behaviour). `getGBPRate()` is now a thin wrapper over `getRate('USD','GBP')` — the bulk-refresh reset hooks (`_gbpRate = null`) still work unchanged
- **Display currency** — Settings → Display Currency dropdown (12 ECB currencies: GBP/USD/EUR/CAD/AUD/CHF/JPY/PLN/SEK/NOK/DKK/CNY), stored in `cs2vault_display_currency`. All portfolio rendering converts base-GBP→display at the live rate via central formatters: `fmtMoney(v, dp)` and `fmtMoneyLoc(v, dp)` (localised, for chart axes/tooltips). JPY renders 0dp. Changing currency re-renders all money-bearing views
- **Tax surfaces are GBP-locked** via `fmtGBP()` — CGT summary, trade history rows (incl. search results), cash-out calculator, bulk sell preview, monthly P&L exports, and every CSV export stay in £ regardless of display currency (HMRC requires GBP). Settings note explains this
- **Multi-currency entry** — currency selects on Add/Edit Investment, Add/Edit Play Skin, Sell, and Top-Up modals (default = display currency). Entered amounts convert to GBP at the rate **on the transaction date** (buy date / sell date / top-up date) and the record stores full provenance. Edit modals re-display the original entered amount + currency for non-GBP records. `saveItem`/`saveSkin`/`saveTopup`/both `confirmSell` branches are now async; FX failure aborts the save with a toast (never silently records a wrong rate)
- **Sell modal currency-aware**: Gross/Fee preview shows in the entry currency; Net Profit always shows in GBP (entry proceeds converted vs GBP cost basis). The per-unit price prefill converts the GBP best price into the default entry currency. Top-up preview uses a live rate for the blended-average preview, exact transaction-date rate on save; top-up notes record the original-currency entry
- **One-time migration on launch** — backfills `origCurrency:'GBP', fxRate:1, origAmount` on every stored holding, play skin, and trade record missing them (lossless — all existing data is GBP-native). Same `seedNewItems()` pattern as the v2.4.5/v2.5.1 migrations
- **Backup/clear updated** — `cs2vault_fx_cache` + `cs2vault_display_currency` included in Settings backup export and Clear All Data
- **Deliberately still GBP-only this phase** (entry side): price alerts targets, watchlist targets, target prices, manual price modal, bulk sell entry — all compare against base-GBP prices; their *display* follows the display currency where appropriate. Multi-currency entry for these can come later if needed
- FX smoke-tested with stubbed IPC: historical caching, live cross rates, GBP identity, JPY 0dp, negative formatting, empty-date fallback to live rate all verified

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

### v2.8.1 — New Logo (Concept A) + Transparent Taskbar Icon + Branding Pack ✅
- **New logo rolled out** — simplified two-layer green diamond with bold gold price line (Concept A from the redesign session). Replaces the old four-layer diamond which read as a dark blob at small sizes and had a clipping inner square
- **All three app assets replaced**: `assets/header-logo.png` (512px), `assets/icon.png` (256px), `assets/icon.ico` — all **transparent background**, so the taskbar/tray icon no longer shows a black square
- **icon.ico is multi-resolution** (16/24/32/48/64/128/256) — the 16–48px sizes use a hand-tuned simplified variant (single diamond, thicker line, no inner layer) so the icon stays readable at taskbar size
- **Settings tab placeholder fixed** — the old `◆` clip-path diamond (long-standing minor issue) now shows the real logo image
- No JS changes — main.js/package.json already referenced these asset paths
- **Branding pack delivered separately** (`cs2vault-branding.zip`, not in the repo): transparent PNGs 16–1024px, Steam avatar 184px (dark rounded-square bg baked in — Steam flattens transparency), favicon.ico, apple-touch-icon 180px, og-square 512px, and the two source SVGs (`full.svg` + `small.svg`) for re-rendering at any size
- ⚠ Windows caches taskbar icons — if the old icon persists after updating, unpin/re-pin the shortcut or restart

### v2.8.0 — Case Intel Drop-Pool Badges + Bulk Edit/Delete ✅
- **Drop-pool status per case** — hardcoded `pool` field in `CASE_INTEL_DATA` ('active'/'rare'/'armory'/'discontinued'), verified June 2026:
  - Valve removed the entire **Rare Drop Pool on 17 Dec 2025** — every former RDP case no longer drops AT ALL (supply permanently capped). All legacy cases marked `discontinued`
  - **Recoil Case date corrected** 2023-10-10 → **2026-03-12** (it stayed in the ACTIVE pool until the Dead Hand Terminal release — sourced from the community drop-pool changelog)
  - **Fever Case** = `armory` (never in the weekly pool, but still SOLD in-game via Armory Stars — supply still growing)
  - **Anubis Collection Package** = `discontinued` (per Rudi, June 2026; exact store-removal date unverified, so Disc. Age scores neutral 50 + flags it)
- **Badges everywhere**: pool chip on each Case Intel card (replaces the binary ACTIVE/DISCONTINUED chip) and a new "Drop Pool" table column; colours: active=accent, rare=blue, armory=orange "ARMORY · STILL SOLD", discontinued=grey. Hover tooltips explain each status
- **Pool-aware Disc. Age scoring**: active=5, armory=8 (supply growing), rare=40, discontinued-no-date=neutral 50 (flagged), else existing month curve
- **Bulk edit/delete on Holdings** — checkbox column + header select-all (visible/filtered rows only); selection bar shows count/units/£ invested with **✎ Bulk Edit** (Type / TUF / Category, "leave unchanged" semantics), **✕ Delete Selected** (confirm with preview; does NOT record sales), and Clear. All writes atomic (re-read storage → mutate → write back); `deleteItem()` hardened to the same pattern. Selection survives re-renders (tracked by id in `_bulkSel` Set); stale ids pruned automatically
- ⚠ **Follow-up flagged**: the OTHER legacy `discontinued` dates in CASE_INTEL_DATA follow the old "left active pool" model and several look wrong vs the 2026 community changelog (e.g. Fracture was ACTIVE until Sep 2025, his data says 2021; Clutch went to rare pool Apr 2023, data says 2018). Correcting them would materially change Disc. Age scores — needs a per-case sourcing pass + Rudi's sign-off before rewriting

### v2.7.2 — Blank Holdings Root Cause + Steam History Diagnostics ✅
- **Root cause of the blank Holdings tab found**: `_trendRange`/`_trendCategory` declarations were lost in a refactor → `renderTrending()` threw `ReferenceError` → `updateStats()` died → tab panel never activated. Declarations restored (30 days / 'all')
- **Steam history fetch**: now sends browser-like headers (Chrome UA, Accept, Accept-Language) — Steam serves a stripped page without the embedded `var line1` data to non-browser requests. Parser regex made whitespace-tolerant
- **Failure diagnostics**: on a parse miss, console now logs body size, whether 'line1' appears, login-page/listing-page detection, and the post-redirect final URL (`finalUrl` plumbed through `doFetch` → IPC result)

### v2.7.1 — Redirect Following + Resilient Tabs + Error Surfacing ✅
- **`doFetch` (main.js) now follows redirects** (up to 5 hops, carrying Set-Cookie across hops) — Steam listing pages 302 to set a country/session cookie; previously every Steam-history fetch died on the bare 302
- **`switchTab` hardened**: panel activates BEFORE per-tab renders; each render wrapped in try/catch that console.errors + toasts the failure — a render exception can never blank a tab again
- **Global error surfacing**: `window.onerror` + `unhandledrejection` → red toast (throttled, 10s per unique message) so silent breakage is visible without DevTools
- `renderTrending` DOM lookups null-guarded

### v2.7.0 — Fast Refresh Engine + Background Auto-Refresh ✅
- **Two-lane refresh engine** (`runTwoLaneRefresh`) — bulk refreshes now run CSFloat and Steam as independent lanes instead of one sequential chain:
  - **CSFloat lane**: parallel pool of 6 concurrent requests (API-keyed, tolerant) via new `runPool()` helper
  - **Steam lane**: sequential with adaptive delay — 1.5s base (down from 3s), doubles up to 6s on a failed lookup (likely rate limit), resets on success
  - An item finalises (price merged + persisted + row rendered) the moment BOTH lanes have processed it — progressive table fill, roughly halves a full-refresh wall time
  - `fetchAllPlatformPrices()` split into `fetchCSFloatLane()` / `fetchSteamLane()` (logic byte-identical); single-item ↻ refreshes still use the sequential combined path unchanged. New shared `combinePlatformPrices()` replaces the lowest/lastSold/avg math previously duplicated in the skin refresh loops
  - `getGBPRate()` now memoises the in-flight promise so 6 parallel CSFloat calls share ONE FX fetch instead of racing 6
  - No API key → CSFloat lane skipped silently with a single "Steam prices only" toast (no per-item error spam)
- **Staleness skip** — manual refreshes (holdings + play skins) skip items whose prices are <30 min old (`FRESH_TTL_MS`), with a "N skipped (<30m fresh)" note in the toast/status. If *everything* is fresh, the click forces a full refresh instead (intuitive: clicking when fresh means "refresh anyway")
- **Background auto-refresh** — new scheduler silently refreshes stale holdings + play skins:
  - Settings → "Background Auto-Refresh" dropdown: Off / 1h / 3h (default) / 6h, stored in `cs2vault_autorefresh`
  - Runs once ~15s after launch, then on the interval — open the app and prices are already warm
  - Only touches stale items (>30 min), refresh button shows "Auto N/M" progress, single toast on completion
  - `_refreshBusy` flag guards manual vs auto collisions in both directions (manual click during auto → "already running" toast; auto skips if manual in flight)
- **Alert checks parallelised** — "Check Prices Now" on the Watchlist tab now pools 6 concurrent CSFloat requests instead of sequential + 3s sleeps
- **Skin refresh merge-back extracted** to `mergeSkinPrices()` (same v2.4.3 atomic re-read/merge pattern) — shared by manual + auto skin refreshes

### v2.6.0 — Steam Market Autocomplete in Add/Edit Modals ✅
- **Search-as-you-type item lookup** — typing 3+ characters in *either* the Item Name or Market Hash field (Add/Edit Investment modal + Add/Edit Play Skin modal) queries Steam's `search/render` endpoint (same one Case Intel uses, `count=10`) and shows a dropdown of real market items with thumbnail, exact name, and current lowest price
- **Selecting a result auto-fills everything**: Item Name + exact `market_hash_name` + inferred Type. Type inference (`inferTypeFromSteamResult`) maps Steam's `asset_description.type` / hash text → knife (Knife/Gloves/★), agent (play-skin mode), sticker (Sticker/Capsule), case (Container/" case"/Package), armory (Charm/Patch/Collectible), else skin. Ends the "ask an AI for the market hash" workflow
- **Implementation** (`attachSteamAutocomplete` in app.js, wired in `initApp` via `initSteamAutocomplete()`):
  - 450ms debounce, min 3 chars, per-session query cache (`steamAcCache`) so repeat keystrokes/backspacing never re-hit Steam
  - Stale-response guard via request token (`steamAcSeq`) — out-of-order responses are discarded
  - Keyboard nav: ↑/↓ to highlight, Enter to select, Escape to dismiss; selection uses `mousedown` (not `click`) so it beats the input's blur
  - Network/rate-limit failures fail silent (dropdown just hides) — never blocks manual typing, manual entry still works exactly as before
  - DOM built with `createElement`/`textContent` (no innerHTML) so hash names with quotes/apostrophes are safe
- **Icons** load from `community.fastly.steamstatic.com` via plain `<img>` — allowed by the existing CSP (`img-src https:`)
- New CSS: `.steam-ac-dd`, `.steam-ac-item`, `.steam-ac-name`, `.steam-ac-meta`, `.steam-ac-empty` in index.html; form-row gets `position:relative` at attach time
- Modal hint text updated to "Type 3+ letters in either field to search Steam & auto-fill"
- Note: dropdown prices show in the currency Steam geolocates the user's IP to — informational only, never stored


### v2.5.1 — Steam Sticker Price Fixes (Elemental Craft Hashes + Capsule Prefix) ✅
- **Bug**: Bolt Charge, Boom Trail, High Heat, Bolt Strike showed no Steam price (— in the Steam column). Root cause: stored market hashes had a `(Holo)` suffix, but the Elemental Craft pack has **no Holo variants** for these stickers (verified June 2026 — pack variants are paper / Glitter on the Boom series / Foil on the Bolt series; only Rainbow Route is Holo). The strip-suffix retry sometimes rescued the lookup but doubled the Steam request count and got rate-limited on the rest, so results were inconsistent
- **Hash corrections** — both seed arrays (the dead early `seedNewItems` copy and the live one) updated: `Sticker | Bolt Strike (Holo)` → `Sticker | Bolt Strike`, same for Bolt Charge, Boom Trail, High Heat. `Boom Trail (Glitter)` was already correct and untouched
- **One-time migration** — `seedNewItems()` gained a `HASH_FIXES` map that rewrites the four wrong hashes on any stored holding at launch and re-persists `cs2vault_holdings` (same pattern as the v2.4.5 platform backfill), so existing data is fixed permanently
- **`STICKER_INDEXES` updated** — correct suffix-less keys added for the four stickers (same CSFloat IDs); old `(Holo)` keys kept as legacy aliases so any un-migrated data still resolves on CSFloat
- **Austin Legends Capsule fix** — the Steam lookup was prepending `Sticker | ` to every sticker-type item, turning `Austin 2025 Legends Sticker Capsule` into a nonexistent hash. The prefix-prepend in `fetchAllPlatformPrices()` now skips any hash containing "Capsule" or "Pack" (case-insensitive) — capsules are listed on Steam under their plain name
- Net effect: all affected items hit Steam first try (no retry round-trip), reducing rate-limit exposure across a full refresh

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

### 🟠 Launch blocker (not a code bug — external admin)
- **TAX FIGURES VERIFIED ONCE (14 Jun 2026) — STILL NEED A LAUNCH-MONTH RE-CHECK.** All 10 jurisdictions were checked against primary government authorities in `09-tax-rules-verification.md`; the issues found were fixed in v3.3.3 (FI proceeds cliff; PL/US wording) or confirmed correct (NO 22%, CA 50%), with Canada's loss-classification deferred at the time and since **resolved in v3.6.1** (investor = ordinary capital property). This is a strong baseline, **but not a substitute for the launch-month gate**: allowances/bands shift each tax year, so re-confirm every figure against the primary pages in the actual month you start charging. The app's disclaimers state "estimates, not tax advice", but charging on a stale figure is still a reputational/liability risk
- **Payments are inert until external setup is done.** v3.3.0 ships the full payment/licensing code, but checkout + online validation stay off until Rudi: creates a Paddle account, deploys the Cloudflare Worker, and fills `PRO_CONFIG`. The dev override + trial work meanwhile. See Next Steps → LAUNCH GATE

### ✅ Resolved in v3.3.3 (tax-engine correctness — primary-source pass)
- **Finland €1,000 exemption under-stated tax** — was modelled as a gains cliff (gain ≤ €1,000 → tax-free) but TVL §48.6 makes it a **proceeds** cliff (total annual sale proceeds ≤ €1,000 → tax-free). A €900 gain on €8,000 of sales was wrongly exempt; now correctly taxable. New `allowanceIsProceedsCliff` flag + `proceedsTotal` arg threaded through all five exemption sites (see What's Been Built → v3.3.3). The async EUR path is exact; the sync GBP path is a documented back-compat approximation
- **Poland loss carry-forward mis-framed** (showed the shares 5-year/annual-cap rule, not the crypto cost-roll-forward) → wording corrected; **US 1099-K** threshold ($20k/200, OBBB) added → disclosure complete. Neither changes a calculation
- **Denmark "+ AM-bidrag" flag was a non-issue** — the shipped code never had that note (verification was against the old spec)

### ✅ Resolved in v3.3.0 (payments / persistence)
- **`STORE_KEYS` loaded only 7 of 20 keys** — `cs2vault_pro_override`, `cs2vault_tax_jurisdiction`, `cs2vault_display_currency`, `cs2vault_cost_basis_method`, `cs2vault_onboarded`, `cs2vault_install_state`, `cs2vault_fx_cache`, `cs2vault_autorefresh`, `cs2vault_pricempire_key`, `cs2vault_price_log`, `cs2vault_steam_history`, `cs2vault_case_supply` were written to disk but never reloaded on the next launch, silently resetting those settings every restart → `STORE_KEYS` now loads the full set (plus the three new licence keys). This was a hard prerequisite for licence-token persistence

### ✅ Resolved in v3.1.1 (tax-engine correctness)
- **DE Freigrenze was applied as a deductible allowance** (under-taxed German disposals) → now a correct all-or-nothing cliff (`allowanceIsCliff`); UK £3,000 deductible allowance unaffected
- **CA had no $1,000 personal-use-property floor** (overstated tax on cheap-bought items) → floor now applied per disposal in CAD
- **US collectibles 28% / 1099-K and DE all-private-sales pooling caveat** were undocumented → now disclosed in disclaimers + `knownLimits`
- ⚠ **Re-verify caveat (carry into launch month):** all tax figures/thresholds across ALL 10 jurisdictions have now been checked against primary government authorities in `09-tax-rules-verification.md` (14 Jun 2026), and the issues it found were actioned in v3.3.3 (FI proceeds cliff fixed; PL/US wording corrected; NO 22%/CA 50% confirmed correct; **Canada loss-pooling classification resolved in v3.6.1** — investor = ordinary capital property, PUP floor removed). **This does NOT remove the launch gate**: allowances/bands shift each tax year, so re-check every rate/threshold/rule against the primary pages — HMRC (UK), IRS (US — incl. the annually-adjusted LT brackets), BZSt (DE), CRA (CA — incl. re-confirming the v3.6.1 investor classification against any new digital-collectibles guidance), Skatteverket (SE), the Polish KAS (PL), the ATO (AU — incl. the 2027 discount→indexation reform), Skatteetaten (NO), Skattestyrelsen (DK — marginal-rate reality), and Vero.fi (FI) — **in the actual launch month**

### 🟡 Needs Fixing
1. **Case Intel — score confidence builds over time (by design)**
   - Supply Trend needs a 2nd analysis run on a later day; Price vs 90D Low needs 3+ price-log points spanning 14+ days; Momentum needs 2+ points in window
   - Until then those components score neutral 50 and the card shows "N/4 signals live" — expected behaviour, improves automatically with regular use

2. **Steam historical data — testing in progress (June 2026 session)**
   - First test: every fetch died on HTTP 302 (proxy didn't follow redirects) → fixed v2.7.1
   - Second test: 200s but no `var line1` data in HTML → v2.7.2 added browser-like headers (likely Steam serving stripped pages to non-browser requests) + full diagnostics (body size, line1 presence, login/listing-page detection, final URL)
   - Awaiting third test on v2.7.2+; if Steam withholds the data even with browser headers, pivot chart history to Pricempire (already on roadmap)

3. **Case Intel legacy `discontinued` dates need a sourcing pass**
   - Existing dates follow the old "left active pool" model; the 2026 community changelog contradicts several (Fracture was ACTIVE until Sep 2025 vs stored 2021; Clutch → rare pool Apr 2023 vs stored 2018). Recoil already corrected to 2026-03-12 in v2.8.0
   - Correcting the rest would materially shift Disc. Age scores — needs per-case sourcing + Rudi's sign-off

### 🟢 Minor / Polish
- Portfolio History chart annotation labels could overlap on narrow windows
- `settingsVersion` hardcoded to "Desktop App v1.0.0" in fallback function
- Case Intel momentum columns show — until price log has enough history (expected behaviour)

---

## Next Steps (Prioritised)

### Short-term
- **✅ Vault Pro Phase 4a — Feature-Gating Foundation + Onboarding (shipped v3.1.0)**: `FEATURES` map + `isPro()` gating framework, feature-level lock UX + tier badge, first-run onboarding wizard (`cs2vault_onboarded`), fresh installs start empty. Free = core tracker; Pro = tax engine, multi-currency display + reports, cost-basis methods, CGT export
- **✅ Vault Pro v3.1.1 — Tax-Engine Correctness Pass (shipped)**: DE Freigrenze cliff, CA $1,000 PUP floor, US collectibles/1099-K + DE pooling disclosures (see What's Been Built). Re-verify figures vs primary gov pages before launch
- **✅ Vault Pro Phase 4b — Payments, Licensing & Code Signing (shipped v3.3.0)**: Paddle checkout, Paddle-native licence validation + 14-day offline grace, 14-day no-card trial, Cloudflare Worker webhook receiver, CI code-signing wiring, Privacy/ToS pages. Also fixed the latent `STORE_KEYS` persistence bug (Pro override / jurisdiction / display currency / onboarding flag were silently resetting on restart). See What's Been Built → v3.3.0
- **🚦 LAUNCH GATE — before the first paid sale (all external admin Rudi must do; code is built to the boundary):**
  1. **Re-confirm ALL 10 jurisdictions' tax figures against primary government pages** (HMRC/IRS/BZSt/CRA/Skatteverket/KAS/ATO/Skatteetaten/Skattestyrelsen/Vero.fi) **in the launch month** — verified once on 14 Jun 2026 (`09-tax-rules-verification.md`) with fixes applied in v3.3.3, but allowances/bands change yearly so this still gates the first sale. The Canada loss-classification deferral was resolved in v3.6.1 (investor = ordinary capital property); re-confirm it here alongside the figures
  2. **Paddle account** (seller approval can take days) → paste token + monthly/annual price IDs into `PRO_CONFIG` (PADDLE-SETUP.md). **The website prerequisite is now met** — pricing/ToS/privacy/refund are live at https://cs2vault.app/ for the "Tell us about your website" step
  3. **Deploy the Cloudflare Worker** (`worker/` + worker/DEPLOY.md) → paste its URL into `PRO_CONFIG.licenceApiBase`
  4. **Finalise the price** in Paddle → update the two `priceMonthlyDisplay`/`priceAnnualDisplay` strings to match (benchmark SkinKeeper Pro ~$4.99/mo · $34.99/yr)
  5. ✅ **RESOLVED in v3.10.0 — Electron 29 → 43 + electron-builder 24 → 26 + electron-updater 6.8.9** — `npm audit` now 0 vulnerabilities, builder config validated by a real packaging run, update-feed continuity confirmed. Item 6 (cert purchase) is now unblocked; buy the cert against THIS builder config. Residual to confirm on Rudi's side: one green GitHub-Actions build on Node 22 (workflow already bumped)
  6. **Buy a code-signing cert** (~£200–400/yr) → add `CSC_LINK`/`CSC_KEY_PASSWORD` GitHub secrets (CODE-SIGNING.md). OV is the pragmatic choice; EV needs a cloud-HSM `win.sign` hook
  7. **Fill the `[ACTION REQUIRED]` legal-name + governing-law markers** in `legal/privacy.html` and `legal/terms.html`; have both reviewed for the UK before taking payments
  8. **Business structure / liability** (sole trader vs ltd) — worth sorting before taking payments
  9. End-to-end **sandbox test**: Paddle sandbox purchase → Worker stores the licence → paste key → app flips to PRO → pull network → relaunch → Pro stays unlocked (offline grace)
  10. ✅ **RESOLVED (Jul 2026) — repo visibility: STAYING PUBLIC.** Rudi's decision + rationale: Electron apps are trivially unpackable anyway (asar extraction is one command), so going private buys little real protection, while "open source, local-first — audit the code yourself" is genuine marketing for an app handling financial data and (Phase 6) Steam credentials. The website now makes that case deliberately at `website/security/index.html` (`/security/`, linked from every footer, in the sitemap, canonical+og:url set). **Accepted risk, kept on record:** the public `isPro()` gate means anyone can clone, flip `isPro()` to `return true`, and build an unlocked copy — a shared "free Pro" build in CS2 trading communities remains the realistic leakage scenario. If that materialises post-launch and hurts revenue, the go-private playbook is preserved here: private repo + separate public releases-only repo (`cs2vault-releases`), touching (a) website `releases/latest` download links, (b) electron-updater's `publish` config in `package.json` (auto-update feeds must point at the public releases repo or updates break for existing installs), (c) the GitHub Actions release workflow target. **Re-raised 8 Jul 2026** (Rudi initially said go private, without this record in view); on seeing the prior rationale the standing decision is **still PUBLIC** — if Rudi re-confirms private knowingly, execute the playbook above in one delivery. Also still outstanding either way: the repo has **no LICENSE file** — add an explicit "source-visible, all rights reserved" notice (or a chosen licence) so the legal position stops being the default
- **Re-test Steam historical data fetcher on v2.7.2+** — diagnostics now pinpoint any remaining failure; pivot to Pricempire for chart history if Steam withholds the data
- **Pricempire historical data** — the API integration is built but `fetchPricempireHistory()` isn't wired into the price charts yet as a toggleable data source
- **Case Intel legacy date sourcing pass** — verify/correct remaining `discontinued` dates against the 2026 community changelog (see Known Issues #3)

### Tax-engine follow-ups (post-Phase 3, by demand)
- **✅ DONE in v3.1.1** — Germany Freigrenze cliff, Canada $1,000 PUP floor, US collectibles/1099-K + DE pooling disclosures. The "is a skin a chargeable asset?" hedging line was **deliberately dropped from the spec and the product** (the app assumes skins are taxable — that's the niche; do not re-add it)
- **✅ RESOLVED in v3.6.1 — Canada loss-classification** — skins held for investment classified as **ordinary capital property** (ITA s.54 use test; CRA 2023-0961341C6 supports): $1,000 PUP floor removed, losses stay deductible, alternative PUP reading disclosed in disclaimer/knownLimits. See What's Been Built → v3.6.1
- **✅ CLOSED in v3.6.1 — Canada LPP loss ring-fencing** — moot under the investor classification (LPP is a subset of PUP, which no longer applies). Retained as disclosure only for users whose skins are genuinely enjoyment-held. Do NOT re-add an LPP tag/engine path unless the classification itself is revisited
- **US collectibles 28% calc (deeper than v3.1.1)** — v3.1.1 only flags it in the disclaimer. Modelling it properly needs a per-item "collectible" classification + the user's bracket; deferred until demand
- **✅ Six jurisdictions added in v3.2.0** — Sweden, Poland, Australia, Norway, Denmark, Finland (now 10 total). Engine gained `perDisposalInclusion` (AU 50%-discount-if->12mo) and FI two-tier rates. **More jurisdictions** still cheap to add (FR, NL, ES, BR, etc.) — each fills the same `TAX_PROFILES` interface. Add on customer demand. NB: Netherlands breaks the model (wealth tax on assets, not gains); Brazil is progressive/fiddly — both higher-effort
- **Russia (RU) deferred — payment, not tax, is the blocker.** A tax profile is buildable (13% flat PIT), but Paddle/Stripe and Visa/Mastercard don't process Russian transactions under sanctions, so Pro revenue from RU isn't collectable. If ever added, build the free-tier tax profile but gate Pro as unavailable in-region. Verify Paddle's supported-countries list before relying on any RU revenue
- **US wash-sale rule** — not yet modelled (US disposals don't currently apply the 30-day wash-sale loss-deferral; UK already has its own same-day/B&B matching from Phase 2)
- **Per-jurisdiction allowance/rate refresh** — allowances and bands are hardcoded current-year values (UK £3,000, DE €1,000); revisit each tax year, or make them year-aware if a profile needs historical-year reporting. **Re-verify all figures against primary government pages in the launch month (see Known Issues)**
- **Acquisition-date backfill** — pre-v2.10.0 legacy trades degrade to short-term (US) / taxable (DE). A future migration could let the user attach acquisition dates to historical disposals to unlock correct long-term/exemption treatment

### Medium-term
- ✅ **Full-cashout tax modelling DONE (8 Jul 2026, chat session, not in-app)** — modelled from the real holdings export (61 positions): invested £28,907 vs realisable ~£23,681 net via CSFloat (2% fee) = **~£5.2k LOSS, £0 CGT**; the tracker's £37.3k is Steam-weighted and not cashable. Steam-routing arbitrage (sell Steam-premium items on Steam → convert wallet via low-spread items → CSFloat) recovers £1–3.7k more but stays a loss below ~91% conversion efficiency. Break-even needs ~+22% price recovery; £3k allowance only engages beyond ~+35%. Model doc delivered for Rudi's accountant meeting (16 Jul 2026); raises the chained-disposal cost-basis question for the Steam-exclusion position. **Product idea logged: "Cashout Planner"** — per-holding direct-vs-routed net cash + realisable (not paper) portfolio value; natural Pro feature post-Phase-6
- **Steam storage-unit import (TRANSITION-PLAN Phase 6) — COMPLETE** (v3.7.0 connect, v3.8.0 names, v3.9.0 merge). Follow-up on the books: **phase-aware pricing for Doppler-family holdings** (Rudi: important) — holdings already store phase-decorated names with phase-less marketHash; CSFloat supports phase filters; pairs naturally with the Cashout Planner feature

### Ideas (not yet scoped)
- Case Intel squeeze score — composite chip combining the now-real supply trend + momentum + discontinued status (post-v2.5.0 the inputs all exist)
- Seed initial price history from current prices on first install
- Dark/light theme toggle

---

## Technical Notes

### Portfolio Value History / Value-Over-Time Chart (v3.5.0; split changed v3.5.1)
- **`cs2vault_value_history`** key — array of daily points `{ date, steam, csfloat, value, invested }`, one per calendar day, sorted ascending, capped at `VALUE_HISTORY_MAX` (730). Separate from `cs2vault_snapshots` (monthly category snapshots, used for benchmarking) — this series is value-only and daily, so the chart looks dense like Skin Ledger
- **Capture**: `recordValueSnapshot()` runs in initApp (after holdings load) and again after a full bulk refresh (`refreshAllPrices`, only when `res.updated > 0`). Dedupes per `todayStr()` (latest write wins); skips if no holdings or computed value ≤ 0 (avoids logging a £0 point before prices load). `computeValueSplit()` sums `getBestPrice(h) × qty` per holding, bucketed by `getPricingPlatform(h)` (steam vs csfloat), plus `invested`
- **Seeding**: `seedValueHistoryFromSnapshots()` (initApp, once — idempotent via a `seeded:true` flag on seeded points) backfills value points from existing monthly snapshots' total value/invested so the 365/All ranges aren't empty on first run. Seeded points have `steam:0, csfloat:0` (no platform split available historically). Never overwrites a real daily point for the same date
- **Pruning**: `pruneValueHistory()` (initApp) trims to the most recent `VALUE_HISTORY_MAX` points
- **Render**: `renderValueChart()` (called at the top of `renderPortfolio()`, so it draws when the Analytics tab opens). `currentValueRange` (days; 0 = All, default 365); `setValueRange(days, btn)` re-renders. `_valueRangeSlice(hist)` filters to the range, falling back to the last 2 points if a short range would leave <2 (so the chart never blanks). Header shows latest value + delta over the *visible* range (green up / red down). `valueChart` is the Chart.js line instance (filled area, gradient green/red by range direction)
- **Sub-line (`_valueSplitHtml(invested, value)`, v3.5.1)** — shows **Invested £X · ▲/▼ Unrealised P&L ±£Y** (P&L colour-coded). Replaced the v3.5.0 Steam/CSFloat *pricing-source* split, which read as a misleading cross-platform value comparison (cases/stickers price off Steam, so a case-heavy portfolio dumped ~98% into the "Steam" bucket). `.vc-split-invested` (grey) + `.vc-split-pnl` (inline colour) in index.html
- **Free-tier, not gated.** Registered in `STORE_KEYS` (index.html), `exportAllData`, `clearAllData`

### FX Layer (v2.9.0)
- `getRate(from, to, date?)` — no date or today = live rate; past date = historical. Primary frankfurter.app (ECB, no key), fallback open.er-api.com. Historical rates cached permanently in `cs2vault_fx_cache` (`"YYYY-MM-DD|FROM|TO": rate`); in-flight promise memo per key
- `toBaseGBP(amount, ccy, date)` → `{ base, fxRate }` or `null` on FX failure — all save paths abort with a toast on null, never record a guessed rate. Empty/missing date falls back to the live rate
- Formatters: `fmtMoney(v, dp)` (base GBP → display ccy), `fmtMoneyLoc(v, dp)` (with thousands separators, for chart ticks/tooltips), `fmtGBP(v, dp)` (tax-locked). Chart datasets stay in GBP — only tick/tooltip labels convert, which keeps gridline values correct
- Display state: `_displayCcy` / `_displayRate` (GBP→display live rate), loaded by `initDisplayCurrency()` in initApp; `setDisplayCurrency()` persists + re-renders
- Record provenance fields: `origCurrency`, `origAmount`, `fxRate` on holdings, play skins, trades. `buyPrice`/`sellPrice` etc. remain base GBP — Phase 2 lots will consume the provenance fields
- GBP-locked surfaces (must use `fmtGBP`, never `fmtMoney`): renderCGTSummary, exportCGTReport, updateCashOutCalc, renderHistory, filterHistory, deleteTrade confirm, calcBulkSell, exportMonthlyCSV/PDF, all CSV exports
- Entry-side GBP-only by design this phase: alert targets, watchlist targets, target prices, manual price modal, bulk sell — labels keep "(£)"

### Bulk Refresh Engine (v2.7.0)
- `runTwoLaneRefresh(items, opts)` — CSFloat lane: parallel pool of `CSFLOAT_CONCURRENCY` (6); Steam lane: sequential, `STEAM_BASE_DELAY_MS` (1500ms) with ×2 backoff to 6s on failure. Item finalises when both lanes done → `onItemDone(item, prices|null)`
- `FRESH_TTL_MS` = 30 min — `isPriceFresh(item)` gates both manual and auto refreshes; all-fresh manual click forces full refresh
- Auto-refresh: `cs2vault_autorefresh` storage key (hours, 0 = off, default 3), `initAutoRefresh()` in initApp (15s launch delay + interval), `runAutoRefresh()` covers stale holdings + play skins. `_refreshBusy` prevents overlap with manual refreshes
- Single-item refreshes (↻ buttons) intentionally bypass the engine and staleness skip — explicit per-item clicks always fetch

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
1. Auto-prepend `Sticker | ` if missing — **skipped for hashes containing "Capsule" or "Pack"** (capsules are listed on Steam under their plain name, e.g. `Austin 2025 Legends Sticker Capsule`)
2. Apply capitalisation fixes (e.g. `From the Deep` → `From The Deep`, `| Axia` → `| AXIA`)
3. Try exact hash against Steam first
4. If no result, strip variant suffix `(Holo)`/`(Glitter)`/`(Foil)`/`(Lenticular)` and retry
- ⚠ Variant suffixes must match Steam's real naming — Elemental Craft papers (Bolt Strike/Charge, Boom Trail, High Heat) have NO Holo variant; wrongly-stored `(Holo)` hashes were corrected by a one-time `HASH_FIXES` migration in `seedNewItems()` (v2.5.1). Relying on the strip-retry doubles request volume and risks rate limits — store the correct hash

### Agent Market Hash Convention
Agents stored with full Steam name e.g. `Number K | The Professionals`. CSFloat skipped entirely.

### Platform Fees
- CSFloat: 2% seller fee
- Steam Market: 15% total (13% Valve + 2% game-specific)

### Payments & Licensing (v3.3.0 — Phase 4b)
- **`PRO_CONFIG`** (src/app.js) — the single config block: `paddleVendorToken`, `paddleEnvironment`, `priceIdMonthly`/`priceIdAnnual`, `licenceApiBase` (Cloudflare Worker URL), `priceMonthlyDisplay`/`priceAnnualDisplay` (display strings only — NO charge is hardcoded), `trialDays`/`graceDays`/`revalidateHours`. `proConfigured()` = token + annual price set; `licenceApiReady()` = Worker URL set
- **`isPro()` precedence** — dev override (`cs2vault_pro_override` === 'true') → `_licenceIsActive()` → `_trialIsActive()`. Override always wins (dev/support). This is the ONE function Phase 4b changed; all `featureUnlocked()` callers are untouched
- **Licence state** — `cs2vault_licence` (key string), `cs2vault_licence_state` (JSON `{ status, checkedAt, key, plan, cancelledAt, pending? }`), `cs2vault_trial_start` (ISO date). `_licenceIsActive()` = state.status 'active' AND `(now − checkedAt) ≤ graceDays`. Network failure during `validateLicence()` never overwrites a within-grace active state (offline grace). 404 from the Worker = explicit inactive
- **`validateLicence(key)`** → `window.cs2vault.fetch(licenceApiBase + '/validate?key=…&product=cs2vault')`; parses `{ active, plan, cancelledAt }`, caches to `cs2vault_licence_state`. If no Worker URL yet, a pasted key is stored `pending` so setup isn't blocked. `refreshLicenceIfDue()` re-checks at most once per `revalidateHours` on launch, fire-and-forget
- **Trial** — `ensureTrialStarted()` (initApp, gated on `isFreshInstall()`) writes `cs2vault_trial_start` once; `trialDaysLeft()` counts down from `trialDays`. Honour-system (local clock)
- **`startProCheckout(plan)`** — opens Paddle hosted checkout via `window.open` → existing `shell.openExternal` handler. No Paddle.js bundled (CSP unchanged). `proStatus()` returns `{ tier, reason }` (override/licence/trial/grace-expired/trial-expired/free) for UI copy
- **`setProSurfaces()`** — shared re-sync (badges, locks, currency/jurisdiction clamps, re-renders) called by both `setProOverride` and licence activate/deactivate. `syncLicenceUI()` drives the Settings status line + checkout/activation block
- **Licence preserved on Clear All Data** (the three licence keys are excluded from the wipe); included in JSON backup. `STORE_KEYS` (index.html) now loads all 20 keys so the licence survives relaunch
- **Cloudflare Worker** (`worker/licence-worker.js`) — NOT part of the Electron app. Paddle webhook receiver (HMAC-SHA256 `Paddle-Signature` verify) → KV upsert keyed by licence key; `/validate` endpoint answers the app. Deploy via `worker/DEPLOY.md`
- **Code signing** — `.github/workflows/build.yml` passes `CSC_LINK`/`CSC_KEY_PASSWORD` from GitHub secrets (auto-signs when present, unsigned otherwise); no extra `package.json` signing config needed. EV/cloud-HSM path documented in `CODE-SIGNING.md`
- **Legal** — `legal/privacy.html` + `legal/terms.html` (bundled via `files: legal/**/*`), opened by `openLegal('privacy'|'terms')` from Settings → About & Legal

### Multi-Jurisdiction Tax Engine (v3.0.0 — Phase 3; expanded v3.2.0)
- **`TAX_PROFILES`** map — **10 jurisdictions as of v3.2.0**: UK, US, DE, CA, SE, PL, AU, NO, DK, FI. Selected by `getTaxJurisdiction()` → `getActiveTaxProfile()`. Each profile is a flat object: `code`, `name`, `taxCurrency`, `taxYearStart(now)`, `taxYearLabel(now)`, `allowance`, `allowanceIsCliff?` (DE — gains cliff), `allowanceIsProceedsCliff?` (FI — proceeds cliff, v3.3.3), `pupFloor?` (CA), `perDisposalInclusion?` (AU), `rates` (flat / banded / two-tier), `inclusionRate?` (CA), `feeDeductible`, `disposalCounts(trade)`, `classifyGain(disposal)`, `disclaimer`, `knownLimits?`
- **`perDisposalInclusion` (v3.2.0, AU)** — when set, `rollup()` (and the async tax-currency paths in `renderCGTSummary`/`exportCGTReport`) weight each disposal's inclusion from `classifyGain().inclusion` (AU: 0.5 if held >12mo, 1 otherwise/unknown), summing gains-discounted + losses-in-full, floored at 0 — instead of CA's flat post-allowance `inclusionRate` multiply. CA/UK/US/DE paths unchanged
- **FI two-tier rate (v3.2.0)** — `rates: { lower, upper, threshold }`; tax = `min(taxable, threshold)*lower% + max(0, taxable-threshold)*upper%`, wired into all three estimate sites. FI's €1,000 small-sales exemption is a **proceeds cliff** (`allowanceIsProceedsCliff`, v3.3.3 — keyed off total in-year sale proceeds, not gains; superseded the v3.2.0 gains-cliff approximation)
- **AU tax year** — only non-Jan-1/non-Apr-6 boundary: 1 Jul–30 Jun, its own `taxYearStart`/`taxYearLabel`
- **`JURISDICTION_METHODS`** — default cost-basis per jurisdiction (UK/CA/AU/SE pooling-ish; US/DE/NO/FI/DK/PL fifo); gates which codes `setTaxJurisdiction` accepts
- **`_rateBandLabel()`** — per-profile Est-Tax band label; v3.2.0 added AU/FI/NO/DK branches

### Exemption / Freigrenze / PUP-floor handling (v3.1.1)
- **`_applyExemption(netGain, profile, proceedsTotal?)`** — the single source of truth for "gain remaining taxable after the annual exemption". Three regimes: **proceeds cliff** (`allowanceIsProceedsCliff`, FI small-sales exemption — returns 0 if `proceedsTotal` ≤ threshold, else the full gain; added v3.3.3), **gains cliff** (`allowanceIsCliff`, DE Freigrenze — returns 0 below the threshold, the FULL gain at/above it) vs **deductible** (UK allowance — returns `max(0, gain − allowance)`). The optional `proceedsTotal` 3rd arg is only consumed by the proceeds-cliff regime; the others ignore it (full back-compat). `inclusionRate` (CA 50%) is applied by the caller AFTER, on the remainder
- **`_exemptionUsed(netGain, profile)`** — the progress-bar figure (all-or-nothing for a cliff, portion-consumed for a deductible allowance)
- **All four allowance sites route through these helpers**: sync `rollup()`, async `renderCGTSummary()`, `exportCGTReport()`, `updateCashOutCalc()`. No inline `max(0, netGain − allowance)` remains
- **CA `pupFloor` ($1,000)** applied in `calculateCGTWithTaxCurrency()` **in CAD** (not GBP base): each disposal's `grossTax` and `costBasisTax` are floored to `pupFloor` before `gainTax` is recomputed; a `pupApplied` flag is set per disposal and counted in the summary footer. Doing it in tax currency keeps the $1,000 literal correct rather than FX-shifting a GBP equivalent
- **`knownLimits`** (optional per profile) — short note surfaced as a "Known limit" footer line in the CGT summary and a "KNOWN LIMITS" section in the report. US (collectibles 28% + 1099-K gross-proceeds), DE (Freigrenze pools all private sales), CA (LPP losses not ring-fenced; $1,000 floor IS applied)
- **Offline harness** `test-tax-engine.js` extracts the real `TAX_PROFILES` + helpers from `src/app.js` (brace-aware slicing via `fnEnd()` as of v3.3.3, so it won't truncate when a helper grows) and asserts **73 boundary cases** including the FI proceeds-cliff fix (see What's Been Built → v3.3.3). Run: `node test-tax-engine.js`
- **`calculateCGT()`** (sync, GBP-base) — recomputes per-disposal cost basis via the Phase 2 `recomputeCGTGains(method)`, enriches each disposal (`_enrichDisposal`: cost basis, gain, derived `acqDate`, holding-period `classification`), filters to the profile's in-year disposals applying `disposalCounts`, and rolls up. `rollup()` handles profile-exempt disposals (DE >1yr → excluded from taxable totals but counted), the allowance/Freigrenze, CA's 50% inclusion (`inclusionRate`), and the per-profile tax-band estimate. Returns back-compat top-level fields + additive `profile`/`taxCurrency`/`disposals`/`allDisposals`/`excludesAny`/`exemptCount`/`flaggedCount`/`buckets`
- **`calculateCGTWithTaxCurrency()`** (async) — for non-UK profiles, builds a `taxFx` map `{ tradeId → { grossTax, feeTax, costBasisTax, gainTax, sellRate, buyRate } }` by converting GBP-base figures at **transaction-date** rates: sell legs at the sell-date rate (`getRate('GBP', ccy, sellDate)`), cost basis at the acquisition-date rate (`getRate('GBP', ccy, acqDate)`). Never a blended/year-end rate — preserves the real FX gain/loss. UK (taxCurrency GBP) short-circuits unchanged
- **Holding period** — the Phase 2 matcher now records consumed-lot dates: `consumeFromPool` returns `dateParts: [{qty, date}]`; FIFO/specific/section-104 matches carry them, UK same-day/B&B matches carry a single `date`. `_disposalAcqDate(rc)` = earliest matched real lot date (ignores `legacy-fallback`); `_monthsHeld(acq, sell)` → months. **US**: >12mo = long-term, else short-term. **DE**: >12mo = exempt (§23 EStG), else taxable. Unknown acq date (legacy) → US short-term / DE taxable, both `flagged`
- **Rendering** — `fmtTaxCcy(v, ccy, dp)` (UK → `fmtGBP`); `renderCGTSummary()` async + profile-aware; `_rateBandLabel(profile)`, `_usBucketChips(cgt, f)`. `exportCGTReport()` per-jurisdiction with Acq. Date/Holding/Classification columns for US+DE. Per-row history badge via `profile.disposalCounts(t)`
- **Back-compat shims**: `CGT_ALLOWANCE`/`CGT_RATES` retained as UK-value aliases; `getTaxYearStart()`/`getCurrentTaxYear()` delegate to the active profile
- **NOT gated** — the engine is fully usable free in v3.0.0. Free-vs-Pro gating is Phase 4 (v3.1.x)

### CGT Rules (UK profile)
- £3,000 annual CGT allowance (2024/25 and 2025/26)
- 18% basic rate / 24% higher rate on gains above allowance (disposals on/after 30 Oct 2024)
- App treats Steam Wallet sales as NOT taxable disposals — only real-money cashouts count (this is the app's chosen position, now expressed as the UK profile's `disposalCounts` returning false for Steam, left unchanged through v3.0.0). The CGT Summary also shows an informational "incl. Steam" figure alongside the live CSFloat-only figure, so the stricter reading is visible without changing the default treatment
- ⚠ LEGAL NUANCE (researched June 2026): Under strict UK CGT principle, a "disposal" includes *exchanging* one asset for another (CG12700/CG12701), mirroring how HMRC treats crypto token-to-token swaps (CRYPTO22100) — so a Steam-to-Steam sell-then-buy is arguably a disposal at GBP market value even without cashing out. The locked/non-withdrawable nature of Steam Wallet affects valuation (quantum), not whether a disposal happened. The genuinely unsettled question is whether a Valve-licensed skin is "property" at all (R v Lakeman; Property (Digital Assets etc) Act 2025). The app's Steam-exclusion is a defensible-but-debatable position; richer per-disposal data is now captured for all platforms so the treatment can be revisited. Rudi to consult a digital-asset-literate accountant before filing.
- Platform fees are allowable deductions
- Losses can offset gains within the same tax year
- Chattels exemption (£6,000, tangible moveable property) does NOT apply — skins are intangible
- Trade records store: `platform`, `feePercent`, `feeAmount` (£), `gross` (£), `netRealised` (£), plus name/type/qty/buyPrice/sellPrice/sellDate
- `calculateCGT()` (v3.0.0) is now profile-driven (see Multi-Jurisdiction Tax Engine above). For UK it computes the chosen-position (Steam-excluded) and stricter `.inclSteam` rollups in one pass; `.inYear` = all in-year trades. Internal `rollup(disposals)` helper does the gain/loss/allowance/inclusion/tax maths
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
