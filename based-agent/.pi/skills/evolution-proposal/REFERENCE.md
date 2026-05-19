# Evolution Proposal Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Evolution Proposal

Self-evolution must be safe-first, proposal-based, and reversible. The Endure → Excel → Evolve hierarchy means safety and regression preservation outrank autonomous change. Every proposed change requires a diff, evidence, validation result, and rollback plan before any human approval is requested.

**Sources:** Self-Evolving AI Agents survey (2508.07407v2); LIFE survey (2605.14892v1); ELL/StuLife (2508.19005v6)

---

## Endure > Excel > Evolve Hierarchy

Before proposing any change, verify the priority order is respected:

```
1. ENDURE: Does the change preserve safety and stability?
   → If no: stop. Fix the safety issue first. Do not propose the change.

2. EXCEL: Does the change preserve or improve task performance?
   → Measure on holdout/regression tasks before proposing
   → If performance degrades: stop. Redesign the change.

3. EVOLVE: Only if both above pass → propose the autonomous change
   → Still requires human approval (see approval requirements below)
```

---

## Evolvable Artifact Classes

| Artifact | Default Autonomy | Required Gate | Notes |
|---|---|---|---|
| Episode summaries / negative lessons | Automatic write | Schema validation + provenance | Lowest risk |
| Memory facts / decisions | Proposal or auto if directly evidenced | Source citation, scope, confidence, deprecation path | |
| Skills / playbooks | Proposal | Examples, preconditions, validation evidence, owner approval if broad scope | |
| Prompt / agent instructions | Proposal | Diff, holdout evaluation, anti-conflict check, rollback | |
| Topology / routing rules | Proposal | Comparison against baseline on task classes, cost and safety review | |
| Tool descriptions | Proposal | Schema/tool-call regression checks | |
| New tools / extensions / permissions | **Human-approved only** | Security review, sandboxing, rollback, least privilege | Highest risk |

---

## Prohibited Targets Without Security Review

The following **must not** be changed without an explicit security review by a human:

```
❌ Extension code (.pi/extensions/)
❌ Tool permissions or allowed_tools policies
❌ Credentials, API keys, secrets
❌ Safety gate logic or bypass conditions
❌ Sandbox policy or filesystem access rules
❌ Network access rules
❌ Agent trust level or role assignment
```

If attribution identifies one of these as the root cause of a problem, create a proposal flagged as `security_review_required: true` and wait for human review before any change.

---

## Required Elements of Every Proposal

```yaml
proposal_id: "evol-<date>-<hash>"
title: "<what changes and why ≤ 60 chars>"
artifact_type: skill | prompt | agent | topology | memory_policy | tool_description | extension
artifact_path: "<exact path to the file being changed>"

change_description: "<what is changing, in concrete terms>"
change_motivation: "<why this change is needed — the problem it solves>"

evidence:
  - source_trace_id: "<run_id or postmortem_id>"
    description: "<what the trace shows>"
    failure_category: "<from 12-category taxonomy>"
    recurrence_count: <number of times this failure occurred>

diff: |
  --- a/<path>
  +++ b/<path>
  @@ line numbers @@
  - old content
  + new content

validation_result:
  holdout_evaluation:
    cases_tested: <number>
    cases_improved: <number>
    cases_regressed: 0  # must be 0 for proceed
    verdict: "improvement | neutral | regression"
  regression_tests_passed: true  # all existing tests must still pass
  safety_gate_passed: true
  estimated_cost_delta: "+5% tokens | -10% tokens | neutral"

rollback_plan:
  method: "git revert | file restore | skill_deprecate"
  rollback_command: "<exact command to undo this change>"
  rollback_time_estimate: "<minutes>"

security_review_required: false  # true if touches prohibited targets

status: draft | proposed | approved | applied | rolled_back
human_approval_required: true  # always true
```

---

## Proposal Evaluation Checklist

The evolution-auditor agent reviews every proposal against this checklist. All checks must pass before the proposal is submitted for human approval:

### Safety Gate (must pass first)
- [ ] Does NOT modify extensions, permissions, credentials, or safety gates (without security review)
- [ ] Rollback plan is feasible and tested (the rollback command actually works)
- [ ] No unintended side effects on other artifacts (checked for conflicts)
- [ ] Change is bounded — affects only the specified artifact

### Evidence Gate (is the evidence strong?)
- [ ] Source traces are real run IDs (not hypothetical)
- [ ] Failure category is specific (not "general improvement")
- [ ] Recurrence count ≥ 2 (single incident is insufficient for systemic change)
- [ ] Root cause (not symptom) is being addressed

