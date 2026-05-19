---
name: eval-planning
description: Generate task-adaptive evaluation plans before any pairwise judgment. Use for any evaluation task to prevent fixed-rubric bias. Invoke before judging code quality, skill proposals, memory updates, or topology proposals. Generates a plan FIRST, then executes it, then produces a verdict — never jumps to verdict from impression alone.
---

# Eval Planning

Fixed evaluation rubrics fail when applied to tasks they weren't designed for. EvalPlanner research shows that dynamically generating an unconstrained, task-adaptive evaluation plan before each judgment achieves 93.9% on RewardBench with only 22K synthetic pairs — matching models trained on 680K human-annotated pairs.

**Sources:** EvalPlanner (2501.18099v2); LLM-as-a-Judge survey; Self-Taught Evaluators (2408.02666v2); Con-J (ICLR 2025); Self-preference paper (NeurIPS 2024)

---

## Core Principle

**Plan → Execute → Verdict** (never jump to verdict from impression)

```
Step 1 PLAN:   Generate an unconstrained, task-specific evaluation plan
               Define: what to check, how to verify, what reference answer looks like,
                       which criteria are objective vs. subjective
Step 2 EXECUTE: Follow the plan step-by-step against both candidates
                Cite specific file/command/test evidence for each step
Step 3 VERDICT: Derive pairwise preference from execution results only
                Include rationale that references plan steps, not impressions
```

---

## Plan Structure by Task Type

### Coding Task

```
PLAN for coding task evaluation:
1. Test case generation: what test cases would verify correct behavior?
   - Happy path
   - Edge cases from the spec
   - Error/exception cases
2. Correctness check: run the tests or trace execution manually
   - Does candidate A pass? Which tests fail?
   - Does candidate B pass? Which tests fail?
3. Reference answer derivation: what should the correct implementation do?
   - Read the spec/interface definition
   - Determine expected behavior from documentation
4. Regression check: do existing P2P tests still pass for each candidate?
5. Non-functional check (if specified): performance, security, maintainability
   - Only if these are explicitly in the requirements

Objective criteria (deterministic): test pass/fail, syntax, type errors
Subjective criteria (apply last, with lower weight): readability, style
```

### Skill Proposal

```
PLAN for skill proposal evaluation:
1. Coherence: does the skill's description match its content?
2. Examples: are concrete examples present and correct?
3. Preconditions: are trigger conditions specific enough to decide invocation?
4. Contraindications: are cases where NOT to use the skill documented?
5. Contradiction check: does this skill conflict with AGENTS.md or another skill?
6. Completeness: are all required sections present?

Objective criteria: presence of required sections, no contradictions
Subjective: writing clarity (apply last, low weight)
```

### Memory Update

```
PLAN for memory update evaluation:
1. Source accuracy: does the claimed fact match the cited source?
   - Read the source file or command output
   - Verify the specific claim
2. Staleness check: is this information current?
   - Check file modification date
   - Re-run any cited command if feasible
3. Contradiction check: does this conflict with existing validated memory?
4. Scope check: is the scope (repo/project/user/global) correct?
5. Confidence calibration: is the stated confidence justified by the evidence?

Objective criteria: source exists, claim matches source, no contradiction
Subjective: phrasing quality (ignore)
```

### Topology Proposal

```
PLAN for topology proposal evaluation:
1. Correctness: does the topology pass all validation rules? (use topology-authoring skill)
2. Cost estimate: what is the expected token/time cost vs. simpler topology?
3. Depth check: is the depth justified by task difficulty?
4. Validation: is there a final validation layer?
5. Coherence: do agent roles and data flows make sense?
6. Comparison: does this topology improve on the baseline for this task type?

Objective criteria: validation rules, cost delta, validation layer present
Subjective: elegance (ignore)
```

---

## Anti-Bias Checklist

Apply before every judgment:

- [ ] **No model identity**: remove model names, author info from both candidates
- [ ] **No length preference**: longer ≠ better; separate length from quality in the plan
- [ ] **No style bias**: formatting, headers, emojis do not affect verdict
- [ ] **Position swap**: run judgment with candidates in both orders (A-then-B, B-then-A)
- [ ] **Identity strip**: strip formatting decorations before the judge sees content
- [ ] **Pairwise over scalar**: compare A vs. B, never assign absolute scores alone
- [ ] **Cross-model judge**: judge must be a different model family from generator

---

## Five Bias Families to Guard Against

| Bias | Description | Mitigation |
|---|---|---|
| **Position bias** | Favours whichever candidate appears first or second | Run both orderings; accept only consistent verdicts |
| **Length/verbosity bias** | Prefers longer, more elaborate outputs regardless of quality | Explicit anti-verbosity instructions; separate length criteria |
| **Self-preference / self-enhancement** | Generator model scores its own outputs higher (GPT-4: 73.5% self-recognition) | Use different model family as judge — hard constraint |
| **Compassion-fade / identity inflation** | Attaching a prestigious model name inflates scores | Strip all model identity before judging |
| **Style bias** | Prefers headers, bullets, emojis over correct plain text | Separate style from correctness; correctness wins |

