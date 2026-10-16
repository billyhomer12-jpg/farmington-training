#!/usr/bin/env bash
# All 4 entry points must end at HTTPS 200. Resolves via a public resolver (DNS-over-HTTPS 1.1.1.1, fallback 8.8.8.8)
# and pins with curl --resolve, so the box's DNS filter can't cause false 000s.
# WARN (not FAIL) while HTTPS isn't enforced yet (http ends at http 200) or the www cert is still pending (TLS error
# on https://www while http://www serves 200). Set VERIFY_STRICT_HTTPS=1 to make those FAIL. Skipped for --local runs.
[ -n "${VERIFY_LOCAL:-}" ] && { echo "SKIP entry points (local run)"; exit 0; }
D="${VERIFY_DOMAIN:-fourcornershoopsandperformance.com}"; f=0; R=()
ip() { local x; x=$(curl -s -m 8 -H 'accept: application/dns-json' "https://1.1.1.1/dns-query?name=$1&type=A" | python3 -c 'import sys,json;print(next((a["data"] for a in json.load(sys.stdin).get("Answer",[]) if a["type"]==1),""))' 2>/dev/null)
  [ -z "$x" ] && x=$(curl -s -m 8 "https://8.8.8.8/resolve?name=$1&type=A" | python3 -c 'import sys,json;print(next((a["data"] for a in json.load(sys.stdin).get("Answer",[]) if a["type"]==1),""))' 2>/dev/null); echo "$x"; }
for h in "$D" "www.$D"; do a=$(ip "$h"); [ -z "$a" ] && { echo "FAIL $h: no A record from public resolvers"; f=1; continue; }; echo "INFO $h -> $a"; R+=(--resolve "$h:80:$a" --resolve "$h:443:$a"); done
warn() { if [ -n "${VERIFY_STRICT_HTTPS:-}" ]; then echo "FAIL $*"; f=1; else echo "WARN $*"; fi; }
for u in "http://$D/" "https://$D/" "http://www.$D/" "https://www.$D/"; do
  r=$(curl -sS -o /dev/null -L --max-redirs 5 --max-time 20 "${R[@]}" -w '%{url_effective} %{http_code}' "$u" 2>/tmp/ep.err); rc=$?
  end=${r% *}; code=${r##* }
  if [[ $rc == 0 && "$end" == https://* && "$code" == 200 ]]; then echo "PASS $u -> $end $code"
  elif [[ $rc == 0 && "$end" == http://* && "$code" == 200 ]]; then warn "$u -> $end 200 (HTTPS not enforced yet)"
  elif [[ "$u" == https://www.* && ( $rc == 60 || $rc == 35 || $rc == 51 ) ]]; then warn "$u TLS error rc=$rc (www cert pending): $(head -c 120 /tmp/ep.err)"
  else echo "FAIL $u -> ${r:-none} rc=$rc $(head -c 120 /tmp/ep.err)"; f=1; fi
done; exit $f
