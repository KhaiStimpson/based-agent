# AGENTS.md — Cross-Tool Agent Operating Contract

**System:** Research-Driven Pi Multi-Agent System (MAS)
**Version:** 1.0.0
**Date:** 2026-05-19
**Authority:** This file is the canonical operating contract for all agents, tools, extensions, and workflows in this repository. Tool-specific config files are thin adapters; this file is the truth source.

---

## 1. Project Overview

This repository implements a **research-driven multi-agent system for pi**, synthesizing findings from 18 academic papers on:

- Multi-agent collaboration and role specialization (AgentSpawn, AgentConductor, SEMA, SE Survey)
- Feature-level code generation and executable validation (FeatureBench)
- Empirical agentic tool configuration (2,853-repo GitHub study)
- Test-time compute scaling (RTV/PDR structured rollouts)
- Anti-bystander review protocols (22,500-trajectory bystander study)
- LIFE framework: attribution before evolution
- Self-evolving agent governance (Endure/Excel/Evolve laws)
- Lifelong learning with typed memory (ELL/StuLife — GPT-5 scores only 17.9/100 without structured memory)
- Curriculum-driven improvement from frontier tasks (Agent0)
- LLM-as-a-judge taxonomy and bias mitigation (5-bias-family survey)
- Self-preference contamination (GPT-4: 73.5% self-recognition out-of-box)
- Self-taught evaluators without human labels (75.4 → 88.7% RewardBench in 5 iterations)
- EvalPlanner: plan→execute→verdict beats fixed rubrics (93.9% RewardBench, 22K synthetic pairs)
- Contrastive pairwise judgment with verbal rationale (Con-J, ICLR 2025)

**Core value proposition:** Resolved outcomes per cost, not agent count, prompt length, or apparent consensus.

**What this system provides:**
- Fully featured MAS with dynamic spawning, typed memory, and skill lifecycle management
- Self-evolution via governed proposal → gate → promote/rollback pipelines
- LLM-as-a-judge evaluation with cross-model pairwise scoring and bias guards
- Curriculum-driven improvement from real trace failures
- Anti-bystander review protocol enforcing independence before aggregation

---

## 2. Architecture — 10 Core Principles

### Principle 1: Deterministic Supervisor
The pi supervisor owns task routing, budgets, trace logging, safety gates, topology validation, worktree isolation, and final adjudication. It never delegates orchestration authority to child agents.

### Principle 2: Small, Role-Specialized Agents
Agents are defined around real expertise and tool boundaries — not social roles ("CEO", "manager"). Each agent has a concrete input, output, tool set, and success metric. The 13 core agents are: `scout`, `researcher`, `planner`, `builder`, `reviewer`, `tester`, `debugger`, `summarizer`, `memory-curator`, `curriculum-generator`, `judge`, `failure-attributor`, `evolution-auditor`.

### Principle 3: AGENTS.md as Shared Config Core
This file is the cross-tool contract. Tool-specific files (`.cursor/rules`, `CLAUDE.md`, etc.) must reference or adapt this file — never duplicate and drift. The 2,853-repo empirical study confirms that context files dominate and `AGENTS.md` is the emerging cross-tool convention.

### Principle 4: Dynamic Spawning (AgentSpawn)
Spawn child agents only when the runtime spawn score `sspawn ≥ 0.7`. Spawning is triggered by complexity evidence, not convenience. Max depth: 3. Max concurrent: 4. Every spawn requires a Spawn Package; every child returns a Resume Package.

### Principle 5: Topology as Data (AgentConductor)
Workflows are schema-validated DAGs, not free-form group chats. Topology is difficulty-aware: a 3B-parameter topology-aware orchestrator (AgentConductor) outperformed larger models by 14.6 pp on APPS with 68% fewer tokens. Use the simplest topology that can succeed.

### Principle 6: Context Pruning (SEMA)
SEMA's structural-entropy pruning cut tokens by 70% and latency by 50% vs. HIMA. All agent calls receive curated context, not raw logs. Memory retrieval uses typed stores; naive RAG over raw transcripts actively degrades performance (Vanilla RAG fell below the no-memory baseline in StuLife).

### Principle 7: Test-Time Scaling (RTV/PDR)
For high-value tasks: run small parallel attempts, emit structured rollout summaries, select via Recursive Tournament Voting, refine with Parallel-Distill-Refine on top 2–4 summaries. Summaries are the scaling substrate, not raw traces.