### Performance Gate (does it improve things?)
- [ ] Holdout evaluation shows improvement or neutral result
- [ ] Zero regressions on existing test cases
- [ ] Estimated cost delta is documented
- [ ] Improvement is specific and measurable (not "should be better")

### Feasibility Gate (is it actionable?)
- [ ] Diff is present and syntactically valid
- [ ] artifact_path points to a real file
- [ ] Change can be applied without manual intervention
- [ ] Human approver has enough context to evaluate (evidence is self-explanatory)

---

## Using the propose_evolution Tool

```
propose_evolution({
  title: "Add mypy validation step to Python build chain",
  artifact_type: "prompt",
  artifact_path: ".pi/skills/repo-validation/SKILL.md",
  change_description: "Add mypy to the Python validation matrix after pytest",
  change_motivation: "3 recent runs had type errors caught only after deployment",
  evidence: [
    {
      source_trace_id: "2026-05-10-abc123-pm",
      description: "Type error in weather/client.py missed by validation",
      failure_category: "verification",
      recurrence_count: 3
    }
  ],
  diff: "--- a/...\\n+++ b/...\\n@@ ... @@\\n- old\\n+ new",
  validation_result: {
    cases_tested: 5,
    cases_improved: 4,
    cases_regressed: 0,
    verdict: "improvement",
    regression_tests_passed: true,
    safety_gate_passed: true,
    estimated_cost_delta: "+2% tokens"
  },
  rollback_plan: {
    method: "git revert",
    rollback_command: "git revert HEAD~1 --no-commit",
    rollback_time_estimate: "2 minutes"
  },
  security_review_required: false
})
```

---

## Human Approval Requirement

**All proposals require human approval before being applied.** There are no exceptions.

The system may:
- Generate proposals automatically from attribution
- Score proposals against the checklist
- Queue proposals for review

The system may NOT:
- Apply proposals without human confirmation
- Interpret silence as approval
- Apply proposals incrementally or partially without approval of the full diff

When requesting approval, present:
1. The title and change_description (plain language)
2. The evidence (what problem this fixes)
3. The diff (exact change)
4. The validation result (what was tested)
5. The rollback plan (how to undo if needed)

---

## Staged Rollout Policy

After human approval:

```
Stage 1: Apply to a single task type or test environment
  → Monitor for regressions for 3+ runs
  → If regressions: rollback immediately

Stage 2: If Stage 1 passes → apply broadly
  → Monitor for regressions for 5+ runs
  → Record metrics (success rate before/after, cost delta)

Stage 3: If Stage 2 passes → mark as validated change
  → Update the changelog in the artifact
  → Archive the proposal with metrics
```

---

## Example: Skill Update Proposal

**Attribution:** 3 runs in the past 2 weeks produced `NameError` from guessing class attributes. The `feature-spec` skill exists but agents skip it for "quick" tasks.

```yaml
proposal_id: "evol-20260519-feature-spec-trigger"
title: "Sharpen feature-spec trigger condition"
artifact_type: skill
artifact_path: ".pi/skills/feature-spec/SKILL.md"

change_description: "Update description to trigger on ANY task that modifies an existing class, not only 'non-trivial' tasks"
change_motivation: "Agents classify cache additions as trivial and skip spec phase, causing AttributeError"

evidence:
  - source_trace_id: "2026-05-10-abc123-pm"
    description: "AttributeError on WeatherClient._cache — attribute was assumed"
    failure_category: "context"
    recurrence_count: 3

diff: |
  --- a/.pi/skills/feature-spec/SKILL.md
  +++ b/.pi/skills/feature-spec/SKILL.md
  @@ -1,5 +1,5 @@
  -description: Convert a feature request into a complete executable contract...
  -Use when starting any non-trivial coding task to prevent NameError/TypeError failures.
  +description: Convert a feature request into a complete executable contract...
  +Use when starting any coding task that modifies an existing class or crosses a file boundary.
  +Treat ALL class modifications as non-trivial regardless of perceived complexity.

validation_result:
  cases_tested: 3
  cases_improved: 3
  cases_regressed: 0
  verdict: improvement
  regression_tests_passed: true
  safety_gate_passed: true
  estimated_cost_delta: "+3% tokens (more spec steps run)"

rollback_plan:
  method: git revert
  rollback_command: "git checkout HEAD~1 -- .pi/skills/feature-spec/SKILL.md"
  rollback_time_estimate: "1 minute"

security_review_required: false
status: proposed
human_approval_required: true
```

