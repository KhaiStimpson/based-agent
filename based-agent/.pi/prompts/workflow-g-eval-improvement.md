---
name: workflow-g-eval-improvement
description: Eval agent self-improvement workflow for calibrating and iteratively improving the judge agent. Sequences good/bad attempt pairs → judge generates task-adaptive evaluation plan → executes plan against both candidates → position-swap check → accumulate confirmed corpus → update judge evaluation plans. Triggered when position-consistency rate < 80%, inconsistent proposal evaluation, or new task domain.
---

# Workflow G — Eval Agent Self-Improvement

Use this workflow to calibrate and iteratively improve the judge agent's evaluation quality. Without a reliable judge, every other self-improvement loop — frontier task scoring, attribution validation, promotion gating — drifts toward the judge's biases instead of genuine improvement. The judge is a first-class component, not an afterthought.

**Research basis:** Self-Taught Evaluators (75.4 → 88.7% RewardBench from zero human labels, 5 iterations), EvalPlanner (93.9% RewardBench, plan→execute→verdict with 22K synthetic pairs), LLM-as-a-Judge survey (5 bias families), Con-J (DPO on contrastive pairs with verbal rationale), Self-Preference paper (linear correlation between self-recognition and self-preference).

---

## When to Use Workflow G

✅ Trigger immediately when:
- Judge **position-consistency rate drops below 80%** (metric tracked by judge-evolution extension)
- **Inconsistent proposal evaluations:** same task class produces contradictory verdicts across runs
- **New task domain introduced** (e.g., first Rust task in a Python-heavy system) — judge needs new evaluation plans for the domain
- **Known-pair accuracy drops below 85%** (test-pass vs. test-fail pairs should be deterministic)
- **Verbosity-bias rate exceeds 5%** (judge rationale cites length as quality signal)
- **Accumulated corpus reaches 500+ confirmed pairs** (trigger full plan update cycle)

✅ Run as a scheduled calibration check every 50 production runs.

---

## Judge Calibration Target Table

| Metric | What it measures | Target | Action if missed |
|---|---|---|---|
| Position-consistency rate | % verdicts unchanged when candidate order swapped | ≥ 80% | Trigger Workflow G immediately |
| Inter-run stability | % verdicts unchanged on identical re-run (temp > 0) | ≥ 90% | Check sampling temperature; update judge plan prompt |
| Known-pair accuracy | Accuracy on pairs where ground truth is deterministic | ≥ 85% | Review judge evaluation plans; check model family constraint |
| Human spot-check agreement | Agreement with human reviewer on sampled pairs | Track trend (no fixed target) | Flag systematic disagreement patterns |
| Verbosity-bias rate | % verdicts citing length as quality signal | < 5% | Add explicit anti-verbosity instruction to judge plans |
| Confirmed pairs accumulated | Total high-quality pairs in corpus | Track count | Trigger plan update at 500 pairs |
| Judge plan revision count | Number of plan updates (tracks self-improvement activity) | Track trend | Escalate if frozen for 30+ days with metric misses |

---

## Cross-Model Constraint (Hard Architectural Requirement)

**The judge must NEVER be the same model family as the generator being evaluated.**

This is not a preference — it is an architectural constraint derived from research:
- GPT-4 achieves **73.5% out-of-box self-recognition** of its own outputs
- Self-preference strength is **linearly correlated** with self-recognition capability
- A system where the same backbone generates AND evaluates its own proposals will **systematically favour acceptance**

```
If generator is Claude/Anthropic:
  → Judge must be GPT-family OR Gemini-family OR Llama-family

If generator is GPT/OpenAI:
  → Judge must be Claude-family OR Gemini-family

If generator is Gemini/Google:
  → Judge must be Claude-family OR GPT-family
```

The `judge-evolution` extension enforces this constraint via family resolution. Any attempt to use the same family as both generator and judge will be blocked and logged.

---

## Step 1 — Pair Construction (Self-Taught Evaluators Principle)

Collect good/bad attempt pairs from the trace ledger. Use two sources:

### Source A: Trace-Derived Pairs
```bash
# From the trace ledger, find pairs where:
# - One attempt succeeded (verdict: candidate, all tests pass)
# - Another failed (verdict: reject, tests fail)
# - Both attempts are on the same task

SELECT run_a, run_b FROM mas_traces
WHERE run_a.task_ref = run_b.task_ref
  AND run_a.verdict = 'candidate'
  AND run_b.verdict = 'reject'
ORDER BY run_a.created_at DESC
LIMIT 100
```

### Source B: Synthetic Degraded Pairs
```
For each recent successful attempt:
  1. Take the successful candidate output
  2. Introduce a controlled degradation:
     - Remove one validation step (verification failure simulation)
     - Introduce a guessed interface instead of a read one (context failure simulation)
     - Omit error handling for a documented exception (implementation failure simulation)
  3. The degraded version is the known-worse candidate
  4. The original is the known-better candidate
  → Ground truth: original > degraded (deterministic quality signal)

This produces known-quality preference pairs without human annotation.
```

**Pair format:**
```json
{
  "pair_id": "pair-<timestamp>-<slug>",
  "task_ref": "<task description>",
  "task_type": "coding | skill_proposal | memory_update | topology | attribution",
  "candidate_A": {
    "attempt_id": "<id>",
    "summary": "<attempt summary>",
    "output_ref": "<artifact path or content>"
  },
  "candidate_B": {
    "attempt_id": "<id>",
    "summary": "<attempt summary>",
    "output_ref": "<artifact path or content>"
  },
  "ground_truth": "A | B | unknown",
  "pair_source": "trace | synthetic",
  "created_at": "2026-05-19"
}
```

---

## Step 2 — Judge Generates Task-Adaptive Evaluation Plan (EvalPlanner Principle)

For each pair, the judge generates an **unconstrained, task-adaptive evaluation plan** — not a fixed rubric.

```
Spawn judge agent:
  Task: "Generate an evaluation plan for this pair: <pair_id>"
  Model: MUST be different family from the generator
  Input: task description + task type
  Step: PLAN ONLY (do not evaluate yet)
  Output: evaluation-plan.json

The evaluation plan must specify:
  1. What to check (specific to this task type — not a generic checklist)
  2. How to verify each criterion (command, file inspection, test analysis)
  3. What a reference answer looks like (derived from task requirements)
  4. Which criteria are objective vs. subjective
  5. What evidence would prove A > B vs. B > A

Examples by task type:
  coding task plan: generates test cases, checks correctness and completeness,
                    derives reference implementation step-by-step
  skill proposal plan: checks coherence, preconditions, example coverage,
                       absence of contradictions with existing skills
  memory update plan: verifies accuracy against cited source evidence,
                      checks for staleness vs. current codebase state
  topology proposal plan: compares cost, depth, validation pass rate,
                          coherence properties against difficulty score
```

**Why unconstrained plans beat fixed rubrics:** EvalPlanner achieved 93.9% on RewardBench with only 22K synthetic pairs by generating task-specific plans at inference time. Fixed evaluation checklists fail on task types they were not designed for. An unconstrained plan generated from the task itself adapts to what actually matters.

---

## Step 3 — Execute Plan Against Both Candidates

```
Spawn judge agent:
  Task: "Execute evaluation plan against candidates A and B"
  Model: SAME model and family as Step 2
  Inputs: evaluation-plan.json + candidate_A content + candidate_B content
  Protocol: execute each plan step against BOTH candidates
  Output: execution-evidence.json (step-by-step findings for each candidate)
  
  Anti-bias pre-processing (required before judge sees candidates):
    1. Strip model identity from all outputs (remove "Generated by Claude/GPT/...")
    2. Strip author attribution (remove agent names, run IDs)
    3. Strip formatting decorations (normalize markdown headers, bullets)
    4. Strip length signals (do NOT truncate, but neutralize length-pride phrases)
  
  Instructions to judge:
    "Execute the evaluation plan step by step against both candidates.
     For each step, cite specific evidence from the content (no impressions).
     Do not favour the output that is longer or better formatted.
     Do not favour the output that claims more confidence.
     Focus only on correctness, completeness, and adherence to the task."
```

---

## Step 4 — Position-Swap Check (Mandatory Bias Filter)

Run the judgment in both candidate orderings. Accept only position-consistent verdicts.