### Principle 8: Anti-Bystander Review
Cap routine review to 2 validators. Run them in independent sessions. No peer output visible during first pass. Aggregate by evidence quality, not vote count. Preserve minority high-severity findings until disproven. GPT-5.4 collapses at n=2 auditors; never prompt with "other agents agreed."

### Principle 9: LIFE Self-Evolution Loop
Trace → Attribution → Proposal → Safety Gate → Regression Gate → Human Approval (when required) → Staged Rollout → Monitoring → Rollback. Never let agents self-modify based only on final success/failure — structured attribution is the prerequisite.

### Principle 10: Self-Improving Cross-Model Judge
The judge agent must use a **different model family** from the generator. Self-preference is linearly correlated with self-recognition capability (GPT-4: 73.5% out-of-box). The judge uses plan→execute→verdict (EvalPlanner) with mandatory position-swap verification. The judge self-improves from accumulated trace-derived preference pairs without human annotation (Self-Taught Evaluators principle).

---

## 3. Required Validation Commands

Before any task is considered **done**, the following ladder must pass. If a command is unavailable, document why in the attempt summary artifact.

```bash
# 1. Syntax check (adjust for language)
npx tsc --noEmit                   # TypeScript
python -m py_compile <file>        # Python
node --check <file>                # JavaScript

# 2. Linting
npx eslint .                       # JS/TS
ruff check .                       # Python

# 3. Tests (run project tests if available)
npm test                           # Node.js
pytest                             # Python
cargo test                         # Rust

# 4. JSON/YAML structure validation
node -e "JSON.parse(require('fs').readFileSync('<file>'))"
python -c "import yaml; yaml.safe_load(open('<file>'))"

# 5. AGENTS.md / settings.json / schema validation
# See config-linter extension

# 6. Security gate check
# See safety-gate extension
```

**Zero-tolerance rule:** A task with available validation commands that does not pass all of them is NOT done, regardless of agent confidence or apparent correctness.

---

## 4. Agent Workflow Rules

### 4.1 Read Before Edit
Every agent that touches a file must first read its current state. No guessing interfaces, signatures, or import paths. The scout agent is responsible for producing a repository context artifact before any planner or builder runs.

**Failure mode prevented:** NameError/TypeError/AttributeError from guessed cross-file interfaces (FeatureBench top failure categories).

### 4.2 Scout Before Build
For any non-trivial task (difficulty score ≥ 3), run the scout agent first. Output: `context.md` with relevant files, commands, architecture notes, and risks. The planner uses this artifact as input.

### 4.3 One Writer at a Time
Default policy: only the `builder` agent writes to the main workspace. All other agents are read-only or write to isolated artifacts. Concurrent write attempts require worktree isolation (worktree-manager extension) and a coherence manager.

### 4.4 Independent Review Phases
Reviewer and tester run in separate sessions before seeing each other's output. They receive the same task context but not each other's findings. The review-aggregator shuffles and anonymizes outputs before synthesis.

### 4.5 No Majority Voting on Review
Disagreement between reviewer and tester triggers targeted validation or human escalation — not a majority vote. One reproducible blocker is sufficient to block. Evidence quality outranks vote count.

### 4.6 Structured Handoff Artifacts
Agent communication flows through typed artifacts stored in `.pi/runs/<run-id>/`:

| Artifact | Producer | Consumer |
|---|---|---|
| `context.md` | scout | planner, builder |
| `external-evidence.md` | researcher | planner |
| `plan.md` | planner | builder |
| `diff.patch` or files | builder | reviewer, tester |
| `validation.md` | tester | review-aggregator |
| `review-findings.json` | reviewer | review-aggregator |
| `attempt-summary.json` | summarizer | selection/refinement/memory |
| `failure-attribution.json` | failure-attributor | evolution-governor, planner |
| `evolution-proposal.md` | evolution-auditor | evolution-governor, human |
| `spawn-package.json` | supervisor | child agent |
| `resume-package.json` | child agent | supervisor |

### 4.7 Attempt Summaries Are Mandatory
After every meaningful attempt, emit a structured attempt summary. See Section 9 (Memory Policy) for the schema. Summaries feed selection (RTV), refinement (PDR), failure attribution, memory, and curriculum generation.

