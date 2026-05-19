---
name: workflow-d-refinement
description: Repeated-failure refinement workflow for tasks with 2+ failed attempts or persistent test failures. Uses Recursive Tournament Voting (RTV) to select top attempt summaries and Parallel-Distill-Refine (PDR) to condition a fresh attempt from evidence. Structured failure attribution is required before any new attempt.
---

# Workflow D — Repeated Failure Refinement

Use this workflow when previous attempts have failed and naive retries are unlikely to succeed. The core insight from test-time scaling research is that long-horizon attempts produce trajectories too verbose to compare directly — the key artifact is the **structured attempt summary**, which enables principled selection and evidence-conditioned refinement.

**Research basis:** Scaling Test-Time Compute (RTV + PDR, 2604.16529v1), LIFE failure attribution (2605.14892v1), failure taxonomy (12 categories), memory-failure prevention.

---

## When to Use Workflow D

✅ Use when:
- **2 or more previous attempts** on the same task have failed
- **Test failures persist** after builder fixes
- **Context is noisy** — multiple competing hypotheses with no clear winner
- Previous attempts left behind conflicting partial changes
- Failure mode is unclear (no clean root cause from prior run)

❌ Do not use as a first attempt — always try Workflow A/B/C first.

❌ If 4+ Workflow D passes have failed, escalate to human review before continuing.

---

## Pre-Condition: Attempt Summaries Required

Workflow D depends on structured attempt summaries from prior runs. Before starting:

```bash
# Verify attempt summaries exist for all prior attempts
ls .pi/runs/*/attempt-summary.json

# If missing, create retroactively from run traces:
# Spawn summarizer agent with trace artifacts
```

**If no structured summaries exist** from prior runs, create them first using the `rollout-summary` skill before running Workflow D. Raw traces are too verbose — do not try to compare them directly.

---

## Step 1 — Collect and Review Attempt Summaries

Gather all attempt summaries for this task:

```bash
# Collect all summaries for the task
cat .pi/runs/*/attempt-summary.json | jq 'select(.task_ref == "<task ref>")'
```

For each prior attempt, extract:
```
Attempt: <attempt_id>
Hypothesis: <what was tried>
Verdict: <candidate | needs_refinement | reject>
Tests Passed: <list>
Tests Failed: <list with failure reasons>
Failure Modes: <list>
Reusable Insights: <list>
Progress Made: <list>
Diff Ref: <path to actual changes>
```

**Do not start a new attempt before reviewing all prior summaries.** The failure pattern is often visible across summaries.

---

## Step 2 — Failure Attribution (Required)

Before selecting or refining, run **structured failure attribution** on the failed attempts. This is the LIFE framework prerequisite for self-improvement.

```
Spawn failure-attributor agent:
  Inputs: attempt summaries (all failed attempts), relevant source files, test output
  Output: .pi/runs/<run-id>/failure-attribution.json
  Constraints: read-only; must cite specific evidence for every claim
  Budget: 15,000 tokens max
  Skill: failure-attribution
```

**The attribution must answer:**

1. **What failed?** (classify using the 12-category taxonomy)
2. **Where did it fail?** (agent, step, file, line, tool, memory item)
3. **How did it propagate?** (trigger → intermediate → observable failure)
4. **What evidence proves the diagnosis?** (command output, file/line, test assertion)
5. **What repair is indicated?** (targeted action at the root cause, not the symptom)
6. **Should any system artifact change?** (prompt, skill, topology, memory, tool description)

**Failure taxonomy (12 categories):**
```
1.  Spec        — ambiguous requirements or missing interfaces
2.  Context     — wrong files read, stale docs, guessed interfaces
3.  Planning    — bad decomposition, missing validation step
4.  Tool        — wrong command, bad arguments, env not configured
5.  Implementation — logic bug, cross-file dependency, semantic gap
6.  Verification — tests not run, wrong tests, flaky tests masked failure
7.  Review      — false positive blocked good code; false negative missed bug
8.  Communication — lost assumption in handoff artifact
9.  Memory      — stale or wrong memory retrieved and acted on
10. Merge       — conflicting edits, partial patch applied
11. Budget      — truncation from token/time overflow
12. Safety      — destructive command, permission denied
```

