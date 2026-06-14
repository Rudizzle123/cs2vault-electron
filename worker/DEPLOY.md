# CS2 Vault Licence Worker — Deploy Notes

This Worker is **separate from the Electron app**. It runs on Cloudflare Workers
(free tier — 100k requests/day, far more than this app needs). It receives Paddle
webhooks and answers the app's "did they pay?" check.

You do NOT need this deployed for the app to build or for the trial/override to
work. You need it before real paid licences can be validated online.

---

## Prerequisites
- A Cloudflare account (free). You already use Cloudflare for DNS — Workers is a
  separate product under the same account.
- A Paddle account (see PADDLE-SETUP.md).
- Node.js installed (you already have it for the app).

## One-time setup

```bash
npm install -g wrangler
cd worker
wrangler login                      # opens a browser to authorise
```

### 1. Create the KV namespace (stores who paid)
```bash
wrangler kv namespace create LICENCES
```
Copy the `id` it prints and paste it into `wrangler.toml`, replacing
`PASTE_KV_NAMESPACE_ID_HERE`.

### 2. Set the secrets
```bash
wrangler secret put PADDLE_WEBHOOK_SECRET
# paste the signing secret from Paddle → Developer Tools → Notifications
```
Optional (only if you later add server-side Paddle lookups):
```bash
wrangler secret put PADDLE_API_KEY
```

### 3. Deploy
```bash
wrangler deploy
```
Wrangler prints your Worker URL, e.g.
`https://cs2vault-licence.<your-subdomain>.workers.dev`.

### 4. Wire it into the app
Open `src/app.js`, find `PRO_CONFIG`, and set:
```js
licenceApiBase: 'https://cs2vault-licence.<your-subdomain>.workers.dev',
```
Rebuild + release the app (bump version, push tag) so users get the URL.

### 5. Point Paddle at the Worker
In Paddle → Developer Tools → Notifications, add a destination:
- URL: `https://cs2vault-licence.<your-subdomain>.workers.dev/webhook`
- Events: `subscription.created`, `subscription.updated`, `subscription.canceled`,
  `transaction.completed`, and the past-due/payment-failed events.

---

## Testing it
- Visit the Worker root URL in a browser — it should say "OK".
- Hit `/validate?key=test&product=cs2vault` — with no matching KV record it returns
  `{"active":false}` with HTTP 404 (expected for an unknown key).
- Make a Paddle **sandbox** purchase; confirm a `lic:<key>` record appears:
  ```bash
  wrangler kv key list --binding LICENCES
  ```
- Then `/validate?key=<that-key>` should return `{"active":true,...}`.

## Licence key the customer pastes
By default the Worker uses the Paddle **subscription id** (`sub_...`) as the
licence key. Configure Paddle's purchase-confirmation email to show this id to the
customer (Paddle templating). They paste it into the app at Settings → Activate.
If you prefer your own opaque keys, mint one in `handleWebhook` and email it via
Paddle's notification template — the KV shape stays the same.

## Cost
Free tier covers this comfortably. KV: 100k reads/day, 1k writes/day free —
writes only happen on subscription changes, reads only on app launch/activation.
