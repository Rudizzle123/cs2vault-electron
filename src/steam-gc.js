/**
 * steam-gc.js — Vault Pro Phase 6 (session 1): Steam Game Coordinator bridge.
 *
 * Emulates a CS2 client session (steam-user + globaloffensive, both MIT) so the
 * app can enumerate Storage Units ("caskets") and read their contents — items
 * that are completely invisible to Steam's public inventory endpoint.
 *
 * Security model (documented for users):
 *  - The password is used ONCE for the initial logon and never written anywhere.
 *  - What we persist is Steam's own refresh token, encrypted with Electron
 *    safeStorage (Windows DPAPI / OS keychain), in the app's electron-store.
 *  - If OS-level encryption is unavailable, the token is NOT saved — the
 *    session simply won't survive a restart.
 *  - While a GC session is open the account shows as "In-Game: CS2"; the sync
 *    cannot run while the user is actually playing CS2.
 *
 * Session-1 scope: login / token persistence / GC connect / casket list /
 * raw casket contents (def_index level). The defindex → market-hash-name
 * schema mapping is session 2.
 */

const TOKEN_KEY = 'cs2vault_steam_gc_token';
const GC_CONNECT_TIMEOUT_MS = 45000;
const CASKET_FETCH_TIMEOUT_MS = 30000;
const STORAGE_UNIT_DEF_INDEX = 1201;

// ─── Pure helpers (exported for the offline test harness) ────────────────────

/**
 * Pull the casket (storage unit) items out of a GC inventory array.
 * Caskets are def_index 1201; items *inside* caskets carry a casket_id and are
 * excluded (they're contents, not containers).
 */
