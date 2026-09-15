---
name: ship-feature
description: One full autonomous delivery cycle — pick the next roadmap item (or the given task), research + scope it, build via cheap-model workers, adversarially review, open a PR, wait for CI, auto-merge when the merge gate passes, and record everything (roadmap, CLAUDE.md, memory). The unit of work for the autonomous loop.
disable-model-invocation: true
argument-hint: [roadmap item id, feature description, or "next" (default)]
---

# /ship-feature — one autonomous delivery cycle

You are the orchestrator brain (Fable 5, or Opus 4.8 when Fable is unavailable). You
do NOT write implementation code in this pipeline — you spec, dispatch to cheaper
models, adjudicate, verify, ship, and record. Your context is the scarce resource;
workers burn theirs.

Task: $ARGUMENTS (empty or "next" ⇒ the TOPMOST unchecked non-[FOUNDER] item in
`docs/FUND-OS-ROADMAP.md`).

## Non-negotiable ground rules (apply to every phase)

- Code is ground truth over docs/memory — verify by reading before claiming.
- Never invent APIs or library signatures — check `node_modules` or web-verify.
- `docs/INVARIANTS.md` is the never-break registry — load it in §1 and cite entry
  ids (I1–I25) in every spec and adjudication. Never weaken a financial invariant:
  anti-spoof pricing ladder, paper/real segregation, SoR append-only +
  no-DEX-prices, RLS write-path matrix, redaction fail-closed, Decimal-never-float.
- Subagent reports are CLAIMS, not facts — re-verify completion yourself (gates +
  the specific acceptance criterion) before treating any substep as done. This
  applies doubly when the orchestrator is not Fable.
- **NEVER `git reset --hard`, `git checkout -- .`, `git clean`, or `git stash` —
  Jack's working tree carries deliberate uncommitted work.** Leave every file you
  didn't create or the spec didn't name exactly as you found it, and never commit
  Jack's uncommitted edits into your feature branch.
- Prod migrations, Vercel env changes, and external cron registration are
  founder-gated: prepare, list in the roadmap Blocked section, and stop.
- Never push to `main` directly. Feature branches + PRs only.
- Nothing is "done" without gates run IN THIS SESSION: `npx tsc --noEmit` 0,
  changed-file eslint 0, `npx vitest run --exclude 'e2e/**'` green WITH new tests,
  plus the real flow exercised once.
- One item at a time. Never start a second before the first is recorded.

## 0 · Preflight

```bash
git -C . fetch origin && git log --oneline -3 origin/main
git status --porcelain   # note (do not touch) Jack's pre-existing dirty files
gh auth status
```
- Record the pre-existing dirty/untracked set NOW — at ship time your commit must
  contain only files YOU created/changed for this item.
- If a `.claude/loop-stop` file exists, STOP: report and end the cycle.
- Branch from origin/main: `git checkout -b feat/<item-slug> origin/main` is WRONG
  when the tree is dirty with Jack's files — instead create the branch from the
  current HEAD (`git checkout -b feat/<item-slug>`) and rely on the ship-time
  file allowlist. If HEAD is behind origin/main, note it; prefer rebasing your
  branch onto origin/main at ship time only if it applies cleanly.

## 1 · Research + scope (brain + haiku recon)

- Re-read the item's text + acceptance criteria in `docs/FUND-OS-ROADMAP.md`, the
  relevant CLAUDE.md sections, and auto-memory notes.
- Fan out Explore agents (haiku) over the touched subsystems → verified map with
  file:line evidence. Use web research (or the `claude-api` skill for anything
  Anthropic-API-shaped) when the item touches external APIs — never guess.
- Write the SPEC to the scratchpad using the `write-spec` skill's template: goal ·
  exact files · frozen interfaces/types · invariants in scope (cite
  `docs/INVARIANTS.md` ids) · acceptance criteria (binary, testable) · tests
  required · explicit OUT-of-scope list · merge-gate class (see §6 — decide NOW
  whether this item can auto-merge or must stop at PR).
- Schema/DDL in scope ⇒ follow the `prod-migrate` skill (stage everything; the
  apply itself stays founder-gated).
- If a materially ambiguous PRODUCT decision exists and Jack is present, ask ONCE
  with a recommendation (AskUserQuestion). In an unattended loop run: take the
  documented-safest option, record the assumption in the PR body AND the roadmap
  item, and continue.

## 2 · Decompose + build (sonnet/haiku workers)

- Split the spec into substeps. ONE builder by default; parallel builders only for
  genuinely disjoint file sets with a frozen interface (worktree isolation if edits
  could overlap).
- Route by difficulty, not habit:
  | Substep | Agent / model |
  |---|---|
  | Feature code, server actions, schema/tests, UI | builder / tester / data / designer (sonnet) |
  | Mechanical/boilerplate: barrel exports, copy tables, fixtures, repetitive test cases from a worked example | builder with `model: "haiku"` override |
  | One algorithmically hard module | builder with `model: "opus"` override |
  | Recon / file discovery | Explore (haiku) |
