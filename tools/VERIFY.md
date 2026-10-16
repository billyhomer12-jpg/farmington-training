# tools/verify.sh: required pre-deploy gate (V1)
Run before EVERY push to main and attach the output: `tools/verify.sh` (live) or `tools/verify.sh --local` (this checkout).
Exit 0 = PASS; any failing check = non-zero = do not deploy. Needs python3 + playwright (chromium), node, curl.
Checks: tools/verify.d/ (executable, name order; files starting with _ are helpers)
- 10 entry points: public-resolver DNS + curl --resolve; http/https x apex/www end at HTTPS 200 (WARN while HTTPS not enforced / www cert pending; VERIFY_STRICT_HTTPS=1 to fail)
- 20 secrets in tracked files (pk_/sb_publishable_/anon JWT allowed)
- 30 gold colors
- 40 Stripe: package prices + links vs tools/verify-fixtures/stripe-payment-links.json (read-only snapshot; STRIPE_READ_KEY = live GET readback); config sale links allowed; MEMBERSHIP_PRICES vs Stripe recurring
- 50 deals config (both LAUNCH_AT states): durations 3-10 d, overlap, value_add exclusions, discount <=20% and sale = round(regular x (1-pct)), no Founding Family copy on grand-opening
- 55 sitemap: 200, title, meta description, no 'Text us to join'
- 60 Playwright 320-1280: ellipsis truncation, literal ... / …, CLS>0.1, .gsize segments, banned content, weight-room note scope, deal copy timing, countdown only inside the deal window, sale timing via ?deal_now, struck regular price beside every price during the window, Monthly cards vs MEMBERSHIP_PRICES
Add a check: drop an executable NN-name.(sh|py|mjs) that prints PASS/FAIL lines and exits non-zero on failure.
Refresh the Stripe snapshot (read-only) in the same commit whenever Stripe prices/links change.

## 60-render stability
Chromium launches with --disable-dev-shm-usage --disable-gpu and VERIFY_PAR defaults to 4 (was 8; 8 parallel full-page renders crashed the browser with TargetClosedError). If the browser still crashes, the step is retried once in a fresh browser (WARN line); a second crash prints one `FAIL render step crashed twice (browser error...)` line, no stack trace.

## 50-deals countdown window
No fixed hour cap: countdown_hours must fit inside the deal's own start_at..end_at (grand opening 10/16 18:15 -> 10/19 18:15 MT = 72h).
