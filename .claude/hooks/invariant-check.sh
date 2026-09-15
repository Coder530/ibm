#!/bin/bash
# Mechanical invariant tripwires — the greppable subset of docs/INVARIANTS.md.
# Called by quality-gate.sh (SubagentStop) and runnable standalone.
# Exit 2 + stderr message on violation (blocks the agent); exit 0 when clean.
# These are TRIPWIRES, not proofs: they catch the obvious violation shapes cheaply.
# The real proofs are the test suites cited in docs/INVARIANTS.md.
#
# Keep in sync with docs/INVARIANTS.md (rule ids R1–R5 map to invariant entries).

cd "$(dirname "$0")/../.." || exit 0

FAIL=0
violate() {
  echo "INVARIANT TRIPWIRE ($1): $2" >&2
  echo "$3" | head -10 >&2
  echo "See docs/INVARIANTS.md — fix the violation; do not weaken this check." >&2
  FAIL=1
}

# R1 (I10) — direct Anthropic SDK calls only in the AI lib / Analyst agentic loop.
# Everything else must go through completeWithClaudeFallback (redaction fail-closed).
R1=$(grep -rn "messages\.create" src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "^src/lib/ai/" | grep -v "^src/lib/analyst/")
[ -n "$R1" ] && violate R1 "direct model call outside src/lib/ai|src/lib/analyst — use completeWithClaudeFallback (redaction is fail-closed there)" "$R1"

# R2 (I3) — no wall-clock/randomness in deterministic accounting math.
# valuationDate is the only time input to NAV/ledger/fees/capital.
R2=$(grep -rnE "Date\.now\(\)|new Date\(\)|Math\.random\(\)" \
  src/lib/nav/ src/lib/ledger/ src/lib/fees/ src/lib/capital/ 2>/dev/null \
  | grep -vE ":[0-9]+:\s*(\*|//)" | grep -v "invariant-ok")
[ -n "$R2" ] && violate R2 "wall-clock/randomness in deterministic accounting math (NAV must be a pure function of valuationDate)" "$R2"

# R3 (I1) — no float coercion in money paths. NUMERIC strings + decimal.js only.
R3=$(grep -rnE "parseFloat\(|\.toNumber\(\)" \
  src/lib/ledger/ src/lib/nav/ src/lib/fees/ src/lib/capital/ src/lib/dealing/ src/lib/recon/ 2>/dev/null \
  | grep -vE ":[0-9]+:\s*(\*|//)" | grep -v "invariant-ok")
[ -n "$R3" ] && violate R3 "float coercion in a money path — money is Decimal/NUMERIC-string, never float" "$R3"

# R4 (I7) — the SoR ingestion path never opts into Alchemy DEX prices.
R4=$(grep -rni "alchemy" src/lib/ingestion/ 2>/dev/null)
[ -n "$R4" ] && violate R4 "Alchemy reference in src/lib/ingestion — DEX prices must never enter the append-only ledger" "$R4"

# R5 (I6) — paper/real segregation: files touching paper_positions are allowlisted.
# A NEW file referencing the paper table is a segregation-review event, not routine.
#
# The `*/core.ts` entries are the SAME code as the former `*/actions.ts` of the same name:
# the server-action de-registration pass moved each feature's implementation into a non-
# 'use server' `core.ts` (see that file's header). Content unchanged, path renamed — not a
# new paper_positions surface.
R5_ALLOW="src/app/api/mobile/connections/delete/route.ts
src/app/api/mobile/connections/route.ts
src/features/exchanges/core.ts
src/features/explorer/content/domains/data-ingestion.ts
src/features/paper/core.ts
src/features/paper/components/PaperPortfolioStatement.tsx
src/features/paper/components/PaperTradingCard.tsx
src/features/risk/data.ts
src/features/stress/data.ts
src/features/stress/factor-series.ts
src/features/tradingview/core.ts
src/lib/analyst/tools/monitor-tools.ts
src/lib/analyst/tools/risk-tools.ts
src/lib/brokers/registry.ts
src/lib/formpf/report.ts
src/lib/sync/run-sync.ts"
R5=$(grep -rl "paper_positions" src/ 2>/dev/null | sort | comm -23 - <(echo "$R5_ALLOW" | sort))
[ -n "$R5" ] && violate R5 "new file references paper_positions — paper/real segregation is invariant I6; if deliberate, add the file to the allowlist in this script IN THE SAME reviewed diff" "$R5"

