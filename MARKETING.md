# CS2 Vault — Marketing Plan

Captured: July 2026 strategy session. Companion doc: LAUNCH-PLAN.md (pricing + timeline).

Rudi's constraints (self-reported): **2–5 hours/week**, enjoys **being on camera
(YouTube)** and **Reddit/Discord posts**, does NOT want to write SEO content himself
(Claude generates it, Rudi publishes).

Core insight: **CS2 tax content is an empty lane.** Hundreds of case-investing channels
exist; essentially nobody covers the tax side — which is exactly the anxious, moneyed
viewer Vault Pro wants. The people who care about tax (cashing out serious money) are a
small slice of skin holders but hold most of the value.

Timing rule for everything below: peak effort into **Dec–Jan (UK self-assessment
deadline 31 Jan)** then roll straight into **US filing season (Jan–Apr)**. That's when
search volume and anxiety spike.

---

## Lane 1 — YouTube (the main engine, ~3 hrs/week)

Format: screen-recording heavy (cheap to produce, and every video is implicitly a
product demo because the app is on screen). One video per week or fortnight.

### Video ideas backlog
**Launch video:**
- "I calculated the REAL tax bill on my £41k CS2 portfolio" — Rudi's own full-cashout
  model, real numbers, real stakes. (Depends on the £41k CGT modelling task —
  LAUNCH-PLAN.md standing items.)

**Evergreen tax explainers (each maps to engine work already done):**
- "Do you owe tax if you never cash out of Steam Wallet?" (the UK dual-view /
  disposal-definition question — huge forum confusion on this)
- "What HMRC actually says about CS2 skins" (UK profile: £3,000 allowance, 18/24%,
  Section 104 pooling, same-day + 30-day rules)
- "Germany's 1-year rule makes skins TAX-FREE — here's the catch" (§23 EStG holding
  exemption + the €1,000 Freigrenze cliff, all-or-nothing)
- "The IRS and your skins: short vs long term, and the 1099-K trap" (gross-proceeds
  reporting — your cost-basis records are your defence)
- "Australia's 50% CGT discount on skins — only if you can prove the date"
- "Selling skins in Finland? The €1,000 trap is on PROCEEDS, not profit" (the v3.3.3
  fix — a genuinely counterintuitive rule)
- Per-country breakdowns for the rest: Canada, Sweden, Poland, Norway, Denmark
  (10 verified jurisdictions = 10 videos minimum)

**Tracker/portfolio content (broader funnel, feeds the free tier):**
- "How I track a £41k CS2 portfolio" (app tour)
- "Why your 'profit' number is wrong: average cost vs FIFO vs specific ID, explained
  with real skins" (the cost-basis engine)
- "Case investing returns vs S&P 500 / Bitcoin / Gold" (the benchmark chart)
- Tax-season countdown shorts in January ("X days to the deadline — here's what skin
  sellers forget")

### Production notes
- End every video with the free-tier download, not a hard sell — the tax engine sells
  itself once they're in.
- Creator outreach in parallel: send free Pro licences to case-investing YouTubers;
  paid sponsorship only if organic traction stalls. Faster than growing a channel from
  zero, but Rudi's own channel compounds and he enjoys it — do both.

---

## Lane 2 — Reddit / Discord (~1 hr/week)

**Rule: don't promote — answer.** Tax questions appear constantly on r/csgomarketforum,
r/GlobalOffensiveTrade, and trading Discords, and the answers are mostly wrong (e.g.
"you don't own the skins so it can't be taxed", "only when you cash out"). Being the
person who gives correct, sourced answers builds exactly the credibility a tax tool
needs.

- App in profile/flair; mention the tool only when directly relevant to the question.
- Slow burn, high trust — this is reputation-building, not lead gen. Expect months.
- Cross-post the YouTube explainers where subreddit rules allow.
- Watch these threads for feature demand too (e.g. first CA customer → triggers the
  deferred Canada loss-classification work).

---

## Lane 3 — SEO content site (0 hrs/week of Rudi's time — Claude writes it)

The Paddle-required website (WEBSITE-SETUP.md) should be built as a **content site**,
not a bare landing page:

- Landing + /pricing + /terms + /privacy + /refund (the Paddle-required set), PLUS
- **One long-form tax guide per jurisdiction** — 10 pages nobody else can write
  credibly, because each is backed by the app's primary-source verification pass
  (`09-tax-rules-verification.md`). Target queries: "do I pay tax on CS2 skins [UK/
  Germany/Australia/...]", "CS2 skin capital gains [country]", "Steam wallet tax".
- Each guide ends in the app ("or let CS2 Vault calculate it").
- Current ranking content for these queries is thin affiliate material — very winnable.
- These pages capture the buyer at their exact moment of pain, indefinitely, while
  Rudi sleeps.

Workflow: Claude generates all copy; Rudi reviews and deploys (Cloudflare Pages).
Guides must carry the same "estimates, not tax advice" disclaimer as the app and be
refreshed alongside the annual figure re-verification.

---

## Positioning cheatsheet

- One-liner: **"The Koinly for CS2 skins."** Serious accounting + tax for long-term
  skin investors — not a flipper tool.
- Skins are taxable assets, full stop — no hedging on the premise (locked-in product
  decision, v3.1.1). Confidence is the differentiator vs forum guesswork.
- Free tier = full tracker (acquisition funnel). Pro = the tax engine, CSV export,
  multi-currency, Cash Out Calculator ($6.99/mo · $49/yr — see LAUNCH-PLAN.md).
- Trust signals to surface everywhere: signed installer, local-only data storage
  (nothing leaves the machine except price lookups), primary-source-verified figures,
  per-jurisdiction disclaimers.