function extractCaskets(inventory) {
  if (!Array.isArray(inventory)) return [];
  return inventory
    .filter(function (it) {
      if (!it || it.casket_id) return false;
      if (it.def_index === STORAGE_UNIT_DEF_INDEX) return true;
      // Defensive: anything advertising a contained-item count is a casket
      return typeof it.casket_contained_item_count === 'number';
    })
    .map(function (it) {
      return {
        id: String(it.id),
        name: it.custom_name || 'Storage Unit',
        count: typeof it.casket_contained_item_count === 'number' ? it.casket_contained_item_count : 0,
      };
    })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/** Slim a raw GC item down to what the renderer needs (session 1: raw attrs). */
function slimGCItem(it) {
  return {
    id: String(it.id),
    defIndex: it.def_index,
    paintIndex: (it.paint_index === undefined || it.paint_index === null) ? null : it.paint_index,
    paintWear: (typeof it.paint_wear === 'number') ? it.paint_wear : null,
    quality: (it.quality === undefined) ? null : it.quality,
    rarity: (it.rarity === undefined) ? null : it.rarity,
    customName: it.custom_name || null,
    stickerCount: Array.isArray(it.stickers) ? it.stickers.length : 0,
    statTrak: !!(it.kill_eater_value !== undefined && it.kill_eater_value !== null),
  };
}

/** Map steam-user logon errors (EResult) to a message a human can act on. */
function friendlyLogonError(err) {
  const eresult = err && (err.eresult !== undefined ? err.eresult : null);
  const msg = (err && err.message) ? err.message : 'Unknown error';
  const map = {
    5:  'Wrong account name or password.',                                  // InvalidPassword
    84: 'Steam is rate-limiting logins from this machine — wait ~30 minutes and try again.', // RateLimitExceeded
    85: 'A Steam Guard code is required.',                                  // AccountLogonDenied (email)
    88: 'The Steam Guard code was wrong — check your authenticator.',        // TwoFactorCodeMismatch
    65: 'The code was wrong or expired — try the newest code.',              // InvalidLoginAuthCode
    50: 'This account is logged in elsewhere in a conflicting session.',     // LogonSessionReplaced
    6:  'Logged out — the session was replaced by another login.',           // LoggedInElsewhere
  };
  if (eresult !== null && map[eresult]) return map[eresult];
  if (/InvalidPassword/i.test(msg)) return map[5];
  if (/RateLimit/i.test(msg)) return map[84];
  return 'Steam login failed: ' + msg;
}

// ─── Live session state ───────────────────────────────────────────────────────

let SteamUser = null;   // lazy-required so the module can be unit-tested pure
let GlobalOffensive = null;

let user = null;        // SteamUser instance
let csgo = null;        // GlobalOffensive instance
let flags = { loggedOn: false, gc: false, account: null };
let guardCallback = null;   // pending steamGuard callback awaiting a code
let deps = null;            // { safeStorage, getStore, getUserDataPath, log }

function log(msg) {
  const line = '[SteamGC] ' + msg;
  if (deps && deps.log) deps.log(line); else console.log(line);
}

function resetState() {
  try { if (user) user.removeAllListeners(); } catch (e) {}
  user = null; csgo = null; guardCallback = null;
  flags = { loggedOn: false, gc: false, account: null };
}

// ─── Token persistence (safeStorage-encrypted refresh token) ─────────────────

function saveToken(refreshToken) {
  try {
    const ss = deps.safeStorage;
    if (!ss || !ss.isEncryptionAvailable()) {
      log('safeStorage unavailable — refresh token NOT persisted (session will not survive restart)');
      return false;
    }
    const enc = ss.encryptString(refreshToken).toString('base64');
    deps.getStore().set(TOKEN_KEY, enc);
    log('Refresh token saved (encrypted, ' + enc.length + ' chars)');
    return true;
  } catch (e) { log('Token save failed: ' + e.message); return false; }
}

function loadToken() {
  try {
    const enc = deps.getStore().get(TOKEN_KEY);
    if (!enc) return null;
    const ss = deps.safeStorage;
    if (!ss || !ss.isEncryptionAvailable()) return null;
    return ss.decryptString(Buffer.from(enc, 'base64'));
  } catch (e) { log('Token load failed: ' + e.message); return null; }
}

function clearToken() {
  try { deps.getStore().delete(TOKEN_KEY); log('Refresh token cleared'); } catch (e) {}
}

function hasToken() {
  try { return !!deps.getStore().get(TOKEN_KEY); } catch (e) { return false; }
}

// ─── Logon flow ───────────────────────────────────────────────────────────────

/**
 * Start a logon and resolve with one of:
 *   { status:'ok', account }          — logged on AND GC session established
 *   { status:'ok-nogc', account, message } — logged on, GC connect timed out
 *   { status:'guard', domain }        — Steam Guard code needed (call gc:guard)
 *   { status:'error', message }
 * Never rejects.
 */
function startLogon(logOnOptions) {
  return new Promise(function (resolve) {
    resetState();
    if (!SteamUser) SteamUser = require('steam-user');
    if (!GlobalOffensive) GlobalOffensive = require('globaloffensive');

    const path = require('path');
    user = new SteamUser({
      dataDirectory: path.join(deps.getUserDataPath(), 'steam-session'),
      renewRefreshTokens: true,
      autoRelogin: true,
    });
    csgo = new GlobalOffensive(user);

    let settled = false;
    function settle(result) { if (!settled) { settled = true; resolve(result); } }

    let gcTimer = null;

    user.on('refreshToken', function (token) { saveToken(token); });

    user.on('steamGuard', function (domain, callback) {
      guardCallback = callback;
      log('Steam Guard required (' + (domain ? 'email: ' + domain : 'mobile authenticator') + ')');
      settle({ status: 'guard', domain: domain || null });
    });

    user.on('loggedOn', function () {
      flags.loggedOn = true;
      flags.account = user.accountInfo && user.accountInfo.name ? user.accountInfo.name : (logOnOptions.accountName || 'Steam account');
      log('Logged on — starting CS2 GC session');
      user.setPersona(SteamUser.EPersonaState.Invisible);
      user.gamesPlayed([730]);
      gcTimer = setTimeout(function () {
        log('GC connect timed out after ' + GC_CONNECT_TIMEOUT_MS + 'ms');
        settle({ status: 'ok-nogc', account: flags.account, message: 'Logged in, but the CS2 Game Coordinator did not respond. Close CS2 if it is running, then retry.' });
      }, GC_CONNECT_TIMEOUT_MS);
    });

    // accountInfo can arrive after loggedOn — keep the name fresh
    user.on('accountInfo', function (name) { if (name) flags.account = name; });

    csgo.on('connectedToGC', function () {
      flags.gc = true;
      if (gcTimer) { clearTimeout(gcTimer); gcTimer = null; }
      log('GC session established');
      settle({ status: 'ok', account: flags.account });
    });

    csgo.on('disconnectedFromGC', function (reason) {
      flags.gc = false;
      log('GC disconnected (' + reason + ')');
    });

    user.on('error', function (err) {
      const message = friendlyLogonError(err);
      log('Logon error: ' + message);
      flags.loggedOn = false; flags.gc = false;
      if (gcTimer) { clearTimeout(gcTimer); gcTimer = null; }
      settle({ status: 'error', message: message });
    });

    user.on('disconnected', function (eresult, msg) {
      flags.loggedOn = false; flags.gc = false;
      log('Disconnected: ' + (msg || eresult));
    });

    try {
      user.logOn(logOnOptions);
    } catch (e) {
      settle({ status: 'error', message: 'Could not start Steam login: ' + e.message });
    }
  });
}

/** Resolve the pending Steam Guard prompt with a code and await the outcome. */
function submitGuardCode(code) {
  return new Promise(function (resolve) {
    if (!guardCallback || !user) {
      resolve({ status: 'error', message: 'No Steam Guard prompt is pending — start the login again.' });
      return;
    }
    let settled = false;
    function settle(result) { if (!settled) { settled = true; resolve(result); } }

    let gcTimer = null;

    user.once('loggedOn', function () {
      flags.loggedOn = true;
      flags.account = user.accountInfo && user.accountInfo.name ? user.accountInfo.name : 'Steam account';
      user.setPersona(SteamUser.EPersonaState.Invisible);
      user.gamesPlayed([730]);
      gcTimer = setTimeout(function () {
        settle({ status: 'ok-nogc', account: flags.account, message: 'Logged in, but the CS2 Game Coordinator did not respond. Close CS2 if it is running, then retry.' });
      }, GC_CONNECT_TIMEOUT_MS);
    });

    csgo.once('connectedToGC', function () {
      flags.gc = true;
      if (gcTimer) { clearTimeout(gcTimer); gcTimer = null; }
      settle({ status: 'ok', account: flags.account });
    });

    user.once('error', function (err) {
      if (gcTimer) { clearTimeout(gcTimer); gcTimer = null; }
      // A wrong code re-raises steamGuard rather than error in most flows, but
      // handle hard failures here too.
      settle({ status: 'error', message: friendlyLogonError(err) });
    });

    user.once('steamGuard', function (domain, callback) {
      guardCallback = callback;
      if (gcTimer) { clearTimeout(gcTimer); gcTimer = null; }
      settle({ status: 'guard', domain: domain || null, message: 'That code was not accepted — enter the newest code.' });
    });

    const cb = guardCallback;
    guardCallback = null;
    try { cb(String(code || '').trim()); }
    catch (e) { settle({ status: 'error', message: 'Could not submit the code: ' + e.message }); }
  });
}

// ─── Casket operations ────────────────────────────────────────────────────────

function listCaskets() {
  if (!csgo || !flags.gc) return { status: 'error', message: 'Not connected to the CS2 Game Coordinator.' };
  const caskets = extractCaskets(csgo.inventory || []);
  return { status: 'ok', caskets: caskets, inventoryCount: (csgo.inventory || []).length };
}

function getCasketContents(casketId) {
  return new Promise(function (resolve) {
    if (!csgo || !flags.gc) {
      resolve({ status: 'error', message: 'Not connected to the CS2 Game Coordinator.' });
      return;
    }
    let settled = false;
    const timer = setTimeout(function () {
      if (!settled) { settled = true; resolve({ status: 'error', message: 'Timed out reading the storage unit — try again.' }); }
    }, CASKET_FETCH_TIMEOUT_MS);
    try {
      csgo.getCasketContents(String(casketId), function (err, items) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (err) { resolve({ status: 'error', message: 'Could not read the storage unit: ' + err.message }); return; }
        resolve({ status: 'ok', items: (items || []).map(slimGCItem) });
      });
    } catch (e) {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ status: 'error', message: e.message }); }
    }
  });
}