# R6 — the retired flat $999/mo self-serve-trial pricing model must never reappear in src/.
# PRICING.md is now the pricing SSOT: banded by AUM, sales-led, no free trial (a paid
# parallel-run pilot stands in its place). Every priced surface imports from
# src/lib/pricing/bands.ts rather than hardcoding a figure. No allowlist — a dev-API SKU
# ($0/$49/$499) never collides with these patterns. Also matches reordered/reworded
# "free trial" phrasing (F6 fix — a "Start a free NYX Suite trial" line survived the
# original sales-led rewrite because the literal wording didn't match the original
# pattern set).
# NOTE: "no free trial"-style DISCLOSURE copy is legitimate — only the CTA/claim
# phrasings are banned (bare 'free trial' would false-positive the policy statements).
R6=$(grep -rInE '\$999|999/mo|999 a month|14-day free trial|Start [Ff]ree [Tt]rial|[Ff]ree [Tt]rial →|NYX Suite trial|free NYX' src/ 2>/dev/null)
[ -n "$R6" ] && violate R6 "retired \$999/14-day-trial pricing literal in src/ — PRICING.md is the SSOT, import from src/lib/pricing/bands.ts instead" "$R6"

# R7 — 'use server' const-export breaker (third recurrence: B4 maker-checker, free
# tools, instruments P2). A non-function export from a 'use server' module fails
# next build's page-data collection for EVERY route that transitively imports the
# file — and tsc/vitest stay green, so it only surfaces at build/deploy time.
# Constants live in a sibling plain module (schema.ts/constants.ts) instead.
R7=$(grep -rl "^'use server'" src/ 2>/dev/null | while read -r f; do
  grep -lE "^export (const|let|var) " "$f" 2>/dev/null
done)
[ -n "$R7" ] && violate R7 "non-function export from a 'use server' module — breaks next build for every importing route; move the const to a sibling plain module" "$R7"

# R8 (I18) — the weak MFA gate. `needsMfa` is FALSE for an account with zero enrolled
# factors (it only catches step-up), so a bare `const { needsMfa } = await getAalState(...)`
# waves through exactly the never-enrolled population the gap-#3 enrollment wall exists to
# block. The middleware wall cannot cover it: server actions dispatch by action id, not page
# path, and the matcher excludes api/. Use `mfaRequired(supabase)` from src/lib/auth/aal.ts,
# which is `needsMfa || (mfaEnrollmentEnforced() && !hasVerifiedFactor)`.
# The Bearer/mobile path (auth.needsMfa in src/lib/auth/mobile-route.ts) is deliberately NOT
# matched here — it stays step-up-only as a documented, founder-accepted risk.
R8=$(grep -rn "const { needsMfa } = await getAalState" src/ 2>/dev/null | grep -v "^src/lib/auth/aal.ts:")
[ -n "$R8" ] && violate R8 "bare needsMfa gate — false for never-enrolled accounts; use mfaRequired(supabase) from src/lib/auth/aal.ts" "$R8"

# R9 (I18) — no-auth cores must never be re-exported from a 'use server' module. Next
# registers every async export of such a module as an independently addressable server-action
# endpoint, callable by action id. The `*ForFund`/`*ForUser` cores take a caller-supplied
# fundId/userId and perform NO auth and NO ownership check (several run over the RLS-bypassing
# owner pool or a service-role client), so exporting one from an action module publishes an
# unauthenticated write path to fund-scoped state. They live in the sibling `core.ts`, which
# deliberately has no directive; `actions.ts` exposes only authenticated wrappers.
R9=$(grep -rl "^'use server'" src/ 2>/dev/null | while read -r f; do
  grep -lE "^export async function [A-Za-z0-9_]+(ForFund|ForUser)\b" "$f" 2>/dev/null
done)
[ -n "$R9" ] && violate R9 "no-auth *ForFund/*ForUser core exported from a 'use server' module — that publishes it as an addressable endpoint; move it to the sibling core.ts (no directive) and expose only an authenticated wrapper" "$R9"


