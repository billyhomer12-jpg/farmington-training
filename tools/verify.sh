#!/usr/bin/env bash
# Four Corners pre-deploy gate (V1). REQUIRED before every deploy.
# Usage: tools/verify.sh [BASE_URL]   (default: live site; use http://127.0.0.1:8080 for a local `python3 -m http.server 8080`)
#        tools/verify.sh --local      (serves this checkout on a random port and checks it)
# Runs every executable tools/verify.d/NN-*.{sh,py,mjs}; any non-zero exit fails the gate.
# Add a check: drop an executable file into tools/verify.d/ that prints PASS/FAIL lines and exits non-zero on failure.
# Env passed to checks: VERIFY_BASE, VERIFY_ROOT (repo root), VERIFY_OUT (evidence dir), VERIFY_DOMAIN.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export VERIFY_ROOT="$ROOT" VERIFY_DOMAIN="${VERIFY_DOMAIN:-fourcornershoopsandperformance.com}"
export VERIFY_OUT="${VERIFY_OUT:-/tmp/verify-out}"; mkdir -p "$VERIFY_OUT"
SRV=""
if [ "${1:-}" = "--local" ]; then
  PORT=$((20000 + RANDOM % 20000)); (cd "$ROOT" && exec python3 -m http.server "$PORT" >/dev/null 2>&1) & SRV=$!
  sleep 1; export VERIFY_BASE="http://127.0.0.1:$PORT" VERIFY_LOCAL=1
else export VERIFY_BASE="${1:-https://$VERIFY_DOMAIN}"; fi
trap '[ -n "$SRV" ] && kill $SRV 2>/dev/null' EXIT
echo "verify.sh base=$VERIFY_BASE root=$ROOT $(date '+%F %T %Z')"
fail=0
for c in "$ROOT"/tools/verify.d/*; do
  n0=$(basename "$c"); { [ -f "$c" ] && [ -x "$c" ] && [ "${n0#_}" = "$n0" ]; } || continue
  n=$(basename "$c"); echo "=== $n"
  if "$c"; then echo "--- $n: PASS"; else echo "--- $n: FAIL"; fail=1; fi
done
if [ $fail = 0 ]; then echo "VERIFY: PASS"; else echo "VERIFY: FAIL"; fi
exit $fail
