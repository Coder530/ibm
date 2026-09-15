# Command: /session-start

## Purpose
Run this at the START of every Claude Code session.
Copy-paste this EXACTLY as your first message.

---

## YOUR DAILY SESSION OPENER (copy this verbatim)

```
Read CLAUDE.md fully. You are my architect for NYX Suite.

Tell me:
1. What phase am I in?
2. What % complete is this phase?
3. What was the last completed task?
4. What is the single next task I should do right now?
5. Any blockers or risks I should know about?

Then wait for my go-ahead before starting anything.
```

---

## AFTER EACH TASK (copy and fill in)

```
Task complete: [describe what you just built in 1-2 sentences]

Update CLAUDE.md:
- Mark [task] as complete
- Update progress %
- Set "Last completed task" to what I just did

What is the next task?
```

---

## WHEN SWITCHING AGENTS (copy and fill in)

```
Switch to [agent name] agent.
Read .claude/agents/[agent].md fully.
Context: [what you need from this agent]
Task: [specific request]
```

---

## WHEN HITTING A BUG (copy and fill in)

```
Bug encountered. Do not rewrite everything.

Error: [paste exact error]
File: [which file]
What I was doing: [context]

Diagnose step by step. What's the most likely cause?
What's the minimal fix?
```

---

## WHEN ENDING A SESSION (copy this verbatim)

```
Session ending. 

Memory agent: log this session.
Completed: [list what you built]
Blockers: [any blockers hit]
Decisions: [any decisions made]
Next session start: [what to do first next time]

Update CLAUDE.md current status section.
```

---

## WEEKLY REVIEW (every Sunday)

```
Memory agent: weekly review.

Summarise:
1. What was built this week (by phase task)
2. What decisions were made
3. Customer/user feedback received
4. Current blockers
5. What needs to happen next week to stay on track

Am I on pace for the 90-day plan?
```
