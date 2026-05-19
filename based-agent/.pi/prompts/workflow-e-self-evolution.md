---
name: workflow-e-self-evolution
description: Self-evolution proposal workflow for recurring workflow failures and systemic improvement opportunities. Sequences trace audit → failure attribution → improvement proposal → human approval → verification → promote/rollback. Enforces Endure > Excel > Evolve gate order. Requires evolution-proposal skill and evolution-governor extension.
---

# Workflow E — Self-Evolution Proposal

Use this workflow when a recurring pattern across multiple runs signals that a system artifact (prompt, skill, topology, memory policy, routing rule, or agent contract) needs to change. Self-evolution is **always proposal-based and human-approved** for anything that changes production behavior.

**Research basis:** LIFE framework (trace → attribution → proposal → gate → promotion/rollback), Self-Evolving AI survey (Endure → Excel → Evolve hierarchy), ELL/StuLife (conservative promotion with rollback), failure-attribution as evolution prerequisite.

**Critical constraint:** agents do not directly rewrite prompts, skills, topologies, or routing rules. They propose changes. Humans approve changes that affect production behavior.

---

## When to Use Workflow E

✅ Use when:
- The **same failure category** (from the 12-category taxonomy) appears in **3+ postmortems** within 30 days
- A recurring workflow issue (same agent misconfiguration, same review failure pattern, same context failure) has been documented across multiple runs
- An identified prompt wording or skill instruction is measurably causing agent failures
- Difficulty routing is sending tasks to the wrong workflow tier consistently
- Context-pruning policy is discarding critical information repeatedly
- A pattern that Workflow D cannot fix (root cause is the instructions, not the code)

❌ Do not use for:
- One-time failures (use failure-attribution within Workflow D)
- Code bugs that belong in the source repository (use Workflow A/B/C)
- Personal preference changes without evidence

---

## Endure → Excel → Evolve Gate Order

Every proposed change must pass gates in strict order. **Do not skip gates.**

```
Gate 1: ENDURE — Safety preserved?
  ✓ No new safety risks introduced
  ✓ No protected paths affected
  ✓ No destructive shell commands unlocked
  ✓ Security boundaries unchanged
  ✓ Extension permissions unchanged
  → FAIL: reject proposal regardless of performance gain

Gate 2: EXCEL — Performance preserved or improved?
  ✓ Task completion rate not degraded on regression test suite
  ✓ Validation pass rate stable or improving
  ✓ No cost regression (tokens per task not significantly increased)
  ✓ No new failure categories introduced
  → FAIL: return proposal for revision; do not promote

Gate 3: EVOLVE — Autonomous promotion justified?
  ✓ Gates 1 and 2 both pass
  ✓ Human approval obtained (or owner confirmed for low-risk changes)
  ✓ Rollback plan exists and is documented
  ✓ Staged rollout path defined
  → PASS: promote with monitoring
```

**This is not optional.** The self-evolving agents survey (2508.07407v2) documents that systems which bypass safety and performance checks in the name of "progress" produce unsafe and degraded behavior.

---

## Step 1 — Trace Audit

Identify the evidence base for the proposed improvement.

```
Spawn evolution-auditor agent:
  Task: "Audit run traces to identify systemic failure pattern"
  Inputs:
    - .pi/runs/*/failure-attribution.json  (last 30 days)
    - .pi/runs/*/attempt-summary.json      (last 30 days)
    - .pi/mas-traces/trace-log.jsonl        (structural events)
  Output: .pi/runs/<run-id>/trace-audit.md
  Constraints: read-only; must cite specific run IDs and artifacts
  Budget: 15,000 tokens max
```

**Trace audit must identify:**
- Which failure category recurs (use 12-category taxonomy)
- Exact run IDs and artifact references for each occurrence
- Is this category-level (many instances) or mechanism-level (specific bug)?
- Frequency and trend: getting worse, stable, or improving?
- Which system artifact (prompt wording, skill instruction, topology rule, routing threshold) is the proximate cause?

