---
name: build-feature
description: Orchestrated delivery pipeline — the main loop specs and adjudicates, cheap-model workers build/test/review, quality gates enforce, every acceptance criterion is verified with evidence. Use for any multi-file feature, fix, or refactor.
disable-model-invocation: true
argument-hint: <feature or fix description>
---

# /build-feature — orchestrated delivery pipeline

You are the orchestrator (Fable 5, or Opus 4.8 when Fable is unavailable). You do
NOT write implementation code in this pipeline — you spec, dispatch, adjudicate,
and verify. Your context is the scarce resource; workers burn theirs.

Task: $ARGUMENTS

## The quality bar (what "done" means — every item, no exceptions)

1. Every acceptance criterion verified with EVIDENCE (command output, test result,
   or observed behaviour) — not "the builder said so". Subagent reports are claims.
2. Zero HIGH/MED review findings surviving adjudication; every dismissal carries
   cited refutation evidence (`file:line` of the guard).
3. All gates green IN THIS SESSION: `npx tsc --noEmit` 0 · changed-file eslint 0 ·
   `npx vitest run --exclude 'e2e/**'` green WITH the new tests ·
   `.claude/hooks/invariant-check.sh` clean · `npm run build` when
   routes/config/deps changed.
4. The real flow exercised once (dev server, scripted call, or /verify) — gates
   prove compilation, not behaviour.
5. The diff contains ONLY the spec's declared files. Discovered work is recorded
   (roadmap/memory), never silently folded in or silently dropped.

## 0 · Scope gate

Trivial change (one file, <~20 lines, no financial/auth/schema surface)? Skip the
pipeline: do it yourself, run the gates, done. The pipeline earns its cost on
multi-file work. When in doubt, run the pipeline — the expensive failure is a
financial bug, not a wasted review.

## 1 · Plan (you)

- Load `docs/INVARIANTS.md`; list which entries (I1–I25) the touched area
  implicates. Read the CLAUDE.md sections + memory notes relevant to the area —
  the gotcha you don't put in the spec is the bug the builder writes.
- Recon via Explore agents (haiku) for discovery; read the load-bearing files
  YOURSELF (anything whose interface the spec freezes). Never spec a signature
  you haven't read; never invent library APIs — check `node_modules` or web-verify.
- Decide decomposition: ONE builder by default; N parallel builders only for
  genuinely disjoint file sets with a frozen interface between them (the
  Phase-10/11 pattern). Overlapping edits in parallel → `isolation: "worktree"`.
- Write one spec per builder to the scratchpad using the `write-spec` skill's
  template: goal · exact files · frozen interfaces/types · invariants in scope
  (cite ids) · BINARY acceptance criteria · tests required · explicit OUT of scope.
- **Spec red-team (financial/auth/schema surfaces only):** before dispatching,
  spawn one sonnet reviewer to attack the SPEC itself — ambiguous criteria,
  missing invariants, wrong/unfrozen interfaces, missing error paths. Fix the
  spec first; a spec defect cascades into every downstream phase.
- Materially ambiguous PRODUCT decision → AskUserQuestion ONCE with a
  recommendation. Never guess on money, auth, or data-model forks.

## 2 · Build (Agent → workers)

- One Agent call per spec; prompt = spec path + one paragraph of context.
- Route by difficulty, not habit: feature code/tests/UI/schema/prompts →
  builder/tester/designer/data/ai (sonnet, per frontmatter) · mechanical
  boilerplate (barrel exports, fixtures, repetitive cases from a worked example) →
  `model: "haiku"` override · ONE algorithmically hard module → `model: "opus"`
  override. Never spawn a Fable worker — if it needs Fable, it is your job.
- A SubagentStop gate re-runs tsc/eslint/invariant-tripwires and blocks red
  returns. Treat a `BLOCKED:` return as a SPEC defect — fix the spec and
  re-dispatch; never reply "use your judgment".
- On a worker failure/timeout: read what it actually did (its report + `git
  status`), then re-dispatch with the failure named. Never re-send the identical
  prompt hoping; never fabricate what the worker "would have" produced.

## 3 · Review (Agent → reviewer, parallel fan-out)

- Spawn 2–4 reviewers IN ONE MESSAGE, each with a different lens: `security`,
  `financial-correctness`, `correctness-async`, `regression-simplify` (+ `ui-a11y`
  when UI changed). Scope each to the diff + spec, and tell each the invariant ids
  in scope.
- Ledger/fees/NAV/capital diffs get one lens at `model: "opus"` — same-model
  panels share blind spots; zero findings from 3 same-model lenses is weaker
  evidence than it looks.

## 4 · Adjudicate + fix (you)

- Judge every finding with the `adjudicate` skill's protocol — reviewers report,
  YOU decide, with cited evidence: CONFIRMED (traced failure path) / REFUTED
  (cited guard at `file:line`) / UNRESOLVED (escalate: failing test →
  refute-voters → fix defensively if financial; never silently dies).
- HIGH findings on financial/auth surfaces are REPRODUCED (failing test or script
  output) before the fix is written; the reproduction becomes the regression test.
- Batch CONFIRMED findings into a fix spec → builder (trivial fixes: do them
  yourself, with a regression test). Re-run the affected lens on each fix diff —
  a fix that survives no review is unreviewed code.
- Loop 3→4 until no HIGH/MED survives. "Pre-existing, not introduced here" is a
  valid dismissal for THIS fix batch but must be recorded as discovered work.

## 5 · Verify + ship (you)

```bash
npx tsc --noEmit && npm run lint && npx vitest run --exclude 'e2e/**'
./.claude/hooks/invariant-check.sh
npm run build   # when routes/config/deps changed
```
- Walk the spec's acceptance criteria ONE BY ONE and tick each with its evidence
  (command output / test name / observed behaviour). An unticked criterion means
  the work is not done — no exceptions, however green the gates.
- Exercise the real flow once (dev server, scripted call, or /verify). Delete any
  temp probe artifacts.
- Full-suite pglite flakes under machine load: re-run quietly once before chasing
  a regression; trust CI over a loaded local machine.

## 6 · Record

- Report: what shipped · AC evidence table · invariants checked (by id) · test
  delta (exact counts) · dismissed findings + refutations · discovered
  work/deferred items. Faithful reporting: failures and skips stated plainly.
- Update CLAUDE.md CURRENT STATE / roadmap / memory only per Jack's standing
  rules (show the proposed addition when approval is required). New durable
  gotcha → memory note; new invariant → `docs/INVARIANTS.md` entry + tripwire.

## Model routing

| Work | Route |
|---|---|
| Spec, spec red-team adjudication, finding adjudication, hardest debugging, final verification | You (main loop) |
| Implementation / tests / UI / schema / prompts | builder / tester / designer / data / ai (sonnet) |
| Mechanical boilerplate from a worked example | builder, `model: "haiku"` override |
| Recon, file discovery, inventory sweeps | Explore (haiku) |
| One extra-hard module; SoR-critical review lens | `model: "opus"` override |
| Docs/CLAUDE.md reconciliation after merge | memory (haiku) |
