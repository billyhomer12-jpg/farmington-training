# tools/verify.sh: required pre-deploy gate (V1)
Run before EVERY push to main and attach the output: `tools/verify.sh` (live) or `tools/verify.sh --local` (this checkout).
Exit 0 = PASS; any failing check = non-zero = do not deploy. Needs python3 + playwright (chromium), node, curl.
Checks: tools/verify.d/ (executable, name order; files starting with _ are helpers)
- 10 entry points: http/https x apex/www end at HTTPS 200
- 20 secrets in tracked files (pk_/sb_publishable_/anon JWT allowed)
- 30 gold colors
- 40 Stripe: package prices + links vs tools/verify-fixtures/stripe-payment-links.json (read-only snapshot; STRIPE_READ_KEY = live GET readback); config sale links allowed; MEMBERSHIP_PRICES vs Stripe recurring
- 50 deals config (both LAUNCH_AT states): durations 3-10 d, overlap, value_add exclusions, discount <=20% and sale = round(regular x (1-pct)), no Founding Family copy on grand-opening
- 55 sitemap: 200, title, meta description, no 'Text us to join'
- 60 Playwright 320-1280: ellipsis truncation, literal ... / …, CLS>0.1, .gsize segments, banned content, weight-room note scope, deal copy timing, sale timing via ?deal_now, Monthly cards vs MEMBERSHIP_PRICES
Add a check: drop an executable NN-name.(sh|py|mjs) that prints PASS/FAIL lines and exits non-zero on failure.
Refresh the Stripe snapshot (read-only) in the same commit whenever Stripe prices/links change.
