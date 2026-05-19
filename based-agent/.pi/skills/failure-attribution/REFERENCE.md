# Failure Attribution Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Failure Attribution

Structured root-cause analysis prevents the same failure from recurring. Self-evolution depends on attribution: traces → attribution → proposal → gate → promotion. Without attribution, fixes are guesses.

**Source:** LIFE framework (2605.14892v1) — Lay foundations, Integrate, Find faults, Evolve.

---

## Failure Taxonomy (12 Categories)

| # | Category | Description | Signal |
|---|---|---|---|
| 1 | **Spec** | Ambiguous requirements, missing interfaces, unstated constraints | Task completed differently than user expected |
| 2 | **Context** | Missed files, wrong API version, stale docs, unread dependencies | NameError, AttributeError, wrong module path |
| 3 | **Planning** | Bad decomposition, missing validation step, wrong topology | Correct parts, wrong order; missing edge cases |
| 4 | **Tool** | Wrong command, bad arguments, env not set up, schema mismatch | Non-zero exit codes on setup; tool call rejected |
| 5 | **Implementation** | Syntax error, logic bug, cross-file dependency, semantic gap | Tests fail with specific assertion or exception |
| 6 | **Verification** | Tests not run, wrong tests used, flaky test masked failure | "Passed" but checks were not actually executed |
| 7 | **Review** | False positive blocked good code; false negative missed real bug | Reviewer finding contradicted by test evidence |
| 8 | **Communication** | Bad handoff, lost assumption, misunderstood contract | Child agent produced correct output for wrong task |
| 9 | **Memory** | Stale/wrong memory retrieved, relevant fact not stored | Repeated same mistake; ignored documented pattern |
| 10 | **Merge/Coherence** | Conflicting edits, partial patch applied, worktree conflict | Some tests pass, others fail in unexpected ways |
| 11 | **Budget** | Too many tokens/time/agents; forced truncation or timeout | Incomplete output; context window exceeded |
| 12 | **Safety** | Destructive command, sensitive file touched, permission denied | Unexpected deletions; auth/permission errors |

---

## Postmortem Questions

Answer in order — each question builds on the previous:

### 1. What failed?
```
Symptom: <observable failure — test name, error message, user report>
Category: <1-12 from taxonomy above>
Confidence: high | medium | low
```

### 2. Where did it fail?
```
Location: agent=<name> | step=<n> | tool=<name> | topology_edge=<from→to> | memory_item=<id> | config_line=<file:line>
File: <path>
Line: <number if applicable>
```

### 3. How did it propagate?
```
Trigger: <root event>
  → intermediate_effect_1
  → intermediate_effect_2
  → observable_failure
```

### 4. What evidence proves the diagnosis?
```
evidence:
  - type: test_output | command_output | file_inspection | memory_record
    ref: <file path or command>
    content: "<exact relevant excerpt>"
    supports: <which diagnosis it confirms>
```

### 5. What repair was applied?
```
repair:
  - action: <what was done>
    files_changed: []
    commands_run: []
    outcome: fixed | partial | failed
```

### 6. Did the repair validate?
```
validation:
  - command: <exact command>
    exit_code: <0|non-zero>
    result: <pass/fail/flaky>
  verdict: confirmed_fixed | unconfirmed | reopened
```

### 7. Should anything change (beyond this fix)?
```
systemic_changes:
  - artifact: prompt | skill | topology | memory | extension | validation_gate | routing_rule
    description: <what should change>
    urgency: high | medium | low
    evidence: <same evidence as above>
```

---

## Postmortem Artifact Template