### 4.8 Evidence Over Opinion
A finding is strong when it cites: exact file/line, exact command and exit code, test output, API documentation, or reproducible environment state. A finding that says "likely," "seems," "consensus," or "another agent found" without evidence is weak and should be flagged.

---

## 5. Safety Boundaries

### 5.1 Protected Paths — Never Write Without Explicit Authorization
```
.pi/evals/judge-corpus/     # requires schema validation before write
.pi/memory/                 # memory-curator agent only; unauthorized deletion blocked
.pi/skills/                 # validated skill proposals only; no direct write
AGENTS.md                   # human-approved changes only
```

### 5.2 Destructive Command Gate
Never run the following without explicit confirmation from the human operator:
```
rm -rf, git reset --hard, DROP TABLE, truncate, format, wipefs
DELETE without WHERE clause, overwrite of non-artifact config files
```
The safety-gate extension enforces this at the tool level.

### 5.3 Judge Corpus Integrity
`.pi/evals/judge-corpus/` entries must validate against the preference pair schema before write. The judge-evolution extension enforces schema validation. Entries without `position_consistent: true` and a `judge_model_family` different from `generator_model_family` are rejected.

### 5.4 Memory Deletion Policy
Memory items in `.pi/memory/` may only be:
- **Deprecated** by the memory-curator agent (status: deprecated)
- **Contradicted** by the memory-curator agent (status: contradicted)
- **Hard-deleted** with human approval when the item is confirmed harmful or malformed

Bulk deletion of memory items is prohibited without human sign-off.

### 5.5 Extension Security
Extensions execute with system permissions. New extensions require: security review, sandboxing analysis, least-privilege audit, rollback plan, and human approval. Skills that instruct dangerous shell commands require explicit review.

### 5.6 Self-Evolution Containment
Agents may not directly rewrite: production prompts, AGENTS.md, skills, routing rules, topology templates, or extension code. All changes must follow the proposal → gate → promote pipeline (Section 11).

---

## 6. Escalation Conditions

Escalate to the human operator immediately when any of these conditions are met:

| Condition | Why |
|---|---|
| **Unknown codebase topology** | Scout found no clear entry points, dependency graph is ambiguous, or codebase uses unfamiliar architecture patterns. |
| **Security risk detected** | Safety gate triggered; proposed change touches credentials, network permissions, sandbox policy, or sensitive files. |
| **Conflicting requirements** | User instructions contradict existing tests, architecture, safety boundaries, or AGENTS.md constraints. |
| **Budget exceeded** | Token budget, wall-clock time, or spawn count exceeded thresholds without task completion. |
| **Validation gate failure × 3** | Three successive attempts fail the same validation command. Indicates systemic misunderstanding, environment issue, or spec ambiguity. |
| **Ambiguous merge** | Two agents produced conflicting patches with no deterministic resolution path. |
| **Self-evolution proposal with safety regression** | Evolution-auditor detected any safety, cost, or regression gate failure in a proposed change. |
| **Judge calibration drift** | Judge position-consistency rate fell below 80% or known-pair accuracy fell below 85%. |
| **Memory poisoning suspected** | Retrieved memory led to two successive tool or approach failures. |

---

## 7. Spawn Policy

### 7.1 Spawn Score Formula (AgentSpawn, Table 1 and Figure 3)

```
sspawn = 0.30 * norm(If)   # file interdependency count
       + 0.20 * norm(Cc)   # max cyclomatic complexity of modified functions
       + 0.25 * norm(Fc)   # test failure cascade count
       + 0.15 * norm(Oc)   # context window saturation fraction
       + 0.10 * norm(Uc)   # agent uncertainty (from logprobs or self-consistency)
```

All inputs are normalized to [0, 1]. The five factors above are from the AgentSpawn paper (exact weights). Additional pi-specific factors that may augment the policy (not from the paper):

- `domain_specialization_need` — requires skills or knowledge outside parent's context
- `parallelizable_hypotheses` — two or more independent solution strategies worth exploring
- `expected_value_vs_cost` — estimated improvement ÷ estimated token/time cost

### 7.2 Thresholds and Limits

| Parameter | Value |
|---|---|
| Spawn threshold | `sspawn ≥ 0.7` |
| Max spawn depth | 3 (parent → child → grandchild) |
| Max concurrent children | 4 |
| Never spawn for | Social proof, consensus checking, or when the parent can complete the task |

