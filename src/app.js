
// ========================
// TARGET PRICE
// ========================
function openTargetModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('targetItemId').value = id;
  document.getElementById('targetItemName').textContent = item.name;
  const best = getBestPrice(item);
  document.getElementById('targetCurrentPrice').textContent = best ? fmtMoney(best, 3) : '—';
  document.getElementById('targetBuyPrice').textContent = fmtMoney(item.buyPrice, 3);
  document.getElementById('targetPriceInput').value = item.targetPrice ? item.targetPrice.toFixed(3) : '';
  // Preset buttons: 25%, 50%, 100%, 200%
  ['25','50','100','200'].forEach(pct => {
    const btn = document.getElementById('targetPreset' + pct);
    if (btn) btn.onclick = () => {
      document.getElementById('targetPriceInput').value = (item.buyPrice * (1 + parseInt(pct)/100)).toFixed(3);
      updateTargetPreview();
    };
  });
  updateTargetPreview();
  document.getElementById('targetModal').classList.add('open');
}

function updateTargetPreview() {
  const id   = document.getElementById('targetItemId').value;
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  const target = parseFloat(document.getElementById('targetPriceInput').value);
  const preview = document.getElementById('targetPreview');
  if (!target || isNaN(target)) { preview.textContent = ''; return; }
  const gain = ((target - item.buyPrice) / item.buyPrice * 100).toFixed(1);
  const totalGain = (target - item.buyPrice) * item.qty;
  const best = getBestPrice(item);
  const distance = best ? ((target - best) / best * 100).toFixed(1) : null;
  preview.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
      <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Gain vs buy price</div><div style="color:var(--green);font-weight:700;">+${gain}% (+${fmtMoney(totalGain, 2)})</div></div>
      ${distance !== null ? `<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Distance from now</div><div style="color:var(--orange);font-weight:700;">${distance > 0 ? '+' : ''}${distance}%</div></div>` : ''}
    </div>`;
}

function saveTarget() {
  const id     = document.getElementById('targetItemId').value;
  const target = parseFloat(document.getElementById('targetPriceInput').value);
  const item   = holdings.find(h => h.id === id);
  if (!item) return;
  if (!target || isNaN(target) || target <= 0) {
    delete item.targetPrice;
    toast('Target price cleared', 'info');
  } else {
    item.targetPrice = target;
    toast(`Target set: ${fmtMoney(target, 3)} for ${item.name}`, 'success');
  }
  saveData(holdings);
  document.getElementById('targetModal').classList.remove('open');
  renderHoldings();
}

function clearTarget() {
  const id   = document.getElementById('targetItemId').value;
  const item = holdings.find(h => h.id === id);
  if (item) { delete item.targetPrice; saveData(holdings); }
  document.getElementById('targetModal').classList.remove('open');
  renderHoldings();
  toast('Target price cleared', 'info');
}


function checkTargetsOnLoad() {
  const hits = holdings.filter(h => {
    if (!h.targetPrice) return false;
    const best = getBestPrice(h);
    return best && best >= h.targetPrice;
  });
  if (hits.length > 0) {
    setTimeout(() => {
      toast(`🎯 ${hits.length} target${hits.length > 1 ? 's' : ''} hit! ${hits.map(h => h.name).join(', ')}`, 'success');
    }, 1500);
  }
}

// Safety guard in case storage-bridge didn't load
if (!window._store) window._store = {};
if (!window._storeSet) window._storeSet = function(k,v) { window._store[k]=v; try { window.cs2vault.store.set(k,v); } catch(e){} };


// ========================
// STORAGE
// ========================
const STORAGE_KEY = 'cs2vault_holdings';
const HISTORY_KEY = 'cs2vault_history';
function loadData() { try { return JSON.parse(window._store[STORAGE_KEY]) || []; } catch { return []; } }
function saveData(d) { window._storeSet(STORAGE_KEY, JSON.stringify(d)); }
function loadHistory() { try { return JSON.parse(window._store[HISTORY_KEY]) || []; } catch { return []; } }
function saveHistory(d) { window._storeSet(HISTORY_KEY, JSON.stringify(d)); }

// ========================
// ACTIVITY LOG (v3.4.0)
// A record of manual entries — add / edit / delete on holdings + play skins —
// so a fat-fingered price or qty can be spotted after the fact. Read-only,
// newest-first, capped + pruned. Sells are NOT logged (Trade History covers them).
// ========================
const ACTIVITY_LOG_KEY = 'cs2vault_activity_log';
const ACTIVITY_LOG_MAX = 500;

function loadActivityLog() { try { return JSON.parse(window._store[ACTIVITY_LOG_KEY]) || []; } catch { return []; } }
function saveActivityLog(d) { window._storeSet(ACTIVITY_LOG_KEY, JSON.stringify(d)); }

// Snapshot just the user-meaningful fields of a holding/skin for the log.
function _logSnapshot(o) {
  if (!o) return {};
  return {
    name: o.name, type: o.type, qty: o.qty,
    buyPrice: o.buyPrice,
    origCurrency: o.origCurrency || 'GBP',
    origAmount: (o.origAmount != null ? o.origAmount : o.buyPrice),
    buyDate: o.buyDate || '',
    marketHash: o.marketHash || ''
  };
}

// Compute a human-readable before -> after diff for an edit.
function _logDiff(before, after) {
  const fields = [
    ['name', 'Name'], ['type', 'Type'], ['qty', 'Qty'],
    ['origAmount', 'Buy price'], ['origCurrency', 'Currency'],
    ['buyDate', 'Buy date'], ['marketHash', 'Market hash']
  ];
  const out = [];
  fields.forEach(([k, label]) => {
    const b = before ? before[k] : undefined;
    const a = after ? after[k] : undefined;
    if (String(b == null ? '' : b) !== String(a == null ? '' : a)) {
      out.push({ field: label, from: (b == null ? '' : b), to: (a == null ? '' : a) });
    }
  });
  return out;
}

// action: 'add' | 'edit' | 'delete'; scope: 'holding' | 'skin'
function logActivity(action, scope, snapshot, diff) {
  try {
    const log = loadActivityLog();
    log.push({
      id: uid(),
      ts: Date.now(),
      action: action,
      scope: scope,
      item: snapshot || {},
      diff: diff || null
    });
    // Newest-first storage; prune to cap.
    log.sort((a, b) => b.ts - a.ts);
    if (log.length > ACTIVITY_LOG_MAX) log.length = ACTIVITY_LOG_MAX;
    saveActivityLog(log);
  } catch (e) { console.error('[ActivityLog] write failed', e); }
}

let _activityFilter = '';
function openActivityLog() {
  _activityFilter = '';
  const search = document.getElementById('activitySearch');
  if (search) search.value = '';
  renderActivityLog();
  openModal('activityLogModal');
}

function _fmtActivityTime(ts) {
  const d = new Date(ts);
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function _activityMoney(it) {
  // Show the originally-entered amount + currency (that's what a manual-entry
  // mistake actually looks like), falling back to the GBP buyPrice.
  const ccy = it.origCurrency || 'GBP';
  const amt = (it.origAmount != null ? it.origAmount : it.buyPrice);
  if (amt == null) return '';
  const sym = ccy === 'GBP' ? '£' : '';
  return sym + Number(amt).toFixed(2) + (ccy === 'GBP' ? '' : ' ' + ccy);
}

function renderActivityLog() {
  const body = document.getElementById('activityLogBody');
  const empty = document.getElementById('activityLogEmpty');
  if (!body) return;
  body.textContent = '';
  let log = loadActivityLog();
  const q = (_activityFilter || '').toLowerCase();
  if (q) log = log.filter(e => {
    const it = e.item || {};
    return (it.name || '').toLowerCase().includes(q) ||
           (it.marketHash || '').toLowerCase().includes(q) ||
           (e.action || '').toLowerCase().includes(q) ||
           (e.scope || '').toLowerCase().includes(q);
  });
  if (!log.length) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = _activityFilter
        ? 'No log entries match "' + _activityFilter + '".'
        : 'No activity logged yet. Adds, edits and deletes will appear here from now on.';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  const ACTION_META = {
    add:    { label: 'ADDED',   color: 'var(--green, #22c55e)' },
    edit:   { label: 'EDITED',  color: '#3b82f6' },
    delete: { label: 'DELETED', color: 'var(--red, #ef4444)' }
  };

  log.forEach(e => {
    const it = e.item || {};
    const meta = ACTION_META[e.action] || { label: (e.action || '').toUpperCase(), color: 'var(--text3)' };

    const row = document.createElement('div');
    row.style.cssText = 'padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-start;';

    // Left: action badge + scope
    const left = document.createElement('div');
    left.style.cssText = 'flex:0 0 88px;display:flex;flex-direction:column;gap:3px;';
    const badge = document.createElement('span');
    badge.textContent = meta.label;
    badge.style.cssText = 'font-family:\'Share Tech Mono\',monospace;font-size:10px;font-weight:700;letter-spacing:1px;color:' + meta.color + ';';
    const scope = document.createElement('span');
    scope.textContent = e.scope === 'skin' ? 'Play Skin' : 'Holding';
    scope.style.cssText = 'font-size:10px;color:var(--text3);';
    left.appendChild(badge); left.appendChild(scope);

    // Middle: name + details
    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.textContent = it.name || '(unnamed)';
    nameEl.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:2px;word-break:break-word;';
    mid.appendChild(nameEl);

    const detail = document.createElement('div');
    detail.style.cssText = 'font-family:\'Share Tech Mono\',monospace;font-size:11px;color:var(--text2,#9ca3af);';
    const bits = [];
    if (it.qty != null) bits.push('Qty ' + it.qty);
    const money = _activityMoney(it);
    if (money) bits.push('@ ' + money);
    if (it.type) bits.push(it.type);
    if (it.buyDate) bits.push(it.buyDate);
    detail.textContent = bits.join('  ·  ');
    mid.appendChild(detail);

    // Edit diff lines
    if (e.action === 'edit' && e.diff && e.diff.length) {
      e.diff.forEach(d => {
        const dl = document.createElement('div');
        dl.style.cssText = 'font-family:\'Share Tech Mono\',monospace;font-size:11px;color:var(--text3);margin-top:2px;';
        const fromTxt = (d.from === '' || d.from == null) ? '(empty)' : String(d.from);
        const toTxt = (d.to === '' || d.to == null) ? '(empty)' : String(d.to);
        dl.textContent = d.field + ':  ' + fromTxt + '  →  ' + toTxt;
        mid.appendChild(dl);
      });
    }

    // Right: timestamp
    const right = document.createElement('div');
    right.style.cssText = 'flex:0 0 auto;font-family:\'Share Tech Mono\',monospace;font-size:10px;color:var(--text3);white-space:nowrap;text-align:right;';
    right.textContent = _fmtActivityTime(e.ts);

    row.appendChild(left); row.appendChild(mid); row.appendChild(right);
    body.appendChild(row);
  });
}

function filterActivityLog(v) {
  _activityFilter = (v || '').trim();
  renderActivityLog();
}

function clearActivityLog() {
  const log = loadActivityLog();
  if (!log.length) { toast('Log is already empty', 'info'); return; }
  if (!confirm('Clear the entire activity log (' + log.length + ' entries)?\n\nThis only erases the log — it does NOT touch your holdings or play skins.')) return;
  saveActivityLog([]);
  renderActivityLog();
  toast('Activity log cleared', 'info');
}

async function exportActivityLog() {
  const log = loadActivityLog();
  if (!log.length) { toast('Nothing to export', 'info'); return; }
  const rows = [['When', 'Action', 'Scope', 'Name', 'Type', 'Qty', 'Buy Price', 'Currency', 'Buy Date', 'Market Hash', 'Changes']];
  log.forEach(e => {
    const it = e.item || {};
    const changes = (e.action === 'edit' && e.diff && e.diff.length)
      ? e.diff.map(d => d.field + ': ' + (d.from === '' ? '(empty)' : d.from) + ' -> ' + (d.to === '' ? '(empty)' : d.to)).join('; ')
      : '';
    rows.push([
      _fmtActivityTime(e.ts), e.action, e.scope,
      it.name || '', it.type || '', (it.qty != null ? it.qty : ''),
      (it.origAmount != null ? it.origAmount : (it.buyPrice != null ? it.buyPrice : '')),
      it.origCurrency || 'GBP', it.buyDate || '', it.marketHash || '', changes
    ]);
  });
  const csvStr = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  if (typeof window.cs2vault !== 'undefined') {
    const result = await window.cs2vault.exportSave('cs2vault_activity_log.csv', csvStr);
    if (result && result.saved) toast('Saved to ' + result.filePath, 'success');
  }
}

// ========================
// PRICE HISTORY LOG
// ========================
const PRICE_LOG_KEY = 'cs2vault_price_log';
const PRICE_LOG_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function loadPriceLog() {
  try { return JSON.parse(window._store[PRICE_LOG_KEY]) || []; }
  catch { return []; }
}

function savePriceLog(log) {
  window._storeSet(PRICE_LOG_KEY, JSON.stringify(log));
}

// v3.6.3 batching: every _storeSet rewrites the WHOLE electron-store file, so
// recordPrice firing per item during a bulk refresh meant N full-file writes.
// Bulk loops call beginPriceLogBatch() first; entries then buffer in memory and
// flushPriceLogBatch() commits them all in a single write.
let _priceLogBatch = null;
function beginPriceLogBatch() { _priceLogBatch = []; }
function flushPriceLogBatch() {
  if (!_priceLogBatch) return;
  const batch = _priceLogBatch;
  _priceLogBatch = null;
  if (!batch.length) return;
  const log = loadPriceLog();
  log.push(...batch);
  savePriceLog(log);
  console.log('[PriceLog] Flushed ' + batch.length + ' entries in one write');
}

function recordPrice(item, prices) {
  if (!prices || !item || !item.id) return;
  const entry = {
    id: item.id,
    ts: Date.now(),
    best: null,
    cf: null,  // csfloat
    stm: null, // steam
  };
  if (prices.platforms) {
    entry.cf  = prices.platforms.csfloat?.lowest || null;
    entry.stm = prices.platforms.steam?.lowest || null;
  }
  // Best price MUST follow the same platform routing as getBestPrice:
  // cases/stickers/TUF/agents = Steam first, everything else = CSFloat first.
  // (Previously this took min(cf, stm), which disagreed with P&L pricing.)
  const steamFirst = item.type === 'case' || item.type === 'sticker' || item.isTuf || item.type === 'agent';
  const primary = steamFirst ? entry.stm : entry.cf;
  const secondary = steamFirst ? entry.cf : entry.stm;
  if (primary != null && primary > 0) entry.best = primary;
  else if (secondary != null && secondary > 0) entry.best = secondary;
  else entry.best = prices.lowest || prices.avg7d || null;

  if (entry.best === null) return; // Don't log if no price at all

  if (_priceLogBatch) { _priceLogBatch.push(entry); return; }
  const log = loadPriceLog();
  log.push(entry);
  savePriceLog(log);
}

function prunePriceLog() {
  const log = loadPriceLog();
  const cutoff = Date.now() - PRICE_LOG_MAX_AGE_MS;
  const pruned = log.filter(e => e.ts > cutoff);
  if (pruned.length < log.length) {
    console.log(`[PriceLog] Pruned ${log.length - pruned.length} old entries (>${90}d)`);
    savePriceLog(pruned);
  }
}

// ========================
// CASE SUPPLY LOG
// ========================
const CASE_SUPPLY_KEY = 'cs2vault_case_supply';
const CASE_SUPPLY_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 6 months

function loadCaseSupply() {
  try { return JSON.parse(window._store[CASE_SUPPLY_KEY]) || {}; }
  catch { return {}; }
}

function saveCaseSupply(data) {
  window._storeSet(CASE_SUPPLY_KEY, JSON.stringify(data));
}

function recordCaseSupplySnapshot(marketHash, count) {
  if (!marketHash || count == null) return;
  const data = loadCaseSupply();
  if (!data[marketHash]) data[marketHash] = [];
  data[marketHash].push({ ts: Date.now(), count });
  saveCaseSupply(data);
}

function pruneCaseSupply() {
  const data = loadCaseSupply();
  const cutoff = Date.now() - CASE_SUPPLY_MAX_AGE_MS;
  let changed = false;
  for (const key of Object.keys(data)) {
    const before = data[key].length;
    data[key] = data[key].filter(e => e.ts > cutoff);
    if (data[key].length !== before) changed = true;
  }
  if (changed) saveCaseSupply(data);
}

// Get previous snapshot for a marketHash (most recent entry before today)
function getPreviousSupplySnapshot(marketHash) {
  const data = loadCaseSupply();
  const snaps = (data[marketHash] || []).sort((a, b) => a.ts - b.ts);
  // Return the snapshot from at least 1 day ago (not current session)
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const old = snaps.filter(e => e.ts < cutoff);
  return old.length ? old[old.length - 1] : null;
}

// ========================
// STEAM HISTORICAL PRICE DATA
// ========================
const STEAM_HISTORY_KEY = 'cs2vault_steam_history';

function loadSteamHistory() {
  try { return JSON.parse(window._store[STEAM_HISTORY_KEY]) || {}; }
  catch { return {}; }
}

function saveSteamHistory(data) {
  window._storeSet(STEAM_HISTORY_KEY, JSON.stringify(data));
}

// Parse price history from Steam market listing page HTML
function parseSteamPriceHistory(html) {
  // Steam embeds price data as: var line1=[[...],[...],...];
  // (tolerant of whitespace variations around the assignment)
  const match = html.match(/var\s+line1\s*=\s*(\[.+?\]);/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]);
    // Each entry: ["Mon DD YYYY HH: +0", price, "volume"]
    return raw.map(entry => {
      const dateStr = entry[0];
      const price = entry[1];
      const volume = parseInt(entry[2]) || 0;
      // Parse date — format: "Nov 27 2013 01: +0"
      const cleaned = dateStr.replace(/: \+\d+$/, '');
      const ts = new Date(cleaned).getTime();
      if (isNaN(ts)) return null;
      return { ts, price, volume };
    }).filter(e => e != null);
  } catch(e) {
    console.error('[SteamHistory] Parse error:', e.message);
    return null;
  }
}

async function fetchSteamHistory(marketHashName) {
  if (!marketHashName) return null;
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
  try {
    // Browser-like headers — Steam serves a stripped page (no embedded line1
    // price data) to requests that don't look like a real browser
    const res = await window.cs2vault.fetch(url, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    });
    if (res.status !== 200) {
      console.warn(`[SteamHistory] ${marketHashName}: HTTP ${res.status}${res.finalUrl && res.finalUrl !== url ? ' (ended at ' + res.finalUrl + ')' : ''}`);
      return null;
    }
    const data = parseSteamPriceHistory(res.body);
    if (!data || data.length === 0) {
      // Diagnostics: figure out WHAT page we actually got
      const body = res.body || '';
      const landed = res.finalUrl && res.finalUrl !== url ? ` | landed at: ${res.finalUrl}` : '';
      const hasLine1 = body.includes('line1');
      const looksLogin = /login/i.test(res.finalUrl || '') || body.includes('id="loginForm"');
      const looksListing = body.includes('market_listing_largeimage') || body.includes('market_commodity');
      console.warn(`[SteamHistory] ${marketHashName}: No price data found in HTML` +
        ` | bytes: ${body.length} | mentions line1: ${hasLine1} | login page: ${looksLogin} | listing page: ${looksListing}${landed}`);
      return null;
    }
    console.log(`[SteamHistory] ${marketHashName}: ${data.length} data points`);
    return data;
  } catch(e) {
    console.error(`[SteamHistory] ${marketHashName}: Fetch error:`, e.message);
    return null;
  }
}

async function fetchAllSteamHistory() {
  const btn = document.getElementById('steamHistoryBtn');
  if (btn) { btn.innerHTML = '<span class="loading-spinner"></span> Fetching...'; btn.disabled = true; }

  const allItems = [...holdings, ...(skins || [])].filter(h => h.marketHash);
  const stored = loadSteamHistory();
  let fetched = 0, failed = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    if (btn) btn.innerHTML = `<span class="loading-spinner"></span> ${i+1}/${allItems.length}`;

    // Skip if already fetched within last 24 hours
    if (stored[item.marketHash]?.fetchedAt && (Date.now() - stored[item.marketHash].fetchedAt) < 24 * 60 * 60 * 1000) {
      console.log(`[SteamHistory] Skipping ${item.name} — already fresh`);
      continue;
    }

    const data = await fetchSteamHistory(item.marketHash);
    if (data) {
      stored[item.marketHash] = { data, fetchedAt: Date.now() };
      fetched++;
    } else { failed++; }

    // Steam history is the heaviest key in the store — save every 10 items for
    // crash resilience instead of rewriting the file on every single item
    if ((fetched + failed) % 10 === 0) saveSteamHistory(stored);
    // Rate limit — Steam is sensitive, 3.5s between calls
    await sleep(3500);
  }
  saveSteamHistory(stored);

  if (btn) { btn.innerHTML = '📈 Fetch Steam History'; btn.disabled = false; }
  if (fetched > 0) toast(`Steam history: ${fetched} items fetched`, 'success');
  if (failed > 0) toast(`Steam history: ${failed} failed`, 'info');
  renderTrending();
}

// Get Steam historical price for an item at a specific number of days ago
function getSteamHistoricalPrice(marketHash, daysAgo) {
  const stored = loadSteamHistory();
  const itemData = stored[marketHash]?.data;
  if (!itemData || itemData.length === 0) return null;

  const targetTs = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);
  // Find the closest data point to the target timestamp
  let closest = null, closestDiff = Infinity;
  itemData.forEach(p => {
    const diff = Math.abs(p.ts - targetTs);
    if (diff < closestDiff) { closestDiff = diff; closest = p; }
  });
  // Only return if within 2 days of target
  if (closest && closestDiff < 2 * 24 * 60 * 60 * 1000) return closest.price;
  return null;
}

// Get full Steam history for chart display
function getSteamHistoryForChart(marketHash, days) {
  const stored = loadSteamHistory();
  const itemData = stored[marketHash]?.data;
  if (!itemData) return [];
  const cutoff = days ? Date.now() - (days * 24 * 60 * 60 * 1000) : 0;
  return itemData.filter(p => p.ts > cutoff).sort((a, b) => a.ts - b.ts);
}

function getPriceHistory(itemId, days) {
  const log = loadPriceLog();
  const cutoff = days ? Date.now() - (days * 24 * 60 * 60 * 1000) : 0;
  const item = holdings.find(h => h.id === itemId) || (skins ? skins.find(s => s.id === itemId) : null);
  // Same platform routing as getBestPrice: Steam drives cases/stickers/TUF/agents,
  // CSFloat drives everything else.
  const steamPriced = !!(item && (item.type === 'case' || item.type === 'sticker' || item.isTuf || item.type === 'agent'));

  // Local refresh log — re-derive "best" per entry from the correct platform so
  // trends match P&L pricing (old entries stored min(cf, stm), which could mix platforms)
  const localData = log.filter(e => e.id === itemId && e.ts > cutoff).sort((a, b) => a.ts - b.ts).map(e => {
    let best = e.best;
    if (steamPriced && e.stm != null && e.stm > 0) best = e.stm;
    else if (!steamPriced && e.cf != null && e.cf > 0) best = e.cf;
    return { id: e.id, ts: e.ts, best, cf: e.cf, stm: e.stm, sp: e.sp || null, source: 'local' };
  });

  const steamData = item?.marketHash ? getSteamHistoryForChart(item.marketHash, days) : [];
  const steamSeries = steamData.map(p => ({
    id: itemId, ts: p.ts, best: p.price, cf: null, stm: p.price, sp: null, source: 'steam',
  }));

  if (steamPriced) {
    // Steam IS the pricing platform for these — use whichever series is richer
    return steamSeries.length > localData.length ? steamSeries : localData;
  }
  // CSFloat-priced items: the local CSFloat series is the correct platform.
  // Only fall back to Steam medians when local data is too sparse to trend
  // (flagged via source:'steam' so the UI can show it as an estimate).
  if (localData.length >= 2) return localData;
  return steamSeries.length >= 2 ? steamSeries : localData;
}

// Build sparkline SVG (inline, tiny, clickable)
function buildSparkline(itemId) {
  const history = getPriceHistory(itemId, 30);
  if (history.length < 2) return '';
  const prices = history.map(e => e.best).filter(v => v != null);
  if (prices.length < 2) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 80, h = 20;
  const step = w / (prices.length - 1);
  const points = prices.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(' ');
  const last = prices[prices.length - 1];
  const first = prices[0];
  const color = last >= first ? 'var(--green)' : 'var(--red)';
  const pctChange = ((last - first) / first * 100);
  const tooltip = `${prices.length} data points over 30d | ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`;
  return `<div class="sparkline-wrap" onclick="openPriceHistoryModal('${itemId}')" title="${tooltip}">
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

// ========================
// PRICE HISTORY MODAL
// ========================
let _phChart = null;
let _phItemId = null;
let _phRange = 30;

function openPriceHistoryModal(itemId) {
  _phItemId = itemId;
  _phRange = 30;
  const item = holdings.find(h => h.id === itemId) || (typeof skins !== 'undefined' ? skins.find(s => s.id === itemId) : null);
  const name = item ? item.name : itemId;
  document.getElementById('phModalTitle').textContent = `Price History — ${name}`;
  document.querySelectorAll('.ph-range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.days) === 30));
  document.getElementById('priceHistoryModal').classList.add('open');
  renderPriceHistoryChart();
}

function closePriceHistoryModal() {
  document.getElementById('priceHistoryModal').classList.remove('open');
  if (_phChart) { _phChart.destroy(); _phChart = null; }
}

function setPHRange(days) {
  _phRange = days;
  document.querySelectorAll('.ph-range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.days) === days));
  renderPriceHistoryChart();
}

function renderPriceHistoryChart() {
  if (!_phItemId) return;
  const history = getPriceHistory(_phItemId, _phRange || null);
  const _phItem = holdings.find(h => h.id === _phItemId) || (skins ? skins.find(s => s.id === _phItemId) : null);
  const hasSteamData = _phItem?.marketHash && getSteamHistoryForChart(_phItem.marketHash, _phRange || null).length > 0;
  const localLog = loadPriceLog().filter(e => e.id === _phItemId);
  const source = hasSteamData && history.length > localLog.length ? '🟦 Steam historical' : '📊 Local refreshes';
  document.getElementById('phDataPoints').textContent = `${history.length} points · ${source}`;

  if (history.length === 0) {
    if (_phChart) { _phChart.destroy(); _phChart = null; }
    document.getElementById('phSummary').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text3);font-size:13px;padding:20px;">No price data yet — hit "📈 Fetch Steam History" on the Analytics tab, or refresh prices to start tracking</div>';
    return;
  }

  // Clean date labels — just date, no time (for daily data)
  const labels = history.map(e => {
    const d = new Date(e.ts);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year: history.length > 90 ? '2-digit' : undefined });
  });

  const bestPrices = history.map(e => e.best);
  const volumes = history.map(e => e.volume || 0);
  const hasVolume = volumes.some(v => v > 0);

  // Determine if price went up or down
  const first = bestPrices.find(v => v != null);
  const last = [...bestPrices].reverse().find(v => v != null);
  const isUp = last >= first;
  const lineColor = isUp ? '#22c55e' : '#ef4444';

  const ctx = document.getElementById('priceHistoryChart').getContext('2d');
  if (_phChart) _phChart.destroy();

  // Create gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  if (isUp) {
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.25)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.08)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
  } else {
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
    gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.06)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
  }

  const datasets = [];

  // Main price line
  datasets.push({
    label: 'Price',
    data: bestPrices,
    borderColor: lineColor,
    backgroundColor: gradient,
    borderWidth: 2,
    fill: true,
    tension: 0.35,
    pointRadius: history.length > 30 ? 0 : 2,
    pointHoverRadius: 5,
    pointBackgroundColor: lineColor,
    pointBorderColor: lineColor,
    pointHoverBackgroundColor: '#fff',
    pointHoverBorderColor: lineColor,
    pointHoverBorderWidth: 2,
    yAxisID: 'y',
    order: 1,
  });

  // Buy price reference line (subtle)
  const item = holdings.find(h => h.id === _phItemId) || (typeof skins !== 'undefined' ? skins.find(s => s.id === _phItemId) : null);
  if (item) {
    datasets.push({
      label: 'Buy Price',
      data: history.map(() => item.buyPrice),
      borderColor: 'rgba(232, 153, 60, 0.4)',
      borderWidth: 1.5,
      borderDash: [8, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      yAxisID: 'y',
      order: 2,
    });
  }

  // Volume bars (if available from Steam data)
  if (hasVolume) {
    datasets.push({
      label: 'Volume',
      data: volumes,
      type: 'bar',
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      borderColor: 'rgba(34, 197, 94, 0.3)',
      borderWidth: 1,
      borderRadius: 2,
      yAxisID: 'y1',
      order: 3,
      barPercentage: 0.6,
      categoryPercentage: 0.8,
    });
  }

  const scales = {
    x: {
      ticks: {
        font: { family: "'Share Tech Mono', monospace", size: 10 },
        maxRotation: 0,
        maxTicksLimit: 8,
        color: 'rgba(255,255,255,0.35)',
      },
      grid: { display: false },
      border: { color: 'rgba(30,61,45,0.4)' },
    },
    y: {
      position: 'right',
      ticks: {
        font: { family: "'Share Tech Mono', monospace", size: 11 },
        callback: v => fmtMoney(Number(v), 2),
        color: 'rgba(255,255,255,0.4)',
        maxTicksLimit: 6,
      },
      grid: { color: 'rgba(30,61,45,0.25)', drawBorder: false },
      border: { display: false },
    },
  };

  if (hasVolume) {
    scales.y1 = {
      position: 'left',
      display: false,
      beginAtZero: true,
      max: Math.max(...volumes) * 4, // Keep bars small
    };
  }

  _phChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            font: { family: "'Share Tech Mono', monospace", size: 10 },
            boxWidth: 12,
            padding: 16,
            usePointStyle: true,
            color: 'rgba(255,255,255,0.5)',
            filter: (legendItem) => legendItem.text !== 'Volume', // Hide volume from legend
          }
        },
        tooltip: {
          backgroundColor: 'rgba(8,12,8,0.95)',
          borderColor: 'rgba(30,61,45,0.6)',
          borderWidth: 1,
          titleFont: { family: "'Share Tech Mono', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          titleColor: 'rgba(255,255,255,0.6)',
          bodyColor: '#e2e8f0',
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => {
              if (ctx.dataset.label === 'Volume') return `Volume: ${ctx.raw.toLocaleString()}`;
              if (ctx.raw != null) return `${ctx.dataset.label}: ${fmtMoney(Number(ctx.raw), 3)}`;
              return null;
            },
          }
        }
      },
      scales,
    },
  });

  // Summary stats
  const validBest = bestPrices.filter(v => v != null);
  if (validBest.length > 0) {
    const current = validBest[validBest.length - 1];
    const firstVal = validBest[0];
    const hi = Math.max(...validBest);
    const lo = Math.min(...validBest);
    const change = ((current - firstVal) / firstVal * 100);
    const changeColor = change >= 0 ? 'var(--green)' : 'var(--red)';
    const totalVol = volumes.reduce((s, v) => s + v, 0);
    document.getElementById('phSummary').innerHTML = `
      <div class="ph-stat"><div class="ph-stat-label">Current</div><div class="ph-stat-val">${fmtMoney(current, 3)}</div></div>
      <div class="ph-stat"><div class="ph-stat-label">Change</div><div class="ph-stat-val" style="color:${changeColor};">${change >= 0 ? '+' : ''}${change.toFixed(1)}%</div></div>
      <div class="ph-stat"><div class="ph-stat-label">High</div><div class="ph-stat-val" style="color:var(--green);">${fmtMoney(hi, 3)}</div></div>
      <div class="ph-stat"><div class="ph-stat-label">Low</div><div class="ph-stat-val" style="color:var(--red);">${fmtMoney(lo, 3)}</div></div>
      ${totalVol > 0 ? `<div class="ph-stat"><div class="ph-stat-label">Volume</div><div class="ph-stat-val">${totalVol.toLocaleString()}</div></div>` : ''}
    `;
  } else {
    document.getElementById('phSummary').innerHTML = '';
  }
}

let holdings = [];
let tradeHistory = [];
// Seed new holdings and trade history if missing
function seedNewItems() {
  // Add missing holdings
  const existingH = JSON.parse(window._store['cs2vault_holdings'] || '[]');
  const newItems = [
    {id:'case011',name:'Fever Case',                type:'case',qty:679, buyPrice:0.566,  buyDate:'',marketHash:'Fever Case',                notes:'Hold target: 2027 March-April',category:'austin',prices:null},
    {id:'case012',name:'Anubis Collection Package', type:'case',qty:84,  buyPrice:2.031,  buyDate:'',marketHash:'Anubis Collection Package', notes:'Total invested: £170.56',category:'austin',prices:null},
    {id:'case013',name:'CS:GO Weapon Case',                    type:'case',   qty:3,  buyPrice:80.261, buyDate:'',marketHash:'CS:GO Weapon Case',                    notes:'3 remaining of original 7',category:'austin',prices:null},
    {id:'sticker001',name:'Austin Legends Oct 2025 Capsule',   type:'sticker',qty:24, buyPrice:0.29,   buyDate:'',marketHash:'Austin 2025 Legends Sticker Capsule',   notes:'Total invested: £6.96',category:'austin',prices:null},
    {id:'sticker002',name:'Mongolz (Holo) | Austin 2025',      type:'sticker',qty:2,  buyPrice:2.60,   buyDate:'',marketHash:'Sticker | The Mongolz (Holo) | Austin 2025',      notes:'Total invested: £5.20',category:'austin',prices:null},
    {id:'sticker003',name:'Team Liquid (Holo) | Austin 2025',  type:'sticker',qty:1,  buyPrice:13.61,  buyDate:'',marketHash:'Sticker | Team Liquid (Holo) | Austin 2025',  notes:'Total invested: £13.61',category:'austin',prices:null},
    {id:'sticker004',name:'Natus Vincere (Gold) | Austin 2025',type:'sticker',qty:1,  buyPrice:1.80,   buyDate:'',marketHash:'Sticker | Natus Vincere (Gold) | Austin 2025',notes:'Total invested: £1.80',category:'austin',prices:null},
    {id:'charm001',name:'Die-cast AK (Orange)',type:'armory',qty:2, buyPrice:5.98, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Orange)',notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm002',name:'Die-cast AK (Blue)',  type:'armory',qty:23,buyPrice:5.75, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Blue)',  notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm003',name:'Die-cast AK (Gold)',  type:'armory',qty:11,buyPrice:5.80, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Gold)',  notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm004',name:'Die-cast AK (Red)',   type:'armory',qty:28,buyPrice:14.76,buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Red)',   notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm005a',name:'Diamond Dog (Low ID)',type:'armory',qty:3, buyPrice:14.00,buyDate:'2025-10-01',marketHash:'Charm | Diamond Dog',notes:'Low ID <10k pattern, 1st Gen Oct 2025',prices:null},
    {id:'charm005b',name:'Diamond Dog',              type:'armory',qty:3, buyPrice:14.00,buyDate:'2025-10-01',marketHash:'Charm | Diamond Dog',notes:'Standard, 1st Gen Oct 2025',prices:null},
    {id:'charm006',name:'Hot Wurst',           type:'armory',qty:4, buyPrice:24.04,buyDate:'2025-10-01',marketHash:'Charm | Hot Wurst',           notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm007',name:'Hot Howl',               type:'armory',qty:6,   buyPrice:37.91,  buyDate:'2025-10-01',marketHash:'Charm | Hot Howl',               notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'sticker010',name:'Hypnoteyes',             type:'sticker',qty:1282,buyPrice:1.258,  buyDate:'2025-09-01',marketHash:'Sticker | Hypnoteyes (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker011',name:'Sticker Clown Nose',     type:'sticker',qty:330, buyPrice:0.3112, buyDate:'2025-09-01',marketHash:'Sticker | Clown Nose (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker012',name:'Taste Buddy (Holo)',     type:'sticker',qty:20,  buyPrice:5.5315, buyDate:'2025-09-01',marketHash:'Sticker | Taste Buddy (Holo)',     notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker013',name:'Blinky',                 type:'sticker',qty:100, buyPrice:0.27,   buyDate:'2025-09-01',marketHash:'Sticker | Blinky (Holo)',                 notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker014',name:'Flex',                   type:'sticker',qty:626, buyPrice:0.6065, buyDate:'2025-09-01',marketHash:'Sticker | Flex (Holo)',                   notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker015',name:'Chompers',               type:'sticker',qty:574, buyPrice:0.2891, buyDate:'2025-09-01',marketHash:'Sticker | Chompers (Holo)',               notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker016',name:'From The Deep',          type:'sticker',qty:1432,buyPrice:0.1747, buyDate:'2025-09-01',marketHash:'Sticker | From the Deep (Holo)',          notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker017',name:'Glare',                  type:'sticker',qty:2000,buyPrice:0.133,  buyDate:'2025-09-01',marketHash:'Sticker | Glare (Holo)',                  notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker018',name:'Ribbon Tie',             type:'sticker',qty:110, buyPrice:0.3273, buyDate:'2025-09-01',marketHash:'Sticker | Ribbon Tie (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker019',name:'Fly High',               type:'sticker',qty:31,  buyPrice:0.159,  buyDate:'2025-09-01',marketHash:'Sticker | Fly High (Holo)',               notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker020',name:'From The Deep (Glitter)',type:'sticker',qty:401, buyPrice:0.51,   buyDate:'2025-09-01',marketHash:'Sticker | From the Deep (Glitter)',notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker021',name:'Bolt Strike',              type:'sticker',qty:198,  buyPrice:0.15,   buyDate:'2026-01-01',marketHash:'Sticker | Bolt Strike',              category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker022',name:'Bolt Charge',              type:'sticker',qty:1262, buyPrice:0.2667, buyDate:'2026-01-01',marketHash:'Sticker | Bolt Charge',              category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker023',name:'Boom Trail',               type:'sticker',qty:335,  buyPrice:0.09,   buyDate:'2026-01-01',marketHash:'Sticker | Boom Trail',               category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker024',name:'Boom Trail (Glitter)',     type:'sticker',qty:2741, buyPrice:0.2725, buyDate:'2026-01-01',marketHash:'Sticker | Boom Trail (Glitter)',     category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker025',name:'High Heat',                type:'sticker',qty:1117, buyPrice:0.6487, buyDate:'2026-01-01',marketHash:'Sticker | High Heat',                category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'gskin001',name:'M249 Spectrogram (FN)',    type:'skin',   qty:517, buyPrice:0.7028, buyDate:'2025-09-01',marketHash:'M249 | Spectrogram (Factory New)',          category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin002',name:'P2000 Coral Halftone (FN)',type:'skin',   qty:497, buyPrice:0.7444, buyDate:'2025-09-01',marketHash:'P2000 | Coral Halftone (Factory New)',        category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin003',name:'FAMAS Halftone (FN)',       type:'skin',   qty:190, buyPrice:0.7947, buyDate:'2025-09-01',marketHash:'FAMAS | Halftone Wash (Factory New)',               category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin004',name:'Galil NV (FN)',             type:'skin',   qty:159, buyPrice:0.7458, buyDate:'2025-09-01',marketHash:'Galil AR | NV (Factory New)',          category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin005',name:'SSG Halftone Whorl (FN)',   type:'skin',   qty:710, buyPrice:0.6778, buyDate:'2025-09-01',marketHash:'SSG 08 | Halftone Whorl (Factory New)',        category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin006',name:'MP5-SD Statics (FT)',        type:'skin',   qty:362, buyPrice:0.2382, buyDate:'2025-10-01',marketHash:'MP5-SD | Statics (Field-Tested)',             category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin007',name:'M249 Hypnosis (FT)',          type:'skin',   qty:396, buyPrice:0.2326, buyDate:'2025-10-01',marketHash:'M249 | Hypnosis (Field-Tested)',               category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin008',name:'SCAR-20 Trail Blazer (FT)',   type:'skin',   qty:418, buyPrice:0.2376, buyDate:'2025-10-01',marketHash:'SCAR-20 | Trail Blazer (Field-Tested)',        category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin009',name:'R8 Revolver Tango (FT)',      type:'skin',   qty:609, buyPrice:0.2348, buyDate:'2025-10-01',marketHash:'R8 Revolver | Tango (Field-Tested)',           category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin010',name:'AUG Luxe Trim (FT)',          type:'skin',   qty:796, buyPrice:0.2405, buyDate:'2025-10-01',marketHash:'AUG | Luxe Trim (Field-Tested)',               category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
  ];
  let changed = false;
  newItems.forEach(item => {
    if (!existingH.some(h => h.id === item.id)) {
      existingH.push(item);
      changed = true;
    }
  });
  if (changed) {
    window._storeSet('cs2vault_holdings', JSON.stringify(existingH));
    holdings = existingH;
  }

  // Add WC1 trade history if missing
  const existingT = JSON.parse(window._store['cs2vault_history'] || '[]');
  const wc1Trades = [
    {id:'trade001',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:123.04,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade002',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:123.04,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade003',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:122.54,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade004',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:122.95,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade005',name:'Gamma Case',               type:'case',   qty:1,buyPrice:790.09,  sellPrice:1356.62, sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade006',name:'FAMAS BAD TRIP (MW)',      type:'skin',   qty:1,buyPrice:4.08,    sellPrice:36.54,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade007',name:'FAMAS STYX (FN)',          type:'skin',   qty:1,buyPrice:31.27,   sellPrice:86.31,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade008',name:'Gallery Case',             type:'case',   qty:1,buyPrice:524.53,  sellPrice:911.06,  sellDate:'',feePercent:2,platform:'csfloat'},
    {id:'trade009',name:'STILETTO RUBY (MW)',       type:'knife',  qty:1,buyPrice:1279.24, sellPrice:1350.71, sellDate:'',feePercent:2,platform:'csfloat'},
    {id:'trade010',name:'Austin Contenders',        type:'sticker',qty:1,buyPrice:140.4,   sellPrice:253.6,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade011',name:'G2 Austin (Holo)',         type:'sticker',qty:1,buyPrice:7.83,    sellPrice:11.25,   sellDate:'',feePercent:15,platform:'steam'},
  ];
  let tChanged = false;
  wc1Trades.forEach(t => {
    if (!existingT.some(h => h.id === t.id)) { existingT.push(t); tChanged = true; }
  });
  if (tChanged) {
    window._storeSet('cs2vault_history', JSON.stringify(existingT));
    tradeHistory = existingT;
  }
}
let sortKey = 'name', sortDir = 1, currentFilter = '';

// ========================
// VAULT PRO — FEATURE GATING (Phase 4a)
// ========================
// Single source of truth for free vs Pro. Every gated feature routes through
// isPro() — NOTHING reads the override key directly. In Phase 4b, isPro()'s body
// swaps from "read local override" to "read validated Paddle licence token"
// (Paddle-native validation, webhook on Cloudflare Workers) with zero changes to
// any gated feature. The override flag stays respected for dev/preview use.
const PRO_OVERRIDE_KEY = 'cs2vault_pro_override';

// FEATURES map — the canonical list of every gateable capability and its tier.
// tier: 'free' (never gated) | 'pro' (gated behind isPro()).
const FEATURES = {
  // --- FREE: the core tracker ---
  holdings:        { tier: 'free', label: 'Holdings tracker' },
  playSkins:       { tier: 'free', label: 'Play Skins' },
  tradeHistory:    { tier: 'free', label: 'Trade History' },
  pricing:         { tier: 'free', label: 'Live pricing & refresh' },
  watchlist:       { tier: 'free', label: 'Watchlist & alerts' },
  caseIntel:       { tier: 'free', label: 'Case Intel' },
  analytics:       { tier: 'free', label: 'Analytics' },
  healthReport:    { tier: 'free', label: 'Portfolio health' },
  csvImport:       { tier: 'free', label: 'CSV import' },
  ukTaxSummary:    { tier: 'free', label: 'UK CGT summary (on-screen)' },
  // --- PRO: the accounting & tax engine (the paywall) ---
  cashOut:         { tier: 'pro', label: 'Cash Out Calculator',
                     blurb: 'Model a full cashout — Steam sell → bridge skin → CSFloat sell → withdraw → cash — with the fee chain and a CGT estimate on the realised proceeds.' },
  csvExport:       { tier: 'pro', label: 'CSV export',
                     blurb: 'Export your holdings and trade history to CSV. Importing is always free — exporting your data out is a Vault Pro feature.' },
  multiJurisdiction: { tier: 'pro', label: 'Multi-jurisdiction tax engine (US / DE / CA)',
                       blurb: 'Unlock US (short/long-term), Germany (1-year exemption) and Canada (ACB, 50% inclusion) tax profiles, with holding-period classification and tax-currency reporting.' },
  taxReportExport:   { tier: 'pro', label: 'Tax report export',
                       blurb: 'Export the full per-jurisdiction CGT report — disposal schedule, holding-period columns, allowance/exemption lines — the document you hand your accountant.' },
  costBasisMethod:   { tier: 'pro', label: 'Cost-basis methods',
                       blurb: 'Choose your accounting methodology — FIFO or specific identification — instead of the default pooling.' },
  multiCurrencyDisplay: { tier: 'pro', label: 'Multi-currency display',
                          blurb: 'View your whole portfolio, P&L and analytics in any of 12 currencies, converted at live ECB rates. The app is fully usable in GBP on the free tier.' },
  multiCurrencyEntry:   { tier: 'pro', label: 'Multi-currency entry',
                          blurb: 'Record buys, sells and top-ups in any currency, converted to your base at the transaction-date FX rate with full provenance.' },
};

// isPro() — the ONE check. Reads the local override for now (Phase 4a).
// Phase 4b replaces the body with a Paddle licence check; callers never change.
function isPro() {
  // Phase 4b precedence (highest → lowest):
  //   1. Dev/preview override (Settings toggle) — always wins, for dev & support.
  //   2. A validated Paddle licence (active, or within the offline grace window).
  //   3. An in-date no-card trial.
  // Any one being true unlocks Pro. The override is checked first so support can
  // always force-unlock regardless of licence/trial state.
  try {
    if (window._store[PRO_OVERRIDE_KEY] === 'true') return true;
  } catch (e) {}
  try { if (_licenceIsActive()) return true; } catch (e) {}
  try { if (_trialIsActive()) return true; } catch (e) {}
  return false;
}

// ========================
// VAULT PRO — PAYMENTS, LICENSING & TRIAL (Phase 4b)
// ========================
// Paddle (merchant of record) handles checkout + global tax. Licence validation
// is Paddle-native: a Cloudflare Worker receives Paddle webhooks and answers a
// single question — "is this licence key currently paid?" The app calls that
// Worker, caches the answer locally, and honours a ~14-day offline grace so a
// flaky connection never locks out a paying user. NO self-hosted licence server.
//
// ── EXTERNAL SETUP REQUIRED (see PADDLE-SETUP.md) ───────────────────────────
// Everything Rudi must paste in lives in PRO_CONFIG below. Until it's filled in,
// checkout shows a "not yet available" notice and validation no-ops gracefully
// (trial + override still work). Nothing here hardcodes a price — PRO_CONFIG
// carries display strings only; the real charge is whatever the Paddle price IDs
// are set to in the Paddle dashboard.
const PRO_CONFIG = {
  // ── Paddle (Billing / v2) ─────────────────────────────────────────────────
  // From Paddle dashboard → Developer Tools → Authentication / Catalog.
  paddleVendorToken: '',          // Paddle "client-side token" (starts live_ or test_)
  paddleEnvironment: 'sandbox',   // 'sandbox' while testing, 'production' when live
  priceIdMonthly:    '',          // Paddle price ID for the monthly plan (pri_...)
  priceIdAnnual:     '',          // Paddle price ID for the annual plan (pri_...)

  // ── Licence validation Worker (Cloudflare) ────────────────────────────────
  // The deployed Worker URL from PADDLE-SETUP.md, e.g.
  // 'https://cs2vault-licence.<your-subdomain>.workers.dev'. Leave blank to
  // disable network validation (trial/override still function).
  licenceApiBase: '',

  // ── Pricing DISPLAY ONLY (single source of truth for shown copy) ──────────
  // The actual amount charged is set by the Paddle price IDs above — these are
  // just the strings shown in-app. Benchmark: SkinKeeper Pro ~$4.99/mo·$34.99/yr.
  // Rudi finalises the number in Paddle; update these to match. DO NOT hardcode
  // a charge anywhere else.
  priceMonthlyDisplay: '$4.99 / mo',
  priceAnnualDisplay:  '$34.99 / yr',

  // ── Trial ─────────────────────────────────────────────────────────────────
  trialDays: 14,                  // no-card Pro trial length
  // ── Offline grace ─────────────────────────────────────────────────────────
  graceDays: 14,                  // keep Pro unlocked this long after last good check
  // ── Re-validation cadence ─────────────────────────────────────────────────
  revalidateHours: 24,            // how often to re-check a cached active licence
};
function proConfigured()  { return !!(PRO_CONFIG.paddleVendorToken && PRO_CONFIG.priceIdAnnual); }
function licenceApiReady() { return !!PRO_CONFIG.licenceApiBase; }

// ── Storage keys (loaded at launch via STORE_KEYS in index.html) ───────────
const LICENCE_KEY        = 'cs2vault_licence';        // user's licence key string
const LICENCE_STATE_KEY  = 'cs2vault_licence_state';  // cached validation JSON
const TRIAL_START_KEY    = 'cs2vault_trial_start';    // ISO date trial began

// ── Licence state cache shape ───────────────────────────────────────────────
// { status:'active'|'inactive', checkedAt:<ms>, key:<string>, plan:<string|null>,
//   cancelledAt:<ms|null> }
function _loadLicenceState() {
  try { return JSON.parse(window._store[LICENCE_STATE_KEY]) || null; }
  catch (e) { return null; }
}
function _saveLicenceState(state) {
  try { window._storeSet(LICENCE_STATE_KEY, JSON.stringify(state)); } catch (e) {}
}
function getLicenceKey() { try { return (window._store[LICENCE_KEY] || '').trim(); } catch (e) { return ''; } }

// True if we hold a licence the last check called 'active' AND that check is
// still within the offline-grace window. Network failures NEVER downgrade a
// previously-active user inside grace — that's the whole point.
function _licenceIsActive() {
  const st = _loadLicenceState();
  if (!st || st.status !== 'active') return false;
  if (!st.checkedAt) return false;
  const ageMs = Date.now() - st.checkedAt;
  const graceMs = PRO_CONFIG.graceDays * 86400000;
  return ageMs <= graceMs;
}

// ── Trial ───────────────────────────────────────────────────────────────────
// Starts automatically on first launch of a fresh install (set in initApp).
// A user who already paid never needs it; a returning free user keeps whatever
// days remain. Tampering is possible (local clock) but this is a low-value,
// honour-system trial — acceptable for a solo indie product.
function _trialStartMs() {
  const iso = window._store[TRIAL_START_KEY];
  if (!iso) return null;
  const ms = Date.parse(iso);
  return isNaN(ms) ? null : ms;
}
function ensureTrialStarted() {
  // Only begin a trial for genuinely fresh installs, and only once.
  if (_trialStartMs() != null) return;
  try {
    if (typeof isFreshInstall === 'function' && !isFreshInstall()) return;
  } catch (e) {}
  try { window._storeSet(TRIAL_START_KEY, new Date().toISOString()); } catch (e) {}
}
function trialDaysLeft() {
  const start = _trialStartMs();
  if (start == null) return 0;
  const elapsedDays = (Date.now() - start) / 86400000;
  return Math.max(0, Math.ceil(PRO_CONFIG.trialDays - elapsedDays));
}
function _trialIsActive() { return trialDaysLeft() > 0; }

// What's unlocking Pro right now? For UI copy. Order mirrors isPro().
function proStatus() {
  let override = false;
  try { override = window._store[PRO_OVERRIDE_KEY] === 'true'; } catch (e) {}
  if (override) return { tier: 'pro', reason: 'override' };
  if (_licenceIsActive()) {
    const st = _loadLicenceState();
    return { tier: 'pro', reason: 'licence', plan: st && st.plan || null };
  }
  if (_trialIsActive()) return { tier: 'pro', reason: 'trial', daysLeft: trialDaysLeft() };
  // Expired licence (out of grace) vs expired trial vs never-pro — useful for copy.
  const st = _loadLicenceState();
  if (st && st.status === 'active') return { tier: 'free', reason: 'grace-expired' };
  if (_trialStartMs() != null) return { tier: 'free', reason: 'trial-expired' };
  return { tier: 'free', reason: 'free' };
}

// ── Paddle checkout ─────────────────────────────────────────────────────────
// Opens Paddle's hosted checkout in the user's browser (via the existing
// shell.openExternal window-open handler — any <a target="_blank"> or
// window.open already routes there). We use Paddle's "pay link" hosted page so
// no Paddle.js bundle is needed inside the Electron renderer (keeps CSP simple
// and avoids shipping their SDK). The licence key Paddle issues post-purchase is
// emailed to the customer; they paste it into Settings → Activate.
function startProCheckout(plan) {
  if (!proConfigured()) {
    toast('Checkout isn\'t set up yet — see PADDLE-SETUP.md. Use the preview override in Settings to explore Pro now.', 'info');
    return;
  }
  const priceId = plan === 'monthly' ? PRO_CONFIG.priceIdMonthly : PRO_CONFIG.priceIdAnnual;
  if (!priceId) { toast('That plan isn\'t configured in PRO_CONFIG yet.', 'warn'); return; }
  // Paddle Billing hosted checkout deep link. The customer completes payment in
  // their browser; Paddle fulfils + emails the licence key (Worker-generated).
  const env = PRO_CONFIG.paddleEnvironment === 'production' ? 'buy' : 'sandbox-buy';
  const url = 'https://' + env + '.paddle.com/checkout/' + encodeURIComponent(priceId);
  try { window.open(url, '_blank'); }
  catch (e) { toast('Could not open the checkout window.', 'error'); }
  toast('Opening Paddle checkout in your browser. After paying, paste the licence key from your email into Settings → Activate.', 'info');
}

// Open a bundled legal page (privacy / terms) in the user's browser. The files
// ship in the app's legal/ folder; we resolve their on-disk path via the same
// window-open handler that powers external links.
function openLegal(which) {
  const file = which === 'terms' ? 'terms.html' : 'privacy.html';
  // legal/ sits next to src/ in the packaged app. Build a file:// URL relative
  // to the running index.html so it works both packaged and in dev.
  try {
    const base = window.location.href.replace(/\/src\/index\.html.*$/, '/');
    window.open(base + 'legal/' + file, '_blank');
  } catch (e) {
    toast('Could not open the document.', 'error');
  }
}

// ── Licence activation + validation ─────────────────────────────────────────
// Called when the user pastes a licence key, and on launch for a stored key.
// Talks to the Cloudflare Worker: GET {licenceApiBase}/validate?key=...&product=cs2vault
// Worker replies { active:true|false, plan, cancelledAt }. On a network error we
// DO NOT change a within-grace active state (offline grace). Returns a result
// object for the caller to surface; never throws.
async function validateLicence(key, opts) {
  opts = opts || {};
  key = (key || getLicenceKey()).trim();
  if (!key) return { ok: false, status: 'no-key' };
  if (!licenceApiReady()) {
    // No Worker configured yet: accept the key locally as "pending" so the user
    // isn't blocked during setup, but mark it so we re-check once the URL exists.
    const pending = { status: 'active', checkedAt: Date.now(), key: key, plan: 'unverified', cancelledAt: null, pending: true };
    _saveLicenceState(pending);
    try { window._storeSet(LICENCE_KEY, key); } catch (e) {}
    return { ok: true, status: 'pending-no-api', state: pending };
  }
  const base = PRO_CONFIG.licenceApiBase.replace(/\/+$/, '');
  const url = base + '/validate?key=' + encodeURIComponent(key) + '&product=cs2vault';
  try {
    const res = await window.cs2vault.fetch(url, { 'Accept': 'application/json' });
    let data = {};
    try { data = JSON.parse(res.body || '{}'); } catch (e) { data = {}; }
    if (res.status >= 200 && res.status < 300 && typeof data.active === 'boolean') {
      const state = {
        status: data.active ? 'active' : 'inactive',
        checkedAt: Date.now(),
        key: key,
        plan: data.plan || null,
        cancelledAt: data.cancelledAt || null,
      };
      _saveLicenceState(state);
      try { window._storeSet(LICENCE_KEY, key); } catch (e) {}
      return { ok: true, status: state.status, state: state };
    }
    // Bad/blank response: treat as a soft failure (keep grace), unless the
    // Worker explicitly said the key is unknown (404).
    if (res.status === 404) {
      const state = { status: 'inactive', checkedAt: Date.now(), key: key, plan: null, cancelledAt: null };
      _saveLicenceState(state);
      return { ok: true, status: 'inactive', state: state };
    }
    return { ok: false, status: 'bad-response', httpStatus: res.status };
  } catch (e) {
    // Network failure — DO NOT touch cached state (offline grace protects us).
    return { ok: false, status: 'network-error' };
  }
}

// Re-validate a stored active licence on launch, but not more than once per
// revalidateHours, and never blocking the UI. Safe to call fire-and-forget.
async function refreshLicenceIfDue() {
  const key = getLicenceKey();
  if (!key) return;
  const st = _loadLicenceState();
  const dueMs = PRO_CONFIG.revalidateHours * 3600000;
  if (st && st.checkedAt && (Date.now() - st.checkedAt) < dueMs && !st.pending) return;
  await validateLicence(key, { silent: true });
  try { syncProUI(); } catch (e) {}
}

// User pasted a key in Settings → Activate. Validate + refresh all tier UI.
async function activateLicenceFromInput() {
  const input = document.getElementById('licenceKeyInput');
  const key = input ? (input.value || '').trim() : '';
  if (!key) { toast('Paste your licence key first.', 'warn'); return; }
  toast('Checking licence…', 'info');
  const r = await validateLicence(key);
  if (r.ok && r.status === 'active') {
    toast('Licence active — Vault Pro unlocked. Thank you!', 'success');
  } else if (r.ok && r.status === 'pending-no-api') {
    toast('Licence saved. Online validation will run once the licence server URL is configured.', 'info');
  } else if (r.ok && r.status === 'inactive') {
    toast('That licence key isn\'t active. If you just paid, give it a minute and try again.', 'warn');
  } else if (r.status === 'network-error') {
    toast('Could not reach the licence server. Check your connection and retry.', 'error');
  } else {
    toast('Licence check failed (' + (r.status || 'unknown') + '). Try again shortly.', 'error');
  }
  try { setProSurfaces(); } catch (e) {}
}

// Remove a stored licence (sign out of Pro on this machine).
function deactivateLicence() {
  if (!confirm('Remove the licence from this machine? You can re-activate with the same key anytime.')) return;
  try { window._storeSet(LICENCE_KEY, ''); } catch (e) {}
  _saveLicenceState({ status: 'inactive', checkedAt: Date.now(), key: '', plan: null, cancelledAt: null });
  toast('Licence removed from this machine.', 'info');
  try { setProSurfaces(); } catch (e) {}
}

// Re-sync everything that changes between tiers (shared by override + licence).
function setProSurfaces() {
  try { syncProUI(); } catch (e) {}
  try { syncCostBasisSettingsUI(); } catch (e) {}
  try { populateCcySelects(); } catch (e) {}
  try { syncDisplayCcyLock(); } catch (e) {}
  try { syncJurisdictionLock(); } catch (e) {}
  try { renderHistory(); } catch (e) {}
  try { renderHoldings(); updateStats(); } catch (e) {}
  try { renderSkins(); } catch (e) {}
}

// True if a given feature key is currently usable by this user.
function featureUnlocked(key) {
  const f = FEATURES[key];
  if (!f) return true;            // unknown key → fail open (never gate by accident)
  if (f.tier === 'free') return true;
  return isPro();
}

// Dev/preview toggle (Settings) — flips the whole app between locked/unlocked
// so both states are visible without any payment system. Phase 4b keeps this as
// a dev override layered on top of the real licence check.
function setProOverride(on) {
  window._storeSet(PRO_OVERRIDE_KEY, on ? 'true' : 'false');
  // Re-sync every surface that changes between tiers (shared helper).
  try { setProSurfaces(); } catch (e) {}
  toast(on ? 'Pro features unlocked (preview override ON)' : 'Pro override OFF — free tier', on ? 'success' : 'info');
}

// Reflect the override switch state in Settings (called from updateSettingsInfo).
function syncProUI() {
  const t = document.getElementById('proOverrideToggle');
  if (t) { try { t.checked = window._store[PRO_OVERRIDE_KEY] === 'true'; } catch (e) {} }
  const ps = (function(){ try { return proStatus(); } catch (e) { return { tier: isPro() ? 'pro' : 'free', reason: 'free' }; } })();
  const badge = document.getElementById('proTierBadge');
  if (badge) {
    let txt = ps.tier === 'pro' ? 'PRO' : 'FREE';
    if (ps.tier === 'pro' && ps.reason === 'trial') txt = 'PRO · TRIAL';
    badge.textContent = txt;
    badge.className = 'pro-tier-badge ' + (ps.tier === 'pro' ? 'is-pro' : 'is-free');
  }
  try { syncLicenceUI(ps); } catch (e) {}
  try { syncProButtons(); } catch (e) {}
}

// Update the licence/checkout/activation block in Settings to match state.
function syncLicenceUI(ps) {
  ps = ps || proStatus();
  const statusEl = document.getElementById('licenceStatusLine');
  if (statusEl) {
    let msg = '';
    if (ps.reason === 'override') {
      msg = 'Preview override ON — Pro features unlocked locally for evaluation.';
    } else if (ps.reason === 'licence') {
      msg = 'Licence active' + (ps.plan ? ' (' + escHtml(ps.plan) + ' plan)' : '') + ' — thank you for supporting Vault Pro.';
    } else if (ps.reason === 'trial') {
      msg = 'Free Pro trial — ' + ps.daysLeft + ' day' + (ps.daysLeft === 1 ? '' : 's') + ' remaining. No card needed.';
    } else if (ps.reason === 'grace-expired') {
      msg = 'Your licence couldn\'t be confirmed recently and the offline grace period has lapsed. Reconnect and re-activate to restore Pro.';
    } else if (ps.reason === 'trial-expired') {
      msg = 'Your free trial has ended. Upgrade to Vault Pro to keep the accounting & tax engine.';
    } else {
      msg = 'You\'re on the free tier. Upgrade to Vault Pro for the multi-jurisdiction tax engine, report export, cost-basis methods and multi-currency.';
    }
    statusEl.innerHTML = msg;
  }
  // Show the key field's current value (masked-ish — just the stored key).
  const keyInput = document.getElementById('licenceKeyInput');
  if (keyInput && !keyInput.value) { try { keyInput.value = getLicenceKey(); } catch (e) {} }
  // Pricing display strings.
  const pm = document.getElementById('proPriceMonthly');
  if (pm) pm.textContent = PRO_CONFIG.priceMonthlyDisplay;
  const pa = document.getElementById('proPriceAnnual');
  if (pa) pa.textContent = PRO_CONFIG.priceAnnualDisplay;
  // If checkout isn't configured yet, show a setup notice in place of buttons.
  const notice = document.getElementById('checkoutSetupNotice');
  const buyRow = document.getElementById('checkoutButtonsRow');
  const configured = (function(){ try { return proConfigured(); } catch (e) { return false; } })();
  if (notice) notice.style.display = configured ? 'none' : 'block';
  if (buyRow) buyRow.style.display = configured ? 'flex' : 'none';
}

// Show/hide the inline PRO badge on each gated toolbar button by tier.
function syncProButtons() {
  const map = {
    proBadgeExportCSV:  'csvExport',
    proBadgeExportHist: 'csvExport',
    proBadgeCashOut:    'cashOut',
    proBadgeCGTReport:  'taxReportExport',
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = featureUnlocked(map[id]) ? 'none' : 'inline-block';
  });
}

// Standard lock-panel HTML for a gated feature (badge + explanation, no popups).
// Used inline where a Pro feature would otherwise render.
function proLockPanel(featureKey) {
  const f = FEATURES[featureKey] || {};
  const blurb = f.blurb || 'This is a Vault Pro feature.';
  return '<div class="pro-lock">'
    + '<div class="pro-lock-badge">◆ PRO</div>'
    + '<div class="pro-lock-body">'
    +   '<div class="pro-lock-title">' + escHtml(f.label || 'Vault Pro') + '</div>'
    +   '<div class="pro-lock-blurb">' + escHtml(blurb) + '</div>'
    +   '<div class="pro-lock-hint">Available in Vault Pro. Settings → enable the preview override to explore it now.</div>'
    + '</div></div>';
}

// Small inline "PRO" badge for labels/option text.
function proBadge() { return '<span class="pro-inline-badge">PRO</span>'; }

// One-line non-naggy toast pointing at the locked feature (used when a free user
// interacts with a gated control). Not a popup — uses the existing toast system.
function showProToast(featureKey) {
  const f = FEATURES[featureKey] || {};
  toast((f.label || 'This') + ' is a Vault Pro feature — enable the preview override in Settings to explore it', 'info');
}

// Disable/enable the Settings display-currency dropdown by tier, clamping to GBP
// when locked. Lock visual handled by a small PRO badge in the heading (HTML).
function syncDisplayCcyLock() {
  const sel = document.getElementById('settingsDisplayCcy');
  const lock = document.getElementById('displayCcyProBadge');
  const unlocked = featureUnlocked('multiCurrencyDisplay');
  if (sel) {
    if (!unlocked) sel.value = 'GBP';
    sel.disabled = !unlocked;
    sel.style.opacity = unlocked ? '1' : '0.55';
  }
  if (lock) lock.style.display = unlocked ? 'none' : 'inline-block';
}

// Disable/enable the Settings jurisdiction dropdown's non-UK options by tier.
function syncJurisdictionLock() {
  const sel = document.getElementById('settingsJurisdiction');
  const lock = document.getElementById('jurisdictionProBadge');
  const unlocked = featureUnlocked('multiJurisdiction');
  if (sel) {
    Array.from(sel.options).forEach(o => {
      if (o.value !== 'UK') { o.disabled = !unlocked; }
    });
    if (!unlocked) sel.value = 'UK';
  }
  if (lock) lock.style.display = unlocked ? 'none' : 'inline-block';
}

// ========================
// FIRST-RUN ONBOARDING WIZARD (Phase 4a)
// ========================
// Runs ONCE on a genuinely fresh install. Skippable, never blocks the app, never
// shows again once completed or skipped (cs2vault_onboarded flag). Reuses the
// existing settings storage keys/setters — no duplicated logic. Display currency
// and tax jurisdiction are written as the user's stored PREFERENCE even on the
// free tier (the getters clamp them to GBP/UK at render time), so the choice is
// honoured automatically if the user later upgrades to Pro.

let _obStep = 1;
const _OB_LAST_STEP = 4;

function maybeStartOnboarding() {
  if (!isFreshInstall()) return;
  if (hasOnboarded()) return;
  startOnboarding();
}

function startOnboarding() {
  _obStep = 1;
  // Populate the wizard currency dropdown from the canonical list.
  const ccy = document.getElementById('obDisplayCcy');
  if (ccy && !ccy.options.length && Array.isArray(SUPPORTED_CURRENCIES)) {
    SUPPORTED_CURRENCIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c.code; o.textContent = c.label || c.code;
      ccy.appendChild(o);
    });
    ccy.value = 'GBP';
  }
  // Reflect any already-stored values (defensive — usually none on fresh install).
  const jur = document.getElementById('obJurisdiction');
  if (jur) jur.value = window._store[TAX_JURISDICTION_KEY] || 'UK';
  const ak = document.getElementById('obApiKey');
  if (ak) ak.value = window._store['cs2vault_apikey'] || '';
  const pk = document.getElementById('obPricempireKey');
  if (pk) pk.value = window._store[PRICEMPIRE_KEY_STORE] || '';
  _obShowStep(1);
  const ov = document.getElementById('onboardModal');
  if (ov) ov.classList.add('open');
}

function _obShowStep(n) {
  _obStep = n;
  for (let i = 1; i <= _OB_LAST_STEP; i++) {
    const s = document.getElementById('obStep' + i);
    if (s) s.style.display = (i === n) ? 'block' : 'none';
  }
  // Progress dots
  for (let i = 1; i <= _OB_LAST_STEP; i++) {
    const d = document.getElementById('obDot' + i);
    if (d) d.className = 'ob-dot' + (i === n ? ' active' : (i < n ? ' done' : ''));
  }
  // Back button hidden on step 1
  const back = document.getElementById('obBackBtn');
  if (back) back.style.visibility = (n === 1) ? 'hidden' : 'visible';
  // Next button label: "Finish" on the last step
  const next = document.getElementById('obNextBtn');
  if (next) next.textContent = (n === _OB_LAST_STEP) ? 'Finish' : 'Next';
}

function obNext() {
  if (_obStep < _OB_LAST_STEP) { _obShowStep(_obStep + 1); return; }
  obFinish();
}

function obBack() {
  if (_obStep > 1) _obShowStep(_obStep - 1);
}

// Persist whatever the user entered, mark onboarded, close. Each field is
// optional — a blank field just leaves the existing/default value.
function obFinish() {
  try {
    const ccy = document.getElementById('obDisplayCcy');
    if (ccy && ccy.value) {
      // Store the preference directly (bypasses the Pro gate on setDisplayCurrency
      // so the choice survives a later upgrade; getDisplayCurrency() still clamps
      // free users to GBP at render time).
      window._storeSet(DISPLAY_CCY_KEY, ccy.value);
    }
    const jur = document.getElementById('obJurisdiction');
    if (jur && jur.value && JURISDICTION_METHODS[jur.value]) {
      window._storeSet(TAX_JURISDICTION_KEY, jur.value);
      if (jur.value === 'UK') window._storeSet(COST_BASIS_KEY, 'pooling');
      else window._storeSet(COST_BASIS_KEY, JURISDICTION_METHODS[jur.value]);
    }
    const ak = document.getElementById('obApiKey');
    if (ak && ak.value.trim()) saveApiKey(ak.value.trim());
    const pk = document.getElementById('obPricempireKey');
    if (pk && pk.value.trim()) window._storeSet(PRICEMPIRE_KEY_STORE, pk.value.trim());
  } catch (e) { console.warn('[onboarding] save failed:', e); }
  _finishOnboardingCommon();
  toast('Setup complete — welcome to CS2 Vault', 'success');
}

function obSkip() {
  _finishOnboardingCommon();
}

// Shared close path — set the flag, re-init currency display, refresh settings UI.
function _finishOnboardingCommon() {
  window._storeSet(ONBOARDED_KEY, 'true');
  const ov = document.getElementById('onboardModal');
  if (ov) ov.classList.remove('open');
  // Apply the chosen settings to the live UI.
  try { initDisplayCurrency().then(() => { try { renderHoldings(); updateStats(); renderSkins(); } catch(e){} }); } catch(e){}
  try { syncCostBasisSettingsUI(); } catch(e){}
  try { syncJurisdictionLock(); } catch(e){}
  try { syncDisplayCcyLock(); } catch(e){}
  try {
    const apiEl = document.getElementById('apiKeyInput');
    if (apiEl) apiEl.value = getApiKey() || '';
    const sApi = document.getElementById('settingsApiKey');
    if (sApi) sApi.value = getApiKey() || '';
  } catch(e){}
  try { checkApiStatus(); } catch(e){}
}

// Allow re-running the wizard from Settings (e.g. to reconfigure) — does not
// touch the onboarded flag's "never auto-show again" guarantee.
function reopenOnboarding() {
  startOnboarding();
}

// ========================
// API KEY
// ========================
function getApiKey() { return window._store['cs2vault_apikey'] || ''; }
function saveApiKey(key) {
  window._storeSet('cs2vault_apikey', key.trim());
  checkApiStatus();
}
function checkApiStatus() {
  const key = getApiKey();
  if (!key) {
    document.getElementById('apiStatus').className = 'status-dot offline';
    document.getElementById('apiStatusText').textContent = 'NO API KEY';
    return;
  }
  window.cs2vault.fetch('https://csfloat.com/api/v1/me', { 'Authorization': key })
    .then(r => {
      const ok = r.ok;
      document.getElementById('apiStatus').className = ok ? 'status-dot' : 'status-dot offline';
      document.getElementById('apiStatusText').textContent = ok ? 'CSFLOAT LIVE' : 'KEY INVALID';
    })
    .catch(() => {
      document.getElementById('apiStatus').className = 'status-dot offline';
      document.getElementById('apiStatusText').textContent = 'CSFLOAT OFFLINE';
    });
}

// ========================
// CSFLOAT PRICING
// ========================
// ========================
// FX LAYER (v2.9.0 — Phase 1 multi-currency foundation)
// Base currency is GBP: all stored amounts (buyPrice, sellPrice, gross, fees,
// price log, snapshots) remain GBP. Records carry provenance fields
// (origCurrency, origAmount, fxRate = orig→GBP at the TRANSACTION DATE).
// Display currency converts base→display at the live rate for rendering only.
// CGT / Trade History / exports are ALWAYS GBP (UK tax currency).
// ========================
const FX_CACHE_KEY = 'cs2vault_fx_cache';        // { "YYYY-MM-DD|FROM|TO": rate } — historical rates never change, cached forever
const DISPLAY_CCY_KEY = 'cs2vault_display_currency';
const SUPPORTED_CURRENCIES = [
  { code:'GBP', sym:'£',   label:'GBP — British Pound' },
  { code:'USD', sym:'$',   label:'USD — US Dollar' },
  { code:'EUR', sym:'€',   label:'EUR — Euro' },
  { code:'CAD', sym:'CA$', label:'CAD — Canadian Dollar' },
  { code:'AUD', sym:'A$',  label:'AUD — Australian Dollar' },
  { code:'CHF', sym:'CHF ',label:'CHF — Swiss Franc' },
  { code:'JPY', sym:'¥',   label:'JPY — Japanese Yen' },
  { code:'PLN', sym:'zł',  label:'PLN — Polish Złoty' },
  { code:'SEK', sym:'kr',  label:'SEK — Swedish Krona' },
  { code:'NOK', sym:'kr',  label:'NOK — Norwegian Krone' },
  { code:'DKK', sym:'kr',  label:'DKK — Danish Krone' },
  { code:'CNY', sym:'CN¥', label:'CNY — Chinese Yuan' },
];
function curSymOf(code) {
  const c = SUPPORTED_CURRENCIES.find(x => x.code === code);
  return c ? c.sym : (code + ' ');
}
// Fill all currency <select>s (entry selects show codes; settings shows full labels)
function populateCcySelects() {
  const entryUnlocked = featureUnlocked('multiCurrencyEntry');
  ['itemBuyCcy','skinBuyCcy','sellCcy','topupCcy','steamImportCcy'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    // Rebuild each time so toggling the Pro override re-locks/unlocks entry.
    el.innerHTML = '';
    if (entryUnlocked) {
      SUPPORTED_CURRENCIES.forEach(c => {
        const o = document.createElement('option');
        o.value = c.code; o.textContent = c.code;
        el.appendChild(o);
      });
      el.disabled = false;
      el.style.opacity = '1';
      el.title = '';
    } else {
      // Free tier: GBP only, locked. Entry stays fully functional in GBP.
      const o = document.createElement('option');
      o.value = 'GBP'; o.textContent = 'GBP';
      el.appendChild(o);
      el.disabled = true;
      el.style.opacity = '0.55';
      el.title = 'Multi-currency entry is a Vault Pro feature';
    }
    el.value = 'GBP';
  });
  const s = document.getElementById('settingsDisplayCcy');
  if (s && !s.options.length) {
    SUPPORTED_CURRENCIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c.code; o.textContent = c.label;
      s.appendChild(o);
    });
    s.value = getDisplayCurrency();
  }
}

let _displayCcy = 'GBP';   // loaded in initDisplayCurrency()
let _displayRate = 1;      // GBP -> display, live rate; 1 while GBP or until fetched

const _fxInflight = {};    // in-flight promise memo keyed "date|from|to" ('live' for current)

function loadFxCache() { try { return JSON.parse(window._store[FX_CACHE_KEY]) || {}; } catch { return {}; } }
function saveFxCacheEntry(key, rate) {
  try { const c = loadFxCache(); c[key] = rate; window._storeSet(FX_CACHE_KEY, JSON.stringify(c)); } catch(e){}
}

// getRate(from, to, date?) — date 'YYYY-MM-DD' = historical (frankfurter.app, ECB,
// cached permanently); no date = live rate (frankfurter latest, er-api fallback).
async function getRate(from, to, date) {
  if (from === to) return 1;
  const isHist = !!(date && date < todayStr());
  const key = (isHist ? date : 'live') + '|' + from + '|' + to;
  if (isHist) {
    const cached = loadFxCache()[key];
    if (cached) return cached;
  }
  if (_fxInflight[key]) return _fxInflight[key];
  _fxInflight[key] = (async () => {
    let rate = null;
    // Primary: frankfurter.app (ECB rates, no key, supports historical)
    try {
      const path = isHist ? date : 'latest';
      const r = await window.cs2vault.fetch('https://api.frankfurter.app/' + path + '?from=' + from + '&to=' + to);
      if (r.ok) { const d = JSON.parse(r.body); rate = d.rates && d.rates[to] ? d.rates[to] : null; }
    } catch(e) {}
    // Fallback: open.er-api.com (live only — cross via its base table)
    if (!rate) {
      try {
        const r = await window.cs2vault.fetch('https://open.er-api.com/v6/latest/' + from);
        if (r.ok) { const d = JSON.parse(r.body); rate = d.rates && d.rates[to] ? d.rates[to] : null; }
      } catch(e) {}
    }
    if (rate) {
      if (isHist) saveFxCacheEntry(key, rate);
      console.log('[FX] ' + from + '->' + to + (isHist ? ' @ ' + date : ' (live)') + ': ' + rate);
    } else {
      console.warn('[FX] No rate for ' + from + '->' + to + (isHist ? ' @ ' + date : '') + ' — both sources failed');
    }
    delete _fxInflight[key];
    return rate;
  })();
  return _fxInflight[key];
}

// Display currency
function getDisplayCurrency() {
  // Multi-currency display is Pro — free users always render in GBP, even if a
  // value was stored while Pro (e.g. via the preview override) and later locked.
  if (!featureUnlocked('multiCurrencyDisplay')) return 'GBP';
  return window._store[DISPLAY_CCY_KEY] || 'GBP';
}
async function initDisplayCurrency() {
  _displayCcy = getDisplayCurrency();
  if (_displayCcy !== 'GBP') {
    const r = await getRate('GBP', _displayCcy);
    _displayRate = r || 1;
    if (!r) { _displayCcy = 'GBP'; toast('FX rate unavailable — showing GBP', 'info'); }
  } else {
    _displayRate = 1;
  }
  const sel = document.getElementById('settingsDisplayCcy');
  if (sel) sel.value = _displayCcy;
}
async function setDisplayCurrency(code) {
  if (!featureUnlocked('multiCurrencyDisplay')) {
    const sel = document.getElementById('settingsDisplayCcy');
    if (sel) sel.value = 'GBP';
    showProToast('multiCurrencyDisplay');
    return;
  }
  window._storeSet(DISPLAY_CCY_KEY, code);
  await initDisplayCurrency();
  // Re-render everything money-bearing on the current tab set
  try { renderHoldings(); updateStats(); } catch(e){}
  try { renderSkins(); } catch(e){}
  try { renderWatchlist(); } catch(e){}
  try { if (typeof renderAnalytics === 'function') renderAnalytics(); } catch(e){}
  toast('Display currency: ' + code + (code !== 'GBP' ? ' (tax figures stay GBP)' : ''), 'success');
}

// Central money formatter — takes a BASE-GBP value, renders in display currency.
// dp: decimal places (JPY forced to 0). Negative renders as -£3.20.
function fmtMoney(v, dp) {
  if (v == null || isNaN(v)) return '—';
  if (dp == null) dp = 2;
  const conv = Number(v) * _displayRate;
  if (_displayCcy === 'JPY') dp = 0;
  const sym = curSymOf(_displayCcy);
  return (conv < 0 ? '-' : '') + sym + Math.abs(conv).toFixed(dp);
}
// GBP-locked formatter for tax/accounting surfaces (CGT, trade history, exports)
function fmtGBP(v, dp) {
  if (v == null || isNaN(v)) return '—';
  if (dp == null) dp = 2;
  return (v < 0 ? '-' : '') + '£' + Math.abs(Number(v)).toFixed(dp);
}
// Localised variant (thousands separators) for chart axes/tooltips
function fmtMoneyLoc(v, dp) {
  if (v == null || isNaN(v)) return '—';
  if (dp == null) dp = 2;
  const conv = Number(v) * _displayRate;
  if (_displayCcy === 'JPY') dp = 0;
  const sym = curSymOf(_displayCcy);
  return (conv < 0 ? '-' : '') + sym + Math.abs(conv).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
// Convert an amount entered in `ccy` on `date` to base GBP. Returns { base, fxRate } or null on FX failure.
async function toBaseGBP(amount, ccy, date) {
  if (!ccy || ccy === 'GBP') return { base: amount, fxRate: 1 };
  const r = await getRate(ccy, 'GBP', date || todayStr());
  if (!r) return null;
  return { base: amount * r, fxRate: r };
}

// Legacy wrapper — USD->GBP live rate for the CSFloat lane (prices come back in USD cents)
let _gbpRate = null;
let _gbpRatePromise = null; // kept: refresh paths reset these to force a re-fetch per bulk run
async function getGBPRate() {
  if (_gbpRate) return _gbpRate;
  if (_gbpRatePromise) return _gbpRatePromise;
  _gbpRatePromise = (async () => {
    _gbpRate = (await getRate('USD', 'GBP')) || 0.79;
    return _gbpRate;
  })();
  return _gbpRatePromise;
}

// Sticker index overrides for items CSFloat can't find by name
const STICKER_INDEXES = {
  'Sticker | Hypnoteyes (Holo)':            7921,
  'Sticker | From the Deep (Holo)':         4647,
  'Sticker | From the Deep (Glitter)':      7914,
  'Sticker | High Heat (Holo)':             7885,
  'Sticker | Chompers (Holo)':              4580,
  'Sticker | Clown Nose (Holo)':            7906,
  'Sticker | Blinky (Holo)':               4577,
  'Sticker | Flex (Holo)':                 7905,
  'Sticker | Glare (Holo)':                4648,
  'Sticker | Ribbon Tie (Holo)':           7911,
  'Sticker | Fly High (Holo)':             4590,
  'Sticker | Taste Buddy (Holo)':          7916,
  'Sticker | Bolt Strike':                 7882,
  'Sticker | Bolt Charge':                 7883,
  'Sticker | Boom Trail':                  7895,
  'Sticker | Boom Trail (Glitter)':        7900,
  'Sticker | High Heat':                   7885,
  // Legacy aliases — Elemental Craft papers were wrongly stored with "(Holo)" pre-v2.5.1
  'Sticker | Bolt Strike (Holo)':          7882,
  'Sticker | Bolt Charge (Holo)':          7883,
  'Sticker | Boom Trail (Holo)':           7895,
};

// Pattern ranges for charm variants
const CHARM_PATTERNS = {
  'Die-cast AK (Gold)':   { base: 'Charm | Die-cast AK', min: 0,     max: 10000  },
  'Die-cast AK (Orange)': { base: 'Charm | Die-cast AK', min: 10000, max: 20000  },
  'Die-cast AK (Red)':    { base: 'Charm | Die-cast AK', min: 20000, max: 24000  },
  'Die-cast AK (Blue)':   { base: 'Charm | Die-cast AK', min: 87000, max: 100000 },
  'Diamond Dog (Low ID)': { base: 'Charm | Diamond Dog', min: 0,     max: 10000  },
  'Diamond Dog':          { base: 'Charm | Diamond Dog', min: 10000, max: 100000 },
};

// Items that need def_index+paint_index lookup (not findable by market_hash_name on CSFloat)
const DEF_INDEX_ITEMS = {
  'FAMAS | Halftone Wash (Factory New)':   { def_index: 10,  paint_index: 882, max_float: 0.07 },
  'Galil AR | NV (Factory New)':           { def_index: 13,  paint_index: 939, max_float: 0.07 },
};

async function fetchCSFloatPrices(marketHashName, itemName) {
  if (!marketHashName) return null;
  const apiKey = getApiKey();
  if (!apiKey) { toast('Enter your CSFloat API key top right', 'error'); return null; }
  const gbpRate = await getGBPRate();

  // Check if this is a Die-cast AK colour variant
  const charmPattern = itemName ? CHARM_PATTERNS[itemName] : null;
  let url;
  if (charmPattern) {
    const encoded = encodeURIComponent(charmPattern.base);
    url = `https://csfloat.com/api/v1/listings?market_hash_name=${encoded}&limit=10&sort_by=lowest_price&type=buy_now&min_keychain_pattern=${charmPattern.min}&max_keychain_pattern=${charmPattern.max}`;
    console.log(`[CSFloat] Fetching ${itemName} with pattern range ${charmPattern.min}-${charmPattern.max}`);
  } else {
    const encoded = encodeURIComponent(marketHashName);
    // Use sticker_index for items that CSFloat can't find by name
    const stickerIdx = STICKER_INDEXES[marketHashName];
    if (stickerIdx) {
      url = `https://csfloat.com/api/v1/listings?sticker_index=${stickerIdx}&limit=10&sort_by=lowest_price&type=buy_now`;
      console.log(`[CSFloat] Using sticker_index=${stickerIdx} for ${marketHashName}`);
    } else if (DEF_INDEX_ITEMS[marketHashName]) {
      const d = DEF_INDEX_ITEMS[marketHashName];
      url = `https://csfloat.com/api/v1/listings?def_index=${d.def_index}&paint_index=${d.paint_index}&max_float=${d.max_float}&limit=10&sort_by=lowest_price`;
      console.log(`[CSFloat] Using def_index=${d.def_index}&paint_index=${d.paint_index} for ${marketHashName}`);
    } else {
      url = `https://csfloat.com/api/v1/listings?market_hash_name=${encoded}&limit=10&sort_by=lowest_price&type=buy_now`;
    }
  }

  try {
    let res = await window.cs2vault.fetch(url, { 'Authorization': apiKey });
    res.json = () => Promise.resolve(JSON.parse(res.body)); res.ok = res.status >= 200 && res.status < 300;
    console.log(`[CSFloat] ${res.status} for ${itemName || marketHashName}`);
    if (res.status === 429) {
      console.warn(`[CSFloat] Rate limited for ${itemName || marketHashName}, waiting 5s...`);
      await sleep(5000);
      res = await window.cs2vault.fetch(url, { 'Authorization': apiKey });
      res.json = () => Promise.resolve(JSON.parse(res.body)); res.ok = res.status >= 200 && res.status < 300;
      console.log(`[CSFloat] Retry ${res.status} for ${itemName || marketHashName}`);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) toast('CSFloat API key rejected', 'error');
      return null;
    }
    const data = await res.json();
    let listings = data.data || [];
    // Fallback: if buy_now returned nothing, retry without type filter
    if (!listings.length && url.includes('type=buy_now')) {
      console.log(`[CSFloat] No buy_now listings for ${itemName}, retrying without type filter`);
      await sleep(1000);
      const fallbackUrl = url.replace('&type=buy_now', '');
      const resp2 = await window.cs2vault.fetch(fallbackUrl, { 'Authorization': apiKey });
      resp2.json = () => Promise.resolve(JSON.parse(resp2.body)); resp2.ok = resp2.status >= 200 && resp2.status < 300;
      if (resp2.ok) {
        const data2 = await resp2.json();
        // Filter out auctions from fallback — only take buy_now type
        listings = (data2.data || []).filter(l => l.type === 'buy_now');
        if (!listings.length) listings = data2.data || []; // last resort, take anything
        console.log(`[CSFloat] Fallback got ${listings.length} listings for ${itemName}`);
      }
    }
    if (!listings.length) return null;
    const prices = listings.map(l => ((l.price || 0) / 100) * gbpRate);
    const lowest = Math.min(...prices);
    const avg7d = prices.reduce((a, b) => a + b, 0) / prices.length;
    console.log(`[CSFloat] lowest=£${lowest.toFixed(4)}, avg=£${avg7d.toFixed(4)}`);
    return { lowest, lastSold: null, avg7d, source: 'csfloat' };
  } catch(e) {
    console.error(`[CSFloat] Failed for ${itemName || marketHashName}:`, e.message);
    return null;
  }
}

async function fetchSteamPrices(marketHashName) {
  if (!marketHashName) return null;
  const encoded = encodeURIComponent(marketHashName);
  const gbpRate = await getGBPRate();

  // Try priceoverview first (currency=2 = GBP, no conversion needed).
  // priceoverview is the RELIABLE path for cheap high-volume stickers (Elemental Craft
  // pack etc.) — their listing-HTML pages are huge and don't embed the var line1 history
  // block the HTML parser needs, so for them the HTML fallback returns "no price history"
  // and is NOT a real safety net. On a bulk refresh Steam rate-limits (429) the most-
  // requested cheap items first, so we retry priceoverview with backoff before giving up,
  // and on a PERSISTENT 429 we return null (no HTML attempt) so the bulk lane's adaptive
  // backoff widens the gap and the item gets a clean shot on the next pass.
  let overview429 = false;
  try {
    const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=2&market_hash_name=${encoded}`;
    const parseGBP = s => {
      if (!s) return null;
      const cleaned = s.replace(/[^0-9.]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? null : val;
    };
    const STEAM_429_BACKOFF = [4000, 8000];   // waits before retry attempt 2 and 3
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        console.warn(`[Steam] priceoverview rate limited for ${marketHashName}, waiting ${STEAM_429_BACKOFF[attempt-1]}ms (retry ${attempt})...`);
        await sleep(STEAM_429_BACKOFF[attempt - 1]);
      }
      const res = await window.cs2vault.fetch(url);
      res.json = () => Promise.resolve(JSON.parse(res.body)); res.ok = res.status >= 200 && res.status < 300;
      console.log(`[Steam] priceoverview ${res.status} for ${marketHashName}${attempt ? ` (attempt ${attempt+1})` : ''}`);
      if (res.status === 429) { overview429 = true; _steamRateLimited = true; continue; }
      overview429 = false;
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const lowest   = parseGBP(data.lowest_price);
          const lastSold = parseGBP(data.median_price);
          console.log(`[Steam] priceoverview lowest=£${lowest?.toFixed(4)}, median=£${lastSold?.toFixed(4)}`);
          if (lowest != null || lastSold != null) {
            return { lowest, lastSold, avg7d: null, source: 'steam' };
          }
          console.log(`[Steam] priceoverview no prices for ${marketHashName}, trying HTML fallback`);
        }
      }
      break;   // non-429, non-success → fall through to HTML fallback below
    }
  } catch(e) {
    console.warn(`[Steam] priceoverview failed for ${marketHashName}:`, e.message);
  }

  // Persistent 429 on priceoverview → don't burn the (throttled, unreliable-for-these-items)
  // HTML path; return null so the bulk lane backs off and retries cleanly next pass.
  if (overview429) {
    console.warn(`[Steam] priceoverview still rate limited for ${marketHashName} after retries — skipping HTML, will retry next refresh`);
    return null;
  }

  // Fallback: parse the Steam market listing HTML page.
  // This is the most reliable method — same page the browser loads, always has price history,
  // prices already in GBP, uses our existing parseSteamPriceHistory() which is proven to work.
  try {
    const listingUrl = `https://steamcommunity.com/market/listings/730/${encoded}`;
    console.log(`[Steam] HTML listing fallback for ${marketHashName}`);
    const res = await window.cs2vault.fetch(listingUrl, {});
    if (res.status === 200) {
      const history = parseSteamPriceHistory(res.body);
      if (history && history.length > 0) {
        const lastEntry = history[history.length - 1];
        const lastSold = lastEntry.price;
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recent = history.filter(e => e.ts >= cutoff);
        const avg30d = recent.length > 0
          ? recent.reduce((s, e) => s + e.price, 0) / recent.length
          : lastSold;
        console.log(`[Steam] HTML fallback lastSold=£${lastSold?.toFixed(4)}, avg30d=£${avg30d?.toFixed(4)} for ${marketHashName}`);
        return { lowest: lastSold, lastSold, avg7d: avg30d, source: 'steam' };
      }
      console.warn(`[Steam] HTML listing no price history for ${marketHashName}`);
    } else {
      console.warn(`[Steam] HTML listing HTTP ${res.status} for ${marketHashName}`);
    }
  } catch(e) {
    console.error(`[Steam] HTML fallback failed for ${marketHashName}:`, e.message);
  }

  return null;
}

// ========================
// SKINPORT REMOVED — only CSFloat and Steam are used
// ========================
// MULTI-PLATFORM PRICE FETCH
// ========================

const CHARM_NAMES = Object.keys(CHARM_PATTERNS);

// CSFloat lane — skip for agents (not tradeable on CSFloat). Returns prices object or null.
async function fetchCSFloatLane(item) {
  if (item.type === 'agent') return null;
  try {
    return await fetchCSFloatPrices(item.marketHash, item.name);
  } catch(e) { console.warn('[MultiPrice] CSFloat failed:', e.message); return null; }
}

// Steam lane — always tried (free, no auth). Returns prices object or null.
// Stickers have marketHash like "Sticker | Blinky (Holo)" for CSFloat sticker_index lookups,
// but Steam may list them without the variant suffix e.g. just "Sticker | Blinky".
// Strategy: try exact hash first, then retry with variant suffix stripped if nothing returned.
async function fetchSteamLane(item) {
  try {
    let steamHash = item.marketHash;
    // If bare name (no "Sticker | " prefix), add it for Steam — but NOT for capsules/packs,
    // which are listed on Steam under their plain name (e.g. "Austin 2025 Legends Sticker Capsule")
    if (item.type === 'sticker' && steamHash && !steamHash.startsWith('Sticker |') && !/(capsule|pack)/i.test(steamHash)) {
      steamHash = 'Sticker | ' + steamHash;
    }
    // Fix known capitalisation mismatches between CSFloat and Steam naming
    steamHash = steamHash.replace('From the Deep', 'From The Deep');
    steamHash = steamHash.replace('| Axia', '| AXIA');
    _steamRateLimited = false;
    let stm = await fetchSteamPrices(steamHash);
    // If no result and the hash ends with a variant suffix, try stripping it —
    // but NOT if the null came from a 429 (the stripped hash would just trigger
    // another rate-limit storm; the original hash is fine, Steam is just throttling).
    if (!stm && !_steamRateLimited && item.type === 'sticker') {
      const stripped = steamHash.replace(/\s*\((Holo|Glitter|Foil|Lenticular)\)\s*$/, '').trim();
      if (stripped !== steamHash) {
        console.log(`[MultiPrice] Retrying Steam with stripped hash: ${stripped}`);
        stm = await fetchSteamPrices(stripped);
      }
    }
    return stm || null;
  } catch(e) { console.warn('[MultiPrice] Steam failed:', e.message); return null; }
}

// Combine per-platform results into the stored prices shape (shared by fetchPrices + refresh engine)
function combinePlatformPrices(multi) {
  const allLowest = [multi.csfloat?.lowest, multi.steam?.lowest].filter(v => v != null && v > 0);
  const allLastSold = [multi.csfloat?.lastSold, multi.steam?.lastSold].filter(v => v != null && v > 0);
  const allAvg = [multi.csfloat?.avg7d].filter(v => v != null && v > 0);
  return {
    lowest: allLowest.length ? Math.min(...allLowest) : null,
    lastSold: allLastSold.length ? Math.min(...allLastSold) : null,
    avg7d: allAvg.length ? allAvg[0] : null,
    source: 'multi',
    platforms: multi,
  };
}

// Single-item fetch (↻ buttons, autocomplete etc.) — sequential, unchanged behaviour
async function fetchAllPlatformPrices(item) {
  const results = {};
  const cf = await fetchCSFloatLane(item);
  if (cf) results.csfloat = cf;
  const stm = await fetchSteamLane(item);
  if (stm) results.steam = stm;
  if (Object.keys(results).length === 0) return null;
  return results;
}

// Fetch both platforms, return combined prices object
async function fetchPrices(item) {
  const multi = await fetchAllPlatformPrices(item);
  if (!multi) return null;
  const allLowest = [multi.csfloat?.lowest, multi.steam?.lowest].filter(v => v != null && v > 0);
  const allLastSold = [multi.csfloat?.lastSold, multi.steam?.lastSold].filter(v => v != null && v > 0);
  const allAvg = [multi.csfloat?.avg7d].filter(v => v != null && v > 0);
  return {
    lowest: allLowest.length ? Math.min(...allLowest) : null,
    lastSold: allLastSold.length ? Math.min(...allLastSold) : null,
    avg7d: allAvg.length ? allAvg[0] : null,
    source: 'multi',
    platforms: multi,
  };
}

function getScopedHoldings() {
  const typeFilter = document.getElementById('filterType')?.value || '';
  const catFilters = ['character','elemental','austin','graphic','gallery'];
  if (!typeFilter) return holdings;
  if (typeFilter === 'tuf') return holdings.filter(h => h.isTuf);
  if (catFilters.includes(typeFilter)) return holdings.filter(h => h.category === typeFilter);
  if (typeFilter === 'sticker') return holdings.filter(h => h.type === 'sticker');
  if (typeFilter === 'armory') return holdings.filter(h => h.type === 'armory');
  if (typeFilter === 'skin') return holdings.filter(h => h.type === 'skin');
  if (typeFilter === 'case') return holdings.filter(h => h.type === 'case');
  if (typeFilter === 'knife') return holdings.filter(h => h.type === 'knife');
  return holdings;
}

function updateRefreshScopeLabel() {
  const el = document.getElementById('refreshScopeLabel');
  if (!el) return;
  const scoped = getScopedHoldings();
  const total = holdings.length;
  if (scoped.length === total) { el.textContent = ''; return; }
  const filterEl = document.getElementById('filterType');
  const label = filterEl.options[filterEl.selectedIndex].text.replace('↳ ','');
  el.textContent = `↻ will refresh ${scoped.length} of ${total} items (${label})`;
}

// ========================
// TWO-LANE BULK REFRESH ENGINE (v2.7.0)
// CSFloat lane runs in a parallel pool (API-keyed, tolerant); Steam lane stays
// sequential with an adaptive delay (rate-limit sensitive). An item completes
// when BOTH lanes have processed it. Roughly halves a full-refresh wall time.
// ========================
const FRESH_TTL_MS = 30 * 60 * 1000;   // prices younger than this are skipped on refresh
const CSFLOAT_CONCURRENCY = 6;          // parallel CSFloat requests
const STEAM_BASE_DELAY_MS = 1500;       // between Steam items; doubles on failure up to 6s
let _steamRateLimited = false;          // set by fetchSteamPrices on a 429; lane widens its delay
let _refreshBusy = false;               // guards manual vs auto refresh collisions

function isPriceFresh(item) {
  return !!(item && item.prices && item.prices.fetchedAt && (Date.now() - item.prices.fetchedAt) < FRESH_TTL_MS);
}

// Generic small worker pool (used by alert checks too)
async function runPool(items, concurrency, fn) {
  let idx = 0;
  const n = Math.min(concurrency, items.length);
  const workers = [];
  for (let w = 0; w < n; w++) {
    workers.push((async () => {
      while (idx < items.length) { const i = idx++; await fn(items[i], i); }
    })());
  }
  await Promise.all(workers);
}

async function runTwoLaneRefresh(items, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const onItemDone = opts.onItemDone || (() => {});
  const hasKey = !!getApiKey();
  const work = items.filter(it => it.marketHash);
  const noHash = items.length - work.length;
  let done = 0, updated = 0, failed = 0;

  // Per-item lane state: an item finalises only when both lanes are done
  const state = new Map();
  for (const it of work) state.set(it.id, { item: it, csfloat: null, steam: null, cfDone: false, stDone: false });

  const finalize = (st) => {
    if (!st.cfDone || !st.stDone) return;
    done++;
    const multi = {};
    if (st.csfloat) multi.csfloat = st.csfloat;
    if (st.steam) multi.steam = st.steam;
    if (Object.keys(multi).length) {
      updated++;
      onItemDone(st.item, { ...combinePlatformPrices(multi), fetchedAt: Date.now() });
    } else {
      failed++;
      onItemDone(st.item, null);
    }
    onProgress(done, work.length);
  };

  // CSFloat lane — parallel pool (skipped for agents, or entirely if no API key)
  const cfQueue = hasKey ? work.filter(it => it.type !== 'agent') : [];
  for (const it of work) {
    if (!cfQueue.includes(it)) { const st = state.get(it.id); st.cfDone = true; finalize(st); }
  }
  const cfLane = runPool(cfQueue, CSFLOAT_CONCURRENCY, async (it) => {
    const st = state.get(it.id);
    try { st.csfloat = await fetchCSFloatLane(it); } catch(e) { /* lane already logs */ }
    st.cfDone = true;
    finalize(st);
  });

  // Steam lane — sequential, adaptive delay (back off on failure = likely rate limit)
  const stLane = (async () => {
    let delay = opts.steamDelayMs || STEAM_BASE_DELAY_MS;
    for (let i = 0; i < work.length; i++) {
      const it = work[i];
      const st = state.get(it.id);
      _steamRateLimited = false;
      try { st.steam = await fetchSteamLane(it); } catch(e) { /* lane already logs */ }
      st.stDone = true;
      finalize(st);
      // Back off on a failed lookup OR a detected 429 (even if the retry rescued it) —
      // a 429 means Steam is throttling, so widen the gap before the next item.
      const ok = st.steam && !_steamRateLimited;
      delay = ok ? (opts.steamDelayMs || STEAM_BASE_DELAY_MS) : Math.min(delay * 2, 6000);
      if (i < work.length - 1) await sleep(delay);
    }
  })();

  await Promise.all([cfLane, stLane]);
  return { updated, failed, noHash, total: work.length };
}

// ========================
// SCHEDULED BACKGROUND AUTO-REFRESH (v2.7.0)
// Silently refreshes STALE prices (>30 min old) for holdings + play skins on a
// timer, plus once shortly after launch. Manual refreshes still work as normal
// and are guarded against overlapping with an auto run.
// ========================
const AUTO_REFRESH_KEY = 'cs2vault_autorefresh';
let _autoRefreshTimer = null;

function getAutoRefreshHours() {
  const v = parseFloat(window._store[AUTO_REFRESH_KEY]);
  return isNaN(v) ? 3 : v; // default: every 3 hours
}

function saveAutoRefreshSetting() {
  const sel = document.getElementById('settingsAutoRefresh');
  if (!sel) return;
  window._storeSet(AUTO_REFRESH_KEY, sel.value);
  initAutoRefreshTimer();
  const hrs = parseFloat(sel.value);
  toast(hrs ? `Auto-refresh: every ${hrs} hour${hrs > 1 ? 's' : ''}` : 'Auto-refresh: off', 'success');
}

function initAutoRefreshTimer() {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
  const hrs = getAutoRefreshHours();
  if (!hrs || hrs <= 0) return;
  _autoRefreshTimer = setInterval(() => { runAutoRefresh().catch(e => console.warn('[AutoRefresh]', e)); }, hrs * 60 * 60 * 1000);
}

async function runAutoRefresh() {
  if (_refreshBusy) { console.log('[AutoRefresh] Skipped — a refresh is already running'); return; }
  const staleHoldings = holdings.filter(h => h.marketHash && !isPriceFresh(h));
  const staleSkins = skins.filter(s => s.marketHash && !isPriceFresh(s));
  if (!staleHoldings.length && !staleSkins.length) { console.log('[AutoRefresh] Nothing stale — skipped'); return; }
  console.log(`[AutoRefresh] Refreshing ${staleHoldings.length} holding(s) + ${staleSkins.length} play skin(s)`);

  _gbpRate = null; _gbpRatePromise = null;
  _refreshBusy = true;
  const btn = document.getElementById('refreshBtn');
  const origDisabled = btn ? btn.disabled : false;
  let updated = 0;
  let _saveCounter = 0;
  beginPriceLogBatch();
  try {
    if (staleHoldings.length) {
      const r = await runTwoLaneRefresh(staleHoldings, {
        onProgress: (done, total) => { if (btn) { btn.innerHTML = `<span class="loading-spinner"></span> Auto ${done}/${total}`; btn.disabled = true; } },
        onItemDone: (item, prices) => {
          if (prices) { item.prices = prices; recordPrice(item, prices); }
          if (++_saveCounter % 10 === 0) saveData(holdings);
          renderHoldings();
        },
      });
      updated += r.updated;
      saveData(holdings);
    }
    if (staleSkins.length) {
      const r = await runTwoLaneRefresh(staleSkins, {
        onItemDone: (skin, prices) => mergeSkinPrices(skin, prices, true),
      });
      updated += r.updated;
      saveSkins(skins);
      renderSkins();
    }
  } finally {
    _refreshBusy = false;
    flushPriceLogBatch();
    if (btn) { btn.innerHTML = '\u21bb Refresh Prices'; btn.disabled = origDisabled; }
  }
  if (updated > 0) {
    updateStats();
    captureHeatmapSnapshot();
    if (heatmapVisible) renderHeatmap();
    checkAlertsAgainstHoldings();
    toast(`Auto-refresh: ${updated} price(s) updated`, 'success');
  }
}

function initAutoRefresh() {
  initAutoRefreshTimer();
  // One pass shortly after launch so prices are already warm when you start looking
  if (getAutoRefreshHours() > 0) {
    setTimeout(() => { runAutoRefresh().catch(e => console.warn('[AutoRefresh]', e)); }, 15000);
  }
}

async function refreshAllPrices() {
  if (_refreshBusy) { toast('A refresh is already running', 'info'); return; }
  _gbpRate = null; _gbpRatePromise = null;
  const btn = document.getElementById('refreshBtn');
  const scoped = getScopedHoldings();
  const isFiltered = scoped.length < holdings.length;
  const filterEl = document.getElementById('filterType');
  const scopeLabel = isFiltered ? filterEl.options[filterEl.selectedIndex].text.replace('↳ ','') : 'All';

  // Staleness skip: items fetched <30 min ago are skipped.
  // If EVERYTHING is fresh, the click clearly means "refresh anyway" — so do all of them.
  let work = scoped.filter(it => !isPriceFresh(it));
  let skippedFresh = scoped.length - work.length;
  if (work.length === 0 && scoped.length > 0) { work = scoped; skippedFresh = 0; }

  if (!getApiKey() && work.some(it => it.type !== 'agent')) {
    toast('No CSFloat API key — refreshing Steam prices only', 'info');
  }

  _refreshBusy = true;
  btn.innerHTML = `<span class="loading-spinner"></span> Fetching ${scopeLabel}...`;
  btn.disabled = true;
  work.forEach(it => { if (it.marketHash) updateRowPriceLoading(it.id); });

  let res = { updated: 0, failed: 0, noHash: 0 };
  let _saveCounter = 0;
  beginPriceLogBatch();
  try {
    res = await runTwoLaneRefresh(work, {
      onProgress: (done, total) => { btn.innerHTML = `<span class="loading-spinner"></span> ${done}/${total} ${scopeLabel}`; },
      onItemDone: (item, prices) => {
        if (prices) { item.prices = prices; recordPrice(item, prices); }
        // Throttled persistence: full-file store writes are expensive, so save
        // every 10th item for crash resilience; the finally block does the last one
        if (++_saveCounter % 10 === 0) saveData(holdings);
        renderHoldings();
      },
    });
  } finally {
    _refreshBusy = false;
    saveData(holdings);
    flushPriceLogBatch();
    btn.innerHTML = '↻ Refresh Prices';
    btn.disabled = false;
  }
  captureHeatmapSnapshot();
  if (heatmapVisible) renderHeatmap();
  updateStats();
  // Refresh updated today's prices — re-record today's value point so the value
  // chart reflects the latest figures (deduped per day, latest write wins).
  if (res.updated > 0) { try { recordValueSnapshot(); } catch(e) {} }
  const failed = res.failed + res.noHash;
  if (res.updated > 0) {
    const skipNote = skippedFresh > 0 ? ` (${skippedFresh} skipped, <30m fresh)` : '';
    toast(`Updated ${res.updated} ${isFiltered ? scopeLabel + ' ' : ''}item(s)${skipNote} — CSFloat + Steam`, 'success');
  } else if (skippedFresh > 0 && res.updated === 0 && work.length === 0) {
    toast('All prices already fresh (<30m)', 'info');
  }
  checkAlertsAgainstHoldings();
  if (failed > 0) toast(`${failed} item(s) failed — check API key`, 'info');
}

async function refreshSingleItem(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  if (!item.marketHash) { openPriceModal(id); return; }
  updateRowPriceLoading(id);
  const prices = await fetchPrices(item);
  if (prices) { item.prices = { ...prices, fetchedAt: Date.now() }; recordPrice(item, prices); toast(`Updated: ${item.name}`, 'success'); }
  else toast(`Failed to fetch ${item.name}`, 'error');
  saveData(holdings);
  renderHoldings();
  updateStats();
}

function updateRowPriceLoading(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  if (!row) return;
  // Cover both compare mode (plat-cell) and legacy mode (priceLowest etc)
  ['priceLowest','priceLastSold','priceAvg'].forEach(cls => { const el = row.querySelector(`.${cls}`); if (el) el.innerHTML = '<span class="loading-spinner"></span>'; });
  row.querySelectorAll('.plat-cell').forEach(el => { el.innerHTML = '<span class="loading-spinner"></span>'; });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========================
// PRICE COLUMN RENDERING
// ========================
const PLAT_ICONS = {
  csfloat: { icon: '🟠', label: 'FLT', cls: 'plat-csfloat' },
  steam:   { icon: '🟦', label: 'STM', cls: 'plat-steam' },
};

function renderPriceColumns(item, p, ago) {
  const fmt = v => v != null ? `${fmtMoney(Number(v), 2)}` : '—';

  if (p.platforms) {
    const platHtml = (name) => {
      const info = PLAT_ICONS[name];
      const val = getPlatformPrice(item, name);
      return `<td class="mono plat-price">
        <div class="plat-cell">
          <span class="plat-icon">${info.icon}</span>
          <span class="plat-val">${val != null ? fmt(val) : '<span class="price-loading">—</span>'}</span>
        </div>
      </td>`;
    };
    return platHtml('csfloat') + platHtml('steam');
  }

  // Fallback for items not yet refreshed with platform data
  return `<td class="mono priceLowest" title="Updated: ${ago}">${fmt(p.lowest)}</td><td class="mono">—</td>`;
}

// ========================
// RENDER
// ========================
const typeLabels = { skin:'Skin', case:'Case', sticker:'Sticker', armory:'Armory', knife:'Knife/Glove' };
const typeBadge  = { skin:'badge-skin', case:'badge-case', sticker:'badge-sticker', armory:'badge-armory', knife:'badge-knife' };

function getBestPrice(item) {
  if (!item.prices) return null;
  if (item.prices.platforms) {
    const plats = item.prices.platforms;
    // Cases, stickers, TUF-tagged skins, and agents all use Steam price first
    if (item.type === 'case' || item.type === 'sticker' || item.isTuf || item.type === 'agent') {
      const stm = plats.steam?.lowest || plats.steam?.lastSold || null;
      if (stm != null && stm > 0) return stm;
      // Fallback to CSFloat if Steam has nothing
      const cf = plats.csfloat?.lowest || plats.csfloat?.avg7d || null;
      if (cf != null && cf > 0) return cf;
    } else {
      // Skins, knives, armory, charms — CSFloat first
      const cf = plats.csfloat?.lowest || plats.csfloat?.avg7d || null;
      if (cf != null && cf > 0) return cf;
      const stm = plats.steam?.lowest || plats.steam?.lastSold || null;
      if (stm != null && stm > 0) return stm;
    }
  }
  return item.prices.avg7d || item.prices.lowest || item.prices.lastSold || null;
}

// Get per-platform price for display
function getPlatformPrice(item, platform) {
  if (!item.prices?.platforms?.[platform]) return null;
  const p = item.prices.platforms[platform];
  return p.lowest || p.lastSold || p.avg7d || p.suggested || null;
}

// Find which platform drives the P&L price for this item
function getPricingPlatform(item) {
  if (item.type === 'case' || item.type === 'sticker' || item.isTuf || item.type === 'agent') return 'steam';
  return 'csfloat';
}

function renderHoldings() {
  const tbody = document.getElementById('holdingsBody');
  const empty = document.getElementById('holdingsEmpty');
  const q = currentFilter.toLowerCase();
  const typeFilter = document.getElementById('filterType').value;
  const categoryFilters = ['character','elemental','austin'];
  const statusFilter = document.getElementById('filterStatus').value;

  let filtered = holdings.filter(h => {
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (typeFilter) {
      const catFilters = ['character','elemental','austin','graphic','gallery'];
      if (typeFilter === 'tuf') { if (!h.isTuf) return false; }
      else if (catFilters.includes(typeFilter)) { if (h.category !== typeFilter) return false; }
      else if (h.type !== typeFilter) return false;
    }
    if (statusFilter) {
      const best = getBestPrice(h);
      const pnl = best ? (best - h.buyPrice) * h.qty : 0;
      if (statusFilter === 'profit' && pnl <= 0) return false;
      if (statusFilter === 'loss' && pnl >= 0) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'pnl') {
      av = getBestPrice(a) ? (getBestPrice(a) - a.buyPrice) * a.qty : -Infinity;
      bv = getBestPrice(b) ? (getBestPrice(b) - b.buyPrice) * b.qty : -Infinity;
    } else if (sortKey === 'totalInvested') {
      av = a.buyPrice * a.qty;
      bv = b.buyPrice * b.qty;
    }
    if (typeof av === 'string') return sortDir * av.localeCompare(bv);
    return sortDir * ((av || 0) - (bv || 0));
  });

  empty.style.display = filtered.length ? 'none' : 'block';
  tbody.innerHTML = filtered.map(item => {
    const p = item.prices || {};
    const fmt = v => v != null ? `${fmtMoney(Number(v), 2)}` : '<span class="price-loading">—</span>';
    const best = getBestPrice(item);
    const pnl = best != null ? (best - item.buyPrice) * item.qty : null;
    const pnlPct = (best != null && item.buyPrice > 0) ? ((best - item.buyPrice) / item.buyPrice * 100) : null;
    const pnlHtml = pnl != null
      ? `<span class="pnl-pill ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pnl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pnl), 2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>`
      : '<span class="price-loading">No price data</span>';
    const roi = pnlPct != null ? pnlPct / item.qty : null;
    const roiHtml = pnlPct != null ? `<span class="roi-pill">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%</span>` : '<span class="price-loading">—</span>';
    const ago = p.fetchedAt ? timeAgo(p.fetchedAt) : null;
    const staleMs = p.fetchedAt ? (Date.now() - p.fetchedAt) : null;
    const staleCls = !ago ? '' : staleMs < 3600000 ? 'fresh' : staleMs > 86400000 ? 'old' : '';
    const refreshedHtml = ago ? `<span class="stale-badge ${staleCls}" title="${new Date(p.fetchedAt).toLocaleString()}">${ago}</span>` : '<span style="color:var(--text3);font-size:10px;">Never</span>';
    // Target price logic
    const target = item.targetPrice || null;
    let targetHtml = '';
    if (target) {
      const currentP = best || item.buyPrice;
      const pct = ((currentP - target) / target * 100);
      const hit = currentP >= target;
      const progress = Math.min(100, Math.max(0, (currentP / target) * 100));
      if (hit) {
        targetHtml = `<div class="target-hit" title="Target ${fmtMoney(target, 2)} REACHED!">🎯 ${fmtMoney(target, 2)} ✓</div>`;
      } else {
        targetHtml = `<div class="target-progress" title="Target: ${fmtMoney(target, 2)}">
          <span style="font-size:10px;color:var(--text3);">🎯 ${fmtMoney(target, 2)} <span style="color:var(--orange)">${pct.toFixed(1)}%</span></span>
          <div style="height:3px;background:var(--border);border-radius:2px;margin-top:2px;">
            <div style="width:${progress}%;height:100%;background:var(--orange);border-radius:2px;transition:width 0.3s;"></div>
          </div>
        </div>`;
      }
    }

    return `<tr data-id="${item.id}" ${target && best && best >= target ? 'style="border-left:3px solid var(--green);"' : ''}>
      <td class="bulk-col" style="text-align:center;"><input type="checkbox" class="bulk-cb" ${_bulkSel.has(item.id) ? 'checked' : ''} onclick="bulkToggleOne('${item.id}', this.checked)"></td>
      <td><div class="item-name">${escHtml(item.name)}${item.isTuf ? '<span class="tuf-badge">TUF</span>' : ''}<small>${item.notes ? escHtml(item.notes.slice(0,50)) : (item.marketHash ? '🔗 Auto-price' : '⚠️ No market hash')}</small>${targetHtml}${buildSparkline(item.id)}</div></td>
      <td><span class="type-badge ${typeBadge[item.type]}">${typeLabels[item.type]}</span></td>
      <td class="mono">${item.qty}</td>
      <td class="mono">${fmtMoney(Number(item.buyPrice), 2)}</td>
      <td class="mono">${item.buyDate || '—'}</td>
      <td class="mono">${fmtMoney((item.buyPrice * item.qty), 2)}</td>
      ${renderPriceColumns(item, p, ago)}
      <td>${pnlHtml}</td>
      <td><div class="action-btns row-actions">
        <button class="btn btn-secondary btn-sm" onclick="refreshSingleItem('${item.id}')" title="Refresh">↻</button>
        <button class="btn btn-secondary btn-sm" onclick="openPriceModal('${item.id}')" title="Manual Price">£</button>
        <button class="btn btn-secondary btn-sm" onclick="openSellModal('${item.id}')">✓ Sell</button>
        <button class="btn btn-secondary btn-sm" onclick="openTopupModal('${item.id}')" title="Add more units" style="color:var(--green);">+ Add</button>
        <button class="btn btn-secondary btn-sm" onclick="openTargetModal('${item.id}')" title="Set target price" style="color:var(--orange);">🎯</button>
        <button class="btn btn-secondary btn-sm" onclick="openEditModal('${item.id}')">✎</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('${item.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

function updateStats() {
  let invested = 0, value = 0, items = 0;
  holdings.forEach(h => {
    invested += h.buyPrice * h.qty;
    items += h.qty;
    const best = getBestPrice(h);
    if (best != null) value += best * h.qty;
  });
  const afterFee = value * 0.98;
  const pnl = afterFee - invested;
  const pnlPct = invested ? (pnl / invested * 100) : 0;
  let realised = 0, fees = 0;
  tradeHistory.forEach(t => {
    const gross = t.sellPrice * t.qty;
    const fee = gross * (t.feePercent / 100);
    fees += fee;
    realised += gross - fee - (t.buyPrice * t.qty);
  });
  document.getElementById('stat-invested').textContent = `${fmtMoney(invested, 2)}`;
  document.getElementById('stat-items').textContent = `${items} item${items !== 1 ? 's' : ''}`;
  document.getElementById('stat-value').textContent = `${fmtMoney(afterFee, 2)}`;
  document.getElementById('stat-after-fee').textContent = `${fmtMoney(value, 2)} gross`;
  const pnlEl = document.getElementById('stat-pnl');
  pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 2)}`;
  pnlEl.className = `stat-value ${pnl >= 0 ? 'positive' : 'negative'}`;
  document.getElementById('stat-pnl-card').className = `stat-card ${pnl >= 0 ? 'green' : 'red'}`;
  document.getElementById('stat-pnl-pct').textContent = `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
  document.getElementById('stat-realised').textContent = `${realised >= 0 ? '+' : ''}${fmtMoney(realised, 2)}`;
  document.getElementById('stat-trades').textContent = `${tradeHistory.length} trade${tradeHistory.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-fees').textContent = `${fmtMoney(fees, 2)}`;
  renderAllocBar();
  renderAnalytics();
}

// ---- Holdings allocation strip (v2.5.0) ----
// Stacked bar of portfolio value by bucket. TUF items are their own bucket
// regardless of underlying type; everything else groups by item type.
// Clicking a segment/legend chip applies the matching type filter (click again to clear).
const ALLOC_BUCKETS = [
  { key:'case',    label:'Cases',    color:'#38bdf8', filter:'case' },
  { key:'sticker', label:'Stickers', color:'#a78bfa', filter:'sticker' },
  { key:'tuf',     label:'TUF',      color:'#22c55e', filter:'tuf' },
  { key:'skin',    label:'Skins',    color:'#fbbf24', filter:'skin' },
  { key:'knife',   label:'Knives',   color:'#f97316', filter:'knife' },
  { key:'armory',  label:'Armory',   color:'#ef4444', filter:'armory' },
  { key:'other',   label:'Other',    color:'#64748b', filter:null },
];

function allocBucketFor(h) {
  if (h.isTuf) return 'tuf';
  if (['case','sticker','skin','knife','armory'].includes(h.type)) return h.type;
  return 'other';
}

function renderAllocBar() {
  const wrap = document.getElementById('allocBarWrap');
  if (!wrap) return;
  const totals = {};
  let total = 0;
  holdings.forEach(h => {
    const best = getBestPrice(h);
    const val = (best != null ? best : h.buyPrice) * h.qty;
    const b = allocBucketFor(h);
    totals[b] = (totals[b] || 0) + val;
    total += val;
  });
  if (!total) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  const active = ALLOC_BUCKETS.filter(b => totals[b.key] > 0);
  const curFilter = document.getElementById('filterType')?.value || '';

  document.getElementById('allocBar').innerHTML = active.map(b => {
    const pct = (totals[b.key] / total) * 100;
    const dim = curFilter && curFilter !== b.filter;
    return '<div onclick="allocFilterClick(\'' + (b.filter || '') + '\')" ' +
      'title="' + b.label + ': ' + fmtMoney(totals[b.key], 0) + ' (' + pct.toFixed(1) + '%)" ' +
      'style="width:' + pct + '%;background:' + b.color + ';cursor:' + (b.filter ? 'pointer' : 'default') + ';' +
      (dim ? 'opacity:.25;' : '') + 'transition:opacity .15s;"></div>';
  }).join('');

  document.getElementById('allocLegend').innerHTML = active.map(b => {
    const pct = (totals[b.key] / total) * 100;
    const dim = curFilter && curFilter !== b.filter;
    return '<span onclick="allocFilterClick(\'' + (b.filter || '') + '\')" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-family:\'Share Tech Mono\',monospace;font-size:10px;color:var(--text2);cursor:' + (b.filter ? 'pointer' : 'default') + ';' + (dim ? 'opacity:.35;' : '') + '">' +
      '<span style="width:8px;height:8px;border-radius:2px;background:' + b.color + ';display:inline-block;"></span>' +
      b.label + ' <span style="color:var(--text3)">' + pct.toFixed(1) + '% · ' + fmtMoney(totals[b.key], 0) + '</span></span>';
  }).join('');

  document.getElementById('allocFilterHint').textContent = curFilter ? 'filtered — click again to clear' : 'click to filter';
}

function allocFilterClick(filter) {
  if (!filter) return;
  const sel = document.getElementById('filterType');
  if (!sel) return;
  sel.value = (sel.value === filter) ? '' : filter;
  filterTable(document.getElementById('searchInput')?.value || '');
  if (typeof updateRefreshScopeLabel === 'function') updateRefreshScopeLabel();
  renderAllocBar();
}

// ========================
// CGT (CAPITAL GAINS TAX) TRACKER
// ========================
// ========================
// TAX PROFILES (v3.0.0 — Vault Pro Phase 3: Multi-Jurisdiction Tax Engine)
// ========================
// Each jurisdiction is a pluggable TaxProfile. The Phase 2 lot/matching engine
// (recomputeCGTGains) is REUSED untouched — profiles only decide what happens to
// the per-disposal gains afterward: which disposals count, how they're classified
// (holding period), the tax-year boundary, allowance/exemption, rates, and the
// currency tax figures render in. Selected by getTaxJurisdiction().
//
// Schema (per profile):
//   code, name, taxCurrency
//   taxYearStart(now) -> 'YYYY-MM-DD'   (year boundary)
//   taxYearLabel(now) -> string         (e.g. '2025/26' or '2026')
//   allowance                           (annual exemption/Freigrenze in tax currency; 0 = none)
//   allowanceIsCliff                    (DE: allowance is a Freigrenze — total gains < it
//                                        are fully tax-free, but at/above it the WHOLE gain
//                                        is taxable from the first unit. UK/CA: deductible.)
//   allowanceIsProceedsCliff            (FI: like a cliff, but the trip-wire is total in-year
//                                        sale PROCEEDS, not gains. Below the threshold of
//                                        proceeds the whole gain is tax-free; at/above it the
//                                        whole gain is taxable. Caller passes proceedsTotal.)
//   rates { ...bands }                  (for the estimate)
//   disposalCounts(trade) -> bool       (disposal definition — UK excludes Steam Wallet)
//   classifyGain(disp)    -> { bucket, taxable, label, flagged }
//   feeDeductible                       (all true currently)
//   disclaimer                          (per-jurisdiction wording)
//   knownLimits                         (optional: short in-product "known limits" note)

// Apply a profile's annual exemption to a net gain, returning the gain that remains
// taxable AFTER the exemption. Three regimes:
//   - Proceeds cliff (FI small-sales exemption): the trip-wire is total in-year sale
//     PROCEEDS, not gains. If total proceeds are strictly below the threshold the whole
//     gain is tax-free (returns 0); at/above it the ENTIRE gain is taxable. The caller
//     must pass proceedsTotal (in the same currency as the gain being rolled up).
//   - Cliff (Freigrenze, DE): gains strictly below the threshold are fully tax-free
//     (returns 0); at/above it the ENTIRE gain is taxable (returns netGain).
//   - Deductible (UK allowance, default): the threshold is subtracted (returns
//     max(0, netGain - allowance)).
// inclusionRate (CA 50%) is applied by the caller AFTER this, on the taxable remainder.
function _applyExemption(netGain, profile, proceedsTotal) {
  const allowance = profile.allowance || 0;
  const g = Math.max(0, netGain);
  if (allowance <= 0) return g;
  if (profile.allowanceIsProceedsCliff) {                       // FI proceeds cliff
    const proceeds = Math.max(0, proceedsTotal || 0);
    return proceeds <= allowance ? 0 : g;
  }
  if (profile.allowanceIsCliff) return g < allowance ? 0 : g; // Freigrenze cliff
  return Math.max(0, g - allowance);                          // deductible allowance
}

// "Exemption used" for the progress bar. For a proceeds cliff it tracks proceeds vs the
// threshold (all-or-nothing once proceeds cross it); for a gains cliff it's all-or-nothing
// on gains; for a deductible allowance it's the portion of the allowance consumed.
function _exemptionUsed(netGain, profile, proceedsTotal) {
  const allowance = profile.allowance || 0;
  const g = Math.max(0, netGain);
  if (allowance <= 0) return 0;
  if (profile.allowanceIsProceedsCliff) {
    const proceeds = Math.max(0, proceedsTotal || 0);
    return Math.min(proceeds, allowance);
  }
  if (profile.allowanceIsCliff) return g < allowance ? Math.min(g, allowance) : allowance;
  return Math.min(g, allowance);
}

// Holding-period helper: months between an acquisition date and a disposal date.
function _monthsHeld(acqDate, sellDate) {
  if (!acqDate || !sellDate) return null;
  const a = new Date(acqDate), s = new Date(sellDate);
  if (isNaN(a) || isNaN(s)) return null;
  return (s - a) / (365.25 / 12 * 86400000);
}

// Derive a disposal's effective acquisition date from the matched lots returned by
// the Phase 2 matcher. Earliest matched real lot date = most conservative for a
// >12-month "long-term"/exemption test. Returns null if no dated real lot matched
// (legacy data) so each profile can degrade explicitly.
function _disposalAcqDate(rc) {
  if (!rc || !Array.isArray(rc.lotMatches)) return null;
  const dates = [];
  rc.lotMatches.forEach(m => {
    if (m.rule === 'legacy-fallback') return;
    // UK same-day / B&B matches carry a single `date`; pool/FIFO/specific matches
    // carry a `dateParts` array of the lots they consumed.
    if (m.date) dates.push(m.date);
    if (Array.isArray(m.dateParts)) m.dateParts.forEach(p => { if (p.date) dates.push(p.date); });
  });
  if (!dates.length) return null;
  dates.sort();
  return dates[0]; // earliest matched acquisition date (most conservative for >12mo tests)
}

const TAX_PROFILES = {
  UK: {
    code: 'UK', name: 'United Kingdom', taxCurrency: 'GBP',
    taxYearStart(now) {
      now = now || new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      if (m > 4 || (m === 4 && now.getDate() >= 6)) return y + '-04-06';
      return (y - 1) + '-04-06';
    },
    taxYearLabel(now) {
      now = now || new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      if ((m >= 4 && now.getDate() >= 6) || m > 4) return y + '/' + (y + 1);
      return (y - 1) + '/' + y;
    },
    allowance: 3000,                 // £3,000 annual exempt amount (2024/25, 2025/26)
    rates: { basic: 18, higher: 24 },
    feeDeductible: true,
    // The app's chosen position: a Steam-Wallet sale is not a taxable disposal.
    disposalCounts(t) { return tradePlatform(t) !== 'steam'; },
    // Single CGT bucket — no holding-period split in the UK.
    classifyGain() { return { bucket: 'cgt', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only. The app\u2019s position: Steam Wallet sales aren\u2019t taxable; CGT applies on real-money cashout. The "incl. Steam" figure shows the stricter reading where a Steam-to-Steam disposal also counts \u2014 an unsettled area (whether a Valve-licensed skin is "property" at all remains legally undecided). This is not tax advice; consult a digital-asset-literate accountant before filing.',
  },
  US: {
    code: 'US', name: 'United States', taxCurrency: 'USD',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,                    // no blanket annual capital-gains exemption
    // Indicative bands: long-term 0/15/20%; short-term taxed as ordinary income
    // (shown as an indicative ordinary band — the app can't know the user's bracket).
    rates: { longLow: 15, longHigh: 20, shortLow: 22, shortHigh: 37 },
    feeDeductible: true,
    disposalCounts() { return true; }, // every sale is a disposal
    // Short-term (held \u226412mo) vs long-term (>12mo). Unknown acq date -> short-term (conservative).
    classifyGain(disp) {
      const held = _monthsHeld(disp.acqDate, disp.sellDate);
      if (held == null) return { bucket: 'short', taxable: true, label: 'short-term (acq. date unknown)', flagged: true };
      return held > 12
        ? { bucket: 'long', taxable: true, label: 'long-term', flagged: false }
        : { bucket: 'short', taxable: true, label: 'short-term', flagged: false };
    },
    disclaimer: 'Estimated only and not tax advice. The US taxes every disposal: short-term gains (assets held 12 months or less) are taxed as ordinary income; long-term gains (held more than 12 months) use the 0/15/20% bands. Edge case not modelled: knives and rare items may qualify as "collectibles", whose long-term gains are taxed at up to 28% (not the 0/15/20% bands shown) \u2014 review high-value items with a CPA. 1099-K: marketplaces may report your GROSS proceeds to the IRS (federal reporting threshold reverted to $20,000 AND 200+ transactions for 2025 onward under the OBBB Act; individual states may set lower thresholds); the app\u2019s per-disposal cost-basis records are your defence for reporting the actual gain rather than the gross. Disposals whose acquisition date is unknown (imported before lot tracking) are treated as short-term. Consult a qualified tax professional / CPA.',
    knownLimits: 'Collectibles rate (up to 28% on long-term gains for knives/rare items) is not modelled \u2014 the 0/15/20% bands are shown. 1099-K marketplace reporting is gross-proceeds; keep your cost-basis records.',
  },
  DE: {
    code: 'DE', name: 'Germany', taxCurrency: 'EUR',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 1000,                 // \u00a723 EStG Freigrenze (\u20ac600 historically, \u20ac1,000 from 2024)
    allowanceIsCliff: true,          // Freigrenze: total in-year gains < \u20ac1,000 are tax-free,
                                     // at/above \u20ac1,000 the WHOLE gain is taxable from the first euro
    rates: { flat: 30 },             // indicative personal income-tax rate on sub-12mo private sales
    feeDeductible: true,
    disposalCounts() { return true; },
    // \u00a723 EStG private sale: gain is TAX-FREE if the asset was held > 1 year.
    // Only sub-12-month disposals are taxable. Unknown acq date -> treat as taxable (conservative).
    classifyGain(disp) {
      const held = _monthsHeld(disp.acqDate, disp.sellDate);
      if (held == null) return { bucket: 'taxable', taxable: true, label: 'taxable (acq. date unknown)', flagged: true };
      return held > 12
        ? { bucket: 'exempt', taxable: false, label: 'exempt (held > 1 year)', flagged: false }
        : { bucket: 'taxable', taxable: true, label: 'taxable (held \u2264 1 year)', flagged: false };
    },
    disclaimer: 'Estimated only and not tax advice (keine Steuerberatung). Under \u00a7 23 EStG, private sales of an asset held longer than one year are tax-free; only disposals within the 1-year holding period are taxable. The \u20ac1,000 Freigrenze is a cliff, not an allowance: if your total taxable private-sale gains for the year stay below \u20ac1,000 they are entirely tax-free, but once they reach \u20ac1,000 the whole amount is taxable from the first euro. The Freigrenze pools ALL of your private sales in the year (crypto, gold, other valuables \u2014 not just skins), so this skins-only view is necessarily partial: add your other \u00a7 23 disposals before judging whether the \u20ac1,000 cliff is crossed. Disposals whose acquisition date is unknown (imported before lot tracking) are treated as taxable. Consult a Steuerberater.',
    knownLimits: 'The \u20ac1,000 Freigrenze covers ALL your \u00a7 23 EStG private sales for the year, not just skins \u2014 combine with any other private-sale gains (crypto, gold, etc.) before judging the cliff.',
  },
  CA: {
    code: 'CA', name: 'Canada', taxCurrency: 'CAD',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,                    // no separate annual capital-gains exemption for this asset class
    inclusionRate: 0.5,              // only 50% of a net capital gain is taxable
                                     // Classification (v3.6.1): skins held for investment are
                                     // ORDINARY CAPITAL PROPERTY (ITA s.54 PUP is a use test -
                                     // "primarily for personal use or enjoyment" - which
                                     // investment holdings fail). So NO $1,000 PUP floor
                                     // (s.46(1)) and losses ARE deductible (s.40(2)(g)(iii)
                                     // loss denial doesn't engage). The alternative PUP
                                     // reading is disclosed in the disclaimer/knownLimits.
    rates: { flat: 25 },             // indicative marginal rate applied to the taxable (50%) portion
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'capital', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice. Canada uses the adjusted cost base (ACB / pooling) and includes 50% of a net capital gain in taxable income (the inclusion rate). This app treats skins held for investment as ordinary capital property: gains and losses are computed on real cost and proceeds, and capital losses are deductible against capital gains in the normal way. Alternative reading: if you hold skins primarily for personal use or enjoyment rather than investment, the CRA personal-use-property (PUP) rules apply instead \u2014 cost and proceeds are each deemed to be at least CAD $1,000 per disposal, losses are generally denied (deemed nil), and listed-personal-property (LPP) losses can only offset LPP gains; this app does NOT apply those rules. Note also that frequent, business-like flipping can be assessed as business income (100% taxable) rather than capital gains. The estimate applies an indicative marginal rate to the taxable (50%) portion. Consult a qualified Canadian tax professional.',
    knownLimits: 'Skins are treated as investor-held ordinary capital property: losses deductible, no CAD $1,000 personal-use-property floor. If your skins are genuinely personal-use property (held for enjoyment, not investment), the $1,000 floor and denied-loss / LPP ring-fencing rules apply instead \u2014 review with an accountant. Business-like trading may be taxed as income, not capital gains.',
  },
  SE: {
    code: 'SE', name: 'Sweden', taxCurrency: 'SEK',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,                    // no general allowance for this asset class (the SEK 50k
                                     // personal-asset exemption is real-property/personalty specific; not relied on here)
    rates: { flat: 30 },             // flat 30% on capital income (kapitalvinst)
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'capital', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice (ej skatter\u00e5dgivning). Sweden taxes capital gains (kapitalvinst) on investment assets at a flat 30% rate, regardless of holding period. Gains are computed per disposal (sale price minus omkostnadsbelopp / acquisition cost). Losses on this kind of asset are generally only partly deductible against other capital income \u2014 the app pools gains and losses, which may overstate deductible losses. Report on the K4 form. Consult a Swedish skatter\u00e5dgivare / revisor.',
    knownLimits: 'Loss deductibility is simplified \u2014 Sweden restricts how non-share capital losses offset other capital income (often to ~70%); the app pools gains/losses in full. Review losses with a revisor.',
  },
  PL: {
    code: 'PL', name: 'Poland', taxCurrency: 'PLN',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,                    // the personal tax-free amount does NOT apply to capital gains
    rates: { flat: 19 },             // flat 19% PIT on capital gains
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'capital', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice (to nie jest porada podatkowa). Poland taxes capital gains at a flat 19% rate (the general tax-free amount does not apply to this income), regardless of holding period. Acquisition cost and transaction expenses are deductible. For virtual-currency income, any excess acquisition costs in a year are not lost \u2014 they roll forward and are deductible against the next year\u2019s crypto proceeds (income is floored at zero, so a \u201closs\u201d as such cannot arise). The app only nets gains/costs within the current tax year and does not carry the excess forward. Report on the PIT-38 form. Consult a Polish doradca podatkowy.',
    knownLimits: 'Excess acquisition costs rolling into the next year\u2019s crypto costs (no 5-year cap; income floored at zero) are not modelled \u2014 the app only nets gains/costs within the current tax year. FIFO is a label only: Poland pools all in-year costs against all in-year proceeds, with no lot-matching.',
  },
  AU: {
    code: 'AU', name: 'Australia', taxCurrency: 'AUD',
    // Australian tax year: 1 July \u2013 30 June.
    taxYearStart(now) {
      now = now || new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      return (m >= 7 ? y : y - 1) + '-07-01';
    },
    taxYearLabel(now) {
      now = now || new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      const start = (m >= 7 ? y : y - 1);
      return start + '/' + (start + 1);
    },
    allowance: 0,
    // The 50% CGT discount is HOLDING-PERIOD GATED (only gains on assets held >12mo),
    // so inclusion is decided per disposal, not as a flat profile rate.
    perDisposalInclusion: true,
    rates: { flat: 32.5 },           // indicative marginal rate (the app can't know the user's bracket)
    feeDeductible: true,
    disposalCounts() { return true; },
    // >12mo held -> eligible for the 50% CGT discount (incl 0.5); else full gain (incl 1.0).
    // Unknown acq date -> no discount (conservative, full inclusion), flagged.
    classifyGain(disp) {
      const held = _monthsHeld(disp.acqDate, disp.sellDate);
      if (held == null) return { bucket: 'full', taxable: true, label: 'no discount (acq. date unknown)', flagged: true, inclusion: 1 };
      return held > 12
        ? { bucket: 'discount', taxable: true, label: 'discounted (50% \u2014 held > 1 year)', flagged: false, inclusion: 0.5 }
        : { bucket: 'full', taxable: true, label: 'full (held \u2264 1 year)', flagged: false, inclusion: 1 };
    },
    disclaimer: 'Estimated only and not tax advice. Australia includes net capital gains in your assessable income and taxes them at your marginal rate; the figures here use an indicative rate because the app can\u2019t know your bracket. The 50% CGT discount applies only to assets held more than 12 months \u2014 the app applies it per disposal based on the matched lot dates. Disposals whose acquisition date is unknown (imported before lot tracking) get NO discount (full gain), flagged. Note: assets acquired for $10,000 or less may be exempt as a personal-use asset (and personal-use-asset losses are disregarded) \u2014 the app does NOT apply this exemption, so low-value items may be over-counted. A 2027 reform will replace the 50% discount with cost-base indexation; this profile models the CURRENT (pre-July-2027) rules. Consult a registered Australian tax agent.',
    knownLimits: 'The $10,000 personal-use-asset CGT exemption is NOT applied (low-value items may be over-counted). The marginal rate is indicative. 2027 reform (indexation replacing the 50% discount) is not yet modelled.',
  },
  NO: {
    code: 'NO', name: 'Norway', taxCurrency: 'NOK',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,
    // Skins are treated as a general asset (like crypto), taxed at the flat 22% ordinary
    // capital-income rate \u2014 NOT the 1.72 share/dividend uplift (that's shares-only).
    rates: { flat: 22 },
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'capital', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice (ikke skatter\u00e5dgivning). Norway taxes general capital gains (including crypto-like assets) as ordinary income at a flat 22%, regardless of holding period. The 1.72 upward adjustment factor that pushes shares/dividends to an effective 37.84% does NOT apply to this asset class \u2014 skins are treated as a general asset, not a share. Cost basis uses FIFO. Losses are deductible against income. Consult a Norwegian skatter\u00e5dgiver.',
    knownLimits: 'Treated as a general (crypto-like) asset at 22%, not a share \u2014 if the tax office were to treat skins as a financial instrument the 1.72 uplift (eff. 37.84%) could apply. Verify classification.',
  },
  DK: {
    code: 'DK', name: 'Denmark', taxCurrency: 'DKK',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    allowance: 0,
    // Denmark taxes speculative personal-asset gains as PERSONAL INCOME at the user's
    // marginal rate (up to ~52%). The app can't know the bracket, so it shows an
    // indicative high rate. This is the messiest profile \u2014 disclaimer is emphatic.
    rates: { flat: 42 },             // indicative; true rate is marginal personal income up to ~52%
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'income', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice (ikke skatter\u00e5dgivning). Denmark generally treats gains on speculative personal assets (the crypto/skins category) as PERSONAL INCOME, taxed at your marginal rate \u2014 which can reach about 52%. The app shows an indicative rate because it cannot know your bracket, so your real liability may be higher or lower. Cost basis uses FIFO (in DKK). Loss rules are strict and asset-specific (losses generally only offset gains of the same kind, with no buys in between) \u2014 the app pools gains/losses, which may overstate deductible losses. Whether a given holding is "speculative" is itself a Skattestyrelsen judgement. Consult a Danish revisor / skatter\u00e5dgiver before filing.',
    knownLimits: 'Rate is INDICATIVE \u2014 Denmark taxes these gains as marginal personal income (up to ~52%), not a flat rate the app can compute. Strict same-asset loss rules are not modelled (losses pooled). Speculative-intent classification is case-by-case.',
  },
  FI: {
    code: 'FI', name: 'Finland', taxCurrency: 'EUR',
    taxYearStart(now) { return (now || new Date()).getFullYear() + '-01-01'; },
    taxYearLabel(now) { return String((now || new Date()).getFullYear()); },
    // \u20ac1,000 small-sales exemption: tax-free only if TOTAL annual sale proceeds are
    // at or below \u20ac1,000 (TVL \u00a748.6), not a gains cliff. Modelled as a proceeds cliff.
    allowance: 1000,
    allowanceIsProceedsCliff: true,
    rates: { lower: 30, upper: 34, threshold: 30000 }, // 30% up to \u20ac30k capital income, 34% above
    feeDeductible: true,
    disposalCounts() { return true; },
    classifyGain() { return { bucket: 'capital', taxable: true, label: '', flagged: false }; },
    disclaimer: 'Estimated only and not tax advice (ei veroneuvontaa). Finland taxes capital income at 30% up to \u20ac30,000 of capital income per year and 34% above that. A small-sales exemption makes your gains tax-free if your TOTAL sale proceeds for the year stay at or below \u20ac1,000 (TVL \u00a748.6); once your total proceeds cross \u20ac1,000, the whole gain is taxable. The app tracks your total in-year proceeds against this threshold. Each disposal (including swaps) is a taxable event; cost basis can use actual cost or the deemed-acquisition-cost (hankintameno-olettama) rule, which the app does NOT apply. Report on form 9. Consult a Finnish veroasiantuntija.',
    knownLimits: 'The \u20ac1,000 small-sales exemption is keyed off your total in-year sale proceeds (correct per TVL \u00a748.6). The proceeds total only covers items tracked in the app \u2014 add any other virtual-currency sales before judging the boundary. The deemed-acquisition-cost (hankintameno-olettama) option is not modelled (the app uses actual cost, so it may overstate tax). The 30%/34% split is on total capital income, which the app sees only partially.',
  },
};

function getActiveTaxProfile() {
  return TAX_PROFILES[getTaxJurisdiction()] || TAX_PROFILES.UK;
}

// --- Back-compat shims (UK-derived) ---------------------------------------
// Older code referenced CGT_ALLOWANCE / CGT_RATES and the UK-only tax-year
// helpers directly. These now delegate to the ACTIVE profile so existing call
// sites keep working while the engine is jurisdiction-aware.
const CGT_ALLOWANCE = 3000; // legacy alias (UK). Engine uses profile.allowance.
const CGT_RATES = { basic: 18, higher: 24 }; // legacy alias (UK).

function getCurrentTaxYear() { return getActiveTaxProfile().taxYearLabel(new Date()); }
function getTaxYearStart() { return getActiveTaxProfile().taxYearStart(new Date()); }

// Resolve the effective platform for a trade record.
// Explicit platform wins. For older records that predate consistent platform
// capture, infer from the fee rate: ~15% = Steam Market, anything else = CSFloat.
// (Steam Market total fee is 15%; CSFloat is 2%.) This stops a 15%-fee Steam
// sale from being mislabelled "CSFloat" and wrongly counted toward CGT.
function tradePlatform(t) {
  if (t.platform) return t.platform;
  if (t.feePercent != null && t.feePercent >= 13) return 'steam';
  return 'csfloat';
}

// ========================
// COST BASIS ENGINE (v2.10.0 — Vault Pro Phase 2)
// ========================
// Lots are the source of truth for tax. Each holding carries a `lots[]` array;
// `buyPrice`/`qty` on the holding are a derived weighted-average MIRROR so the
// 100+ existing read sites keep working untouched.
//
// A disposal consumes lots per the active cost-basis method:
//   - pooling  : UK Section 104 average cost (+ same-day & 30-day B&B matching)
//   - fifo     : oldest lots first (US default, Germany)
//   - specific : consume the item's own lots in stored order (current behaviour)
// The method is a per-jurisdiction setting; UK = pooling, locked for now.

const COST_BASIS_KEY = 'cs2vault_cost_basis_method';
const TAX_JURISDICTION_KEY = 'cs2vault_tax_jurisdiction';

// Jurisdiction → cost-basis method. UK is locked to pooling for now; the others
// are declared so the engine + future tax profiles can plug straight in.
const JURISDICTION_METHODS = {
  UK: 'pooling',
  US: 'fifo',
  DE: 'fifo',
  CA: 'pooling',
  AU: 'pooling',   // ATO accepts methods; pooling/average is a reasonable default
  SE: 'pooling',   // Sweden uses genomsnittsmetoden (average-cost) for securities-like assets
  NO: 'fifo',      // Norway uses FIFO for crypto-like assets
  FI: 'fifo',      // Finland FIFO (hankintameno actual-cost; FIFO ordering)
  DK: 'fifo',      // Denmark FIFO
  PL: 'fifo',      // Poland — FIFO a reasonable default
};

function getTaxJurisdiction() {
  // Multi-jurisdiction is a Pro feature — free users are clamped to UK
  // regardless of any stored value (so the engine, exports and badges all
  // behave as UK without touching the gated-feature code itself).
  if (!featureUnlocked('multiJurisdiction')) return 'UK';
  const j = window._store[TAX_JURISDICTION_KEY];
  return (j && JURISDICTION_METHODS[j]) ? j : 'UK';
}

// The effective method. For UK it is force-locked to pooling regardless of any
// stored override (pooling is mandatory under HMRC S.104). Other jurisdictions
// fall back to their default but may be overridden by the stored method —
// but choosing a non-default method is a Pro feature, so free users get the
// jurisdiction default only.
function getCostBasisMethod() {
  const j = getTaxJurisdiction();
  if (j === 'UK') return 'pooling';
  if (!featureUnlocked('costBasisMethod')) return JURISDICTION_METHODS[j] || 'pooling';
  const stored = window._store[COST_BASIS_KEY];
  if (stored === 'pooling' || stored === 'fifo' || stored === 'specific') return stored;
  return JURISDICTION_METHODS[j] || 'pooling';
}

function costBasisMethodLabel(m) {
  return m === 'pooling' ? 'Average cost (Section 104 pool)'
       : m === 'fifo'    ? 'FIFO (first-in, first-out)'
       : m === 'specific'? 'Specific identification'
       : m;
}

// Has any disposal already happened in the current tax year? (used to warn on
// a mid-year method change, which would re-base already-reported gains).
function _hasDisposalsThisTaxYear() {
  try {
    const start = getTaxYearStart();
    return (Array.isArray(tradeHistory) ? tradeHistory : []).some(t => t.sellDate && t.sellDate >= start);
  } catch (e) { return false; }
}

function setTaxJurisdiction(j) {
  if (!JURISDICTION_METHODS[j]) j = 'UK';
  // Non-UK jurisdictions are a Pro feature. Free users are kept on UK.
  if (j !== 'UK' && !featureUnlocked('multiJurisdiction')) {
    const sel = document.getElementById('settingsJurisdiction');
    if (sel) sel.value = 'UK';
    showProToast('multiJurisdiction');
    return;
  }
  if (_hasDisposalsThisTaxYear()) {
    if (!confirm('You already have disposals recorded in the current tax year. Changing jurisdiction changes how their cost basis is matched, which will alter your reported gains for this year. Continue?')) {
      // revert the dropdown to the stored value
      const sel = document.getElementById('settingsJurisdiction');
      if (sel) sel.value = getTaxJurisdiction();
      return;
    }
  }
  window._storeSet(TAX_JURISDICTION_KEY, j);
  // UK forces pooling; otherwise default the method to the jurisdiction default.
  if (j === 'UK') window._storeSet(COST_BASIS_KEY, 'pooling');
  else window._storeSet(COST_BASIS_KEY, JURISDICTION_METHODS[j]);
  syncCostBasisSettingsUI();
  try { renderHistory(); } catch (e) {}
  toast('Tax jurisdiction set to ' + j, 'success');
}

function setCostBasisMethod(m) {
  const j = getTaxJurisdiction();
  if (j === 'UK') {
    // Locked — pooling is mandatory under HMRC S.104.
    toast('UK is locked to Section 104 pooling', 'info');
    syncCostBasisSettingsUI();
    return;
  }
  // Choosing a method is a Pro feature (free non-UK users get the default).
  if (!featureUnlocked('costBasisMethod')) {
    syncCostBasisSettingsUI();
    showProToast('costBasisMethod');
    return;
  }
  if (m !== 'pooling' && m !== 'fifo' && m !== 'specific') return;
  if (_hasDisposalsThisTaxYear()) {
    if (!confirm('Changing the cost-basis method mid-year re-bases gains for disposals already recorded in this tax year. Continue?')) {
      syncCostBasisSettingsUI();
      return;
    }
  }
  window._storeSet(COST_BASIS_KEY, m);
  syncCostBasisSettingsUI();
  try { renderHistory(); } catch (e) {}
  toast('Cost basis method: ' + costBasisMethodLabel(m), 'success');
}

// Reflect stored jurisdiction/method into the Settings dropdowns + lock state.
function syncCostBasisSettingsUI() {
  const j = getTaxJurisdiction();
  const m = getCostBasisMethod();
  const jSel = document.getElementById('settingsJurisdiction');
  const mSel = document.getElementById('settingsCostBasis');
  const note = document.getElementById('costBasisNote');
  const methodUnlocked = featureUnlocked('costBasisMethod');
  if (jSel) jSel.value = j;
  if (mSel) {
    mSel.value = m;
    // Disabled for UK (locked to pooling) OR when the method-choice feature is
    // gated (free tier gets the jurisdiction default only).
    const disabled = (j === 'UK') || !methodUnlocked;
    mSel.disabled = disabled;
    mSel.style.opacity = disabled ? '0.55' : '1';
  }
  if (note) {
    if (j === 'UK') {
      note.textContent = 'UK is locked to Section 104 pooling (average cost) with same-day + 30-day rules.';
    } else if (!methodUnlocked) {
      note.textContent = 'Active method: ' + costBasisMethodLabel(m) + '. Choosing a different method is a Vault Pro feature.';
    } else {
      note.textContent = 'Active method: ' + costBasisMethodLabel(m) + '. Changing it mid-year re-bases recorded gains.';
    }
  }
}

// Build a single lot from a holding-like buy. unitCost is GBP (the internal base).
function makeLot(qty, unitCost, date, origCurrency, fxRate, origAmount, lotId) {
  return {
    id: lotId || uid(),
    qty: qty,
    unitCost: +(+unitCost).toFixed(6),
    date: date || '',
    origCurrency: origCurrency || 'GBP',
    fxRate: (fxRate != null) ? fxRate : 1,
    origAmount: (origAmount != null) ? origAmount : +(+unitCost).toFixed(6),
  };
}

// Ensure a holding has a lots[] array. Lossless: a holding with no lots becomes
// a single lot from its existing buyPrice/qty/buyDate + FX provenance.
function ensureLots(h) {
  if (Array.isArray(h.lots) && h.lots.length) return h.lots;
  h.lots = [ makeLot(h.qty, h.buyPrice, h.buyDate, h.origCurrency, h.fxRate, h.origAmount) ];
  return h.lots;
}

// Reduce a holding's lots in place by `qty`, per the chosen method, so the
// stored lot structure reflects what's actually been sold. For pooling the
// drain is proportional across lots (the pool has one average anyway); for
// FIFO/specific the oldest/stored-order lots go first.
function consumeLotsInPlace(h, qty, method) {
  if (!Array.isArray(h.lots) || !h.lots.length) return;
  let remaining = qty;
  if (method === 'fifo') {
    h.lots = [...h.lots].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0);
  }
  for (const l of h.lots) {
    if (remaining <= 0) break;
    const d = Math.min(l.qty, remaining);
    l.qty -= d; remaining -= d;
  }
  h.lots = h.lots.filter(l => l.qty > 1e-9);
  recalcHoldingFromLots(h);
}

// Recompute a holding's derived qty + weighted-average buyPrice from its lots.
// Called after any lot mutation (add / top-up). Keeps every legacy read correct.
function recalcHoldingFromLots(h) {
  if (!Array.isArray(h.lots) || !h.lots.length) return h;
  let q = 0, cost = 0;
  h.lots.forEach(l => { q += l.qty; cost += l.qty * l.unitCost; });
  h.qty = q;
  h.buyPrice = q > 0 ? +(cost / q).toFixed(6) : 0;
  // Surface the most recent lot date as the holding buyDate (display only)
  const dated = h.lots.map(l => l.date).filter(Boolean).sort();
  if (dated.length) h.buyDate = dated[dated.length - 1];
  return h;
}

// Group buys (lots) and sells (trades) by a stable item key. Trades reference the
// item by name+type (that's all the history stores), so we key on the same.
function _itemKey(name, type) {
  return (name || '').trim().toLowerCase() + '|' + (type || '').trim().toLowerCase();
}

// Core matcher: given a chronological list of timeline events for ONE item, run
// the chosen method and annotate each disposal with { costBasis, gain, lotMatches }.
// events: [{ kind:'buy', date, lots:[...] } | { kind:'sell', date, trade }]  (already sorted)
function _matchItemTimeline(events, method, opts) {
  opts = opts || {};
  const ukRules = !!opts.ukRules; // same-day + 30-day B&B (pooling only, UK)
  // Working pool of lots (clones, so we never mutate stored data)
  let pool = [];
  // Index buys by date for same-day / B&B matching
  const results = []; // disposal results in event order

  // Pre-extract buys with their dates for forward-looking B&B matching
  const buyEvents = events.filter(e => e.kind === 'buy');

  const consumeFromPool = (qtyNeeded) => {
    // Consume by method from the current pool. Returns total cost consumed and the
    // set of source lot dates consumed (with qty), so the caller can classify the
    // disposal's holding period (US long/short, DE 1-year exemption).
    let cost = 0, remaining = qtyNeeded;
    const dateParts = []; // [{ qty, date }]
    if (method === 'pooling') {
      // Section 104: single average price across the whole pool
      const poolQty = pool.reduce((a, l) => a + l.qty, 0);
      const poolCost = pool.reduce((a, l) => a + l.qty * l.unitCost, 0);
      const avg = poolQty > 0 ? poolCost / poolQty : 0;
      const take = Math.min(remaining, poolQty);
      cost = take * avg;
      // Drain the pool proportionally (record each lot's date as we drain it)
      let drain = take;
      for (const l of pool) {
        if (drain <= 0) break;
        const d = Math.min(l.qty, drain);
        if (d > 0 && l.date) dateParts.push({ qty: d, date: l.date });
        l.qty -= d; drain -= d;
      }
      pool = pool.filter(l => l.qty > 1e-9);
      remaining -= take;
    } else if (method === 'fifo') {
      for (const l of pool) {
        if (remaining <= 0) break;
        const d = Math.min(l.qty, remaining);
        if (d > 0 && l.date) dateParts.push({ qty: d, date: l.date });
        cost += d * l.unitCost; l.qty -= d; remaining -= d;
      }
      pool = pool.filter(l => l.qty > 1e-9);
    } else { // specific — consume in stored lot order (mirrors current row behaviour)
      for (const l of pool) {
        if (remaining <= 0) break;
        const d = Math.min(l.qty, remaining);
        if (d > 0 && l.date) dateParts.push({ qty: d, date: l.date });
        cost += d * l.unitCost; l.qty -= d; remaining -= d;
      }
      pool = pool.filter(l => l.qty > 1e-9);
    }
    return { cost, shortfall: remaining, dateParts };
  };

  for (const ev of events) {
    if (ev.kind === 'buy') {
      // Clone lots into the pool, tagging each with its acquisition date so the
      // UK same-day / bed-and-breakfast rules can pull specific dated lots out
      // ahead of the Section 104 pool.
      ev.lots.forEach(l => pool.push({ qty: l.qty, unitCost: l.unitCost, date: l.date || '' }));
      continue;
    }
    // sell
    const t = ev.trade;
    const sellDate = t.sellDate || ev.date || '';
    const qty = t.qty;
    let matchedCost = 0, matchedQty = 0;
    const lotMatches = [];

    if (method === 'pooling' && ukRules) {
      let need = qty;
      // (1) SAME-DAY: lots in the pool acquired on the exact disposal date.
      const takeFromPoolDated = (predicate, ruleLabel, sortFn) => {
        let candidates = pool.filter(predicate);
        if (sortFn) candidates = candidates.sort(sortFn);
        for (const l of candidates) {
          if (need <= 0) break;
          const take = Math.min(l.qty, need);
          if (take > 0) {
            matchedCost += take * l.unitCost; matchedQty += take; need -= take;
            l.qty -= take;
            lotMatches.push({ qty: take, unitCost: +l.unitCost.toFixed(6), rule: ruleLabel, date: l.date });
          }
        }
        pool = pool.filter(l => l.qty > 1e-9);
      };

      if (sellDate) {
        // (1) same-day acquisitions
        takeFromPoolDated(l => l.date === sellDate, 'same-day', null);
        // (2) 30-day bed & breakfast — acquisitions AFTER the disposal, within 30 days, earliest first
        if (need > 0) {
          const dSell = new Date(sellDate);
          takeFromPoolDated(
            l => l.date && new Date(l.date) > dSell && (new Date(l.date) - dSell) <= 30 * 86400000,
            'bed-and-breakfast',
            (a, b) => new Date(a.date) - new Date(b.date)
          );
        }
      }
      // (3) remainder from the Section 104 pool (everything still in the pool)
      if (need > 0) {
        const r = consumeFromPool(need);
        const got = need - r.shortfall;
        matchedCost += r.cost; matchedQty += got;
        if (got > 0) lotMatches.push({ qty: got, unitCost: +(r.cost / got).toFixed(6), rule: 'section-104', dateParts: r.dateParts });
        need = r.shortfall;
      }
    } else {
      const r = consumeFromPool(qty);
      matchedCost = r.cost;
      matchedQty = qty - r.shortfall;
      if (matchedQty > 0) lotMatches.push({ qty: matchedQty, unitCost: +(matchedCost / matchedQty).toFixed(6), rule: method, dateParts: r.dateParts });
    }

    // Fallback: if we couldn't match all qty from lots (e.g. legacy data with
    // sells but no recorded buys), back-fill the shortfall at the trade's stored
    // buyPrice so the gain still reconciles instead of overstating.
    if (matchedQty < qty) {
      const short = qty - matchedQty;
      const fallbackUnit = (t.buyPrice != null) ? t.buyPrice : 0;
      matchedCost += short * fallbackUnit;
      matchedQty += short;
      lotMatches.push({ qty: short, unitCost: +(+fallbackUnit).toFixed(6), rule: 'legacy-fallback' });
    }

    const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
    const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
    const gain = gross - fee - matchedCost;
    results.push({ id: t.id, costBasis: +matchedCost.toFixed(6), gain: +gain.toFixed(6), lotMatches: lotMatches });
  }
  return results;
}

// Recompute cost basis + gain for every disposal in history, using the active
// method. Returns a map { tradeId -> { costBasis, gain, method, lotMatches } }.
// Trades whose item has no buy lots at all (pure legacy) are left for the caller
// to grandfather via stored figures (they won't appear in the returned map).
function recomputeCGTGains(method) {
  method = method || getCostBasisMethod();
  const jurisdiction = getTaxJurisdiction();
  const ukRules = (jurisdiction === 'UK' && method === 'pooling');
  const out = {};

  // Build per-item timelines. The pool of buys must represent everything ever
  // ACQUIRED for the item, because a historical disposal consumed lots that may
  // since have been (partly) sold off. We therefore seed the pool from:
  //   (a) the lots still open on the current holding (remaining qty), AND
  //   (b) an "add-back" of quantities already disposed in history, valued at the
  //       trade's stored buyPrice (grandfathered cost), dated at the sell date.
  // Sells then replay chronologically against that reconstructed pool.
  const buysByKey = {};   // key -> [{qty, unitCost, date}]
  const sellsByKey = {};  // key -> [trade]

  (Array.isArray(holdings) ? holdings : []).forEach(h => {
    const lots = ensureLots(h);
    const key = _itemKey(h.name, h.type);
    (buysByKey[key] = buysByKey[key] || []);
    lots.forEach(l => buysByKey[key].push({ qty: l.qty, unitCost: l.unitCost, date: l.date || '' }));
  });

  (Array.isArray(tradeHistory) ? tradeHistory : []).forEach(t => {
    const key = _itemKey(t.name, t.type);
    (sellsByKey[key] = sellsByKey[key] || []).push(t);
    // Add back the disposed qty as an acquisition lot at the trade's stored cost,
    // dated just BEFORE the sell so it's available when the sell replays.
    (buysByKey[key] = buysByKey[key] || []).push({
      qty: t.qty,
      unitCost: (t.buyPrice != null ? t.buyPrice : 0),
      date: t.sellDate || '',
      _addBack: true,
    });
  });

  const allKeys = new Set([...Object.keys(buysByKey), ...Object.keys(sellsByKey)]);
  allKeys.forEach(key => {
    const buys = (buysByKey[key] || []);
    const sells = (sellsByKey[key] || []);
    if (!sells.length) return; // nothing to recompute for this item

    // Compose timeline events: buys first (so a same-dated buy precedes its sell),
    // then sells. Add-back buys are dated at the sell date and must land before
    // the matching sell — the stable sort (buy before sell on equal date) handles it.
    const events = [];
    buys.forEach(b => events.push({ kind: 'buy', date: b.date || '', lots: [{ qty: b.qty, unitCost: b.unitCost, date: b.date || '' }] }));
    sells.forEach(t => events.push({ kind: 'sell', date: t.sellDate || '', trade: t }));
    events.sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (da < db) return -1;
      if (da > db) return 1;
      const rank = e => (e.kind === 'buy' ? 0 : 1);
      return rank(a) - rank(b);
    });

    const res = _matchItemTimeline(events, method, { ukRules });
    res.forEach(r => { if (r.id) out[r.id] = { costBasis: r.costBasis, gain: r.gain, method, lotMatches: r.lotMatches }; });
  });

  return out;
}

// Build a per-disposal record enriched with the recomputed cost basis, gain,
// derived acquisition date, and the active profile's holding-period classification.
function _enrichDisposal(t, gainMap, profile) {
  const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
  const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
  const netRealised = (t.netRealised != null) ? t.netRealised : gross - fee;
  const rc = (t.id && gainMap[t.id]) ? gainMap[t.id] : null;
  const costBasis = rc ? rc.costBasis : t.buyPrice * t.qty;
  const gain = rc ? rc.gain : (gross - fee - costBasis);
  const acqDate = _disposalAcqDate(rc);
  const cls = profile.classifyGain({ acqDate, sellDate: t.sellDate, gain });
  return { trade: t, gross, fee, netRealised, costBasis, gain, acqDate, classification: cls };
}

function calculateCGT() {
  const profile = getActiveTaxProfile();
  const taxYearStart = profile.taxYearStart(new Date());
  const taxYear = profile.taxYearLabel(new Date());
  const method = getCostBasisMethod();
  const allowance = profile.allowance || 0;
  const inclusionRate = profile.inclusionRate != null ? profile.inclusionRate : 1;

  // Recompute per-disposal cost basis from lots using the active method.
  let gainMap = {};
  try { gainMap = recomputeCGTGains(method); } catch (e) { console.warn('[CGT] recompute failed, using stored cost basis:', e); gainMap = {}; }

  // Roll up a set of disposals. `exemptFilter` drops disposals the profile treats
  // as non-taxable on holding-period grounds (e.g. DE > 1yr) from the gain totals,
  // while still counting them so the report can show them as exempt.
  const rollup = (disposals) => {
    let totalGains = 0, totalLosses = 0, totalFees = 0, tradeCount = 0;
    let exemptGain = 0, exemptCount = 0, flaggedCount = 0;
    let includedGain = 0; // AU: per-disposal-inclusion-weighted net (only when perDisposalInclusion)
    let totalProceeds = 0; // FI: total in-year sale proceeds (drives the proceeds cliff)
    const buckets = {}; // bucket -> net gain (for US short/long display)
    disposals.forEach(d => {
      totalFees += d.fee;
      tradeCount++;
      if (d.classification.flagged) flaggedCount++;
      if (d.classification.taxable === false) {
        // Profile-exempt (e.g. German >1yr): excluded from the taxable totals.
        exemptGain += d.gain; exemptCount++;
        return;
      }
      totalProceeds += d.gross;
      const b = d.classification.bucket || 'cgt';
      buckets[b] = (buckets[b] || 0) + d.gain;
      if (d.gain > 0) totalGains += d.gain;
      else totalLosses += Math.abs(d.gain);
      // AU: apply the 50%/100% discount per disposal (gains discounted, losses in full).
      if (profile.perDisposalInclusion) {
        const inc = (d.classification.inclusion != null) ? d.classification.inclusion : 1;
        includedGain += d.gain > 0 ? d.gain * inc : d.gain;
      }
    });
    const netGain = totalGains - totalLosses;
    // For per-disposal-inclusion profiles (AU) the taxable base is the inclusion-weighted
    // net, AFTER the (zero) allowance; for everyone else it's the flat-inclusion path.
    let taxableGain;
    if (profile.perDisposalInclusion) {
      taxableGain = +(_applyExemption(Math.max(0, includedGain), profile, totalProceeds)).toFixed(6);
    } else {
      const afterAllowance = _applyExemption(netGain, profile, totalProceeds);
      taxableGain = +(afterAllowance * inclusionRate).toFixed(6); // CA: 50% inclusion
    }
    const allowanceUsed = _exemptionUsed(netGain, profile, totalProceeds);
    const allowancePct = allowance > 0 ? Math.min(100, (allowanceUsed / allowance) * 100) : (netGain > 0 ? 100 : 0);

    // Tax estimate — profile-specific. UK keeps the 18/24% pair (taxBasic/taxHigher)
    // for full back-compat; others fill the same two fields with their low/high band.
    const r = profile.rates || {};
    let taxBasic, taxHigher;
    if (profile.code === 'UK') {
      taxBasic = taxableGain * (r.basic / 100);
      taxHigher = taxableGain * (r.higher / 100);
    } else if (profile.code === 'US') {
      // Split taxable gain across long/short buckets for a banded estimate.
      const longNet = Math.max(0, buckets.long || 0);
      const shortNet = Math.max(0, buckets.short || 0);
      const totNet = longNet + shortNet;
      // Apportion the post-allowance taxable amount across buckets.
      const taxableLong = totNet > 0 ? taxableGain * (longNet / totNet) : 0;
      const taxableShort = totNet > 0 ? taxableGain * (shortNet / totNet) : 0;
      taxBasic = taxableLong * (r.longLow / 100) + taxableShort * (r.shortLow / 100);
      taxHigher = taxableLong * (r.longHigh / 100) + taxableShort * (r.shortHigh / 100);
    } else if (profile.code === 'FI') {
      // Two-tier: 30% up to the threshold of capital income, 34% above.
      const thr = r.threshold || 30000;
      const lowPart = Math.min(taxableGain, thr);
      const highPart = Math.max(0, taxableGain - thr);
      const fiTax = lowPart * (r.lower / 100) + highPart * (r.upper / 100);
      taxBasic = fiTax; taxHigher = fiTax; // single estimate (not a band)
    } else {
      const rate = (r.flat != null ? r.flat : 30) / 100;
      taxBasic = taxableGain * rate;
      taxHigher = taxableGain * rate;
    }
    return {
      totalGains, totalLosses, totalFees, netGain, taxableGain,
      allowanceUsed, allowancePct, taxBasic, taxHigher, tradeCount,
      exemptGain, exemptCount, flaggedCount, buckets, inclusionRate, allowance,
      totalProceeds,
    };
  };

  const inYear = tradeHistory.filter(t => t.sellDate >= taxYearStart);

  // CHOSEN position: apply the profile's disposal definition (UK excludes Steam Wallet;
  // other profiles count every sale). This is the live, default figure.
  const chosenTrades = inYear.filter(t => profile.disposalCounts(t));
  const chosenDisp = chosenTrades.map(t => _enrichDisposal(t, gainMap, profile));
  const chosen = rollup(chosenDisp);

  // STRICTER reading: count ALL in-year disposals regardless of disposal definition
  // (generalises the v2.4.2 "incl. Steam" view per jurisdiction — only meaningful
  // when the profile actually excludes something, i.e. UK).
  const allDisp = inYear.map(t => _enrichDisposal(t, gainMap, profile));
  const inclSteam = rollup(allDisp);

  // yearTrades kept as the raw trade array (back-compat with existing callers).
  const yearTrades = chosenTrades;

  return Object.assign({
    taxYear, taxYearStart, yearTrades, inYear, inclSteam, method, gainMap,
    profile, taxCurrency: profile.taxCurrency, disposals: chosenDisp,
    allDisposals: allDisp, excludesAny: chosenTrades.length !== inYear.length,
  }, chosen);
}

// Async sibling: resolve every disposal's tax-currency figures at TRANSACTION-DATE
// rates so non-UK profiles render in their own currency (USD/EUR/CAD) without a
// blended/year-end rate. Buy legs convert at the buy/acquisition-date rate, sell
// legs at the sell-date rate — preserving the real FX gain/loss component.
// Returns the calculateCGT() object plus a `taxFx` map { tradeId -> {grossTax,
// costBasisTax, feeTax, gainTax} } and rendered string fields. UK short-circuits
// (taxCurrency GBP) so figures pass through unchanged and round-trip exactly.
async function calculateCGTWithTaxCurrency() {
  const cgt = calculateCGT();
  const ccy = cgt.taxCurrency;
  cgt.taxFx = {};
  if (ccy === 'GBP') return cgt; // UK: no conversion needed

  const convert = async (gbp, date) => {
    const r = await getRate('GBP', ccy, date || todayStr());
    return { val: (r != null) ? gbp * r : null, rate: r };
  };

  for (const d of cgt.allDisposals) {
    const t = d.trade;
    // Sell-side figures at the SELL-date rate.
    const sellRate = await getRate('GBP', ccy, t.sellDate || todayStr());
    // Cost basis at the ACQUISITION-date rate (falls back to sell date if unknown).
    const buyRate = await getRate('GBP', ccy, d.acqDate || t.sellDate || todayStr());
    const grossTax = (sellRate != null) ? d.gross * sellRate : null;
    const feeTax = (sellRate != null) ? d.fee * sellRate : null;
    const costBasisTax = (buyRate != null) ? d.costBasis * buyRate : null;
    // v3.6.1: the CA $1,000 PUP floor was REMOVED here - skins held for investment
    // are ordinary capital property (not personal-use property), so real cost and
    // proceeds are used and losses stay deductible. See the CA profile disclaimer.
    const gainTax = (grossTax != null && feeTax != null && costBasisTax != null)
      ? grossTax - feeTax - costBasisTax : null;
    cgt.taxFx[t.id] = { grossTax, feeTax, costBasisTax, gainTax, sellRate, buyRate };
  }
  return cgt;
}

// Tax-currency formatter for a profile. UK -> fmtGBP. Others -> symbol + value
// already converted to the tax currency. Returns '—' on null (FX failure).
function fmtTaxCcy(v, ccy, dp) {
  if (v == null || isNaN(v)) return '—';
  if (dp == null) dp = 2;
  if (ccy === 'GBP') return fmtGBP(v, dp);
  const sym = curSymOf(ccy);
  return (v < 0 ? '-' : '') + sym + Math.abs(Number(v)).toFixed(dp);
}

async function renderCGTSummary() {
  const el = document.getElementById('cgtSummary');
  if (!el) return;
  if (!tradeHistory.length) { el.innerHTML = ''; return; }

  const cgt = await calculateCGTWithTaxCurrency();
  const profile = cgt.profile;
  const ccy = cgt.taxCurrency;
  const isUK = profile.code === 'UK';

  // For non-UK profiles, sum the tax-currency figures from the per-disposal taxFx
  // map (transaction-date rates). For UK, GBP figures are already correct.
  let gainsTax = cgt.totalGains, lossesTax = cgt.totalLosses, netTax = cgt.netGain;
  let allowanceUsedTax = cgt.allowanceUsed, taxableGainTax = cgt.taxableGain;
  let taxBasicTax = cgt.taxBasic, taxHigherTax = cgt.taxHigher;
  let fxIncomplete = false;
  let proceedsTax = 0; // FI: total in-year proceeds in tax currency (drives the proceeds cliff)
  if (!isUK) {
    let g = 0, l = 0, includedTax = 0;
    cgt.disposals.forEach(d => {
      if (d.classification.taxable === false) return; // exempt (e.g. DE >1yr)
      const fx = cgt.taxFx[d.trade.id];
      const gt = fx ? fx.gainTax : null;
      if (gt == null) { fxIncomplete = true; return; }
      if (fx && fx.grossTax != null) proceedsTax += fx.grossTax; // FI proceeds cliff (tax ccy)
      if (gt > 0) g += gt; else l += Math.abs(gt);
      if (profile.perDisposalInclusion) {
        const inc = (d.classification.inclusion != null) ? d.classification.inclusion : 1;
        includedTax += gt > 0 ? gt * inc : gt; // AU: discount gains, losses in full
      }
    });
    gainsTax = g; lossesTax = l; netTax = g - l;
    const incl = profile.inclusionRate != null ? profile.inclusionRate : 1;
    allowanceUsedTax = _exemptionUsed(netTax, profile, proceedsTax);
    if (profile.perDisposalInclusion) {
      taxableGainTax = _applyExemption(Math.max(0, includedTax), profile, proceedsTax);
    } else {
      taxableGainTax = _applyExemption(netTax, profile, proceedsTax) * incl;
    }
    // Re-derive the tax estimate in tax currency using the same band logic.
    const r = profile.rates || {};
    if (profile.code === 'US') {
      let longNet = 0, shortNet = 0;
      cgt.disposals.forEach(d => {
        if (d.classification.taxable === false) return;
        const fx = cgt.taxFx[d.trade.id]; const gt = fx ? fx.gainTax : 0;
        if (gt > 0) { if (d.classification.bucket === 'long') longNet += gt; else shortNet += gt; }
      });
      const totNet = longNet + shortNet;
      const tLong = totNet > 0 ? taxableGainTax * (longNet / totNet) : 0;
      const tShort = totNet > 0 ? taxableGainTax * (shortNet / totNet) : 0;
      taxBasicTax = tLong * (r.longLow / 100) + tShort * (r.shortLow / 100);
      taxHigherTax = tLong * (r.longHigh / 100) + tShort * (r.shortHigh / 100);
    } else if (profile.code === 'FI') {
      const thr = r.threshold || 30000;
      const lowPart = Math.min(taxableGainTax, thr);
      const highPart = Math.max(0, taxableGainTax - thr);
      const fiTax = lowPart * (r.lower / 100) + highPart * (r.upper / 100);
      taxBasicTax = fiTax; taxHigherTax = fiTax;
    } else {
      const rate = (r.flat != null ? r.flat : 30) / 100;
      taxBasicTax = taxableGainTax * rate; taxHigherTax = taxableGainTax * rate;
    }
  }

  const allowance = profile.allowance || 0;
  const allowancePct = allowance > 0 ? Math.min(100, (allowanceUsedTax / allowance) * 100) : (netTax > 0 ? 100 : 0);
  const barColor = allowancePct >= 90 ? 'var(--red)' : allowancePct >= 60 ? 'var(--accent)' : 'var(--green)';
  const f = (v, dp) => fmtTaxCcy(v, ccy, dp);

  // Dual-view (stricter reading) — only meaningful when the profile excludes something.
  const incl = cgt.inclSteam;
  const steamDiffers = isUK && cgt.excludesAny && (incl.tradeCount !== cgt.tradeCount);
  const inclBarColor = incl.allowancePct >= 90 ? 'var(--red)' : incl.allowancePct >= 60 ? 'var(--accent)' : 'var(--green)';

  // US short/long breakdown + DE exempt count for the footer chips.
  const usBreakdown = (profile.code === 'US');
  const flagged = cgt.flaggedCount || 0;
  const exemptCount = cgt.exemptCount || 0;

  const allowanceCardLabel = profile.code === 'DE' ? 'Freigrenze'
                           : profile.code === 'FI' ? 'Small-Sales Exemption (proceeds)'
                           : allowance > 0 ? 'Allowance Used' : 'Taxable Amount';
  const ccyTag = isUK ? 'GBP' : ccy;
  // DE Freigrenze is a gains cliff; FI small-sales exemption is a PROCEEDS cliff.
  // Show whether the year has crossed the relevant threshold.
  const isGainsCliff = !!profile.allowanceIsCliff;
  const isProceedsCliff = !!profile.allowanceIsProceedsCliff;
  const isCliff = isGainsCliff || isProceedsCliff;
  const cliffTripped = isProceedsCliff
    ? (proceedsTax > allowance)
    : (isGainsCliff && Math.max(0, netTax) >= allowance);
  const cliffNote = !isCliff ? ''
    : isProceedsCliff
      ? (cliffTripped
          ? '<span style="color:var(--red);">proceeds over ' + f(allowance, 0) + ' — gains taxable</span>'
          : '<span style="color:var(--green);">proceeds within ' + f(allowance, 0) + ' — gains tax-free</span>')
      : (cliffTripped
          ? '<span style="color:var(--red);">cliff crossed — entire gain taxable</span>'
          : '<span style="color:var(--green);">below cliff — fully tax-free</span>');

  el.innerHTML = `
    <div class="cgt-summary">
      <div class="cgt-card">
        <div class="cgt-card-label">Tax Year</div>
        <div class="cgt-card-val" style="font-size:14px;">${cgt.taxYear}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${profile.name} · ${cgt.tradeCount} disposal${cgt.tradeCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Realised Gains</div>
        <div class="cgt-card-val" style="color:var(--green);">+${f(gainsTax, 2)}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Realised Losses</div>
        <div class="cgt-card-val" style="color:var(--red);">-${f(lossesTax, 2)}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Net Gain</div>
        <div class="cgt-card-val" style="color:${netTax >= 0 ? 'var(--green)' : 'var(--red)'};">${netTax >= 0 ? '+' : ''}${f(netTax, 2)}</div>
        ${profile.code === 'CA' ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;">50% inclusion applied to taxable</div>` : ''}
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">${allowanceCardLabel}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="cgt-card-val" style="font-size:14px;">${allowance > 0 ? f(allowanceUsedTax, 0) + ' / ' + fmtTaxCcy(allowance, ccy, 0) : f(taxableGainTax, 0)}</div>
          <span class="plat-badge plat-badge-cf" style="font-size:8px;">${ccyTag}</span>
        </div>
        ${allowance > 0 ? `<div class="cgt-allowance-bar"><div class="cgt-allowance-fill" style="width:${allowancePct}%;background:${barColor};"></div></div>` : ''}
        ${cliffNote ? `<div style="font-size:8px;margin-top:3px;">${cliffNote}</div>` : ''}
        ${steamDiffers ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
          <div class="cgt-card-val" style="font-size:13px;color:var(--text2);">${fmtGBP(incl.allowanceUsed, 0)} / £${(profile.allowance||0).toLocaleString()}</div>
          <span class="plat-badge plat-badge-stm" style="font-size:8px;">incl. Steam</span>
        </div>
        <div class="cgt-allowance-bar" style="opacity:.55;"><div class="cgt-allowance-fill" style="width:${incl.allowancePct}%;background:${inclBarColor};"></div></div>
        <div style="font-size:8px;color:var(--text3);margin-top:3px;">hypothetical if Steam sales counted (${incl.tradeCount} disposals)</div>
        ` : ''}
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Est. Tax Owed</div>
        <div class="cgt-card-val" style="color:${taxableGainTax > 0 ? 'var(--red)' : 'var(--green)'};">${taxableGainTax > 0 ? f(taxBasicTax, 2) + ' – ' + f(taxHigherTax, 2) : f(0, 2)}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px;">${taxableGainTax > 0 ? _rateBandLabel(profile) : (allowance > 0 ? 'Within allowance' : 'No taxable gain')}</div>
        ${steamDiffers && incl.taxableGain > 0 ? `<div style="font-size:8px;color:var(--text3);margin-top:4px;">incl. Steam: ${fmtGBP(incl.taxBasic, 2)} – ${fmtGBP(incl.taxHigher, 2)}</div>` : ''}
      </div>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:8px;font-family:'Share Tech Mono',monospace;text-align:center;">
      Cost basis: ${costBasisMethodLabel(cgt.method)}${cgt.method === 'pooling' && isUK ? ' · same-day + 30-day rules applied' : ''}${!isUK ? ' · figures in ' + ccy + ' at transaction-date FX' : ''}<br>
      ${usBreakdown ? _usBucketChips(cgt, f) : ''}
      ${exemptCount > 0 ? `<span style="color:var(--green);">${exemptCount} disposal${exemptCount !== 1 ? 's' : ''} exempt (held &gt; 1 year)</span> · ` : ''}
      ${flagged > 0 ? `<span style="color:var(--accent);">⚠ ${flagged} disposal${flagged !== 1 ? 's' : ''} with unknown acquisition date (treated conservatively)</span><br>` : ''}
      ${fxIncomplete ? `<span style="color:var(--accent);">⚠ Some FX rates unavailable — totals may be incomplete</span><br>` : ''}
      ${profile.knownLimits ? `<span style="color:var(--text3);">ⓘ Known limit: ${profile.knownLimits}</span><br>` : ''}
      ⚠ ${profile.disclaimer}
    </div>`;
}

// Tax-rate band label for the Est. Tax card.
function _rateBandLabel(profile) {
  const r = profile.rates || {};
  if (profile.code === 'UK') return r.basic + '% basic / ' + r.higher + '% higher';
  if (profile.code === 'US') return 'long ' + r.longLow + '–' + r.longHigh + '% / short ' + r.shortLow + '–' + r.shortHigh + '%';
  if (profile.code === 'CA') return '~' + r.flat + '% on 50% inclusion (indicative)';
  if (profile.code === 'AU') return '~' + r.flat + '% marginal · 50% discount if held > 1yr (indicative)';
  if (profile.code === 'FI') return r.lower + '% to \u20ac' + (r.threshold || 30000).toLocaleString() + ' / ' + r.upper + '% above';
  if (profile.code === 'DK') return '~' + r.flat + '% (indicative — really marginal income up to ~52%)';
  if (profile.code === 'NO') return r.flat + '% (general asset, no 1.72 share uplift)';
  return '~' + (r.flat != null ? r.flat : 30) + '% (indicative)';
}

// US short/long-term net-gain chips for the summary footer.
function _usBucketChips(cgt, f) {
  let longNet = 0, shortNet = 0;
  cgt.disposals.forEach(d => {
    const fx = cgt.taxFx[d.trade.id];
    const gt = fx ? fx.gainTax : d.gain;
    if (gt == null) return;
    if (d.classification.bucket === 'long') longNet += gt; else shortNet += gt;
  });
  return `<span style="color:var(--text2);">Long-term net: ${f(longNet, 2)} · Short-term net: ${f(shortNet, 2)}</span> · `;
}

// ========================
// CGT TAX REPORT EXPORT
// ========================
async function exportCGTReport() {
  if (!featureUnlocked('taxReportExport')) {
    showProToast('taxReportExport');
    return;
  }
  const cgt = await calculateCGTWithTaxCurrency();
  const profile = cgt.profile;
  const ccy = cgt.taxCurrency;
  const isUK = profile.code === 'UK';
  const f = (v, dp) => (v == null || isNaN(v)) ? 'n/a' : Number(v).toFixed(dp == null ? 2 : dp);
  const cs = ccy; // currency suffix for column headers

  // Recompute tax-currency totals for the summary (non-UK), mirroring renderCGTSummary.
  let gainsT = cgt.totalGains, lossesT = cgt.totalLosses, netT = cgt.netGain,
      feesT = cgt.totalFees, allowUsedT = cgt.allowanceUsed, taxableT = cgt.taxableGain,
      basicT = cgt.taxBasic, higherT = cgt.taxHigher;
  let proceedsT = 0; // FI proceeds cliff (tax ccy)
  if (!isUK) {
    let g = 0, l = 0, fees = 0, includedT = 0;
    cgt.disposals.forEach(d => {
      const fx = cgt.taxFx[d.trade.id] || {};
      if (fx.feeTax != null) fees += fx.feeTax;
      if (d.classification.taxable === false) return;
      const gt = fx.gainTax;
      if (gt == null) return;
      if (fx.grossTax != null) proceedsT += fx.grossTax; // FI proceeds cliff
      if (gt > 0) g += gt; else l += Math.abs(gt);
      if (profile.perDisposalInclusion) {
        const inc = (d.classification.inclusion != null) ? d.classification.inclusion : 1;
        includedT += gt > 0 ? gt * inc : gt;
      }
    });
    gainsT = g; lossesT = l; netT = g - l; feesT = fees;
    const incl = profile.inclusionRate != null ? profile.inclusionRate : 1;
    allowUsedT = _exemptionUsed(netT, profile, proceedsT);
    if (profile.perDisposalInclusion) {
      taxableT = _applyExemption(Math.max(0, includedT), profile, proceedsT);
    } else {
      taxableT = _applyExemption(netT, profile, proceedsT) * incl;
    }
    const r = profile.rates || {};
    const rate = (r.flat != null ? r.flat : 30) / 100;
    basicT = taxableT * rate; higherT = taxableT * rate;
    if (profile.code === 'US') {
      let longNet = 0, shortNet = 0;
      cgt.disposals.forEach(d => {
        if (d.classification.taxable === false) return;
        const gt = (cgt.taxFx[d.trade.id] || {}).gainTax || 0;
        if (gt > 0) { if (d.classification.bucket === 'long') longNet += gt; else shortNet += gt; }
      });
      const tot = longNet + shortNet;
      const tL = tot > 0 ? taxableT * (longNet / tot) : 0;
      const tS = tot > 0 ? taxableT * (shortNet / tot) : 0;
      basicT = tL * (r.longLow / 100) + tS * (r.shortLow / 100);
      higherT = tL * (r.longHigh / 100) + tS * (r.shortHigh / 100);
    } else if (profile.code === 'FI') {
      const thr = r.threshold || 30000;
      const lowPart = Math.min(taxableT, thr);
      const highPart = Math.max(0, taxableT - thr);
      const fiTax = lowPart * (r.lower / 100) + highPart * (r.upper / 100);
      basicT = fiTax; higherT = fiTax;
    }
  }

  const rows = [
    ['CS2 Vault — Capital Gains Tax Report'],
    [`Jurisdiction: ${profile.name} (${profile.code})`],
    [`Tax Year: ${cgt.taxYear}`],
    [`Reporting Currency: ${ccy}` + (isUK ? '' : ' (converted from GBP base at each transaction-date FX rate)')],
    [`Cost Basis Method: ${costBasisMethodLabel(cgt.method)}`],
    [`Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`],
    [''],
    ['SUMMARY'],
    [`Total Realised Gains (${cs}),${f(gainsT)}`],
    [`Total Realised Losses (${cs}),-${f(lossesT)}`],
    [`Total Fees Paid (${cs}),${f(feesT)}`],
    [`Net Gain/Loss (${cs}),${f(netT)}`],
  ];
  if ((profile.allowance || 0) > 0) {
    if (profile.allowanceIsProceedsCliff) {
      rows.push([`Small-Sales Exemption (proceeds cliff) (${cs}),${f(profile.allowance)}`]);
      rows.push([`Total Sale Proceeds (${cs}),${f(proceedsT)}`]);
      const tripped = proceedsT > profile.allowance;
      rows.push([`Exemption Status,${tripped ? 'proceeds over threshold — gains taxable' : 'proceeds within threshold — gains tax-free'}`]);
    } else if (profile.allowanceIsCliff) {
      rows.push([`Annual Freigrenze (cliff) (${cs}),${f(profile.allowance)}`]);
      const tripped = Math.max(0, netT) >= profile.allowance;
      rows.push([`Freigrenze Status,${tripped ? 'CROSSED — entire gain taxable' : 'below threshold — fully tax-free'}`]);
    } else {
      rows.push([`Annual Allowance/Exemption (${cs}),${f(profile.allowance)}`]);
      rows.push([`Allowance Used (${cs}),${f(allowUsedT)}`]);
    }
  }
  if (profile.inclusionRate != null) {
    rows.push([`Inclusion Rate,${Math.round(profile.inclusionRate * 100)}%`]);
  }
  rows.push([`Taxable Gain (${cs}),${f(taxableT)}`]);
  if (profile.code === 'UK') {
    rows.push([`Estimated Tax (Basic 18%) (${cs}),${f(basicT)}`]);
    rows.push([`Estimated Tax (Higher 24%) (${cs}),${f(higherT)}`]);
  } else if (profile.code === 'US') {
    rows.push([`Estimated Tax (low band) (${cs}),${f(basicT)}`]);
    rows.push([`Estimated Tax (high band) (${cs}),${f(higherT)}`]);
  } else {
    rows.push([`Estimated Tax (indicative) (${cs}),${f(basicT)}`]);
  }
  if (cgt.exemptCount > 0) rows.push([`Exempt Disposals (held > 1 year),${cgt.exemptCount}`]);
  rows.push(['']);
  rows.push(['DISPOSALS']);

  // Holding-period columns appear for profiles that classify by holding period.
  const showHP = (profile.code === 'US' || profile.code === 'DE' || profile.code === 'AU');
  const header = ['Date', 'Item', 'Type', 'Qty', 'Platform',
    `Cost Basis (${cs})`, `Gross Proceeds (${cs})`, 'Platform Fee %', `Fee Amount (${cs})`, `Net Realised (${cs})`, `Gain/Loss (${cs})`];
  if (showHP) header.push('Acq. Date', 'Holding', 'Classification');
  rows.push(header.join(','));

  // Report the CHOSEN-position disposals (profile disposal definition applied).
  cgt.disposals.forEach(d => {
    const t = d.trade;
    const fx = cgt.taxFx[t.id] || {};
    const grossOut = isUK ? d.gross : fx.grossTax;
    const feeOut = isUK ? d.fee : fx.feeTax;
    const costOut = isUK ? d.costBasis : fx.costBasisTax;
    const netReal = (grossOut != null && feeOut != null) ? grossOut - feeOut : null;
    const gainOut = isUK ? d.gain : fx.gainTax;
    const line = [
      t.sellDate, `"${t.name}"`, t.type, t.qty, tradePlatform(t),
      f(costOut), f(grossOut), t.feePercent, f(feeOut), f(netReal), f(gainOut),
    ];
    if (showHP) {
      const held = _monthsHeld(d.acqDate, t.sellDate);
      line.push(d.acqDate || 'unknown', held != null ? held.toFixed(1) + 'mo' : 'unknown', `"${d.classification.label || d.classification.bucket}"`);
    }
    rows.push(line.join(','));
  });

  rows.push('');
  if (profile.knownLimits) {
    rows.push('KNOWN LIMITS');
    rows.push('"' + profile.knownLimits.replace(/"/g, "'") + '"');
    rows.push('');
  }
  rows.push('DISCLAIMER');
  rows.push('"' + profile.disclaimer.replace(/"/g, "'") + '"');

  const csvStr = rows.join('\n');
  if (typeof window.cs2vault !== 'undefined') {
    const fname = `cs2vault_cgt_report_${profile.code}_${cgt.taxYear.replace('/', '-')}.csv`;
    const result = await window.cs2vault.exportSave(fname, csvStr);
    if (result && result.saved) toast('CGT report saved to ' + result.filePath, 'success');
  }
}

// ========================
// CASH OUT CALCULATOR
// ========================
function openCashOutCalc() {
  if (!featureUnlocked('cashOut')) { showProToast('cashOut'); return; }
  document.getElementById('coSteamSellPrice').value = '';
  document.getElementById('coCsfloatSellPrice').value = '';
  document.getElementById('coCgtToggle').checked = false;
  document.getElementById('coCgtBand').style.display = 'none';
  document.getElementById('cashOutResult').innerHTML = '';
  openModal('cashOutModal');
}

function closeCashOutCalc() {
  document.getElementById('cashOutModal').classList.remove('open');
}

function updateCashOutCalc() {
  const steamSell = parseFloat(document.getElementById('coSteamSellPrice').value) || 0;
  const csfloatSell = parseFloat(document.getElementById('coCsfloatSellPrice').value) || 0;
  const csfloatFee = parseFloat(document.getElementById('coCsfloatFee').value) || 2;
  const withdrawFee = parseFloat(document.getElementById('coWithdrawFee').value) || 2;
  const showCgt = document.getElementById('coCgtToggle').checked;

  document.getElementById('coCgtBand').style.display = showCgt ? '' : 'none';

  if (steamSell <= 0) {
    document.getElementById('cashOutResult').innerHTML = '';
    return;
  }

  // Step 1: Sell on Steam (15% fee)
  const steamTax = steamSell * 0.15;
  const steamWallet = steamSell - steamTax;

  // Step 2: Buy skin on Steam with wallet balance
  const skinBuyPrice = steamWallet; // You spend your full wallet

  // Step 3: Sell on CSFloat
  const csfloatSellActual = csfloatSell > 0 ? csfloatSell : steamWallet * 0.95; // Default: ~5% below Steam
  const csfloatFeeAmt = csfloatSellActual * (csfloatFee / 100);
  const afterCsfloatFee = csfloatSellActual - csfloatFeeAmt;

  // Step 4: Withdraw
  const withdrawFeeAmt = afterCsfloatFee * (withdrawFee / 100);
  const cashInHand = afterCsfloatFee - withdrawFeeAmt;

  // Total fees
  const totalFees = steamTax + csfloatFeeAmt + withdrawFeeAmt + (steamWallet - csfloatSellActual);
  const totalLossPct = ((steamSell - cashInHand) / steamSell * 100);

  let resultHtml = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;">
      <div class="co-step">
        <div class="co-step-label">1️⃣ Steam Market sell price</div>
        <div class="co-step-val">${fmtGBP(steamSell, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">Steam fee (15%)</span></div>
        <div class="co-step-fee">-${fmtGBP(steamTax, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">2️⃣ Steam Wallet balance</div>
        <div class="co-step-val">${fmtGBP(steamWallet, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">3️⃣ Buy bridge skin on Steam → sell on CSFloat</div>
        <div class="co-step-val">${fmtGBP(csfloatSellActual, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">CSFloat seller fee (${csfloatFee}%)</span></div>
        <div class="co-step-fee">-${fmtGBP(csfloatFeeAmt, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">4️⃣ After CSFloat fee</div>
        <div class="co-step-val">${fmtGBP(afterCsfloatFee, 2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">Withdrawal fee (${withdrawFee}%)</span></div>
        <div class="co-step-fee">-${fmtGBP(withdrawFeeAmt, 2)}</div>
      </div>
    </div>
    <div class="co-final">
      <div>
        <div class="co-final-label">Cash in Hand</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Total fees: ${fmtGBP(totalFees, 2)} (${totalLossPct.toFixed(1)}% loss)</div>
      </div>
      <div class="co-final-val" style="color:var(--green);">${fmtGBP(cashInHand, 2)}</div>
    </div>`;

  // CGT estimate
  if (showCgt) {
    const cgtRate = parseInt(document.getElementById('coCgtBand').value) || 18;
    const cgt = calculateCGT();
    const _prof = cgt.profile;
    const _allow = _prof.allowance || 0;
    const _isProceedsCliff = !!_prof.allowanceIsProceedsCliff;
    const _isGainsCliff = !!_prof.allowanceIsCliff;
    const remainingAllowance = (_isGainsCliff || _isProceedsCliff) ? 0 : Math.max(0, _allow - cgt.allowanceUsed);
    // The gain from this cash-out would be: cash received - original cost of the items
    // We don't know the original cost here, so show the gain on the bridge skin only
    const bridgeGain = csfloatSellActual - steamWallet; // Usually negative (loss on the bridge)
    const _incl = _prof.inclusionRate != null ? _prof.inclusionRate : 1;
    // FI proceeds cliff: feed the year's total proceeds (plus this cash-out's proceeds)
    // so the exemption keys off proceeds, not gains. Other profiles ignore the 3rd arg.
    const _proceedsForCliff = (cgt.totalProceeds || 0) + Math.max(0, csfloatSellActual);
    const totalTaxableAfterThis = _applyExemption(cgt.netGain + bridgeGain, _prof, _proceedsForCliff) * _incl;
    const estimatedTax = totalTaxableAfterThis * (cgtRate / 100);

    resultHtml += `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 20px;margin-top:12px;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">CGT Estimate (${cgtRate}% rate)</div>
        <div class="co-step">
          <div class="co-step-label">Current year realised gains</div>
          <div class="co-step-val">${fmtGBP(cgt.netGain, 2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">${_isProceedsCliff ? 'Small-sales exemption (proceeds)' : _isGainsCliff ? 'Freigrenze (cliff)' : 'Remaining allowance'}</div>
          <div class="co-step-val" style="color:var(--green);">${_isProceedsCliff ? fmtGBP(_allow, 2) + ' proceeds cap' : _isGainsCliff ? fmtGBP(_allow, 2) + ' all-or-nothing' : fmtGBP(remainingAllowance, 2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">Taxable amount (if any)</div>
          <div class="co-step-val" style="color:${totalTaxableAfterThis > 0 ? 'var(--red)' : 'var(--green)'};">${fmtGBP(totalTaxableAfterThis, 2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">Estimated tax owed</div>
          <div class="co-step-val" style="color:${estimatedTax > 0 ? 'var(--red)' : 'var(--green)'};">${fmtGBP(estimatedTax, 2)}</div>
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:8px;">⚠ ${_prof.code === 'UK' ? 'Steam Wallet sales are NOT taxable events. Only real-money cashouts via CSFloat count towards CGT.' : 'Estimate based on your ' + _prof.name + ' tax profile. Not tax advice.'}</div>
      </div>`;
  }

  document.getElementById('cashOutResult').innerHTML = resultHtml;
}

function renderHistory() {
  const c = document.getElementById('historyList');
  if (!tradeHistory.length) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">◈</div><h3>No Trades Yet</h3></div>`; return; }
  const sorted = [...tradeHistory].sort((a,b) => new Date(b.sellDate) - new Date(a.sellDate));
  const platLabel = { csfloat: 'CSFloat', steam: 'Steam', skinport: 'Skinport', custom: 'Custom' };
  const platBadgeClass = { csfloat: 'plat-badge-cf', steam: 'plat-badge-stm', skinport: 'plat-badge-sp', custom: 'plat-badge-custom' };
  const profile = getActiveTaxProfile();
  c.innerHTML = sorted.map(t => {
    const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
    const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
    const netRealised = (t.netRealised != null) ? t.netRealised : gross - fee;
    const net = netRealised - (t.buyPrice * t.qty);
    const plat = tradePlatform(t);
    const platHtml = '<span class="plat-badge ' + (platBadgeClass[plat] || 'plat-badge-cf') + '">' + (platLabel[plat] || plat) + '</span>';
    // Per-jurisdiction disposal definition: UK excludes Steam Wallet; others count all.
    const countsCGT = profile.disposalCounts(t);
    const taxLabel = profile.code === 'UK' ? 'CGT' : 'taxable';
    const cgtBadge = countsCGT
      ? '<span class="cgt-tag cgt-tag-yes" title="Counts as a taxable disposal (' + profile.name + ')">✓ ' + taxLabel + '</span>'
      : '<span class="cgt-tag cgt-tag-no" title="Excluded (Steam Wallet sale — UK position)">✕ not ' + taxLabel + '</span>';
    return '<div class="sold-card">' +
      '<div><strong>' + escHtml(t.name) + '</strong>' +
      '<div class="sold-date">' + t.sellDate + ' · Qty: ' + t.qty + ' · ' + platHtml + ' ' + cgtBadge + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Buy</div><div class="sold-col-val">' + fmtGBP(Number(t.buyPrice), 2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Sell</div><div class="sold-col-val">' + fmtGBP(Number(t.sellPrice), 2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Fee (' + t.feePercent + '%)</div><div class="sold-col-val negative">-' + fmtGBP(fee, 2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Realised</div><div class="sold-col-val">' + fmtGBP(netRealised, 2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Net Profit</div><div class="sold-col-val ' + (net >= 0 ? 'positive' : 'negative') + '">' + (net >= 0 ? '+' : '') + fmtGBP(net, 2) + '</div></div>' +
      '<div class="sold-col sold-col-action">' + (t.id ? '<button class="btn btn-danger btn-sm" title="Delete this trade" onclick="deleteTrade(\'' + t.id + '\')">✕</button>' : '') + '</div>' +
      '</div>';
  }).join('');
  renderCGTSummary();
}

function deleteTrade(id) {
  const t = tradeHistory.find(x => x.id === id);
  if (!t) return;
  if (!confirm('Delete this trade?\n\n' + t.name + ' · sold ' + t.sellDate + ' · qty ' + t.qty + '\n\nThis only removes the trade-history record. It does NOT restore the item to your holdings or play skins.')) return;
  // Atomic: re-read canonical history, remove, write back.
  const stored = (function(){ try { return JSON.parse(window._store['cs2vault_history']) || []; } catch { return tradeHistory; } })();
  tradeHistory = stored.filter(x => x.id !== id);
  saveHistory(tradeHistory);
  renderHistory(); updateStats();
  toast('Trade deleted', 'info');
}

function renderAnalytics() {
  const typeData = {};
  holdings.forEach(h => {
    if (!typeData[h.type]) typeData[h.type] = { invested:0, value:0, count:0 };
    typeData[h.type].invested += h.buyPrice * h.qty;
    typeData[h.type].count += h.qty;
    const best = getBestPrice(h);
    if (best) typeData[h.type].value += best * h.qty;
  });
  const _typeColors = { case:'#22c55e', sticker:'#a78bfa', skin:'#e8993c', armory:'#38bdf8', knife:'#fbbf24', charm:'#f472b6' };
  const _typeTotalInv = Object.values(typeData).reduce((s, d) => s + d.invested, 0);
  document.getElementById('analyticsType').innerHTML = Object.entries(typeData).sort((a, b) => b[1].invested - a[1].invested).map(([type, d]) => {
    const pnl = d.value - d.invested;
    const pnlPct = d.invested > 0 ? (pnl / d.invested * 100) : 0;
    const share = _typeTotalInv > 0 ? (d.invested / _typeTotalInv * 100) : 0;
    const c = _typeColors[type] || '#64748b';
    return `<div class="bytype-row">
      <div class="bytype-top">
        <div><span class="type-badge ${typeBadge[type]}">${typeLabels[type] || type}</span> <span style="font-size:11px;color:var(--text3);margin-left:6px;">${d.count.toLocaleString()} items · ${share.toFixed(1)}%</span></div>
        <div style="text-align:right;"><span class="mono" style="font-size:12px;">${fmtMoney(d.invested, 2)} in</span> <span class="mono ${pnl >= 0 ? 'positive' : 'negative'}" style="font-size:11px;margin-left:8px;">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 2)} (${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span></div>
      </div>
      <div class="bytype-track"><div class="bytype-fill" style="width:${Math.min(100, share).toFixed(1)}%;background:${c};"></div></div>
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:13px;">No data</p>';

  // buyPrice > 0 guard: Steam-imported items left at a £0 buy price would
  // otherwise rank as +Infinity% and pin the top of the leaderboard
  const withPrices = holdings.filter(h => getBestPrice(h) != null && h.buyPrice > 0);
  withPrices.sort((a,b) => ((getBestPrice(b)-b.buyPrice)/b.buyPrice) - ((getBestPrice(a)-a.buyPrice)/a.buyPrice));
  const rankClasses = ['rank-1','rank-2','rank-3','rank-n','rank-n'];
  const perfRow = (h, i, isBottom) => {
    const pct = (getBestPrice(h) - h.buyPrice) / h.buyPrice * 100;
    const abs = (getBestPrice(h) - h.buyPrice) * h.qty;
    const pImg = getSteamImageUrl(h.marketHash);
    const pImgHtml = pImg ? `<img class="perf-img" src="${pImg}" alt="" onerror="this.style.display='none'">` : '';
    return `<div class="performer-row">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span class="rank-badge ${i < 3 ? rankClasses[i] : 'rank-n'}">${i+1}</span>
        ${pImgHtml}
        <div style="min-width:0;"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(h.name.slice(0,30))}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'Share Tech Mono',monospace;">${fmtMoney((h.buyPrice*h.qty), 0)} invested · qty ${h.qty}</div></div>
      </div>
      <div style="text-align:right;">
        <span class="pnl-pill ${pct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>
        <div style="font-size:10px;font-family:'Share Tech Mono',monospace;margin-top:3px;${abs>=0?'color:var(--green)':'color:var(--red);'}">${abs >= 0 ? '+' : ''}${fmtMoney(abs, 2)}</div>
      </div>
    </div>`;
  };
  document.getElementById('analyticsTop').innerHTML = withPrices.slice(0,5).map((h,i) => perfRow(h,i,false)).join('') || '<p style="color:var(--text3);font-size:13px;">Fetch prices to see rankings</p>';
  const worst = [...withPrices].reverse();
  document.getElementById('analyticsBottom').innerHTML = worst.slice(0,5).map((h,i) => perfRow(h,i,true)).join('') || '<p style="color:var(--text3);font-size:13px;">Fetch prices to see rankings</p>';

  const monthly = {};
  tradeHistory.forEach(t => {
    const m = t.sellDate ? t.sellDate.slice(0,7) : 'Unknown';
    if (!monthly[m]) monthly[m] = { profit:0, trades:0 };
    const gross = t.sellPrice * t.qty, fee = gross * (t.feePercent/100);
    monthly[m].profit += gross - fee - (t.buyPrice * t.qty);
    monthly[m].trades++;
  });
  document.getElementById('analyticsMontly').innerHTML = Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,d]) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="font-family:'Share Tech Mono',monospace;font-size:13px;">${m}</div>
      <div style="display:flex;gap:20px;align-items:center;"><span style="font-size:12px;color:var(--text3);">${d.trades} trade${d.trades!==1?'s':''}</span>
      <span class="pnl-pill ${d.profit>=0?'pnl-pos':'pnl-neg'}">${d.profit>=0?'+':''}${fmtMoney(d.profit, 2)}</span></div>
    </div>`
  ).join('') || '<p style="color:var(--text3);font-size:13px;">No completed trades yet</p>';
  renderTrending();
  renderAllocationChart();
}

// ========================
// PORTFOLIO ALLOCATION PIE CHART
// ========================
let _allocationChart = null;

function renderAllocationChart() {
  const ctx = document.getElementById('allocationChart');
  if (!ctx) return;

  const typeData = {};
  let totalInvested = 0;
  holdings.forEach(h => {
    const inv = h.buyPrice * h.qty;
    if (!typeData[h.type]) typeData[h.type] = { invested: 0, value: 0, label: typeLabels[h.type] || h.type };
    typeData[h.type].invested += inv;
    const best = getBestPrice(h);
    if (best) typeData[h.type].value += best * h.qty;
    totalInvested += inv;
  });

  const types = Object.entries(typeData).sort((a, b) => b[1].invested - a[1].invested);
  const labels = types.map(([, d]) => d.label);
  const data = types.map(([, d]) => d.invested);
  const pcts = data.map(v => totalInvested > 0 ? (v / totalInvested * 100).toFixed(1) : 0);

  const colors = {
    case: '#22c55e',
    sticker: '#a78bfa',
    skin: '#e8993c',
    armory: '#38bdf8',
    knife: '#fbbf24',
    charm: '#f472b6',
  };
  const bgColors = types.map(([type]) => colors[type] || '#64748b');

  if (_allocationChart) _allocationChart.destroy();

  const centreLabel = {
    id: 'vaultCentreLabel',
    afterDraw(chart) {
      const { ctx: c, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = "600 10px 'Share Tech Mono', monospace";
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillText('INVESTED', cx, cy - 12);
      c.font = "700 17px 'Share Tech Mono', monospace";
      c.fillStyle = '#e2e8f0';
      c.fillText(fmtMoney(totalInvested, 0), cx, cy + 7);
      c.restore();
    },
  };

  _allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderColor: 'rgba(8,12,8,0.8)',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(8,12,8,0.95)',
          borderColor: 'rgba(30,61,45,0.6)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: "'Share Tech Mono', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          titleColor: 'rgba(255,255,255,0.6)',
          bodyColor: '#e2e8f0',
          callbacks: {
            label: (ctx) => {
              const pct = totalInvested > 0 ? (ctx.raw / totalInvested * 100).toFixed(1) : 0;
              return ` ${fmtMoney(ctx.raw, 2)} (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [centreLabel],
  });

  const legendEl = document.getElementById('allocationLegend');
  if (legendEl) {
    legendEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">
      ${types.map(([type, d], i) => {
        const pct = pcts[i];
        const pnl = d.value - d.invested;
        return `<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-family:'Share Tech Mono',monospace;">
          <span style="width:10px;height:10px;border-radius:2px;background:${bgColors[i]};flex-shrink:0;"></span>
          <span>${d.label}</span>
          <span style="color:var(--text3);">${pct}%</span>
          <span style="color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'};">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 0)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }
}

// ========================
// MODALS
// ========================
function openAddModal() {
  document.getElementById('modalTitle').innerHTML = 'Add <span>Investment</span>';
  document.getElementById('editId').value = '';
  ['itemName','itemMarketHash','itemNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('itemType').value = 'skin';
  document.getElementById('itemQty').value = '1';
  document.getElementById('itemBuyPrice').value = '';
  document.getElementById('itemBuyDate').value = todayStr();
  document.getElementById('itemIsTuf').checked = false;
  const ccyEl = document.getElementById('itemBuyCcy');
  if (ccyEl) ccyEl.value = getDisplayCurrency();
  openModal('itemModal');
}
function openEditModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('modalTitle').innerHTML = 'Edit <span>Item</span>';
  document.getElementById('editId').value = id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemType').value = item.type;
  document.getElementById('itemQty').value = item.qty;
  // Show the originally entered amount + currency when present (non-GBP entry)
  const ccyEl2 = document.getElementById('itemBuyCcy');
  if (item.origCurrency && item.origCurrency !== 'GBP' && item.origAmount != null) {
    document.getElementById('itemBuyPrice').value = item.origAmount;
    if (ccyEl2) ccyEl2.value = item.origCurrency;
  } else {
    document.getElementById('itemBuyPrice').value = item.buyPrice;
    if (ccyEl2) ccyEl2.value = 'GBP';
  }
  document.getElementById('itemBuyDate').value = item.buyDate || '';
  document.getElementById('itemMarketHash').value = item.marketHash || '';
  document.getElementById('itemNotes').value = item.notes || '';
  document.getElementById('itemIsTuf').checked = item.isTuf || false;
  openModal('itemModal');
}

// ========================
// TOP-UP / ADD MORE HOLDINGS
// ========================
function openTopupModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('topupId').value = id;
  document.getElementById('topupItemName').textContent = item.name;

  // Show current position
  document.getElementById('topupCurrQty').textContent   = item.qty.toLocaleString();
  document.getElementById('topupCurrAvg').textContent   = `${fmtMoney(item.buyPrice, 3)}`;
  document.getElementById('topupCurrTotal').textContent = `${fmtMoney((item.qty * item.buyPrice), 2)}`;

  // Reset inputs
  document.getElementById('topupQty').value   = '';
  document.getElementById('topupPrice').value = '';
  document.getElementById('topupDate').value  = todayStr();
  document.getElementById('topupPreview').style.display = 'none';
  const tcEl = document.getElementById('topupCcy');
  if (tcEl) tcEl.value = getDisplayCurrency();
  _topupCcyRate = null; // resolved lazily by updateTopupPreview / saveTopup
  onTopupCcyChange();

  openModal('topupModal');
}

// Live ccy→GBP rate for the top-up preview (exact transaction-date rate fetched on save)
let _topupCcyRate = 1;
async function onTopupCcyChange() {
  const ccy = (document.getElementById('topupCcy') || {}).value || 'GBP';
  if (ccy === 'GBP') { _topupCcyRate = 1; updateTopupPreview(); return; }
  _topupCcyRate = null;
  const r = await getRate(ccy, 'GBP');
  _topupCcyRate = r || null;
  updateTopupPreview();
}

function updateTopupPreview() {
  const id    = document.getElementById('topupId').value;
  const item  = holdings.find(h => h.id === id);
  if (!item) return;

  const ccy = (document.getElementById('topupCcy') || {}).value || 'GBP';
  const addQty   = parseInt(document.getElementById('topupQty').value)    || 0;
  const addPriceEntered = parseFloat(document.getElementById('topupPrice').value) || 0;
  const rate = ccy === 'GBP' ? 1 : _topupCcyRate;
  const addPrice = rate ? addPriceEntered * rate : 0; // GBP

  if (addQty <= 0 || addPrice <= 0) {
    document.getElementById('topupPreview').style.display = 'none';
    return;
  }

  const oldTotal  = item.qty * item.buyPrice;
  const newTotal  = oldTotal + (addQty * addPrice);
  const newQty    = item.qty + addQty;
  const newAvg    = newTotal / newQty;
  const priceDiff = addPrice - item.buyPrice;
  const diffPct   = (priceDiff / item.buyPrice * 100);

  document.getElementById('topupNewQty').textContent   = newQty.toLocaleString();
  document.getElementById('topupNewAvg').textContent   = `${fmtMoney(newAvg, 3)}`;
  document.getElementById('topupNewTotal').textContent = `${fmtMoney(newTotal, 2)}`;

  const direction = priceDiff > 0 ? 'above' : priceDiff < 0 ? 'below' : 'at';
  const diffColor = priceDiff < 0 ? 'var(--green)' : priceDiff > 0 ? 'var(--red)' : 'var(--text3)';
  document.getElementById('topupAvgNote').innerHTML =
    `Buying <strong>${addQty.toLocaleString()}</strong> units at ${fmtMoney(addPrice, 3)} — ` +
    `<span style="color:${diffColor};">${Math.abs(diffPct).toFixed(1)}% ${direction} your current avg</span>. ` +
    `Avg cost basis moves from ${fmtMoney(item.buyPrice, 3)} → ${fmtMoney(newAvg, 3)}.`;

  document.getElementById('topupPreview').style.display = 'block';
}

async function saveTopup() {
  const id       = document.getElementById('topupId').value;
  const item     = holdings.find(h => h.id === id);
  if (!item) return;

  const addQty   = parseInt(document.getElementById('topupQty').value);
  const addPriceEntered = parseFloat(document.getElementById('topupPrice').value);
  const date     = document.getElementById('topupDate').value;
  const ccy      = (document.getElementById('topupCcy') || {}).value || 'GBP';

  if (!addQty || addQty <= 0)                { toast('Enter a valid quantity', 'error'); return; }
  if (!addPriceEntered || addPriceEntered <= 0) { toast('Enter a valid price', 'error');    return; }

  // Exact rate at the purchase date
  const fx = await toBaseGBP(addPriceEntered, ccy, date);
  if (!fx) { toast('FX rate unavailable for ' + ccy + ' — top-up not saved', 'error'); return; }
  const addPrice = fx.base; // GBP

  // Atomic: re-read storage, find the target, mutate a fresh copy (v2.4.3 pattern)
  const fresh = loadData();
  const target = fresh.find(h => h.id === id);
  if (!target) { toast('Holding not found', 'error'); return; }

  // Phase 2: a top-up appends a NEW lot rather than blending away the history.
  // The derived buyPrice/qty are recomputed from all lots so the UI is identical,
  // but the lot history is preserved for accurate Section 104 pooling.
  ensureLots(target);
  const _topupBefore = _logSnapshot(target);
  target.lots.push(makeLot(addQty, addPrice, date, ccy, fx.fxRate, addPriceEntered));
  recalcHoldingFromLots(target);
  const newAvg = target.buyPrice;

  // Append note about the top-up (records original-currency entry when non-GBP)
  const ccyNote = ccy !== 'GBP' ? ` (${curSymOf(ccy)}${addPriceEntered.toFixed(3)} ${ccy} @ ${fx.fxRate.toFixed(4)})` : '';
  const topupNote = `+${addQty.toLocaleString()} @ ${fmtMoney(addPrice, 3)}${ccyNote} on ${date}`;
  target.notes = target.notes ? target.notes + ' | ' + topupNote : topupNote;

  holdings = fresh;
  saveData(holdings);
  const _topupDiff = _logDiff(_topupBefore, _logSnapshot(target));
  logActivity('edit', 'holding', _logSnapshot(target),
    _topupDiff.length ? _topupDiff : [{ field: 'Top-up', from: '', to: '+' + addQty + ' @ ' + fmtMoney(addPrice, 3) }]);
  renderHoldings();
  toast(`Added ${addQty.toLocaleString()} × ${target.name} @ ${fmtMoney(addPrice, 3)} — new avg ${fmtMoney(newAvg, 3)}`, 'success');
}

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const buyPriceEntered = parseFloat(document.getElementById('itemBuyPrice').value);
  if (!name || isNaN(buyPriceEntered) || buyPriceEntered <= 0) { toast('Fill in Name and Buy Price', 'error'); return; }
  const ccy = (document.getElementById('itemBuyCcy') || {}).value || 'GBP';
  const buyDate = document.getElementById('itemBuyDate').value;
  // Convert entered amount to base GBP at the TRANSACTION date (Phase 1 FX provenance)
  const fx = await toBaseGBP(buyPriceEntered, ccy, buyDate);
  if (!fx) { toast('FX rate unavailable for ' + ccy + ' — item not saved', 'error'); return; }
  const obj = {
    name, type: document.getElementById('itemType').value,
    qty: parseInt(document.getElementById('itemQty').value) || 1,
    buyPrice: +fx.base.toFixed(6), buyDate,
    origCurrency: ccy, origAmount: buyPriceEntered, fxRate: fx.fxRate,
    marketHash: document.getElementById('itemMarketHash').value.trim(),
    notes: document.getElementById('itemNotes').value.trim(),
    isTuf: document.getElementById('itemIsTuf').checked
  };
  const editId = document.getElementById('editId').value;
  if (editId) {
    const item = holdings.find(h => h.id === editId);
    if (item) {
      const before = _logSnapshot(item);
      Object.assign(item, obj);
      // Editing a holding rewrites it to a single lot at the entered cost
      // (an explicit manual correction collapses prior lot structure).
      item.lots = [ makeLot(obj.qty, obj.buyPrice, buyDate, ccy, fx.fxRate, buyPriceEntered) ];
      const after = _logSnapshot(item);
      const diff = _logDiff(before, after);
      if (diff.length) logActivity('edit', 'holding', after, diff);
    }
  } else {
    const newItem = { id: uid(), ...obj, prices: null };
    newItem.lots = [ makeLot(obj.qty, obj.buyPrice, buyDate, ccy, fx.fxRate, buyPriceEntered) ];
    holdings.push(newItem);
    logActivity('add', 'holding', _logSnapshot(newItem), null);
  }
  saveData(holdings); renderHoldings(); updateStats(); closeModal('itemModal');
  toast(editId ? 'Item updated' : 'Item added!', 'success');
}
function deleteItem(id) {
  if (!confirm('Delete this holding?')) return;
  // Atomic: re-read storage before mutating (v2.4.3 pattern)
  const fresh = loadData();
  const removed = fresh.find(h => h.id === id);
  holdings = fresh.filter(h => h.id !== id);
  saveData(holdings);
  if (removed) logActivity('delete', 'holding', _logSnapshot(removed), null);
  _bulkSel.delete(id);
  renderHoldings(); updateStats(); updateBulkBar(); toast('Removed', 'info');
}

// ========================
// BULK SELECT / EDIT / DELETE (v2.8.0)
// ========================
const _bulkSel = new Set();
let _bulkMode = false;

function toggleBulkMode(force) {
  _bulkMode = (typeof force === 'boolean') ? force : !_bulkMode;
  const table = document.getElementById('holdingsTable');
  const btn = document.getElementById('bulkModeToggleBtn');
  if (table) table.classList.toggle('bulk-mode', _bulkMode);
  if (btn) {
    btn.classList.toggle('btn-primary', _bulkMode);
    btn.classList.toggle('btn-secondary', !_bulkMode);
    btn.textContent = _bulkMode ? '✕ Done' : '☑ Select';
  }
  if (!_bulkMode) bulkClearSelection();
}

function bulkToggleOne(id, checked) {
  if (checked) _bulkSel.add(id); else _bulkSel.delete(id);
  updateBulkBar();
}

function bulkToggleAll(checked) {
  // Applies to currently VISIBLE (filtered) rows only
  document.querySelectorAll('#holdingsBody .bulk-cb').forEach(cb => {
    cb.checked = checked;
    const id = cb.closest('tr')?.dataset.id;
    if (!id) return;
    if (checked) _bulkSel.add(id); else _bulkSel.delete(id);
  });
  updateBulkBar();
}

function bulkClearSelection() {
  _bulkSel.clear();
  document.querySelectorAll('#holdingsBody .bulk-cb').forEach(cb => { cb.checked = false; });
  const allCb = document.getElementById('bulkAllCb');
  if (allCb) allCb.checked = false;
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (!bar) return;
  // Drop ids that no longer exist (sold/deleted elsewhere)
  for (const id of [..._bulkSel]) {
    if (!holdings.some(h => h.id === id)) _bulkSel.delete(id);
  }
  const n = _bulkSel.size;
  bar.style.display = n ? 'flex' : 'none';
  if (n) {
    const sel = holdings.filter(h => _bulkSel.has(h.id));
    const invested = sel.reduce((a, h) => a + h.buyPrice * h.qty, 0);
    const units = sel.reduce((a, h) => a + h.qty, 0);
    document.getElementById('bulkCount').textContent =
      n + ' selected · ' + units.toLocaleString() + ' units · ' + fmtMoney(invested, 2) + ' invested';
  }
}

function bulkDeleteSelected() {
  const n = _bulkSel.size;
  if (!n) return;
  const sel = holdings.filter(h => _bulkSel.has(h.id));
  const invested = sel.reduce((a, h) => a + h.buyPrice * h.qty, 0);
  const preview = sel.slice(0, 5).map(h => '• ' + h.name).join('\n') + (n > 5 ? '\n…and ' + (n - 5) + ' more' : '');
  if (!confirm('Delete ' + n + ' holding' + (n !== 1 ? 's' : '') + ' (' + fmtMoney(invested, 2) + ' invested)?\n\n' + preview + '\n\nThis does NOT record any sales — records are simply removed.')) return;
  // Atomic: re-read storage, filter, write back
  const fresh = loadData();
  const removed = fresh.filter(h => _bulkSel.has(h.id));
  holdings = fresh.filter(h => !_bulkSel.has(h.id));
  saveData(holdings);
  removed.forEach(h => logActivity('delete', 'holding', _logSnapshot(h), null));
  _bulkSel.clear();
  renderHoldings(); updateStats(); updateBulkBar();
  toast(n + ' holdings deleted', 'info');
}

function openBulkEditModal() {
  if (!_bulkSel.size) return;
  document.getElementById('bulkEditInfo').textContent =
    'Applies to ' + _bulkSel.size + ' selected holding' + (_bulkSel.size !== 1 ? 's' : '') + '. Fields left unchanged are not touched.';
  document.getElementById('bulkEditType').value = '';
  document.getElementById('bulkEditTuf').value = '';
  document.getElementById('bulkEditCategory').value = '';
  document.getElementById('bulkEditModal').classList.add('open');
}

function saveBulkEdit() {
  const type = document.getElementById('bulkEditType').value;
  const tuf = document.getElementById('bulkEditTuf').value;
  const cat = document.getElementById('bulkEditCategory').value;
  if (!type && !tuf && !cat) { toast('Nothing to change — all fields left unchanged', 'info'); return; }
  // Atomic: re-read storage, mutate fresh copy, write back
  const fresh = loadData();
  let touched = 0;
  fresh.forEach(h => {
    if (!_bulkSel.has(h.id)) return;
    const before = _logSnapshot(h);
    const beforeTuf = !!h.isTuf, beforeCat = h.category || '';
    if (type) h.type = type;
    if (tuf) h.isTuf = (tuf === 'yes');
    if (cat) { if (cat === '__clear__') delete h.category; else h.category = cat; }
    const diff = _logDiff(before, _logSnapshot(h));
    if (tuf && beforeTuf !== !!h.isTuf) diff.push({ field: 'TUF', from: beforeTuf ? 'yes' : 'no', to: h.isTuf ? 'yes' : 'no' });
    if (cat && beforeCat !== (h.category || '')) diff.push({ field: 'Category', from: beforeCat || '(none)', to: h.category || '(none)' });
    if (diff.length) logActivity('edit', 'holding', _logSnapshot(h), diff);
    touched++;
  });
  saveData(fresh);
  holdings = fresh;
  closeModal('bulkEditModal');
  renderHoldings(); updateStats(); updateBulkBar();
  toast(touched + ' holdings updated', 'success');
}
function openSellModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('sellItemId').value = id;
  document.getElementById('sellItemName').value = item.name;
  document.getElementById('sellQty').value = item.qty;
  document.getElementById('sellQty').max = item.qty;
  document.getElementById('sellPrice').value = getBestPrice(item) ? (getBestPrice(item) * _displayRate).toFixed(2) : '';
  document.getElementById('sellDate').value = todayStr();
  document.getElementById('sellFee').value = '2';
  // Reset to defaults
  setSellPlatform('csfloat');
  setSellMode('perunit');
  document.getElementById('sellTotalReceived').value = '';
  document.getElementById('sellReverseCalc').style.display = 'none';
  const scEl = document.getElementById('sellCcy');
  if (scEl) scEl.value = getDisplayCurrency();
  onSellCcyChange();
  openModal('sellModal');
}

// Live ccy→GBP rate for sell previews (exact transaction-date rate fetched on confirm)
let _sellCcyRate = 1;
function getSellCcy() { return (document.getElementById('sellCcy') || {}).value || 'GBP'; }
async function onSellCcyChange() {
  const ccy = getSellCcy();
  if (ccy === 'GBP') { _sellCcyRate = 1; }
  else {
    _sellCcyRate = null;
    _sellCcyRate = (await getRate(ccy, 'GBP')) || null;
  }
  if (_sellMode === 'total') updateSellFromTotal(); else updateSellCalc();
}
// Resolve the exact ccy→GBP rate at the sale date. Returns { ccy, fxRate } or null (toasts on failure).
async function resolveSellFx(sellDate) {
  const ccy = getSellCcy();
  if (ccy === 'GBP') return { ccy, fxRate: 1 };
  const r = await getRate(ccy, 'GBP', sellDate || todayStr());
  if (!r) { toast('FX rate unavailable for ' + ccy + ' — sale not recorded', 'error'); return null; }
  return { ccy, fxRate: r };
}

let _sellFeePercent = 2;
let _sellMode = 'perunit'; // 'perunit' or 'total'
let _currentSellPlatform = 'csfloat'; // track selected platform for CGT persistence

// Look up item from holdings or skins (for sell modal)
function findSellItem(rawId) {
  if (rawId.startsWith('skin:')) {
    const skinId = rawId.replace('skin:', '');
    return skins ? skins.find(s => s.id === skinId) : null;
  }
  return holdings.find(h => h.id === rawId);
}

function setSellPlatform(plat) {
  const fees = { csfloat: 2, steam: 15, custom: 2 };
  _currentSellPlatform = plat; // persist for CGT recording
  document.querySelectorAll('.sell-plat-btn').forEach(b => b.classList.remove('active'));
  if (plat === 'custom') {
    document.getElementById('sellPlatCustom').classList.add('active');
    document.getElementById('sellFeeRow').style.display = '';
    _sellFeePercent = parseFloat(document.getElementById('sellFee').value) || 2;
  } else {
    document.getElementById('sellPlat' + plat.charAt(0).toUpperCase() + plat.slice(1)).classList.add('active');
    document.getElementById('sellFeeRow').style.display = 'none';
    _sellFeePercent = fees[plat] || 2;
    document.getElementById('sellFee').value = _sellFeePercent;
  }
  if (_sellMode === 'total') updateSellFromTotal();
  else updateSellCalc();
}

function setSellMode(mode) {
  _sellMode = mode;
  document.querySelectorAll('.sell-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sellMode' + mode.charAt(0).toUpperCase() + mode.slice(1)).classList.add('active');
  document.getElementById('sellPerunitRow').style.display = mode === 'perunit' ? '' : 'none';
  document.getElementById('sellTotalRow').style.display = mode === 'total' ? '' : 'none';
  document.getElementById('sellReverseCalc').style.display = 'none';
  if (mode === 'total') updateSellFromTotal();
  else updateSellCalc();
}

function updateSellFromTotal() {
  const rawId = document.getElementById('sellItemId').value;
  const item = findSellItem(rawId);
  if (!item) return;
  const qty = parseInt(document.getElementById('sellQty').value) || 1;
  const totalReceived = parseFloat(document.getElementById('sellTotalReceived').value) || 0;
  const fee = _sellFeePercent;
  const reverseEl = document.getElementById('sellReverseCalc');
  const ccy = getSellCcy();
  const sym = curSymOf(ccy);
  const rate = ccy === 'GBP' ? 1 : _sellCcyRate;

  if (totalReceived <= 0 || qty <= 0) {
    reverseEl.style.display = 'none';
    document.getElementById('calcGross').textContent = sym + '0.00';
    document.getElementById('calcFee').textContent = '-' + sym + '0.00';
    const pe = document.getElementById('calcProfit');
    pe.textContent = '£0.00'; pe.className = 'sold-col-val';
    return;
  }

  // Reverse calculate: totalReceived = gross * (1 - fee/100)
  // So gross = totalReceived / (1 - fee/100)   (all in entry currency)
  const gross = totalReceived / (1 - fee / 100);
  const feeAmt = gross - totalReceived;
  const perUnit = gross / qty;
  // Profit is accounting-real: convert proceeds to GBP vs GBP cost basis
  const profit = rate != null ? (totalReceived * rate) - (item.buyPrice * qty) : null;

  // Set the hidden per-unit price so confirmSell works (entry currency — converted on confirm)
  document.getElementById('sellPrice').value = perUnit.toFixed(4);

  reverseEl.style.display = '';
  reverseEl.innerHTML = `You received <strong>${sym}${totalReceived.toFixed(2)}</strong> after ${fee}% fee → Gross: ${sym}${gross.toFixed(2)} → Per unit: <strong>${sym}${perUnit.toFixed(3)}</strong>`;

  document.getElementById('calcGross').textContent = `${sym}${gross.toFixed(2)}`;
  document.getElementById('calcFee').textContent = `-${sym}${feeAmt.toFixed(2)}`;
  const pe = document.getElementById('calcProfit');
  pe.textContent = profit == null ? '…' : `${profit >= 0 ? '+' : ''}${fmtGBP(profit)}`;
  pe.className = `sold-col-val ${(profit || 0) >= 0 ? 'positive' : 'negative'}`;
}

function updateSellCalc() {
  const rawId = document.getElementById('sellItemId').value;
  const item = findSellItem(rawId);
  if (!item) return;
  const qty = parseInt(document.getElementById('sellQty').value) || 1;
  const sp = parseFloat(document.getElementById('sellPrice').value) || 0;
  const fee = _sellFeePercent;
  const ccy = getSellCcy();
  const sym = curSymOf(ccy);
  const rate = ccy === 'GBP' ? 1 : _sellCcyRate;
  const gross = sp * qty, feeAmt = gross * (fee/100);
  const profit = rate != null ? (gross - feeAmt) * rate - (item.buyPrice * qty) : null;
  document.getElementById('calcGross').textContent = `${sym}${gross.toFixed(2)}`;
  document.getElementById('calcFee').textContent = `-${sym}${feeAmt.toFixed(2)}`;
  const pe = document.getElementById('calcProfit');
  pe.textContent = profit == null ? '…' : `${profit >= 0 ? '+' : ''}${fmtGBP(profit)}`;
  pe.className = `sold-col-val ${(profit || 0) >= 0 ? 'positive' : 'negative'}`;
}
async function confirmSell() {
  const id = document.getElementById('sellItemId').value;
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  const qty = parseInt(document.getElementById('sellQty').value) || 1;
  const sellPriceEntered = parseFloat(document.getElementById('sellPrice').value);
  const feePercent = _sellFeePercent;
  if (!sellPriceEntered || sellPriceEntered <= 0) { toast('Enter a sell price or total received', 'error'); return; }
  if (qty > item.qty) { toast(`Only ${item.qty} in stock`, 'error'); return; }
  const sellDate = document.getElementById('sellDate').value;
  const fx = await resolveSellFx(sellDate);
  if (!fx) return;
  const sellPrice = +(sellPriceEntered * fx.fxRate).toFixed(6); // base GBP
  const _gross = sellPrice * qty;
  const _feeAmount = _gross * (feePercent / 100);
  const _netRealised = _gross - _feeAmount;
  tradeHistory.push({ id: uid(), name: item.name, type: item.type, qty, buyPrice: item.buyPrice, sellPrice, sellDate, feePercent, platform: _currentSellPlatform, gross: _gross, feeAmount: _feeAmount, netRealised: _netRealised, origCurrency: fx.ccy, origAmount: sellPriceEntered, fxRate: fx.fxRate });
  saveHistory(tradeHistory);
  if (qty >= item.qty) holdings = holdings.filter(h => h.id !== id);
  else {
    // Partial sell: reduce qty AND consume lots per the active method so the
    // remaining lot structure stays correct for future pooling/FIFO matching.
    item.qty -= qty;
    if (Array.isArray(item.lots) && item.lots.length) {
      consumeLotsInPlace(item, qty, getCostBasisMethod());
    }
  }
  saveData(holdings); renderHoldings(); renderHistory(); updateStats(); closeModal('sellModal');
  const net = _netRealised - (item.buyPrice * qty);
  toast(`Sold! Net: ${net >= 0 ? '+' : ''}${fmtGBP(net)}`, net >= 0 ? 'success' : 'info');
}
function openPriceModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  const p = item.prices || {};
  document.getElementById('priceItemId').value = id;
  document.getElementById('priceLowest').value = p.lowest || '';
  document.getElementById('priceLastSold').value = p.lastSold || '';
  document.getElementById('priceAvg7d').value = p.avg7d || '';
  openModal('priceModal');
}
function saveManualPrice() {
  const id = document.getElementById('priceItemId').value;
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  item.prices = { lowest: parseFloat(document.getElementById('priceLowest').value)||null, lastSold: parseFloat(document.getElementById('priceLastSold').value)||null, avg7d: parseFloat(document.getElementById('priceAvg7d').value)||null, fetchedAt: Date.now(), manual: true };
  saveData(holdings); renderHoldings(); updateStats(); closeModal('priceModal'); toast('Prices updated', 'success');
}

// ========================
// ========================
// PORTFOLIO VALUE HISTORY (Skin Ledger-style value-over-time chart)
// ========================
// Daily value-only points so the value chart looks dense like Skin Ledger,
// rather than the monthly category snapshots used below for benchmarking.
// One point per calendar day (last write of the day wins), capped + pruned.
const VALUE_HISTORY_KEY = 'cs2vault_value_history';
const VALUE_HISTORY_MAX = 730;          // ~2 years of daily points
let valueChart = null;
let currentValueRange = 365;            // default range in days; 0 = All

function loadValueHistory() { try { return JSON.parse(window._store[VALUE_HISTORY_KEY]) || []; } catch { return []; } }
function saveValueHistory(d) { window._storeSet(VALUE_HISTORY_KEY, JSON.stringify(d)); }

// Compute today's portfolio value split by the platform that drives each item's
// P&L price (Steam-priced items vs CSFloat-priced items), matching the
// Steam / CSFloat split shown under the value header.
function computeValueSplit() {
  let steam = 0, csfloat = 0, invested = 0;
  holdings.forEach(h => {
    invested += (h.buyPrice || 0) * (h.qty || 0);
    const best = getBestPrice(h);
    if (best == null) return;
    const v = best * (h.qty || 0);
    if (getPricingPlatform(h) === 'steam') steam += v; else csfloat += v;
  });
  return { steam: +steam.toFixed(2), csfloat: +csfloat.toFixed(2), value: +(steam + csfloat).toFixed(2), invested: +invested.toFixed(2) };
}

// Record one daily value point. Dedupes per calendar day (latest write wins),
// only writes when at least one holding has a live price (avoids logging a £0
// point before prices have loaded on launch).
function recordValueSnapshot() {
  if (!holdings.length) return;
  const split = computeValueSplit();
  if (split.value <= 0) return;
  const hist = loadValueHistory();
  const today = todayStr();
  const existing = hist.find(p => p.date === today);
  const point = { date: today, steam: split.steam, csfloat: split.csfloat, value: split.value, invested: split.invested };
  if (existing) { Object.assign(existing, point); }
  else { hist.push(point); }
  hist.sort((a, b) => a.date.localeCompare(b.date));
  if (hist.length > VALUE_HISTORY_MAX) hist.splice(0, hist.length - VALUE_HISTORY_MAX);
  saveValueHistory(hist);
}

// Seed the value series from existing monthly category snapshots so the long
// ranges aren't empty on first run. Each historical/auto/manual snapshot's total
// value becomes a value point (no platform split available for those — all
// attributed to value only). Runs once; never overwrites real daily points.
function seedValueHistoryFromSnapshots() {
  const hist = loadValueHistory();
  if (hist.some(p => p.seeded)) return;             // already seeded
  const haveDates = new Set(hist.map(p => p.date));
  const snaps = loadSnapshots();
  if (!snaps.length) return;
  let added = 0;
  snaps.forEach(s => {
    if (haveDates.has(s.date)) return;
    const cats = s.categories || {};
    const value = Object.values(cats).reduce((a, v) => a + (v.value || 0), 0);
    const invested = Object.values(cats).reduce((a, v) => a + (v.invested || 0), 0);
    if (value <= 0) return;
    hist.push({ date: s.date, steam: 0, csfloat: 0, value: +value.toFixed(2), invested: +invested.toFixed(2), seeded: true });
    added++;
  });
  if (added) { hist.sort((a, b) => a.date.localeCompare(b.date)); saveValueHistory(hist); }
}

function pruneValueHistory() {
  const hist = loadValueHistory();
  if (hist.length > VALUE_HISTORY_MAX) { hist.splice(0, hist.length - VALUE_HISTORY_MAX); saveValueHistory(hist); }
}

function setValueRange(days, btn) {
  currentValueRange = days;
  document.querySelectorAll('.value-range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderValueChart();
}

// Slice the value history to the active range (in days; 0 = all).
function _valueRangeSlice(hist) {
  if (!currentValueRange || currentValueRange <= 0) return hist;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - currentValueRange);
  const cutoffStr = localDateStr(cutoff);
  const sliced = hist.filter(p => p.date >= cutoffStr);
  // If the range is so short nothing falls in it but we have data, show the last
  // 2 points so the chart isn't blank.
  if (sliced.length < 2 && hist.length >= 2) return hist.slice(-2);
  return sliced;
}

// Build the "Invested £X · Unrealised P&L £Y" line shown under the value header.
// P&L is colour-coded (green up / red down) with a ▲/▼ arrow.
function _valueSplitHtml(invested, value) {
  const pnl = (value || 0) - (invested || 0);
  const pos = pnl >= 0;
  const pnlCol = pos ? 'var(--green)' : 'var(--red)';
  const arrow = pos ? '\u25B2' : '\u25BC';
  return '<span class="vc-split-invested">Invested ' + fmtMoneyLoc(invested || 0, 0) + '</span>'
    + '&nbsp;&nbsp;&middot;&nbsp;&nbsp;'
    + '<span class="vc-split-pnl" style="color:' + pnlCol + ';">' + arrow + ' Unrealised P&amp;L ' + (pos ? '+' : '\u2212') + fmtMoneyLoc(Math.abs(pnl), 0) + '</span>';
}

function renderValueChart() {
  const hist = loadValueHistory().sort((a, b) => a.date.localeCompare(b.date));
  const headEl   = document.getElementById('valueChartTotal');
  const deltaEl  = document.getElementById('valueChartDelta');
  const splitEl  = document.getElementById('valueChartSplit');
  const emptyEl  = document.getElementById('valueChartEmpty');
  const canvas   = document.getElementById('valueChart');
  if (!canvas) return;

  if (hist.length < 2) {
    // Not enough points yet — show a friendly note, still display current value.
    if (valueChart) { valueChart.destroy(); valueChart = null; }
    const split = holdings.length ? computeValueSplit() : { value: 0, steam: 0, csfloat: 0, invested: 0 };
    if (headEl)  headEl.textContent = fmtMoneyLoc(split.value, 0);
    if (deltaEl) { deltaEl.textContent = ''; }
    if (splitEl) splitEl.innerHTML = _valueSplitHtml(split.invested || 0, split.value || 0);
    if (emptyEl) emptyEl.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  canvas.style.display = 'block';

  const slice = _valueRangeSlice(hist);
  const labels = slice.map(p => p.date);
  const values = slice.map(p => +(p.value || 0).toFixed(2));

  // Header: current (latest overall) value + delta over the visible range
  const latest = hist[hist.length - 1];
  const rangeStartVal = slice[0].value || 0;
  const rangeEndVal   = slice[slice.length - 1].value || 0;
  const delta = rangeEndVal - rangeStartVal;
  const deltaPct = rangeStartVal > 0 ? (delta / rangeStartVal * 100) : 0;
  const up = delta >= 0;

  if (headEl) headEl.textContent = fmtMoneyLoc(latest.value, 0);
  if (deltaEl) {
    deltaEl.textContent = (up ? '+' : '−') + fmtMoneyLoc(Math.abs(delta), 0) + ' (' + (up ? '+' : '−') + Math.abs(deltaPct).toFixed(1) + '%)';
    deltaEl.style.color = up ? 'var(--green)' : 'var(--red)';
  }
  if (splitEl) {
    splitEl.innerHTML = _valueSplitHtml(latest.invested || 0, latest.value || 0);
  }

  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  if (up) {
    grad.addColorStop(0, 'rgba(34,197,94,0.28)');
    grad.addColorStop(0.55, 'rgba(34,197,94,0.07)');
    grad.addColorStop(1, 'rgba(34,197,94,0.0)');
  } else {
    grad.addColorStop(0, 'rgba(239,68,68,0.22)');
    grad.addColorStop(0.55, 'rgba(239,68,68,0.06)');
    grad.addColorStop(1, 'rgba(239,68,68,0.0)');
  }
  const lineCol = up ? '#22c55e' : '#ef4444';

  if (valueChart) valueChart.destroy();
  valueChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Portfolio Value',
        data: values,
        borderColor: lineCol,
        backgroundColor: grad,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: lineCol,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: lineCol,
        pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        annotation: {},
        tooltip: {
          backgroundColor: 'rgba(8,12,8,0.96)',
          borderColor: 'rgba(30,61,45,0.6)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: "'Share Tech Mono', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 13 },
          titleColor: 'rgba(255,255,255,0.6)',
          bodyColor: '#e2e8f0',
          displayColors: false,
          callbacks: {
            label: c => fmtMoneyLoc(Number(c.raw), 0),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.35)', font: { family: "'Share Tech Mono', monospace", size: 10 }, maxRotation: 0, maxTicksLimit: 7, autoSkip: true },
          grid: { display: false },
          border: { color: 'rgba(30,61,45,0.4)' },
        },
        y: {
          position: 'left',
          ticks: { color: 'rgba(255,255,255,0.4)', callback: v => fmtMoneyLoc(Number(v), 0), font: { family: "'Share Tech Mono', monospace", size: 11 }, maxTicksLimit: 6 },
          grid: { color: 'rgba(30,61,45,0.22)', drawBorder: false },
          border: { display: false },
        },
      },
    },
  });
}

// ========================
// ========================
// PORTFOLIO HISTORY
// ========================
const SNAPSHOT_KEY = 'cs2vault_snapshots';
let portfolioChart = null;
let currentChartCategory = 'all';
let activeOverlays = new Set(['updates']);
let activeBenchmarks = new Set();

// CS2 update events (majors removed per user request)
const CS2_UPDATES = [
  { date: '2023-09-27', label: 'CS2 Launch',          color: 'rgba(99,102,241,0.85)' },
  { date: '2024-01-22', label: 'Armory + Coins',       color: 'rgba(99,102,241,0.85)' },
  { date: '2024-09-10', label: 'Gallery Case',         color: 'rgba(99,102,241,0.85)' },
  { date: '2025-01-21', label: 'Fever Case / Charms',  color: 'rgba(99,102,241,0.85)' },
  { date: '2025-09-01', label: 'Graphic Design Coll',  color: 'rgba(99,102,241,0.85)' },
  { date: '2026-01-15', label: 'Elemental Craft',      color: 'rgba(99,102,241,0.85)' },
];

// ── Live benchmark data ──────────────────────────────────────────────────────
// Fetched from stooq.com daily-close CSV (no API key), cached 24h in
// cs2vault_benchmarks. The static BENCHMARK_DATA table below is ONLY the
// offline fallback — it ends 2026-03-14, which is why lines went flat when it
// was the sole source. All series are indexed to 100 at the chart's first
// visible date at render time (so the % figures always match the labelled range).
const BENCH_CACHE_KEY = 'cs2vault_benchmarks';
// Two independent sources per series (v3.6.4: stooq alone proved unreliable in
// the field — it rate-limits anonymous clients). Stooq first, Yahoo Finance
// chart API as automatic fallback. Either failing is logged with the status.
const BENCH_SOURCES = {
  sp500: { stooq: '%5Espx',  yahoo: '%5EGSPC'  },
  btc:   { stooq: 'btcusd',  yahoo: 'BTC-USD'  },
  gold:  { stooq: 'xauusd',  yahoo: 'GC%3DF'   },
};
const BENCH_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
let _benchFetchPromise = null;

function loadBenchCache() {
  try { return JSON.parse(window._store[BENCH_CACHE_KEY]) || null; } catch { return null; }
}

async function _fetchBenchStooq(sym) {
  const res = await window.cs2vault.fetch('https://stooq.com/q/d/l/?s=' + sym + '&i=d', BENCH_UA);
  if (!res || res.status !== 200 || !res.body || res.body.length < 50) {
    console.warn('[Benchmarks] stooq bad response for', sym, 'status:', res && res.status, 'body head:', res && String(res.body).slice(0, 80));
    return null;
  }
  const rows = res.body.trim().split('\n').slice(1); // skip CSV header
  const pts = [];
  for (const line of rows) {
    const cols = line.split(',');
    const d = cols[0], close = parseFloat(cols[4]);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && isFinite(close) && close > 0) pts.push({ d, c: close });
  }
  return pts.length >= 30 ? pts : null;
}

async function _fetchBenchYahoo(sym) {
  const res = await window.cs2vault.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?range=2y&interval=1d', BENCH_UA);
  if (!res || res.status !== 200 || !res.body) {
    console.warn('[Benchmarks] yahoo bad response for', sym, 'status:', res && res.status, 'body head:', res && String(res.body).slice(0, 80));
    return null;
  }
  try {
    const j = JSON.parse(res.body);
    const r = j.chart && j.chart.result && j.chart.result[0];
    const ts = r && r.timestamp;
    const closes = r && r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
    if (!ts || !closes) { console.warn('[Benchmarks] yahoo unexpected shape for', sym); return null; }
    const pts = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || !isFinite(c) || c <= 0) continue;
      pts.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
    }
    return pts.length >= 30 ? pts : null;
  } catch (e) { console.warn('[Benchmarks] yahoo parse failed for', sym, e); return null; }
}

async function refreshBenchmarks(force) {
  const cache = loadBenchCache();
  if (!force && cache?.fetchedAt && (Date.now() - cache.fetchedAt) < 24 * 60 * 60 * 1000) return false;
  if (_benchFetchPromise) return _benchFetchPromise;
  _benchFetchPromise = (async () => {
    const series = cache?.series ? { ...cache.series } : {};
    let updated = false;
    for (const [key, syms] of Object.entries(BENCH_SOURCES)) {
      try {
        let pts = await _fetchBenchStooq(syms.stooq);
        let source = 'stooq';
        if (!pts) { pts = await _fetchBenchYahoo(syms.yahoo); source = 'yahoo'; }
        if (pts) {
          series[key] = pts.slice(-1200); // keep ~5y of dailies
          updated = true;
          console.log('[Benchmarks] ' + key + ': ' + pts.length + ' points via ' + source + ' (latest ' + pts[pts.length - 1].d + ')');
        } else {
          console.warn('[Benchmarks] ' + key + ': BOTH sources failed — static fallback in use');
        }
      } catch (e) { console.warn('[Benchmarks] fetch failed for', key, e); }
    }
    if (updated) window._storeSet(BENCH_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), series }));
    else if (cache) window._storeSet(BENCH_CACHE_KEY, JSON.stringify({ ...cache, fetchedAt: Date.now() })); // don't hammer sources on repeated failures
    _benchFetchPromise = null;
    return updated;
  })();
  return _benchFetchPromise;
}

// Raw benchmark level on (or the trading day just before) a date.
// Falls back to the static table below when no live data is cached — callers
// always divide by a base taken from the SAME source, so mixing is impossible.
function benchmarkValueAt(bKey, dateStr) {
  const cache = loadBenchCache();
  const pts = cache?.series?.[bKey];
  if (pts && pts.length) {
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].d <= dateStr) return pts[i].c;
    }
    return pts[0].c; // date precedes the series
  }
  return interpolateBenchmark(bKey, dateStr);
}

// OFFLINE FALLBACK ONLY — approximate levels indexed to 100 at Sep 2025, ends 2026-03-14
const BENCHMARK_DATA = {
  sp500: {
    label: 'S&P 500',
    color: '#3b82f6',
    // Actual approximate S&P closing levels indexed to 100 at Sep 2025
    points: {
      '2025-09-03': 100.0,
      '2025-10-03': 99.2,
      '2025-11-03': 103.8,
      '2025-12-03': 106.1,
      '2026-01-03': 105.4,
      '2026-02-03': 102.6,
      '2026-03-03': 96.5,
      '2026-03-14': 95.8,
    }
  },
  btc: {
    label: 'Bitcoin',
    color: '#f7931a',
    // BTC indexed to 100 at Sep 2025 (~$63k)
    points: {
      '2025-09-03': 100.0,
      '2025-10-03': 106.3,
      '2025-11-03': 128.6,
      '2025-12-03': 151.2,
      '2026-01-03': 171.4,  // ~$108k peak
      '2026-02-03': 147.6,
      '2026-03-03': 133.3,
      '2026-03-14': 130.2,
    }
  },
  gold: {
    label: 'Gold',
    color: '#eab308',
    // Gold indexed to 100 at Sep 2025 (~$2500/oz)
    points: {
      '2025-09-03': 100.0,
      '2025-10-03': 103.4,
      '2025-11-03': 102.1,
      '2025-12-03': 103.6,
      '2026-01-03': 108.0,
      '2026-02-03': 112.4,
      '2026-03-03': 118.8,
      '2026-03-14': 122.0,  // ~$3050/oz
    }
  }
};

function loadSnapshots() { try { return JSON.parse(window._store[SNAPSHOT_KEY]) || []; } catch { return []; } }
function saveSnapshots(d) { window._storeSet(SNAPSHOT_KEY, JSON.stringify(d)); }

// Seed historical case-only data
function seedHistoricalSnapshots() {
  // Fresh installs start with no portfolio history — these are the developer's
  // real monthly figures and must not appear on a new user's machine.
  if (isFreshInstall()) return;
  const existing = JSON.parse(window._store[SNAPSHOT_KEY] || '[]');
  if (existing.some(s => s.source === 'historical')) return;
  const historical = [
    {date:'2025-09-03',categories:{case:{invested:11712.12,value:15377.03}},source:'historical'},
    {date:'2025-10-03',categories:{case:{invested:14324.48,value:18113.38}},source:'historical'},
    {date:'2025-11-03',categories:{case:{invested:15556.09,value:17707.76}},source:'historical'},
    {date:'2025-12-03',categories:{case:{invested:16176.35,value:16937.37}},source:'historical'},
    {date:'2026-01-03',categories:{case:{invested:16085.39,value:17453.32}},source:'historical'},
    {date:'2026-02-03',categories:{case:{invested:16284.11,value:16491.04}},source:'historical'},
    {date:'2026-03-03',categories:{case:{invested:16588.97,value:17014.81}},source:'historical'},
  ];
  const merged = [...historical, ...existing];
  window._storeSet(SNAPSHOT_KEY, JSON.stringify(merged));
}

function takeSnapshot(auto) {
  const snaps = loadSnapshots();
  const cats = { case:{invested:0,value:0}, sticker:{invested:0,value:0}, armory:{invested:0,value:0}, skin:{invested:0,value:0}, knife:{invested:0,value:0} };
  holdings.forEach(h => {
    const cat = cats[h.type] || cats.skin;
    cat.invested += h.buyPrice * h.qty;
    const best = getBestPrice(h);
    if (best) cat.value += best * h.qty;
  });
  const today = todayStr();
  const existing = snaps.find(s => s.date === today && s.source !== 'historical');
  const snap = { date: today, categories: cats, source: auto ? 'auto' : 'manual', createdAt: Date.now() };
  if (existing) { Object.assign(existing, snap); } else { snaps.push(snap); }
  saveSnapshots(snaps);
  renderPortfolio();
  if (!auto) toast('Snapshot saved!', 'success');
}

function checkAutoSnapshot() {
  // v3.6.3: the old version "backfilled" missed months by writing TODAY'S
  // portfolio values onto PAST dates — one more fake snapshot per launch.
  // Combined with the case-only historical seed points, this produced the
  // sawtooth portfolio line and (via duplicate chart labels) the diagonal
  // annotation glitch. Snapshots are now only ever dated the day they were
  // actually measured.
  const snaps  = loadSnapshots();
  const today  = new Date();
  const todayLocal = todayStr();
  if (today.getDate() < 3) return; // monthly window opens on the 3rd
  const monthKey = todayLocal.slice(0, 7);
  const coveredThisMonth = snaps.some(s => s.date.slice(0, 7) === monthKey);
  if (!coveredThisMonth) {
    takeSnapshot(true);
    console.log('[Snapshot] Auto snapshot taken for ' + monthKey + ' (dated today: ' + todayLocal + ')');
  }
}

// One-shot cleanup of snapshots the old backfill fabricated (v3.6.3).
// A fake backfill is an 'auto' snapshot sitting within 3 days of a
// 'historical' seed point — the backfill only ever targeted 3rd-of-month
// dates that historical points already covered. Exact-date duplicates are
// also collapsed (manual > auto > historical), because duplicate x-axis
// labels made the chartjs annotation plugin draw diagonal event lines.
function cleanupSnapshotArtifacts() {
  const snaps = loadSnapshots();
  if (!snaps.length) return;
  const historicalTs = snaps.filter(s => s.source === 'historical').map(s => +new Date(s.date));
  const noFakes = snaps.filter(s => {
    if (s.source !== 'auto') return true;
    if (s.createdAt) return true; // post-fix snapshots are always genuine
    return !historicalTs.some(h => Math.abs(+new Date(s.date) - h) < 3 * 86400000);
  });
  const rank = s => s.source === 'manual' ? 3 : s.source === 'auto' ? 2 : 1;
  const byDate = new Map();
  noFakes.forEach(s => {
    const cur = byDate.get(s.date);
    if (!cur || rank(s) >= rank(cur)) byDate.set(s.date, s);
  });
  const cleaned = [...byDate.values()];
  if (cleaned.length !== snaps.length) {
    saveSnapshots(cleaned);
    console.log('[Snapshot] Cleaned ' + (snaps.length - cleaned.length) + ' fabricated/duplicate snapshot(s)');
  }
}

function deleteSnapshot(date) {
  saveSnapshots(loadSnapshots().filter(s => !(s.date === date && s.source !== 'historical')));
  renderPortfolio();
}

function setChartCategory(cat, btn) {
  currentChartCategory = cat;
  document.querySelectorAll('.chart-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const labels = { all:'All Categories', case:'Cases', sticker:'Stickers', armory:'Armory', skin:'Skins', knife:'Knives/Gloves' };
  const el = document.getElementById('snapshotCatLabel');
  if (el) el.textContent = labels[cat] || cat;
  renderPortfolio();
}

function toggleOverlay(type, btn) {
  if (activeOverlays.has(type)) { activeOverlays.delete(type); btn.classList.remove('active'); }
  else { activeOverlays.add(type); btn.classList.add('active'); }
  renderPortfolio();
}

function toggleBenchmark(type, btn) {
  if (activeBenchmarks.has(type)) { activeBenchmarks.delete(type); btn.classList.remove('active'); }
  else { activeBenchmarks.add(type); btn.classList.add('active'); }
  renderPortfolio();
}

function interpolateBenchmark(benchKey, dateStr) {
  const pts = BENCHMARK_DATA[benchKey].points;
  const dates = Object.keys(pts).sort();
  if (dateStr <= dates[0]) return pts[dates[0]];
  if (dateStr >= dates[dates.length-1]) return pts[dates[dates.length-1]];
  for (let i = 0; i < dates.length - 1; i++) {
    if (dateStr >= dates[i] && dateStr <= dates[i+1]) {
      const t = (new Date(dateStr) - new Date(dates[i])) / (new Date(dates[i+1]) - new Date(dates[i]));
      return pts[dates[i]] + t * (pts[dates[i+1]] - pts[dates[i]]);
    }
  }
  return null;
}

function renderPortfolio() {
  try { renderValueChart(); } catch (e) { console.warn('[renderValueChart]', e); }
  // Live benchmark refresh (24h-cached). Re-render once when fresh data lands;
  // refreshBenchmarks() returns false while the cache is fresh, so no loop.
  if (activeBenchmarks.size > 0) {
    refreshBenchmarks().then(updated => { if (updated) renderPortfolio(); }).catch(() => {});
  }
  const snaps = loadSnapshots().sort((a,b) => a.date.localeCompare(b.date));
  if (!snaps.length) return;

  const last = snaps[snaps.length-1];
  const el = document.getElementById('lastSnapshot');
  if (el) el.textContent = last.date + (last.source === 'historical' ? ' (historical)' : last.source === 'auto' ? ' (auto)' : ' (manual)');

  const cat = currentChartCategory;
  const chartSnaps = snaps.filter(s => cat === 'all' ? true : s.categories && s.categories[cat]);
  if (!chartSnaps.length) return;

  const labels = chartSnaps.map(s => s.date);
  const getInvested = s => cat === 'all'
    ? Object.values(s.categories||{}).reduce((a,v) => a+(v.invested||0), 0)
    : (s.categories?.[cat]?.invested || 0);
  const getValue = s => cat === 'all'
    ? Object.values(s.categories||{}).reduce((a,v) => a+(v.value||0), 0)
    : (s.categories?.[cat]?.value || 0);

  const invested = chartSnaps.map(s => +getInvested(s).toFixed(2));
  const values   = chartSnaps.map(s => +getValue(s).toFixed(2));
  const pnl      = chartSnaps.map(s => +(getValue(s) - getInvested(s)).toFixed(2));

  // Index portfolio to 100 at first snapshot for benchmark comparison
  const firstVal = getValue(chartSnaps[0]) || 1;
  const portIdx  = chartSnaps.map(s => +(getValue(s) / firstVal * 100).toFixed(2));

  const hasBench = activeBenchmarks.size > 0;

  // When benchmarks active: show ONLY indexed chart so all lines are comparable
  // When no benchmarks: show the £ value chart
  let datasets, yScales;

  if (hasBench) {
    // Single Y axis, everything indexed to 100
    const ctxEl = document.getElementById('portfolioChart');
    const benchGrad = ctxEl ? ctxEl.getContext('2d').createLinearGradient(0, 0, 0, 440) : null;
    if (benchGrad) {
      benchGrad.addColorStop(0, 'rgba(34,197,94,0.2)');
      benchGrad.addColorStop(0.5, 'rgba(34,197,94,0.06)');
      benchGrad.addColorStop(1, 'rgba(34,197,94,0.0)');
    }
    datasets = [
      {
        label: 'Your Portfolio',
        data: portIdx,
        borderColor: '#22c55e',
        backgroundColor: benchGrad || 'rgba(34,197,94,0.08)',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: portIdx.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#22c55e',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#22c55e',
        pointHoverBorderWidth: 2,
        yAxisID: 'y',
      },
    ];
    activeBenchmarks.forEach(bKey => {
      const base = benchmarkValueAt(bKey, labels[0]);
      const bData = labels.map(d => {
        const v = benchmarkValueAt(bKey, d);
        return (v != null && base > 0) ? +(v / base * 100).toFixed(2) : null;
      });
      datasets.push({
        label: BENCHMARK_DATA[bKey].label,
        data: bData,
        borderColor: BENCHMARK_DATA[bKey].color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderDash: [6,3],
        spanGaps: true,
        yAxisID: 'y',
      });
    });
    yScales = {
      x: {
        ticks: { color: 'rgba(255,255,255,0.35)', font: { family: "'Share Tech Mono', monospace", size: 10 }, maxRotation: 0, maxTicksLimit: 8 },
        grid: { display: false },
        border: { color: 'rgba(30,61,45,0.4)' },
      },
      y: {
        position: 'right',
        ticks: { color: 'rgba(255,255,255,0.4)', callback: v => v.toFixed(0), font: { family: "'Share Tech Mono', monospace", size: 11 }, maxTicksLimit: 6 },
        grid: { color: 'rgba(30,61,45,0.25)', drawBorder: false },
        border: { display: false },
        title: { display: true, text: 'Index (100 = start)', color: 'rgba(255,255,255,0.3)', font: { size: 10, family: "'Share Tech Mono', monospace" } },
      },
    };
  } else {
    // Normal £ value chart
    const ctxEl = document.getElementById('portfolioChart');
    const valGrad = ctxEl ? ctxEl.getContext('2d').createLinearGradient(0, 0, 0, 440) : null;
    if (valGrad) {
      const lastV = values[values.length - 1];
      const lastI = invested[invested.length - 1];
      const isProfit = lastV >= lastI;
      if (isProfit) {
        valGrad.addColorStop(0, 'rgba(34,197,94,0.25)');
        valGrad.addColorStop(0.5, 'rgba(34,197,94,0.08)');
        valGrad.addColorStop(1, 'rgba(34,197,94,0.0)');
      } else {
        valGrad.addColorStop(0, 'rgba(239,68,68,0.2)');
        valGrad.addColorStop(0.5, 'rgba(239,68,68,0.06)');
        valGrad.addColorStop(1, 'rgba(239,68,68,0.0)');
      }
    }
    datasets = [
      {
        label: 'Portfolio Value',
        data: values,
        borderColor: '#22c55e',
        backgroundColor: valGrad || 'rgba(34,197,94,0.1)',
        tension: 0.35,
        fill: true,
        pointRadius: values.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#22c55e',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#22c55e',
        pointHoverBorderWidth: 2,
        borderWidth: 2.5,
        yAxisID: 'y',
      },
      {
        label: 'Total Invested',
        data: invested,
        borderColor: 'rgba(232,153,60,0.4)',
        backgroundColor: 'transparent',
        tension: 0.35,
        borderDash: [8,4],
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 1.5,
        yAxisID: 'y',
      },
      {
        label: 'Unrealised P&L',
        data: pnl,
        borderColor: '#e8993c',
        backgroundColor: 'transparent',
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 1.5,
        yAxisID: 'y',
      },
    ];
    yScales = {
      x: {
        ticks: { color: 'rgba(255,255,255,0.35)', font: { family: "'Share Tech Mono', monospace", size: 10 }, maxRotation: 0, maxTicksLimit: 8 },
        grid: { display: false },
        border: { color: 'rgba(30,61,45,0.4)' },
      },
      y: {
        position: 'right',
        ticks: { color: 'rgba(255,255,255,0.4)', callback: v => fmtMoneyLoc(Number(v), 0), font: { family: "'Share Tech Mono', monospace", size: 11 }, maxTicksLimit: 6 },
        grid: { color: 'rgba(30,61,45,0.25)', drawBorder: false },
        border: { display: false },
      },
    };
  }

  // CS2 update event annotations
  const annotations = {};
  if (activeOverlays.has('updates')) {
    CS2_UPDATES.forEach((ev, i) => {
      if (ev.date < labels[0] || ev.date > labels[labels.length-1]) return;
      // Find closest snapshot date
      const closest = labels.reduce((prev, curr) =>
        Math.abs(new Date(curr) - new Date(ev.date)) < Math.abs(new Date(prev) - new Date(ev.date)) ? curr : prev
      );
      annotations[`ev${i}`] = {
        type: 'line',
        xMin: closest, xMax: closest,
        borderColor: ev.color,
        borderWidth: 1.5,
        borderDash: [4, 3],
        label: {
          content: ev.label,
          display: true,
          position: 'start',
          color: '#fff',
          backgroundColor: ev.color,
          font: { size: 9 },
          padding: { x: 4, y: 3 },
          rotation: -90,
        },
      };
    });
  }

  const ctx = document.getElementById('portfolioChart');
  if (!ctx) return;
  if (portfolioChart) portfolioChart.destroy();

  portfolioChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(255,255,255,0.5)',
            usePointStyle: true,
            pointStyleWidth: 16,
            padding: 16,
            font: { size: 10, family: "'Share Tech Mono', monospace" },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(8,12,8,0.95)',
          borderColor: 'rgba(30,61,45,0.6)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: "'Share Tech Mono', monospace", size: 11 },
          bodyFont: { family: "'Share Tech Mono', monospace", size: 12 },
          titleColor: 'rgba(255,255,255,0.6)',
          bodyColor: '#e2e8f0',
          displayColors: false,
          callbacks: {
            label: ctx => {
              const v = Number(ctx.raw);
              if (hasBench) return `${ctx.dataset.label}: ${v.toFixed(1)} (${v >= 100 ? '+' : ''}${(v - 100).toFixed(1)}%)`;
              return `${ctx.dataset.label}: ${fmtMoneyLoc(v, 2)}`;
            },
          },
        },
        annotation: Object.keys(annotations).length ? { annotations } : {},
      },
      scales: yScales,
    },
  });

  // ── Benchmark summary cards ──────────────────────────────────────────────
  const cardsWrap = document.getElementById('benchSummaryCards');
  const cardsGrid = document.getElementById('benchCards');
  if (cardsWrap && cardsGrid) {
    if (!hasBench) {
      cardsWrap.style.display = 'none';
    } else {
      cardsWrap.style.display = 'block';
      // Current period: first to last snapshot
      const firstDate = labels[0];
      const lastDate  = labels[labels.length - 1];
      const portReturn = ((portIdx[portIdx.length - 1] - 100)).toFixed(1);

      const items = [
        {
          key: 'portfolio',
          label: 'Your CS2 Portfolio',
          color: '#00d4aa',
          returnPct: +portReturn,
          current: portIdx[portIdx.length - 1],
        },
      ];
      activeBenchmarks.forEach(bKey => {
        const startVal = benchmarkValueAt(bKey, firstDate);
        const endVal   = benchmarkValueAt(bKey, lastDate);
        const ret = (startVal > 0 && endVal != null) ? ((endVal / startVal - 1) * 100) : 0;
        items.push({
          key: bKey,
          label: BENCHMARK_DATA[bKey].label,
          color: BENCHMARK_DATA[bKey].color,
          returnPct: +ret.toFixed(1),
          current: +endVal.toFixed(1),
        });
      });

      // Sort to find winner
      const winner = [...items].sort((a,b) => b.returnPct - a.returnPct)[0].key;

      cardsGrid.innerHTML = items.map(item => {
        const isWinner = item.key === winner;
        const isPos = item.returnPct >= 0;
        const col = isPos ? 'var(--green)' : 'var(--red)';
        return `<div class="bench-card${isWinner ? ' bench-winner' : ''}" style="--card-color:${item.color};${isWinner ? `border-top:2px solid ${item.color};` : ''}">
          <div class="bench-card-label" style="display:flex;align-items:center;gap:5px;">
            <span style="display:inline-block;width:10px;height:3px;border-radius:99px;background:${item.color};"></span>
            ${item.label}${isWinner ? ' 🏆' : ''}
          </div>
          <div class="bench-card-val" style="color:${col};">${isPos ? '+' : ''}${item.returnPct}%</div>
          <div class="bench-card-sub">${firstDate} → ${lastDate}</div>
        </div>`;
      }).join('');

      // Loudly flag stale/static data instead of failing silently: if any shown
      // benchmark has no live series cached, its line is frozen at the static
      // table's last point (2026-03-14) and the % doesn't reflect the range.
      const liveSeries = loadBenchCache()?.series || {};
      const staleKeys = [...activeBenchmarks].filter(k => !(liveSeries[k] && liveSeries[k].length));
      if (staleKeys.length) {
        cardsGrid.innerHTML += `<div style="grid-column:1/-1;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--accent);padding:6px 2px 0;">
          ⚠ Live data unavailable for ${staleKeys.map(k => BENCHMARK_DATA[k].label).join(', ')} — showing static data (ends 2026-03-14). Check DevTools console for [Benchmarks] errors.
        </div>`;
      }
    }
  }

  // ── Snapshot table ───────────────────────────────────────────────────────
  const tbody = document.getElementById('snapshotTable');
  if (!tbody) return;
  tbody.innerHTML = [...chartSnaps].reverse().map(s => {
    const inv = getInvested(s), val = getValue(s), p = val - inv;
    const roi = inv > 0 ? ((val - inv) / inv * 100).toFixed(1) : '0.0';
    const pnlClass = p >= 0 ? 'color:#00d4aa' : 'color:#ef4444';
    // Pre-v3.6.3 auto snapshots (no createdAt stamp) may have been backdated by
    // the old backfill bug. Ones near a historical point were auto-deleted; the
    // rest can't be classified automatically, so flag them for manual review.
    const unverified = s.source === 'auto' && !s.createdAt;
    const tag = s.source === 'historical' ? 'HIST' : s.source === 'auto' ? (unverified ? 'AUTO ⚠' : 'AUTO') : 'MANUAL';
    const tagTitle = unverified ? ' title="Created by a pre-v3.6.3 build — the old auto-snapshot code could backdate today\'s values onto this date. If these figures look wrong for this date, delete the row."' : '';
    const tagStyle = unverified ? 'color:var(--accent);opacity:0.9' : 'opacity:0.5';
    const delBtn = s.source !== 'historical'
      ? `<button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${s.date}')">✕</button>` : '—';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);">${s.date} <span style="font-size:9px;${tagStyle}"${tagTitle}>${tag}</span></td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;">${fmtMoneyLoc(inv, 2)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;">${fmtMoneyLoc(val, 2)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;${pnlClass}">${p>=0?'▲':'▼'} ${fmtMoneyLoc(Math.abs(p), 2)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;${pnlClass}">${roi}%</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;">${delBtn}</td>
    </tr>`;
  }).join('');
}

// ========================
// PLAY SKINS
// ========================
const SKINS_KEY = 'cs2vault_skins';
function loadSkins() { try { return JSON.parse(window._store[SKINS_KEY]) || null; } catch { return null; } }
function saveSkins(d) { window._storeSet(SKINS_KEY, JSON.stringify(d)); }

const DEFAULT_SKINS = [
  {id:'skin001',name:'Karambit Tiger Tooth (FN)',      type:'knife', qty:1,buyPrice:1295.95,marketHash:'★ Karambit | Tiger Tooth (Factory New)',       prices:null},
  {id:'skin002',name:'M4A4 ASIIMOV (FT)',              type:'skin',  qty:1,buyPrice:267.09, marketHash:'M4A4 | Asiimov (Field-Tested)',                prices:null},
  {id:'skin003',name:'GLOCK-18 AXIA (MW)',             type:'skin',  qty:1,buyPrice:71.00,  marketHash:'Glock-18 | Axia (Minimal Wear)',               prices:null},
  {id:'skin004',name:'TEC-9 FUEL INJECTOR (MW)',       type:'skin',  qty:1,buyPrice:7.73,   marketHash:'Tec-9 | Fuel Injector (Minimal Wear)',         prices:null},
  {id:'skin005',name:'UMP-45 GOLD BISMUTH (FN)',       type:'skin',  qty:1,buyPrice:18.08,  marketHash:'UMP-45 | Gold Bismuth (Factory New)',          prices:null},
  {id:'skin006',name:'SPORTS GLOVES OMEGA (MW)',       type:'knife', qty:1,buyPrice:817.13, marketHash:'★ Sport Gloves | Omega (Minimal Wear)',        prices:null},
  {id:'skin007',name:'USP-S BLACK LOTUS (FN)',         type:'skin',  qty:1,buyPrice:19.99,  marketHash:'USP-S | Black Lotus (Factory New)',            prices:null},
  {id:'skin008',name:'GALIL AR RAINBOW SPOON (FN)',    type:'skin',  qty:1,buyPrice:67.23,  marketHash:'Galil AR | Rainbow Spoon (Factory New)',       prices:null},
  {id:'skin009',name:'MAC-10 STALKER (BS)',            type:'skin',  qty:1,buyPrice:27.14,  marketHash:'MAC-10 | Stalker (Battle-Scarred)',            prices:null},
  {id:'skin010',name:'Number K',                       type:'agent', qty:1,buyPrice:64.64,  marketHash:'Number K | The Professionals',                prices:null},
  {id:'skin011',name:'DESERT EAGLE STARCADE (FN)',     type:'skin',  qty:1,buyPrice:300.24, marketHash:'Desert Eagle | Starcade (Factory New)',        prices:null},
];

// NOTE: skins is initialised in initApp() after initStore() completes,
// so window._store is populated before we read from it.
let skins = [];

function renderSkins() {
  const tbody = document.getElementById('skinsBody');
  if (!tbody) return;
  const fmt = v => v != null ? `${fmtMoney(Number(v), 2)}` : '<span class="price-loading">—</span>';
  tbody.innerHTML = skins.map(item => {
    const p = item.prices || {};
    const best = getBestPrice(item);
    const pnl = best != null ? (best - item.buyPrice) * item.qty : null;
    const pnlPct = (best != null && item.buyPrice > 0) ? ((best - item.buyPrice) / item.buyPrice * 100) : null;
    const pnlHtml = pnl != null
      ? `<span class="pnl-pill ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pnl >= 0 ? '▲' : '▼'} ${fmtMoney(Math.abs(pnl), 2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>`
      : '<span class="price-loading">—</span>';
    const ago = p.fetchedAt ? timeAgo(p.fetchedAt) : 'Never';
    return `<tr data-id="${item.id}">
      <td><div class="item-name">${escHtml(item.name)}<small>${item.marketHash}</small></div></td>
      <td class="mono">${item.qty}</td>
      <td class="mono">${fmtMoney(Number(item.buyPrice), 2)}</td>
      <td class="mono">${fmtMoney((item.buyPrice * item.qty), 2)}</td>
      ${renderPriceColumns(item, p, ago)}
      <td>${pnlHtml}</td>
      <td><div class="action-btns row-actions">
        <button class="btn btn-secondary btn-sm" onclick="refreshSingleSkin('${item.id}')">↻</button>
        <button class="btn btn-secondary btn-sm" onclick="openEditSkinModal('${item.id}')">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="openSellSkinModal('${item.id}')">✓ Sell</button>
        <button class="btn btn-secondary btn-sm" onclick="deleteSkin('${item.id}')">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// Atomic merge-back shared by manual + auto skin refreshes:
// re-sync against storage in case a sale removed an item mid-refresh,
// then merge this item's fresh prices back in without resurrecting sold items.
function mergeSkinPrices(skin, prices, deferSave) {
  if (prices) {
    skin.prices = prices;
    recordPrice(skin, skin.prices);
  }
  const _live = loadSkins() || skins;
  if (_live.some(s => s.id === skin.id)) {
    skins = _live.map(s => s.id === skin.id ? { ...s, prices: skin.prices } : s);
    // deferSave: bulk refresh lanes save once at the end instead of per item
    // (every save rewrites the whole store file)
    if (!deferSave) saveSkins(skins);
  } else {
    skins = _live;
  }
  renderSkins();
}

async function refreshSkinPrices() {
  if (_refreshBusy) { toast('A refresh is already running', 'info'); return; }
  const btn = document.getElementById('refreshSkinsBtn');
  const status = document.getElementById('skinsStatus');

  // Staleness skip — same rule as holdings: <30 min old is skipped, unless everything is fresh
  let work = skins.filter(s => !isPriceFresh(s));
  let skippedFresh = skins.length - work.length;
  if (work.length === 0 && skins.length > 0) { work = skins.slice(); skippedFresh = 0; }

  _refreshBusy = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Fetching...';
  btn.disabled = true;

  let res = { updated: 0, failed: 0, noHash: 0 };
  beginPriceLogBatch();
  try {
    res = await runTwoLaneRefresh(work, {
      onProgress: (done, total) => { status.textContent = `Fetching ${done}/${total}...`; },
      onItemDone: (skin, prices) => mergeSkinPrices(skin, prices, true),
    });
  } finally {
    _refreshBusy = false;
    saveSkins(skins);
    flushPriceLogBatch();
    btn.innerHTML = '↻ Refresh Skin Prices';
    btn.disabled = false;
  }
  const skipNote = skippedFresh > 0 ? `, ${skippedFresh} skipped (<30m fresh)` : '';
  status.textContent = `Last updated: just now — ${res.updated} updated, ${res.failed + res.noHash} failed${skipNote}`;
  if (res.updated > 0) toast(`Skins updated: ${res.updated}`, 'success');
}

async function refreshSingleSkin(id) {
  const skin = skins.find(s => s.id === id);
  if (!skin) return;
  const multi = await fetchAllPlatformPrices(skin);
  if (multi) {
    const allLowest = [multi.csfloat?.lowest, multi.steam?.lowest].filter(v => v != null && v > 0);
    const allLastSold = [multi.csfloat?.lastSold, multi.steam?.lastSold].filter(v => v != null && v > 0);
    const allAvg = [multi.csfloat?.avg7d].filter(v => v != null && v > 0);
    skin.prices = {
      lowest: allLowest.length ? Math.min(...allLowest) : null,
      lastSold: allLastSold.length ? Math.min(...allLastSold) : null,
      avg7d: allAvg.length ? allAvg[0] : null,
      source: 'multi',
      platforms: multi,
      fetchedAt: Date.now()
    };
    toast(`Updated: ${skin.name}`, 'success');
    recordPrice(skin, skin.prices);
  } else toast(`Failed: ${skin.name}`, 'error');
  // Re-sync against storage so a skin sold while this single refresh was in
  // flight is not written back. Only persist if the item still exists.
  const _live = loadSkins() || skins;
  if (_live.some(s => s.id === skin.id)) {
    skins = _live.map(s => s.id === skin.id ? { ...s, prices: skin.prices } : s);
    saveSkins(skins);
  } else {
    skins = _live;
  }
  renderSkins();
}

function openAddSkinModal() {
  document.getElementById('skinModalTitle').innerHTML = 'Add <span>Play Skin</span>';
  document.getElementById('skinEditId').value = '';
  document.getElementById('skinName').value = '';
  document.getElementById('skinMarketHash').value = '';
  document.getElementById('skinType').value = 'skin';
  document.getElementById('skinQty').value = '1';
  document.getElementById('skinBuyPrice').value = '';
  const scc = document.getElementById('skinBuyCcy');
  if (scc) scc.value = getDisplayCurrency();
  openModal('skinModal');
}

function openEditSkinModal(id) {
  const skin = skins.find(s => s.id === id);
  if (!skin) return;
  document.getElementById('skinModalTitle').innerHTML = 'Edit <span>Play Skin</span>';
  document.getElementById('skinEditId').value = id;
  document.getElementById('skinName').value = skin.name;
  document.getElementById('skinType').value = skin.type || 'skin';
  document.getElementById('skinQty').value = skin.qty;
  const scc2 = document.getElementById('skinBuyCcy');
  if (skin.origCurrency && skin.origCurrency !== 'GBP' && skin.origAmount != null) {
    document.getElementById('skinBuyPrice').value = skin.origAmount;
    if (scc2) scc2.value = skin.origCurrency;
  } else {
    document.getElementById('skinBuyPrice').value = skin.buyPrice;
    if (scc2) scc2.value = 'GBP';
  }
  document.getElementById('skinMarketHash').value = skin.marketHash || '';
  openModal('skinModal');
}

async function saveSkin() {
  const name = document.getElementById('skinName').value.trim();
  const buyPriceEntered = parseFloat(document.getElementById('skinBuyPrice').value);
  const marketHash = document.getElementById('skinMarketHash').value.trim();
  if (!name || isNaN(buyPriceEntered) || buyPriceEntered <= 0) { toast('Fill in Name and Buy Price', 'error'); return; }
  const ccy = (document.getElementById('skinBuyCcy') || {}).value || 'GBP';
  const fx = await toBaseGBP(buyPriceEntered, ccy, todayStr());
  if (!fx) { toast('FX rate unavailable for ' + ccy + ' — skin not saved', 'error'); return; }
  const obj = {
    name, type: document.getElementById('skinType').value,
    qty: parseInt(document.getElementById('skinQty').value) || 1,
    buyPrice: +fx.base.toFixed(6), origCurrency: ccy, origAmount: buyPriceEntered, fxRate: fx.fxRate,
    marketHash
  };
  const editId = document.getElementById('skinEditId').value;
  // Re-read storage to stay safe against a concurrent price refresh.
  const live = loadSkins() || skins;
  if (editId) {
    const before = _logSnapshot(live.find(s => s.id === editId));
    skins = live.map(s => s.id === editId ? { ...s, ...obj } : s);
    const after = _logSnapshot(skins.find(s => s.id === editId));
    const diff = _logDiff(before, after);
    if (diff.length) logActivity('edit', 'skin', after, diff);
  } else {
    const newSkin = { id: uid(), ...obj, prices: null };
    skins = [...live, newSkin];
    logActivity('add', 'skin', _logSnapshot(newSkin), null);
  }
  saveSkins(skins); renderSkins(); updateStats(); closeModal('skinModal');
  toast(editId ? 'Play skin updated' : 'Play skin added!', 'success');
}

function deleteSkin(id) {
  const skin = skins.find(s => s.id === id);
  if (!skin) return;
  if (!confirm(`Delete "${skin.name}" from Play Skins? This does not record a sale.`)) return;
  const live = loadSkins() || skins;
  const removed = live.find(s => s.id === id);
  skins = live.filter(s => s.id !== id);
  saveSkins(skins); renderSkins(); updateStats();
  if (removed) logActivity('delete', 'skin', _logSnapshot(removed), null);
  toast('Play skin deleted', 'success');
}

function openSellSkinModal(id) {
  const skin = skins.find(s => s.id === id);
  if (!skin) return;
  // Reuse the main sell modal but track that it's a skin sale
  document.getElementById('sellItemId').value = 'skin:' + id;
  document.getElementById('sellItemName').value = skin.name + ' (Play Skin)';
  document.getElementById('sellQty').value = skin.qty;
  document.getElementById('sellQty').max = skin.qty;
  document.getElementById('sellPrice').value = getBestPrice(skin) ? (getBestPrice(skin) * _displayRate).toFixed(2) : '';
  document.getElementById('sellDate').value = todayStr();
  document.getElementById('sellTotalReceived').value = '';
  document.getElementById('sellReverseCalc').style.display = 'none';
  const scEl2 = document.getElementById('sellCcy');
  if (scEl2) scEl2.value = getDisplayCurrency();
  setSellPlatform('csfloat');
  setSellMode('perunit');
  onSellCcyChange();
  openModal('sellModal');
}

// Override confirmSell to handle both holdings and skins
const _originalConfirmSell = confirmSell;
confirmSell = async function() {
  const rawId = document.getElementById('sellItemId').value;
  if (rawId.startsWith('skin:')) {
    const skinId = rawId.replace('skin:', '');
    const skin = skins.find(s => s.id === skinId);
    if (!skin) return;
    const qty = parseInt(document.getElementById('sellQty').value) || 1;
    const sellPriceEntered = parseFloat(document.getElementById('sellPrice').value);
    const feePercent = _sellFeePercent;
    if (!sellPriceEntered || sellPriceEntered <= 0) { toast('Enter a sell price or total received', 'error'); return; }
    if (qty > skin.qty) { toast(`Only ${skin.qty} in stock`, 'error'); return; }
    const sellDate = document.getElementById('sellDate').value;
    const fx = await resolveSellFx(sellDate);
    if (!fx) return;
    const sellPrice = +(sellPriceEntered * fx.fxRate).toFixed(6); // base GBP
    const _buyPrice = skin.buyPrice;
    const _gross = sellPrice * qty;
    const _feeAmount = _gross * (feePercent / 100);
    const _netRealised = _gross - _feeAmount;
    tradeHistory.push({ id: uid(), name: skin.name, type: skin.type || 'skin', qty, buyPrice: _buyPrice, sellPrice, sellDate, feePercent, platform: _currentSellPlatform, gross: _gross, feeAmount: _feeAmount, netRealised: _netRealised, origCurrency: fx.ccy, origAmount: sellPriceEntered, fxRate: fx.fxRate });
    saveHistory(tradeHistory);
    // Atomic update: re-read the canonical array from storage, mutate, write back.
    // Prevents a concurrent price-refresh loop from re-persisting a stale array
    // that still contains this just-sold skin.
    const _stored = loadSkins() || skins;
    let _next = _stored.map(s => ({ ...s }));
    const _target = _next.find(s => s.id === skinId);
    if (_target) {
      if (qty >= _target.qty) _next = _next.filter(s => s.id !== skinId);
      else _target.qty -= qty;
    }
    skins = _next;
    saveSkins(skins); renderSkins(); renderHistory(); updateStats(); closeModal('sellModal');
    const net = (sellPrice * qty) * (1 - feePercent/100) - (_buyPrice * qty);
    toast(`Sold! Net: ${net >= 0 ? '+' : ''}${fmtGBP(net, 2)}`, net >= 0 ? 'success' : 'info');
  } else {
    _originalConfirmSell();
  }
};
// ========================
let heatmapVisible = false;
let lastPriceSnapshot = {};

function toggleHeatmap() {
  heatmapVisible = !heatmapVisible;
  document.getElementById('heatmapWrap').style.display = heatmapVisible ? 'block' : 'none';
  document.getElementById('heatmapToggleBtn').textContent = heatmapVisible ? '⊞ Hide Heatmap' : '⊞ Show Heatmap';
  if (heatmapVisible) renderHeatmap();
}

function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;
  const items = holdings.filter(h => getBestPrice(h) != null);
  if (!items.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:13px;">Refresh prices to see heatmap</p>'; return; }
  grid.innerHTML = items.map(h => {
    const pct = (getBestPrice(h) - h.buyPrice) / h.buyPrice * 100;
    const cls = pct >= 10 ? 'heat-hot' : pct >= 0 ? 'heat-warm' : pct >= -10 ? 'heat-cold' : 'heat-freeze';
    const col = pct >= 0 ? 'var(--green)' : 'var(--red)';
    const prev = lastPriceSnapshot[h.id];
    const cur = getBestPrice(h);
    let deltaHtml = '';
    if (prev != null && cur != null) {
      const d = ((cur - prev) / prev * 100);
      if (Math.abs(d) > 0.1) deltaHtml = `<span class="price-delta ${d>0?'up':'down'}">${d>0?'▲':'▼'}${Math.abs(d).toFixed(1)}%</span>`;
    }
    return `<div class="heat-card ${cls}" title="${escHtml(h.name)}">
      <div class="heat-name">${escHtml(h.name.slice(0,22))}</div>
      <div class="heat-pct" style="color:${col}">${pct>=0?'+':''}${pct.toFixed(1)}% ${deltaHtml}</div>
      <div class="heat-sub">${fmtMoney(getBestPrice(h), 2)} · qty ${h.qty}</div>
    </div>`;
  }).join('');
}

function captureHeatmapSnapshot() {
  holdings.forEach(h => { const p = getBestPrice(h); if (p != null) lastPriceSnapshot[h.id] = p; });
}

// ========================
// WATCHLIST
// ========================
const WATCH_KEY = 'cs2vault_watchlist';
function loadWatchlist() { try { return JSON.parse(window._store[WATCH_KEY]) || []; } catch { return []; } }
function saveWatchlist(d) { window._storeSet(WATCH_KEY, JSON.stringify(d)); }

function openAddWatchModal() {
  ['watchName','watchHash','watchNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('watchTarget').value = '';
  openModal('watchModal');
}

function saveWatchItem() {
  const name = document.getElementById('watchName').value.trim();
  const hash = document.getElementById('watchHash').value.trim();
  if (!name) { toast('Enter an item name', 'error'); return; }
  const list = loadWatchlist();
  list.push({ id: 'w' + Date.now(), name, marketHash: hash, targetPrice: parseFloat(document.getElementById('watchTarget').value) || null, notes: document.getElementById('watchNotes').value.trim(), prices: null });
  saveWatchlist(list);
  closeModal('watchModal');
  renderWatchlist();
  toast('Added to watchlist', 'success');
}

function deleteWatchItem(id) {
  saveWatchlist(loadWatchlist().filter(w => w.id !== id));
  renderWatchlist();
}

async function refreshWatchlistPrices() {
  const list = loadWatchlist();
  for (const item of list) {
    if (!item.marketHash) continue;
    const prices = await fetchCSFloatPrices(item.marketHash, item.name);
    if (prices) item.prices = { ...prices, fetchedAt: Date.now() };
    await sleep(3000);
  }
  saveWatchlist(list);
  renderWatchlist();
}

function renderWatchlist() {
  const list = loadWatchlist();
  const empty = document.getElementById('watchlistEmpty');
  const container = document.getElementById('watchlistList');
  if (!container) return;
  if (!list.length) { if (empty) empty.style.display = 'block'; container.innerHTML = ''; return; }
  if (empty) empty.style.display = 'none';
  container.innerHTML = list.map(item => {
    const p = item.prices || {};
    const price = p.lowest || p.lastSold || p.avg7d || null;
    const isAlert = item.targetPrice && price != null && price <= item.targetPrice;
    const priceHtml = price ? `${fmtMoney(price, 2)}` : '<span style="color:var(--text3);">No price</span>';
    const targetHtml = item.targetPrice ? `<span style="font-size:11px;color:var(--text3);">Target: ${fmtMoney(item.targetPrice, 2)}</span>` : '';
    const alertHtml = isAlert ? `<span style="color:var(--green);font-size:11px;font-weight:700;"> ✓ BELOW TARGET!</span>` : '';
    const ago = p.fetchedAt ? timeAgo(p.fetchedAt) : 'Never fetched';
    return `<div class="watchlist-card" style="${isAlert ? 'border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.04);' : ''}">
      <div>
        <div style="font-weight:600;font-size:13px;">${escHtml(item.name)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;">${item.marketHash || 'No market hash'} ${item.notes ? '· ' + escHtml(item.notes) : ''}</div>
      </div>
      <div style="text-align:right;">${targetHtml}${alertHtml}<div style="font-size:10px;color:var(--text3);margin-top:2px;">${ago}</div></div>
      <div style="text-align:right;"><div style="font-family:'Share Tech Mono',monospace;font-size:15px;font-weight:700;">${priceHtml}</div><div style="font-size:10px;color:var(--text3);">lowest listed</div></div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-sm" onclick="refreshWatchSingle('${item.id}')">↻</button>
        <button class="btn btn-danger btn-sm" onclick="deleteWatchItem('${item.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function refreshWatchSingle(id) {
  const list = loadWatchlist();
  const item = list.find(w => w.id === id);
  if (!item || !item.marketHash) { toast('No market hash set', 'error'); return; }
  const prices = await fetchCSFloatPrices(item.marketHash, item.name);
  if (prices) { item.prices = { ...prices, fetchedAt: Date.now() }; toast('Updated: ' + item.name, 'success'); }
  else toast('Failed: ' + item.name, 'error');
  saveWatchlist(list);
  renderWatchlist();
}

// ========================
// BULK SELL CALCULATOR
// ========================
function openBulkSellModal() {
  const tbody = document.getElementById('bulkSellBody');
  tbody.innerHTML = holdings.map(h => {
    const suggest = getBestPrice(h) ? getBestPrice(h).toFixed(2) : '';
    return `<tr>
      <td style="padding:7px 10px;"><input type="checkbox" class="bulk-sel" data-id="${h.id}" onchange="calcBulkSell()"></td>
      <td style="padding:7px 10px;font-size:12px;">${escHtml(h.name.slice(0,35))}</td>
      <td style="padding:7px 10px;text-align:right;font-family:'Share Tech Mono',monospace;">${h.qty}</td>
      <td style="padding:7px 10px;"><input type="number" class="bulk-item-price" data-id="${h.id}" data-buy="${h.buyPrice}" data-qty="${h.qty}" step="0.01" value="${suggest}" style="width:90px;background:var(--surface2);border:1px solid var(--border2);border-radius:4px;padding:4px 8px;color:var(--text);font-family:'Share Tech Mono',monospace;font-size:12px;" oninput="calcBulkSell()"></td>
      <td style="padding:7px 10px;text-align:right;font-family:'Share Tech Mono',monospace;font-size:12px;" class="bulk-item-net">—</td>
    </tr>`;
  }).join('');
  calcBulkSell();
  openModal('bulkSellModal');
}

function bulkSelectAll(checked) {
  document.querySelectorAll('.bulk-sel').forEach(cb => { cb.checked = checked; });
  calcBulkSell();
}

function calcBulkSell() {
  const defaultPrice = parseFloat(document.getElementById('bulkSellPrice').value) || 0;
  const feeP = parseFloat(document.getElementById('bulkFee').value) || 2;
  let gross = 0, fees = 0, net = 0;
  document.querySelectorAll('.bulk-sel').forEach(cb => {
    const row = cb.closest('tr');
    const priceInput = row.querySelector('.bulk-item-price');
    const netCell = row.querySelector('.bulk-item-net');
    const buy = parseFloat(priceInput.dataset.buy);
    const qty = parseInt(priceInput.dataset.qty);
    const sellP = parseFloat(priceInput.value) || defaultPrice;
    if (cb.checked && sellP > 0) {
      const g = sellP * qty, f = g * (feeP/100), n = g - f - (buy * qty);
      gross += g; fees += f; net += n;
      netCell.textContent = (n >= 0 ? '+' : '') + fmtGBP(n, 2);
      netCell.style.color = n >= 0 ? 'var(--green)' : 'var(--red)';
    } else { netCell.textContent = '—'; netCell.style.color = ''; }
  });
  document.getElementById('bulkGross').textContent = fmtGBP(gross, 2);
  document.getElementById('bulkFees').textContent = '-' + fmtGBP(fees, 2);
  const netEl = document.getElementById('bulkNet');
  netEl.textContent = (net >= 0 ? '+' : '') + fmtGBP(net, 2);
  netEl.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
}

// ========================
// MONTHLY P&L EXPORT
// ========================
function getMonthlyData() {
  const monthly = {};
  tradeHistory.forEach(t => {
    const m = t.sellDate ? t.sellDate.slice(0,7) : 'Unknown';
    if (!monthly[m]) monthly[m] = { profit:0, revenue:0, fees:0, trades:0 };
    const gross = t.sellPrice * t.qty, fee = gross * (t.feePercent/100);
    monthly[m].revenue += gross;
    monthly[m].fees += fee;
    monthly[m].profit += gross - fee - (t.buyPrice * t.qty);
    monthly[m].trades++;
  });
  return monthly;
}

async function exportMonthlyCSV() {
  const monthly = getMonthlyData();
  const rows = [['Month','Trades','Gross Revenue','Fees','Net Profit']];
  Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([m,d]) => {
    rows.push([m, d.trades, d.revenue.toFixed(2), d.fees.toFixed(2), d.profit.toFixed(2)]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const result = await window.cs2vault.exportSave('cs2vault-monthly-pnl.csv', csv);
  if (result.saved) toast(`Saved to ${result.filePath}`, 'success');
}

function exportMonthlyPDF() {
  const monthly = getMonthlyData();
  let totalProfit = 0, totalTrades = 0;
  Object.values(monthly).forEach(d => { totalProfit += d.profit; totalTrades += d.trades; });
  const rows = Object.entries(monthly).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,d]) =>
    `<tr><td>${m}</td><td>${d.trades}</td><td>${fmtGBP(d.revenue, 2)}</td><td>${fmtGBP(d.fees, 2)}</td><td style="color:${d.profit>=0?'#22c55e':'#ef4444'};font-weight:700;">${d.profit>=0?'+':''}${fmtGBP(d.profit, 2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#1a202c;}h1{color:#f97316;margin-bottom:4px;}h2{color:#64748b;font-size:14px;font-weight:normal;margin-bottom:24px;}table{width:100%;border-collapse:collapse;}th{background:#f1f5f9;padding:10px 14px;text-align:left;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;}td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;}.total{font-weight:700;background:#f8fafc;}.summary{display:flex;gap:24px;margin-bottom:28px;}.sum-card{background:#f8fafc;border-radius:8px;padding:14px 20px;flex:1;}.sum-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}.sum-val{font-size:22px;font-weight:700;color:#1a202c;}</style></head><body>
  <h1>CS2 VAULT — Monthly P&L Report</h1>
  <h2>Generated: ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</h2>
  <div class="summary">
    <div class="sum-card"><div class="sum-label">Total Trades</div><div class="sum-val">${totalTrades}</div></div>
    <div class="sum-card"><div class="sum-label">Total Realised Profit</div><div class="sum-val" style="color:${totalProfit>=0?'#22c55e':'#ef4444'}">${totalProfit>=0?'+':''}${fmtGBP(totalProfit, 2)}</div></div>
  </div>
  <table><thead><tr><th>Month</th><th>Trades</th><th>Gross Revenue</th><th>Fees</th><th>Net Profit</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
  // In Electron, open PDF as a new window via data URL
  const blob = new Blob([html], {type: 'text/html'});
  const url  = URL.createObjectURL(blob);
  const pdfWin = window.open(url, '_blank', 'width=900,height=700,scrollbars=yes');
  if (pdfWin) setTimeout(() => { pdfWin.print(); URL.revokeObjectURL(url); }, 600);
  else { toast('Could not open print window', 'error'); }
}

// ========================
// TABS, FILTER, SORT, EXPORT
// ========================

// ======================== CASE INTELLIGENCE ENGINE ========================
// v2.5.0: score rebuilt on signals the app actually measures (supply snapshots,
// own price log, factual discontinuation dates). Hardcoded ATLs and estimated
// unbox-rate tables removed — they were static guesses, not live data.

// Drop-pool status per case (v2.8.0) — hardcoded, verified June 2026.
// Valve removed the Rare Drop Pool entirely on 17 Dec 2025: every former
// rare-pool case no longer drops AT ALL — supply is permanently capped.
// 'armory' = still purchasable in-game via Armory Stars (supply still growing).
// 'rare' kept as a supported status in case Valve ever reinstates the pool.
const CASE_INTEL_DATA = {
  'Clutch Case':               { released:'2018-02-15', discontinued:'2018-11-08', pool:'discontinued' },
  'Prisma Case':               { released:'2019-03-14', discontinued:'2019-11-18', pool:'discontinued' },
  'Prisma 2 Case':             { released:'2020-03-31', discontinued:'2020-09-23', pool:'discontinued' },
  'Snakebite Case':            { released:'2021-05-03', discontinued:'2022-07-01', pool:'discontinued' },
  'Horizon Case':              { released:'2018-11-08', discontinued:'2019-03-14', pool:'discontinued' },
  'Danger Zone Case':          { released:'2018-12-06', discontinued:'2019-03-14', pool:'discontinued' },
  'Revolver Case':             { released:'2015-12-08', discontinued:'2016-06-15', pool:'discontinued' },
  'Fracture Case':             { released:'2020-08-06', discontinued:'2021-05-03', pool:'discontinued' },
  'Falchion Case':             { released:'2015-05-26', discontinued:'2015-09-17', pool:'discontinued' },
  // Recoil was in the ACTIVE drop pool until the Dead Hand Terminal release —
  // date corrected from 2023-10-10 (sourced: 12 Mar 2026 patch discontinued it)
  'Recoil Case':               { released:'2022-07-01', discontinued:'2026-03-12', pool:'discontinued' },
  // Fever is Armory purchase-only — never in the weekly drop pool, but still
  // actively SOLD in-game, so supply is still growing
  'Fever Case':                { released:'2025-01-21', discontinued:null, pool:'armory' },
  // Anubis package no longer purchasable in-game (per Rudi, June 2026) —
  // exact removal date unverified, so Disc. Age scores neutral for it
  'Anubis Collection Package': { released:'2022-11-18', discontinued:null, pool:'discontinued' },
  'CS:GO Weapon Case':         { released:'2013-08-14', discontinued:'2013-11-27', pool:'discontinued' },
};

const DROP_POOL_META = {
  active:       { label:'⚡ ACTIVE DROP',   color:'var(--accent)', border:'var(--accent)', title:'In the current weekly care package pool — new supply entering constantly' },
  rare:         { label:'RARE DROP',        color:'var(--blue)',   border:'var(--blue)',   title:'Rare drop pool — trickle of new supply (~1% of active rates)' },
  armory:       { label:'ARMORY · STILL SOLD', color:'var(--orange)', border:'var(--orange)', title:'Purchasable in-game via Armory Stars — supply still growing' },
  discontinued: { label:'DISCONTINUED',     color:'var(--text3)',  border:'var(--border)', title:'No longer drops or sells in-game — supply permanently capped (Valve removed the entire rare pool 17 Dec 2025)' },
};

function casePool(meta) {
  return meta.pool || (meta.discontinued ? 'discontinued' : 'active');
}

let ciData = null;
let ciRunning = false;

// Lowest price seen in this app's own price log over the trailing window.
// Returns null until there's enough history (3+ points spanning 14+ days).
function getTrailingLow(itemId, days) {
  const log = loadPriceLog();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const entries = log.filter(e => e.id === itemId && e.ts > cutoff && e.best != null).sort((a, b) => a.ts - b.ts);
  if (entries.length < 3) return null;
  const spanDays = (entries[entries.length - 1].ts - entries[0].ts) / (24 * 60 * 60 * 1000);
  if (spanDays < 14) return null;
  return Math.min.apply(null, entries.map(e => e.best));
}

function getPriceMomentum(itemId, days) {
  const log = loadPriceLog();
  const now = Date.now();
  const cutoff = now - (days * 24 * 60 * 60 * 1000);
  const halfCutoff = now - ((days / 2) * 24 * 60 * 60 * 1000);

  const entries = log.filter(e => e.id === itemId && e.ts > cutoff && e.best != null).sort((a, b) => a.ts - b.ts);
  if (entries.length < 2) return null;

  // Use earliest entry in the window as the start price
  const startPrice = entries[0].best;
  const endPrice = entries[entries.length - 1].best;
  if (!startPrice || !endPrice) return null;

  return ((endPrice - startPrice) / startPrice) * 100;
}

function getMonthsDiscontinued(discontinuedStr) {
  if (!discontinuedStr) return 0;
  const disc = new Date(discontinuedStr);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - disc.getFullYear()) * 12 + (now.getMonth() - disc.getMonth()));
}

function getGrade(score) {
  if (score >= 85) return 'S';
  if (score >= 72) return 'A';
  if (score >= 58) return 'B';
  if (score >= 44) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function getGradeClass(grade) {
  return { S:'grade-s', A:'grade-a', B:'grade-b', C:'grade-c', D:'grade-d', F:'grade-f' }[grade] || 'grade-f';
}

function scoreColor(score) {
  if (score >= 80) return '#22c55e';
  if (score >= 65) return '#38bdf8';
  if (score >= 48) return '#fbbf24';
  if (score >= 35) return '#f97316';
  return '#ef4444';
}

function buildRingPath(score) {
  const r = 20, cx = 26, cy = 26;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const color = scoreColor(score);
  return `<svg width="52" height="52" viewBox="0 0 52 52">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="4"
      stroke-dasharray="${progress} ${circumference}" stroke-linecap="round"
      style="filter:drop-shadow(0 0 4px ${color}88)"/>
  </svg>`;
}

async function fetchSteamListings(marketHashName) {
  try {
    const encoded = encodeURIComponent(marketHashName);
    const url = `https://steamcommunity.com/market/search/render/?query=${encoded}&appid=730&norender=1&count=1`;
    const res = await window.cs2vault.fetch(url);
    res.ok = res.status >= 200 && res.status < 300;
    if (!res.ok) return null;
    const data = JSON.parse(res.body);
    if (data.results && data.results.length > 0) {
      return {
        listings: data.results[0].sell_listings || 0,
        lowestPrice: data.results[0].sell_price ? data.results[0].sell_price / 100 : null,
        lowestPriceGBP: data.results[0].sell_price_text || null,
      };
    }
    return null;
  } catch(e) {
    return null;
  }
}

// ============ STEAM MARKET AUTOCOMPLETE (v2.6.0) ============
// Search-as-you-type on the Item Name / Market Hash fields in the add/edit
// modals. Hits Steam's search/render endpoint (same one Case Intel uses),
// shows a dropdown of real market items, and auto-fills the exact
// market_hash_name + name + inferred type on selection.

const steamAcCache = {};   // lowercased query -> results array (session cache)
let steamAcSeq = 0;        // request token to discard stale responses

async function steamMarketSearch(query) {
  const key = query.toLowerCase();
  if (steamAcCache[key]) return steamAcCache[key];
  const url = 'https://steamcommunity.com/market/search/render/?query=' +
    encodeURIComponent(query) + '&appid=730&norender=1&count=10';
  let res;
  try { res = await window.cs2vault.fetch(url); } catch(e) { return null; }
  if (!res || res.status < 200 || res.status >= 300) return null;
  let data;
  try { data = JSON.parse(res.body); } catch(e) { return null; }
  if (!data || !Array.isArray(data.results)) return null;
  const items = data.results.map(function(r) {
    const ad = r.asset_description || {};
    return {
      hash: r.hash_name || r.name || '',
      price: r.sell_price_text || '',
      listings: r.sell_listings || 0,
      icon: ad.icon_url ? ('https://community.fastly.steamstatic.com/economy/image/' + ad.icon_url + '/64fx48f') : null,
      steamType: ad.type || ''
    };
  }).filter(function(it) { return it.hash; });
  steamAcCache[key] = items;
  return items;
}

// Map a Steam result to the modal's type dropdown.
// mode 'holding' -> skin|case|sticker|armory|knife ; mode 'playskin' -> skin|knife|agent
function inferTypeFromSteamResult(item, mode) {
  const t = (item.steamType || '').toLowerCase();
  const h = (item.hash || '').toLowerCase();
  if (t.indexOf('knife') !== -1 || t.indexOf('gloves') !== -1 || h.indexOf('\u2605') !== -1) return 'knife';
  if (t.indexOf('agent') !== -1) return mode === 'playskin' ? 'agent' : 'skin';
  if (mode === 'playskin') return 'skin';
  if (t.indexOf('sticker') !== -1 || h.indexOf('sticker') !== -1 || h.indexOf('capsule') !== -1) return 'sticker';
  if (t.indexOf('container') !== -1 || h.indexOf(' case') !== -1 || h.indexOf('package') !== -1) return 'case';
  if (t.indexOf('charm') !== -1 || t.indexOf('patch') !== -1 || t.indexOf('collectible') !== -1) return 'armory';
  return 'skin';
}

// Attach autocomplete behaviour to one text input.
// opts: { nameInputId, hashInputId, typeSelectId, mode }
function attachSteamAutocomplete(inputId, opts) {
  const input = document.getElementById(inputId);
  if (!input || input._steamAc) return;
  input._steamAc = true;
  input.setAttribute('autocomplete', 'off');

  const row = input.parentNode;          // .form-row
  row.style.position = 'relative';
  const dd = document.createElement('div');
  dd.className = 'steam-ac-dd';
  row.appendChild(dd);

  let results = [];
  let activeIdx = -1;
  let debounceTimer = null;

  function hide() { dd.classList.remove('open'); dd.innerHTML = ''; activeIdx = -1; }

  function applySelection(item) {
    const nameEl = document.getElementById(opts.nameInputId);
    const hashEl = document.getElementById(opts.hashInputId);
    const typeEl = document.getElementById(opts.typeSelectId);
    if (hashEl) hashEl.value = item.hash;
    if (nameEl) nameEl.value = item.hash;
    if (typeEl) {
      const inferred = inferTypeFromSteamResult(item, opts.mode);
      for (let i = 0; i < typeEl.options.length; i++) {
        if (typeEl.options[i].value === inferred) { typeEl.value = inferred; break; }
      }
    }
    hide();
  }

  function render() {
    dd.innerHTML = '';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'steam-ac-empty';
      empty.textContent = 'No Steam market matches';
      dd.appendChild(empty);
      dd.classList.add('open');
      return;
    }
    results.forEach(function(item, idx) {
      const rowEl = document.createElement('div');
      rowEl.className = 'steam-ac-item' + (idx === activeIdx ? ' active' : '');
      if (item.icon) {
        const img = document.createElement('img');
        img.src = item.icon;
        img.loading = 'lazy';
        rowEl.appendChild(img);
      }
      const nm = document.createElement('div');
      nm.className = 'steam-ac-name';
      nm.textContent = item.hash;
      nm.title = item.hash;
      rowEl.appendChild(nm);
      const meta = document.createElement('div');
      meta.className = 'steam-ac-meta';
      meta.textContent = item.price ? item.price : '';
      rowEl.appendChild(meta);
      // mousedown (not click) so it fires before the input's blur hides the dropdown
      rowEl.addEventListener('mousedown', function(e) { e.preventDefault(); applySelection(item); });
      dd.appendChild(rowEl);
    });
    dd.classList.add('open');
  }

  input.addEventListener('input', function() {
    const q = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (q.length < 3) { hide(); return; }
    debounceTimer = setTimeout(async function() {
      const mySeq = ++steamAcSeq;
      const found = await steamMarketSearch(q);
      if (mySeq !== steamAcSeq) return;                 // stale response
      if (document.activeElement !== input) return;     // user moved on
      if (found === null) { hide(); return; }           // network/rate-limit — fail quiet
      results = found;
      activeIdx = -1;
      render();
    }, 450);
  });

  input.addEventListener('keydown', function(e) {
    if (!dd.classList.contains('open')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, results.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && results[activeIdx]) { e.preventDefault(); applySelection(results[activeIdx]); }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      hide();
    }
  });

  input.addEventListener('blur', function() { setTimeout(hide, 150); });
}

function initSteamAutocomplete() {
  // Holdings add/edit modal — both the name and hash fields search
  attachSteamAutocomplete('itemName',       { nameInputId: 'itemName', hashInputId: 'itemMarketHash', typeSelectId: 'itemType', mode: 'holding' });
  attachSteamAutocomplete('itemMarketHash', { nameInputId: 'itemName', hashInputId: 'itemMarketHash', typeSelectId: 'itemType', mode: 'holding' });
  // Play skin modal
  attachSteamAutocomplete('skinName',       { nameInputId: 'skinName', hashInputId: 'skinMarketHash', typeSelectId: 'skinType', mode: 'playskin' });
  attachSteamAutocomplete('skinMarketHash', { nameInputId: 'skinName', hashInputId: 'skinMarketHash', typeSelectId: 'skinType', mode: 'playskin' });
}

async function runCaseIntelligence() {
  if (ciRunning) return;
  ciRunning = true;

  document.getElementById('ciEmpty').style.display = 'none';
  document.getElementById('ciResults').style.display = 'none';
  document.getElementById('ciLoading').style.display = 'block';
  document.getElementById('ciRefreshBtn').disabled = true;
  document.getElementById('ciRefreshBtn').textContent = '⟳ Fetching...';

  const cases = holdings.filter(h => h.type === 'case');
  const results = [];
  const total = cases.length;
  let done = 0;

  for (const c of cases) {
    document.getElementById('ciLoadingText').textContent =
      `Fetching Steam data for ${c.name}... (${done+1}/${total})`;

    const steam = await fetchSteamListings(c.marketHash);
    await new Promise(r => setTimeout(r, 800)); // respectful rate limit

    const meta = CASE_INTEL_DATA[c.name] || {};
    const monthsDisc = getMonthsDiscontinued(meta.discontinued);
    const pool = casePool(meta);
    const isActive = pool === 'active';
    const currentPrice = c.prices?.lowest || c.prices?.lastSold || null;
    const listings = steam?.listings || null;

    // Record supply snapshot for trend tracking
    var supplyPrev = null;
    if (listings !== null && c.marketHash) {
      const prevSnap = getPreviousSupplySnapshot(c.marketHash);
      recordCaseSupplySnapshot(c.marketHash, listings);
      supplyPrev = prevSnap ? prevSnap.count : null;
    }

    // Price momentum from price log
    const momentum7d  = getPriceMomentum(c.id, 7);
    const momentum30d = getPriceMomentum(c.id, 30);

    // Trailing 90-day low from own price log
    const low90 = getTrailingLow(c.id, 90);

    // ---- SCORE COMPONENTS (each 0-100, all from measured data) ----
    // Components without enough history fall back to a neutral 50 and are
    // flagged so the UI can show the score is still building confidence.
    const neutralFlags = [];

    // 1. Supply Trend Score (35%) — shrinking Steam listings = supply being absorbed
    let supplyTrendScore = 50;
    let supplyDeltaPct = null;
    if (listings !== null && supplyPrev !== null && supplyPrev > 0) {
      supplyDeltaPct = ((listings - supplyPrev) / supplyPrev) * 100;
      const d = supplyDeltaPct;
      if (d <= -10)      supplyTrendScore = 95;
      else if (d <= -5)  supplyTrendScore = 85;
      else if (d <= -2)  supplyTrendScore = 72;
      else if (d <= -0.5)supplyTrendScore = 60;
      else if (d < 0.5)  supplyTrendScore = 50;
      else if (d < 2)    supplyTrendScore = 42;
      else if (d < 5)    supplyTrendScore = 30;
      else if (d < 10)   supplyTrendScore = 20;
      else               supplyTrendScore = 10;
    } else {
      neutralFlags.push('supply');
    }

    // 2. Discontinuation Age Score (30%) — factual, from release/removal dates
    //    and drop-pool status (v2.8.0)
    let discScore = 0;
    if (pool === 'active') {
      discScore = 5; // still dropping weekly — supply growing
    } else if (pool === 'armory') {
      discScore = 8; // not in drop pool, but still SOLD in-game — supply growing
    } else if (pool === 'rare') {
      discScore = 40; // trickle supply
    } else if (!meta.discontinued) {
      // Discontinued but removal date unverified — score neutral, flag it
      discScore = 50;
      neutralFlags.push('disc age');
    } else {
      // Sweet spot: 12-48 months discontinued
      if (monthsDisc < 6)        discScore = 30;
      else if (monthsDisc < 12)  discScore = 55;
      else if (monthsDisc < 24)  discScore = 75;
      else if (monthsDisc < 48)  discScore = 88;
      else if (monthsDisc < 72)  discScore = 78; // very old cases plateau
      else                       discScore = 65;
    }

    // 3. Price vs 90-Day Low Score (20%) — measured from this app's price log
    let priceScore = 50;
    let vsLowPct = null;
    if (currentPrice && low90) {
      const ratio = currentPrice / low90;
      vsLowPct = (ratio - 1) * 100;
      if (ratio <= 1.05)      priceScore = 90; // at/near its 90d low
      else if (ratio <= 1.15) priceScore = 78;
      else if (ratio <= 1.30) priceScore = 62;
      else if (ratio <= 1.50) priceScore = 50;
      else if (ratio <= 2.00) priceScore = 35;
      else                    priceScore = 20;
    } else {
      neutralFlags.push('price');
    }

    // 4. 30D Momentum Score (15%) — confirmation that price is moving up
    const momRef = momentum30d !== null ? momentum30d : momentum7d;
    let momentumScore = 50;
    if (momRef !== null) {
      if (momRef >= 10)      momentumScore = 90;
      else if (momRef >= 5)  momentumScore = 78;
      else if (momRef >= 2)  momentumScore = 65;
      else if (momRef > -2)  momentumScore = 50;
      else if (momRef > -5)  momentumScore = 38;
      else if (momRef > -10) momentumScore = 25;
      else                   momentumScore = 12;
    } else {
      neutralFlags.push('momentum');
    }

    // Weighted final score
    const finalScore = Math.round(
      supplyTrendScore * 0.35 +
      discScore        * 0.30 +
      priceScore       * 0.20 +
      momentumScore    * 0.15
    );

    const grade = getGrade(finalScore);

    results.push({
      name: c.name,
      id: c.id,
      score: finalScore,
      grade,
      supplyTrendScore, discScore, priceScore, momentumScore,
      neutralFlags,
      listings, supplyPrev, supplyDeltaPct, currentPrice, low90, vsLowPct,
      monthsDisc, isActive, pool,
      momentum7d, momentum30d,
      qty: c.qty,
      buyPrice: c.buyPrice,
      meta,
    });

    done++;
  }

  results.sort((a, b) => b.score - a.score);
  ciData = results;

  document.getElementById('ciLoading').style.display = 'none';
  document.getElementById('ciLastUpdate').textContent = new Date().toLocaleTimeString('en-GB');
  document.getElementById('ciRefreshBtn').disabled = false;
  document.getElementById('ciRefreshBtn').textContent = '↻ Refresh';

  renderCaseIntelligence(results);
  ciRunning = false;
}

function renderCaseIntelligence(results) {
  document.getElementById('ciResults').style.display = 'block';

  // ---- Summary stats ----
  const avgScore = Math.round(results.reduce((a,r) => a + r.score, 0) / results.length);
  const topCase  = results[0];
  const withTrend = results.filter(r => r.supplyDeltaPct !== null);
  const shrinking = withTrend.filter(r => r.supplyDeltaPct < 0).length;
  const totalListings = results.reduce((a,r) => a + (r.listings || 0), 0);

  document.getElementById('ciSummaryGrid').innerHTML = `
    <div class="ci-stat accent">
      <div class="ci-stat-label">Portfolio Intel Score</div>
      <div class="ci-stat-val" style="color:${scoreColor(avgScore)}">${avgScore}<span style="font-size:16px;color:var(--text3)">/100</span></div>
      <div class="ci-stat-sub">Weighted avg across ${results.length} cases</div>
    </div>
    <div class="ci-stat green">
      <div class="ci-stat-label">Top Rated Case</div>
      <div class="ci-stat-val" style="font-size:18px;color:var(--green)">${topCase.name.replace(' Case','')}</div>
      <div class="ci-stat-sub">Score ${topCase.score}/100 · Grade ${topCase.grade}</div>
    </div>
    <div class="ci-stat blue">
      <div class="ci-stat-label">Supply Shrinking</div>
      <div class="ci-stat-val" style="color:var(--blue)">${withTrend.length ? shrinking + '<span style="font-size:16px;color:var(--text3)">/' + withTrend.length + '</span>' : '—'}</div>
      <div class="ci-stat-sub">${withTrend.length ? 'Cases with falling Steam listings' : 'Builds after a 2nd run on another day'}</div>
    </div>
    <div class="ci-stat purple">
      <div class="ci-stat-label">Total Steam Listings</div>
      <div class="ci-stat-val" style="color:var(--purple);font-size:20px;">${totalListings ? (totalListings/1000000).toFixed(1)+'M' : '—'}</div>
      <div class="ci-stat-sub">Combined supply across your cases</div>
    </div>
  `;

  // ---- Cards ----
  document.getElementById('ciCardsGrid').innerHTML = results.map(r => {
    const bars = [
      { label:'Supply Trend',     val: r.supplyTrendScore, color:'#38bdf8', weight:'35%', neutral: r.neutralFlags.includes('supply') },
      { label:'Disc. Age',        val: r.discScore,        color:'#a78bfa', weight:'30%', neutral: false },
      { label:'Price vs 90D Low', val: r.priceScore,       color:'#22c55e', weight:'20%', neutral: r.neutralFlags.includes('price') },
      { label:'30D Momentum',     val: r.momentumScore,    color:'#f97316', weight:'15%', neutral: r.neutralFlags.includes('momentum') },
    ];

    const listingsStr = r.listings !== null
      ? (r.listings >= 1000000 ? (r.listings/1000000).toFixed(2)+'M' : r.listings >= 1000 ? (r.listings/1000).toFixed(0)+'K' : r.listings.toString())
      : '—';

    // Supply trend vs previous snapshot
    let supplyTrendHtml = '';
    if (r.listings !== null && r.supplyPrev !== null) {
      const delta = r.listings - r.supplyPrev;
      const deltaPct = ((delta / r.supplyPrev) * 100).toFixed(1);
      const deltaStr = delta >= 0 ? '+' + (delta/1000).toFixed(1)+'K' : (delta/1000).toFixed(1)+'K';
      const trendCol = delta <= 0 ? 'var(--green)' : 'var(--red)';
      const arrow = delta <= 0 ? '↓' : '↑';
      supplyTrendHtml = '<span style="color:' + trendCol + ';font-size:10px;margin-left:4px;">' + arrow + ' ' + deltaStr + ' (' + deltaPct + '%)</span>';
    } else if (r.listings !== null) {
      supplyTrendHtml = '<span style="color:var(--text3);font-size:10px;margin-left:4px;">first snapshot</span>';
    }

    // Momentum badges
    function momentumBadge(pct) {
      if (pct === null) return '<span style="color:var(--text3);">—</span>';
      const col = pct >= 0 ? 'var(--green)' : 'var(--red)';
      const sign = pct >= 0 ? '+' : '';
      return '<span style="color:' + col + ';">' + sign + pct.toFixed(1) + '%</span>';
    }

    const holdingsVal = r.qty * (r.currentPrice || r.buyPrice);

    return '<div class="ci-card">' +
      '<div class="ci-card-header">' +
        '<div>' +
          '<div class="ci-case-name">' + r.name + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;">' +
            '<div class="ci-grade-badge ' + getGradeClass(r.grade) + '">' + r.grade + '</div>' +
            (function(){
              var pm = DROP_POOL_META[r.pool] || DROP_POOL_META.discontinued;
              var lbl = pm.label;
              if (r.pool === 'discontinued' && r.monthsDisc > 0) lbl += ' ' + r.monthsDisc + 'MO';
              return '<span title="' + pm.title + '" style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:1px;color:' + pm.color + ';border:1px solid ' + pm.border + ';border-radius:4px;padding:2px 6px;">' + lbl + '</span>';
            })() +
          '</div>' +
        '</div>' +
        '<div class="ci-score-ring">' +
          buildRingPath(r.score) +
          '<div class="ci-score-num" style="color:' + scoreColor(r.score) + '">' + r.score + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ci-card-body">' +
        '<div class="ci-bars">' +
          bars.map(b =>
            '<div class="ci-bar-row">' +
              '<div class="ci-bar-label">' + b.label + ' <span style="opacity:.5">' + b.weight + '</span></div>' +
              '<div class="ci-bar-track"><div class="ci-bar-fill" style="width:' + b.val + '%;background:' + (b.neutral ? 'var(--text3)' : b.color) + ';box-shadow:0 0 6px ' + b.color + '55;' + (b.neutral ? 'opacity:.45;' : '') + '"></div></div>' +
              '<div class="ci-bar-val">' + (b.neutral ? '<span style="color:var(--text3)" title="Not enough data yet — scored neutral">·50</span>' : Math.round(b.val)) + '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
        '<div class="ci-card-metrics">' +
          '<div class="ci-metric">' +
            '<div class="ci-metric-label">Supply</div>' +
            '<div class="ci-metric-val" style="color:var(--blue);font-size:12px;">' + listingsStr + supplyTrendHtml + '</div>' +
          '</div>' +
          '<div class="ci-metric">' +
            '<div class="ci-metric-label">7D</div>' +
            '<div class="ci-metric-val">' + momentumBadge(r.momentum7d) + '</div>' +
          '</div>' +
          '<div class="ci-metric">' +
            '<div class="ci-metric-label">30D</div>' +
            '<div class="ci-metric-val">' + momentumBadge(r.momentum30d) + '</div>' +
          '</div>' +
          '<div class="ci-metric">' +
            '<div class="ci-metric-label">Disc.</div>' +
            '<div class="ci-metric-val" style="color:var(--purple)">' + (r.isActive ? 'Active' : r.monthsDisc + 'mo') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
          '<div class="ci-holdings-chip">◆ ' + r.qty.toLocaleString() + ' held · ' + fmtMoney(holdingsVal, 0) + '</div>' +
          (r.listings === null
            ? '<div class="ci-error-chip">⚠ No Steam data</div>'
            : (r.neutralFlags.length
              ? '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:var(--text3);" title="' + r.neutralFlags.join(', ') + ' scored neutral — data builds with use">◔ ' + (4 - r.neutralFlags.length) + '/4 signals live</div>'
              : '<div style="font-family:\'Share Tech Mono\',monospace;font-size:9px;color:var(--green);">● 4/4 signals live</div>')) +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // ---- Table ----
  document.getElementById('ciTableBody').innerHTML = results.map(r => {
    const listingsStr = r.listings !== null
      ? (r.listings >= 1000000 ? (r.listings/1000000).toFixed(2)+'M' : r.listings >= 1000 ? (r.listings/1000).toFixed(1)+'K' : r.listings.toString())
      : '—';

    // Supply trend cell
    let supplyTrendCell = '—';
    if (r.listings !== null && r.supplyPrev !== null) {
      const delta = r.listings - r.supplyPrev;
      const deltaPct = ((delta / r.supplyPrev) * 100).toFixed(1);
      const arrow = delta <= 0 ? '↓' : '↑';
      const col = delta <= 0 ? 'var(--green)' : 'var(--red)';
      const absDeltaK = (Math.abs(delta)/1000).toFixed(1) + 'K';
      supplyTrendCell = '<span style="color:' + col + ';">' + arrow + ' ' + absDeltaK + ' (' + deltaPct + '%)</span>';
    } else if (r.listings !== null) {
      supplyTrendCell = '<span style="color:var(--text3);font-size:10px;">first snap</span>';
    }

    // Momentum cells
    function momCell(pct) {
      if (pct === null) return '<span style="color:var(--text3);">—</span>';
      const col = pct >= 0 ? 'var(--green)' : 'var(--red)';
      const sign = pct >= 0 ? '+' : '';
      return '<span style="color:' + col + ';">' + sign + pct.toFixed(1) + '%</span>';
    }

    const priceStr = r.currentPrice ? fmtMoney(r.currentPrice, 2) : '—';
    let vsLowCell = '<span style="color:var(--text3);font-size:10px;" title="Needs 3+ price points over 14+ days">building</span>';
    if (r.vsLowPct !== null) {
      const col = r.vsLowPct <= 15 ? 'var(--green)' : r.vsLowPct <= 50 ? 'var(--text2)' : 'var(--red)';
      vsLowCell = '<span style="color:' + col + ';" title="90d low: ' + fmtMoney(r.low90, 2) + '">+' + r.vsLowPct.toFixed(1) + '%</span>';
    }
    const scoreStyle = 'color:' + scoreColor(r.score) + ';font-family:\'Share Tech Mono\',monospace;font-weight:700;';

    var pm = DROP_POOL_META[r.pool] || DROP_POOL_META.discontinued;
    var poolCell = '<span title="' + pm.title + '" style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:1px;color:' + pm.color + ';border:1px solid ' + pm.border + ';border-radius:4px;padding:2px 6px;white-space:nowrap;">' + pm.label + '</span>';
    var monthsCell;
    if (r.pool === 'active') monthsCell = '<span style="color:var(--accent)">Active</span>';
    else if (r.pool === 'armory') monthsCell = '<span style="color:var(--orange)">Still sold</span>';
    else if (r.monthsDisc > 0) monthsCell = r.monthsDisc + ' months';
    else monthsCell = '<span style="color:var(--text3)" title="Discontinued — removal date unverified">unknown</span>';

    return '<tr>' +
      '<td><strong>' + r.name + '</strong></td>' +
      '<td><span style="' + scoreStyle + '">' + r.score + '</span></td>' +
      '<td><span class="ci-grade-badge ' + getGradeClass(r.grade) + '">' + r.grade + '</span></td>' +
      '<td>' + poolCell + '</td>' +
      '<td class="mono">' + listingsStr + '</td>' +
      '<td class="mono">' + supplyTrendCell + '</td>' +
      '<td class="mono">' + momCell(r.momentum7d) + '</td>' +
      '<td class="mono">' + momCell(r.momentum30d) + '</td>' +
      '<td class="mono">' + monthsCell + '</td>' +
      '<td class="mono">' + priceStr + '</td>' +
      '<td class="mono">' + vsLowCell + '</td>' +
      '<td class="mono">' + r.qty.toLocaleString() + '</td>' +
    '</tr>';
  }).join('');
}


// ================================================================
// BUFF163 RATIO
// ================================================================
// Buff163/Steam price ratios — updated periodically
// Higher ratio = item priced similarly on Buff to Steam = healthier cross-market demand
// Lower ratio = Buff prices significantly below Steam = weaker Chinese demand signal
const BUFF_RATIOS = {
  'Clutch Case':             0.48,  // Older case, reasonable Buff demand
  'Prisma Case':             0.46,
  'Prisma 2 Case':           0.45,
  'Snakebite Case':          0.40,  // High supply keeps Buff ratio suppressed
  'Horizon Case':            0.47,
  'Danger Zone Case':        0.46,
  'Revolver Case':           0.58,  // Rarer case, strong Buff demand
  'Fracture Case':           0.42,
  'Falchion Case':           0.54,  // Older/rarer, better Buff ratio
  'Recoil Case':             0.38,  // Very high supply, Buff heavily discounted
  'Fever Case':              0.50,  // Active case, normal ratio
  'Anubis Collection Package':0.56, // Collection package, decent Buff demand
  "CS:GO Weapon Case":       0.65,  // Iconic/rare — strong Buff demand
};
function getBuffHtml(name, steamPrice) {
  const r = BUFF_RATIOS[name];
  if (!r || !steamPrice) return '';
  const buffPrice = (steamPrice * r).toFixed(3);
  const pct = (r * 100).toFixed(0);
  // Buff ratio interpretation:
  // Low ratio (<40%) = Buff price much lower than Steam = Chinese market pricing it lower = bearish signal
  // High ratio (>55%) = Buff close to Steam = strong demand on Buff = bullish signal
  // For INVESTORS: a high Buff/Steam ratio means the item is valued similarly on both markets = healthy
  const cls = r > 0.55 ? 'buff-good' : r > 0.44 ? 'buff-ok' : 'buff-bad';
  const arrow = r > 0.55 ? '▲' : r > 0.44 ? '◆' : '▼';
  const tooltip = `Buff163 ~£${buffPrice} (${pct}% of Steam price)\n` +
    (r > 0.55 ? 'Strong Buff demand — healthy cross-market value' :
     r > 0.44 ? 'Normal Buff/Steam ratio' :
     'Buff priced well below Steam — weak Chinese demand');
  return `<span class="buff-ratio ${cls}" title="${tooltip}">${arrow} Buff ${pct}%</span>`;
}

// ================================================================
// PRICE ALERTS ENGINE
// ================================================================
const ALERTS_KEY = 'cs2vault_alerts';
function loadAlerts() { try { return JSON.parse(window._store[ALERTS_KEY]) || []; } catch { return []; } }
function saveAlerts(d) { window._storeSet(ALERTS_KEY, JSON.stringify(d)); }

function openAddAlertModal() {
  const sel = document.getElementById('alertItemSel');
  if (sel) sel.innerHTML = '<option value="">— select a holding —</option>' +
    holdings.map(h => `<option value="${h.id}">${escHtml(h.name)}</option>`).join('');
  ['alertName','alertHash','alertNote'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  const t = document.getElementById('alertTarget'); if(t) t.value='';
  const d = document.getElementById('alertDir'); if(d) d.value='below';
  openModal('addAlertModal');
}

function prefillAlert(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  const n = document.getElementById('alertName'); if(n) n.value = item.name;
  const h = document.getElementById('alertHash'); if(h) h.value = item.marketHash || item.name;
  if (item.prices) {
    const p = item.prices.lowest || item.prices.lastSold || item.prices.avg7d;
    const t = document.getElementById('alertTarget'); if(t && p) t.value = p.toFixed(3);
  }
}

function saveAlert() {
  const name   = (document.getElementById('alertName')?.value || '').trim();
  const hash   = (document.getElementById('alertHash')?.value || '').trim();
  const target = parseFloat(document.getElementById('alertTarget')?.value);
  const dir    = document.getElementById('alertDir')?.value || 'below';
  const note   = (document.getElementById('alertNote')?.value || '').trim();
  if (!name) { toast('Enter item name', 'error'); return; }
  if (isNaN(target) || target <= 0) { toast('Enter a valid target price', 'error'); return; }
  const alerts = loadAlerts();
  alerts.push({ id:'al'+Date.now(), name, marketHash:hash, targetPrice:target, direction:dir, note,
    currentPrice:null, triggered:false, triggeredAt:null, lastChecked:null, createdAt:new Date().toISOString() });
  saveAlerts(alerts);
  closeModal('addAlertModal');
  renderAlerts();
  toast('Alert saved!', 'success');
}

function deleteAlert(id) { saveAlerts(loadAlerts().filter(a => a.id !== id)); renderAlerts(); }

function clearTriggeredAlerts() {
  saveAlerts(loadAlerts().map(a => ({ ...a, triggered:false, triggeredAt:null })));
  renderAlerts();
  toast('Triggered alerts cleared', 'info');
}

function checkAlertsAgainstHoldings() {
  const alerts = loadAlerts();
  if (!alerts.length) return;
  let hits = 0;
  alerts.forEach(a => {
    const h = holdings.find(h => h.marketHash === a.marketHash || h.name === a.name);
    if (!h?.prices) return;
    const price = h.prices.lowest || h.prices.lastSold;
    if (!price) return;
    a.currentPrice = price;
    a.lastChecked  = new Date().toISOString();
    const was = a.triggered;
    a.triggered = (a.direction === 'below' && price <= a.targetPrice) ||
                  (a.direction === 'above' && price >= a.targetPrice);
    if (a.triggered && !was) { a.triggeredAt = new Date().toISOString(); hits++; }
  });
  saveAlerts(alerts);
  if (hits > 0) toast(`🔔 ${hits} price alert${hits>1?'s':''} triggered!`, 'success');
  window.cs2vault.notify('CS2 Vault — Price Alert', `${hits} price target${hits>1?'s':''} hit! Open the app to review.`);
  if (document.getElementById('tab-watchlist')?.classList.contains('active')) renderAlerts();
}

async function refreshAlertPrices() {
  const alerts = loadAlerts();
  if (!alerts.length) { toast('No alerts to check', 'info'); return; }
  const btn = document.getElementById('alertRefreshBtn');
  const status = document.getElementById('alertsCheckedAt');
  if (btn) btn.disabled = true;
  let hits = 0, checked = 0;
  const work = alerts.filter(a => a.marketHash);
  await runPool(work, CSFLOAT_CONCURRENCY, async (a) => {
    const prices = await fetchCSFloatPrices(a.marketHash, a.name);
    checked++;
    if (status) status.textContent = `Checking ${checked}/${work.length}…`;
    if (!prices) return;
    const price = prices.lowest || prices.lastSold || prices.avg7d;
    a.currentPrice = price; a.lastChecked = new Date().toISOString();
    const was = a.triggered;
    a.triggered = price != null && ((a.direction==='below'&&price<=a.targetPrice)||(a.direction==='above'&&price>=a.targetPrice));
    if (a.triggered && !was) { a.triggeredAt = new Date().toISOString(); hits++; }
  });
  saveAlerts(alerts);
  if (btn) btn.disabled = false;
  if (status) status.textContent = `Last checked: ${new Date().toLocaleTimeString('en-GB')}`;
  renderAlerts();
  toast(hits > 0 ? `🔔 ${hits} alert${hits>1?'s':''} triggered!` : 'Checked — no new triggers', hits>0?'success':'info');
  if (hits > 0) window.cs2vault.notify('CS2 Vault — Price Alert', `${hits} price target${hits>1?'s':''} hit! Check your alerts tab.`);
}

function renderAlerts() {
  const alerts = loadAlerts();
  const container = document.getElementById('alertsList');
  const empty     = document.getElementById('alertsEmpty');
  const banner    = document.getElementById('alertsTriggeredBanner');
  const summary   = document.getElementById('alertsSummary');
  if (!container) return;
  if (!alerts.length) {
    if (empty)   empty.style.display   = 'block';
    if (banner)  banner.style.display  = 'none';
    container.innerHTML = '';
    if (summary) summary.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const triggered = alerts.filter(a => a.triggered);
  if (banner) {
    banner.style.display = triggered.length ? 'flex' : 'none';
    const txt = document.getElementById('alertsBannerText');
    if (txt) txt.textContent = triggered.map(a =>
      `${a.name} ${a.direction==='below'?'dropped below':'rose above'} ${fmtMoney(a.targetPrice, 3)}`).join(' · ');
  }
  if (summary) summary.innerHTML =
    `<div class="alert-chip"><span style="color:var(--text)">${alerts.length}</span>&nbsp;Total</div>
     <div class="alert-chip"><span style="color:var(--green)">${alerts.filter(a=>a.direction==='below').length}</span>&nbsp;Drop Alerts</div>
     <div class="alert-chip"><span style="color:var(--red)">${alerts.filter(a=>a.direction==='above').length}</span>&nbsp;Rise Alerts</div>
     <div class="alert-chip"><span style="color:var(--gold)">${triggered.length}</span>&nbsp;Triggered</div>
     <div class="alert-chip"><span style="color:var(--blue)">${alerts.filter(a=>!a.triggered).length}</span>&nbsp;Watching</div>`;
  const sorted = [...alerts].sort((a,b)=>(b.triggered?1:0)-(a.triggered?1:0)||a.name.localeCompare(b.name));
  const rows = sorted.map(a => {
    const pStr = a.currentPrice != null ? `${fmtMoney(a.currentPrice, 3)}` : '<span style="color:var(--text3)">—</span>';
    const dist = a.currentPrice != null ? (a.currentPrice - a.targetPrice) / a.targetPrice * 100 : null;
    const dStr = dist != null
      ? `<span style="color:${Math.abs(dist)<3?'var(--gold)':dist>0?'var(--red)':'var(--green)'};">${dist>0?'+':''}${dist.toFixed(1)}%</span>`
      : '<span style="color:var(--text3)">—</span>';
    const chk  = a.lastChecked ? timeAgo(new Date(a.lastChecked).getTime()) : 'Never';
    const tBdg = a.triggered ? '<span class="triggered-badge">🔔 HIT</span>' : '';
    return `<div class="alert-row${a.triggered?' is-triggered':''}">
      <div><div style="font-weight:600;">${escHtml(a.name)} ${tBdg}</div>
           <div style="font-size:10px;color:var(--text3);font-family:'Share Tech Mono',monospace;margin-top:3px;">${a.note||'—'} · checked ${chk}</div></div>
      <div><span class="dir-badge ${a.direction==='below'?'dir-below':'dir-above'}">${a.direction==='below'?'▼ DROP':'▲ RISE'}</span></div>
      <div class="mono">${fmtMoney(a.targetPrice, 3)}</div>
      <div class="mono">${pStr}</div>
      <div class="mono">${dStr}</div>
      <div><button class="btn btn-danger btn-sm" onclick="deleteAlert('${a.id}')">✕</button></div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="alert-panel">
    <div class="alert-panel-hd"><div class="alert-panel-title">All Price Alerts</div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3);">${alerts.length} alerts · triggered first</div></div>
    <div class="alert-col-hd"><div>Item</div><div>Direction</div><div>Target</div><div>Current Price</div><div>Distance</div><div></div></div>
    ${rows}</div>`;
}


// ================================================================
// SETTINGS TAB
// ================================================================
function saveSettingsApiKey() {
  const key = document.getElementById('settingsApiKey')?.value.trim();
  if (!key) { toast('Paste your API key first', 'error'); return; }
  saveApiKey(key);
  // Also update the header input
  const headerInput = document.getElementById('apiKeyInput');
  if (headerInput) headerInput.value = key;
  checkApiStatus();
  toast('API key saved!', 'success');
}

async function testApiKey() {
  const key = getApiKey();
  if (!key) { toast('No API key saved', 'error'); return; }
  toast('Testing connection...', 'info');
  try {
    const res = await window.cs2vault.fetch('https://csfloat.com/api/v1/me', { 'Authorization': key });
    if (res.ok) {
      const data = JSON.parse(res.body);
      toast(`✓ Connected — ${data.user?.username || 'Valid key'}`, 'success');
    } else {
      toast(`✗ Invalid key (${res.status})`, 'error');
    }
  } catch(e) {
    toast('Connection failed — check internet', 'error');
  }
}

// ========================
// PRICEMPIRE INTEGRATION
// ========================
const PRICEMPIRE_KEY_STORE = 'cs2vault_pricempire_key';

function getPricempireKey() {
  return window._store[PRICEMPIRE_KEY_STORE] || '';
}

function savePricempireKey() {
  const key = document.getElementById('settingsPricempireKey').value.trim();
  if (!key) { toast('Enter a Pricempire API key', 'error'); return; }
  window._storeSet(PRICEMPIRE_KEY_STORE, key);
  toast('Pricempire key saved', 'success');
}

async function testPricempireKey() {
  const key = getPricempireKey();
  if (!key) { toast('No Pricempire key saved', 'error'); return; }
  const el = document.getElementById('pricempireTestResult');
  el.textContent = 'Testing...';
  el.style.color = 'var(--text3)';
  try {
    const url = 'https://api.pricempire.com/v4/paid/items/prices?app_id=730&sources=csfloat&currency=GBP&type=container&limit=1';
    const res = await window.cs2vault.fetch(url, { 'Authorization': 'Bearer ' + key });
    if (res.status === 200) {
      el.textContent = '✓ Connected to Pricempire';
      el.style.color = 'var(--green)';
      toast('Pricempire connected', 'success');
    } else {
      el.textContent = '✗ Invalid key (HTTP ' + res.status + ')';
      el.style.color = 'var(--red)';
      toast('Pricempire key invalid', 'error');
    }
  } catch(e) {
    el.textContent = '✗ Connection failed';
    el.style.color = 'var(--red)';
    toast('Pricempire connection failed', 'error');
  }
}

async function fetchPricempireHistory(marketHashName, days) {
  const key = getPricempireKey();
  if (!key || !marketHashName) return null;

  const toDate = todayStr();
  const fromDate = localDateStr(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  try {
    const url = `https://api.pricempire.com/v4/paid/items/prices/history?app_id=730&provider_key=csfloat&currency=GBP&from_date=${fromDate}&to_date=${toDate}&market_hash_names=${encodeURIComponent(marketHashName)}`;
    const res = await window.cs2vault.fetch(url, { 'Authorization': 'Bearer ' + key });
    if (res.status !== 200) {
      console.warn(`[Pricempire] ${marketHashName}: HTTP ${res.status}`);
      return null;
    }
    const data = JSON.parse(res.body);
    if (!data || !data.length) return null;
    // Convert to our standard format
    const item = data[0];
    if (!item?.prices) return null;
    return item.prices.map(p => ({
      ts: new Date(p.date || p.timestamp).getTime(),
      price: p.price / 100, // Pricempire returns cents
      volume: p.volume || 0,
    })).filter(p => !isNaN(p.ts) && p.price > 0);
  } catch(e) {
    console.error(`[Pricempire] ${marketHashName}:`, e.message);
    return null;
  }
}

async function exportAllData() {
  const backup = {
    exportedAt: new Date().toISOString(),
    version: await window.cs2vault.version(),
    holdings:  window._store['cs2vault_holdings']  || null,
    history:   window._store['cs2vault_history']   || null,
    snapshots: window._store['cs2vault_snapshots'] || null,
    skins:     window._store['cs2vault_skins']     || null,
    watchlist: window._store['cs2vault_watchlist'] || null,
    alerts:    window._store['cs2vault_alerts']    || null,
    fxCache:   window._store['cs2vault_fx_cache']  || null,
    displayCurrency: window._store['cs2vault_display_currency'] || null,
    taxJurisdiction: window._store['cs2vault_tax_jurisdiction'] || null,
    costBasisMethod: window._store['cs2vault_cost_basis_method'] || null,
    proOverride:     window._store['cs2vault_pro_override'] || null,
    licence:         window._store['cs2vault_licence'] || null,
    licenceState:    window._store['cs2vault_licence_state'] || null,
    trialStart:      window._store['cs2vault_trial_start'] || null,
    activityLog:     window._store['cs2vault_activity_log'] || null,
    valueHistory:    window._store['cs2vault_value_history'] || null,
    steamId:         window._store['cs2vault_steam_id'] || null,
    // v3.6.3: accumulated history — without these a restore silently loses all
    // sparklines, trends and case-supply tracking (cs2vault_benchmarks is a
    // re-fetchable cache and API keys are deliberately never written to backups)
    priceLog:        window._store['cs2vault_price_log'] || null,
    steamHistory:    window._store['cs2vault_steam_history'] || null,
    caseSupply:      window._store['cs2vault_case_supply'] || null,
  };
  const json = JSON.stringify(backup, null, 2);
  const filename = `cs2vault-backup-${todayStr()}.json`;
  const result = await window.cs2vault.exportSave(filename, json);
  if (result.saved) toast(`Backup saved!`, 'success');
}

// v3.6.3: restore from a backup JSON produced by exportAllData. Full-replace
// semantics: every mapped key is overwritten from the backup, and keys ABSENT
// from the backup are deleted — except the licence trio, which is never deleted
// (restoring an old backup must not sign a paying user out of Pro; it is only
// overwritten if the backup actually contains licence data).
const BACKUP_FIELD_MAP = {
  holdings: 'cs2vault_holdings',
  history: 'cs2vault_history',
  snapshots: 'cs2vault_snapshots',
  skins: 'cs2vault_skins',
  watchlist: 'cs2vault_watchlist',
  alerts: 'cs2vault_alerts',
  fxCache: 'cs2vault_fx_cache',
  displayCurrency: 'cs2vault_display_currency',
  taxJurisdiction: 'cs2vault_tax_jurisdiction',
  costBasisMethod: 'cs2vault_cost_basis_method',
  proOverride: 'cs2vault_pro_override',
  licence: 'cs2vault_licence',
  licenceState: 'cs2vault_licence_state',
  trialStart: 'cs2vault_trial_start',
  activityLog: 'cs2vault_activity_log',
  valueHistory: 'cs2vault_value_history',
  steamId: 'cs2vault_steam_id',
  priceLog: 'cs2vault_price_log',
  steamHistory: 'cs2vault_steam_history',
  caseSupply: 'cs2vault_case_supply',
};
const BACKUP_NEVER_DELETE = new Set(['cs2vault_licence', 'cs2vault_licence_state', 'cs2vault_trial_start']);

async function importAllData() {
  if (!confirm('Restore from a CS2 Vault backup file?\n\nThis REPLACES your current holdings, history, snapshots, skins and settings with the backup contents.')) return;

  const result = await window.cs2vault.importOpen({ filters: [
    { name: 'CS2 Vault Backup', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] },
  ]});
  if (!result || !result.opened) return;

  let backup;
  try { backup = JSON.parse(result.content); }
  catch { toast('Not a valid backup file (could not parse JSON)', 'error'); return; }
  if (!backup || typeof backup !== 'object' || !backup.exportedAt || !('holdings' in backup)) {
    toast('Not a CS2 Vault backup file', 'error'); return;
  }

  // Summarise what the backup contains before the final confirm
  const counts = [];
  const tryCount = (field, label) => {
    try { const arr = JSON.parse(backup[field]); if (Array.isArray(arr)) counts.push(arr.length + ' ' + label); } catch {}
  };
  tryCount('holdings', 'holdings'); tryCount('history', 'trades'); tryCount('snapshots', 'snapshots'); tryCount('skins', 'play skins');
  const summary = counts.length ? counts.join(', ') : 'contents could not be summarised';
  const when = String(backup.exportedAt).slice(0, 10);
  const ver = backup.version ? ' (app v' + backup.version + ')' : '';
  if (!confirm('Backup from ' + when + ver + '\n' + summary + '\n\nLast chance — replace ALL current data with this backup?')) return;

  let restored = 0, deleted = 0;
  try {
    for (const [field, key] of Object.entries(BACKUP_FIELD_MAP)) {
      const v = backup[field];
      if (v == null) {
        if (!BACKUP_NEVER_DELETE.has(key)) { await window.cs2vault.store.delete(key); deleted++; }
        continue;
      }
      await window.cs2vault.store.set(key, v);
      restored++;
    }
  } catch (e) {
    toast('Restore failed partway: ' + (e.message || e) + ' — reloading to a consistent state', 'error');
    setTimeout(() => location.reload(), 1500);
    return;
  }
  toast('Backup restored (' + restored + ' data sets) — reloading\u2026', 'success');
  // All writes above were awaited, so the store is consistent; a clean reload
  // re-runs initStore/initApp against the restored data (no re-init side effects)
  setTimeout(() => location.reload(), 900);
}

function clearAllData() {
  if (!confirm('⚠ This will delete ALL your holdings, history, snapshots and settings.\n\nAre you absolutely sure?')) return;
  if (!confirm('Last chance — delete everything?')) return;
  // NOTE: cs2vault_licence / cs2vault_licence_state / cs2vault_trial_start are
  // deliberately NOT cleared here — wiping a paid licence on "clear data" would
  // lock a paying customer out of a purchase they made. Use Settings → Remove
  // licence to sign out of Pro on this machine.
  const keys = ['cs2vault_holdings','cs2vault_history','cs2vault_snapshots','cs2vault_skins','cs2vault_watchlist','cs2vault_alerts','cs2vault_fx_cache','cs2vault_display_currency','cs2vault_tax_jurisdiction','cs2vault_cost_basis_method','cs2vault_pro_override','cs2vault_install_state','cs2vault_onboarded','cs2vault_activity_log','cs2vault_value_history','cs2vault_steam_id','cs2vault_benchmarks'];
  keys.forEach(k => {
    window._store[k] = null;
    window.cs2vault.store.delete(k);
  });
  holdings = []; tradeHistory = [];
  renderHoldings(); updateStats(); renderHistory(); renderAnalytics();
  toast('All data cleared', 'info');
  updateSettingsInfo();
}

async function updateSettingsInfo() {
  try {
    const vEl = document.getElementById('settingsVersion');
    if (vEl) {
      const v = await window.cs2vault.version().catch(() => '1.0.0');
      vEl.textContent = `Desktop App v${v}`;
    }
  } catch(e) { console.warn('version error', e); }

  try {
    const pathEl = document.getElementById('settingsDbPath');
    if (pathEl) {
      const userData = await window.cs2vault.userData().catch(() => '%AppData%\\cs2vault');
      pathEl.textContent = userData + '\\cs2vault-data.json';
    }
  } catch(e) { console.warn('userData error', e); }

  try {
    const countEl = document.getElementById('settingsHoldingCount');
    if (countEl) countEl.textContent = holdings.length.toLocaleString();
  } catch(e) {}

  try {
    const apiEl = document.getElementById('settingsApiKey');
    if (apiEl) apiEl.value = getApiKey() || '';
  } catch(e) {}

  try {
    const pmEl = document.getElementById('settingsPricempireKey');
    if (pmEl) pmEl.value = getPricempireKey() || '';
  } catch(e) {}

  // Keep the Pro tier UI in sync whenever Settings is opened.
  try { syncProUI(); } catch(e) {}
  try { syncDisplayCcyLock(); } catch(e) {}
  try { syncJurisdictionLock(); } catch(e) {}
}


function populateSettingsFallback() {
  // Called if cs2vault bridge isn't available (shouldn't happen in Electron but just in case)
  const countEl = document.getElementById('settingsHoldingCount');
  if (countEl) countEl.textContent = holdings.length.toLocaleString();
  const apiEl = document.getElementById('settingsApiKey');
  if (apiEl) apiEl.value = getApiKey() || '';
  const pmEl = document.getElementById('settingsPricempireKey');
  if (pmEl) pmEl.value = getPricempireKey() || '';
  const pathEl = document.getElementById('settingsDbPath');
  if (pathEl) pathEl.textContent = 'See AppData/cs2vault/';
  const vEl = document.getElementById('settingsVersion');
  if (vEl) vEl.textContent = 'Desktop App v1.0.0';
}

// ========================
// ARBITRAGE DETECTION
// ========================
function getSteamImageUrl(marketHash) {
  if (!marketHash) return '';
  return `https://api.steamapis.com/image/item/730/${encodeURIComponent(marketHash)}`;
}

function calculateTrends(items, days) {
  const results = [];
  const now = Date.now();
  const cutoff = now - (days * 24 * 60 * 60 * 1000);

  items.forEach(item => {
    const history = getPriceHistory(item.id, days);
    if (history.length < 2) return;

    const oldest = history[0];
    const newest = history[history.length - 1];
    if (!oldest.best || !newest.best) return;

    const steamPriced = item.type === 'case' || item.type === 'sticker' || item.isTuf || item.type === 'agent';
    // A CSFloat-priced item trending off Steam history = cross-platform estimate.
    // In that case stay entirely within the Steam series (never mix a live CSFloat
    // price against a Steam baseline). Otherwise anchor on the live P&L price so
    // Trending always agrees with Holdings.
    const estimate = newest.source === 'steam' && !steamPriced;
    const live = getBestPrice(item);
    const currentPrice = (!estimate && live != null && live > 0) ? live : newest.best;
    const change = ((currentPrice - oldest.best) / oldest.best) * 100;
    const totalValue = currentPrice * item.qty;

    results.push({
      item,
      currentPrice,
      oldPrice: oldest.best,
      change,
      totalValue,
      dataPoints: history.length,
      marketHash: item.marketHash,
      estimate,
      history,
    });
  });

  return results;
}

// Trending state (v2.7.2: declarations restored — they were lost in a refactor,
// causing a ReferenceError in renderTrending that blanked Holdings/Analytics)
let _trendRange = 30;
let _trendCategory = 'all';

function setTrendRange(days, btn) {
  _trendRange = days;
  document.querySelectorAll('.trend-range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTrending();
}

function setTrendCategory(cat, btn) {
  _trendCategory = cat;
  document.querySelectorAll('.trend-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTrending();
}

function renderTrending() {
  const gainersEl = document.getElementById('trendGainers');
  const losersEl = document.getElementById('trendLosers');
  const emptyEl = document.getElementById('trendEmpty');
  const tabsEl = document.getElementById('trendingCategoryTabs');
  if (!gainersEl || !losersEl || !emptyEl || !tabsEl) return;

  // Build category tabs
  const categories = { all: 'All Items' };
  const typeCounts = {};
  holdings.forEach(h => {
    if (!typeCounts[h.type]) typeCounts[h.type] = 0;
    typeCounts[h.type]++;
  });
  Object.keys(typeCounts).forEach(t => { categories[t] = (typeLabels[t] || t) + 's'; });

  tabsEl.innerHTML = Object.entries(categories).map(([key, label]) =>
    `<button class="btn btn-secondary btn-sm trend-cat-btn ${_trendCategory === key ? 'active' : ''}" onclick="setTrendCategory('${key}', this)">${label}</button>`
  ).join('');

  // Filter items by category
  let items = holdings;
  if (_trendCategory !== 'all') {
    items = holdings.filter(h => h.type === _trendCategory);
  }

  const trends = calculateTrends(items, _trendRange);

  if (trends.length < 1) {
    emptyEl.style.display = 'block';
    gainersEl.innerHTML = '';
    losersEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';

  // Sort for gainers (highest change first) and losers (lowest change first)
  const gainers = [...trends].filter(t => t.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
  const losers = [...trends].filter(t => t.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);

  const trendSpark = (pts, color) => {
    const prices = pts.map(e => e.best).filter(v => v != null);
    if (prices.length < 2) return '<div class="trend-spark"></div>';
    // Cap at ~60 points so long Steam histories stay light
    const step0 = Math.max(1, Math.floor(prices.length / 60));
    const sampled = prices.filter((_, i) => i % step0 === 0 || i === prices.length - 1);
    const min = Math.min(...sampled), max = Math.max(...sampled);
    const range = max - min || 1;
    const w = 64, h = 24, step = w / (sampled.length - 1);
    const points = sampled.map((p, i) => `${(i * step).toFixed(1)},${(h - 3 - ((p - min) / range) * (h - 6)).toFixed(1)}`).join(' ');
    return `<div class="trend-spark"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg></div>`;
  };

  const renderRow = (t, isGainer) => {
    const color = isGainer ? 'var(--green)' : 'var(--red)';
    const arrow = isGainer ? '↗' : '↘';
    const imgUrl = getSteamImageUrl(t.marketHash);
    const imgHtml = imgUrl ? `<img class="trend-img" src="${imgUrl}" alt="" onerror="this.style.display='none'">` : `<div class="trend-img" style="display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text3);">◆</div>`;
    const srcBadge = t.estimate ? '<span class="trend-src-badge" title="Not enough CSFloat price history for this period — trend estimated from Steam Market sale history">Steam est.</span>' : '';

    return `<div class="trend-row" onclick="openPriceHistoryModal('${t.item.id}')" title="Click for full price history">
      ${imgHtml}
      <div class="trend-info">
        <div class="trend-name">${escHtml(t.item.name)}</div>
        <div class="trend-sub">${typeLabels[t.item.type] || t.item.type} · qty ${t.item.qty.toLocaleString()}${srcBadge}</div>
      </div>
      ${trendSpark(t.history, color)}
      <div class="trend-price">
        <div class="trend-price-now">${fmtMoney(t.currentPrice, 2)}</div>
        <div class="trend-price-was">was ${fmtMoney(t.oldPrice, 2)}</div>
      </div>
      <div class="trend-change" style="color:${color};">${arrow} ${Math.abs(t.change).toFixed(2)}%</div>
      <div class="trend-value">${fmtMoney(t.totalValue, 2)}</div>
    </div>`;
  };

  gainersEl.innerHTML = `
    <div class="trend-panel-hd">
      <div class="trend-panel-title" style="color:var(--green);">↗ Top Gainers</div>
      <div class="trend-count" style="background:rgba(34,197,94,.15);color:var(--green);">${gainers.length}</div>
    </div>
    ${gainers.length > 0 ? gainers.map(t => renderRow(t, true)).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">No gainers in this period</div>'}`;

  losersEl.innerHTML = `
    <div class="trend-panel-hd">
      <div class="trend-panel-title" style="color:var(--red);">↘ Top Losers</div>
      <div class="trend-count" style="background:rgba(239,68,68,.15);color:var(--red);">${losers.length}</div>
    </div>
    ${losers.length > 0 ? losers.map(t => renderRow(t, false)).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">No losers in this period</div>'}`;
}

// ========================
// PORTFOLIO HEALTH REPORT
// ========================
function renderHealthReport() {
  const emptyEl = document.getElementById('healthEmpty');
  const withPrices = holdings.filter(h => getBestPrice(h) != null);

  if (withPrices.length === 0) {
    emptyEl.style.display = 'block';
    ['healthScore','healthConcentration','healthDiversification','healthSignals','healthStaleness','healthOutliers'].forEach(id => document.getElementById(id).innerHTML = '');
    return;
  }
  emptyEl.style.display = 'none';

  // ─── Calculate metrics ───
  let totalInvested = 0, totalValue = 0;
  const typeBreakdown = {};
  const itemValues = [];

  holdings.forEach(h => {
    const inv = h.buyPrice * h.qty;
    const best = getBestPrice(h);
    const val = best ? best * h.qty : 0;
    totalInvested += inv;
    totalValue += val;
    if (!typeBreakdown[h.type]) typeBreakdown[h.type] = { invested: 0, value: 0, count: 0, items: [] };
    typeBreakdown[h.type].invested += inv;
    typeBreakdown[h.type].value += val;
    typeBreakdown[h.type].count++;
    typeBreakdown[h.type].items.push(h);
    if (best) itemValues.push({ name: h.name, type: h.type, invested: inv, value: val, pct: totalInvested > 0 ? (inv / totalInvested * 100) : 0, pnlPct: h.buyPrice > 0 ? ((best - h.buyPrice) / h.buyPrice * 100) : 0, qty: h.qty, id: h.id, staleMs: h.prices?.fetchedAt ? Date.now() - h.prices.fetchedAt : null });
  });

  // Recalculate pct with final totalInvested
  itemValues.forEach(iv => iv.pct = totalInvested > 0 ? (iv.invested / totalInvested * 100) : 0);

  // ─── Concentration Risk ───
  const sorted = [...itemValues].sort((a, b) => b.pct - a.pct);
  const top5 = sorted.slice(0, 5);
  const top5Pct = top5.reduce((s, i) => s + i.pct, 0);
  const maxConcentration = top5.length > 0 ? top5[0].pct : 0;

  // ─── Diversification Score (0-100) ───
  const typeCount = Object.keys(typeBreakdown).length;
  const maxTypes = 5; // case, sticker, armory, skin, knife
  const typeScore = Math.min(100, (typeCount / maxTypes) * 100);
  // Herfindahl index — lower = more diversified
  const hhi = itemValues.reduce((s, i) => s + Math.pow(i.pct / 100, 2), 0);
  const hhiScore = Math.max(0, Math.min(100, (1 - hhi) * 100));
  const diversificationScore = Math.round((typeScore * 0.3 + hhiScore * 0.7));

  // ─── Staleness check ───
  const staleItems = holdings.filter(h => {
    if (!h.prices?.fetchedAt) return true;
    return (Date.now() - h.prices.fetchedAt) > 7 * 24 * 60 * 60 * 1000; // >7 days
  });
  const neverPriced = holdings.filter(h => !h.prices?.fetchedAt);

  // ─── Performance outliers ───
  const performers = [...itemValues].sort((a, b) => b.pnlPct - a.pnlPct);
  const topPerformers = performers.filter(p => p.pnlPct > 20).slice(0, 5);
  const worstPerformers = performers.filter(p => p.pnlPct < -20).reverse().slice(0, 5);

  // ─── Signals ───
  const signals = [];

  // Concentration warnings
  if (maxConcentration > 40) signals.push({ icon: '🔴', title: `${escHtml(top5[0].name)} is ${maxConcentration.toFixed(1)}% of your portfolio`, desc: 'Very high concentration risk — consider diversifying. A single item crash would significantly impact your total value.', type: 'danger' });
  else if (maxConcentration > 25) signals.push({ icon: '🟡', title: `${escHtml(top5[0].name)} is ${maxConcentration.toFixed(1)}% of your portfolio`, desc: 'Moderate concentration — keep an eye on this position.', type: 'warning' });

  // Top 5 dominance
  if (top5Pct > 70) signals.push({ icon: '🟡', title: `Top 5 items = ${top5Pct.toFixed(1)}% of portfolio`, desc: 'Your portfolio is heavily concentrated in a few items. Spreading across more items reduces risk.', type: 'warning' });

  // Type diversification
  if (typeCount === 1) signals.push({ icon: '🔴', title: 'Only holding one item type', desc: `All your investments are ${Object.keys(typeBreakdown)[0]}s. Diversify across cases, stickers, skins, and charms.`, type: 'danger' });
  else if (typeCount === 2) signals.push({ icon: '🟡', title: 'Low type diversity', desc: 'Consider adding more item types to reduce risk.', type: 'warning' });
  else if (typeCount >= 4) signals.push({ icon: '🟢', title: `Good type diversity — ${typeCount} types`, desc: 'Well diversified across different item categories.', type: 'success' });

  // Staleness
  if (staleItems.length > holdings.length * 0.5) signals.push({ icon: '🟡', title: `${staleItems.length} items have stale prices (>7 days)`, desc: 'Refresh prices to get an accurate portfolio valuation.', type: 'warning' });
  if (neverPriced.length > 0) signals.push({ icon: '🔴', title: `${neverPriced.length} items never priced`, desc: 'These items have no price data at all. Refresh to include them in your valuation.', type: 'danger' });

  // Big winners — consider profit taking
  topPerformers.forEach(p => {
    if (p.pnlPct > 40 && p.invested > 100) {
      signals.push({ icon: '🟢', title: `${escHtml(p.name)} is up ${p.pnlPct.toFixed(1)}% — consider taking profit`, desc: `${fmtMoney(p.invested, 0)} invested, now worth ${fmtMoney(p.value, 0)}. Selling a portion locks in gains.`, type: 'success' });
    }
  });

  // Big losers
  worstPerformers.forEach(p => {
    if (p.pnlPct < -30 && p.invested > 50) {
      signals.push({ icon: '🔴', title: `${escHtml(p.name)} is down ${Math.abs(p.pnlPct).toFixed(1)}%`, desc: `${fmtMoney(p.invested, 0)} invested, now worth ${fmtMoney(p.value, 0)}. Review whether the thesis still holds.`, type: 'danger' });
    }
  });

  // Overall P&L
  const totalPnl = totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested * 100) : 0;
  if (totalPnl > 10) signals.push({ icon: '🟢', title: `Portfolio up ${totalPnl.toFixed(1)}% overall`, desc: 'Positive returns — your investment strategy is working.', type: 'success' });
  else if (totalPnl < -10) signals.push({ icon: '🟡', title: `Portfolio down ${Math.abs(totalPnl).toFixed(1)}% overall`, desc: 'Unrealised losses — CS2 items are long-term holds, consider your timeframe.', type: 'warning' });

  // ─── Overall Health Score (0-100) ───
  let healthScore = 50;
  healthScore += diversificationScore * 0.3; // up to 30 points
  healthScore -= Math.max(0, maxConcentration - 20) * 0.3; // penalise concentration
  healthScore -= staleItems.length * 0.5; // penalise stale data
  healthScore += Math.min(20, totalPnl > 0 ? totalPnl * 0.5 : totalPnl * 0.3); // P&L influence
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  const grade = healthScore >= 85 ? 'A' : healthScore >= 70 ? 'B' : healthScore >= 55 ? 'C' : healthScore >= 40 ? 'D' : 'F';
  const gradeColor = healthScore >= 70 ? 'var(--green)' : healthScore >= 50 ? 'var(--accent)' : 'var(--red)';
  const ringColor = healthScore >= 70 ? '#22c55e' : healthScore >= 50 ? '#e8993c' : '#ef4444';
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (healthScore / 100) * circumference;

  // ─── Render Score Card ───
  document.getElementById('healthScore').innerHTML = `
    <div class="health-score-card">
      <div class="health-ring">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="6"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="${ringColor}" stroke-width="6"
            stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
            stroke-linecap="round" style="transition:stroke-dashoffset 1s ease;"/>
        </svg>
        <div class="health-ring-label">
          <div class="health-ring-val" style="color:${gradeColor};">${healthScore}</div>
          <div class="health-ring-sub">/ 100</div>
        </div>
      </div>
      <div>
        <div class="health-grade" style="color:${gradeColor};">Grade ${grade}</div>
        <div class="health-summary">${
          healthScore >= 85 ? 'Excellent portfolio health — well diversified with good data coverage.' :
          healthScore >= 70 ? 'Good health — minor improvements possible in diversification or data freshness.' :
          healthScore >= 55 ? 'Fair health — some concentration risk or stale pricing data needs attention.' :
          healthScore >= 40 ? 'Needs attention — high concentration risk or significant data gaps.' :
          'Poor health — critical issues with concentration, diversification, or data coverage.'
        }</div>
      </div>
      <div style="margin-left:auto;text-align:right;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text3);">
        <div>${holdings.length} holdings</div>
        <div>${withPrices.length} priced</div>
        <div>${typeCount} item types</div>
        <div>Generated ${new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    </div>`;

  // ─── Render Concentration ───
  const concBarColor = (pct) => pct > 30 ? 'var(--red)' : pct > 15 ? 'var(--accent)' : 'var(--green)';
  document.getElementById('healthConcentration').innerHTML = `
    <div class="health-panel">
      <div class="health-panel-hd">
        <div class="health-panel-title">Concentration Risk — Top Holdings by Invested Value</div>
        <div style="font-size:11px;color:var(--text3);font-family:'Share Tech Mono',monospace;">Top 5 = ${top5Pct.toFixed(1)}%</div>
      </div>
      <div class="health-panel-body">
        ${sorted.slice(0, 10).map(i => `
          <div class="health-bar-row">
            <div class="health-bar-name">${escHtml(i.name)}<div style="font-size:10px;color:var(--text3);">${typeLabels[i.type] || i.type} · ${fmtMoney(i.invested, 0)} invested</div></div>
            <div class="health-bar-track"><div class="health-bar-fill" style="width:${Math.min(100, i.pct)}%;background:${concBarColor(i.pct)};"></div></div>
            <div class="health-bar-pct" style="color:${concBarColor(i.pct)};">${i.pct.toFixed(1)}%</div>
          </div>
        `).join('')}
      </div>
    </div>`;

  // ─── Render Diversification ───
  const typeColors = { case: 'var(--accent)', sticker: '#a78bfa', armory: 'var(--blue)', skin: 'var(--green)', knife: 'var(--gold)' };
  document.getElementById('healthDiversification').innerHTML = `
    <div class="health-panel">
      <div class="health-panel-hd">
        <div class="health-panel-title">Diversification — By Item Type</div>
        <div style="font-size:11px;color:var(--text3);font-family:'Share Tech Mono',monospace;">Score: ${diversificationScore}/100</div>
      </div>
      <div class="health-panel-body">
        ${Object.entries(typeBreakdown).sort((a, b) => b[1].invested - a[1].invested).map(([type, data]) => {
          const pct = totalInvested > 0 ? (data.invested / totalInvested * 100) : 0;
          const pnl = data.value - data.invested;
          return `<div class="health-bar-row">
            <div class="health-bar-name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeColors[type] || 'var(--text3)'};margin-right:6px;"></span>${typeLabels[type] || type}<div style="font-size:10px;color:var(--text3);">${data.count} items · ${pnl >= 0 ? '+' : ''}${fmtMoney(pnl, 0)}</div></div>
            <div class="health-bar-track"><div class="health-bar-fill" style="width:${pct}%;background:${typeColors[type] || 'var(--text3)'};"></div></div>
            <div class="health-bar-pct">${pct.toFixed(1)}%</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // ─── Render Signals ───
  document.getElementById('healthSignals').innerHTML = signals.length > 0 ? `
    <div class="health-panel">
      <div class="health-panel-hd">
        <div class="health-panel-title">Signals & Recommendations</div>
        <div style="font-size:11px;color:var(--text3);font-family:'Share Tech Mono',monospace;">${signals.length} signal${signals.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="health-panel-body">
        ${signals.map(s => `
          <div class="health-signal">
            <div class="health-signal-icon">${s.icon}</div>
            <div class="health-signal-body">
              <div class="health-signal-title">${s.title}</div>
              <div class="health-signal-desc">${s.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  // ─── Render Staleness ───
  document.getElementById('healthStaleness').innerHTML = staleItems.length > 0 ? `
    <div class="health-panel">
      <div class="health-panel-hd">
        <div class="health-panel-title">Data Freshness</div>
        <div style="font-size:11px;color:var(--text3);font-family:'Share Tech Mono',monospace;">${staleItems.length} stale · ${neverPriced.length} never priced</div>
      </div>
      <div class="health-panel-body" style="font-size:12px;color:var(--text2);">
        ${staleItems.slice(0, 8).map(h => {
          const ago = h.prices?.fetchedAt ? timeAgo(h.prices.fetchedAt) : 'Never';
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(30,61,45,.2);"><span>${escHtml(h.name)}</span><span style="color:var(--text3);font-family:'Share Tech Mono',monospace;">${ago}</span></div>`;
        }).join('')}
        ${staleItems.length > 8 ? `<div style="color:var(--text3);padding:6px 0;font-size:11px;">...and ${staleItems.length - 8} more</div>` : ''}
      </div>
    </div>` : '';

  // ─── Render Outliers ───
  const outlierHtml = (list, label, color) => list.length > 0 ? list.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(30,61,45,.2);">
      <div><span style="font-weight:600;">${escHtml(p.name)}</span><span style="font-size:11px;color:var(--text3);margin-left:8px;">${fmtMoney(p.invested, 0)} in · qty ${p.qty}</span></div>
      <span style="color:${color};font-family:'Share Tech Mono',monospace;font-weight:700;">${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%</span>
    </div>
  `).join('') : `<div style="color:var(--text3);font-size:12px;padding:8px 0;">None</div>`;

  document.getElementById('healthOutliers').innerHTML = (topPerformers.length > 0 || worstPerformers.length > 0) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="health-panel">
        <div class="health-panel-hd"><div class="health-panel-title" style="color:var(--green);">Top Performers (>+20%)</div></div>
        <div class="health-panel-body">${outlierHtml(topPerformers, 'Top', 'var(--green)')}</div>
      </div>
      <div class="health-panel">
        <div class="health-panel-hd"><div class="health-panel-title" style="color:var(--red);">Underperformers (<-20%)</div></div>
        <div class="health-panel-body">${outlierHtml(worstPerformers, 'Worst', 'var(--red)')}</div>
      </div>
    </div>` : '';
}

function switchTab(tab, el) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  // Activate the panel BEFORE rendering — a render error must never leave the
  // whole tab blank (pre-v2.7.1 a throw in updateStats() did exactly that)
  if (el) el.classList.add('active');
  const tabEl = document.getElementById(`tab-${tab}`);
  if (tabEl) tabEl.classList.add('active');
  else console.error('[switchTab] panel not found: tab-' + tab);
  const safe = (label, fn) => {
    try { fn(); }
    catch(e) {
      console.error(`[switchTab] ${label} render failed:`, e);
      try { toast(`Render error (${label}): ${e.message}`, 'error'); } catch(_) {}
    }
  };
  if (tab === 'holdings') safe('holdings', updateStats);
  if (tab === 'skins') safe('skins', renderSkins);
  if (tab === 'intelligence' && !ciData) { /* show empty */ }
  if (tab === 'analytics') { safe('analytics', renderPortfolio); safe('health', renderHealthReport); }
  if (tab === 'settings') safe('settings', () => { if (typeof window.cs2vault !== 'undefined') updateSettingsInfo(); else populateSettingsFallback(); });
  if (tab === 'watchlist') { safe('watchlist', renderWatchlist); safe('alerts', renderAlerts); }
  if (tab === 'history') { safe('stats', updateStats); safe('history', renderHistory); }
}
function filterTable(q) { currentFilter = q; renderHoldings(); }
function filterHistory(q) {
  const filtered = tradeHistory.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
  const c = document.getElementById('historyList');
  if (!filtered.length) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">◈</div><h3>No results</h3></div>`; return; }
  c.innerHTML = filtered.sort((a,b)=>new Date(b.sellDate)-new Date(a.sellDate)).map(t => {
    const gross=t.sellPrice*t.qty,fee=gross*(t.feePercent/100),net=gross-fee-(t.buyPrice*t.qty);
    return `<div class="sold-card"><div><strong>${escHtml(t.name)}</strong><div class="sold-date">${t.sellDate}</div></div>
      <div class="sold-col"><div class="sold-col-label">Buy</div><div class="sold-col-val">${fmtGBP(Number(t.buyPrice), 2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Sell</div><div class="sold-col-val">${fmtGBP(Number(t.sellPrice), 2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Fee</div><div class="sold-col-val negative">-${fmtGBP(fee, 2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Net</div><div class="sold-col-val ${net>=0?'positive':'negative'}">${net>=0?'+':''}${fmtGBP(net, 2)}</div></div></div>`;
  }).join('');
}
function sortTable(key) { if (sortKey===key) sortDir*=-1; else{sortKey=key;sortDir=1;} renderHoldings(); }
async function exportCSV() {
  if (!featureUnlocked('csvExport')) { showProToast('csvExport'); return; }
  const rows=[['Name','Type','TUF','Qty','Buy Price','Buy Date','Market Hash','CSFloat','Steam','Best Price','P&L','Category','Notes']];
  holdings.forEach(h=>{
    const best=getBestPrice(h);
    const pnl=best!=null?((best-h.buyPrice)*h.qty).toFixed(2):'';
    const cf=getPlatformPrice(h,'csfloat');
    const stm=getPlatformPrice(h,'steam');
    rows.push([h.name,h.type,h.isTuf?'Yes':'No',h.qty,h.buyPrice,h.buyDate||'',h.marketHash||'',cf||'',stm||'',best||'',pnl,h.category||'',h.notes||'']);
  });
  const csvStr = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  if (typeof window.cs2vault !== 'undefined') {
    const result = await window.cs2vault.exportSave('cs2vault_holdings.csv', csvStr);
    if (result && result.saved) toast('Saved to ' + result.filePath, 'success');
  }
}
async function exportHistoryCSV() {
  if (!featureUnlocked('csvExport')) { showProToast('csvExport'); return; }
  const rows=[['Name','Type','Qty','Buy Price','Sell Price','Date','Platform','Fee %','Fee Amount','Net Realised','Net Profit']];
  tradeHistory.forEach(t=>{
    const g=(t.gross!=null)?t.gross:t.sellPrice*t.qty;
    const f=(t.feeAmount!=null)?t.feeAmount:g*(t.feePercent/100);
    const nr=(t.netRealised!=null)?t.netRealised:g-f;
    const n=(nr-(t.buyPrice*t.qty)).toFixed(2);
    rows.push([t.name,t.type,t.qty,t.buyPrice,t.sellPrice,t.sellDate,tradePlatform(t),t.feePercent,f.toFixed(2),nr.toFixed(2),n]);
  });
  const csvStr = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  if (typeof window.cs2vault !== 'undefined') {
    const result = await window.cs2vault.exportSave('cs2vault_history.csv', csvStr);
    if (result && result.saved) toast('Saved to ' + result.filePath, 'success');
  }
}

async function importCSV() {
  if (typeof window.cs2vault === 'undefined') { toast('Import only works in desktop app', 'error'); return; }
  const result = await window.cs2vault.importOpen();
  if (!result || !result.opened) return;

  // Parse CSV
  const lines = result.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) { toast('CSV is empty or has no data rows', 'error'); return; }

  // Parse header
  const parseRow = (line) => {
    const cells = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const header = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const nameIdx = header.findIndex(h => h === 'name' || h === 'itemname');
  const typeIdx = header.findIndex(h => h === 'type' || h === 'itemtype');
  const qtyIdx = header.findIndex(h => h === 'qty' || h === 'quantity');
  const priceIdx = header.findIndex(h => h.includes('buyprice') || h.includes('price') || h.includes('cost'));
  const dateIdx = header.findIndex(h => h.includes('date') || h.includes('buydate'));
  const hashIdx = header.findIndex(h => h.includes('hash') || h.includes('markethash'));
  const notesIdx = header.findIndex(h => h === 'notes' || h === 'note');
  const catIdx = header.findIndex(h => h === 'category' || h === 'cat');

  if (nameIdx < 0 || priceIdx < 0) {
    toast('CSV must have at least "Name" and "Buy Price" columns', 'error');
    return;
  }

  // Preview
  const items = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    const name = row[nameIdx];
    const buyPrice = parseFloat(row[priceIdx]);
    if (!name || isNaN(buyPrice) || buyPrice <= 0) { skipped++; continue; }

    const item = {
      id: uid(),
      name,
      type: typeIdx >= 0 ? (row[typeIdx] || 'skin').toLowerCase() : 'skin',
      qty: qtyIdx >= 0 ? (parseInt(row[qtyIdx]) || 1) : 1,
      buyPrice,
      buyDate: dateIdx >= 0 ? (row[dateIdx] || '') : '',
      marketHash: hashIdx >= 0 ? (row[hashIdx] || '') : '',
      notes: notesIdx >= 0 ? (row[notesIdx] || '') : 'Imported from CSV',
      category: catIdx >= 0 ? (row[catIdx] || '') : '',
      origCurrency: 'GBP', origAmount: buyPrice, fxRate: 1,
      prices: null,
    };
    item.lots = [ makeLot(item.qty, item.buyPrice, item.buyDate, 'GBP', 1, item.buyPrice) ];
    // Check for duplicates
    if (!holdings.some(h => h.name === item.name && h.buyPrice === item.buyPrice && h.qty === item.qty)) {
      items.push(item);
    } else {
      skipped++;
    }
  }

  if (items.length === 0) {
    toast(`No new items to import (${skipped} skipped/duplicates)`, 'info');
    return;
  }

  if (!confirm(`Import ${items.length} item(s)? (${skipped} skipped)\n\nThis will add them to your holdings.`)) return;

  holdings.push(...items);
  saveData(holdings);
  items.forEach(it => logActivity('add', 'holding', _logSnapshot(it), null));
  renderHoldings();
  updateStats();
  toast(`Imported ${items.length} item(s)!`, 'success');
}

// ============================================================
// STEAM INVENTORY IMPORT (Phase 5, v3.6.0) — free tier
// ============================================================
// Pulls the user's PUBLIC floating CS2 inventory via Steam's community
// endpoint /inventory/{steamId64}/730/2 (no auth, no API key) and merges it
// into Holdings with a dedupe preview. Steam doesn't know buy prices, so the
// user supplies a default price/date (editable per row) before anything is
// saved. KNOWN LIMIT (documented in the modal): items inside STORAGE UNITS
// are invisible to this endpoint — only the floating inventory is returned.
// All traffic goes through window.cs2vault.fetch (main-process IPC).

const STEAM_ID_KEY = 'cs2vault_steam_id';
const STEAM_INV_PAGE_SIZE = 2000;   // max Steam honours per request
const STEAM_INV_MAX_PAGES = 10;     // 20k items — safety cap
const STEAM_INV_PAGE_DELAY = 1500;  // ms between pages (be polite, avoid 429)

let _steamImportRows = [];          // preview rows (module state, not persisted)
let _steamImportBusy = false;

// ── Input parsing ───────────────────────────────────────────
// Accepts: bare SteamID64, /profiles/<id64> URL, /id/<vanity> URL, or a bare
// vanity name. Returns { kind:'id64'|'vanity', value } or null.
function parseSteamIdInput(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return { kind: 'id64', value: m[1] };
  m = s.match(/steamcommunity\.com\/id\/([^\/\s?#]+)/i);
  if (m) return { kind: 'vanity', value: m[1] };
  if (/^\d{17}$/.test(s) && s.indexOf('7656') === 0) return { kind: 'id64', value: s };
  if (/^[A-Za-z0-9_-]{2,64}$/.test(s)) return { kind: 'vanity', value: s };
  return null;
}

// Vanity → SteamID64 via the profile XML endpoint (no API key needed).
async function resolveSteamVanity(vanity) {
  const url = 'https://steamcommunity.com/id/' + encodeURIComponent(vanity) + '/?xml=1';
  let res;
  try { res = await window.cs2vault.fetch(url); } catch (e) { return { error: 'network' }; }
  if (!res || !res.ok) return { error: res && res.status === 429 ? 'ratelimit' : 'network' };
  const m = (res.body || '').match(/<steamID64>(\d{17})<\/steamID64>/);
  if (m) return { id64: m[1] };
  if ((res.body || '').indexOf('could not be found') !== -1) return { error: 'notfound' };
  return { error: 'notfound' };
}

// ── Inventory fetch (paginated) ─────────────────────────────
// Returns { items:[{hash, qty, steamType}], skippedNonMarket, truncated }
// or { error: 'private' | 'ratelimit' | 'network' | 'empty' }.
async function fetchSteamInventory(id64) {
  const byHash = {};           // market_hash_name -> { hash, qty, steamType }
  let skippedNonMarket = 0;
  let truncated = false;
  let startAssetId = null;

  for (let page = 0; page < STEAM_INV_MAX_PAGES; page++) {
    let url = 'https://steamcommunity.com/inventory/' + id64 + '/730/2?l=english&count=' + STEAM_INV_PAGE_SIZE;
    if (startAssetId) url += '&start_assetid=' + encodeURIComponent(startAssetId);

    let res;
    try { res = await window.cs2vault.fetch(url); } catch (e) { return { error: 'network' }; }
    if (!res) return { error: 'network' };
    if (res.status === 429) return { error: 'ratelimit' };
    if (res.status === 403) return { error: 'private' };
    if (!res.ok) return { error: 'network' };

    // Steam returns the literal string "null" for private/empty inventories.
    const bodyStr = (res.body || '').trim();
    if (!bodyStr || bodyStr === 'null') return { error: page === 0 ? 'private' : 'network' };

    let data;
    try { data = JSON.parse(bodyStr); } catch (e) { return { error: 'network' }; }
    if (!data || data.success !== 1) return { error: 'network' };

    const assets = Array.isArray(data.assets) ? data.assets : [];
    const descs = Array.isArray(data.descriptions) ? data.descriptions : [];
    if (page === 0 && assets.length === 0) return { error: 'empty' };

    // Descriptions are keyed by classid_instanceid
    const descMap = {};
    descs.forEach(function(d) { descMap[d.classid + '_' + d.instanceid] = d; });

    assets.forEach(function(a) {
      const d = descMap[a.classid + '_' + a.instanceid];
      if (!d || !d.market_hash_name) { skippedNonMarket++; return; }
      // Skip non-marketable clutter (medals, coins, storage units themselves…)
      if (d.marketable !== 1) { skippedNonMarket++; return; }
      const hash = d.market_hash_name;
      const amount = parseInt(a.amount) || 1;
      if (!byHash[hash]) byHash[hash] = { hash: hash, qty: 0, steamType: d.type || '' };
      byHash[hash].qty += amount;
    });

    if (data.more_items && data.last_assetid) {
      startAssetId = data.last_assetid;
      if (page === STEAM_INV_MAX_PAGES - 1) { truncated = true; break; }
      await sleep(STEAM_INV_PAGE_DELAY);
    } else {
      break;
    }
  }

  const items = Object.keys(byHash).map(function(k) { return byHash[k]; });
  items.sort(function(a, b) { return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0; });
  return { items: items, skippedNonMarket: skippedNonMarket, truncated: truncated };
}

// ── Modal flow ──────────────────────────────────────────────
function openSteamImport() {
  _steamImportRows = [];
  const idInput = document.getElementById('steamImportId');
  if (idInput) idInput.value = window._store[STEAM_ID_KEY] || '';
  const status = document.getElementById('steamImportStatus');
  if (status) status.textContent = '';
  _steamImportShowStep(1);
  const dateEl = document.getElementById('steamImportDate');
  if (dateEl && !dateEl.value) dateEl.value = todayStr();
  try { populateCcySelects(); } catch (e) {}
  openModal('steamImportModal');
}

// Toggle between the two modal steps (footer Back/Import only apply to step 2)
function _steamImportShowStep(n) {
  document.getElementById('steamImportStep1').style.display = n === 1 ? '' : 'none';
  document.getElementById('steamImportStep2').style.display = n === 2 ? '' : 'none';
  const back = document.getElementById('steamImportBackBtn');
  const conf = document.getElementById('steamImportConfirmBtn');
  if (back) back.style.display = n === 2 ? '' : 'none';
  if (conf) conf.style.display = n === 2 ? '' : 'none';
}

function _steamImportStatus(msg) {
  const el = document.getElementById('steamImportStatus');
  if (el) el.textContent = msg || '';
}

async function startSteamImport() {
  if (_steamImportBusy) return;
  const raw = (document.getElementById('steamImportId') || {}).value || '';
  const parsed = parseSteamIdInput(raw);
  if (!parsed) { toast('Enter a SteamID64, profile URL, or vanity name', 'error'); return; }

  _steamImportBusy = true;
  const btn = document.getElementById('steamImportFetchBtn');
  if (btn) btn.disabled = true;
  try {
    let id64 = parsed.value;
    if (parsed.kind === 'vanity') {
      _steamImportStatus('Resolving vanity name…');
      const r = await resolveSteamVanity(parsed.value);
      if (r.error === 'notfound') { toast('No Steam profile found for "' + parsed.value + '"', 'error'); _steamImportStatus(''); return; }
      if (r.error === 'ratelimit') { toast('Steam is rate-limiting requests — wait a minute and try again', 'error'); _steamImportStatus(''); return; }
      if (r.error) { toast('Could not reach Steam — check your connection', 'error'); _steamImportStatus(''); return; }
      id64 = r.id64;
    }

    _steamImportStatus('Fetching inventory… (large inventories take a few pages)');
    const inv = await fetchSteamInventory(id64);
    if (inv.error === 'private') { toast('That inventory is private — set it to Public in Steam privacy settings', 'error'); _steamImportStatus('Inventory is private or unavailable.'); return; }
    if (inv.error === 'ratelimit') { toast('Steam is rate-limiting inventory requests — wait a minute and try again', 'error'); _steamImportStatus(''); return; }
    if (inv.error === 'empty') { toast('That inventory has no items', 'info'); _steamImportStatus('No items found.'); return; }
    if (inv.error) { toast('Could not fetch the inventory — Steam may be down or blocking requests', 'error'); _steamImportStatus(''); return; }

    // Remember the ID for next time (only once a fetch succeeds)
    window._storeSet(STEAM_ID_KEY, raw.trim());

    // Build preview rows against CURRENT holdings (fresh read)
    const existingArr = loadData();
    const findExisting = function(hash) {
      const h = hash.toLowerCase();
      return existingArr.find(function(x) {
        return (x.marketHash || '').toLowerCase() === h || (x.name || '').toLowerCase() === h;
      }) || null;
    };

    _steamImportRows = inv.items.map(function(it) {
      const ex = findExisting(it.hash);
      const inferred = inferTypeFromSteamResult({ steamType: it.steamType, hash: it.hash }, 'holding');
      let importQty = it.qty, include = true, status = 'new';
      if (ex) {
        const diff = it.qty - (ex.qty || 0);
        if (diff > 0) { importQty = diff; status = 'more'; }
        else { importQty = it.qty; include = false; status = 'tracked'; }
      }
      return {
        hash: it.hash, steamQty: it.qty, type: inferred,
        existingId: ex ? ex.id : null, existingQty: ex ? ex.qty : 0,
        importQty: importQty, include: include, status: status, price: ''
      };
    });

    let note = inv.items.length + ' marketable item type(s) found';
    if (inv.skippedNonMarket) note += ' · ' + inv.skippedNonMarket + ' non-marketable item(s) skipped';
    if (inv.truncated) note += ' · ⚠ inventory larger than ' + (STEAM_INV_MAX_PAGES * STEAM_INV_PAGE_SIZE) + ' items — list truncated';
    _steamImportStatus(note);

    _steamImportShowStep(2);
    renderSteamImportPreview();
  } finally {
    _steamImportBusy = false;
    if (btn) btn.disabled = false;
  }
}

function steamImportBack() {
  _steamImportShowStep(1);
}

function steamImportToggleAll(checked) {
  _steamImportRows.forEach(function(r) { r.include = !!checked; });
  renderSteamImportPreview();
}

// Preview table — built with createElement/textContent (injection-safe: item
// names can contain quotes and angle brackets).
function renderSteamImportPreview() {
  const body = document.getElementById('steamImportRows');
  if (!body) return;
  body.innerHTML = '';
  const TYPES = ['skin', 'case', 'sticker', 'armory', 'knife'];

  _steamImportRows.forEach(function(r, idx) {
    const tr = document.createElement('tr');
    if (!r.include) tr.style.opacity = '0.45';

    // include checkbox
    let td = document.createElement('td');
    td.style.textAlign = 'center';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = r.include;
    cb.addEventListener('change', function() { r.include = cb.checked; tr.style.opacity = cb.checked ? '1' : '0.45'; updateSteamImportCount(); });
    td.appendChild(cb); tr.appendChild(td);

    // name
    td = document.createElement('td');
    td.textContent = r.hash; td.title = r.hash;
    td.style.maxWidth = '260px'; td.style.overflow = 'hidden'; td.style.textOverflow = 'ellipsis'; td.style.whiteSpace = 'nowrap';
    tr.appendChild(td);

    // status badge
    td = document.createElement('td');
    const badge = document.createElement('span');
    badge.style.fontFamily = "'Share Tech Mono',monospace"; badge.style.fontSize = '10px';
    badge.style.padding = '2px 6px'; badge.style.borderRadius = '4px'; badge.style.whiteSpace = 'nowrap';
    if (r.status === 'new') { badge.textContent = 'NEW'; badge.style.background = 'rgba(34,197,94,0.12)'; badge.style.color = 'var(--green,#22c55e)'; }
    else if (r.status === 'more') { badge.textContent = '+' + (r.steamQty - r.existingQty) + ' MORE'; badge.title = 'You track ' + r.existingQty + ', Steam shows ' + r.steamQty + ' — importing the difference as a new lot'; badge.style.background = 'rgba(234,179,8,0.12)'; badge.style.color = '#eab308'; }
    else { badge.textContent = 'TRACKED'; badge.title = 'Already in holdings (' + r.existingQty + ' tracked, ' + r.steamQty + ' on Steam)'; badge.style.background = 'rgba(148,163,184,0.12)'; badge.style.color = 'var(--text3)'; }
    td.appendChild(badge); tr.appendChild(td);

    // type select
    td = document.createElement('td');
    const sel = document.createElement('select');
    sel.style.fontSize = '11px'; sel.style.padding = '2px 4px';
    TYPES.forEach(function(t) {
      const o = document.createElement('option');
      o.value = t; o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      sel.appendChild(o);
    });
    sel.value = r.type;
    sel.addEventListener('change', function() { r.type = sel.value; });
    tr.appendChild(td); td.appendChild(sel);

    // qty
    td = document.createElement('td');
    const qtyIn = document.createElement('input');
    qtyIn.type = 'number'; qtyIn.min = '1'; qtyIn.step = '1'; qtyIn.value = r.importQty;
    qtyIn.style.width = '64px'; qtyIn.style.fontSize = '11px'; qtyIn.style.padding = '2px 4px';
    qtyIn.title = 'Steam shows ' + r.steamQty;
    qtyIn.addEventListener('input', function() { r.importQty = parseInt(qtyIn.value) || 0; });
    td.appendChild(qtyIn); tr.appendChild(td);

    // per-row buy price override (blank = use default)
    td = document.createElement('td');
    const prIn = document.createElement('input');
    prIn.type = 'number'; prIn.min = '0'; prIn.step = '0.01'; prIn.placeholder = 'default';
    prIn.value = r.price;
    prIn.style.width = '80px'; prIn.style.fontSize = '11px'; prIn.style.padding = '2px 4px';
    prIn.title = 'Buy price per unit — leave blank to use the default above';
    prIn.addEventListener('input', function() { r.price = prIn.value; });
    td.appendChild(prIn); tr.appendChild(td);

    body.appendChild(tr);
  });
  updateSteamImportCount();
}

function updateSteamImportCount() {
  const el = document.getElementById('steamImportCount');
  if (!el) return;
  const inc = _steamImportRows.filter(function(r) { return r.include && r.importQty > 0; });
  const units = inc.reduce(function(s, r) { return s + r.importQty; }, 0);
  el.textContent = inc.length + ' item type(s) · ' + units + ' unit(s) selected';
}

// ── Commit ──────────────────────────────────────────────────
async function confirmSteamImport() {
  if (_steamImportBusy) return;
  const rows = _steamImportRows.filter(function(r) { return r.include && r.importQty > 0; });
  if (!rows.length) { toast('Nothing selected to import', 'info'); return; }

  const defPriceRaw = (document.getElementById('steamImportPrice') || {}).value;
  const defPrice = parseFloat(defPriceRaw);
  const ccy = (document.getElementById('steamImportCcy') || {}).value || 'GBP';
  const date = (document.getElementById('steamImportDate') || {}).value || todayStr();

  // Every row needs a price — its own override, or the default.
  const missing = rows.filter(function(r) { return !(parseFloat(r.price) > 0) && !(defPrice > 0); });
  if (missing.length) { toast('Set a default buy price (or fill in every selected row)', 'error'); return; }

  _steamImportBusy = true;
  const btn = document.getElementById('steamImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
  try {
    // One FX rate covers all rows (single currency + date). toBaseGBP caches
    // historical rates permanently, so per-row calls are effectively free.
    const probe = await toBaseGBP(1, ccy, date);
    if (!probe) { toast('FX rate unavailable for ' + ccy + ' — nothing imported', 'error'); return; }
    const fxRate = probe.fxRate;

    // ATOMIC WRITE: re-read storage immediately before mutating (v2.4.3 pattern)
    const fresh = loadData();
    let added = 0, merged = 0;

    rows.forEach(function(r) {
      const perUnitEntered = (parseFloat(r.price) > 0) ? parseFloat(r.price) : defPrice;
      const baseGBP = +(perUnitEntered * fxRate).toFixed(6);
      const target = r.existingId ? fresh.find(function(h) { return h.id === r.existingId; }) : null;

      if (target) {
        // MERGE: append a lot to the existing holding (same pattern as top-up)
        const before = _logSnapshot(target);
        ensureLots(target);
        target.lots.push(makeLot(r.importQty, baseGBP, date, ccy, fxRate, perUnitEntered));
        recalcHoldingFromLots(target);
        const mergeNote = '+' + r.importQty + ' via Steam import on ' + date;
        target.notes = target.notes ? target.notes + ' | ' + mergeNote : mergeNote;
        const diff = _logDiff(before, _logSnapshot(target));
        logActivity('edit', 'holding', _logSnapshot(target),
          diff.length ? diff : [{ field: 'Steam import', from: '', to: '+' + r.importQty }]);
        merged++;
      } else {
        // NEW holding — full lot data + FX provenance (matches importCSV v3.4.1)
        const item = {
          id: uid(),
          name: r.hash,
          type: r.type,
          qty: r.importQty,
          buyPrice: baseGBP,
          buyDate: date,
          marketHash: r.hash,
          notes: 'Imported from Steam inventory',
          origCurrency: ccy, origAmount: perUnitEntered, fxRate: fxRate,
          prices: null
        };
        item.lots = [ makeLot(item.qty, item.buyPrice, date, ccy, fxRate, perUnitEntered) ];
        fresh.push(item);
        logActivity('add', 'holding', _logSnapshot(item), null);
        added++;
      }
    });

    saveData(fresh);
    holdings = fresh;
    renderHoldings();
    updateStats();
    closeModal('steamImportModal');
    let msg = 'Steam import complete — ' + added + ' new item(s)';
    if (merged) msg += ', ' + merged + ' merged into existing holdings';
    toast(msg, 'success');
  } finally {
    _steamImportBusy = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Import Selected'; }
  }
}

// ========================
// UTILS
// ========================
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function toast(msg,type='info'){const c=document.getElementById('toastContainer');const t=document.createElement('div');t.className=`toast ${type}`;t.innerHTML=`<span>${{success:'✓',error:'✕',info:'ℹ'}[type]}</span><span>${msg}</span>`;c.appendChild(t);setTimeout(()=>t.remove(),4000);}

// Global error surfacing (v2.7.1) — uncaught errors used to die silently in the
// console; now they toast on screen (throttled so an error loop can't spam)
let _lastErrToast = { msg: '', ts: 0 };
function surfaceError(prefix, e) {
  const msg = (e && (e.message || e.reason && e.reason.message)) || String(e);
  console.error(`[${prefix}]`, e);
  const now = Date.now();
  if (_lastErrToast.msg === msg && now - _lastErrToast.ts < 10000) return;
  _lastErrToast = { msg, ts: now };
  try { toast(`${prefix}: ${msg}`, 'error'); } catch(_) {}
}
window.addEventListener('error', ev => surfaceError('Error', ev.error || ev));
window.addEventListener('unhandledrejection', ev => surfaceError('Async error', ev.reason || ev));
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function localDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
// v3.6.3: local date, not UTC — toISOString() meant that between midnight and
// 1am BST "today" was still yesterday, so snapshots, value-history points and
// prefilled buy/sell dates could land on the wrong day
function todayStr(){return localDateStr(new Date());}
function timeAgo(ts){const d=(Date.now()-ts)/60000;if(d<1)return 'just now';if(d<60)return`${Math.floor(d)}m ago`;if(d<1440)return`${Math.floor(d/60)}h ago`;return`${Math.floor(d/1440)}d ago`;}

// Modals stay open on backdrop click — close only via the ✕, Cancel, or Save buttons.
// (Price-history chart modal is exempt: backdrop click still dismisses it.)
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o&&o.id==='priceHistoryModal')o.classList.remove('open');}));

// ========================
// INIT
// ========================

// ---- Install-state detection (Phase 4a) -------------------------------------
// A genuinely FRESH install must start EMPTY — never seeded with the developer's
// personal portfolio. An EXISTING user (Rudi's machine, or anyone who already
// has data) keeps every byte and is silently marked onboarded.
//
// Detection runs ONCE, before any seeding. The rule:
//   - If cs2vault_install_state is already set → honour it (idempotent).
//   - Else if any real user data exists (holdings / history / skins / snapshots)
//     → this is a pre-existing user upgrading into v3.1.0. Mark 'existing' and
//       'onboarded' so we never wipe them and never show the wizard.
//   - Else (no install-state, no data) → 'fresh'. Seeding is suppressed and the
//     onboarding wizard runs on first paint.
const INSTALL_STATE_KEY = 'cs2vault_install_state';   // 'fresh' | 'existing'
const ONBOARDED_KEY      = 'cs2vault_onboarded';       // 'true' once done/skipped

function _hasAnyUserData() {
  const keys = ['cs2vault_holdings','cs2vault_history','cs2vault_skins','cs2vault_snapshots'];
  for (const k of keys) {
    try {
      const arr = JSON.parse(window._store[k] || '[]');
      if (Array.isArray(arr) && arr.length) return true;
    } catch (e) {}
  }
  // An API key also indicates a real, configured install.
  if ((window._store['cs2vault_apikey'] || '').trim()) return true;
  return false;
}

// Computed once per launch and cached for the rest of init.
let _isFreshInstall = false;

function detectInstallState() {
  const stored = window._store[INSTALL_STATE_KEY];
  if (stored === 'fresh' || stored === 'existing') {
    _isFreshInstall = (stored === 'fresh');
    return;
  }
  if (_hasAnyUserData()) {
    // Pre-existing user upgrading in — protect their data, skip the wizard.
    window._storeSet(INSTALL_STATE_KEY, 'existing');
    window._storeSet(ONBOARDED_KEY, 'true');
    _isFreshInstall = false;
  } else {
    window._storeSet(INSTALL_STATE_KEY, 'fresh');
    _isFreshInstall = true;
  }
}

function isFreshInstall() { return _isFreshInstall; }
function hasOnboarded() { return window._store[ONBOARDED_KEY] === 'true'; }

// Seed holdings if Clutch Case not already present
function seedIfMissing() {
  // Fresh installs start EMPTY — never seed the developer's personal portfolio.
  if (isFreshInstall()) { holdings = []; return; }
  const existing = JSON.parse(window._store['cs2vault_holdings'] || '[]');
  if (existing.some(h => h.name === 'Clutch Case')) {
    holdings = existing;
    return;
  }
  const seeded = [
    {id:'case001',name:'Clutch Case',     type:'case',qty:4342,buyPrice:0.584,buyDate:'',marketHash:'Clutch Case',     notes:'Total invested: £2535.31',prices:null},
    {id:'case002',name:'Prisma Case',      type:'case',qty:3177,buyPrice:0.909,buyDate:'',marketHash:'Prisma Case',      notes:'Total invested: £2889.33',prices:null},
    {id:'case003',name:'Prisma 2 Case',    type:'case',qty:2592,buyPrice:0.927,buyDate:'',marketHash:'Prisma 2 Case',    notes:'Total invested: £2401.93',prices:null},
    {id:'case004',name:'Snakebite Case',   type:'case',qty:9071,buyPrice:0.362,buyDate:'',marketHash:'Snakebite Case',   notes:'Total invested: £3287.41',prices:null},
    {id:'case005',name:'Horizon Case',     type:'case',qty:325, buyPrice:0.910,buyDate:'',marketHash:'Horizon Case',     notes:'Total invested: £295.75', prices:null},
    {id:'case006',name:'Danger Zone Case', type:'case',qty:1472,buyPrice:0.905,buyDate:'',marketHash:'Danger Zone Case', notes:'Total invested: £1331.70',prices:null},
    {id:'case007',name:'Revolver Case',    type:'case',qty:333, buyPrice:1.943,buyDate:'',marketHash:'Revolver Case',    notes:'Total invested: £646.95', prices:null},
    {id:'case008',name:'Fracture Case',    type:'case',qty:1161,buyPrice:0.372,buyDate:'',marketHash:'Fracture Case',    notes:'Total invested: £432.33', prices:null},
    {id:'case009',name:'Falchion Case',    type:'case',qty:1333,buyPrice:1.255,buyDate:'',marketHash:'Falchion Case',    notes:'Total invested: £1673.36',prices:null},
    {id:'case010',name:'Recoil Case',       type:'case',qty:4477, buyPrice:0.245,  buyDate:'',    marketHash:'Recoil Case',                notes:'Total invested: £1094.90',prices:null},
    {id:'case011',name:'Fever Case',         type:'case',qty:679,  buyPrice:0.566,  buyDate:'',    marketHash:'Fever Case',                 notes:'Hold target: 2027 March-April',prices:null},
    {id:'case012',name:'Anubis Collection Package',type:'case',qty:84, buyPrice:2.031, buyDate:'', marketHash:'Anubis Collection Package',  notes:'Total invested: £170.56',prices:null},
    {id:'case013',name:'CS:GO Weapon Case',  type:'case',qty:3,    buyPrice:80.261, buyDate:'',    marketHash:'CS:GO Weapon Case',          notes:'Total invested: £561.83 (7 originally)',prices:null},
  ];
  window._storeSet('cs2vault_holdings', JSON.stringify(seeded));
  holdings = seeded;
}

// API key loaded inside initApp() after store is ready

// Seed new holdings and trade history if missing
function seedNewItems() {
  // Fresh installs must start EMPTY — never inject the developer's holdings or
  // trade history. The data-migration passes below (platform backfill, FX
  // provenance, lots) are harmless no-ops on empty stores, so we skip the
  // personal-data seeding and let migrations run on whatever exists.
  if (isFreshInstall()) { return; }
  // Add missing holdings
  const existingH = JSON.parse(window._store['cs2vault_holdings'] || '[]');
  const newItems = [
    {id:'case011',name:'Fever Case',                type:'case',qty:679, buyPrice:0.566,  buyDate:'',marketHash:'Fever Case',                notes:'Hold target: 2027 March-April',prices:null},
    {id:'case012',name:'Anubis Collection Package', type:'case',qty:84,  buyPrice:2.031,  buyDate:'',marketHash:'Anubis Collection Package', notes:'Total invested: £170.56',prices:null},
    {id:'case013',name:'CS:GO Weapon Case',                    type:'case',   qty:3,  buyPrice:80.261, buyDate:'',marketHash:'CS:GO Weapon Case',                    notes:'3 remaining of original 7',prices:null},
    {id:'sticker001',name:'Austin Legends Oct 2025 Capsule',   type:'sticker',qty:24, buyPrice:0.29,   buyDate:'',marketHash:'Austin 2025 Legends Sticker Capsule',   notes:'Total invested: £6.96',prices:null},
    {id:'sticker002',name:'Mongolz (Holo) | Austin 2025',      type:'sticker',qty:2,  buyPrice:2.60,   buyDate:'',marketHash:'Sticker | The Mongolz (Holo) | Austin 2025',      notes:'Total invested: £5.20',prices:null},
    {id:'sticker003',name:'Team Liquid (Holo) | Austin 2025',  type:'sticker',qty:1,  buyPrice:13.61,  buyDate:'',marketHash:'Sticker | Team Liquid (Holo) | Austin 2025',  notes:'Total invested: £13.61',prices:null},
    {id:'sticker004',name:'Natus Vincere (Gold) | Austin 2025',type:'sticker',qty:1,  buyPrice:1.80,   buyDate:'',marketHash:'Sticker | Natus Vincere (Gold) | Austin 2025',notes:'Total invested: £1.80',prices:null},
    {id:'charm001',name:'Die-cast AK (Orange)',type:'armory',qty:2, buyPrice:5.98, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Orange)',notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm002',name:'Die-cast AK (Blue)',  type:'armory',qty:23,buyPrice:5.75, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Blue)',  notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm003',name:'Die-cast AK (Gold)',  type:'armory',qty:11,buyPrice:5.80, buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Gold)',  notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm004',name:'Die-cast AK (Red)',   type:'armory',qty:28,buyPrice:14.76,buyDate:'2025-10-01',marketHash:'Charm | Die-cast AK (Red)',   notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm005a',name:'Diamond Dog (Low ID)',type:'armory',qty:3, buyPrice:14.00,buyDate:'2025-10-01',marketHash:'Charm | Diamond Dog',notes:'Low ID <10k pattern, 1st Gen Oct 2025',prices:null},
    {id:'charm005b',name:'Diamond Dog',              type:'armory',qty:3, buyPrice:14.00,buyDate:'2025-10-01',marketHash:'Charm | Diamond Dog',notes:'Standard, 1st Gen Oct 2025',prices:null},
    {id:'charm006',name:'Hot Wurst',           type:'armory',qty:4, buyPrice:24.04,buyDate:'2025-10-01',marketHash:'Charm | Hot Wurst',           notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'charm007',name:'Hot Howl',               type:'armory',qty:6,   buyPrice:37.91,  buyDate:'2025-10-01',marketHash:'Charm | Hot Howl',               notes:'1st Gen Armory Oct 2025',prices:null},
    {id:'sticker010',name:'Hypnoteyes',             type:'sticker',qty:1282,buyPrice:1.258,  buyDate:'2025-09-01',marketHash:'Sticker | Hypnoteyes (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker011',name:'Sticker Clown Nose',     type:'sticker',qty:330, buyPrice:0.3112, buyDate:'2025-09-01',marketHash:'Sticker | Clown Nose (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker012',name:'Taste Buddy (Holo)',     type:'sticker',qty:20,  buyPrice:5.5315, buyDate:'2025-09-01',marketHash:'Sticker | Taste Buddy (Holo)',     notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker013',name:'Blinky',                 type:'sticker',qty:100, buyPrice:0.27,   buyDate:'2025-09-01',marketHash:'Sticker | Blinky (Holo)',                 notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker014',name:'Flex',                   type:'sticker',qty:626, buyPrice:0.6065, buyDate:'2025-09-01',marketHash:'Sticker | Flex (Holo)',                   notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker015',name:'Chompers',               type:'sticker',qty:574, buyPrice:0.2891, buyDate:'2025-09-01',marketHash:'Sticker | Chompers (Holo)',               notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker016',name:'From The Deep',          type:'sticker',qty:1432,buyPrice:0.1747, buyDate:'2025-09-01',marketHash:'Sticker | From the Deep (Holo)',          notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker017',name:'Glare',                  type:'sticker',qty:2000,buyPrice:0.133,  buyDate:'2025-09-01',marketHash:'Sticker | Glare (Holo)',                  notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker018',name:'Ribbon Tie',             type:'sticker',qty:110, buyPrice:0.3273, buyDate:'2025-09-01',marketHash:'Sticker | Ribbon Tie (Holo)',             notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker019',name:'Fly High',               type:'sticker',qty:31,  buyPrice:0.159,  buyDate:'2025-09-01',marketHash:'Sticker | Fly High (Holo)',               notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker020',name:'From The Deep (Glitter)',type:'sticker',qty:401, buyPrice:0.51,   buyDate:'2025-09-01',marketHash:'Sticker | From the Deep (Glitter)',notes:'Character Craft Sep 2025',category:'character',prices:null},
    {id:'sticker021',name:'Bolt Strike',              type:'sticker',qty:198,  buyPrice:0.15,   buyDate:'2026-01-01',marketHash:'Sticker | Bolt Strike',              category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker022',name:'Bolt Charge',              type:'sticker',qty:1262, buyPrice:0.2667, buyDate:'2026-01-01',marketHash:'Sticker | Bolt Charge',              category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker023',name:'Boom Trail',               type:'sticker',qty:335,  buyPrice:0.09,   buyDate:'2026-01-01',marketHash:'Sticker | Boom Trail',               category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker024',name:'Boom Trail (Glitter)',     type:'sticker',qty:2741, buyPrice:0.2725, buyDate:'2026-01-01',marketHash:'Sticker | Boom Trail (Glitter)',     category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'sticker025',name:'High Heat',                type:'sticker',qty:1117, buyPrice:0.6487, buyDate:'2026-01-01',marketHash:'Sticker | High Heat',                category:'elemental',notes:'Elemental Craft Jan 2026',prices:null},
    {id:'gskin001',name:'M249 Spectrogram (FN)',    type:'skin',   qty:517, buyPrice:0.7028, buyDate:'2025-09-01',marketHash:'M249 | Spectrogram (Factory New)',          category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin002',name:'P2000 Coral Halftone (FN)',type:'skin',   qty:497, buyPrice:0.7444, buyDate:'2025-09-01',marketHash:'P2000 | Coral Halftone (Factory New)',        category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin003',name:'FAMAS Halftone (FN)',       type:'skin',   qty:190, buyPrice:0.7947, buyDate:'2025-09-01',marketHash:'FAMAS | Halftone Wash (Factory New)',               category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin004',name:'Galil NV (FN)',             type:'skin',   qty:159, buyPrice:0.7458, buyDate:'2025-09-01',marketHash:'Galil AR | NV (Factory New)',          category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin005',name:'SSG Halftone Whorl (FN)',   type:'skin',   qty:710, buyPrice:0.6778, buyDate:'2025-09-01',marketHash:'SSG 08 | Halftone Whorl (Factory New)',        category:'graphic',notes:'Graphic Design Collection Sep/Oct 2025',prices:null},
    {id:'gskin006',name:'MP5-SD Statics (FT)',        type:'skin',   qty:362, buyPrice:0.2382, buyDate:'2025-10-01',marketHash:'MP5-SD | Statics (Field-Tested)',             category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin007',name:'M249 Hypnosis (FT)',          type:'skin',   qty:396, buyPrice:0.2326, buyDate:'2025-10-01',marketHash:'M249 | Hypnosis (Field-Tested)',               category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin008',name:'SCAR-20 Trail Blazer (FT)',   type:'skin',   qty:418, buyPrice:0.2376, buyDate:'2025-10-01',marketHash:'SCAR-20 | Trail Blazer (Field-Tested)',        category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin009',name:'R8 Revolver Tango (FT)',      type:'skin',   qty:609, buyPrice:0.2348, buyDate:'2025-10-01',marketHash:'R8 Revolver | Tango (Field-Tested)',           category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
    {id:'gskin010',name:'AUG Luxe Trim (FT)',          type:'skin',   qty:796, buyPrice:0.2405, buyDate:'2025-10-01',marketHash:'AUG | Luxe Trim (Field-Tested)',               category:'gallery',notes:'Gallery Case Oct 2025',prices:null},
  ];
  let changed = false;
  newItems.forEach(item => {
    if (!existingH.some(h => h.id === item.id)) {
      existingH.push(item);
      changed = true;
    }
  });
  // Migration (v2.5.1): Elemental Craft papers have no "(Holo)" variant on Steam -
  // fix wrongly-stored market hashes so the Steam lookup hits first time (no strip-retry needed)
  const HASH_FIXES = {
    'Sticker | Bolt Strike (Holo)': 'Sticker | Bolt Strike',
    'Sticker | Bolt Charge (Holo)': 'Sticker | Bolt Charge',
    'Sticker | Boom Trail (Holo)':  'Sticker | Boom Trail',
    'Sticker | High Heat (Holo)':   'Sticker | High Heat',
  };
  existingH.forEach(h => {
    if (h.marketHash && HASH_FIXES[h.marketHash]) {
      console.log('[Migration] Fixing market hash: ' + h.marketHash + ' -> ' + HASH_FIXES[h.marketHash]);
      h.marketHash = HASH_FIXES[h.marketHash];
      changed = true;
    }
  });
  if (changed) {
    window._storeSet('cs2vault_holdings', JSON.stringify(existingH));
    holdings = existingH;
  }

  // Add WC1 trade history if missing
  const existingT = JSON.parse(window._store['cs2vault_history'] || '[]');
  const wc1Trades = [
    {id:'trade001',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:123.04,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade002',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:123.04,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade003',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:122.54,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade004',name:'CS:GO Weapon Case',        type:'case',   qty:1,buyPrice:80.261,  sellPrice:122.95,  sellDate:'2026-02-20',feePercent:2,platform:'csfloat'},
    {id:'trade005',name:'Gamma Case',               type:'case',   qty:1,buyPrice:790.09,  sellPrice:1356.62, sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade006',name:'FAMAS BAD TRIP (MW)',      type:'skin',   qty:1,buyPrice:4.08,    sellPrice:36.54,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade007',name:'FAMAS STYX (FN)',          type:'skin',   qty:1,buyPrice:31.27,   sellPrice:86.31,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade008',name:'Gallery Case',             type:'case',   qty:1,buyPrice:524.53,  sellPrice:911.06,  sellDate:'',feePercent:2,platform:'csfloat'},
    {id:'trade009',name:'STILETTO RUBY (MW)',       type:'knife',  qty:1,buyPrice:1279.24, sellPrice:1350.71, sellDate:'',feePercent:2,platform:'csfloat'},
    {id:'trade010',name:'Austin Contenders',        type:'sticker',qty:1,buyPrice:140.4,   sellPrice:253.6,   sellDate:'',feePercent:15,platform:'steam'},
    {id:'trade011',name:'G2 Austin (Holo)',         type:'sticker',qty:1,buyPrice:7.83,    sellPrice:11.25,   sellDate:'',feePercent:15,platform:'steam'},
  ];
  let tChanged = false;
  wc1Trades.forEach(t => {
    if (!existingT.some(h => h.id === t.id)) { existingT.push(t); tChanged = true; }
  });
  // Migration: backfill missing platform on older records (infer from fee rate).
  // 15% fee = Steam Market sale (excluded from CGT); anything else = CSFloat.
  existingT.forEach(t => {
    if (!t.platform) {
      t.platform = (t.feePercent != null && t.feePercent >= 13) ? 'steam' : 'csfloat';
      tChanged = true;
    }
  });
  if (tChanged) {
    window._storeSet('cs2vault_history', JSON.stringify(existingT));
    tradeHistory = existingT;
  }

  // Migration (v2.9.0): backfill FX provenance on all stored records.
  // Everything stored to date is GBP-native, so this is lossless:
  // origCurrency 'GBP', fxRate 1, origAmount = the stored GBP figure.
  try {
    let fxChanged = false;
    const backfill = (rec, amountField) => {
      if (rec && rec.origCurrency == null && rec[amountField] != null) {
        rec.origCurrency = 'GBP'; rec.fxRate = 1; rec.origAmount = rec[amountField];
        return true;
      }
      return false;
    };
    const hArr = JSON.parse(window._store['cs2vault_holdings'] || '[]');
    let hChanged = false;
    hArr.forEach(h => { if (backfill(h, 'buyPrice')) hChanged = true; });
    if (hChanged) { window._storeSet('cs2vault_holdings', JSON.stringify(hArr)); holdings = hArr; fxChanged = true; }

    const sArr = JSON.parse(window._store['cs2vault_skins'] || 'null');
    if (Array.isArray(sArr)) {
      let sChanged = false;
      sArr.forEach(s => { if (backfill(s, 'buyPrice')) sChanged = true; });
      if (sChanged) { window._storeSet('cs2vault_skins', JSON.stringify(sArr)); skins = sArr; fxChanged = true; }
    }

    const tArr = JSON.parse(window._store['cs2vault_history'] || '[]');
    let tFxChanged = false;
    tArr.forEach(t => { if (backfill(t, 'sellPrice')) tFxChanged = true; });
    if (tFxChanged) { window._storeSet('cs2vault_history', JSON.stringify(tArr)); tradeHistory = tArr; fxChanged = true; }

    if (fxChanged) console.log('[Migration] v2.9.0 FX provenance backfilled (GBP, rate 1)');
  } catch(e) { console.warn('[Migration] FX backfill failed:', e); }

  // Migration (v2.10.0): give every holding a lots[] array (Phase 2 cost basis).
  // Lossless — a holding without lots becomes a single lot from its existing
  // buyPrice/qty/buyDate + FX provenance. Lots become the source of truth for
  // tax; buyPrice/qty remain as the derived weighted-average mirror.
  try {
    const hArr = JSON.parse(window._store['cs2vault_holdings'] || '[]');
    let lotsChanged = false;
    hArr.forEach(h => {
      if (!Array.isArray(h.lots) || !h.lots.length) {
        h.lots = [ makeLot(h.qty, h.buyPrice, h.buyDate, h.origCurrency, h.fxRate, h.origAmount) ];
        lotsChanged = true;
      }
    });
    if (lotsChanged) {
      window._storeSet('cs2vault_holdings', JSON.stringify(hArr));
      holdings = hArr;
      console.log('[Migration] v2.10.0 lots backfilled on ' + hArr.length + ' holdings');
    }
  } catch(e) { console.warn('[Migration] lots backfill failed:', e); }
}
function initApp() {
  try { detectInstallState(); }        catch(e) { console.warn('[initApp] detectInstallState:', e); }
  // Vault Pro (Phase 4b): begin the no-card trial on a genuinely fresh install.
  try { ensureTrialStarted(); }        catch(e) { console.warn('[initApp] ensureTrialStarted:', e); }
  try { seedHistoricalSnapshots(); } catch(e) { console.warn('[initApp] seedHistoricalSnapshots:', e); }
  try { seedIfMissing(); }             catch(e) { console.warn('[initApp] seedIfMissing:', e); }
  try { holdings     = loadData(); }      catch(e) { console.warn('[initApp] loadData:', e); holdings = []; }
  try { tradeHistory = loadHistory(); }   catch(e) { console.warn('[initApp] loadHistory:', e); tradeHistory = []; }
  // Load play skins AFTER initStore so window._store is populated
  try {
    const storedSkins = loadSkins();
    // Fresh installs start with NO play skins (DEFAULT_SKINS is the developer's
    // personal set). Existing users keep theirs / get the default if unset.
    if (isFreshInstall()) {
      skins = storedSkins || [];
      if (!storedSkins) saveSkins(skins);
    } else {
      skins = storedSkins || DEFAULT_SKINS;
      if (!storedSkins) saveSkins(skins);
    }
    // One-time fix: patch Number K market hash and type if stored with old bare name
    let skinsPatched = false;
    skins.forEach(s => {
      if (s.id === 'skin010' || s.marketHash === 'Number K') {
        if (s.marketHash !== 'Number K | The Professionals') { s.marketHash = 'Number K | The Professionals'; skinsPatched = true; }
        if (s.type !== 'agent') { s.type = 'agent'; skinsPatched = true; }
      }
    });
    if (skinsPatched) saveSkins(skins);
  } catch(e) { console.warn('[initApp] loadSkins:', e); skins = isFreshInstall() ? [] : DEFAULT_SKINS; }
  try { seedNewItems(); }                 catch(e) { console.warn('[initApp] seedNewItems:', e); }
  try { populateCcySelects(); }           catch(e) { console.warn('[initApp] populateCcySelects:', e); }
  // Display currency: async — re-renders money-bearing views once the rate lands (GBP = instant)
  try { initDisplayCurrency().then(() => { if (_displayCcy !== 'GBP') { try { renderHoldings(); updateStats(); renderSkins(); } catch(e){} } }); } catch(e) { console.warn('[initApp] initDisplayCurrency:', e); }
  try { renderHoldings(); }               catch(e) { console.warn('[initApp] renderHoldings:', e); }
  try { updateStats(); }                  catch(e) { console.warn('[initApp] updateStats:', e); }
  try { checkApiStatus(); }               catch(e) { console.warn('[initApp] checkApiStatus:', e); }
  try { checkTargetsOnLoad(); }           catch(e) { console.warn('[initApp] checkTargetsOnLoad:', e); }
  try { cleanupSnapshotArtifacts(); }     catch(e) { console.warn('[initApp] cleanupSnapshotArtifacts:', e); }
  try { checkAutoSnapshot(); }            catch(e) { console.warn('[initApp] checkAutoSnapshot:', e); }
  try { seedValueHistoryFromSnapshots(); } catch(e) { console.warn('[initApp] seedValueHistory:', e); }
  try { recordValueSnapshot(); }          catch(e) { console.warn('[initApp] recordValueSnapshot:', e); }
  try { pruneValueHistory(); }            catch(e) { console.warn('[initApp] pruneValueHistory:', e); }
  try { prunePriceLog(); }                catch(e) { console.warn('[initApp] prunePriceLog:', e); }
  try { pruneCaseSupply(); }              catch(e) { console.warn('[initApp] pruneCaseSupply:', e); }
  try { initSteamAutocomplete(); }        catch(e) { console.warn('[initApp] initSteamAutocomplete:', e); }
  try { initAutoRefresh(); }              catch(e) { console.warn('[initApp] initAutoRefresh:', e); }
  try {
    const arEl = document.getElementById('settingsAutoRefresh');
    if (arEl) arEl.value = String(getAutoRefreshHours());
  } catch(e) { console.warn('[initApp] autoRefresh dropdown:', e); }
  try { syncCostBasisSettingsUI(); } catch(e) { console.warn('[initApp] costBasis UI:', e); }
  // Pro tier UI sync — reflect override state and lock state across Settings.
  try { syncProUI(); }            catch(e) { console.warn('[initApp] syncProUI:', e); }
  // Vault Pro (Phase 4b): re-validate a stored licence in the background. Never
  // blocks the UI; honours the offline-grace window on any network failure.
  try { refreshLicenceIfDue().catch(()=>{}); } catch(e) { console.warn('[initApp] refreshLicence:', e); }
  try { syncDisplayCcyLock(); }   catch(e) { console.warn('[initApp] displayCcyLock:', e); }
  try { syncJurisdictionLock(); } catch(e) { console.warn('[initApp] jurisdictionLock:', e); }
  // First-run onboarding wizard — only on a genuinely fresh install, once.
  try { maybeStartOnboarding(); } catch(e) { console.warn('[initApp] onboarding:', e); }
  try {
    const apiEl = document.getElementById('apiKeyInput');
    if (apiEl) apiEl.value = getApiKey() || '';
  } catch(e) { console.warn('[initApp] apiKeyInput:', e); }
  if (typeof window.cs2vault !== 'undefined') {
    window.cs2vault.version().then(v => { document.title = `CS2 Vault v${v}`; }).catch(() => {});
    // Auto-updater listeners — silent download bar + auto-restart
    if (window.cs2vault.updater) {
      window.cs2vault.updater.onStatus((status, detail) => {
        const bar = document.getElementById('updateBar');
        const label = document.getElementById('updateBarLabel');
        if (!bar || !label) return;
        if (status === 'available') {
          label.textContent = 'Downloading update v' + detail + '...';
          bar.classList.add('show');
        } else if (status === 'ready') {
          label.textContent = 'Update ready — restarting in ';
          const fill = document.getElementById('updateBarFill');
          const countdown = document.getElementById('updateBarCountdown');
          if (fill) fill.style.width = '100%';
          if (countdown) countdown.textContent = '3s';
          let secs = 3;
          const tick = setInterval(() => {
            secs--;
            if (secs <= 0) {
              clearInterval(tick);
              if (countdown) countdown.textContent = '0s';
              window.cs2vault.updater.install();
            } else {
              if (countdown) countdown.textContent = secs + 's';
            }
          }, 1000);
        } else if (status === 'up-to-date' || status === 'error') {
          bar.classList.remove('show');
          if (status === 'error') console.warn('[Updater] Error:', detail);
        }
      });
      window.cs2vault.updater.onProgress((pct) => {
        const fill = document.getElementById('updateBarFill');
        const label = document.getElementById('updateBarLabel');
        if (fill) fill.style.width = pct + '%';
        if (label && label.textContent.indexOf('restarting') === -1) {
          label.textContent = 'Downloading update... ' + pct + '%';
        }
      });
    }
  }
  console.log('[App] Initialised — holdings:', holdings.length, 'trades:', tradeHistory.length);
}