```json
{
  "postmortem_id": "<date>-<task_hash>-pm",
  "task_ref": "<task description>",
  "attempt_ids": ["<linked attempt summaries>"],
  "failure": {
    "symptom": "<observable failure>",
    "category": "<1 of 12 categories>",
    "confidence": "high|medium|low"
  },
  "location": {
    "agent": "<agent name or null>",
    "step": "<step number or description>",
    "file": "<path or null>",
    "line": "<number or null>",
    "tool": "<tool name or null>"
  },
  "propagation": [
    "trigger: <root cause>",
    "→ <intermediate>",
    "→ <observable failure>"
  ],
  "evidence": [
    {
      "type": "test_output|command_output|file_inspection|memory_record",
      "ref": "<file or command>",
      "content": "<relevant excerpt ≤ 100 chars>",
      "supports": "<diagnosis>"
    }
  ],
  "repair": {
    "action": "<description>",
    "files_changed": [],
    "commands_run": [],
    "outcome": "fixed|partial|failed"
  },
  "validation": {
    "commands": [],
    "verdict": "confirmed_fixed|unconfirmed|reopened"
  },
  "systemic_changes": [
    {
      "artifact": "prompt|skill|topology|memory|extension|gate|routing",
      "description": "<change needed>",
      "urgency": "high|medium|low"
    }
  ],
  "curriculum_candidate": true,
  "curriculum_oracle": "<how to verify correct behavior deterministically>"
}
```

---

## Distinguishing Symptom from Trigger

**Symptom:** what you observe (test fails, wrong output, error message)
**Trigger:** the earliest decision that made the symptom inevitable

| Symptom | Common trigger (check these first) |
|---|---|
| `NameError: name 'X' not defined` | Context failure — file with X was not read |
| `AttributeError: 'Y' has no attribute 'Z'` | Context failure — guessed interface instead of reading |
| `AssertionError` in test | Implementation failure — logic bug OR spec failure — test was wrong |
| `ModuleNotFoundError` | Tool/environment failure — missing dependency |
| Task "done" but user unhappy | Spec failure — requirement was ambiguous |
| Test passes locally, fails in CI | Tool failure — environment difference |
| Reviewer and tester contradict each other | Communication or merge failure |
| Same bug recurs across runs | Memory failure — negative lesson not stored |

---

## Escalation: Recurring Failure → Curriculum Case

If the same failure category appears in **3 or more** postmortems:

1. Create a curriculum case via `generate_curriculum_case` tool
2. The case must have a deterministic oracle
3. Add to `.pi/curricula/` as a regression test
4. Propose a systemic fix via `evolution-proposal` skill

**Trigger threshold:** 3+ occurrences of same category within 30 days OR 2+ occurrences of same specific mechanism (e.g., "always misses X import pattern").

---

## Using the Failure-Attributor Agent

When running as a standalone attribution step:

```
Spawn: failure-attributor agent
Role: postmortem analyst
Input: attempt summaries (last 1-3 failed attempts), relevant files, test output
Tools: read (no write)
Output: postmortem artifact JSON
Constraints:
  - Must cite specific file/line/command evidence for each claim
  - Must distinguish symptom from trigger
  - Must classify into one of 12 categories
  - Must propose at least one systemic change if category 1/2/3/9 (systemic categories)
Budget: 8000 tokens max
```

---

## Quick Reference: Repair Paths by Category

| Category | First repair action |
|---|---|
| Spec | Re-read request; invoke `feature-spec` skill; clarify with user |
| Context | Run scout again; grep for actual interfaces; verify all imports |
| Planning | Revise decomposition; add missing validation step to plan |
| Tool | Check exact command syntax; verify env setup; read tool docs |
| Implementation | Run targeted test; read the failing assertion; fix logic |
| Verification | Run validation commands explicitly; record exit codes |
| Review | Re-run reviewer independently; check against test evidence |
| Communication | Inspect handoff artifact; verify contract was complete |
| Memory | Deprecate stale memory; store corrected fact with provenance |
| Merge | Check git diff; identify conflicting edits; re-apply cleanly |
| Budget | Reduce topology; compress context; use `context-pruning` skill |
| Safety | Review safety gate; check what command was blocked and why |

