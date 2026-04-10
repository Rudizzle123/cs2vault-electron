# CS2 Vault — Desktop App

Professional CS2 investment portfolio tracker. Built with Electron.

---

## First Time Setup

### Requirements
- **Node.js** (LTS version) — download from https://nodejs.org
- **Windows 10/11** or **macOS 12+**

### Install & Run

1. Extract the `cs2vault` folder anywhere on your PC
2. Double-click **`INSTALL.bat`**
3. It will install dependencies and launch the app automatically

After that, use **`START.bat`** to open the app anytime.

---

## What's Different from the Browser Version

| Feature | Browser version | Desktop app |
|---|---|---|
| No `--disable-web-security` needed | ❌ Required | ✅ Works natively |
| Data storage | Browser localStorage (5MB limit) | SQLite database (no limit) |
| Data location | Tied to Chrome profile | `%APPDATA%\cs2vault\` |
| Price alert notifications | In-app toast only | Native Windows/Mac notifications |
| File exports | Browser download dialog | Native Save As dialog |
| Runs in background | No | Yes (minimise to tray in future) |

---

## Your Data

All data is stored locally on your machine at:

- **Windows:** `C:\Users\[you]\AppData\Roaming\cs2vault\cs2vault.db`
- **Mac:** `~/Library/Application Support/cs2vault/cs2vault.db`

**Your existing data from the browser version:** Open the browser tracker, open DevTools console, and run:

```javascript
// Export your data
JSON.stringify({
  holdings:  localStorage.getItem('cs2vault_holdings'),
  history:   localStorage.getItem('cs2vault_history'),
  snapshots: localStorage.getItem('cs2vault_snapshots'),
  skins:     localStorage.getItem('cs2vault_skins'),
  watchlist: localStorage.getItem('cs2vault_watchlist'),
  alerts:    localStorage.getItem('cs2vault_alerts'),
  apikey:    localStorage.getItem('cs2vault_apikey'),
})
```

Then in the desktop app's DevTools console (View → Toggle DevTools):

```javascript
// Import your data — paste the JSON output from above as DATA
const DATA = { /* paste here */ };
Object.entries(DATA).forEach(([k,v]) => { if(v) window._storeSet(k, v); });
location.reload();
```

---

## Building a Distributable (.exe installer)

```bash
npm run build
```

Output will be in the `dist/` folder as a Windows NSIS installer.

---

## Development

```bash
npm run dev    # Opens with DevTools
npm start      # Normal launch
```
