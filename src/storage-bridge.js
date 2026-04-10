/**
 * storage-bridge.js
 * Provides a synchronous-looking localStorage replacement.
 * All data is kept in window._store (in-memory object).
 * Changes are flushed to SQLite via IPC asynchronously.
 *
 * Called once at startup: await initStore()
 * Thereafter all reads are sync (window._store[key])
 * Writes use window._storeSet(key, value) which updates
 * memory immediately and persists in the background.
 */

const STORE_KEYS = [
  'cs2vault_holdings',
  'cs2vault_history',
  'cs2vault_snapshots',
  'cs2vault_skins',
  'cs2vault_watchlist',
  'cs2vault_alerts',
  'cs2vault_apikey',
  'cs2vault_price_log',
];

window._store = {};

window._storeSet = function(key, value) {
  window._store[key] = value;
  // Fire-and-forget to SQLite
  window.cs2vault.store.set(key, value).catch(e => console.error('[Store] Write error:', e));
};

async function initStore() {
  // Load all keys from SQLite into memory at startup
  const loads = STORE_KEYS.map(async key => {
    const val = await window.cs2vault.store.get(key);
    if (val !== null && val !== undefined) window._store[key] = val;
  });
  await Promise.all(loads);
  console.log('[Store] Loaded from SQLite:', Object.keys(window._store));
}