**Threshold for proceeding:** 3+ documented occurrences of the same category within 30 days, OR 2+ occurrences of the same specific mechanism. Below threshold: log the observation but do not propose evolution yet.

---

## Step 2 — Failure Attribution

Run targeted attribution on the identified pattern.

```
Spawn failure-attributor agent:
  Task: "Attribute the systemic failure: <failure category>"
  Inputs: trace audit findings + linked attempt summaries + linked source artifacts
  Output: .pi/runs/<run-id>/systemic-attribution.json
  Skill: failure-attribution
  Constraints: read-only; cite evidence for every claim
  Budget: 12,000 tokens max
```

Attribution must produce:
- **Primary artifact type:** prompt | skill | topology | memory_policy | routing_rule | tool_description | agent_contract
- **Specific artifact path:** which exact file, section, or rule is the cause
- **Mechanism:** how the artifact causes the failure (step-by-step propagation)
- **Evidence:** command outputs, test failures, or specific text in the artifact
- **Proposed change type:** wording | logic | threshold | new entry | deletion

---

## Step 3 — Improvement Proposal

Invoke the **`evolution-proposal` skill** to draft the candidate change.

```
Invoke skill: evolution-proposal
Inputs:
  - systemic-attribution.json
  - The artifact(s) identified as root cause
  - Trace audit report

Output: .pi/runs/<run-id>/evolution-proposal.md
```

**Evolution proposal must include:**

```markdown
## Evolution Proposal

**ID:** evo-<timestamp>-<slug>
**Artifact type:** prompt | skill | agent | topology | memory_policy | tool_description
**Target artifact:** <path to the file being changed>
**Source evidence:** [list of run IDs and postmortem IDs]

### Problem
<one paragraph: what currently happens, with evidence>

### Root cause
<attribution result: which text/rule/threshold causes it>

### Proposed change
<exact diff — what the artifact looks like before vs. after>

### Expected outcome
<what should happen differently after the change, measurable>

### Test cases for verification
<list of holdout tasks or curriculum cases that should improve>

### Regression constraints
<what must NOT change — which existing passing behaviors must be preserved>

### Rollback plan
<exact steps to revert if the change causes regression>

### Owner
<who is responsible for monitoring this change post-promotion>
```

**Evolvable artifact classes and required approval level:**

| Artifact | Autonomy level | Gate required |
|---|---|---|
| Episode summaries / negative lessons | Automatic write | Schema validation + provenance |
| Memory facts / decisions | Proposal | Source citation, scope, confidence |
| Skills / playbooks | Proposal | Examples, validation evidence, owner approval |
| Prompt / agent instructions | Proposal | Diff + holdout evaluation + anti-conflict check + **human approval** |
| Topology / routing rules | Proposal | Baseline comparison + cost/safety review + **human approval** |
| Tool descriptions | Proposal | Schema/tool-call regression checks |
| New tools / extensions / permissions | **Human-approved only** | Security review + sandboxing + least-privilege audit |

---

## Step 4 — Safety Gate (Endure)

Before human review, run automated safety check via **evolution-governor extension**.

```
Use: propose_evolution tool (evolution-governor extension)

propose_evolution({
  artifact_type: "<from proposal>",
  artifact_path: "<target file>",
  proposed_diff: "<exact diff>",
  evidence: ["<run-id-1>", "<run-id-2>", ...],
  expected_outcome: "<what should improve>",
  test_cases: ["<curriculum case IDs>"],
  rollback_plan: "<exact revert steps>"
})
```

**The evolution-governor enforces Endure gate automatically:**
- Checks if the artifact path is in a high-risk protected path
- Checks if the change introduces new permissions or destructive capabilities
- Blocks changes to `.pi/extensions/`, `settings.json`, protected paths without `security_override`
- Returns `endure_gate: pass | fail` with specific blocking reasons

If `endure_gate: fail` → **stop here**. Revise the proposal to address the safety issue or escalate to human with explicit security review request.

---

## Step 5 — Performance Gate (Excel)

After safety gate passes, evaluate whether the change improves or preserves performance.

