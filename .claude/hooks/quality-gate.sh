#!/bin/bash
# SubagentStop quality gate — blocks worker agents (builder/tester/data/designer/ai)
# from returning while the code they touched fails tsc or eslint.
# Exit 2 = block, stderr is fed back to the agent. Skips silently when the working
# tree has no TS/TSX changes (research-only agents).
# tsc runs repo-wide (it's incremental and the baseline is green); eslint runs only on
# the CHANGED files so pre-existing lint debt in untouched files never blocks an agent.

cd "$(dirname "$0")/../.." || exit 0

CHANGED=$(git status --porcelain -- '*.ts' '*.tsx' 2>/dev/null | grep -v '^ D\|^D' | awk '{print $NF}')
[ -z "$CHANGED" ] && exit 0

TSC_OUT=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  {
    echo "QUALITY GATE BLOCKED: npx tsc --noEmit failed. Fix these before returning:"
    echo "$TSC_OUT" | head -40
  } >&2
  exit 2
fi

LINT_OUT=$(echo "$CHANGED" | xargs npx eslint 2>&1)
if [ $? -ne 0 ]; then
  {
    echo "QUALITY GATE BLOCKED: eslint failed on the files you changed. Fix before returning:"
    echo "$LINT_OUT" | head -40
  } >&2
  exit 2
fi

# Mechanical invariant tripwires (docs/INVARIANTS.md R1–R5). Exits 2 with its own
# message on violation.
"$(dirname "$0")/invariant-check.sh" || exit 2

exit 0