```
Run 1: [Candidate A first, Candidate B second]
  → Judge produces: verdict_1 (A > B, B > A, or tie)

Run 2: [Candidate B first, Candidate A second]
  → Judge produces: verdict_2 (B > A, A > B, or tie)

Position consistency check:
  verdict_1 says A > B AND verdict_2 says A > B → CONSISTENT ✅
  verdict_1 says B > A AND verdict_2 says B > A → CONSISTENT ✅
  verdict_1 and verdict_2 disagree → INCONSISTENT ❌ → DISCARD AND REGENERATE
```

**Rejection-sampling instructions:**
```
If verdict is position-inconsistent:
  1. Discard both verdicts — do NOT average or compromise
  2. Regenerate: use a different sampled evaluation plan (temperature > 0 for plan generation)
  3. Re-execute the new plan against both candidates
  4. Re-run position-swap check
  5. Maximum 3 regeneration attempts per pair before classifying pair as "ambiguous"
     (ambiguous pairs are not discarded — they are kept with status: ambiguous
      and may be improved later with a better oracle)
  
Only CONSISTENT verdicts are added to the preference corpus.
```

---

## Step 5 — Produce Structured Verdict

For each position-consistent judgment, produce the standard verdict format:

```json
{
  "plan": "<the evaluation plan that was executed>",
  "execution": {
    "candidate_A_evidence": ["<step 1 finding>", "<step 2 finding>", "..."],
    "candidate_B_evidence": ["<step 1 finding>", "<step 2 finding>", "..."]
  },
  "verdict": "A | B | tie",
  "rationale": "<specific evidence-based explanation — no length or style references>",
  "position_consistent": true,
  "confidence": "high | medium | low",
  "bias_flags": {
    "verbosity_reference": false,
    "style_reference": false,
    "identity_reference": false
  }
}
```

**Bias flag check (required):**
- `verbosity_reference: true` → rationale mentions length → **downgrade confidence, flag for review**
- `style_reference: true` → rationale mentions formatting, headers, bullets → **flag; do not block**
- `identity_reference: true` → rationale mentions a model name → **discard verdict, check pre-processing**

---

## Step 6 — Corpus Accumulation

Store confirmed preference pairs in the judge corpus.

```
Use: record_preference_pair tool (judge-evolution extension)

record_preference_pair({
  pair_id: "<id>",
  task_type: "coding | skill_proposal | memory_update | topology | ...",
  winner: "A | B | tie",
  rationale: "<rationale from verdict>",
  position_consistent: true,
  judge_model_family: "gemini | gpt | anthropic | ...",
  generator_model_family: "claude | gpt | ...",
  confidence: "high | medium | low",
  evaluation_plan: "<the plan that was used>",
  trace_ref: "<run IDs>",
  created_at: "2026-05-19"
})
```

**Corpus accumulation schema (stored in `.pi/evals/judge-corpus/`):**
```yaml
corpus_entry:
  type: preference_pair
  pair_id: "pair-<timestamp>-<slug>"
  task_type: coding | skill_proposal | memory_update | topology | attribution
  winner: A | B | tie
  rationale: "<evidence-based rationale>"
  position_consistent: true
  judge_model_family: <family>
  generator_model_family: <family>
  confidence: high | medium | low
  evaluation_plan: "<plan text>"
  plan_version: "v<n>"      # tracks which judge plan version produced this
  trace_ref: "<source run IDs>"
  pair_source: trace | synthetic
  ground_truth: A | B | unknown   # for synthetic pairs: known
  created_at: "2026-05-19"
  status: confirmed | ambiguous | superseded
```

The corpus is the judge's long-term evaluation memory. It grows with every Workflow G run and is used in Step 7 to improve judge evaluation plans.

---

## Step 7 — Judge Self-Improvement (Iterative Plan Update)

When any calibration trigger is met (see calibration table), use the accumulated corpus to improve judge evaluation plans.

```
Spawn judge agent (in evaluation-plan-update mode):
  Task: "Improve evaluation plans from confirmed corpus"
  Inputs:
    - .pi/evals/judge-corpus/ (confirmed preference pairs)
    - Current judge evaluation plan library
    - Calibration metrics report
  Output: revised judge evaluation plan proposals
  Constraints:
    - Revise plans, not verdicts
    - Plans must remain unconstrained and task-adaptive
    - New plans must pass the same position-swap filter on held-out corpus subset
  Budget: 20,000 tokens max
```

