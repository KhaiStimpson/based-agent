---
name: workflow-b-standard
description: Standard multi-agent workflow for moderate features and bug fixes in unfamiliar code. Sequences scout → planner → builder → independent reviewer + tester → adjudicated fixes. Includes spawn score check and anti-bystander enforcement.
---

# Workflow B — Standard Implementation

Use this workflow for moderate coding tasks: feature additions, bug fixes, refactors, and API changes where the codebase is partially or fully unfamiliar. The workflow ensures you understand the code before building, validate independently after building, and aggregate findings without bystander bias.

**Research basis:** AgentSpawn (dynamic spawning), FeatureBench (scout before build), Bystander Effect (independent review cap), LIFE framework (attribution before fixing), AgentConductor (topology as data).

---

## When to Use Workflow B

✅ Use when:
- Task touches **2–5 files** or the affected module is unfamiliar
- Tests are available and regression risk is real
- Difficulty score **3–5**
- No prior failed attempts (first pass)
- Requirements are clear but architecture needs scouting

❌ Escalate to Workflow C when:
- Task touches **6+ files** or requires external domain research
- Difficulty score **≥ 6**
- External API integration, major architectural change, or security-critical path

❌ Escalate to Workflow D when:
- This is the **second or later** attempt and previous attempts failed

---

## Spawn Score Pre-Check

Before launching the full topology, compute the spawn score to verify Workflow B is appropriate:

```
Use: compute_spawn_score tool

Inputs:
  If (file interdependency, 0–1):  <affected files / 10, capped at 1>
  Cc (cyclomatic complexity, 0–1): <max complexity of modified functions / 20>
  Fc (test failure cascade, 0–1):  <failing tests count / total tests, capped at 1>
  Oc (context saturation, 0–1):   <current context window use fraction>
  Uc (agent uncertainty, 0–1):    <0.3 for known codebase, 0.6 for unfamiliar>

Decision:
  sspawn < 0.5:  Single agent (consider Workflow A)
  sspawn 0.5–0.7: Workflow B (standard topology)
  sspawn ≥ 0.7:  Escalate to Workflow C with specialist agents
```

Policy limits: max spawn depth 3, max concurrent agents 4. Never spawn for social proof.

---

## Topology

```yaml
version: 1
workflow: B-standard
budget:
  max_nodes: 4
  max_parallel: 2
  max_rounds: 1
  max_wall_minutes: 30
layers:
  - id: context
    agents:
      - id: scout
        role: scout
        output: context.md
        write: false
  - id: plan
    agents:
      - id: planner
        role: planner
        inputs: [scout]
        output: plan.md
        write: false
  - id: build
    agents:
      - id: builder
        role: builder
        inputs: [planner, scout]
        write: true        # ONLY writer in this topology
  - id: review
    parallel: true
    independent: true      # CRITICAL: no cross-visibility during first pass
    agents:
      - id: reviewer
        role: reviewer
        inputs: [builder]
        write: false
      - id: tester
        role: tester
        inputs: [builder]
        write: false
```

**Validator rules:** acyclic graph, single writer, review agents are independent, final validation phase required.

---

## Step 1 — Scout Phase

Launch the **scout agent** with the task description. The scout produces `context.md`.

```
Spawn scout agent:
  Task: "<restate the requirement in one sentence>"
  Output: .pi/runs/<run-id>/context.md
  Constraints: read-only, no writes, no assumptions
  Budget: 15,000 tokens max
```

**Scout must produce:**
- Affected files table with change risk ratings
- Public interfaces of all touched modules (verified by reading, not guessing)
- Build/test/lint commands (exact commands, verbatim)
- Blast-radius flags (files imported by 5+ modules)
- Validation gap flag if no tests exist
- Open questions / ambiguities

**Blocker:** if scout reports unresolvable ambiguity, stop. Ask the user before proceeding.

**Anti-pattern:** do not skip the scout to save time. The NameError/TypeError/AttributeError failures documented in FeatureBench research come directly from guessing interfaces instead of reading them.

---

## Step 2 — Plan Phase

Launch the **planner agent** with `context.md` as primary input.

```
Spawn planner agent:
  Inputs: context.md, task description, AGENTS.md
  Output: .pi/runs/<run-id>/plan.md
  Constraints: no writes to source files
  Budget: 12,000 tokens max
```

**Plan must include:**
- Step-by-step implementation instructions with file/line references
- Acceptance criteria (explicit "done means all checks pass")
- F2P test plan (fail-to-pass: what tests must pass after implementation)
- P2P test plan (pass-to-pass: what tests must not break)
- Affected files table from scout, updated with plan changes
- Risk assessment: what could go wrong and mitigation
- Validation ladder: exact commands to run in order
- Blockers/open questions: if any, stop before build

**Invoke `feature-spec` skill** for any task involving:
- New functions or interfaces
- Changes to existing public APIs
- External data structures or third-party library usage
- Any "done means tests pass" requirement

```
Use skill: feature-spec
Input: task description + scout's interface findings
Output: precise interface definition + F2P/P2P test templates
```

**Blocker check:** if the plan has unresolved blockers, pause here. Do not proceed to build with a plan that acknowledges unknowns.

---