**Blocker:** if attribution returns `confidence: low` with no clear category, run the scout agent again — prior attempts likely suffered from a context failure.

---

## Step 3 — Recursive Tournament Voting (RTV) — Select Top Evidence

After attribution, use **Recursive Tournament Voting** to select the top 2–4 attempt summaries to seed the refinement. Compare summaries in small groups; the strongest advance.

```
RTV selection instructions:

For each pair of summaries (A vs. B):
  Compare:
  1. Hypothesis quality — which tested a more grounded strategy?
  2. Evidence strength — which has more passing tests and specific tool output?
  3. Progress made — which advanced further toward the goal?
  4. Failure specificity — which has clearer failure modes? (better seed for PDR)
  5. Reusable insights — which discovered more valid facts about the codebase?

  Winner: the summary with stronger evidence and clearer hypothesis, even if verdict = reject
  Note: a partially-complete attempt with precise failure modes beats a "candidate"
        with vague validation
```

**RTV round structure:**
```
Round 1: Compare all attempts in pairs → select winners
Round 2 (if >4 attempts): Compare winners in pairs → select top 2-4
Final: top 2-4 summaries are the PDR seed set
```

**Invoke judge agent for high-stakes selection** (3+ attempts, ambiguous winner):
```
Spawn judge agent:
  Task: "Evaluate these attempt summaries. Which strategies have the strongest
    evidence and best seed a refined attempt? Use plan→execute→verdict."
  Model constraint: MUST be a different model family from the builder
  Protocol: position-swap check (run both orderings, accept only consistent verdicts)
  Input: all attempt summaries (anonymized)
  Output: ranked summary list with rationale
```

---

## Step 4 — Parallel-Distill-Refine (PDR) — Condition the New Attempt

The refined attempt is conditioned on the top RTV summaries. It is **not a blank retry** — it inherits the evidence from what worked and the failure modes from what didn't.

### PDR Conditioning Package

Assemble this package for the refined builder:

```json
{
  "task_ref": "<original task>",
  "failure_attribution": {
    "primary_category": "<category 1-12>",
    "root_cause": "<attributed cause from Step 2>",
    "repair_direction": "<what the new attempt must do differently>"
  },
  "top_summaries": [
    {
      "attempt_id": "<best attempt ID>",
      "hypothesis": "<strategy that got furthest>",
      "files_changed": ["<what was changed>"],
      "reusable_insights": ["<confirmed codebase facts>"],
      "progress_made": ["<what now works>"]
    }
  ],
  "negative_knowledge": [
    "<failure_mode from rejected attempt 1>",
    "<failure_mode from rejected attempt 2>"
  ],
  "remaining_risks": ["<combined risks from all summaries>"],
  "constraint_from_attribution": "<specific fix required by root cause>",
  "validation_ladder": "<from original plan.md>"
}
```

### PDR conditioning prompt for builder:
```
You are attempting a refined implementation. Previous attempts failed.
This is NOT a blank retry — you have evidence.

WHAT WORKED (reuse):
  [top summary hypothesis and reusable insights]

WHAT FAILED (avoid):
  [combined failure modes from rejected attempts]

ROOT CAUSE (address directly):
  [failure attribution result]

REQUIRED DIFFERENCE IN THIS ATTEMPT:
  [specific change indicated by attribution]

VALIDATION REQUIREMENT:
  Do not emit candidate without running: [exact validation commands]
```

---

## Step 5 — Refined Build Attempt

Launch a fresh **builder agent** with the PDR conditioning package.

