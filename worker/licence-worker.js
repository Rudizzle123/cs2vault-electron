/**
 * CS2 Vault — Licence Worker (Cloudflare Workers)
 * =================================================
 * This file does NOT run inside the Electron app. It is deployed separately to
 * Cloudflare Workers (free tier). It does two jobs:
 *
 *   1. POST /webhook   — receives Paddle webhook events (subscription created /
 *                        updated / cancelled / payment failed). Verifies the
 *                        Paddle signature, then writes the licence's paid state
 *                        into a KV namespace, keyed by licence key.
 *
 *   2. GET  /validate  — the desktop app calls this on launch / activation:
 *                          /validate?key=<licence>&product=cs2vault
 *                        Replies: { active: <bool>, plan: <string|null>,
 *                                   cancelledAt: <ms|null> }
 *
 * The app caches the answer locally and honours a 14-day offline grace, so this
 * Worker being briefly down never locks out a paying user.
 *
 * ─── DEPLOY ─────────────────────────────────────────────────────────────────
 * See worker/DEPLOY.md for the full step-by-step. In short:
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler kv namespace create LICENCES   (paste the id into wrangler.toml)
 *   3. Set secrets:
 *        wrangler secret put PADDLE_WEBHOOK_SECRET   (Paddle → Notifications → secret key)
 *        wrangler secret put PADDLE_API_KEY          (Paddle → Authentication → API key, for /validate fallback lookups — optional)
 *   4. wrangler deploy
 *   5. Put the deployed URL into PRO_CONFIG.licenceApiBase in src/app.js.
 *   6. In Paddle → Notifications, add a destination pointing at  <worker-url>/webhook
 *
 * ─── LICENCE KEY MODEL ──────────────────────────────────────────────────────
 * The simplest robust approach: use Paddle's per-customer/per-subscription
 * identifier as the licence key (e.g. the subscription id `sub_...`). The
 * webhook stores `{ active, plan, cancelledAt }` under that key. The purchase
 * confirmation email (configured in Paddle) shows the customer this key to paste
 * into the app. If you'd rather mint your own opaque keys, generate one in the
 * webhook handler and email it via Paddle's notification templating — the KV
 * shape below stays identical.
 */

const PRODUCT = 'cs2vault';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight (the Electron renderer sends a plain GET, but allow it).
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    if (url.pathname === '/validate' && request.method === 'GET') {
      return cors(await handleValidate(url, env));
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/' ) {
      return new Response('CS2 Vault licence worker — OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ── GET /validate ────────────────────────────────────────────────────────────
async function handleValidate(url, env) {
  const key = (url.searchParams.get('key') || '').trim();
  const product = (url.searchParams.get('product') || '').trim();
  if (!key) return json({ active: false, error: 'no-key' }, 400);
  if (product && product !== PRODUCT) return json({ active: false, error: 'wrong-product' }, 400);

  if (!env.LICENCES) {
    // KV not bound — fail safe as "unknown" rather than falsely active.
    return json({ active: false, error: 'kv-unbound' }, 500);
  }

  const raw = await env.LICENCES.get('lic:' + key);
  if (!raw) {
    // Unknown key → 404 so the app marks it inactive (out of grace immediately).
    return json({ active: false }, 404);
  }
  let rec;
  try { rec = JSON.parse(raw); } catch (e) { rec = null; }
  if (!rec) return json({ active: false }, 200);

  return json({
    active: rec.active === true,
    plan: rec.plan || null,
    cancelledAt: rec.cancelledAt || null,
  }, 200);
}

// ── POST /webhook (Paddle) ───────────────────────────────────────────────────
// Verifies the Paddle-Signature header, then upserts the licence record.
async function handleWebhook(request, env) {
  const sigHeader = request.headers.get('Paddle-Signature') || '';
  const bodyText = await request.text();

  const ok = await verifyPaddleSignature(sigHeader, bodyText, env.PADDLE_WEBHOOK_SECRET);
  if (!ok) return new Response('bad signature', { status: 401 });

  let evt;
  try { evt = JSON.parse(bodyText); } catch (e) { return new Response('bad json', { status: 400 }); }

  const type = evt.event_type || evt.alert_name || '';
  const data = evt.data || evt;

  // Derive the licence key + state from the event. With Paddle Billing the
  // subscription id is the natural licence key.
  const key = data.id || data.subscription_id || data.subscription?.id;
  if (!key) return new Response('no licence key in event', { status: 200 });

  const planName = derivePlan(data);
  let active = null, cancelledAt = null;

  if (/subscription\.(created|activated|resumed|updated)/.test(type)) {
    const status = data.status || '';
    active = (status === 'active' || status === 'trialing');
    if (status === 'canceled' || status === 'paused') active = false;
  } else if (/subscription\.canceled/.test(type)) {
    active = false;
    cancelledAt = Date.now();
  } else if (/transaction\.completed/.test(type)) {
    active = true;
  } else if (/subscription\.past_due|payment.*failed/.test(type)) {
    active = false;
  } else {
    // Event we don't act on — acknowledge so Paddle stops retrying.
    return new Response('ignored', { status: 200 });
  }

  const rec = { active: !!active, plan: planName, cancelledAt, updatedAt: Date.now(), key: String(key) };
  await env.LICENCES.put('lic:' + key, JSON.stringify(rec));

  return new Response('ok', { status: 200 });
}

function derivePlan(data) {
  try {
    const items = data.items || data.line_items || [];
    if (items.length && items[0].price && items[0].price.billing_cycle) {
      const interval = items[0].price.billing_cycle.interval; // 'month' | 'year'
      return interval === 'year' ? 'annual' : 'monthly';
    }
  } catch (e) {}
  return null;
}

// ── Paddle Billing signature verification (HMAC-SHA256) ──────────────────────
// Header format: "ts=<unix>;h1=<hex hmac>". Signed payload = "<ts>:<rawBody>".
async function verifyPaddleSignature(header, body, secret) {
  if (!secret) return false;            // no secret configured → reject
  const parts = {};
  header.split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  const ts = parts.ts, h1 = parts.h1;
  if (!ts || !h1) return false;

  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = ts + ':' + body;
  const macBuf = await crypto.subtle.sign('HMAC', keyData, enc.encode(signed));
  const computed = [...new Uint8Array(macBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(computed, h1);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  return new Response(res.body, { status: res.status, headers: h });
}
