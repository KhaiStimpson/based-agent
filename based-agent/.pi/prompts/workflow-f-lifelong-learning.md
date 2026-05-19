---
name: workflow-f-lifelong-learning
description: Lifelong learning and curriculum improvement workflow. Converts run traces into typed memories, skill proposals, and frontier curriculum cases. Sequences run trace → episode summary → typed memory/skill proposal → curriculum case generation → holdout evaluation → promotion gate. Implements the ELL framework's cognitive continuity substrate.
---

# Workflow F — Lifelong Learning and Curriculum

Use this workflow after any run that produces reusable knowledge, surfaces a skill gap, or exposes a validation weakness. Lifelong learning is what separates a system that gets better over time from one that re-learns the same lessons on every run.

**Research basis:** ELL/StuLife (GPT-5 scores 17.9/100 without structured memory; naive RAG below no-memory baseline), SEMA (typed stores beat raw retrieval), Agent0 (curriculum frontier uncertainty ≈ 0.5), LIFE framework (attribution before evolution).

**Key empirical finding:** GPT-5 — the strongest model evaluated in StuLife — scores only **17.9/100** on lifelong learning benchmarks without structured memory management. Vanilla RAG over raw trajectories actively harms performance (StuGPA: 10.98), falling **below the no-memory baseline**. Structured memory management (MemGPT-style typed stores) achieved the highest StuGPA at 19.99. This workflow implements the structured substrate that makes the difference.

---

## When to Use Workflow F

