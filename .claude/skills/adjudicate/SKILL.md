---
name: adjudicate
description: Protocol for judging reviewer findings after an adversarial review fan-out — deciding which findings are real, which are false positives, and what gets fixed. Use whenever reviewer agents have returned findings (in /build-feature §4, /ship-feature §3, or any ad-hoc review) and BEFORE any fix is dispatched.
---

# /adjudicate — judging reviewer findings

Reviewers report claims, not facts. Your job is to convert claims into verdicts with
EVIDENCE. The two failure modes this protocol exists to prevent (both documented in
weaker-orchestrator research): (a) accepting a plausible-sounding finding without
tracing it — wasting a fix cycle and sometimes "fixing" correct code into broken
code; (b) talking yourself out of a real finding because the fix is inconvenient.

## The protocol — for EVERY finding, no exceptions

1. **Read the actual code** at the cited `file:line` plus enough surrounding context
   to understand the path. Never adjudicate from the reviewer's quote alone.
2. **Trace the failure scenario end-to-end**: what input/state reaches this code, and
   does the claimed wrong outcome actually occur? Name the entry point that triggers
   it. If you cannot construct a concrete triggering path, the finding is PLAUSIBLE
   at best, not CONFIRMED.
3. **Check the invariant registry** — if the finding touches anything in
   `docs/INVARIANTS.md`, cite the entry id (I1–I25). Invariant-adjacent findings get
   a strictly higher bar for dismissal.
4. **Issue one of three verdicts** (binary criteria, no vibes):
   - **CONFIRMED** — you traced a concrete triggering path. Goes in the fix batch.
   - **REFUTED** — you found the specific guard/precondition that makes it
     impossible, and you cite it (`file:line`). "Seems fine" is not a refutation.
   - **UNRESOLVED** — you can neither trace nor refute. NEVER silently dismiss
     these. Escalation ladder, in order: (a) write a failing test / reproduction
     script — cheapest decisive evidence; (b) spawn 2 independent verifier agents
     prompted to REFUTE the finding ("default to refuted only with cited evidence");
     (c) if it touches money/auth/segregation (I1–I17), treat as CONFIRMED and fix
     defensively — an unresolved financial finding is a finding.

## Hard rules

- **HIGH findings on financial/auth surfaces must be REPRODUCED** (failing test or
  script output) before the fix is written, and the reproduction becomes the
  regression test in the fix. This is the B3 precedent — the review HIGHs that
  mattered were the reproduced ones.
- Severity is yours to re-grade, but re-grades DOWN require the same evidence bar
  as REFUTED.
- Two reviewers disagreeing is signal, not noise — resolve it with code evidence,
  never by majority vote.
- Fix batches go to a builder with the CONFIRMED findings as a spec (use
  /write-spec form for anything non-trivial). Trivial fixes you make yourself
  still get a regression test.
- The final report lists EVERY dismissed finding with its refutation evidence.
  A dismissal without a cited guard is an unshipped bug report.

## Gotchas (from real sessions)

- A finding being "already handled elsewhere" is only a refutation if the elsewhere
  is on the SAME code path — cite the call chain, not a sibling function.
- Reviewers running the same model share blind spots: zero findings from 3 same-model
  lenses is weaker evidence than zero findings from mixed-model lenses. For
  SoR/fees/NAV/capital diffs, at least one lens runs `model: "opus"`.
- "Pre-existing, not introduced by this diff" is a valid dismissal for the fix batch
  but MUST be recorded as discovered work (roadmap item or memory note) — the B3
  discovered-work items (B13–B15) were all of this kind and all real.
- Beware fix-cascade: after a fix batch, re-run the affected lens on the fix diff.
  A fix that survives no review is unreviewed code.
