/**
 * schema.js — Vault Pro Phase 6 (session 2): CS2 item schema mapping.
 *
 * Turns raw GC item identities (def_index / paint_index / wear float / quality /
 * StatTrak flag / sticker-kit / music / keychain ids) into the exact
 * market_hash_name Steam and CSFloat use, so storage-unit contents render as
 * real item names.
 *
 * Sourcing strategy (fetched-and-cached with a bundled fallback):
 *  1. In-memory schema (per app run)
 *  2. Disk cache: {userData}/cs2vault-schema.json — the DISTILLED mapping
 *     (~1MB), not the raw game files
 *  3. Bundled snapshot: assets/schema-snapshot.json — generated at build time
 *     by this same distiller, so offline first-runs always resolve names
 *  If the loaded schema is older than SCHEMA_MAX_AGE_DAYS, a background
 *  refetch runs: raw items_game.txt + csgo_english.txt are pulled from the
 *  SteamDatabase/GameTracking-CS2 mirror (auto-updated on every CS2 patch),
 *  parsed, distilled and written to the disk cache. A fetch failure never
 *  breaks anything — the app keeps whatever schema it already has.
 *
 * All the parse/compose logic is pure and exported for the offline harness
 * (test-schema-mapping.js).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SCHEMA_SOURCE_BASE = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/';
const ITEMS_GAME_URL = SCHEMA_SOURCE_BASE + 'scripts/items/items_game.txt';
const CSGO_ENGLISH_URL = SCHEMA_SOURCE_BASE + 'resource/csgo_english.txt';
const SCHEMA_CACHE_FILE = 'cs2vault-schema.json';
const SCHEMA_MAX_AGE_DAYS = 7;
const FETCH_TIMEOUT_MS = 90000;
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024; // 64MB sanity cap per file

// Special tool defindexes: the item's real identity lives in an attribute,
// not the defindex itself.
const DEF_STICKER = 1209;
const DEF_MUSIC_KIT = 1314;
const DEF_GRAFFITI = 1348;
const DEF_CHARM = 1355;
const DEF_PATCH = 4609;

const QUALITY_SOUVENIR = 12; // "tournament" quality

// ─── VDF (KeyValues) parser — tolerant of comments and duplicate keys ────────

function parseVdf(text) {
  const n = text.length;
  let pos = 0;
  const tokens = [];
  while (pos < n) {
    const c = text[pos];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { pos++; continue; }
    if (c === '/' && text[pos + 1] === '/') {
      const e = text.indexOf('\n', pos);
      pos = e < 0 ? n : e;
      continue;
    }
    if (c === '{' || c === '}') { tokens.push(c); pos++; continue; }
    if (c === '"') {
      let e = pos + 1;
      let buf = '';
      while (e < n) {
        const ch = text[e];
        if (ch === '\\' && e + 1 < n) { buf += text[e + 1]; e += 2; continue; }
        if (ch === '"') break;
        buf += ch;
        e++;
      }
      tokens.push({ s: buf });
      pos = e + 1;
      continue;
    }
    // unquoted token
    let e2 = pos;
    while (e2 < n && ' \t\r\n{}'.indexOf(text[e2]) === -1) e2++;
    tokens.push({ s: text.slice(pos, e2) });
    pos = e2;
  }

  let ti = 0;
  function build() {
    const obj = {};
    while (ti < tokens.length) {
      const t = tokens[ti];
      if (t === '}') { ti++; return obj; }
      const key = t.s;
      ti++;
      if (tokens[ti] === '{') {
        ti++;
        const val = build();
        // items_game repeats section names (e.g. multiple "items" blocks) —
        // merge duplicates instead of overwriting
        if (obj[key] && typeof obj[key] === 'object' && typeof val === 'object') {
          Object.assign(obj[key], val);
        } else {
          obj[key] = val;
        }
      } else {
        obj[key] = tokens[ti] ? tokens[ti].s : '';
        ti++;
      }
    }
    return obj;
  }
  return build();
}

// ─── csgo_english.txt parser ("Token" "Value" lines, UTF-8 with BOM) ────────

function parseLoc(text) {
  const loc = {};
  // strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const re = /^[ \t]*"((?:[^"\\]|\\.)+)"[ \t]+"((?:[^"\\]|\\.)*)"[ \t]*\r?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    loc[m[1].toLowerCase()] = m[2].replace(/\\"/g, '"');
  }
  return loc;
}

function locGet(loc, token) {
  if (!token) return null;
  const key = String(token).replace(/^#/, '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(loc, key) ? loc[key] : null;
}

// ─── Distiller: raw game files → compact mapping schema ──────────────────────

/** Derive a Doppler/Gamma Doppler phase label from a paint kit's internal name. */
function phaseFromKitName(internalName) {
  const s = String(internalName || '').toLowerCase();
  const m = s.match(/phase(\d)/);
  if (m) return 'Phase ' + m[1];
  if (s.indexOf('ruby') !== -1) return 'Ruby';
  if (s.indexOf('sapphire') !== -1) return 'Sapphire';
  if (s.indexOf('blackpearl') !== -1) return 'Black Pearl';
  if (s.indexOf('emerald') !== -1) return 'Emerald';
  return null;
}