function logOff() {
  try { if (user) user.logOff(); } catch (e) {}
  resetState();
}

// ─── IPC registration ─────────────────────────────────────────────────────────

/**
 * register(ipcMain, options)
 *   options: { safeStorage, getStore, getUserDataPath, log }
 */
function register(ipcMain, options) {
  deps = options;

  ipcMain.handle('gc:status', function () {
    return { loggedOn: flags.loggedOn, gc: flags.gc, account: flags.account, hasToken: hasToken() };
  });

  ipcMain.handle('gc:login', function (_e, accountName, password) {
    if (!accountName || !password) return { status: 'error', message: 'Enter your Steam account name and password.' };
    return startLogon({ accountName: String(accountName).trim(), password: String(password) });
  });

  ipcMain.handle('gc:guard', function (_e, code) {
    return submitGuardCode(code);
  });

  ipcMain.handle('gc:loginToken', function () {
    const token = loadToken();
    if (!token) return { status: 'error', message: 'No saved Steam session on this machine — log in with your account name and password.' };
    return startLogon({ refreshToken: token });
  });

  ipcMain.handle('gc:caskets', function () {
    return listCaskets();
  });

  ipcMain.handle('gc:casketContents', function (_e, casketId) {
    return getCasketContents(casketId);
  });

  ipcMain.handle('gc:logout', function () {
    logOff();
    return { status: 'ok' };
  });

  ipcMain.handle('gc:clearToken', function () {
    clearToken();
    logOff();
    return { status: 'ok' };
  });
}

module.exports = {
  register: register,
  // pure helpers for the offline harness
  extractCaskets: extractCaskets,
  slimGCItem: slimGCItem,
  friendlyLogonError: friendlyLogonError,
};