```
Spawn builder agent:
  Inputs:
    - PDR conditioning package
    - Original plan.md (as reference)
    - context.md (or re-scout if attribution identified context failure)
    - AGENTS.md
  Output: changed files + .pi/runs/<run-id>/attempt-summary.json
  Permissions: read+write to source files
  Budget: 35,000 tokens max
  Special instructions:
    "This is attempt N. You have evidence from N-1 prior attempts.
     Read the PDR conditioning package before writing any code.
     Address the root cause in failure_attribution directly.
     Avoid the failure modes listed in negative_knowledge."
```

**If attribution identified a Context failure (category 2):** re-run the scout before building. The prior attempts may have used wrong interface assumptions. Do not reuse `context.md` from a previous failed run without verifying it.

**If attribution identified a Memory failure (category 9):** check `.pi/memory/` for stale entries related to this task. Use memory-curator to deprecate outdated facts before the refined attempt uses them.

---

## Step 6 — Validation

Run the full validation ladder fresh — do not compare to prior attempt results.

```bash
# 1. Syntax and type check
npx tsc --noEmit   # or language equivalent

# 2. Lint
<lint command>

# 3. F2P tests (must now pass)
<targeted test command>

# 4. P2P tests (must not regress)
<regression test command>

# 5. Full suite (if feasible)
<full test suite>
```

Record all exit codes and relevant output in the attempt summary.

**Success criteria:**
- All F2P tests from the original feature spec pass
- All P2P tests from the original feature spec pass
- No regressions in broader test suite
- Validation ladder exits 0

If validation fails again: proceed to independent review anyway (the review may surface the remaining issue) or escalate directly to human review.

---

## Step 7 — Independent Review (Abbreviated Anti-Bystander)

For Workflow D, run the anti-bystander review protocol but streamlined:

```
Spawn reviewer (1 only for refinement passes):
  Input: changed files, validation results
  Special instruction: "Previous attempts failed. Your job is to find what
    still goes wrong. Inspect all changed files independently."
  Budget: 10,000 tokens max
  Output: review-findings.json
```

If reviewer finds a new critical issue: add it to the failure attribution record and return to Step 4 with an updated PDR conditioning package.

---

## Step 8 — Curriculum Case Generation (If Still Failing)

If the task has failed **3 or more times across Workflow D passes**, this task qualifies as a curriculum case:

```
Spawn curriculum-generator agent:
  Input: all attempt summaries + failure attributions
  Task: "Generate a curriculum case from this recurring failure pattern"
  Output: .pi/curricula/<case-id>.json
  Constraints: must have deterministic oracle
  Skill: curriculum-generation
```

The curriculum case becomes a regression test and can seed a Workflow E self-evolution proposal if the failure pattern is systemic.

**Escalation gate:** after 4 failed attempts (Workflow D), escalate to human review before attempting again. The problem may require user clarification, not more agent compute.

---

## Step 9 — Completion and Memory Update

After a successful or final attempt:

```
Summarizer: consolidate all attempt summaries into a multi-attempt run record
Memory-curator:
  - Store confirmed codebase facts from reusable_insights as declarative memory
  - Store failed hypotheses as negative_lesson entries
  - Flag any memory entries that contributed to context failures for review
  - Create prospective reminder for any follow-up cleanup
```

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| All prior `attempt-summary.json` files | builder/summarizer | `.pi/runs/*/` |
| `failure-attribution.json` | failure-attributor | `.pi/runs/<id>/` |
| `pdrs-conditioning.json` | supervisor | `.pi/runs/<id>/` |
| New `attempt-summary.json` | builder | `.pi/runs/<id>/` |
| `review-findings.json` | reviewer | `.pi/runs/<id>/` |
| `curriculum-case.json` (if ≥3 failures) | curriculum-generator | `.pi/curricula/` |
| `multi-attempt-summary.md` | summarizer | `.pi/runs/<id>/` |
