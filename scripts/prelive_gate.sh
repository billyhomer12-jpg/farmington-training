#!/usr/bin/env bash
# Pre-live gate: TEST mode only. Exit non-zero on any failure. Log -> evidence/MEMBERSHIP/gate.log
set -o pipefail
cd "$(dirname "$0")/.."
LOG=${GATE_LOG:-/workspace/web-team/evidence/MEMBERSHIP/gate.log}
{ echo "== prelive gate $(date '+%F %T %Z') commit $(git rev-parse --short HEAD)"; unset MEMBERSHIP_EMAILS_SEND; python3 scripts/prelive_gate.py; } 2>&1 | tee "$LOG"
