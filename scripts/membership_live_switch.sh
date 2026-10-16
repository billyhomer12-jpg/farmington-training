#!/usr/bin/env bash
# One-command membership go-live / rollback for Four Corners. DRY-RUN BY DEFAULT.
#   scripts/membership_live_switch.sh go        [--execute]
#   scripts/membership_live_switch.sh rollback  [--execute]
# --execute needs: STRIPE_LIVE_KEY_FILE (sk_live_/rk_live_ key file), /workspace/.sbtoken, and Billy's approval via Cisco.
# Emails to parents stay OFF (MEMBERSHIP_EMAILS_SEND is never set here).
set -euo pipefail
cd "$(dirname "$0")/.."
CMD=${1:-}; EXEC=${2:-}; REF=jrcozcrfbjcsuqkmoaki
run(){ if [ "$EXEC" = "--execute" ]; then echo "+ $*"; eval "$@"; else echo "[dry-run] $*"; fi; }
gen_live_fns(){ # live copies: MEMBERSHIP_LIVE_* secrets, separate function names; test functions untouched
  for f in membership-webhook membership-checkout; do mkdir -p supabase/functions/$f; done
  sed 's/MEMBERSHIP_TEST_/MEMBERSHIP_LIVE_/g' supabase/functions/membership-webhook-test/index.ts > supabase/functions/membership-webhook/index.ts
  sed 's/MEMBERSHIP_TEST_/MEMBERSHIP_LIVE_/g' supabase/functions/membership-checkout-test/index.ts > supabase/functions/membership-checkout/index.ts
  # live checkout cancel_url without preview flag
  sed -i 's#/pricing.html?membership_preview=1\#memberships#/pricing.html\#memberships#' supabase/functions/membership-checkout/index.ts
}
case "$CMD" in
go)
  echo "== 1. Live Stripe objects (products, monthly prices, portal config, webhook) on acct_1UR0vSRpcc5zZV0D"
  run "python3 scripts/create_live_membership_objects.py --execute"   # writes live_ids.json + live_whsec (chmod 600, gitignored)
  echo "== 2. Live secrets (values read from files, never printed)"
  run "python3 scripts/live_secrets_env.py > /tmp/mlive.env && SUPABASE_ACCESS_TOKEN=\$(cat /workspace/.sbtoken) npx -y supabase@latest secrets set --env-file /tmp/mlive.env --project-ref $REF; rm -f /tmp/mlive.env live_whsec"
  echo "== 3. Deploy live functions membership-webhook + membership-checkout"
  gen_live_fns
  for f in membership-webhook membership-checkout; do run "SUPABASE_ACCESS_TOKEN=\$(cat /workspace/.sbtoken) npx -y supabase@latest functions deploy $f --project-ref $REF --no-verify-jwt --use-api"; done
  echo "== 4. Front end: buttons -> on-site checkout, config points at live function, bump v"
  run "python3 scripts/live_frontend_swap.py && git add -A && git -c user.name='Billy Homer' -c user.email=billyhomer12@gmail.com commit -m 'Memberships live: on-site checkout' && git fetch && git rebase origin/main && git push origin HEAD:main"
  echo "== 5. Verify: curl pricing (cache-busted) shows member-signup links; signed bad-sig to membership-webhook returns 400"
  ;;
rollback)
  echo "== Front end back to 'Text us to join' (revert the go-live commit; no force-push)"
  run "git fetch && git checkout -B rollback origin/main && git revert --no-edit \$(git log origin/main --grep='Memberships live: on-site checkout' -n1 --format=%H) && git push origin HEAD:main"
  echo "== Stop new live checkouts immediately (existing subscriptions keep working via the webhook)"
  run "printf 'MEMBERSHIP_LIVE_CHECKOUT_OFF=1\n' > /tmp/off.env && SUPABASE_ACCESS_TOKEN=\$(cat /workspace/.sbtoken) npx -y supabase@latest secrets set --env-file /tmp/off.env --project-ref $REF; rm /tmp/off.env"
  echo "== Live Stripe objects are left in place (archiving prices would break existing subscribers). To fully stop: cancel subs in Stripe dashboard."
  ;;
*) echo "usage: $0 go|rollback [--execute]"; exit 1;;
esac
