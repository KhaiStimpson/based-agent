---
name: workflow-a-simple
description: Single-agent workflow for one-file edits, small questions, and low-risk changes. No spawning, no topology overhead. Escalates to Workflow B if scope is larger than expected.
---

# Workflow A — Simple Task

Use this workflow for focused, well-scoped tasks: single-file edits, targeted bug fixes, small questions, documentation updates, or configurations changes with clear validation paths. If the task expands during execution, **escalate immediately to Workflow B** — do not absorb scope silently.

**Research basis:** Principle 1 from the LIFE/SE Survey cross-paper synthesis — use the least complex workflow that can succeed. Multi-agent overhead is real: tokens, latency, coordination failures, context pollution.

---

## When to Use Workflow A

✅ Use when ALL of the following are true:
- Task touches **one file** or is a narrow targeted question
- **Risk is low** (no auth, no payments, no database migrations, no public API changes)
- Requirements are **clear and complete** — no ambiguity about expected behavior
- Validation is cheap — a single test command or syntax check is sufficient
- No prior failed attempts on this task

❌ Escalate to Workflow B when ANY of the following are true:
- Task touches **2 or more files**
- You discover unknown code architecture during the task
- Risk escalates (e.g., you find the function is called by auth middleware)
- Tests fail before your changes (broken environment)
- Requirements require interpretation
- Spawn score `sspawn ≥ 0.7` (compute via `compute_spawn_score` tool)

---

## Scope Validation (Before Starting)

Before writing a single line of code, answer these questions:

```
1. How many files will be touched?
   → More than 1: escalate to Workflow B

2. What is the difficulty score?
   difficulty = (affected_files > 5 ? 2 : 0)
              + (unknown_codebase ? 2 : 0)
              + (requirement_ambiguity ? 1 : 0)
              + (no_test_suite ? 1 : 0)
              + (security_risk ? 2 : 0)
              + (cross_module_deps > 3 ? 1 : 0)
              + (prior_failures > 1 ? 1 : 0)
              + (context_pressure ? 1 : 0)
   → Score ≥ 3: escalate to Workflow B

3. Is validation unambiguous?
   → No clear test/check available: escalate to Workflow B

4. Is the task scope stable?
   → Requirements vague or likely to expand: escalate to Workflow B
```

If all four answers are clear and safe: proceed with Workflow A.

---

## Step 1 — Read Before Edit

**Read every file you will touch before making any change.**

```bash
# Orient yourself: check AGENTS.md for project conventions
cat AGENTS.md | head -100

# Read the target file fully
read <target_file>

# Find the specific function/class/section you'll edit
grep -n "<symbol_name>" <target_file>

# Follow imports one hop: read files that the target imports
grep -n "^import\|^from\|^require" <target_file>

# Find callers of the function you're modifying
grep -rn "<function_name>" . --include="*.py" --include="*.ts" --include="*.js"
```

**Rule:** if you discover that a "one-file" change requires touching a caller or dependency, stop. Escalate to Workflow B.

**Validation pre-flight (required):**
```bash
# Run the narrowest available test before making any changes
# This confirms the environment is not already broken
<project_test_command_for_affected_module>
# If this fails before your changes: STOP. Report environment failure.
```

---

## Step 2 — Implement the Change

Apply the minimal targeted change that satisfies the requirement:

1. **Match the surrounding code style** — indentation, naming conventions, import ordering from `AGENTS.md`.
2. **Make the smallest change possible** — no refactoring "while you're in there."
3. **Check `AGENTS.md` for forbidden patterns** — safety boundaries, protected paths, code conventions.
4. **Add no new dependencies** without flagging it.
5. **Delete no existing tests** under any circumstances.

If you find yourself writing more than ~50 lines for a "simple" task, stop and verify scope.

---

## Step 3 — Run Validation

Run the full validation ladder in order. Record every command and exit code.

```bash
# Step 3a: Syntax check
# TypeScript:
npx tsc --noEmit
# Python:
python -m py_compile <changed_file>
# JavaScript:
node --check <changed_file>
# Rust:
cargo check

# Step 3b: Lint
npx eslint <changed_file>  # JS/TS
ruff check <changed_file>  # Python

# Step 3c: Targeted tests (narrowest coverage of changed code)
<targeted_test_command>

# Step 3d: Broader regression (if available and fast)
<project_test_command>
```

**Zero-tolerance rule from AGENTS.md:** a task is NOT done unless all available validation commands exit 0.

If any validation fails:
- Read the error output fully before attempting a fix.
- Apply the fix, then re-run from Step 3a.
- If the same test fails twice, escalate to Workflow B (may need deeper context).

---

## Step 4 — Save Rollout Summary

After the change is validated, save a structured attempt summary. Use `save_attempt_summary` or write to `.pi/runs/<run-id>/attempt-summary.json`.

**Minimum required fields for a simple task:**

```json
{
  "attempt_id": "<date>-<task_slug>-1",
  "task_ref": "<one sentence description of the task>",
  "hypothesis": "<what you changed and why>",
  "files_inspected": ["<path> — <what you found>"],
  "files_changed": ["<path> — <what changed>"],
  "commands_run": [
    "<command> — <exit_code> — <result_summary>"
  ],
  "tests_passed": ["<test name or suite>"],
  "tests_failed": [],
  "failure_modes": [],
  "reusable_insights": ["<codebase fact useful for future runs>"],
  "diff_ref": ".pi/runs/<id>/changes.patch",
  "cost": { "tokens_used": 0, "wall_seconds": 0, "agent_spawns": 0 },
  "verdict": "candidate"
}
```

**Verdict must be `candidate` only if:**
- At least one validation command exited 0
- No P2P regressions
- `diff_ref` points to a real file or commit

**Never emit `candidate` without running validation.**

---

## Step 5 — Run-End Checklist

Before declaring the task done, answer:

- [ ] Did I read every file I touched before editing it?
- [ ] Did I run the validation ladder and record exit codes?
- [ ] Did I check AGENTS.md for relevant rules?
- [ ] Are all changed files within the original scope?
- [ ] Did the pre-flight test pass before my changes?
- [ ] Is the attempt summary saved to `.pi/runs/`?
- [ ] Are there any follow-up obligations I need to record as prospective reminders?

If any box is unchecked, complete it before reporting success.

---

## Escalation Protocol

If at any point the task grows beyond Workflow A scope:

1. **Stop immediately.** Do not continue accumulating changes on a scope you've already exceeded.
2. Save any work done so far as a partial attempt summary with `verdict: "needs_refinement"`.
3. Report to the supervisor: "Task scope expanded. Reason: [specific observation]. Recommending Workflow B."
4. Attach the partial attempt summary and list open questions.

**Do not silently absorb scope.** The most expensive failures come from simple tasks that secretly became complex ones.

---

## Artifacts Produced

| Artifact | Path | Required |
|---|---|---|
| Attempt summary | `.pi/runs/<id>/attempt-summary.json` | ✅ |
| Patch file | `.pi/runs/<id>/changes.patch` | ✅ if files changed |
| Escalation report | `.pi/runs/<id>/escalation.md` | ✅ if escalating |
