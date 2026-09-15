---
name: write-spec
description: Template + checklist for writing a builder spec before dispatching implementation work. Use in /build-feature §1 and /ship-feature §1, or whenever handing multi-file work to a builder agent. The spec is the contract the builder is held to and the reviewer reviews against — spec quality is the single highest-leverage orchestrator output.
---

# /write-spec — builder spec contract

A spec is a sprint contract: "done" is negotiated BEFORE code is written, as binary
checkable criteria. A builder given a vague spec produces plausible code that fails
review; a builder given this template produces code the review loop can actually
grade. Write the spec to the scratchpad; the dispatch prompt is the spec path plus
one paragraph of context.

## Before writing: recon discipline

- Fan out Explore agents (haiku) for file discovery; read the load-bearing files
  YOURSELF (the ones whose interfaces the spec freezes). Never spec a function
  signature you haven't read.
- Load `docs/INVARIANTS.md` and list which entries the touched area implicates.
- Check memory + CLAUDE.md phase sections for prior gotchas in this area — the
  gotcha you don't put in the spec is the bug the builder writes.
- Never invent API/library signatures — check `node_modules` or web-verify
  (`claude-api` skill for anything Anthropic-shaped).

## The template (every section mandatory; write "none" rather than omit)

```markdown
# SPEC: <one-line goal>

## Context (1 paragraph)
Why this exists, what phase/roadmap item it serves.

## Files
- CREATE: <path> — <what it is>
- EDIT: <path> — <which part, what changes>
(Exhaustive. The builder may touch NOTHING else. Test files included.)

## Frozen interfaces
Exact signatures/types the builder must implement or must not change.
(For parallel builders this section is the contract BETWEEN them — freeze it fully.)

## Invariants in scope
- I<n> <name>: <one line on how this work could violate it and must not>
(Cite docs/INVARIANTS.md ids. Empty only for pure-UI/copy work.)

## Acceptance criteria (binary — each one checkable by command or assertion)
- [ ] <criterion — testable, no "should work well">
...

## Tests required
- <test file>: <what each proves> (min: happy path + one error case per new
  public function; financial math additionally: zero/negative/dust/bounds + one
  adversarial input)

## Out of scope (explicit)
- <things the builder will be tempted to do and must not>

## Merge-gate class
auto-merge eligible / stops-at-PR (founder-gated surface) — decided NOW, not at ship.
```

## Decomposition rules

- ONE builder by default. N parallel builders ONLY for genuinely disjoint file sets
  with the frozen-interface section fully specified (Phase-10/11 pattern);
  overlapping edits ⇒ `isolation: "worktree"`.
- Right altitude: specify WHAT and the constraints, not line-by-line HOW — an
  over-specified spec cascades your mistakes into the builder; an under-specified
  one delegates architecture to a model that must not do architecture.
- Route by difficulty: mechanical/boilerplate substeps → builder with
  `model: "haiku"`; one algorithmically hard module → `model: "opus"`; default
  sonnet.

## Gotchas

- A `BLOCKED:` return from a builder is a SPEC DEFECT — fix the spec and
  re-dispatch; never tell the builder "use your judgment".
- If the spec can't state a binary acceptance criterion for some behaviour, you
  don't understand the behaviour yet — do more recon, don't dispatch hope.
- The out-of-scope section is load-bearing: builders over-deliver into adjacent
  code, and every unrequested change is unreviewed risk (Jack's rule: no
  unsolicited refactors).
- State in the spec which RLS write path applies (owner-RLS / service-role /
  owner DATABASE_URL) — builders default to the wrong client otherwise (I8).
