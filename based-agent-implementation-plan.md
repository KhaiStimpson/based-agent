# Implementation Plan

## Goal
Implement the approved based-agent phases: project docs/scripts/health commands, `/ba` command hub, automatic minimal attempt evidence, proposal-only evolution scanning, and approve/reject/promote/rollback lifecycle controls.

## Tasks
1. **Create root README for based-agent users**: Add a concise package entry point.
   - File: `based-agent/README.md`
   - Changes: Document what based-agent is, safety model, installation/use as a pi package, available npm scripts, command hub entries, protected paths, and validation ladder.
   - Acceptance: `based-agent/README.md` exists and references only based-agent paths, not sibling projects.

2. **Add npm scripts for doctor, structure validation, and status**: Wire root package commands.
   - File: `based-agent/package.json`
   - Changes: Add scripts: `doctor`, `validate:structure`, `status`, and `check:scripts` using Node `.mjs` files. Keep existing package metadata intact.
   - Acceptance: `cd based-agent && npm run status`, `npm run validate:structure`, and `npm run doctor` execute without missing-script errors.

3. **Implement structure validator CLI**: Verify required package directories/files and JSON parseability.
   - File: `based-agent/scripts/validate-structure.mjs`
   - Changes: New dependency-free Node script that checks required files: `AGENTS.md`, `package.json`, `.pi/settings.json`, `.pi/extensions/*.ts`, `.pi/agents/*.md`, `.pi/prompts/workflow-*.md`, `.pi/skills/*/SKILL.md`, `.pi/skills/*/REFERENCE.md`; validates JSON files; reports errors/warnings and exits nonzero on errors.
   - Acceptance: `cd based-agent && node --check scripts/validate-structure.mjs && npm run validate:structure` passes or reports concrete missing artifacts.

4. **Implement doctor CLI**: Add operational health checks.
   - File: `based-agent/scripts/doctor.mjs`
   - Changes: New dependency-free Node script that calls/reuses structure checks, verifies configured extension/skill/prompt directories from `.pi/settings.json`, checks extension command names for duplicates, warns if protected-path directories are missing, and prints actionable remediation.
   - Acceptance: `cd based-agent && node --check scripts/doctor.mjs && npm run doctor` runs and exits 0 only when health checks pass.

5. **Implement status CLI**: Summarize package state and recent artifacts.
   - File: `based-agent/scripts/status.mjs`
   - Changes: New dependency-free Node script that prints counts for extensions, agents, prompts, skills, memory items, judge corpus entries, runs, traces, and evolution proposals; supports `--json` for machine-readable output.
   - Acceptance: `cd based-agent && node --check scripts/status.mjs && npm run status && node scripts/status.mjs --json` work.

6. **Optionally share script helpers without dependencies**: Avoid duplicate filesystem logic.
   - File: `based-agent/scripts/lib/structure.mjs`
   - Changes: New helper module for required-path lists, JSON parsing, recursive file discovery, and count helpers used by the three scripts.
   - Acceptance: All scripts import it with relative ESM paths and `node --check` succeeds.

7. **Add `/ba` command hub extension**: Provide discoverable command routing.
   - File: `based-agent/.pi/extensions/ba-command-hub.ts`
   - Changes: Register command `ba` with subcommands/help text for `help`, `status`, `doctor`, `validate-structure`, `attempts`, `evolution`, `evolution-scan`, `safety`, `memory`, `judge`, `topology`, `traces`; implement read-only status/doctor/validate summaries in-extension rather than shelling out; point users to existing commands like `/attempt-history`, `/evolution-pending`, `/safety-rules`.
   - Acceptance: `/ba` and `/ba help` show the hub; `/ba status`, `/ba doctor`, and `/ba validate-structure` display useful results without modifying files.

8. **Keep command hub loaded by package config**: Ensure extension discovery includes the new hub.
   - File: `based-agent/.pi/settings.json`
   - Changes: No change if `.pi/extensions` auto-loads all extensions; otherwise add explicit command hub path according to pi package conventions found in the existing settings format.
   - Acceptance: The hub extension is discoverable in a pi session alongside existing commands.

9. **Enhance trace events for evidence capture**: Persist enough data to auto-summarize attempts safely.
   - File: `based-agent/.pi/extensions/trace-ledger.ts`
   - Changes: Track session-level arrays for commands run, write/edit/create paths, tool errors, validation tool calls, and output summaries; expose only truncated, non-secret-safe summaries; keep JSONL append behavior non-fatal.
   - Acceptance: Running a session with tool calls writes trace JSONL containing command/file/evidence references without storing full raw transcripts.