### 7.3 Spawn Package Schema

Every spawned child receives:
```json
{
  "task": "bounded, specific subtask description",
  "role": "tester | reviewer | researcher | refactorer | debugger",
  "constraints": ["list of hard constraints"],
  "memory_slice_refs": ["artifact ids, file paths, episode summaries"],
  "allowed_tools": ["read", "bash"],
  "budget": { "tokens": 20000, "wall_minutes": 15 },
  "success_criteria": ["specific, verifiable output contract"],
  "merge_policy": "advisory | patch_proposal | isolated_worktree_diff"
}
```

### 7.4 Resume Package Schema

Every child returns:
```json
{
  "status": "success | partial | failed | blocked",
  "findings": [],
  "files_read": [],
  "files_changed": [],
  "commands_run": [],
  "tests": { "passed": [], "failed": [] },
  "summary": "compact reusable result (≤300 tokens)",
  "risks": [],
  "recommended_next_step": "..."
}
```

### 7.5 Spawn Never Happens For
- Checking if another agent agrees (social proof)
- Tasks the parent can complete within budget
- Situations where merge conflicts would be unresolvable
- Any spawn that would exceed depth or concurrency limits

---

## 8. Judge Protocol

### 8.1 Cross-Model Hard Constraint
**The judge must use a different model family from the agent that produced the candidates being evaluated.** This is an architectural constraint, not a style preference. Self-preference is linearly correlated with self-recognition (GPT-4: 73.5% out-of-box self-recognition; fine-tuning to near-perfect recognition makes self-preference near-total).

| Generator family | Required judge family |
|---|---|
| Claude (Anthropic) | Gemini (Google) or GPT (OpenAI) |
| GPT (OpenAI) | Claude or Gemini |
| Gemini (Google) | Claude or GPT |

### 8.2 Plan → Execute → Verdict Protocol (EvalPlanner)

1. **Plan:** Generate an unconstrained, task-adaptive evaluation plan specifying:
   - What to check and how to verify it
   - What a reference answer looks like (derived step-by-step)
   - Which criteria are objective vs. subjective
   - What edge cases to test
   - Anti-bias instructions (no identity, no length preference)

2. **Execute:** Follow the plan step-by-step against both candidates. Cite specific evidence from files, commands, test output, or memory for each step.

3. **Verdict:** Pairwise preference with rationale in structured JSON:
   ```json
   {
     "plan": "...",
     "execution": "step-by-step evidence ...",
     "verdict": "A | B | tie",
     "rationale": "evidence-based explanation",
     "position_consistent": true,
     "confidence": "high | medium | low"
   }
   ```

### 8.3 Mandatory Anti-Bias Guards

| Guard | Implementation |
|---|---|
| **Position swap** | Run judgment twice with candidates in reversed order. Accept ONLY verdicts consistent across both orderings. Discard and regenerate if verdict flips. |
| **Identity strip** | Remove model names, author attribution, formatting decorations, and length signals before the judge sees candidates. |
| **Pairwise over scalar** | Use relative comparison (A vs. B), not absolute numeric scores. |
| **Anti-verbosity instruction** | Explicit instruction in every judge call: "Do not prefer outputs based on length, formatting, or stylistic elaboration." |
| **Majority vote for promotions** | High-stakes promotion decisions use 3+ independent judge samples. |

### 8.4 Judge Calibration Targets

| Metric | Target | Action if missed |
|---|---|---|
| Position-consistency rate | ≥ 80% | Trigger Workflow G: update judge evaluation plans |
| Inter-run stability (identical inputs) | ≥ 90% | Lower judge temperature; check prompt ambiguity |
| Known-pair accuracy | ≥ 85% | Expand rejection-sampling corpus |
| Verbosity-bias rate | < 5% | Strengthen anti-verbosity instruction |
| Human spot-check agreement | Track trend | Investigate systematic deviations |

### 8.5 Preference Pair Schema (`.pi/evals/judge-corpus/`)

```yaml
type: preference_pair
task_type: coding | skill_proposal | memory_update | topology | evolution_proposal
winner: A | B
rationale: "evidence-based explanation"
position_consistent: true
judge_model_family: gemini | gpt | claude
generator_model_family: claude | gpt | gemini
confidence: high | medium
trace_ref: "run-id or artifact ref"
created_at: "ISO 8601"
```

