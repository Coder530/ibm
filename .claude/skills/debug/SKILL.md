---
name: debug
description: Systematic root-cause protocol for bugs — reproduce first, localize by evidence, fix at the cause, prove with a regression test. Use whenever Jack reports a bug ("Bug:" opener), CI goes red unexpectedly, prod misbehaves, or a fix attempt has already failed once. Not for build-time type/lint errors with obvious messages.
---

# /debug — root-cause protocol

The failure mode this prevents: pattern-matching a symptom to a familiar cause and
"fixing" the wrong thing — each wrong fix adds noise and sometimes new bugs. The
discipline: no fix until the bug is REPRODUCED and the mechanism is stated in one
sentence.

## Protocol

1. **Reproduce before anything.** Smallest deterministic reproduction: failing
   vitest (pglite for ledger paths), a script against dev, or an exact API call.
   Can't reproduce ⇒ that IS the current task — add observability (structured
   logs, Supabase `get_logs`, Vercel runtime logs), don't guess-fix. A bug you
   cannot reproduce is a bug you cannot prove fixed.
2. **State the expected vs actual** in one sentence each, with the exact values.
   Vague symptom in ⇒ vague fix out.
3. **Localize by bisection, not intuition.** Walk the data path and find where
   values are last-good / first-bad: UI → server action → lib → DB, or
   webhook → handler → tx. `git log -p <file>` / `git bisect` when it regressed;
   check recent merges first (two PRs interacting is a proven class — the R3F
   JSX-augmentation bug only existed on merged main).
4. **State the mechanism** — one sentence, cause → effect, before writing the fix.
   If you can't write that sentence you haven't found it; return to 3.
5. **Fix at the cause, minimally.** No drive-by refactors (Jack's rule). If the
   true fix is large/risky, say so and propose; don't unilaterally band-aid —
   and never band-aid + silently move on.
6. **Prove:** the reproduction from step 1 now passes AND the full gates run green
   (`npx tsc --noEmit && npm run lint && npx vitest run --exclude 'e2e/**'`).
   The reproduction becomes a permanent regression test with a comment naming the
   bug it pins.
7. **Record** the mechanism + fix in the session memory if the gotcha is durable
   (would bite again in 3 months).

## Escalation & delegation

- Recon (log trawls, grep sweeps, "which commits touched X") → Explore/haiku.
- The mechanism hypothesis and the fix decision stay with the orchestrator.
- After TWO failed fix attempts: STOP. Re-derive the mechanism from scratch —
  assume the hypothesis is wrong, not the execution. Widen, don't deepen.
- Heisenbugs under parallel load: pglite contention causes local-only timeouts —
  re-run quietly once, trust CI over a loaded local machine (proven pattern).

## Gotchas (proven classes in this repo)

- **Hydration mismatches**: SSR/browser locale or ICU divergence
  (`Intl.NumberFormat` compact notation) — render deterministically, compare
  server- and client-rendered output.
- **Silent DB write failures**: NUMERIC overflow / RLS policy mismatch — a
  0-row write with no throw. Check the write's returned row count, not the
  absence of an error (`.select('id')`-gate pattern).
- **Env var truthiness**: empty-string env vars pass `??` but must fall through —
  this repo deliberately uses `||` (I19).
- **Warm-serverless fire-and-forget**: replies that "sometimes" don't send need
  `waitUntil`/`after()` (Phase-7 Slack/Discord incident).
- **Order-dependence in accounting paths**: if a value differs by when things ran,
  suspect a missing as-of cut or a live-state read where a frozen snapshot
  belongs (deferred-ledger item 16 class).
- **CHECK-constraint drift**: code enqueues a value prod's CHECK doesn't allow yet
  because the migration isn't applied — check `ready:false` degradation first.