10. **Automatically save minimal attempt summaries after writes**: Replace UI-only reminder with conservative artifact creation.
   - File: `based-agent/.pi/extensions/attempt-summarizer.ts`
   - Changes: On `agent_end`, if write tools were seen and no manual summary was saved, write an `auto-<timestamp>-summary.json` under `.pi/runs/<date>/` with `auto_generated: true`, changed files, commands seen, validations seen, risks, and `verdict: "needs_refinement"` unless validation evidence proves success. Never mark auto summaries as final/candidate without passing validation records.
   - Acceptance: A coding attempt that uses write/edit/create creates a minimal summary artifact even in non-interactive mode.

11. **Add separate evidence artifact capture**: Preserve compact reproducible evidence beside summaries.
   - File: `based-agent/.pi/extensions/attempt-summarizer.ts`
   - Changes: Write `<attempt-id>-evidence.json` containing trace ref, files changed, commands with exit codes when available, validation records, and safety warnings. Redact obvious secrets by key-pattern before writing.
   - Acceptance: Each auto summary references an evidence JSON file that exists and validates with `JSON.parse`.

12. **Add proposal-only evolution scanner extension**: Detect improvement opportunities without changing governed artifacts.
   - File: `based-agent/.pi/extensions/evolution-scanner.ts`
   - Changes: New extension that scans recent `.pi/runs/`, `.pi/mas-traces/`, validations, and attempt summaries for repeated failure categories, missing validation, safety warnings, recurring manual reminders, and low-confidence auto summaries. It may only write proposal records under `.pi/evolution-proposals/` with `status: "proposed"`; it must not edit prompts, skills, agents, settings, or extension behavior.
   - Acceptance: `/evolution-scan` and `/ba evolution-scan` produce a report and, with an explicit flag/subcommand if needed, create proposal JSON files only.

13. **Make scanner conservative and deduplicated**: Prevent proposal spam.
   - File: `based-agent/.pi/extensions/evolution-scanner.ts`
   - Changes: Add deterministic proposal fingerprinting from `artifact_class + target_file + trigger + evidence_refs`; skip open duplicates; cap proposals per scan; require at least two independent evidence refs unless severity is safety-related.
   - Acceptance: Running the scanner twice does not create duplicate open proposals.

14. **Extend evolution proposal schema for lifecycle operations**: Add explicit proposal metadata needed for promotion and rollback.
   - File: `based-agent/.pi/extensions/evolution-governor.ts`
   - Changes: Add fields such as `proposed_patch` or `proposed_content_ref`, `approval_required`, `approved_by`, `rejected_reason`, `promoted_snapshot_ref`, `rollback_snapshot_ref`, `validation_commands`, and `lifecycle_events`; keep backward compatibility when reading old proposal JSON.
   - Acceptance: Existing proposal files still load; new proposals include lifecycle metadata.

15. **Implement approve/reject lifecycle controls**: Allow human-visible decisions without applying changes.
   - File: `based-agent/.pi/extensions/evolution-governor.ts`
   - Changes: Register tools and commands for `approve_evolution`/`/evolution-approve <id>` and `reject_evolution`/`/evolution-reject <id> <reason>`; require approval notes for protected broad-scope artifacts; write an immutable lifecycle event to the proposal.
   - Acceptance: Approving moves `proposed -> approved`; rejecting moves `proposed|approved -> rejected`; invalid transitions are blocked.

16. **Implement guarded promote lifecycle control**: Apply approved proposals only through gates.
   - File: `based-agent/.pi/extensions/evolution-governor.ts`
   - Changes: Register `promote_evolution` and `/evolution-promote <id>`; require `status: approved`, passed safety gate, regression/holdout evidence for prompts/skills/agents/topology/routing, target path allowlist, rollback snapshot creation before write, and explicit proposed patch/content. Block direct promotion for new extensions/permissions unless human approval metadata is present.
   - Acceptance: Promotion creates a snapshot, applies only the proposal target, updates status to `promoted`, and refuses unsafe or under-evidenced proposals.

17. **Implement rollback lifecycle control**: Restore promoted artifact from snapshot.
   - File: `based-agent/.pi/extensions/evolution-governor.ts`
   - Changes: Register `rollback_evolution` and `/evolution-rollback <id> <reason>`; allow only `promoted -> rolled_back`; restore from snapshot; append lifecycle event and reason; never delete proposal history.
   - Acceptance: A promoted proposal can be rolled back reproducibly, and proposal status/history records the rollback.

18. **Update evolution listing commands**: Surface lifecycle state clearly.
   - File: `based-agent/.pi/extensions/evolution-governor.ts`
   - Changes: Update `/evolution-log` and `/evolution-pending` to show approval requirement, gate state, evidence refs, validation commands, and next valid actions.
   - Acceptance: Operators can tell whether to approve, reject, promote, or rollback from command output.

