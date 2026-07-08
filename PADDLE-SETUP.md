# Vault Pro — Paddle Setup Checklist

This is everything you need to do **outside the code** to turn on real payments.
The app already has all the wiring — you're just pasting in IDs.

Where the code reads your values: **`src/app.js` → `PRO_CONFIG`** (one block near
the top, in the "VAULT PRO — PAYMENTS, LICENSING & TRIAL" section).

---

## 1. Create a Paddle account
- Sign up at paddle.com and complete seller verification (this can take a few
  days — Paddle approves you as a seller). Paddle is the **merchant of record**,
  so it handles global VAT/sales tax for you.
- Start in **Sandbox** mode for testing, switch to **Production** when verified.

## 1b. Website verification — use cs2vault.app, NOT the .pages.dev URL
The site is live and the domain is owned, so this step is pure form-filling.
When Paddle's "Tell us about your website" step asks:

- **Web domain**: `cs2vault.app` — always this, **never**
  `cs2vault-electron.pages.dev`. The .pages.dev URL is only a free alias; the
  custom domain is what the canonical URLs, SEO and policy links live on
  permanently, and it's what you want on Paddle's records.
- **Pricing page**: `https://cs2vault.app/pricing/` (must show the same
  Monthly/Annual prices you set on the Paddle price IDs in step 2 — check they
  match before submitting)
- **Terms of Service**: `https://cs2vault.app/terms/`
- **Privacy policy**: `https://cs2vault.app/privacy/`
- **Refund policy**: `https://cs2vault.app/refund/`

Paddle will give you a domain-verification method (DNS record or meta tag).
The domain is registered with Cloudflare Registrar on the same account as the
Pages project, so a DNS verification record is added under
**dash.cloudflare.com → cs2vault.app → DNS** in a few clicks.

## 2. Create the product + prices
In Paddle → Catalog → Products:
- Create a product "Vault Pro".
- Add two **prices**: one monthly, one annual. Set the actual amounts here
  (benchmark: SkinKeeper Pro ~$4.99/mo · $34.99/yr — your call).
- Copy each price's **ID** (`pri_...`).

## 3. Get your client token
Paddle → Developer Tools → Authentication:
- Copy the **client-side token** (starts `test_` in sandbox, `live_` in prod).

## 4. Fill in `PRO_CONFIG` (src/app.js)
```js
const PRO_CONFIG = {
  paddleVendorToken: 'test_xxxxxxxx',         // ← client-side token
  paddleEnvironment: 'sandbox',                // ← 'production' when live
  priceIdMonthly:    'pri_xxxxxxxxxxxx',       // ← monthly price ID
  priceIdAnnual:     'pri_xxxxxxxxxxxx',       // ← annual price ID
  licenceApiBase:    '',                       // ← from worker/DEPLOY.md (step 7)
  priceMonthlyDisplay: '$4.99 / mo',           // ← display strings only
  priceAnnualDisplay:  '$34.99 / yr',
  trialDays: 14, graceDays: 14, revalidateHours: 24,
};
```
> The displayed price (`priceMonthlyDisplay` / `priceAnnualDisplay`) is just text.
> The **real charge** is whatever you set on the Paddle price IDs. Keep them in
> sync manually so the app shows the right number.

As soon as `paddleVendorToken` + `priceIdAnnual` are set, the in-app checkout
buttons appear (replacing the "not configured" notice). Until then the app shows
a setup notice and the dev override still unlocks Pro for you.

## 5. Deploy the licence Worker
Follow **worker/DEPLOY.md**. It gives you a URL — paste it into
`PRO_CONFIG.licenceApiBase`. This is what makes a customer's pasted licence key
validate online (and keeps Pro unlocked offline for up to 14 days).

## 6. Configure the purchase email
In Paddle → Notifications / email templates, make the purchase-confirmation email
show the customer their **licence key** (by default the subscription id `sub_...`)
and tell them to paste it into **CS2 Vault → Settings → Activate**.

## 7. Point Paddle webhooks at the Worker
Paddle → Developer Tools → Notifications → add destination:
`<your-worker-url>/webhook` for the subscription + transaction events
(see worker/DEPLOY.md step 5).

---

## Test end-to-end (sandbox)
1. `paddleEnvironment: 'sandbox'`, sandbox token + sandbox price IDs in PRO_CONFIG.
2. Launch the app → Settings → Vault Pro → click a plan → complete the Paddle
   sandbox checkout in your browser.
3. Confirm the Worker stored the licence (`wrangler kv key list --binding LICENCES`).
4. Paste the licence key into Settings → Activate → it should flip to **PRO**.
5. Pull your network cable and relaunch — Pro should stay unlocked (offline grace).

## Go live
- Switch `paddleEnvironment` to `'production'`, swap to live token + live price IDs.
- Re-deploy the app (bump version, push tag).
- Make one real purchase yourself to confirm the live flow before announcing.

## Pricing reminder
Make the price decision in Paddle, then update the two `*Display` strings to match.
Never hardcode a charge amount anywhere else in the app — there's only the one
config block.
