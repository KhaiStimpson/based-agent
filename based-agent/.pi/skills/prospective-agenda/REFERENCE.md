# Prospective Agenda Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Prospective Agenda

Prospective memory — tracking future obligations — is one of the weakest areas for AI agents. ELL/StuLife research introduces the Proactive Initiative Score (PIS) to measure whether agents act on pending obligations without being reminded. Agents that score well on PIS store obligations with full context, not vague notes.

**Source:** ELL/StuLife (2508.19005v6) — Proactive Initiative Score (PIS)

---

## Why Prospective Memory Matters

**The problem:** agents complete a session, deferring work with a vague mental note ("add rate-limit tests later"). The next session has no context: which tests? For which endpoint? With which mock? What does success look like? The obligation is lost.

**The solution:** every deferred obligation must be stored with enough context to act on it cold, in a future session, without any other memory of the current conversation.

**PIS measures:** whether the agent spontaneously checks and acts on pending obligations at the right time, without being prompted.

---

## Required Fields for Each Obligation

```yaml
obligation_id: "oblig-<date>-<hash>"
description: "<what must be done — specific, ≤ 80 chars>"
trigger_condition: "<when this should be acted on — specific event or time>"
priority: critical | high | medium | low
status: pending | in_progress | completed | cancelled | blocked

required_files:
  - "<exact file path that must be read or modified>"
  - "<reason this file is needed>"

required_commands:
  - command: "<exact command to run>"
    purpose: "<what this command verifies or does>"

success_criteria:
  - "<deterministic check: how will we know this is done?>"
  - "<test name or command that must pass>"

context:
  why_deferred: "<reason this was not done now>"
  blockers: "<what was blocking at time of deferral>"
  related_task: "<task ref or run_id this came from>"
  related_files_changed: ["<files already changed that this follows up on>"]

created_at: "YYYY-MM-DD"
due_by: "YYYY-MM-DD | null"
created_in_run: "<run_id>"
```

---

## Anti-Vague-Reminder Rule

The following are **not** adequate prospective memories:

```
❌ "TODO: add tests for auth"
❌ "Remember to check rate limiting"  
❌ "Follow up on the cache issue"
❌ "Clean up temp files eventually"
```

These provide no execution context. A future session cannot act on them without re-discovering all the context that's already known now.

**Adequate prospective memory:**
```yaml
description: "Add rate-limit tests for POST /api/auth/token"
trigger_condition: "Before marking auth feature complete OR when mock rate-limiter is available"
required_files:
  - "tests/test_auth.py — add new test class here"
  - "api/auth.py — rate_limit_middleware at line 83"
required_commands:
  - command: "pytest tests/test_auth.py::TestRateLimit -v"
    purpose: "Verify rate-limit tests pass"
success_criteria:
  - "pytest tests/test_auth.py::TestRateLimit exits with code 0"
  - "At least 3 test cases: under limit, at limit, over limit"
context:
  why_deferred: "Mock rate-limiter not available in current env"
  blockers: "Waiting for test-rate-limiter fixture from teammate"
  related_task: "Add OAuth2 auth to REST API"
```

---

## When to Check the Agenda

Check the prospective agenda at these trigger points:

| Trigger | Action |
|---|---|
| **Session start** | Load all `pending` and `in_progress` obligations; check trigger conditions |
| **Before marking work complete** | Check for any obligations related to the current task |
| **After failure attribution** | Check if failure reveals an unmet obligation |
| **After a dependency is resolved** | Re-check obligations with matching `blockers` |
| **Time-based trigger** | Any obligation with `due_by` ≤ today |

---

## Using the Agenda Tools

```
# Add a new obligation
agenda_add({
  description: "<obligation ≤ 80 chars>",
  trigger_condition: "<when to act>",
  priority: "high",
  required_files: ["<path>"],
  required_commands: [{ command: "<cmd>", purpose: "<purpose>" }],
  success_criteria: ["<check>"],
  context: {
    why_deferred: "<reason>",
    blockers: "<blockers>",
    related_task: "<task ref>"
  },
  due_by: "2026-06-01"   // or null
})

# Check pending obligations (call at session start)
agenda_check({
  status: ["pending", "in_progress"],
  priority: ["critical", "high"],
  triggered_by: ["session_start", "task_completion"],
  related_files: ["<files touched in this session>"]  // surfaces related obligations
})

# Mark obligation complete
agenda_complete({
  obligation_id: "oblig-20260519-abc",
  completion_evidence: {
    commands_run: ["pytest tests/test_auth.py::TestRateLimit -v — exit 0"],
    tests_passed: ["test_under_limit", "test_at_limit", "test_over_limit"]
  }
})

# Update blocked obligation
agenda_update({
  obligation_id: "oblig-20260519-abc",
  status: "blocked",
  blockers: "<updated blocker description>",
  due_by: "2026-06-15"  // extend if needed
})
```

---

## Integration with Lifelong Memory

Prospective obligations are stored as `prospective` type memory items:

```yaml
# The obligation is stored in the memory system with type: prospective
# This enables the slice_memory tool to surface it at appropriate times

memory_add({
  type: "prospective",
  scope: "repo",
  salience: "future-critical",
  content: "<description + trigger>",
  source: "episode",
  source_ref: "<run_id>",
  confidence: "high"
})
```

Prospective memory is retrieved in the `context-pruning` skill at session start and before task completion checks.

---

## Priority Guidelines

| Priority | Meaning | Example |
|---|---|---|
| `critical` | Blocking — must resolve before the next user interaction | "Fix broken import that prevents all tests from running" |
| `high` | Important — resolve in current or next session | "Add missing validation for new API endpoint" |
| `medium` | Should do — resolve within a few sessions | "Refactor duplicated error handling into utility" |
| `low` | Nice to have — resolve when convenient | "Add docstrings to new module" |

---

## Example: Complete Prospective Obligation

**Context:** During an OAuth2 implementation session, the builder notices that the token refresh flow needs an integration test, but the test database mock isn't available yet.

```yaml
obligation_id: "oblig-20260519-refresh-test"
description: "Add integration test for OAuth2 token refresh flow"
trigger_condition: "When test_db_mock fixture is available (check tests/conftest.py)"
priority: high
status: pending

required_files:
  - "tests/test_auth.py — add TestTokenRefresh class after line 147"
  - "tests/conftest.py — check for test_db_mock fixture availability"
  - "api/auth.py — refresh_token() at line 112"
  - "api/models.py — RefreshToken schema at line 67"

required_commands:
  - command: "pytest tests/test_auth.py::TestTokenRefresh -v"
    purpose: "Verify all refresh flow scenarios pass"
  - command: "grep 'test_db_mock' tests/conftest.py"
    purpose: "Check if blocking fixture is now available"

success_criteria:
  - "pytest tests/test_auth.py::TestTokenRefresh exits with code 0"
  - "Tests cover: valid refresh, expired refresh, invalid token, revoked token"
  - "No new regressions in pytest tests/test_auth.py"

context:
  why_deferred: "test_db_mock fixture not yet implemented in conftest.py"
  blockers: "Missing test_db_mock in tests/conftest.py"
  related_task: "Add OAuth2 auth to REST API"
  related_files_changed: ["api/auth.py", "api/models.py"]

created_at: "2026-05-19"
due_by: "2026-05-26"
created_in_run: "2026-05-19-oauth2-001"
```

