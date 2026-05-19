# Skill Lifecycle Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Skill Lifecycle

Skills are reusable procedural memories that encode recurring workflows. The ELL/StuLife research establishes that skills must go through a promotion ladder — raw traces → validated skills — and that internalization into deterministic mechanisms is preferred over additional prompts.

**Source:** ELL/StuLife (2508.19005v6); Configuring Agentic AI Coding Tools (2602.14690v4)

---

## Promotion Ladder

Each stage requires explicit promotion criteria before advancing:

```
Stage 0: Raw Trace
  → (distill episode summary)
Stage 1: Episode Summary
  → (extract reusable pattern + validate it worked)
Stage 2: Lesson (episodic memory item)
  → (pattern works on ≥2 tasks, write down procedure)
Stage 3: Provisional Skill
  → (works on 3+ different tasks, clear triggers and contraindications)
Stage 4: Validated Skill
  → (stable, measured success rate ≥ 70% on applicable tasks)
Stage 5: Project Policy / Tool / Test / Hook
  → (critical enough to enforce deterministically — add a gate, test, or hook)
Stage 6 (optional): Fine-Tuning / Eval Data
  → (skill is stable and generalizable enough to train on)
```

**Internalization Principle:** if agents repeatedly forget a rule even with the skill in context, the skill should become a gate, test, or hook — not a longer prompt. Prompts are weak enforcement. Deterministic mechanisms are strong.

---

## Skill States

| State | Meaning | Criteria |
|---|---|---|
| `provisional` | Newly created, not yet validated across multiple tasks | Created from ≤2 task instances |
| `validated` | Confirmed useful across ≥3 different task types | Success rate ≥70%; clear triggers documented |
| `deprecated` | No longer applicable or superseded | Superseded, harmful, or stale (see deprecation conditions) |

---

## SKILL.md File Format

Every skill must be a `SKILL.md` file at `.pi/skills/<name>/SKILL.md`:

```markdown
---
name: <skill-name>
description: <1-2 sentences: what it does AND when to invoke it — this is what the agent reads to decide relevance>
status: provisional | validated | deprecated
version: 1
created_at: YYYY-MM-DD
promoted_at: YYYY-MM-DD (or null)
success_rate: 0.0-1.0 (or null if not yet measured)
applicable_tasks: ["<task type 1>", "<task type 2>"]
contraindications: ["<when NOT to use this skill>"]
---

# Skill Name

[Full instructions, templates, schemas, examples]
```

---

## Promotion Criteria

### Provisional → Validated

All three must be true:
1. Skill has been applied to **3 or more distinct task types** (not 3 runs of the same task)
2. Success rate on applicable tasks is ≥70% (measured, not estimated)
3. Triggers are clearly defined (agent can decide from description alone)
4. Contraindications are explicitly documented
5. At least one concrete example is included

Record promotion evidence:
```yaml
promotion_evidence:
  task_instances:
    - task: "Add cache to WeatherClient"
      run_id: "2026-05-10-abc"
      outcome: success
    - task: "Add cache to UserSessionStore"
      run_id: "2026-05-14-def"
      outcome: success
    - task: "Add cache to API rate limiter"
      run_id: "2026-05-18-ghi"
      outcome: success
  success_rate: 1.0
  promoted_by: "memory-curator"
  promoted_at: "2026-05-19"
```

### Validated → Project Policy / Tool / Test

Escalate to deterministic enforcement when:
- Validated skill is violated in ≥2 runs despite being in context
- The violation causes test failures or security issues
- The rule is simple and binary (either done or not)

Examples of deterministic mechanisms:
```
Skill: "always run mypy before committing"
  → Becomes: pre-commit hook that runs mypy
  → Or: validation-gate extension that blocks completion without mypy output

Skill: "never use os.system() for subprocesses"
  → Becomes: lint rule (bandit or custom flake8 plugin)
  → Or: safety-gate extension that blocks commands matching the pattern
```

---

## Validation Test Format

For each validated skill, store a validation test:

