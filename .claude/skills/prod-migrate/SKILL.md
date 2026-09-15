---
name: prod-migrate
description: Founder-gated playbook for designing, staging, and applying a Supabase schema migration to the Nyx-Fund prod DB — file conventions, apply path, verification, and the accumulated gotchas. Use whenever a task requires DDL, RLS changes, new tables/columns, or touching supabase/schema.sql, and when Jack authorizes a prod apply.
---

# /prod-migrate — schema migration playbook

Prod project: `pyrgcbbrahyrqbckjzex` (Nyx-Fund). The prod DB is the reality;
`supabase/schema.sql` (~2,000+ lines) is the canonical cumulative mirror;
`supabase/migrations/` holds only the newest files. Applying to prod is
FOUNDER-GATED — prepare everything, then STOP and ask Jack unless he has
authorized the apply this session.

## Stage (no authorization needed)

1. Read the CURRENT schema state first — `schema.sql` for the mirror,
   `mcp__claude_ai_Supabase__list_tables` / `execute_sql` (read-only) for reality.
   Never design from memory; the two have drifted before.
2. Write `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` — idempotent where
   possible (`IF NOT EXISTS`, guarded `DO` blocks).
3. Mirror the change into `supabase/schema.sql` — same DDL, placed in the correct
   section. **Placement rule: new SoR/ops blocks go BEFORE the OPS-AUTOPILOT
   marker** (proven ordering bug otherwise).
4. Every new table gets: RLS ENABLED (never FORCE) + the correct policy shape from
   the write-path matrix (I8) + a pglite test proving the policy (`test/rls/`
   pattern). Append-only tables get immutability + no-truncate triggers
   (`lot_disposal` is the DDL template).
5. Decide and stage the BACKFILL: **every seed-fn redefinition migration MUST ship
   a funds backfill** (the 4200 migration is the template) — the Phase-11 seed-fn
   update without one left 5 funds missing account 1150.
6. Code that reads the new tables ships with `ready:false` graceful degradation so
   the PR can merge BEFORE the migration applies (A3 precedent) — unless the diff
   touches live paths unconditionally, in which case the apply must happen FIRST
   (B2 share-classes precedent; state which ordering applies in the PR body).

## Apply (founder-authorized only)

1. Re-verify the LIVE state immediately before applying — especially any CHECK
   constraint you are widening (`audit_event` types): another merged PR may have
   widened it since your branch (proven second-writer incident).
2. Apply via `mcp__claude_ai_Supabase__apply_migration` (snake_case name).
3. Verify, in order:
   - DDL landed: `list_tables` / targeted `execute_sql` (RLS on, policies present,
     triggers present, CHECKs correct).
   - Backfill counts: every existing fund got the new rows/columns.
   - `get_advisors` — ZERO new security errors (new SECURITY-DEFINER WARNs may be
     intentional; say so explicitly if so).
4. Record: CLAUDE.md "SUPABASE SCHEMA — PENDING APPLIES" list + the phase log
   (✅ APPLIED date + migration name + verification evidence).

## Gotchas (all real incidents)

- MCP `apply_migration` records a version; the `supabase` CLI history can drift —
  after direct-pg applies, repair the CLI history or `db push --db-url` breaks.
- A bare `REVOKE UPDATE (cols)` is a NO-OP while a table-wide UPDATE grant stands —
  effective privilege is the UNION of table + column grants; downgrade the table
  grant to a column allowlist instead (A5b).
- Raw-psql-created tables miss Supabase's auto-GRANTs — local `supabase start`
  stacks need explicit GRANTs to service_role/authenticated/anon.
- Immutability triggers fire for EVERY role: never FK `user_id` on an append-only
  table with `ON DELETE SET NULL`/`CASCADE` — it bricks user deletion (B7).
- RLS is ENABLE-only. FORCE would block the owner-pool SoR engine (I8).
- `rls_enabled_no_policy` INFO advisors on deny-all tables are INTENTIONAL.
- One `db push --db-url` applies ALL pending migration files — check what else is
  pending before running it.