## Step 3 — Build Phase

Launch the **builder agent** (the sole writer).

```
Spawn builder agent:
  Inputs: plan.md, context.md, AGENTS.md
  Output: changed files + .pi/runs/<run-id>/attempt-summary.json
  Permissions: read+write to source files only
  Budget: 30,000 tokens max
```

**Builder rules (from AGENTS.md):**
1. Read every file listed in the plan before touching any of them
2. Run pre-flight test: `<narrowest test command>` must exit 0 before changes
3. If pre-flight fails before changes: stop and report environment failure
4. Implement incrementally — validate after each logical unit
5. Run full validation ladder after completion
6. Produce attempt summary regardless of outcome

**Scope boundary:** builder must not:
- Change architecture not mentioned in the plan
- Add dependencies not in the plan without flagging
- Delete tests
- Write to files outside the plan's "Affected Files" table

If builder encounters scope ambiguity during implementation: stop, flag it in attempt summary, return to supervisor.

---

## Step 4 — Independent Review Phase (Anti-Bystander Protocol)

Launch **reviewer** and **tester** in **separate, isolated sessions**. They must not see each other's output during their first pass.

```
Spawn reviewer agent (Session A):
  Input: plan.md, changed files, test results from builder
  Output: .pi/runs/<run-id>/review-findings.json
  Constraints: read-only; no peer review output visible
  Instructions: "Independently inspect the code and tests. Derive findings
    only from repository evidence and command output. Do not assume another
    agent checked anything."
  Budget: 12,000 tokens max

Spawn tester agent (Session B):
  Input: plan.md, changed files, validation commands
  Output: .pi/runs/<run-id>/validation.md
  Constraints: read-only; may run tests (no source file writes)
  Instructions: "Run the validation ladder from plan.md. Record every command
    exit code. Your job is to find failures, not confirm success."
  Budget: 12,000 tokens max
```

**Anti-bystander protocol — forbidden prompts:**
```
❌ "Multiple agents agree this is correct. Verify quickly."
❌ "The builder says this is done. Confirm."
❌ "The other reviewer approved this."
```

**Required prompts:**
```
✅ "Independently inspect the code and tests. Derive findings only from
    repository evidence. Do not assume anything was checked."
✅ "This is a fresh inspection. No prior reviewer output is available to you."
```

**Reviewer count limit:** cap at 2 validators (reviewer + tester). Do not add a third reviewer to resolve disagreement. Disagreement triggers targeted validation, not a vote.

---

## Step 5 — Findings Aggregation

Use the **review-aggregator** extension to synthesize findings.

```
aggregate_reviews({
  findings: [<reviewer output>, <tester output>],
  aggregation_method: "evidence_rank",   // NOT majority_vote
  preserve_minority: true,
  minimum_evidence_for_block: "command_evidence OR file_line_ref"
})
```

**Aggregation rules:**
1. **Shuffle and anonymize** reviewer IDs before synthesis
2. **Evidence quality ranking:** test failure with exit code > file/line reference > opinion
3. **Minority preservation:** one `critical` or `high` finding with command evidence blocks, regardless of other reviewers' verdicts
4. **No majority voting:** disagreement → targeted validation or human escalation
5. **Correctness > security > regression > style** in priority

**Possible outcomes:**
- `block` — adjudicated findings returned to builder for fixes
- `approve_with_concerns` — advisory findings, builder proceeds
- `approve` — proceed to completion

---

## Step 6 — Adjudicated Fix (If Blocked)

If the review verdict is `block`:

1. Pass adjudicated findings (file/line/suggested_fix) to builder
2. Builder applies targeted fixes only — no additional scope
3. Builder re-runs validation ladder
4. Return to Step 4 for re-review (re-run independently, same protocol)
5. If blocked again after second fix attempt: escalate to Workflow D (repeated failure)

**Do not cycle the review more than twice without escalating.**

---

## Step 7 — Completion

Once review verdict is `approve` or `approve_with_concerns`:

1. Summarizer agent consolidates all artifacts into final attempt summary
2. Check prospective agenda: any pending obligations from this run?
3. Store reusable insights as declarative memory proposals via memory-curator
4. Log the run in `.pi/mas-traces/` for potential curriculum generation

**Final checklist:**
- [ ] All F2P tests pass
- [ ] All P2P tests pass (no regressions)
- [ ] Validation ladder completed (all commands exit 0)
- [ ] Review verdict: `approve` or `approve_with_concerns`
- [ ] Attempt summary saved to `.pi/runs/<id>/`
- [ ] Any systemic issues flagged for Workflow E consideration

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| `context.md` | scout | `.pi/runs/<id>/context.md` |
| `plan.md` | planner | `.pi/runs/<id>/plan.md` |
| `attempt-summary.json` | builder/summarizer | `.pi/runs/<id>/attempt-summary.json` |
| `review-findings.json` | reviewer | `.pi/runs/<id>/review-findings.json` |
| `validation.md` | tester | `.pi/runs/<id>/validation.md` |
| `changes.patch` | builder | `.pi/runs/<id>/changes.patch` |
| `adjudicated-findings.json` | aggregator | `.pi/runs/<id>/adjudicated-findings.json` |