```yaml
skill_validation_test:
  skill_name: "<skill-name>"
  test_cases:
    - task: "<example task that should trigger this skill>"
      should_invoke: true
      expected_behavior: "<what the agent should do>"
      oracle: "<deterministic check: command, file, or assertion>"
    - task: "<example task that should NOT trigger this skill>"
      should_invoke: false
      reason: "<why this is a contraindication>"
```

Run validation tests periodically or when the skill is modified:
```
skill_validate({
  skill_name: "<name>",
  run_test_cases: true,
  update_success_rate: true
})
```

---

## Deprecation Conditions

Deprecate (do not delete) a skill when any of these are true:

| Condition | Action |
|---|---|
| **Superseded** | A newer, better skill covers the same use case | Mark deprecated, link to replacement |
| **Harmful** | Skill causes failures in ≥2 recent runs | Mark deprecated immediately; create negative lesson |
| **Stale** | Skill's procedure is outdated (API changed, tool removed) | Mark deprecated; update or create replacement |
| **Redundant** | Skill content now enforced by a deterministic gate | Mark deprecated; note that gate replaces it |
| **Ambiguous triggers** | Agents invoke it incorrectly more often than correctly | Mark deprecated; rewrite as two clearer skills |

```
skill_deprecate({
  skill_name: "<name>",
  reason: "superseded|harmful|stale|redundant|ambiguous",
  deprecated_by: "<new skill name or null>",
  evidence: "<run IDs or explanation>"
})
```

---

## Using Skill Registry Tools

```
# Register a new skill (creates provisional entry)
skill_register({
  name: "<skill-name>",
  description: "<description>",
  applicable_tasks: ["<task types>"],
  contraindications: ["<when not to use>"],
  file_path: ".pi/skills/<name>/SKILL.md"
})

# Promote a skill
skill_promote({
  name: "<skill-name>",
  from_status: "provisional",
  to_status: "validated",
  evidence: { task_instances: [...], success_rate: 0.85 }
})

# Deprecate a skill
skill_deprecate({
  name: "<skill-name>",
  reason: "<deprecation reason>",
  deprecated_by: "<replacement or null>"
})

# Query skills applicable to a task
skill_query({
  task_description: "<current task>",
  status: ["validated"],        // default: include validated + provisional
  limit: 5
})
```

---

## Skill Creation Checklist

Before creating a new skill, verify:

- [ ] This pattern has appeared in ≥2 distinct tasks
- [ ] It's not already covered by an existing skill (run `skill_query`)
- [ ] The description tells the agent WHEN to invoke it (not just what it does)
- [ ] The SKILL.md is ≤400 lines and self-contained
- [ ] At least one concrete example is included
- [ ] Contraindications are listed
- [ ] The skill does not contain machine-generated filler — every line must be useful

---

## Anti-Patterns to Avoid

```
❌ Creating a skill for a one-time task (minimum: 2 task instances)
❌ Vague description: "Use this skill for coding tasks"
   ✅ Specific: "Use when adding a cache layer — provides LRU wrapper pattern"
❌ Skill that duplicates AGENTS.md content without adding value
❌ Skill longer than 400 lines — split into two skills
❌ Skill with no example — examples are required for validated skills
❌ Keeping deprecated skills active — they pollute retrieval results
❌ Promoting based on a single successful run
```

---

## Example: Skill Creation from Episode

**Episode:** "On 3 separate tasks, adding a cache layer to a service always required the same LRU wrapper pattern."

**Create provisional skill:**
```
skill_register({
  name: "cache-layer-pattern",
  description: "Apply LRU cache wrapper to an existing service method. Use when a method is called repeatedly with the same arguments and results don't change within a TTL window.",
  applicable_tasks: ["adding cache", "performance optimization", "reducing API calls"],
  contraindications: ["mutation-heavy methods", "methods with side effects", "real-time data requirements"]
})
```

**After 3 validated task instances → promote to validated:**
```
skill_promote({
  name: "cache-layer-pattern",
  from_status: "provisional",
  to_status: "validated",
  evidence: { task_instances: 3, success_rate: 1.0, promoted_at: "2026-05-19" }
})
```

