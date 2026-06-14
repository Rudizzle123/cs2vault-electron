# Code Signing — Setup Checklist

Unsigned Windows installers trigger SmartScreen "unknown publisher" warnings,
which is unacceptable for a paid product. This sets up signing in the GitHub
Actions build. **The build already works unsigned** — it only signs once you add
the secrets below, so nothing is blocked until you buy a certificate.

The wiring lives in `.github/workflows/build.yml` (env vars `CSC_LINK` /
`CSC_KEY_PASSWORD`). electron-builder signs automatically from those env vars — no
extra `package.json` config is required.

---

## Step 1 — Buy a certificate (~£200–400/yr)
Two options:

### OV (Organisation Validation) — simpler, file-based
- Issued as a `.pfx` file you control.
- Cheaper, but Windows SmartScreen reputation builds up over time (early
  downloads may still warn until reputation accrues).
- Vendors: Sectigo, SSL.com, DigiCert, Certum (Certum has a cheaper option for
  sole traders / open-source).

### EV (Extended Validation) — instant SmartScreen reputation, pricier
- Required if you want to skip the SmartScreen warm-up entirely.
- **Important:** since June 2023, EV certs are issued on hardware/cloud HSMs and
  **can no longer be exported as a `.pfx` file**. The file-based `CSC_LINK` path
  below does NOT work for EV. Use the cloud-HSM hook (bottom of this doc).

> For a solo dev launching, an **OV cert is usually the pragmatic choice**.

## Step 2 (OV) — prepare the secrets
1. Base64-encode your `.pfx`:
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) > cert.txt`
   - macOS/Linux: `base64 -w0 cert.pfx > cert.txt`
2. In GitHub → repo → Settings → Secrets and variables → Actions → New secret:
   - `CSC_LINK` = the base64 string from `cert.txt`
   - `CSC_KEY_PASSWORD` = your `.pfx` password
3. Push a version tag as usual. The moment the `CSC_LINK` secret exists, the
   workflow's **"Build and publish (signed)"** step runs instead of the unsigned
   one, and electron-builder signs the installer automatically. Done.

That's it for OV — no code change needed. The workflow has two mutually exclusive
build steps (signed / unsigned) gated on whether `CSC_LINK` is set, so adding the
secret is all it takes to switch from unsigned to signed builds.

> Note: the build deliberately runs **unsigned until the secret is present** — an
> empty `CSC_LINK` is not the same as unset and would break electron-builder, so
> the workflow only passes the signing env vars when the secret actually has a
> value.

## Step 3 — verify
- After a signed release, download the installer and check:
  Right-click → Properties → **Digital Signatures** tab shows your publisher name.
- SmartScreen should stop calling it "unknown publisher" (immediately for EV,
  after some download reputation for OV).

---

## EV / cloud HSM (Azure Trusted Signing, SSL.com eSigner, etc.)
EV certs sign via a cloud service, not a local file, so `CSC_LINK` is unused.
Instead add a custom sign hook. Outline:

1. Add a signing script, e.g. `build/sign.js`, that calls your provider's signing
   tool (Azure Trusted Signing's `Invoke-TrustedSigning`, or SSL.com `CodeSignTool`).
2. Reference it in `package.json`:
   ```json
   "win": { "sign": "./build/sign.js" }
   ```
3. Store the provider credentials as GitHub secrets and pass them through the
   workflow `env:` block (same pattern as `CSC_LINK`).

Azure Trusted Signing is currently the cheapest EV-equivalent route (~$10/mo) and
is well documented with electron-builder; recommended if you go the EV path.

---

## Quick reference
| Cert type | What to set | Where |
|-----------|-------------|-------|
| OV (.pfx) | `CSC_LINK` (base64), `CSC_KEY_PASSWORD` | GitHub Actions secrets |
| EV (HSM)  | provider creds + `win.sign` hook | secrets + build/sign.js |
| None yet  | nothing | builds unsigned, still works |