Items without `position_consistent: true` are NEVER written to the corpus.

---

## 9. Memory Policy

### 9.1 Typed Memory — Never Use Raw Chat History

The following memory types are maintained in `.pi/memory/`. Raw conversation history is NOT retrieved for general task use (naive RAG over raw transcripts actively degrades performance — Vanilla RAG StuGPA: 10.98, below the no-memory baseline in StuLife).

| Memory Type | Purpose | Retention |
|---|---|---|
| **Working** | Current task goal, plan, changed files, open blockers | Short-lived (task scope) |
| **Episodic** | Summarized run traces, failures, repairs, outcomes | Long-lived, compressed |
| **Declarative** | Stable project facts, API constraints, user decisions, commands | Updated with provenance |
| **Structural** | File/module/tool/agent relationships, dependency graph | Updated when architecture changes |
| **Procedural** | Reusable skills, playbooks, validated topologies | Promoted after validation |
| **Prospective** | Future obligations: pending tests, follow-ups, deferred cleanup | With execution context and triggers |
| **Negative** | Known failed approaches, unsafe patterns, traps *(pi-specific extension)* | Retained as anti-patterns |

### 9.2 Memory Item Schema

```yaml
id: "unique-id"
type: fact | decision | skill | heuristic | episode | reminder | negative_lesson
scope: repo | project | user | global
status: provisional | validated | deprecated | contradicted
source: file | command | user | episode | external
salience: novel | constraint | future-critical | failure-linked | preference | validation-linked
created_at: "ISO 8601"
last_validated_at: "ISO 8601"
confidence: low | medium | high
content: "..."
provenance: "file path, line, command, or episode ref"
```

### 9.3 Memory Operations (memory-curator agent only)

- **Add:** Save new validated facts, lessons, failures, or obligations with full provenance
- **Update:** Revise when source files, configs, tools, or user preferences change
- **Deprecate:** Mark obsolete information (status: deprecated) — do not silently delete
- **Contradict:** Flag when new evidence opposes an existing item (status: contradicted)
- **Combine:** Merge repeated lessons into one skill or rule
- **Validate:** Periodically check whether retrieved memory improves outcomes

### 9.4 Retrieval Priority Order

1. Structural (dependency graph, file relationships) — highest relevance to task
2. Declarative (facts, decisions, commands) — project-specific ground truth
3. Procedural (skills, playbooks) — if task matches known workflow
4. Negative (anti-patterns) — check before planning
5. Episodic (past runs) — for pattern matching on similar tasks
6. Prospective (agenda items) — check for open obligations at task end

### 9.5 Prospective Memory Requirements

A prospective item is NOT adequate as a vague reminder. It must include:
- Trigger condition (when to act)
- Why it matters (consequence of missing)
- Required files and commands
- Success criteria
- Deadline or staleness threshold

---

## 10. Endure → Excel → Evolve

This hierarchy governs every self-evolution decision:

```
1. ENDURE   → Preserve safety and stability.
              Gate: No new security risks, no protected-path violations,
                    no destructive-command exposure.

2. EXCEL    → Preserve or improve task performance under safety constraints.
              Gate: No test regressions, no cost blowout, no workflow
                    degradation on held-out evaluation tasks.

3. EVOLVE   → Autonomously optimize only after safety and performance gates pass.
              Gate: Human approval for broad-scope changes; evolution-auditor
                    review for all changes; rollback plan required.
```

**Safety first. Performance second. Autonomy third.**

A proposed change that passes safety but causes a regression **does not promote**. A change that passes both safety and regression gates but lacks a rollback plan **does not promote**. Endure is non-negotiable.

---

## 11. Self-Evolution Governance

### 11.1 Evolvable Artifact Classes

| Artifact | Autonomy Level | Required Gates |
|---|---|---|
| Episode summaries, negative lessons | Automatic write | Schema validation, provenance citation |
| Memory facts/decisions | Automatic if directly evidenced | Source citation, scope, confidence, deprecation path |
| Skills/playbooks | Proposal required | Examples, preconditions, validation evidence, owner approval for broad scope |
| Prompt/agent instructions | Proposal required | Diff, holdout evaluation, anti-conflict check, rollback |
| Topology/routing rules | Proposal required | Comparison vs. baseline on task classes, cost and safety review |
| Tool descriptions | Proposal required | Schema/tool-call regression checks |
| New tools/extensions/permissions | Human approval required | Security review, sandboxing, rollback, least privilege |