19. **Connect `/ba` hub to new lifecycle commands**: Keep user-facing command map current.
   - File: `based-agent/.pi/extensions/ba-command-hub.ts`
   - Changes: Add help entries for `/evolution-approve`, `/evolution-reject`, `/evolution-promote`, `/evolution-rollback`, `/evolution-scan`, and status aliases.
   - Acceptance: `/ba evolution` lists the complete proposal lifecycle.

20. **Document new operational flow**: Keep docs aligned with implementation.
   - File: `based-agent/README.md`
   - Changes: Add examples for `npm run doctor`, `npm run validate:structure`, `npm run status`, `/ba status`, auto summaries/evidence, scanner proposal-only behavior, and approve/promote/rollback flow.
   - Acceptance: README examples match actual script and command names.

21. **Run validation ladder after implementation**: Verify scripts, JSON, and TypeScript syntax as far as the local environment allows.
   - File: repository commands only
   - Changes: Run validation commands listed below and record any unavailable command with rationale in the attempt summary.
   - Acceptance: All available commands pass before handoff.

## Files to Modify
- `based-agent/package.json` - add npm scripts for doctor, structure validation, status, and script syntax checks.
- `based-agent/.pi/settings.json` - only if explicit extension registration is required for new extensions.
- `based-agent/.pi/extensions/trace-ledger.ts` - collect compact evidence metadata for auto summaries.
- `based-agent/.pi/extensions/attempt-summarizer.ts` - auto-write minimal summaries and evidence artifacts after write attempts.
- `based-agent/.pi/extensions/evolution-governor.ts` - add lifecycle schema, approve/reject/promote/rollback tools and commands, gated promotion, rollback snapshots, and improved listings.

## New Files
- `based-agent/README.md` - user entry point and operational documentation.
- `based-agent/scripts/lib/structure.mjs` - shared dependency-free script helper module.
- `based-agent/scripts/validate-structure.mjs` - structure and JSON validator CLI.
- `based-agent/scripts/doctor.mjs` - health check CLI.
- `based-agent/scripts/status.mjs` - package status CLI with `--json`.
- `based-agent/.pi/extensions/ba-command-hub.ts` - `/ba` command hub.
- `based-agent/.pi/extensions/evolution-scanner.ts` - autonomous proposal-only evolution scanner.

## Dependencies
- Tasks 2-6 depend on agreeing to dependency-free Node scripts; avoid adding runtime dependencies unless absolutely necessary.
- Task 7 depends on the structure/status logic from Tasks 3-5 conceptually, but the extension should not shell out to scripts.
- Tasks 9-11 depend on the existing trace and attempt summarizer extension APIs.
- Tasks 12-13 depend on summary/evidence artifacts from Tasks 9-11 for best signal, but can also scan existing artifacts.
- Tasks 14-18 must be completed before Task 19 documentation/help entries are finalized.
- Task 21 depends on all implementation tasks.

## Risks
- Pi extension API types are imported from `@earendil-works/pi-coding-agent` and may not be installed in this repo; TypeScript validation may require the pi runtime environment. If unavailable, validate with `node --check` for scripts and document TS type-check unavailability.
- Promotion logic is high risk because it writes governed prompt/skill/agent files. It must require approved proposals, snapshots, allowlisted targets, validation evidence, and rollback metadata.
- The scanner must remain proposal-only. It must never apply diffs, modify protected artifacts, expand permissions, or silently change routing/prompt behavior.
- Auto-generated summaries may be incomplete. Mark them `auto_generated: true` and conservative (`needs_refinement`) unless explicit validation proves success.
- Evidence capture must avoid raw transcript storage and redact obvious secrets; only compact command/file/validation summaries should be persisted.
- Duplicate command names may collide with existing extensions; doctor and command hub should detect/report duplicates.
- Existing proposal JSON files may lack new schema fields; read paths must migrate defaults in memory rather than fail.
- Protected paths from `AGENTS.md` remain governed: `.pi/evals/judge-corpus/`, `.pi/memory/`, `.pi/skills/`, and `AGENTS.md` require their existing approval/schema constraints.

## Validation Commands
```bash
cd based-agent
node --check scripts/lib/structure.mjs
node --check scripts/validate-structure.mjs
node --check scripts/doctor.mjs
node --check scripts/status.mjs
npm run validate:structure
npm run doctor
npm run status
node scripts/status.mjs --json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('.pi/settings.json','utf8'))"
# If dependencies/runtime are available:
npx tsc --noEmit
```