✅ Use after any run where:
- A **new codebase fact** was discovered (interface definition, module structure, API constraint)
- A **failure produced a lesson** that should prevent the same failure category next time
- An agent **repeatedly re-learned** the same information that was discoverable from prior runs
- A **prospective obligation** was created (schema migration, follow-up test, deferred cleanup)
- A **skill gap** was identified (an agent needed a structured workflow it didn't have)
- A **curriculum case** candidate was found (task near the 0.5 solve-rate frontier)
- The run succeeded but the path was unnecessarily expensive (efficiency lesson)

✅ Use periodically (weekly or after 10+ runs) for:
- Memory staleness audit
- Skill promotion review
- Curriculum case deduplication and difficulty re-evaluation

---

## Memory Type Selection Guide

Before proposing memory additions, identify the correct type for each piece of knowledge:

| Memory type | When to use | Examples |
|---|---|---|
| `fact` | Specific, verifiable statement about this repo/API/env | `"get_session() returns Optional[Session] — verified line 42 of auth.py"` |
| `decision` | User or planner choice that should persist | `"REST chosen over GraphQL for /api/v2 — user decision 2026-05-19"` |
| `heuristic` | Rule-of-thumb that improves outcomes | `"Always read Optional return types before attribute access"` |
| `skill` | Reusable multi-step workflow or playbook | `"How to run targeted auth module tests without full suite"` |
| `episode` | Compressed run summary with outcome | `"Run #42: fixed Optional guard in session middleware — 3 attempts, context failure"` |
| `reminder` | Future obligation with trigger condition | `"Update auth migration when users schema changes — trigger: schema file edit"` |
| `negative_lesson` | Failed approach that should not be retried | `"Tried patching session middleware directly — caused circular import, do not repeat"` |

**Rule:** if you are unsure whether something should be stored, default to `provisional` status and let the memory-curator review. Do not store unverified claims as `validated`.

**Anti-pattern:** do not store the same thing twice under different types. A negative lesson about a failed approach AND a heuristic about the right approach can coexist, but should be explicitly linked.

---

## Step 1 — Run Trace Review

The summarizer agent reviews the completed run trace and extracts learning candidates.

```
Spawn summarizer agent:
  Task: "Extract learning artifacts from run <run-id>"
  Inputs:
    - .pi/runs/<run-id>/attempt-summary.json (or all attempt summaries)
    - .pi/runs/<run-id>/failure-attribution.json (if exists)
    - .pi/runs/<run-id>/review-findings.json (if exists)
    - .pi/runs/<run-id>/validation.md (if exists)
  Output: .pi/runs/<run-id>/learning-candidates.json
  Skill: rollout-summary (for summary schema)
  Constraints: read-only; no source file writes
  Budget: 12,000 tokens max
```

**Summarizer extracts:**
1. **Reusable insights** from `attempt-summary.json[].reusable_insights`
2. **Failure modes** from `attempt-summary.json[].failure_modes` → negative lessons
3. **New codebase facts** (interfaces, imports, commands discovered during the run)
4. **Prospective obligations** (any "TODO later" items, follow-up tests, cleanup tasks)
5. **Skill gaps** (recurring sub-steps the agent struggled with that a skill could encapsulate)
6. **Curriculum candidates** (failure patterns near the 0.5 solve-rate band)

**Run-end reflection questions (summarizer must answer):**
```
1. What is the most important thing this run proved or disproved?
2. What would the next similar run do differently?
3. What facts about the codebase are now certain? (→ declarative memory)
4. What failed that could become a curriculum case? (→ curriculum)
5. What recurring pattern, if codified as a skill, would save future agents work?
6. What obligation from this run remains incomplete? (→ prospective reminder)
```

---

## Step 2 — Episode Summary

Create a compressed episode summary for the episodic memory store.

```json
{
  "id": "ep-<timestamp>-<task-slug>",
  "type": "episode",
  "scope": "repo",
  "status": "validated",
  "source": "episode",
  "salience": "failure-linked | validation-linked",
  "task_ref": "<task in one sentence>",
  "outcome": "success | partial | failure",
  "attempts": 2,
  "primary_failure_category": "context | implementation | null",
  "resolution": "<one sentence: what ultimately worked>",
  "key_facts_discovered": ["<specific codebase facts>"],
  "key_lessons": ["<transferable lessons>"],
  "cost": { "tokens_used": 0, "wall_seconds": 0 },
  "linked_attempt_ids": ["<attempt IDs>"],
  "provenance": {
    "artifact_ref": ".pi/runs/<id>/attempt-summary.json",
    "confirmed_at": "2026-05-19"
  },
  "confidence": "high",
  "created_at": "2026-05-19"
}
```

---

## Step 3 — Typed Memory Proposals

Launch the **memory-curator agent** to review and promote learning candidates.

```
Spawn memory-curator agent:
  Task: "Review learning candidates and propose typed memory additions"
  Inputs: .pi/runs/<run-id>/learning-candidates.json + .pi/memory/ (current store)
  Output: memory_add / memory_update / memory_deprecate operations
  Skill: lifelong-memory
  Constraints: write to .pi/memory/ only; no source file writes
  Budget: 15,000 tokens max
```

**Memory-curator rules:**
1. Never store unverified claims as `validated` — start with `provisional`
2. Check for contradictions with existing `validated` entries before adding
3. Combine repeated heuristics into skills when 3+ occurrences appear
4. Deprecate stale entries when source files have changed
5. Prospective reminders must include: trigger condition, required files/commands, success criteria
6. Negative lessons are first-class entries — document what failed and why

**Skill promotion ladder:**
```
raw trace insight
  → reusable_insight field in attempt summary      [automatic capture]
  → provisional heuristic in .pi/memory/           [memory-curator adds]
  → 3+ occurrences with consistent findings?
      → provisional skill in .pi/memory/            [memory-curator promotes]
  → validated skill used successfully in 2+ runs?
      → validated skill in .pi/memory/              [memory-curator validates]
  → mature skill used in 5+ runs with no failures?
      → consider promoting to .pi/skills/ as SKILL.md [requires Workflow E approval]
```

**Skill lifecycle states:**
```
provisional  → under consideration, not yet used in production
validated    → confirmed useful on 2+ distinct tasks
deprecated   → superseded by better skill or no longer applicable
contradicted → conflicting evidence found; needs manual review
```

---

## Step 4 — Skill Proposal (If Gap Identified)

If the summarizer identified a skill gap (a recurring sub-workflow the system lacks), propose a new skill.

```
Invoke skill: skill-lifecycle
Task: "Draft new skill for identified gap: <skill name>"

Required for any new skill proposal:
  - name: <snake_case_name>
  - description: <when to invoke, what it does>
  - trigger_conditions: <when this skill should be invoked>
  - contraindications: <when NOT to use this skill>
  - steps: <the procedure>
  - preconditions: <what must be true before using>
  - success_criteria: <how to know the skill worked>
  - example: <a concrete example from the run that motivated it>
  - validation_evidence: <run IDs where this approach worked>
  - status: provisional
```

**New skills start as `provisional`.** They must be validated on 2+ distinct tasks before being used reliably. Do not write new SKILL.md files directly to `.pi/skills/` without Workflow E approval — create them as proposals in `.pi/memory/` first.

---

## Step 5 — Curriculum Case Generation

From the identified failure patterns, generate **frontier curriculum cases** via the curriculum-generator agent.

```
Spawn curriculum-generator agent:
  Task: "Generate curriculum cases from run <run-id> failures"
  Inputs:
    - .pi/runs/<run-id>/failure-attribution.json
    - .pi/runs/<run-id>/attempt-summary.json
    - .pi/curricula/ (existing cases — for deduplication)
  Output: .pi/curricula/<case-id>.json (for each accepted case)
  Skill: curriculum-generation
  Constraints: write to .pi/curricula/ only; deterministic oracle required
  Budget: 15,000 tokens max
```

**Curriculum governance score for prioritization:**
```
governance_score =
  + validation_gain          # estimated improvement if system solves this reliably
  + frontier_uncertainty     # reward tasks near p̂ ≈ 0.5 (neither trivial nor impossible)
  + useful_tool_use          # does solving require meaningful tool calls?
  + novelty                  # not a near-duplicate of existing .pi/curricula/ cases
  - repetition               # penalize near-duplicates
  - cost_penalty             # high-budget tasks score lower
  - safety_risk              # cases involving safety-gate tests score lower
  - ambiguity_penalty        # unclear oracles or task descriptions score lower
```

**Frontier filter (required):**
```
p̂ (estimated solve rate) thresholds:
  > 0.85: too easy — system already handles this reliably. Skip.
  0.4–0.85: frontier — include. These are most informative.
  0.15–0.4: hard frontier — include as aspirational (status: aspirational)
  < 0.15: too hard — remove or break into sub-cases first.

Note: Agent0 research targets p̂ ≈ 0.5. In this system, the same filtering
principle applies to config/prompt evaluation and skill promotion decisions.
Model weight training (RL/GRPO) is NOT applicable here.
```

**Oracle requirement:** every curriculum case must have a deterministic or near-deterministic oracle:
- `command` — a shell command that exits 0 on success
- `test-pass` — a specific test that must pass
- `file-content` — a specific pattern that must appear in a file
- `structural` — a verifiable structural property of the output

"A human should judge if it looks right" is NOT an oracle.

---

## Step 6 — Holdout Evaluation

Before promoting new memory entries, skills, or curriculum cases, run holdout evaluation.

```
For memory/skill promotion:
  Select 2-3 tasks from .pi/curricula/ that are related to the proposed memory entry
  Run the current system on those tasks WITHOUT the new memory entry
  Record outcomes as baseline
  Run again WITH the new memory entry injected into context
  Compare: does the new entry improve success rate on these cases?

For curriculum cases:
  Run the current system on the new case 3 times
  Record solve rate
  If solve rate is outside 0.15–0.85 band: filter or modify
  If oracle is ambiguous: clarify before activating
```

**Using judge agent for holdout evaluation:**
```
Spawn judge agent:
  Task: "Compare outcomes on task <X>: with vs. without memory entry <Y>"
  Model: MUST be different family from the main generator
  Protocol: plan→execute→verdict + position-swap
  Output: verdict with rationale
```

---

## Step 7 — Promotion Gate

**Memory promotion criteria:**
- [ ] Source evidence is verifiable (command output, file read, explicit user statement)
- [ ] No contradiction with existing validated entries
- [ ] Holdout evaluation shows neutral or positive effect
- [ ] Status upgrade: `provisional` → `validated`

**Skill promotion criteria:**
- [ ] Provisional skill worked on 2+ distinct tasks (with artifact evidence)
- [ ] No contraindications triggered incorrectly
- [ ] Steps are specific and reproducible
- [ ] Status upgrade: `provisional` → `validated`

**Curriculum case activation criteria:**
- [ ] Deterministic oracle defined
- [ ] Novelty hash is unique in `.pi/curricula/`
- [ ] p̂ estimate is in 0.15–0.85 range
- [ ] Trace basis documented (real failure, not invented)
- [ ] Status set to `active`

**Low-risk promotions** (individual fact, heuristic, episode) can be approved by memory-curator agent with logged provenance.

**High-risk promotions** (new skill with instructions that change agent behavior) require:
- Memory-curator recommendation
- Summarizer validation evidence
- Curriculum-generator confirmation of improvement on related cases
- Owner review (or Workflow E approval if scope is broad)

---

## Step 8 — Prospective Agenda Update

Check and update the prospective agenda for any obligations from this run.

```
Use: prospective-agenda extension

For each obligation identified:
  agenda_add({
    id: "pa-<timestamp>-<slug>",
    obligation: "<specific thing that must be done>",
    trigger: "<condition that makes this obligation active>",
    context: {
      required_files: ["<paths needed to complete this>"],
      required_commands: ["<commands to run>"],
      success_criteria: "<how to know it's done>"
    },
    priority: "high | medium | low",
    due_by: "<date or event>",
    related_run: "<run-id>"
  })
```

**A prospective reminder without full execution context is not useful.** Reminders must include: trigger, required files, required commands, and success criteria. A vague "follow up on X" creates orphaned obligations that are never completed.

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| `learning-candidates.json` | summarizer | `.pi/runs/<id>/` |
| Episode entries | memory-curator | `.pi/memory/` |
| Fact / heuristic / skill entries | memory-curator | `.pi/memory/` |
| Negative lesson entries | memory-curator | `.pi/memory/` |
| Curriculum case JSON files | curriculum-generator | `.pi/curricula/` |
| Prospective agenda entries | supervisor | via prospective-agenda extension |
| Memory curation report | memory-curator | `.pi/runs/<id>/memory-curation-report.md` |
