---
name: when-to-add-ruflo
description: '# When & How to Add Ruflo (Phase 4+)'
metadata:
  user-invocable: true
  disable-model-invocation: true
---

# When & How to Add Ruflo (Phase 4+)

## Don't add Ruflo until Phase 3 is complete.

Here's the honest reason: Ruflo is an orchestration layer that
coordinates multiple Claude Code instances running in parallel.
It's genuinely powerful — but it adds complexity that will slow
you down before you have a stable codebase. Build first. Orchestrate later.

---

## What Ruflo Actually Does

Ruflo (formerly claude-flow) is an orchestration framework that:
- Spawns multiple Claude Code "agent" instances simultaneously
- Gives them shared memory so they don't duplicate work
- Coordinates them via a hierarchical queen/worker structure
- Tracks tasks, stores embeddings, manages consensus between agents

**The key thing to understand:**
Ruflo does NOT write code. Claude Code writes code. Ruflo just
coordinates which Claude Code instances are working on what.
For a solo developer working sequentially, this adds overhead
without meaningful benefit.

**When it DOES make sense:**
- You have 3+ features that can be built truly in parallel
- You want one agent building the frontend while another
  writes tests for a different completed module
- You're in Phase 4-5 and want to dramatically speed up delivery

---

## How to Add Ruflo (When Ready)

### Install
```bash
# In your nyx-fund project root
npm install -g claude-flow
# or
npx ruflo@latest init --wizard
```

### Init in your project
```bash
npx claude-flow@alpha init --force
```

This creates a `.claude-flow/` folder with:
- SQLite database for persistent agent memory
- Configuration for swarm topology
- Hooks that integrate with your existing CLAUDE.md

### Your first Ruflo command (Phase 4 example)
```bash
# Orchestrate Phase 4 AI layer build with parallel agents
claude-flow orchestrate \
  "Build the LP report generator and portfolio chat simultaneously" \
  --agents 4 \
  --topology hierarchical \
  --parallel
```

### How it works with your agent system
Your existing `.claude/agents/*.md` files don't conflict with Ruflo.
Ruflo adds a coordination layer ON TOP of them. Think of it as:

```
Ruflo orchestrator
    ├── Claude Code instance 1 → reads builder.md → builds LP report UI
    ├── Claude Code instance 2 → reads ai.md → builds Claude API integration
    ├── Claude Code instance 3 → reads tester.md → writes tests for Phase 3
    └── Claude Code instance 4 → reads reviewer.md → reviews completed code
```

All four run simultaneously. Ruflo tracks state. You review outputs.

### Cost warning
Running 4 parallel Claude Sonnet agents on a complex task costs
roughly $8-24 per orchestration run. Budget accordingly.
For Phase 1-3, sequential agent use costs <$1 per session.

---

## Ruflo Commands You'll Actually Use

```bash
# See what's running
claude-flow hive status

# Simple parallel task (2-3 agents, quick tasks)
claude-flow hive init --topology mesh --agents 3

# Complex parallel task (4-8 agents, major features)
claude-flow orchestrate "task description" --agents 6 --topology hierarchical --parallel

# Monitor live
claude-flow hive monitor --live

# Check memory (what agents know about the project)
claude-flow memory list --namespace project

# Performance report
claude-flow performance report --format summary
```

---

## The Right Time to Add Ruflo: Phase 4 Trigger

Add Ruflo when you find yourself saying:
> "I need to build the LP report generator AND the portfolio chat
> AND the risk alert system AND their tests — and it's going to
> take me 2 weeks doing it sequentially."

That's when parallel agent orchestration pays for itself.
Until then, your CLAUDE.md architect system is faster, cheaper,
and easier to debug.