**Self-improvement process (Self-Taught Evaluators protocol):**
```
1. Sample confirmed preference pairs from corpus
   → Focus on high-confidence pairs where rationale is strong
   → Include known-quality synthetic pairs as ground truth

2. Identify correct vs. incorrect judgments:
   → For synthetic pairs: ground truth is known (degraded < original)
   → Compare judge verdicts against ground truth
   → Identify which evaluation plan structures correlate with correct judgments

3. Rejection sampling — collect high-quality reasoning chains:
   → Retain plans that produced: correct verdict + position-consistent + confidence=high
   → Discard plans that produced: wrong verdict OR position-inconsistent OR verbosity-flagged
   → The retained plans are "high-quality reasoning chains" for updating

4. Update judge evaluation plan library:
   → Strengthen plan steps that appear in correct high-confidence judgments
   → Add new plan steps that address identified failure patterns
   → Remove or revise plan steps associated with incorrect judgments
   → All plan updates are versioned (plan_version increments)

5. Verify updated plans on held-out corpus subset:
   → Run updated plans on 10% of corpus not used for training
   → Must not decrease position-consistency or known-pair accuracy
   → If degraded: revert and flag for human review
```

---

## Step 8 — Feed-Forward to Evolution Gates

The improved judge feeds better signals into the rest of the system:

**Curriculum scoring improvement:**
```
Better judge → more reliable frontier detection
Curriculum cases previously classified as "too easy" or "too hard" may need
re-evaluation after judge calibration improves.

Re-score affected curriculum cases:
  judge_evaluate_case({ case_id: "<id>", use_plan_version: "latest" })
```

**Evolution gate improvement:**
```
Before promoting any Workflow E proposal after a judge plan update:
  - Re-evaluate any pending proposals using the updated judge
  - Do not compare new-plan evaluations with old-plan evaluations without re-judging
  - Maintain frozen judge plan snapshots for regression testing

CRITICAL: Never compare a run judged with plan v1 against a run judged with plan v2
without re-judging both on the same plan version. Version drift is a known risk.
```

**Attribution validation improvement:**
```
The judge can now confirm whether attributed root causes are consistent with
the observed quality difference between successful and failed runs.

attribution_validate({
  attribution: "<failure-attribution.json content>",
  good_attempt: "<candidate attempt summary>",
  bad_attempt: "<failed attempt summary>",
  judge_plan_version: "latest"
})
```

---

## Step 9 — Calibration Report

After each Workflow G execution, produce a calibration report.

```markdown
## Judge Calibration Report

**Date:** 2026-05-19
**Trigger:** <position-consistency drop | new domain | scheduled | corpus threshold>
**Plan version before:** v<n>
**Plan version after:** v<n+1>

### Metrics Before / After
| Metric | Before | After | Target | Status |
|---|---|---|---|---|
| Position-consistency rate | X% | Y% | ≥ 80% | ✅/❌ |
| Inter-run stability | X% | Y% | ≥ 90% | ✅/❌ |
| Known-pair accuracy | X% | Y% | ≥ 85% | ✅/❌ |
| Verbosity-bias rate | X% | Y% | < 5% | ✅/❌ |

### Corpus State
- Total confirmed pairs: N
- New pairs added this run: N
- Ambiguous pairs pending: N
- Pairs by task type: coding: N, skill_proposal: N, ...

### Plan Updates
- Steps added: [list]
- Steps removed: [list]
- Steps revised: [list]

### Downstream Effects
- Curriculum cases re-scored: N
- Evolution proposals re-evaluated: N
- Human spot-check samples flagged: N
```

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| Preference pair corpus entries | judge-evolution extension | `.pi/evals/judge-corpus/` |
| Evaluation plan library (versioned) | judge-evolution extension | `.pi/evals/judge-corpus/plans/` |
| Calibration report | supervisor | `.pi/runs/<id>/judge-calibration-report.md` |
| Position-consistency log | judge-evolution extension | `.pi/evals/judge-corpus/consistency-log.jsonl` |