```
Spawn evolution-auditor agent for performance review:
  Task: "Evaluate whether proposed change passes Excel gate"
  Inputs:
    - evolution-proposal.md
    - Baseline metrics from .pi/mas-traces/ (success rate, cost per task, validation pass rate)
    - Curriculum cases identified in proposal
  Output: .pi/runs/<run-id>/excel-gate-review.md
  Constraints: read-only
  Budget: 12,000 tokens max
```

**Excel gate criteria:**
- [ ] Estimated improvement in the failing category (based on logical analysis of the change)
- [ ] No degradation expected in currently-passing task classes
- [ ] Cost per task neutral or improved
- [ ] No new failure categories introduced by the wording change
- [ ] Regression constraints from proposal are satisfiable

**Using judge agent for evaluation** (recommended for prompt/skill changes):
```
Spawn judge agent:
  Task: "Evaluate this proposed change: does version B (proposed) handle the
    attributed failure case better than version A (current)?"
  Model: MUST be different family from the main generator
  Protocol: plan→execute→verdict + position-swap
  Input: (A) current artifact text + failing case, (B) proposed artifact text + same case
  Output: pairwise verdict with rationale
```

If `excel_gate: fail` → revise proposal and return to Step 3.

---

## Step 6 — Human Approval

For any change to prompt/agent instructions, topology, or routing rules, human approval is required.

Present to the human:

```markdown
## Evolution Proposal for Review

**What is changing:** <one sentence>
**Why it is needed:** <evidence summary — N failures in last 30 days>
**What it changes:** <exact diff>
**What it preserves:** <regression constraints>
**Safety gate:** PASS ✅
**Performance gate:** PASS ✅
**Rollback plan:** <revert steps>

**Decision required:** Approve / Reject / Request revision
```

**Human can:**
- ✅ Approve → proceed to Step 7
- ❌ Reject → log reason; close proposal; create negative memory entry
- 🔄 Request revision → return to Step 3 with feedback

If the change is to episode summaries, memory facts, or low-risk heuristics (as defined in the autonomy table above), owner confirmation via audit log may substitute for interactive approval. All other changes require explicit human decision.

---

## Step 7 — Staged Rollout and Verification

After human approval, promote the change with staged rollout.

```
Staged rollout process:
  1. Apply change to artifact (using propose_evolution tool — approval_override: true)
  2. Run holdout evaluation tasks from proposal:
     - Apply the changed artifact to curriculum cases
     - Compare outcomes vs. baseline (before change)
     - Record: improvement rate, regression rate, cost delta
  3. Monitor for 3+ runs before declaring fully promoted
```

**Verification pass criteria:**
- Failing case category improves (solve rate increases by ≥10 pp on affected cases)
- No new failures in regression curriculum cases
- Cost per task neutral (within ±15%)
- No safety flags in first 3 runs under new artifact

---

## Step 8 — Promote or Rollback

**If verification passes:**
```
evolution-governor promotes artifact to status: validated
Log entry: evo-<id> promoted — evidence: [run IDs] — owner: <owner>
```

**If verification fails:**
```
evolution-governor executes rollback:
  1. Revert artifact to pre-change version (from rollback plan)
  2. Log rollback: evo-<id> rolled back — reason: <specific regression>
  3. Store failed proposal as negative_lesson in typed memory
  4. Generate curriculum case from the regression for future evaluation
```

**Rollback is non-optional.** Every promoted change must have a tested rollback path. A proposal without a documented rollback plan is rejected at Step 3.

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| `trace-audit.md` | evolution-auditor | `.pi/runs/<id>/` |
| `systemic-attribution.json` | failure-attributor | `.pi/runs/<id>/` |
| `evolution-proposal.md` | evolution-auditor + skill | `.pi/runs/<id>/` |
| `endure-gate-result.json` | evolution-governor | `.pi/curricula/evolution-proposals/` |
| `excel-gate-review.md` | evolution-auditor | `.pi/runs/<id>/` |
| `promotion-log.jsonl` | evolution-governor | `.pi/curricula/evolution-log.jsonl` |
| Rollback plan | evolution-auditor | Included in proposal |
