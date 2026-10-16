#!/usr/bin/env bash
# LAUNCH day in one step: tools/launch.sh 2026-12-05T09:00:00-07:00 [--live-note]
#  1. sets window.SITE.LAUNCH_AT in config.js (fresh worktree from origin/main, so other work is never disturbed)
#  2. bumps ?v=NN, commits as Billy Homer, fetch + rebase, pushes (never force)
#  3. sets training.deals.start_at for grand-opening-2026 (server +1 bonus / email line)
#  4. waits for GitHub Pages to serve the new config.js
#  5. with --live-note: applies the Founding Family checkout note to the 5 eligible Payment Links (needs the live key)
# The note removal is a separate scheduled run at LAUNCH_AT + 72h:  node tools/deal-checkout-note.mjs grand-opening-2026 remove --live
set -euo pipefail
AT="${1:?usage: tools/launch.sh <ISO with offset, e.g. 2026-12-05T09:00:00-07:00> [--live-note]}"; NOTE="${2:-}"
node -e "const d=new Date(process.argv[1]);if(isNaN(d)||!/[+-]\d\d:\d\d$|Z$/.test(process.argv[1]))process.exit(1)" "$AT" || { echo "LAUNCH_AT must be ISO with an offset"; exit 2; }
REPO=/workspace/farmington-training; WT=/workspace/ft-launch-$$; REF=jrcozcrfbjcsuqkmoaki
git -C $REPO fetch -q origin; git -C $REPO worktree add -q $WT origin/main -b launch-$$
trap 'git -C $REPO worktree remove --force $WT >/dev/null 2>&1; git -C $REPO branch -D launch-$$ -q >/dev/null 2>&1 || true' EXIT
cd $WT
grep -q '^window.SITE.LAUNCH_AT = null;' config.js || { echo "LAUNCH_AT is not null in config.js; refusing"; exit 3; }
sed -i "s|^window.SITE.LAUNCH_AT = null;|window.SITE.LAUNCH_AT = \"$AT\";|" config.js
node tools/deals-lint.mjs
V=$(grep -ohE '\?v=[0-9]+' *.html | cut -d= -f2 | sort -n | tail -1); N=$((V+1)); sed -i "s/?v=$V\b/?v=$N/g" *.html admin/*.html
git add -A; git -c user.name="Billy Homer" -c user.email=billyhomer12@gmail.com commit -qm "LAUNCH: set LAUNCH_AT=$AT (Founding Family deal, 72h) (v=$N)"
for i in 1 2 3; do git fetch -q origin && git rebase -q origin/main && git push -q origin HEAD:main && break; sleep 5; done
curl -sf -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $(cat /workspace/.sbtoken)" -H "Content-Type: application/json" \
  --data "$(jq -n --arg q "update training.deals set start_at='$AT' where id='grand-opening-2026' returning start_at" '{query:$q}')"; echo
for i in $(seq 1 60); do curl -s "https://fourcornershoopsandperformance.com/pricing.html" | grep -q "config.js?v=$N" && { echo "live v=$N"; break; }; sleep 10; done
[ "$NOTE" = "--live-note" ] && node tools/deal-checkout-note.mjs grand-opening-2026 apply --live || echo "Checkout note not applied (run with --live-note, or: node tools/deal-checkout-note.mjs grand-opening-2026 apply --live)"