/**
 * distillSchema(itemsGameText, englishText) → compact schema object:
 * {
 *   v, generated, source,
 *   items:    { defindex: { n: "AK-47", k: "w"|"k"|"g"|"o" } },
 *   paints:   { paintindex: { n: "Doppler", ph: "Phase 2"? } },
 *   stickers: { kitid: "Titan (Holo) | Katowice 2014" },   // stickers + patches share this table
 *   music:    { id: "Daniel Sadowski, Crimson Assault" },
 *   charms:   { id: "Lil' Ava" },
 *   tints:    { id: "Brick Red" }
 * }
 */
function distillSchema(itemsGameText, englishText) {
  const root = parseVdf(itemsGameText).items_game;
  if (!root || !root.items || !root.paint_kits) throw new Error('items_game.txt did not parse into the expected shape');
  const loc = parseLoc(englishText);
  if (Object.keys(loc).length < 1000) throw new Error('csgo_english.txt did not parse into the expected shape');

  const prefabs = root.prefabs || {};

  // Resolve an item's display-name token + prefab chain (prefab can list
  // several parents, space-separated)
  function walkPrefabs(node, seen, chain) {
    const pf = node.prefab;
    if (!pf) return;
    const parts = String(pf).split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || seen[p]) continue;
      seen[p] = true;
      chain.push(p);
      if (prefabs[p]) walkPrefabs(prefabs[p], seen, chain);
    }
  }
  function resolveItemName(node, seen) {
    if (node.item_name) return node.item_name;
    const pf = node.prefab;
    if (!pf) return null;
    const parts = String(pf).split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || seen[p]) continue;
      seen[p] = true;
      if (prefabs[p]) {
        const r = resolveItemName(prefabs[p], seen);
        if (r) return r;
      }
    }
    return null;
  }

  const items = {};
  const rawItems = root.items;
  for (const def in rawItems) {
    const it = rawItems[def];
    if (!it || typeof it !== 'object') continue;
    const chain = [];
    walkPrefabs(it, {}, chain);
    let kind = 'o';
    if (chain.indexOf('melee_unusual') !== -1) kind = 'k';
    else if (chain.indexOf('hands_paintable') !== -1) kind = 'g';
    else if (String(it.name || '').indexOf('weapon_') === 0 && chain.indexOf('weapon_base') !== -1) kind = 'w';
    const nameTok = resolveItemName(it, {});
    const name = locGet(loc, nameTok) || String(it.name || def);
    items[def] = { n: name, k: kind };
  }

  const paints = {};
  const rawPaints = root.paint_kits;
  for (const pid in rawPaints) {
    const pk = rawPaints[pid];
    if (!pk || typeof pk !== 'object') continue;
    if (pid === '0' || pk.name === 'default') continue; // paint 0 = vanilla, handled by the resolver
    const pname = locGet(loc, pk.description_tag) || String(pk.name || pid);
    const entry = { n: pname };
    if (pname === 'Doppler' || pname === 'Gamma Doppler') {
      const ph = phaseFromKitName(pk.name);
      if (ph) entry.ph = ph;
    }
    paints[pid] = entry;
  }

  const stickers = {};
  const rawStickers = root.sticker_kits || {};
  for (const sid in rawStickers) {
    const sk = rawStickers[sid];
    if (!sk || typeof sk !== 'object') continue;
    const sname = locGet(loc, sk.item_name);
    if (sname) stickers[sid] = sname;
  }

  const music = {};
  const rawMusic = root.music_definitions || {};
  for (const mid in rawMusic) {
    const md = rawMusic[mid];
    if (!md || typeof md !== 'object') continue;
    const mname = locGet(loc, md.loc_name);
    if (mname) music[mid] = mname;
  }

  const charms = {};
  const rawCharms = root.keychain_definitions || {};
  for (const cid in rawCharms) {
    const cd = rawCharms[cid];
    if (!cd || typeof cd !== 'object') continue;
    const cname = locGet(loc, cd.loc_name);
    if (cname) charms[cid] = cname;
  }

  const tints = {};
  const rawTints = root.graffiti_tints || {};
  for (const tname in rawTints) {
    const td = rawTints[tname];
    if (!td || typeof td !== 'object' || td.id === undefined) continue;
    const tloc = locGet(loc, '#Attrib_SprayTintValue_' + td.id);
    if (tloc) tints[String(td.id)] = tloc;
  }

  return {
    v: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: 'steamdatabase',
    items: items,
    paints: paints,
    stickers: stickers,
    music: music,
    charms: charms,
    tints: tints,
  };
}