# R10 — Mission Control Phase 3 ratchet: local `formatUsd` copies must never grow past the
# baseline. DESIGN_SPEC.md §13e ("all number/date formatting via src/lib/format") is fully
# enforced repo-wide as of PR G (the eslint no-restricted-syntax rule for raw formatting
# escalated warn -> error in that PR) — this tripwire stays on as the permanent floor
# tripwire: the ONE frozen exception (AnswerCard) may never be joined by a second. Detection
# EXACTLY matches the command used to set the baseline (word boundary so `formatUsdWhole` in
# pilots does not match; excludes the canonical layer itself).
#
# Baseline = 1, verified at PR G (close-out) build time (2026-08-27) via:
#   grep -rlnE "(function|const) formatUsd\b" src --include='*.ts' --include='*.tsx' | grep -v '^src/lib/format/'
# -> src/features/analyst/components/workspace/AnswerCard.tsx   (frozen surface — the
#                                                                 permanent, documented floor)
# `src/features/portal/components/format.ts` is NOT in this list — PR A turned its
# `formatUsd` into a pure re-export, so it no longer lexically declares the function.
# PR D deleted the 3 desk-panel copies the wave card named —
# src/features/desk/components/panels/PositionsPanel.tsx / NavPanel.tsx / RiskPanel.tsx
# (now import formatUsd from @/lib/format, dp:0 to match the old whole-dollar Intl
# output) — dropping the count 7 -> 4. PR E deleted the local `formatUsd` function out of
# src/app/dashboard/opportunities/format.ts (its other exports stay; OpportunityRow.tsx now
# imports formatUsd from @/lib/format, dp:0) — dropping 4 -> 3. PR G (close-out) deleted
# src/features/futures/lib/format.ts entirely (the positional-arg adapter wrapper) after
# converting its 4 positional call sites (TermStructureCurve/RollTimeline/PositionsTape/
# PositionDetailDrawer) to the canonical options-object shape, and inlined
# src/features/free-tools/pdf.tsx's local `formatUsd(n)` wrapper into its one call site as
# `canonicalFormatUsd(n, {dp:0})` (safe: back-office-savings compute.ts's savingsUsd, the
# only value this PDF ever renders through it, is `Math.max(0, ...)`, never negative, so the
# old Math.round/toLocaleString output and the canonical half-up/BigInt output agree exactly)
# — dropping 3 -> 1. pilots/components/format.ts's `formatUsdWhole` was evaluated for the
# same treatment (wave card ask) and INTENTIONALLY KEPT: a byte-equivalence probe against
# `formatUsd(v, {dp:0})` showed two real divergences — formatUsdWhole TRUNCATES a
# fractional whole-dollar string instead of rounding (`"2500.99"` -> `"$2,500"` vs
# formatUsd's `"$2,501"`), and it passes a non-numeric string through verbatim instead
# of rendering '—'. Not byte-equivalent, so it stays (word boundary above already
# excludes it from this count regardless — `formatUsdWhole` != `formatUsd`).
R10_BASELINE=1
R10=$(grep -rlnE "(function|const) formatUsd\b" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v '^src/lib/format/')
R10_COUNT=$(echo "$R10" | grep -c . || true)
if [ "$R10_COUNT" -gt "$R10_BASELINE" ]; then
  violate R10 "local formatUsd copy count ($R10_COUNT) exceeds the Mission Control P3 baseline ($R10_BASELINE) — format via @/lib/format instead of declaring a new local formatUsd" "$R10"
fi

exit $((FAIL == 1 ? 2 : 0))
