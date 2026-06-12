
// ========================
// TARGET PRICE
// ========================
function openTargetModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('targetItemId').value = id;
  document.getElementById('targetItemName').textContent = item.name;
  const best = getBestPrice(item);
  document.getElementById('targetCurrentPrice').textContent = best ? '£' + best.toFixed(3) : '—';
  document.getElementById('targetBuyPrice').textContent = '£' + item.buyPrice.toFixed(3);
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
  const totalGain = ((target - item.buyPrice) * item.qty).toFixed(2);
  const best = getBestPrice(item);
  const distance = best ? ((target - best) / best * 100).toFixed(1) : null;
  preview.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
      <div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Gain vs buy price</div><div style="color:var(--green);font-weight:700;">+${gain}% (+£${totalGain})</div></div>
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
    toast(`Target set: £${target.toFixed(3)} for ${item.name}`, 'success');
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

function recordPrice(itemId, prices) {
  if (!prices || !itemId) return;
  const log = loadPriceLog();
  const entry = {
    id: itemId,
    ts: Date.now(),
    best: null,
    cf: null,  // csfloat
    stm: null, // steam
  };
  if (prices.platforms) {
    entry.cf  = prices.platforms.csfloat?.lowest || null;
    entry.stm = prices.platforms.steam?.lowest || null;
  }
  // Best price = lowest across platforms, fallback to top-level
  const candidates = [entry.cf, entry.stm].filter(v => v != null && v > 0);
  entry.best = candidates.length ? Math.min(...candidates) : (prices.lowest || prices.avg7d || null);

  if (entry.best === null) return; // Don't log if no price at all

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
  const match = html.match(/var line1=(\[.+?\]);/);
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
    const res = await window.cs2vault.fetch(url, {});
    if (res.status !== 200) {
      console.warn(`[SteamHistory] ${marketHashName}: HTTP ${res.status}`);
      return null;
    }
    const data = parseSteamPriceHistory(res.body);
    if (!data || data.length === 0) {
      console.warn(`[SteamHistory] ${marketHashName}: No price data found in HTML`);
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

    saveSteamHistory(stored);
    // Rate limit — Steam is sensitive, 3.5s between calls
    await sleep(3500);
  }

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
  const localData = log.filter(e => e.id === itemId && e.ts > cutoff).sort((a, b) => a.ts - b.ts);

  // Also try Steam historical data if local data is sparse
  const item = holdings.find(h => h.id === itemId) || (skins ? skins.find(s => s.id === itemId) : null);
  if (item?.marketHash) {
    const steamData = getSteamHistoryForChart(item.marketHash, days);
    if (steamData.length > localData.length) {
      // Convert Steam data to same format as local price log
      // Steam prices are in the user's currency (GBP for UK accounts)
      return steamData.map(p => ({
        id: itemId,
        ts: p.ts,
        best: p.price,
        cf: null,
        stm: p.price,
        sp: null,
      }));
    }
  }

  return localData;
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
        callback: v => '£' + Number(v).toFixed(2),
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
              if (ctx.raw != null) return `${ctx.dataset.label}: £${Number(ctx.raw).toFixed(3)}`;
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
      <div class="ph-stat"><div class="ph-stat-label">Current</div><div class="ph-stat-val">£${current.toFixed(3)}</div></div>
      <div class="ph-stat"><div class="ph-stat-label">Change</div><div class="ph-stat-val" style="color:${changeColor};">${change >= 0 ? '+' : ''}${change.toFixed(1)}%</div></div>
      <div class="ph-stat"><div class="ph-stat-label">High</div><div class="ph-stat-val" style="color:var(--green);">£${hi.toFixed(3)}</div></div>
      <div class="ph-stat"><div class="ph-stat-label">Low</div><div class="ph-stat-val" style="color:var(--red);">£${lo.toFixed(3)}</div></div>
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
// Shared GBP rate cache
let _gbpRate = null;
let _gbpRatePromise = null; // in-flight memo so parallel CSFloat calls share ONE FX fetch
async function getGBPRate() {
  if (_gbpRate) return _gbpRate;
  if (_gbpRatePromise) return _gbpRatePromise;
  _gbpRatePromise = (async () => {
    try {
      const fx = await window.cs2vault.fetch('https://open.er-api.com/v6/latest/USD');
      if (fx.ok) { const d = JSON.parse(fx.body); _gbpRate = d.rates?.GBP || 0.79; }
      else _gbpRate = 0.79;
    } catch(e) { _gbpRate = 0.79; }
    console.log(`[FX] GBP rate: ${_gbpRate}`);
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

  // Try priceoverview first (currency=2 = GBP, no conversion needed)
  try {
    const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=2&market_hash_name=${encoded}`;
    const res = await window.cs2vault.fetch(url);
    res.json = () => Promise.resolve(JSON.parse(res.body)); res.ok = res.status >= 200 && res.status < 300;
    console.log(`[Steam] priceoverview ${res.status} for ${marketHashName}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const parseGBP = s => {
          if (!s) return null;
          const cleaned = s.replace(/[^0-9.]/g, '');
          const val = parseFloat(cleaned);
          return isNaN(val) ? null : val;
        };
        const lowest   = parseGBP(data.lowest_price);
        const lastSold = parseGBP(data.median_price);
        console.log(`[Steam] priceoverview lowest=£${lowest?.toFixed(4)}, median=£${lastSold?.toFixed(4)}`);
        if (lowest != null || lastSold != null) {
          return { lowest, lastSold, avg7d: null, source: 'steam' };
        }
        console.log(`[Steam] priceoverview no prices for ${marketHashName}, trying HTML fallback`);
      }
    }
  } catch(e) {
    console.warn(`[Steam] priceoverview failed for ${marketHashName}:`, e.message);
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
    let stm = await fetchSteamPrices(steamHash);
    // If no result and the hash ends with a variant suffix, try stripping it
    if (!stm && item.type === 'sticker') {
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
      try { st.steam = await fetchSteamLane(it); } catch(e) { /* lane already logs */ }
      st.stDone = true;
      finalize(st);
      delay = st.steam ? (opts.steamDelayMs || STEAM_BASE_DELAY_MS) : Math.min(delay * 2, 6000);
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
  try {
    if (staleHoldings.length) {
      const r = await runTwoLaneRefresh(staleHoldings, {
        onProgress: (done, total) => { if (btn) { btn.innerHTML = `<span class="loading-spinner"></span> Auto ${done}/${total}`; btn.disabled = true; } },
        onItemDone: (item, prices) => {
          if (prices) { item.prices = prices; recordPrice(item.id, prices); }
          saveData(holdings);
          renderHoldings();
        },
      });
      updated += r.updated;
    }
    if (staleSkins.length) {
      const r = await runTwoLaneRefresh(staleSkins, {
        onItemDone: (skin, prices) => mergeSkinPrices(skin, prices),
      });
      updated += r.updated;
    }
  } finally {
    _refreshBusy = false;
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
  try {
    res = await runTwoLaneRefresh(work, {
      onProgress: (done, total) => { btn.innerHTML = `<span class="loading-spinner"></span> ${done}/${total} ${scopeLabel}`; },
      onItemDone: (item, prices) => {
        if (prices) { item.prices = prices; recordPrice(item.id, prices); }
        saveData(holdings);
        renderHoldings();
      },
    });
  } finally {
    _refreshBusy = false;
    btn.innerHTML = '↻ Refresh Prices';
    btn.disabled = false;
  }
  captureHeatmapSnapshot();
  if (heatmapVisible) renderHeatmap();
  updateStats();
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
  if (prices) { item.prices = { ...prices, fetchedAt: Date.now() }; recordPrice(item.id, prices); toast(`Updated: ${item.name}`, 'success'); }
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
  const fmt = v => v != null ? `£${Number(v).toFixed(2)}` : '—';

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
    const fmt = v => v != null ? `£${Number(v).toFixed(2)}` : '<span class="price-loading">—</span>';
    const best = getBestPrice(item);
    const pnl = best != null ? (best - item.buyPrice) * item.qty : null;
    const pnlPct = best != null ? ((best - item.buyPrice) / item.buyPrice * 100) : null;
    const pnlHtml = pnl != null
      ? `<span class="pnl-pill ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pnl >= 0 ? '▲' : '▼'} £${Math.abs(pnl).toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>`
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
        targetHtml = `<div class="target-hit" title="Target £${target.toFixed(2)} REACHED!">🎯 £${target.toFixed(2)} ✓</div>`;
      } else {
        targetHtml = `<div class="target-progress" title="Target: £${target.toFixed(2)}">
          <span style="font-size:10px;color:var(--text3);">🎯 £${target.toFixed(2)} <span style="color:var(--orange)">${pct.toFixed(1)}%</span></span>
          <div style="height:3px;background:var(--border);border-radius:2px;margin-top:2px;">
            <div style="width:${progress}%;height:100%;background:var(--orange);border-radius:2px;transition:width 0.3s;"></div>
          </div>
        </div>`;
      }
    }

    return `<tr data-id="${item.id}" ${target && best && best >= target ? 'style="border-left:3px solid var(--green);"' : ''}>
      <td><div class="item-name">${escHtml(item.name)}${item.isTuf ? '<span class="tuf-badge">TUF</span>' : ''}<small>${item.notes ? escHtml(item.notes.slice(0,50)) : (item.marketHash ? '🔗 Auto-price' : '⚠️ No market hash')}</small>${targetHtml}${buildSparkline(item.id)}</div></td>
      <td><span class="type-badge ${typeBadge[item.type]}">${typeLabels[item.type]}</span></td>
      <td class="mono">${item.qty}</td>
      <td class="mono">£${Number(item.buyPrice).toFixed(2)}</td>
      <td class="mono">${item.buyDate || '—'}</td>
      <td class="mono">£${(item.buyPrice * item.qty).toFixed(2)}</td>
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
  document.getElementById('stat-invested').textContent = `£${invested.toFixed(2)}`;
  document.getElementById('stat-items').textContent = `${items} item${items !== 1 ? 's' : ''}`;
  document.getElementById('stat-value').textContent = `£${afterFee.toFixed(2)}`;
  document.getElementById('stat-after-fee').textContent = `£${value.toFixed(2)} gross`;
  const pnlEl = document.getElementById('stat-pnl');
  pnlEl.textContent = `${pnl >= 0 ? '+' : ''}£${pnl.toFixed(2)}`;
  pnlEl.className = `stat-value ${pnl >= 0 ? 'positive' : 'negative'}`;
  document.getElementById('stat-pnl-card').className = `stat-card ${pnl >= 0 ? 'green' : 'red'}`;
  document.getElementById('stat-pnl-pct').textContent = `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
  document.getElementById('stat-realised').textContent = `${realised >= 0 ? '+' : ''}£${realised.toFixed(2)}`;
  document.getElementById('stat-trades').textContent = `${tradeHistory.length} trade${tradeHistory.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-fees').textContent = `£${fees.toFixed(2)}`;
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
      'title="' + b.label + ': £' + totals[b.key].toFixed(0) + ' (' + pct.toFixed(1) + '%)" ' +
      'style="width:' + pct + '%;background:' + b.color + ';cursor:' + (b.filter ? 'pointer' : 'default') + ';' +
      (dim ? 'opacity:.25;' : '') + 'transition:opacity .15s;"></div>';
  }).join('');

  document.getElementById('allocLegend').innerHTML = active.map(b => {
    const pct = (totals[b.key] / total) * 100;
    const dim = curFilter && curFilter !== b.filter;
    return '<span onclick="allocFilterClick(\'' + (b.filter || '') + '\')" ' +
      'style="display:inline-flex;align-items:center;gap:5px;font-family:\'Share Tech Mono\',monospace;font-size:10px;color:var(--text2);cursor:' + (b.filter ? 'pointer' : 'default') + ';' + (dim ? 'opacity:.35;' : '') + '">' +
      '<span style="width:8px;height:8px;border-radius:2px;background:' + b.color + ';display:inline-block;"></span>' +
      b.label + ' <span style="color:var(--text3)">' + pct.toFixed(1) + '% · £' + totals[b.key].toFixed(0) + '</span></span>';
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
const CGT_ALLOWANCE = 3000; // £3,000 for 2024/25 and 2025/26 tax years
const CGT_RATES = { basic: 18, higher: 24 };

function getCurrentTaxYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // UK tax year: 6 April to 5 April
  if (month >= 4 && now.getDate() >= 6 || month > 4) return `${year}/${year + 1}`;
  return `${year - 1}/${year}`;
}

function getTaxYearStart() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month > 4 || (month === 4 && now.getDate() >= 6)) return `${year}-04-06`;
  return `${year - 1}-04-06`;
}

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

function calculateCGT() {
  const taxYearStart = getTaxYearStart();
  const taxYear = getCurrentTaxYear();

  // Helper: roll up gains/losses for a given set of trades
  const rollup = (trades) => {
    let totalGains = 0, totalLosses = 0, totalFees = 0, tradeCount = 0;
    trades.forEach(t => {
      const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
      const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
      const costBasis = t.buyPrice * t.qty;
      const gain = gross - fee - costBasis;
      totalFees += fee;
      if (gain > 0) totalGains += gain;
      else totalLosses += Math.abs(gain);
      tradeCount++;
    });
    const netGain = totalGains - totalLosses;
    const taxableGain = Math.max(0, netGain - CGT_ALLOWANCE);
    const allowanceUsed = Math.min(Math.max(0, netGain), CGT_ALLOWANCE);
    const allowancePct = Math.min(100, (allowanceUsed / CGT_ALLOWANCE) * 100);
    const taxBasic = taxableGain * (CGT_RATES.basic / 100);
    const taxHigher = taxableGain * (CGT_RATES.higher / 100);
    return { totalGains, totalLosses, totalFees, netGain, taxableGain, allowanceUsed, allowancePct, taxBasic, taxHigher, tradeCount };
  };

  const inYear = tradeHistory.filter(t => t.sellDate >= taxYearStart);

  // CURRENT app position: exclude Steam Market sales (Steam Wallet ≠ taxable disposal).
  // Platform is inferred from the fee rate for older records lacking an explicit field.
  const yearTrades = inYear.filter(t => tradePlatform(t) !== 'steam');
  const exclSteam = rollup(yearTrades);

  // HYPOTHETICAL position: include ALL sales (treats Steam-to-Steam as a disposal too).
  const inclSteam = rollup(inYear);

  return Object.assign({ taxYear, taxYearStart, yearTrades, inYear, inclSteam }, exclSteam);
}

function renderCGTSummary() {
  const el = document.getElementById('cgtSummary');
  if (!el) return;
  if (!tradeHistory.length) { el.innerHTML = ''; return; }

  const cgt = calculateCGT();
  const barColor = cgt.allowancePct >= 90 ? 'var(--red)' : cgt.allowancePct >= 60 ? 'var(--accent)' : 'var(--green)';
  const incl = cgt.inclSteam;
  const inclBarColor = incl.allowancePct >= 90 ? 'var(--red)' : incl.allowancePct >= 60 ? 'var(--accent)' : 'var(--green)';
  const steamDiffers = incl.tradeCount !== cgt.tradeCount;

  el.innerHTML = `
    <div class="cgt-summary">
      <div class="cgt-card">
        <div class="cgt-card-label">Tax Year</div>
        <div class="cgt-card-val" style="font-size:14px;">${cgt.taxYear}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${cgt.tradeCount} taxable disposal${cgt.tradeCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Realised Gains</div>
        <div class="cgt-card-val" style="color:var(--green);">+£${cgt.totalGains.toFixed(2)}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Realised Losses</div>
        <div class="cgt-card-val" style="color:var(--red);">-£${cgt.totalLosses.toFixed(2)}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Net Gain</div>
        <div class="cgt-card-val" style="color:${cgt.netGain >= 0 ? 'var(--green)' : 'var(--red)'};">${cgt.netGain >= 0 ? '+' : ''}£${cgt.netGain.toFixed(2)}</div>
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Allowance Used</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="cgt-card-val" style="font-size:14px;">£${cgt.allowanceUsed.toFixed(0)} / £${CGT_ALLOWANCE.toLocaleString()}</div>
          <span class="plat-badge plat-badge-cf" style="font-size:8px;">CSFloat only</span>
        </div>
        <div class="cgt-allowance-bar"><div class="cgt-allowance-fill" style="width:${cgt.allowancePct}%;background:${barColor};"></div></div>
        ${steamDiffers ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
          <div class="cgt-card-val" style="font-size:13px;color:var(--text2);">£${incl.allowanceUsed.toFixed(0)} / £${CGT_ALLOWANCE.toLocaleString()}</div>
          <span class="plat-badge plat-badge-stm" style="font-size:8px;">incl. Steam</span>
        </div>
        <div class="cgt-allowance-bar" style="opacity:.55;"><div class="cgt-allowance-fill" style="width:${incl.allowancePct}%;background:${inclBarColor};"></div></div>
        <div style="font-size:8px;color:var(--text3);margin-top:3px;">hypothetical if Steam sales counted (${incl.tradeCount} disposals)</div>
        ` : ''}
      </div>
      <div class="cgt-card">
        <div class="cgt-card-label">Est. Tax Owed</div>
        <div class="cgt-card-val" style="color:${cgt.taxableGain > 0 ? 'var(--red)' : 'var(--green)'};">${cgt.taxableGain > 0 ? '£' + cgt.taxBasic.toFixed(2) + ' – £' + cgt.taxHigher.toFixed(2) : '£0.00'}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px;">${cgt.taxableGain > 0 ? '18% basic / 24% higher' : 'Within allowance'}</div>
        ${steamDiffers && incl.taxableGain > 0 ? `<div style="font-size:8px;color:var(--text3);margin-top:4px;">incl. Steam: £${incl.taxBasic.toFixed(2)} – £${incl.taxHigher.toFixed(2)}</div>` : ''}
      </div>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:8px;font-family:'Share Tech Mono',monospace;text-align:center;">
      ⚠ Estimated only. The app's position: Steam Wallet sales aren't taxable; CGT applies on real-money cashout. The "incl. Steam" figure shows the stricter reading where a Steam-to-Steam disposal also counts — an unsettled area. Consult a tax professional.
    </div>`;
}

// ========================
// CGT TAX REPORT EXPORT
// ========================
async function exportCGTReport() {
  const cgt = calculateCGT();
  const rows = [
    ['CS2 Vault — Capital Gains Tax Report'],
    [`Tax Year: ${cgt.taxYear}`],
    [`Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`],
    [''],
    ['SUMMARY'],
    [`Total Realised Gains,£${cgt.totalGains.toFixed(2)}`],
    [`Total Realised Losses,-£${cgt.totalLosses.toFixed(2)}`],
    [`Total Fees Paid,£${cgt.totalFees.toFixed(2)}`],
    [`Net Gain/Loss,£${cgt.netGain.toFixed(2)}`],
    [`Annual CGT Allowance,£${CGT_ALLOWANCE.toFixed(2)}`],
    [`Allowance Used,£${cgt.allowanceUsed.toFixed(2)}`],
    [`Taxable Gain,£${cgt.taxableGain.toFixed(2)}`],
    [`Estimated Tax (Basic 18%),£${cgt.taxBasic.toFixed(2)}`],
    [`Estimated Tax (Higher 24%),£${cgt.taxHigher.toFixed(2)}`],
    [''],
    ['DISPOSALS'],
    ['Date,Item,Type,Qty,Platform,Cost Basis (£),Gross Proceeds (£),Platform Fee %,Fee Amount (£),Net Realised (£),Gain/Loss (£)'],
  ];

  cgt.yearTrades.forEach(t => {
    const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
    const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
    const netRealised = (t.netRealised != null) ? t.netRealised : gross - fee;
    const costBasis = t.buyPrice * t.qty;
    const gain = gross - fee - costBasis;
    rows.push([
      t.sellDate, `"${t.name}"`, t.type, t.qty, tradePlatform(t),
      costBasis.toFixed(2), gross.toFixed(2), t.feePercent,
      fee.toFixed(2), netRealised.toFixed(2), gain.toFixed(2)
    ].join(','));
  });

  rows.push('');
  rows.push('DISCLAIMER');
  rows.push('"This report is for informational purposes only and does not constitute tax advice. Selling on Steam Market into Steam Wallet balance is not a taxable disposal. CGT applies when items are sold for real money (e.g. via CSFloat). Consult a qualified tax professional for advice specific to your situation."');

  const csvStr = rows.join('\n');
  if (typeof window.cs2vault !== 'undefined') {
    const result = await window.cs2vault.exportSave(`cs2vault_cgt_report_${cgt.taxYear.replace('/', '-')}.csv`, csvStr);
    if (result && result.saved) toast('CGT report saved to ' + result.filePath, 'success');
  }
}

// ========================
// CASH OUT CALCULATOR
// ========================
function openCashOutCalc() {
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
        <div class="co-step-val">£${steamSell.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">Steam fee (15%)</span></div>
        <div class="co-step-fee">-£${steamTax.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">2️⃣ Steam Wallet balance</div>
        <div class="co-step-val">£${steamWallet.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">3️⃣ Buy bridge skin on Steam → sell on CSFloat</div>
        <div class="co-step-val">£${csfloatSellActual.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">CSFloat seller fee (${csfloatFee}%)</span></div>
        <div class="co-step-fee">-£${csfloatFeeAmt.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label">4️⃣ After CSFloat fee</div>
        <div class="co-step-val">£${afterCsfloatFee.toFixed(2)}</div>
      </div>
      <div class="co-step">
        <div class="co-step-label"><span class="co-step-fee">Withdrawal fee (${withdrawFee}%)</span></div>
        <div class="co-step-fee">-£${withdrawFeeAmt.toFixed(2)}</div>
      </div>
    </div>
    <div class="co-final">
      <div>
        <div class="co-final-label">Cash in Hand</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Total fees: £${totalFees.toFixed(2)} (${totalLossPct.toFixed(1)}% loss)</div>
      </div>
      <div class="co-final-val" style="color:var(--green);">£${cashInHand.toFixed(2)}</div>
    </div>`;

  // CGT estimate
  if (showCgt) {
    const cgtRate = parseInt(document.getElementById('coCgtBand').value) || 18;
    const cgt = calculateCGT();
    const remainingAllowance = Math.max(0, CGT_ALLOWANCE - cgt.allowanceUsed);
    // The gain from this cash-out would be: cash received - original cost of the items
    // We don't know the original cost here, so show the gain on the bridge skin only
    const bridgeGain = csfloatSellActual - steamWallet; // Usually negative (loss on the bridge)
    const totalTaxableAfterThis = Math.max(0, cgt.netGain + bridgeGain - CGT_ALLOWANCE);
    const estimatedTax = totalTaxableAfterThis * (cgtRate / 100);

    resultHtml += `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 20px;margin-top:12px;">
        <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">CGT Estimate (${cgtRate}% rate)</div>
        <div class="co-step">
          <div class="co-step-label">Current year realised gains</div>
          <div class="co-step-val">£${cgt.netGain.toFixed(2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">Remaining allowance</div>
          <div class="co-step-val" style="color:var(--green);">£${remainingAllowance.toFixed(2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">Taxable amount (if any)</div>
          <div class="co-step-val" style="color:${totalTaxableAfterThis > 0 ? 'var(--red)' : 'var(--green)'};">£${totalTaxableAfterThis.toFixed(2)}</div>
        </div>
        <div class="co-step">
          <div class="co-step-label">Estimated tax owed</div>
          <div class="co-step-val" style="color:${estimatedTax > 0 ? 'var(--red)' : 'var(--green)'};">£${estimatedTax.toFixed(2)}</div>
        </div>
        <div style="font-size:9px;color:var(--text3);margin-top:8px;">⚠ Steam Wallet sales are NOT taxable events. Only real-money cashouts via CSFloat count towards CGT.</div>
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
  c.innerHTML = sorted.map(t => {
    const gross = (t.gross != null) ? t.gross : t.sellPrice * t.qty;
    const fee = (t.feeAmount != null) ? t.feeAmount : gross * (t.feePercent / 100);
    const netRealised = (t.netRealised != null) ? t.netRealised : gross - fee;
    const net = netRealised - (t.buyPrice * t.qty);
    const plat = tradePlatform(t);
    const platHtml = '<span class="plat-badge ' + (platBadgeClass[plat] || 'plat-badge-cf') + '">' + (platLabel[plat] || plat) + '</span>';
    const countsCGT = plat !== 'steam';
    const cgtBadge = countsCGT
      ? '<span class="cgt-tag cgt-tag-yes" title="Counts toward CGT">✓ CGT</span>'
      : '<span class="cgt-tag cgt-tag-no" title="Excluded from CGT (Steam Wallet sale)">✕ not CGT</span>';
    return '<div class="sold-card">' +
      '<div><strong>' + escHtml(t.name) + '</strong>' +
      '<div class="sold-date">' + t.sellDate + ' · Qty: ' + t.qty + ' · ' + platHtml + ' ' + cgtBadge + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Buy</div><div class="sold-col-val">£' + Number(t.buyPrice).toFixed(2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Sell</div><div class="sold-col-val">£' + Number(t.sellPrice).toFixed(2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Fee (' + t.feePercent + '%)</div><div class="sold-col-val negative">-£' + fee.toFixed(2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Realised</div><div class="sold-col-val">£' + netRealised.toFixed(2) + '</div></div>' +
      '<div class="sold-col"><div class="sold-col-label">Net Profit</div><div class="sold-col-val ' + (net >= 0 ? 'positive' : 'negative') + '">' + (net >= 0 ? '+' : '') + '£' + net.toFixed(2) + '</div></div>' +
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
  document.getElementById('analyticsType').innerHTML = Object.entries(typeData).map(([type, d]) => {
    const pnl = d.value - d.invested;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <div><span class="type-badge ${typeBadge[type]}">${typeLabels[type]}</span> <span style="font-size:11px;color:var(--text3);margin-left:6px;">${d.count} items</span></div>
      <div style="text-align:right;"><div class="mono" style="font-size:12px;">£${d.invested.toFixed(2)} in</div><div class="mono ${pnl >= 0 ? 'positive' : 'negative'}" style="font-size:11px;">${pnl >= 0 ? '+' : ''}£${pnl.toFixed(2)}</div></div>
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:13px;">No data</p>';

  const withPrices = holdings.filter(h => getBestPrice(h) != null);
  withPrices.sort((a,b) => ((getBestPrice(b)-b.buyPrice)/b.buyPrice) - ((getBestPrice(a)-a.buyPrice)/a.buyPrice));
  const rankClasses = ['rank-1','rank-2','rank-3','rank-n','rank-n'];
  const perfRow = (h, i, isBottom) => {
    const pct = (getBestPrice(h) - h.buyPrice) / h.buyPrice * 100;
    const abs = (getBestPrice(h) - h.buyPrice) * h.qty;
    return `<div class="performer-row">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="rank-badge ${i < 3 ? rankClasses[i] : 'rank-n'}">${i+1}</span>
        <div><div style="font-size:12px;font-weight:600;">${escHtml(h.name.slice(0,30))}</div>
        <div style="font-size:10px;color:var(--text3);font-family:'Share Tech Mono',monospace;">£${(h.buyPrice*h.qty).toFixed(0)} invested · qty ${h.qty}</div></div>
      </div>
      <div style="text-align:right;">
        <span class="pnl-pill ${pct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>
        <div style="font-size:10px;font-family:'Share Tech Mono',monospace;margin-top:3px;${abs>=0?'color:var(--green)':'color:var(--red);'}">£${abs >= 0 ? '+' : ''}${abs.toFixed(2)}</div>
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
      <span class="pnl-pill ${d.profit>=0?'pnl-pos':'pnl-neg'}">${d.profit>=0?'+':''}£${d.profit.toFixed(2)}</span></div>
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
              return ` £${ctx.raw.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
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
          <span style="color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'};">${pnl >= 0 ? '+' : ''}£${pnl.toFixed(0)}</span>
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
  document.getElementById('itemBuyPrice').value = item.buyPrice;
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
  document.getElementById('topupCurrAvg').textContent   = `£${item.buyPrice.toFixed(3)}`;
  document.getElementById('topupCurrTotal').textContent = `£${(item.qty * item.buyPrice).toFixed(2)}`;

  // Reset inputs
  document.getElementById('topupQty').value   = '';
  document.getElementById('topupPrice').value = '';
  document.getElementById('topupDate').value  = todayStr();
  document.getElementById('topupPreview').style.display = 'none';

  openModal('topupModal');
}

function updateTopupPreview() {
  const id    = document.getElementById('topupId').value;
  const item  = holdings.find(h => h.id === id);
  if (!item) return;

  const addQty   = parseInt(document.getElementById('topupQty').value)    || 0;
  const addPrice = parseFloat(document.getElementById('topupPrice').value) || 0;

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
  document.getElementById('topupNewAvg').textContent   = `£${newAvg.toFixed(3)}`;
  document.getElementById('topupNewTotal').textContent = `£${newTotal.toFixed(2)}`;

  const direction = priceDiff > 0 ? 'above' : priceDiff < 0 ? 'below' : 'at';
  const diffColor = priceDiff < 0 ? 'var(--green)' : priceDiff > 0 ? 'var(--red)' : 'var(--text3)';
  document.getElementById('topupAvgNote').innerHTML =
    `Buying <strong>${addQty.toLocaleString()}</strong> units at £${addPrice.toFixed(3)} — ` +
    `<span style="color:${diffColor};">${Math.abs(diffPct).toFixed(1)}% ${direction} your current avg</span>. ` +
    `Avg cost basis moves from £${item.buyPrice.toFixed(3)} → £${newAvg.toFixed(3)}.`;

  document.getElementById('topupPreview').style.display = 'block';
}

function saveTopup() {
  const id       = document.getElementById('topupId').value;
  const item     = holdings.find(h => h.id === id);
  if (!item) return;

  const addQty   = parseInt(document.getElementById('topupQty').value);
  const addPrice = parseFloat(document.getElementById('topupPrice').value);
  const date     = document.getElementById('topupDate').value;

  if (!addQty || addQty <= 0)                { toast('Enter a valid quantity', 'error'); return; }
  if (!addPrice || addPrice <= 0)             { toast('Enter a valid price', 'error');    return; }

  const oldTotal = item.qty * item.buyPrice;
  const newQty   = item.qty + addQty;
  const newAvg   = (oldTotal + addQty * addPrice) / newQty;

  // Update the holding — weighted average buy price, combined qty
  item.qty      = newQty;
  item.buyPrice = +newAvg.toFixed(4);
  // Update date to most recent purchase if newer
  if (date && (!item.buyDate || date > item.buyDate)) item.buyDate = date;
  // Append note about the top-up
  const topupNote = `+${addQty.toLocaleString()} @ £${addPrice.toFixed(3)} on ${date}`;
  item.notes = item.notes ? item.notes + ' | ' + topupNote : topupNote;

  saveData(holdings);
  renderHoldings();
  updateStats();
  closeModal('topupModal');
  toast(`Added ${addQty.toLocaleString()} × ${item.name} @ £${addPrice.toFixed(3)} — new avg £${newAvg.toFixed(3)}`, 'success');
}

function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const buyPrice = parseFloat(document.getElementById('itemBuyPrice').value);
  if (!name || isNaN(buyPrice) || buyPrice <= 0) { toast('Fill in Name and Buy Price', 'error'); return; }
  const obj = {
    name, type: document.getElementById('itemType').value,
    qty: parseInt(document.getElementById('itemQty').value) || 1,
    buyPrice, buyDate: document.getElementById('itemBuyDate').value,
    marketHash: document.getElementById('itemMarketHash').value.trim(),
    notes: document.getElementById('itemNotes').value.trim(),
    isTuf: document.getElementById('itemIsTuf').checked
  };
  const editId = document.getElementById('editId').value;
  if (editId) { const item = holdings.find(h => h.id === editId); if (item) Object.assign(item, obj); }
  else holdings.push({ id: uid(), ...obj, prices: null });
  saveData(holdings); renderHoldings(); updateStats(); closeModal('itemModal');
  toast(editId ? 'Item updated' : 'Item added!', 'success');
}
function deleteItem(id) {
  if (!confirm('Delete this holding?')) return;
  holdings = holdings.filter(h => h.id !== id);
  saveData(holdings); renderHoldings(); updateStats(); toast('Removed', 'info');
}
function openSellModal(id) {
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  document.getElementById('sellItemId').value = id;
  document.getElementById('sellItemName').value = item.name;
  document.getElementById('sellQty').value = item.qty;
  document.getElementById('sellQty').max = item.qty;
  document.getElementById('sellPrice').value = getBestPrice(item) ? getBestPrice(item).toFixed(2) : '';
  document.getElementById('sellDate').value = todayStr();
  document.getElementById('sellFee').value = '2';
  // Reset to defaults
  setSellPlatform('csfloat');
  setSellMode('perunit');
  document.getElementById('sellTotalReceived').value = '';
  document.getElementById('sellReverseCalc').style.display = 'none';
  updateSellCalc();
  openModal('sellModal');
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

  if (totalReceived <= 0 || qty <= 0) {
    reverseEl.style.display = 'none';
    document.getElementById('calcGross').textContent = '£0.00';
    document.getElementById('calcFee').textContent = '-£0.00';
    const pe = document.getElementById('calcProfit');
    pe.textContent = '£0.00'; pe.className = 'sold-col-val';
    return;
  }

  // Reverse calculate: totalReceived = gross * (1 - fee/100)
  // So gross = totalReceived / (1 - fee/100)
  const gross = totalReceived / (1 - fee / 100);
  const feeAmt = gross - totalReceived;
  const perUnit = gross / qty;
  const profit = totalReceived - (item.buyPrice * qty);

  // Set the hidden per-unit price so confirmSell works
  document.getElementById('sellPrice').value = perUnit.toFixed(4);

  reverseEl.style.display = '';
  reverseEl.innerHTML = `You received <strong>£${totalReceived.toFixed(2)}</strong> after ${fee}% fee → Gross: £${gross.toFixed(2)} → Per unit: <strong>£${perUnit.toFixed(3)}</strong>`;

  document.getElementById('calcGross').textContent = `£${gross.toFixed(2)}`;
  document.getElementById('calcFee').textContent = `-£${feeAmt.toFixed(2)}`;
  const pe = document.getElementById('calcProfit');
  pe.textContent = `${profit >= 0 ? '+' : ''}£${profit.toFixed(2)}`;
  pe.className = `sold-col-val ${profit >= 0 ? 'positive' : 'negative'}`;
}

function updateSellCalc() {
  const rawId = document.getElementById('sellItemId').value;
  const item = findSellItem(rawId);
  if (!item) return;
  const qty = parseInt(document.getElementById('sellQty').value) || 1;
  const sp = parseFloat(document.getElementById('sellPrice').value) || 0;
  const fee = _sellFeePercent;
  const gross = sp * qty, feeAmt = gross * (fee/100), profit = gross - feeAmt - (item.buyPrice * qty);
  document.getElementById('calcGross').textContent = `£${gross.toFixed(2)}`;
  document.getElementById('calcFee').textContent = `-£${feeAmt.toFixed(2)}`;
  const pe = document.getElementById('calcProfit');
  pe.textContent = `${profit >= 0 ? '+' : ''}£${profit.toFixed(2)}`;
  pe.className = `sold-col-val ${profit >= 0 ? 'positive' : 'negative'}`;
}
function confirmSell() {
  const id = document.getElementById('sellItemId').value;
  const item = holdings.find(h => h.id === id);
  if (!item) return;
  const qty = parseInt(document.getElementById('sellQty').value) || 1;
  const sellPrice = parseFloat(document.getElementById('sellPrice').value);
  const feePercent = _sellFeePercent;
  if (!sellPrice || sellPrice <= 0) { toast('Enter a sell price or total received', 'error'); return; }
  if (qty > item.qty) { toast(`Only ${item.qty} in stock`, 'error'); return; }
  const _gross = sellPrice * qty;
  const _feeAmount = _gross * (feePercent / 100);
  const _netRealised = _gross - _feeAmount;
  tradeHistory.push({ id: uid(), name: item.name, type: item.type, qty, buyPrice: item.buyPrice, sellPrice, sellDate: document.getElementById('sellDate').value, feePercent, platform: _currentSellPlatform, gross: _gross, feeAmount: _feeAmount, netRealised: _netRealised });
  saveHistory(tradeHistory);
  if (qty >= item.qty) holdings = holdings.filter(h => h.id !== id);
  else item.qty -= qty;
  saveData(holdings); renderHoldings(); renderHistory(); updateStats(); closeModal('sellModal');
  const net = (sellPrice * qty) * (1 - feePercent/100) - (item.buyPrice * qty);
  toast(`Sold! Net: ${net >= 0 ? '+' : ''}£${net.toFixed(2)}`, net >= 0 ? 'success' : 'info');
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

// Benchmark data — ALL indexed to 100 at Sep 2025 (aligns with your first historical snapshot)
// Real approximate values based on actual market performance Sep 2025 – Mar 2026:
// S&P 500: Sep2025 ~5750 → peaked ~6100 Dec → pulled back to ~5550 Mar2026
// BTC:     Sep2025 ~63k  → peaked ~108k Jan → pulled back to ~84k Mar2026
// Gold:    Sep2025 ~2500 → steady climb to ~3050 Mar2026
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
  const today = new Date().toISOString().split('T')[0];
  const existing = snaps.find(s => s.date === today && s.source !== 'historical');
  const snap = { date: today, categories: cats, source: auto ? 'auto' : 'manual' };
  if (existing) { Object.assign(existing, snap); } else { snaps.push(snap); }
  saveSnapshots(snaps);
  renderPortfolio();
  if (!auto) toast('Snapshot saved!', 'success');
}

function checkAutoSnapshot() {
  const snaps  = loadSnapshots();
  const today  = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Build list of 3rd-of-month dates we should have snapshots for
  // Go back 12 months max
  const expected = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 3);
    if (d > today) continue; // skip future
    expected.push(d.toISOString().split('T')[0]);
  }

  // Find which ones are missing (no auto OR manual snapshot within 2 days of the 3rd)
  const missing = expected.filter(dateStr => {
    return !snaps.some(s => {
      if (s.source === 'historical') return false;
      const diff = Math.abs(new Date(s.date) - new Date(dateStr));
      return diff < 3 * 86400000; // within 3 days counts
    });
  });

  if (missing.length === 0) return;

  // Take snapshot for today's data and tag it with the missed date
  const cats = { case:{invested:0,value:0}, sticker:{invested:0,value:0}, armory:{invested:0,value:0}, skin:{invested:0,value:0}, knife:{invested:0,value:0} };
  holdings.forEach(h => {
    const cat = cats[h.type] || cats.skin;
    cat.invested += h.buyPrice * h.qty;
    const best = getBestPrice(h);
    if (best) cat.value += best * h.qty;
  });

  // Save snapshot for the most recent missed date
  const snapDate = missing[0]; // most recent first
  const existing = snaps.find(s => s.date === snapDate && s.source !== 'historical');
  const snap = { date: snapDate, categories: cats, source: 'auto' };
  if (existing) { Object.assign(existing, snap); } else { snaps.push(snap); }
  saveSnapshots(snaps);

  // Also take a fresh snapshot for today if it's the 3rd
  if (today.getDate() === 3 && !snaps.some(s => s.date === todayStr && s.source === 'auto')) {
    takeSnapshot(true);
  }

  console.log(`[Snapshot] Backfilled ${missing.length} missed snapshot(s): ${missing.join(', ')}`);
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
      const bData = labels.map(d => +interpolateBenchmark(bKey, d).toFixed(2));
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
        ticks: { color: 'rgba(255,255,255,0.4)', callback: v => `£${Number(v).toLocaleString('en-GB')}`, font: { family: "'Share Tech Mono', monospace", size: 11 }, maxTicksLimit: 6 },
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
              return `${ctx.dataset.label}: £${v.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
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
        const startVal = interpolateBenchmark(bKey, firstDate);
        const endVal   = interpolateBenchmark(bKey, lastDate);
        const ret = ((endVal / startVal - 1) * 100);
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
    }
  }

  // ── Snapshot table ───────────────────────────────────────────────────────
  const tbody = document.getElementById('snapshotTable');
  if (!tbody) return;
  tbody.innerHTML = [...chartSnaps].reverse().map(s => {
    const inv = getInvested(s), val = getValue(s), p = val - inv;
    const roi = inv > 0 ? ((val - inv) / inv * 100).toFixed(1) : '0.0';
    const pnlClass = p >= 0 ? 'color:#00d4aa' : 'color:#ef4444';
    const tag = s.source === 'historical' ? 'HIST' : s.source === 'auto' ? 'AUTO' : 'MANUAL';
    const delBtn = s.source !== 'historical'
      ? `<button class="btn btn-danger btn-sm" onclick="deleteSnapshot('${s.date}')">✕</button>` : '—';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);">${s.date} <span style="font-size:9px;opacity:0.5">${tag}</span></td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;">£${inv.toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;">£${val.toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);text-align:right;font-family:monospace;${pnlClass}">${p>=0?'▲':'▼'} £${Math.abs(p).toLocaleString('en-GB',{minimumFractionDigits:2})}</td>
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
  const fmt = v => v != null ? `£${Number(v).toFixed(2)}` : '<span class="price-loading">—</span>';
  tbody.innerHTML = skins.map(item => {
    const p = item.prices || {};
    const best = getBestPrice(item);
    const pnl = best != null ? (best - item.buyPrice) * item.qty : null;
    const pnlPct = best != null ? ((best - item.buyPrice) / item.buyPrice * 100) : null;
    const pnlHtml = pnl != null
      ? `<span class="pnl-pill ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}">${pnl >= 0 ? '▲' : '▼'} £${Math.abs(pnl).toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>`
      : '<span class="price-loading">—</span>';
    const ago = p.fetchedAt ? timeAgo(p.fetchedAt) : 'Never';
    return `<tr data-id="${item.id}">
      <td><div class="item-name">${escHtml(item.name)}<small>${item.marketHash}</small></div></td>
      <td class="mono">${item.qty}</td>
      <td class="mono">£${Number(item.buyPrice).toFixed(2)}</td>
      <td class="mono">£${(item.buyPrice * item.qty).toFixed(2)}</td>
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
function mergeSkinPrices(skin, prices) {
  if (prices) {
    skin.prices = prices;
    recordPrice(skin.id, skin.prices);
  }
  const _live = loadSkins() || skins;
  if (_live.some(s => s.id === skin.id)) {
    skins = _live.map(s => s.id === skin.id ? { ...s, prices: skin.prices } : s);
    saveSkins(skins);
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
  try {
    res = await runTwoLaneRefresh(work, {
      onProgress: (done, total) => { status.textContent = `Fetching ${done}/${total}...`; },
      onItemDone: (skin, prices) => mergeSkinPrices(skin, prices),
    });
  } finally {
    _refreshBusy = false;
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
    recordPrice(skin.id, skin.prices);
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
  document.getElementById('skinBuyPrice').value = skin.buyPrice;
  document.getElementById('skinMarketHash').value = skin.marketHash || '';
  openModal('skinModal');
}

function saveSkin() {
  const name = document.getElementById('skinName').value.trim();
  const buyPrice = parseFloat(document.getElementById('skinBuyPrice').value);
  const marketHash = document.getElementById('skinMarketHash').value.trim();
  if (!name || isNaN(buyPrice) || buyPrice <= 0) { toast('Fill in Name and Buy Price', 'error'); return; }
  const obj = {
    name, type: document.getElementById('skinType').value,
    qty: parseInt(document.getElementById('skinQty').value) || 1,
    buyPrice, marketHash
  };
  const editId = document.getElementById('skinEditId').value;
  // Re-read storage to stay safe against a concurrent price refresh.
  const live = loadSkins() || skins;
  if (editId) {
    skins = live.map(s => s.id === editId ? { ...s, ...obj } : s);
  } else {
    skins = [...live, { id: uid(), ...obj, prices: null }];
  }
  saveSkins(skins); renderSkins(); updateStats(); closeModal('skinModal');
  toast(editId ? 'Play skin updated' : 'Play skin added!', 'success');
}

function deleteSkin(id) {
  const skin = skins.find(s => s.id === id);
  if (!skin) return;
  if (!confirm(`Delete "${skin.name}" from Play Skins? This does not record a sale.`)) return;
  const live = loadSkins() || skins;
  skins = live.filter(s => s.id !== id);
  saveSkins(skins); renderSkins(); updateStats();
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
  document.getElementById('sellPrice').value = getBestPrice(skin) ? getBestPrice(skin).toFixed(2) : '';
  document.getElementById('sellDate').value = todayStr();
  document.getElementById('sellTotalReceived').value = '';
  document.getElementById('sellReverseCalc').style.display = 'none';
  setSellPlatform('csfloat');
  setSellMode('perunit');
  updateSellCalc();
  openModal('sellModal');
}

// Override confirmSell to handle both holdings and skins
const _originalConfirmSell = confirmSell;
confirmSell = function() {
  const rawId = document.getElementById('sellItemId').value;
  if (rawId.startsWith('skin:')) {
    const skinId = rawId.replace('skin:', '');
    const skin = skins.find(s => s.id === skinId);
    if (!skin) return;
    const qty = parseInt(document.getElementById('sellQty').value) || 1;
    const sellPrice = parseFloat(document.getElementById('sellPrice').value);
    const feePercent = _sellFeePercent;
    if (!sellPrice || sellPrice <= 0) { toast('Enter a sell price or total received', 'error'); return; }
    if (qty > skin.qty) { toast(`Only ${skin.qty} in stock`, 'error'); return; }
    const _buyPrice = skin.buyPrice;
    const _gross = sellPrice * qty;
    const _feeAmount = _gross * (feePercent / 100);
    const _netRealised = _gross - _feeAmount;
    tradeHistory.push({ id: uid(), name: skin.name, type: skin.type || 'skin', qty, buyPrice: _buyPrice, sellPrice, sellDate: document.getElementById('sellDate').value, feePercent, platform: _currentSellPlatform, gross: _gross, feeAmount: _feeAmount, netRealised: _netRealised });
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
    toast(`Sold! Net: ${net >= 0 ? '+' : ''}£${net.toFixed(2)}`, net >= 0 ? 'success' : 'info');
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
      <div class="heat-sub">£${getBestPrice(h).toFixed(2)} · qty ${h.qty}</div>
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
    const priceHtml = price ? `£${price.toFixed(2)}` : '<span style="color:var(--text3);">No price</span>';
    const targetHtml = item.targetPrice ? `<span style="font-size:11px;color:var(--text3);">Target: £${item.targetPrice.toFixed(2)}</span>` : '';
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
      netCell.textContent = (n >= 0 ? '+' : '') + '£' + n.toFixed(2);
      netCell.style.color = n >= 0 ? 'var(--green)' : 'var(--red)';
    } else { netCell.textContent = '—'; netCell.style.color = ''; }
  });
  document.getElementById('bulkGross').textContent = '£' + gross.toFixed(2);
  document.getElementById('bulkFees').textContent = '-£' + fees.toFixed(2);
  const netEl = document.getElementById('bulkNet');
  netEl.textContent = (net >= 0 ? '+' : '') + '£' + net.toFixed(2);
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
    `<tr><td>${m}</td><td>${d.trades}</td><td>£${d.revenue.toFixed(2)}</td><td>£${d.fees.toFixed(2)}</td><td style="color:${d.profit>=0?'#22c55e':'#ef4444'};font-weight:700;">${d.profit>=0?'+':''}£${d.profit.toFixed(2)}</td></tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:30px;color:#1a202c;}h1{color:#f97316;margin-bottom:4px;}h2{color:#64748b;font-size:14px;font-weight:normal;margin-bottom:24px;}table{width:100%;border-collapse:collapse;}th{background:#f1f5f9;padding:10px 14px;text-align:left;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#64748b;}td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;}.total{font-weight:700;background:#f8fafc;}.summary{display:flex;gap:24px;margin-bottom:28px;}.sum-card{background:#f8fafc;border-radius:8px;padding:14px 20px;flex:1;}.sum-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}.sum-val{font-size:22px;font-weight:700;color:#1a202c;}</style></head><body>
  <h1>CS2 VAULT — Monthly P&L Report</h1>
  <h2>Generated: ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</h2>
  <div class="summary">
    <div class="sum-card"><div class="sum-label">Total Trades</div><div class="sum-val">${totalTrades}</div></div>
    <div class="sum-card"><div class="sum-label">Total Realised Profit</div><div class="sum-val" style="color:${totalProfit>=0?'#22c55e':'#ef4444'}">${totalProfit>=0?'+':''}£${totalProfit.toFixed(2)}</div></div>
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

const CASE_INTEL_DATA = {
  'Clutch Case':               { released:'2018-02-15', discontinued:'2018-11-08' },
  'Prisma Case':               { released:'2019-03-14', discontinued:'2019-11-18' },
  'Prisma 2 Case':             { released:'2020-03-31', discontinued:'2020-09-23' },
  'Snakebite Case':            { released:'2021-05-03', discontinued:'2022-07-01' },
  'Horizon Case':              { released:'2018-11-08', discontinued:'2019-03-14' },
  'Danger Zone Case':          { released:'2018-12-06', discontinued:'2019-03-14' },
  'Revolver Case':             { released:'2015-12-08', discontinued:'2016-06-15' },
  'Fracture Case':             { released:'2020-08-06', discontinued:'2021-05-03' },
  'Falchion Case':             { released:'2015-05-26', discontinued:'2015-09-17' },
  'Recoil Case':               { released:'2022-07-01', discontinued:'2023-10-10' },
  'Fever Case':                { released:'2025-01-21', discontinued:null },
  'Anubis Collection Package': { released:'2022-11-18', discontinued:null },
  'CS:GO Weapon Case':         { released:'2013-08-14', discontinued:'2013-11-27' },
};

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
    const isActive = !meta.discontinued;
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
    let discScore = 0;
    if (isActive) {
      discScore = 5; // active cases score low here
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
      monthsDisc, isActive,
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
            (r.isActive
              ? '<span style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:1px;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:2px 6px;">⚡ ACTIVE DROP</span>'
              : '<span style="font-family:\'Share Tech Mono\',monospace;font-size:9px;letter-spacing:1px;color:var(--text3);border:1px solid var(--border);border-radius:4px;padding:2px 6px;">DISCONTINUED ' + r.monthsDisc + 'MO</span>') +
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
          '<div class="ci-holdings-chip">◆ ' + r.qty.toLocaleString() + ' held · £' + holdingsVal.toFixed(0) + '</div>' +
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

    const priceStr = r.currentPrice ? '£' + r.currentPrice.toFixed(2) : '—';
    let vsLowCell = '<span style="color:var(--text3);font-size:10px;" title="Needs 3+ price points over 14+ days">building</span>';
    if (r.vsLowPct !== null) {
      const col = r.vsLowPct <= 15 ? 'var(--green)' : r.vsLowPct <= 50 ? 'var(--text2)' : 'var(--red)';
      vsLowCell = '<span style="color:' + col + ';" title="90d low: £' + r.low90.toFixed(2) + '">+' + r.vsLowPct.toFixed(1) + '%</span>';
    }
    const scoreStyle = 'color:' + scoreColor(r.score) + ';font-family:\'Share Tech Mono\',monospace;font-weight:700;';

    return '<tr>' +
      '<td><strong>' + r.name + '</strong></td>' +
      '<td><span style="' + scoreStyle + '">' + r.score + '</span></td>' +
      '<td><span class="ci-grade-badge ' + getGradeClass(r.grade) + '">' + r.grade + '</span></td>' +
      '<td class="mono">' + listingsStr + '</td>' +
      '<td class="mono">' + supplyTrendCell + '</td>' +
      '<td class="mono">' + momCell(r.momentum7d) + '</td>' +
      '<td class="mono">' + momCell(r.momentum30d) + '</td>' +
      '<td class="mono">' + (r.isActive ? '<span style="color:var(--accent)">Active</span>' : r.monthsDisc + ' months') + '</td>' +
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
    holdings.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
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
      `${a.name} ${a.direction==='below'?'dropped below':'rose above'} £${a.targetPrice.toFixed(3)}`).join(' · ');
  }
  if (summary) summary.innerHTML =
    `<div class="alert-chip"><span style="color:var(--text)">${alerts.length}</span>&nbsp;Total</div>
     <div class="alert-chip"><span style="color:var(--green)">${alerts.filter(a=>a.direction==='below').length}</span>&nbsp;Drop Alerts</div>
     <div class="alert-chip"><span style="color:var(--red)">${alerts.filter(a=>a.direction==='above').length}</span>&nbsp;Rise Alerts</div>
     <div class="alert-chip"><span style="color:var(--gold)">${triggered.length}</span>&nbsp;Triggered</div>
     <div class="alert-chip"><span style="color:var(--blue)">${alerts.filter(a=>!a.triggered).length}</span>&nbsp;Watching</div>`;
  const sorted = [...alerts].sort((a,b)=>(b.triggered?1:0)-(a.triggered?1:0)||a.name.localeCompare(b.name));
  const rows = sorted.map(a => {
    const pStr = a.currentPrice != null ? `£${a.currentPrice.toFixed(3)}` : '<span style="color:var(--text3)">—</span>';
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
      <div class="mono">£${a.targetPrice.toFixed(3)}</div>
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

  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
  };
  const json = JSON.stringify(backup, null, 2);
  const filename = `cs2vault-backup-${new Date().toISOString().split('T')[0]}.json`;
  const result = await window.cs2vault.exportSave(filename, json);
  if (result.saved) toast(`Backup saved!`, 'success');
}

function clearAllData() {
  if (!confirm('⚠ This will delete ALL your holdings, history, snapshots and settings.\n\nAre you absolutely sure?')) return;
  if (!confirm('Last chance — delete everything?')) return;
  const keys = ['cs2vault_holdings','cs2vault_history','cs2vault_snapshots','cs2vault_skins','cs2vault_watchlist','cs2vault_alerts'];
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

    const change = ((newest.best - oldest.best) / oldest.best) * 100;
    const currentPrice = newest.best;
    const totalValue = currentPrice * item.qty;

    results.push({
      item,
      currentPrice,
      oldPrice: oldest.best,
      change,
      totalValue,
      dataPoints: history.length,
      marketHash: item.marketHash,
    });
  });

  return results;
}

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

  const renderRow = (t, isGainer) => {
    const color = isGainer ? 'var(--green)' : 'var(--red)';
    const arrow = isGainer ? '↗' : '↘';
    const imgUrl = getSteamImageUrl(t.marketHash);
    const imgHtml = imgUrl ? `<img class="trend-img" src="${imgUrl}" alt="" onerror="this.style.display='none'">` : `<div class="trend-img" style="display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text3);">◆</div>`;

    return `<div class="trend-row">
      ${imgHtml}
      <div class="trend-info">
        <div class="trend-name">${escHtml(t.item.name)}</div>
        <div class="trend-sub">${typeLabels[t.item.type] || t.item.type} · qty ${t.item.qty.toLocaleString()}</div>
      </div>
      <div class="trend-price">£${t.currentPrice.toFixed(2)}</div>
      <div class="trend-change" style="color:${color};">${arrow} ${Math.abs(t.change).toFixed(2)}%</div>
      <div class="trend-value">£${t.totalValue.toFixed(2)}</div>
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
    if (best) itemValues.push({ name: h.name, type: h.type, invested: inv, value: val, pct: totalInvested > 0 ? (inv / totalInvested * 100) : 0, pnlPct: ((best - h.buyPrice) / h.buyPrice * 100), qty: h.qty, id: h.id, staleMs: h.prices?.fetchedAt ? Date.now() - h.prices.fetchedAt : null });
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
  if (maxConcentration > 40) signals.push({ icon: '🔴', title: `${top5[0].name} is ${maxConcentration.toFixed(1)}% of your portfolio`, desc: 'Very high concentration risk — consider diversifying. A single item crash would significantly impact your total value.', type: 'danger' });
  else if (maxConcentration > 25) signals.push({ icon: '🟡', title: `${top5[0].name} is ${maxConcentration.toFixed(1)}% of your portfolio`, desc: 'Moderate concentration — keep an eye on this position.', type: 'warning' });

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
      signals.push({ icon: '🟢', title: `${p.name} is up ${p.pnlPct.toFixed(1)}% — consider taking profit`, desc: `£${p.invested.toFixed(0)} invested, now worth £${p.value.toFixed(0)}. Selling a portion locks in gains.`, type: 'success' });
    }
  });

  // Big losers
  worstPerformers.forEach(p => {
    if (p.pnlPct < -30 && p.invested > 50) {
      signals.push({ icon: '🔴', title: `${p.name} is down ${Math.abs(p.pnlPct).toFixed(1)}%`, desc: `£${p.invested.toFixed(0)} invested, now worth £${p.value.toFixed(0)}. Review whether the thesis still holds.`, type: 'danger' });
    }
  });

  // Overall P&L
  const totalPnl = ((totalValue - totalInvested) / totalInvested * 100);
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
            <div class="health-bar-name">${escHtml(i.name)}<div style="font-size:10px;color:var(--text3);">${typeLabels[i.type] || i.type} · £${i.invested.toFixed(0)} invested</div></div>
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
            <div class="health-bar-name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeColors[type] || 'var(--text3)'};margin-right:6px;"></span>${typeLabels[type] || type}<div style="font-size:10px;color:var(--text3);">${data.count} items · ${pnl >= 0 ? '+' : ''}£${pnl.toFixed(0)}</div></div>
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
      <div><span style="font-weight:600;">${escHtml(p.name)}</span><span style="font-size:11px;color:var(--text3);margin-left:8px;">£${p.invested.toFixed(0)} in · qty ${p.qty}</span></div>
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
      <div class="sold-col"><div class="sold-col-label">Buy</div><div class="sold-col-val">£${Number(t.buyPrice).toFixed(2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Sell</div><div class="sold-col-val">£${Number(t.sellPrice).toFixed(2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Fee</div><div class="sold-col-val negative">-£${fee.toFixed(2)}</div></div>
      <div class="sold-col"><div class="sold-col-label">Net</div><div class="sold-col-val ${net>=0?'positive':'negative'}">${net>=0?'+':''}£${net.toFixed(2)}</div></div></div>`;
  }).join('');
}
function sortTable(key) { if (sortKey===key) sortDir*=-1; else{sortKey=key;sortDir=1;} renderHoldings(); }
async function exportCSV() {
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
      prices: null,
    };
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
  renderHoldings();
  updateStats();
  toast(`Imported ${items.length} item(s)!`, 'success');
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
function todayStr(){return new Date().toISOString().split('T')[0];}
function timeAgo(ts){const d=(Date.now()-ts)/60000;if(d<1)return 'just now';if(d<60)return`${Math.floor(d)}m ago`;if(d<1440)return`${Math.floor(d/60)}h ago`;return`${Math.floor(d/1440)}d ago`;}

// Modals stay open on backdrop click — close only via the ✕, Cancel, or Save buttons.
// (Price-history chart modal is exempt: backdrop click still dismisses it.)
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o&&o.id==='priceHistoryModal')o.classList.remove('open');}));

// ========================
// INIT
// ========================
// Seed holdings if Clutch Case not already present
function seedIfMissing() {
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
}
function initApp() {
  try { seedHistoricalSnapshots(); } catch(e) { console.warn('[initApp] seedHistoricalSnapshots:', e); }
  try { seedIfMissing(); }             catch(e) { console.warn('[initApp] seedIfMissing:', e); }
  try { holdings     = loadData(); }      catch(e) { console.warn('[initApp] loadData:', e); holdings = []; }
  try { tradeHistory = loadHistory(); }   catch(e) { console.warn('[initApp] loadHistory:', e); tradeHistory = []; }
  // Load play skins AFTER initStore so window._store is populated
  try {
    const storedSkins = loadSkins();
    skins = storedSkins || DEFAULT_SKINS;
    if (!storedSkins) saveSkins(skins);
    // One-time fix: patch Number K market hash and type if stored with old bare name
    let skinsPatched = false;
    skins.forEach(s => {
      if (s.id === 'skin010' || s.marketHash === 'Number K') {
        if (s.marketHash !== 'Number K | The Professionals') { s.marketHash = 'Number K | The Professionals'; skinsPatched = true; }
        if (s.type !== 'agent') { s.type = 'agent'; skinsPatched = true; }
      }
    });
    if (skinsPatched) saveSkins(skins);
  } catch(e) { console.warn('[initApp] loadSkins:', e); skins = DEFAULT_SKINS; }
  try { seedNewItems(); }                 catch(e) { console.warn('[initApp] seedNewItems:', e); }
  try { renderHoldings(); }               catch(e) { console.warn('[initApp] renderHoldings:', e); }
  try { updateStats(); }                  catch(e) { console.warn('[initApp] updateStats:', e); }
  try { checkApiStatus(); }               catch(e) { console.warn('[initApp] checkApiStatus:', e); }
  try { checkTargetsOnLoad(); }           catch(e) { console.warn('[initApp] checkTargetsOnLoad:', e); }
  try { checkAutoSnapshot(); }            catch(e) { console.warn('[initApp] checkAutoSnapshot:', e); }
  try { prunePriceLog(); }                catch(e) { console.warn('[initApp] prunePriceLog:', e); }
  try { pruneCaseSupply(); }              catch(e) { console.warn('[initApp] pruneCaseSupply:', e); }
  try { initSteamAutocomplete(); }        catch(e) { console.warn('[initApp] initSteamAutocomplete:', e); }
  try { initAutoRefresh(); }              catch(e) { console.warn('[initApp] initAutoRefresh:', e); }
  try {
    const arEl = document.getElementById('settingsAutoRefresh');
    if (arEl) arEl.value = String(getAutoRefreshHours());
  } catch(e) { console.warn('[initApp] autoRefresh dropdown:', e); }
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