// ─── Name composition (pure) ──────────────────────────────────────────────────

/** Wear bracket from a paint_wear float. Min-inclusive: exactly 0.07 is MW. */
function wearName(f) {
  if (typeof f !== 'number' || isNaN(f)) return null;
  if (f < 0.07) return 'Factory New';
  if (f < 0.15) return 'Minimal Wear';
  if (f < 0.38) return 'Field-Tested';
  if (f < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}

/**
 * resolveGCItem(slim, schema) → resolution or null when unmappable:
 *   { name, kind, phase, wear }
 * name is the exact Steam/CSFloat market_hash_name. For Doppler-family skins
 * the phase is returned separately (Steam's market hash does NOT include the
 * phase — CSFloat distinguishes phases via a separate field).
 */
function resolveGCItem(it, schema) {
  if (!it || !schema || !schema.items) return null;
  const d = it.defIndex;
  const st = it.statTrak ? 'StatTrak™ ' : '';

  if (d === DEF_STICKER || d === DEF_PATCH) {
    const kn = (it.stickerKitId !== null && it.stickerKitId !== undefined) ? schema.stickers[String(it.stickerKitId)] : null;
    if (!kn) return null;
    return { name: (d === DEF_STICKER ? 'Sticker | ' : 'Patch | ') + kn, kind: d === DEF_STICKER ? 'sticker' : 'patch', phase: null, wear: null };
  }
  if (d === DEF_GRAFFITI) {
    const gn = (it.stickerKitId !== null && it.stickerKitId !== undefined) ? schema.stickers[String(it.stickerKitId)] : null;
    if (!gn) return null;
    const tint = (it.graffitiTint !== null && it.graffitiTint !== undefined) ? schema.tints[String(it.graffitiTint)] : null;
    return { name: 'Sealed Graffiti | ' + gn + (tint ? ' (' + tint + ')' : ''), kind: 'graffiti', phase: null, wear: null };
  }
  if (d === DEF_MUSIC_KIT) {
    const mn = (it.musicId !== null && it.musicId !== undefined) ? schema.music[String(it.musicId)] : null;
    if (!mn) return null;
    return { name: st + 'Music Kit | ' + mn, kind: 'music', phase: null, wear: null };
  }
  if (d === DEF_CHARM) {
    const cn = (it.keychainId !== null && it.keychainId !== undefined) ? schema.charms[String(it.keychainId)] : null;
    if (!cn) return null;
    return { name: 'Charm | ' + cn, kind: 'charm', phase: null, wear: null };
  }

  const rec = schema.items[String(d)];
  if (!rec) return null;

  if (rec.k === 'w' || rec.k === 'k' || rec.k === 'g') {
    const star = (rec.k === 'k' || rec.k === 'g') ? '★ ' : '';
    const pi = it.paintIndex;
    if (!pi) {
      // No paint: vanilla knife ("★ Bayonet", no wear bracket) — StatTrak
      // vanilla knives exist ("★ StatTrak™ Bayonet")
      if (star) return { name: star + st + rec.n, kind: rec.k === 'k' ? 'knife' : 'gloves', phase: null, wear: null };
      return { name: rec.n, kind: 'weapon', phase: null, wear: null };
    }
    const pk = schema.paints[String(pi)];
    if (!pk) return null;
    const wear = wearName(it.paintWear);
    // Souvenir (quality 12) prefixes weapons; ★ items are never Souvenir
    const souvenir = (!star && !st && it.quality === QUALITY_SOUVENIR) ? 'Souvenir ' : '';
    const name = star + st + souvenir + rec.n + ' | ' + pk.n + (wear ? ' (' + wear + ')' : '');
    return {
      name: name,
      kind: rec.k === 'k' ? 'knife' : (rec.k === 'g' ? 'gloves' : 'weapon'),
      phase: pk.ph || null,
      wear: wear,
    };
  }

  // Everything else (cases, capsules, keys, pins, passes, agents, tools):
  // the localized item name IS the market hash name
  return { name: rec.n, kind: 'other', phase: null, wear: null };
}

// ─── Fetch + cache + bundled fallback ────────────────────────────────────────

let deps = null; // { getUserDataPath, log }
let mem = null;  // { schema, origin: 'cache'|'bundled'|'fetched', fetchedAt }
let refreshing = false;

function log(msg) {
  const line = '[Schema] ' + msg;
  if (deps && deps.log) deps.log(line); else console.log(line);
}

function init(options) { deps = options; }

function cachePath() {
  return path.join(deps.getUserDataPath(), SCHEMA_CACHE_FILE);
}

function bundledPath() {
  return path.join(__dirname, '..', 'assets', 'schema-snapshot.json');
}

function httpGet(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 3;
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: { 'User-Agent': 'CS2Vault schema updater' } }, function (res) {
      if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(httpGet(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', function (c) {
        total += c.length;
        if (total > MAX_DOWNLOAD_BYTES) {
          req.destroy(new Error('Download exceeded size cap'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      res.on('error', reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, function () { req.destroy(new Error('Timed out fetching ' + url)); });
    req.on('error', reject);
  });
}

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schema && parsed.schema.items) {
      return { schema: parsed.schema, origin: 'cache', fetchedAt: parsed.fetchedAt || null };
    }
  } catch (e) { /* no cache / unreadable — fine */ }
  return null;
}

function loadBundled() {
  try {
    const raw = fs.readFileSync(bundledPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.items) {
      return { schema: parsed, origin: 'bundled', fetchedAt: null };
    }
  } catch (e) { log('Bundled schema snapshot missing/unreadable: ' + e.message); }
  return null;
}

function schemaAgeDays(entry) {
  const stamp = entry.fetchedAt || (entry.schema && entry.schema.generated);
  if (!stamp) return Infinity;
  const t = Date.parse(stamp);
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

function refreshFromNetwork() {
  if (refreshing) return;
  refreshing = true;
  log('Fetching item schema (items_game.txt + csgo_english.txt)…');
  Promise.all([httpGet(ITEMS_GAME_URL), httpGet(CSGO_ENGLISH_URL)])
    .then(function (results) {
      const schema = distillSchema(results[0], results[1]);
      const fetchedAt = new Date().toISOString();
      mem = { schema: schema, origin: 'fetched', fetchedAt: fetchedAt };
      try {
        fs.writeFileSync(cachePath(), JSON.stringify({ fetchedAt: fetchedAt, schema: schema }));
        log('Schema refreshed and cached (' + Object.keys(schema.items).length + ' items, ' + Object.keys(schema.paints).length + ' paint kits)');
      } catch (e) {
        log('Schema refreshed but cache write failed: ' + e.message);
      }
    })
    .catch(function (e) {
      log('Schema refresh failed (keeping current schema): ' + e.message);
    })
    .then(function () { refreshing = false; });
}

/**
 * Get the best available schema, kicking off a background refresh when stale.
 * Never blocks on the network — always returns immediately with cache/bundled
 * (or null only if the bundled snapshot is missing AND no cache exists).
 */
function ensureSchema() {
  if (!mem) mem = loadFromDisk() || loadBundled();
  if (!mem || schemaAgeDays(mem) > SCHEMA_MAX_AGE_DAYS) refreshFromNetwork();
  return mem;
}

function schemaMeta() {
  if (!mem) return null;
  return {
    origin: mem.origin,
    generated: mem.schema.generated || null,
    fetchedAt: mem.fetchedAt,
  };
}

module.exports = {
  init: init,
  ensureSchema: ensureSchema,
  schemaMeta: schemaMeta,
  // pure — exported for the offline harness
  parseVdf: parseVdf,
  parseLoc: parseLoc,
  distillSchema: distillSchema,
  resolveGCItem: resolveGCItem,
  wearName: wearName,
  phaseFromKitName: phaseFromKitName,
};