### 11.2 Skill Promotion Ladder

```
raw trace
  → episode summary
  → lesson (negative or positive)
  → provisional skill
  → validated skill (tested on ≥2 independent tasks)
  → project policy / test / hook
  → optional eval data or fine-tuning input
```

Critical rules that agents repeatedly miss must become deterministic gates or tests — not additional reminders in prompts.

### 11.3 Curriculum Loop

```
trace corpus + known failures
  → curriculum-generator proposes challenge cases (difficulty ≈ 0.5 self-consistency band)
  → current workflow attempts them with tools/tests
  → frontier filter: select informative cases (neither trivially solved nor impossible)
  → judge evaluates pairwise: new behaviour vs. baseline
       - different model family from generator
       - plan → execute → verdict with position-consistency check
       - majority vote (3+ samples) for promotion decisions
  → evolution-governor proposes bounded changes
  → safety/regression/cost gates decide promotion
```

---

## 12. Difficulty Routing Table

| Score | Workflow |
|---|---|
| 0–2 | **Workflow A:** Single agent → validate → summary |
| 3–5 | **Workflow B:** Scout → plan → build → independent review/test |
| 6–8 | **Workflow C:** Parallel scout/research → plan → build (worktree) → tester/debugger → reviewer/tester → final validation |
| 9+ | **Workflow C+:** Full pipeline + worktrees + failure-attribution + human checkpoints |
| Repeated failure | **Workflow D:** Attempt summaries → attribution → select evidence → refined attempt |
| Self-evolution trigger | **Workflow E:** Trace audit → attribution → proposal → approval → verify → promote/rollback |
| Lifelong learning trigger | **Workflow F:** Run trace → episode → typed memory/skill → curriculum → holdout eval → promote |
| Judge calibration drift | **Workflow G:** Trace pairs → judge plans → position-swap filter → corpus → rejection-sample → update judge plans |

---

## 13. Failure Taxonomy

Every failed run must be attributed to exactly one primary category:

| Category | Examples | Repair Path |
|---|---|---|
| Spec failure | Ambiguous requirements, missing interface | Ask user, write executable spec |
| Context failure | Missed files, wrong API, stale docs | Improve scout/memory retrieval |
| Planning failure | Bad decomposition, missing validation | Revise plan template/topology |
| Tool failure | Wrong command, schema hallucination, env issue | Tool schema validation, environment docs |
| Implementation failure | Syntax, cross-file dependency, semantic bug | Builder fix, targeted tests |
| Verification failure | Tests not run, wrong tests, flaky tests | Validation gate update |
| Review failure | False positive/negative, anchoring | Review prompt/aggregation update |
| Communication failure | Bad handoff, lost assumption | Artifact schema update |
| Memory failure | Stale or irrelevant memory retrieved | Memory decay/reranking |
| Merge/coherence failure | Conflicting edits, partial patch | Worktree/coherence policy |
| Budget failure | Too many tokens/time/agents | Routing/topology caps |
| Safety failure | Destructive command, sensitive file | Safety gate extension |

---

## 14. Key Metric Targets

| Metric | Target |
|---|---|
| All-checks-pass rate | ≥ 90% |
| Judge position-consistency | ≥ 80% |
| Judge known-pair accuracy | ≥ 85% |
| Memory retrieval usefulness | Tracked per run |
| Useful child contribution rate | ≥ 70% of spawns |
| Spawn depth exceeded | 0 (hard limit) |
| Rollback rate | < 10% of promoted changes |
| Verbosity-bias rate in judge | < 5% |

---

## 15. Quick Reference

```
Before editing:      READ the file first.
Before building:     SCOUT the repository.
Before reviewing:    RUN independently; no peer output visible.
Before evolving:     ATTRIBUTE the failure first.
Before spawning:     COMPUTE sspawn; only spawn if ≥ 0.7.
Before judging:      USE a different model family; strip identity; position-swap.
Before promoting:    PASS Endure → Excel → Evolve gates.
Before deleting:     DEPRECATE instead; hard-delete requires human approval.
```

---

*This AGENTS.md is governed by the self-evolution policy in Section 11. Changes require: diff, holdout evaluation, anti-conflict check, rollback plan, and human approval.*