---

## Position Swap Protocol

Every judgment MUST be run twice:

```
Run 1: Evaluate [Candidate_A, Candidate_B]  → verdict_1
Run 2: Evaluate [Candidate_B, Candidate_A]  → verdict_2

If verdict_1 == verdict_2 (same winner): position_consistent = true ✅
If verdict_1 ≠ verdict_2 (different winner): position_consistent = false ❌
  → Discard this judgment pair
  → Regenerate with a different evaluation plan sample
```

**Never report a verdict that is not position-consistent.** Inconsistent verdicts indicate the judge is responding to order rather than quality.

---

## Majority Vote for High-Stakes Decisions

For promotions, demotions, and evolution proposals use **3+ independent samples**:

```
sample_1 = judge(plan_1, A, B) → verdict_1
sample_2 = judge(plan_2, A, B) → verdict_2  // different plan sample
sample_3 = judge(plan_3, A, B) → verdict_3  // different plan sample

majority_verdict = most_common([verdict_1, verdict_2, verdict_3])
confidence = "high" if unanimous else "medium" if 2/3 else "low"
```

Require majority vote for:
- Skill promotion from provisional → validated
- Evolution proposal acceptance
- Curriculum case promotion to regression test suite
- Topology selection for expert-difficulty tasks

---

## Judge Calibration Targets

Track these metrics; trigger judge self-improvement (Workflow G) if they drift:

| Metric | Target | Action if missed |
|---|---|---|
| Position-consistency rate | ≥ 80% | Revise evaluation plan prompts; trigger Workflow G |
| Known-pair accuracy | ≥ 85% | Check for self-preference contamination; verify cross-model |
| Inter-run stability | ≥ 90% | Reduce judge temperature; use more structured plan |
| Verbosity-bias rate | < 5% | Add explicit anti-verbosity instruction to plan |
| Human spot-check agreement | Track trend | Flag if declining; review bias families |

---

## CRITICAL: Judge Must Be a Different Model Family

**GPT-4 achieves 73.5% out-of-box self-recognition. Self-preference is linearly correlated with self-recognition.**

This means: if the generator is Claude-family, the judge must be GPT-family or Gemini-family. If the generator is GPT-family, the judge must be Claude-family or Gemini-family.

```
Generator family → Required judge family
Claude           → GPT-4o or Gemini
GPT              → Claude or Gemini
Gemini           → Claude or GPT-4o
```

This is an **architectural constraint**, not a style preference. Violating it means the self-evolution loop will systematically favour the dominant model's proposals regardless of quality.

---

## Output Schema

Every judgment must produce this structured output:

```json
{
  "plan": "<the evaluation plan generated for this specific task — describes steps, criteria, verification methods>",
  "execution": "<step-by-step execution of the plan against both candidates, citing evidence>",
  "verdict": "A | B | tie",
  "rationale": "<why the winning candidate is better, citing specific execution steps>",
  "position_consistent": true,
  "confidence": "high | medium | low",
  "bias_checks": {
    "identity_stripped": true,
    "length_controlled": true,
    "position_swapped": true,
    "cross_model_judge": true
  }
}
```

---

## Using the Judge Tools

```
# Generate evaluation plan and run judgment
judge_evaluate({
  task_type: "coding | skill_proposal | memory_update | topology",
  task_description: "<what was being evaluated>",
  candidate_a: "<candidate A content — model identity stripped>",
  candidate_b: "<candidate B content — model identity stripped>",
  run_position_swap: true,     // always true
  majority_vote_samples: 1,    // use 3 for high-stakes decisions
  judge_model: "gemini-pro"    // different family from generator
})

# Save judgment result to corpus
judge_save_result({
  judgment: { plan, execution, verdict, rationale, position_consistent, confidence },
  task_type: "coding",
  winner: "A",
  trace_ref: "<run_id>",
  generator_model_family: "claude",
  judge_model_family: "gemini"
})
```

---

## Self-Improvement Loop

The judge improves from accumulated preference pairs:

1. Collect confirmed preference pairs (position_consistent=true, confidence≥medium)
2. Identify patterns where judge was wrong (compare to oracle/test results)
3. Rejection-sample: keep only judgments where verdict matches deterministic ground truth
4. Update judge evaluation plan prompts from high-quality reasoning chains
5. Track calibration metrics; trigger if position_consistency drops below 80%

This is Workflow G from the research report. Trigger it when:
- Position-consistency rate falls below 80%
- 500+ new confirmed pairs have accumulated since last update
- A new task domain needs evaluation plans built
