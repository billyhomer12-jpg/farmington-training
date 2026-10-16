#!/usr/bin/env bash
# All 4 entry points must end at an https:// URL on the domain with HTTP 200. Skipped for --local runs.
[ -n "${VERIFY_LOCAL:-}" ] && { echo "SKIP entry points (local run)"; exit 0; }
D="${VERIFY_DOMAIN:-fourcornershoopsandperformance.com}"; f=0
for u in "http://$D/" "https://$D/" "http://www.$D/" "https://www.$D/"; do
  r=$(curl -sS -o /dev/null -L --max-redirs 5 --max-time 20 -w '%{url_effective} %{http_code}' "$u" 2>&1 | tail -1)
  end=${r% *}; code=${r##* }
  if [[ "$end" == https://* && "$code" == 200 ]]; then echo "PASS $u -> $end $code"; else echo "FAIL $u -> $r"; f=1; fi
done; exit $f