- Prompt = spec path + one-paragraph context. The SubagentStop gate blocks red
  returns; treat a `BLOCKED:` return as a spec defect — fix the spec, re-dispatch.

## 3 · Adversarial review (fan-out, then adjudicate)

- Spawn 3–5 reviewer agents IN ONE MESSAGE, lenses: `security`,
  `financial-correctness`, `correctness-async`, `regression-simplify`, `ui-a11y`
  (when UI changed). Any SoR/fees/NAV/capital diff additionally gets one lens at
  `model: "opus"`.
- YOU adjudicate every finding using the `adjudicate` skill's protocol: read the
  code, trace the failure scenario, verdict CONFIRMED/REFUTED/UNRESOLVED with
  cited evidence. HIGH findings on financial/auth surfaces must be REPRODUCED
  before fixing; UNRESOLVED never silently dies. Batch CONFIRMED findings into a
  fix spec → builder (trivial fixes: do them yourself, with a regression test).
  Re-run the affected lens on the fix diff. Loop until no HIGH/MED survives.

## 4 · Verify

```bash
npx tsc --noEmit && npm run lint && npx vitest run --exclude 'e2e/**'
npm run build   # when routes/config/deps changed
```
- Exercise the real flow once (dev server probe, scripted call, or pglite E2E) —
  gates prove compilation, not behaviour. Delete any temp probe routes.
- Full-suite pglite flakes under machine load: re-run quietly once before chasing
  a regression.

## 5 · Ship (PR)

```bash
git add <ONLY the files you created/changed for this item>   # scripts/ needs -f
git commit -m "<type>: <item> ..."   # end body with the Claude Code co-author line
git push -u origin feat/<item-slug>
gh pr create --title "..." --body "..."   # body: scope, AC evidence, test delta,
                                          # assumptions made, out-of-scope, merge-gate class
```
- Verify the PR diff contains ZERO of Jack's pre-existing dirty files
  (`gh pr diff --name-only` vs the preflight snapshot). If any leaked in, fix the
  branch before proceeding.
- Wait for CI: `gh pr checks <n> --watch --fail-fast` (exit 0 = all green). On red:
  read the failing check log, fix via a builder, push, re-watch. Three consecutive
  red rounds ⇒ stop, leave the PR open, record the blocker.

## 6 · Merge gate — auto-merge ONLY when ALL of these hold

1. Every CI check green (tsc / eslint / vitest as separate checks).
2. `gh pr diff --name-only` touches NONE of: `supabase/migrations/**`,
   `supabase/schema.sql`, `vercel.json`, `.github/workflows/**`, `package.json`
   dependency changes (devDeps for tests are allowed only if the spec said so),
   auth/billing config, anything the roadmap marks [FOUNDER].
3. No new env vars required for the deployed code to be SAFE (graceful degradation
   proven, as in A2/A3).
4. The diff is inside the spec's declared file scope; review loop ended with zero
   surviving HIGH/MED.
5. The item is a roadmap item (or Jack-given task) — never self-invented scope.

If ALL pass: `gh pr merge <n> --squash --delete-branch`, then verify the squash
landed (`git fetch origin && git log --oneline -1 origin/main`).
If ANY fails: leave the PR open, write exactly what Jack must do in the roadmap
Blocked section, and treat the cycle as complete-at-PR.

## 7 · Record (memory + queue)

- Roadmap: flip the checkbox with `(YYYY-MM-DD, PR #N, +X tests → total)` + a dense
  evidence paragraph; add discovered work as NEW items (never silently expand the
  current one); keep Blocked current.
- CLAUDE.md: update CURRENT STATUS + the phase log for what shipped.
- Obsidian: append the session log line to `/memory/obsidian/vault/Sessions/<today>.md`
  (bugs found, gotchas, decisions).
- Auto-memory: update the project memory file for the roadmap execution log (or
  dispatch the memory agent) — what shipped, PR #, invariants, gotchas.
- Queue replenishment: if no unchecked non-[FOUNDER] items remain in the current
  phase, promote the next tranche from `VISION.md` into the roadmap as new checkbox
  items tagged `(auto-promoted from VISION.md — Jack to reprioritize)`. Never
  reorder or delete existing items.
- Commit doc/memory updates directly to main ONLY if Jack has previously authorized
  docs-only main commits this session; otherwise include them in the PR or a tiny
  docs PR.

## Failure discipline

- Genuinely blocked (missing creds, founder-gated dependency, ambiguous product
  fork with no safe default): document the blocker in the roadmap, then take the
  NEXT eligible item — do not spin.
- Never mark anything done without evidence. Never report tests you didn't run.
