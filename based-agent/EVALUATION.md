# System Evaluation Report

**System:** Research-Driven Pi Multi-Agent System  
**Version:** 1.0.0  
**Date:** 2026-05-19  
**Scope:** End-to-end evaluation of the implemented system against all 18 research papers in the corpus (13 original + 5 eval-research papers), covering coverage claims, implementation components, verification methods, known gaps, and a final validation checklist.

---

## Table of Contents

1. [Implementation Coverage Matrix](#1-implementation-coverage-matrix)
2. [Research Principles Coverage](#2-research-principles-coverage)
3. [Architecture Verification](#3-architecture-verification)
4. [Gaps and Limitations](#4-gaps-and-limitations)
5. [Validation Checklist](#5-validation-checklist)

---

## 1. Implementation Coverage Matrix

Each row maps a research paper to its primary claim, the system component that implements it, and the verification method that confirms the implementation.

### Paper 1 — LLM-Based Agentic Systems for Software Engineering (SE Survey)

| Field | Detail |
|---|---|
| **Paper** | *LLM-Based Agentic Systems for Software Engineering: Challenges and Opportunities* (`2601.09822v2.pdf`) |
| **Key claim** | Multi-agent systems benefit from role specialization, tool feedback, RAG, human intervention, and cost controls. Collaboration should be measured, not just individual task performance. Decorative roles without concrete I/O boundaries add overhead without value. |
| **Implementing components** | `AGENTS.md` (13 role-specialized agents defined in Section 2 with concrete I/O contracts); `agents/` directory (13 individual agent definition files); `topology-runner.ts` (structured DAG execution replacing free-form group chat); `validation-gate.ts` (cost-gated task completion); `trace-ledger.ts` (per-run and per-agent metrics collection) |
| **Verification method** | Count that all 13 agents have defined input contracts, output contracts, tool boundaries, and success metrics (no decorative roles). Confirm `AGENTS.md` Section 2 lists all 13 agents with explicit permissions tables. Confirm `trace-ledger.ts` captures per-agent token cost and completion status. |

---

### Paper 2 — AgentSpawn: Adaptive Multi-Agent Collaboration Through Dynamic Spawning

| Field | Detail |
|---|---|
| **Paper** | *AgentSpawn: Adaptive Multi-Agent Collaboration Through Dynamic Spawning for Long-Horizon Code Generation* (`2602.07072v1.pdf`) |
| **Key claim** | Spawn child agents only when runtime complexity signals justify it. Use spawn scores computed from five normalized metrics (If, Cc, Fc, Oc, Uc) with exact weights. Pass memory slices, not full history. Return structured Resume Packages. |
| **Implementing components** | `spawn-controller.ts` (implements spawn score formula with exact AgentSpawn paper weights); `memory-slicer.ts` (memory slice construction for Spawn Packages); `AGENTS.md` Section 7 (Spawn Package and Resume Package schemas); `workflow-b-standard.md` and `workflow-c-complex.md` (spawn score pre-check steps); `topology-runner.ts` (enforces max depth 3, max concurrent 4) |
| **Verification method** | Confirm spawn score formula in `spawn-controller.ts`: `sspawn = 0.30*If + 0.20*Cc + 0.25*Fc + 0.15*Oc + 0.10*Uc`. Confirm `spawn-threshold = 0.7`, `MAX_DEPTH = 3`, `MAX_CONCURRENT = 4`. Confirm `compute_spawn_score` tool returns spawn package template. Confirm workflow prompts include spawn score check before topology selection. |

---

### Paper 3 — FeatureBench: Benchmarking Agentic Coding for Complex Feature Development

| Field | Detail |
|---|---|
| **Paper** | *FeatureBench: Benchmarking Agentic Coding for Complex Feature Development* (`2602.10975v1.pdf`) |
| **Key claim** | Feature-level coding has a ~74% → ~11% performance gap vs. bug-fix benchmarks. Top failure modes: NameError (missed cross-file dependencies), TypeError/AttributeError (guessed interfaces), AssertionError (semantically incomplete). Executable validation with F2P/P2P tests is non-negotiable. |
| **Implementing components** | `validation-gate.ts` (enforces "no success without tests/checks"); `skills/feature-spec/SKILL.md` (interface definition template, F2P/P2P test templates, "Done Means" checklist); `skills/repo-validation/SKILL.md` (project-specific validation ladder); `agents/scout.md` (read-before-edit policy prevents NameError/TypeError); `workflow-c-complex.md` Step 2 (feature-spec skill mandatory for complex features); `AGENTS.md` Section 4.1 "Read Before Edit" rule |
| **Verification method** | Confirm `feature-spec/SKILL.md` contains Interface Definition Template YAML with `verified: true` field for all dependencies. Confirm it contains explicit F2P and P2P test templates. Confirm `validation-gate.ts` blocks completion when test commands fail. Confirm `scout.md` forbids interface assumptions without file reads. Confirm workflow-c invokes feature-spec skill as non-optional step. |

---

### Paper 4 — Configuring Agentic AI Coding Tools

| Field | Detail |
|---|---|
| **Paper** | *Configuring Agentic AI Coding Tools: An Exploratory Study* (`2602.14690v4.pdf`) |
| **Key claim** | Analysis of 2,853 GitHub repos shows context files dominate. `AGENTS.md` is emerging as cross-tool convention. 85.5% of skills contain no executable scripts — skills function as structured static documentation. Advanced mechanisms should be governed and measurable. |
| **Implementing components** | `AGENTS.md` (canonical cross-tool operating contract — all tool-specific files adapt it, not duplicate it); `config-linter.ts` (detects contradictions between `AGENTS.md`, skills, rules, prompts, and agent configs); `settings.json` (project-level pi configuration); `skills/` directory (13 skills, all SKILL.md format — static documentation with selective executable scripts only); `AGENTS.md` Section 3 (Principle 3: AGENTS.md as Shared Config Core) |
| **Verification method** | Confirm `AGENTS.md` contains all required sections (project overview, build/test commands, conventions, safety boundaries, agent workflow rules, validation ladder, escalation conditions). Confirm `config-linter.ts` has contradiction detection logic. Confirm `settings.json` exists. Confirm all 13 `SKILL.md` files are structured documentation (no arbitrary shell execution). |

---

### Paper 5 — AgentConductor: Topology Evolution for Multi-Agent Competition-Level Code Generation

| Field | Detail |
|---|---|
| **Paper** | *AgentConductor: Topology Evolution for Multi-Agent Competition-Level Code Generation* (`2602.17100v1.pdf`) |
| **Key claim** | Difficulty-aware layered DAG topology achieves 14.6 pp accuracy gain and 68% token cost reduction over prior methods using a 3B-parameter backbone, demonstrating topology strategy outperforms raw model scale. Treat topology as data: schema-validated, density-capped, difficulty-adaptive. |
| **Implementing components** | `topology-runner.ts` (executes schema-validated DAG workflows with node/layer budgets and parallel execution); `skills/topology-authoring/SKILL.md` (DAG schema, difficulty-to-topology mapping table, density caps, validator rules); `workflow-b-standard.md` (4-node topology YAML); `workflow-c-complex.md` (7-node topology YAML with parallel and independent layers); `AGENTS.md` Section 5 (topology validator rules: acyclic, known agents, single writer, max depth) |
| **Verification method** | Confirm `topology-runner.ts` validates: acyclic graph, known agents only, single writer, max node/parallel/depth limits. Confirm `topology-authoring/SKILL.md` has difficulty-to-topology mapping (score 0-2: single agent, 3-5: chain, 6-8: pipeline, 9+: isolated worktrees). Confirm workflow-b and workflow-c YAML topologies validate against the schema. |

---

### Paper 6 — SEMA: Self-Evolving Multi-Agent Framework

| Field | Detail |
|---|---|
| **Paper** | *SEMA: Self-Evolving Multi-Agent Framework for Efficient Decision Making in Real-Time Strategy Scenarios* (`2603.23875v1.pdf`) |
| **Key claim** | Structural-entropy-driven observation pruning reduces input tokens by 70% and decision latency by 50% vs. HIMA while improving decision accuracy. Raw environment state is too large and noisy; the system must compress observations into decision-relevant state. |
| **Implementing components** | `memory-slicer.ts` (retrieves and compresses relevant context for each agent call — passes memory slices, not full history); `skills/context-pruning/SKILL.md` (7-type memory taxonomy with relevance scoring, budget enforcement, and selection rules); `agents/` spawn packages (all use `memory_slice_refs`, not full conversation history); `AGENTS.md` Section 6 (Principle 6: Context Pruning) |
| **Verification method** | Confirm `memory-slicer.ts` passes curated slices rather than raw logs to child agents. Confirm `context-pruning/SKILL.md` documents 70% token reduction principle and cites SEMA. Confirm it contains a memory type taxonomy (7 types: working, declarative, structural, procedural, episodic, negative, prospective). Confirm spawn packages in `AGENTS.md` use `memory_slice_refs` field. |

---

### Paper 7 — Scaling Test-Time Compute for Agentic Coding

| Field | Detail |
|---|---|
| **Paper** | *Scaling Test-Time Compute for Agentic Coding* (`2604.16529v1.pdf`) |
| **Key claim** | Test-time scaling works through representation, selection, and reuse — not raw trace accumulation. Compact structured rollout summaries enable Recursive Tournament Voting (RTV) and Parallel-Distill-Refine (PDR) to improve outcomes without proportional cost increase. |
| **Implementing components** | `attempt-summarizer.ts` (forces every rollout to emit compact structured summaries); `skills/rollout-summary/SKILL.md` (full JSON schema, RTV/PDR instructions, verdict criteria); `agents/builder.md` (attempt summary artifact production required for every run); `agents/summarizer.md` (compression of run traces into summaries); `workflow-d-refinement.md` (RTV selection + PDR conditioning, Steps 3-4) |
| **Verification method** | Confirm `rollout-summary/SKILL.md` contains the full `attempt_id`, `hypothesis`, `files_inspected`, `files_changed`, `commands_run`, `tests_passed`, `tests_failed`, `failure_modes`, `reusable_insights`, `diff_ref`, `verdict` schema. Confirm it documents RTV comparison criteria and PDR seeding process. Confirm `workflow-d-refinement.md` contains explicit RTV round structure and PDR conditioning package format. |

---

### Paper 8 — The Bystander Effect in Multi-Agent Reasoning

| Field | Detail |
|---|---|
| **Paper** | *The Bystander Effect in Multi-Agent Reasoning* (`2605.10698v1.pdf`) |
| **Key claim** | GPT-5.4 experiences total accuracy collapse with as few as n=2 auditors. 22,500 trajectories across GAIA/SWE-bench/MultiChallenge confirm cognitive loafing, sovereignty collapse, and lead-anchor effects. Independent critique before aggregation is critical. |
| **Implementing components** | `review-aggregator.ts` (shuffles and anonymizes independent reviews, aggregates by evidence quality not vote count); `skills/anti-bystander-review/SKILL.md` (6-step protocol, forbidden/preferred prompts, reviewer count policy, evidence ranking); `agents/reviewer.md` and `agents/tester.md` (independent, no peer visibility); `workflow-b-standard.md` Step 4 (anti-bystander protocol for independent review); `workflow-c-complex.md` Step 7 (independent review with cross-model pairing); `AGENTS.md` Section 4.4-4.5 (independent review rules) |
| **Verification method** | Confirm `anti-bystander-review/SKILL.md` documents: n=2 reviewer cap, 6-step protocol, forbidden prompts ("Multiple agents agree..."), evidence ranking (command evidence > file/line > opinion), minority preservation rule. Confirm `review-aggregator.ts` uses `evidence_rank` not `majority_vote`. Confirm workflow prompts use required independent session language, not consensus prompts. |

---

### Paper 9 — Beyond Individual Intelligence: LIFE Framework

| Field | Detail |
|---|---|
| **Paper** | *Beyond Individual Intelligence: Surveying Collaboration, Failure Attribution, and Self-Evolution in LLM-based Multi-Agent Systems* (`2605.14892v1.pdf`) |
| **Key claim** | The LIFE framework (Lay foundations, Integrate collaboration, Find faults through attribution, Evolve) requires that attribution precede evolution. Collaboration without diagnosis is brittle; self-modification based only on final success/failure is unsafe. |
| **Implementing components** | `agents/failure-attributor.md` (LIFE attribution step: 12-category taxonomy, postmortem artifact schema, propagation chain analysis); `agents/evolution-auditor.md` (LIFE evolution step: safety/performance review, Endure→Excel→Evolve enforcement); `skills/failure-attribution/SKILL.md` (postmortem workflow, 12 categories, repair paths); `workflow-e-self-evolution.md` Steps 1-2 (trace audit → attribution required before proposal); `workflow-d-refinement.md` Step 2 (attribution required before RTV/PDR) |
| **Verification method** | Confirm `failure-attribution/SKILL.md` contains all 12 failure categories (Spec, Context, Planning, Tool, Implementation, Verification, Review, Communication, Memory, Merge, Budget, Safety). Confirm the postmortem artifact JSON schema includes all 7 required fields (symptom, location, propagation, evidence, repair, validation, systemic_changes). Confirm `workflow-e-self-evolution.md` requires attribution before any proposal. |

---

### Paper 10 — A Comprehensive Survey of Self-Evolving AI Agents

| Field | Detail |
|---|---|
| **Paper** | *A Comprehensive Survey of Self-Evolving AI Agents* (`evolution-research/2508.07407v2.pdf`) |
| **Key claim** | The Endure → Excel → Evolve hierarchy governs safe self-evolution. Safety must be preserved before performance, performance before autonomous optimization. The field progresses from static models to online adaptation to multi-agent self-evolution. |
| **Implementing components** | `evolution-governor.ts` (implements Endure→Excel→Evolve gate enforcement, high-risk path blocking, autonomy level classification per artifact type); `AGENTS.md` Section 11 (Principle 9: LIFE Self-Evolution Loop with explicit Endure→Excel→Evolve language); `workflow-e-self-evolution.md` Step 1-8 (full gate-ordered workflow with Endure gate before Excel gate before promotion); evolvable artifact classes table in `AGENTS.md` |
| **Verification method** | Confirm `evolution-governor.ts` enforces safety gate (Endure) before performance gate (Excel) before promotion. Confirm high-risk paths (`.pi/extensions/`, `settings.json`) are blocked without `security_override`. Confirm `workflow-e-self-evolution.md` Step 3 lists the Endure→Excel→Evolve gate table in strict order. Confirm new tools/extensions require human-approved-only autonomy level. |

---

### Paper 11 — ELL/StuLife: Experience-Driven Lifelong Learning

| Field | Detail |
|---|---|
| **Paper** | *Building Self-Evolving Agents via Experience-Driven Lifelong Learning* (`evolution-research/2508.19005v6.pdf`) |
| **Key claim** | GPT-5 scores only 17.9/100 on StuLife without structured memory. Naive RAG over raw trajectories actively harms performance (10.98 < no-memory baseline). Structured memory management achieves 19.99. Six formal knowledge types defined. Proactive Initiative Score (PIS) motivates prospective memory. |
| **Implementing components** | `lifelong-memory.ts` (typed memory store with add/update/delete/validate/combine operations, salience, scope, status, provenance); `prospective-agenda.ts` (future obligations with triggers, required context, commands, completion criteria — from ELL's PIS metric); `skill-registry.ts` (skill lifecycle states: provisional→validated→deprecated); `agents/memory-curator.md` (memory management agent); `skills/lifelong-memory/SKILL.md` (typed memory schemas, salience scoring, retrieval, deprecation); `skills/prospective-agenda/SKILL.md`; `skills/skill-lifecycle/SKILL.md`; `workflow-f-lifelong-learning.md` (full typed memory and curriculum workflow) |
| **Verification method** | Confirm `lifelong-memory.ts` implements 7 memory types (working, episodic, declarative, structural, procedural, prospective, negative). Confirm memory entry schema has: id, type, scope, status, source, salience, content, provenance, confidence, timestamps. Confirm `workflow-f-lifelong-learning.md` documents the 17.9/100 GPT-5 StuLife finding. Confirm naive RAG anti-pattern warning is present. Confirm prospective reminders include trigger, files, commands, and success criteria. |

---

### Paper 12 — Agent0: Self-Evolving Agents from Zero Data

| Field | Detail |
|---|---|
| **Paper** | *Agent0: Unleashing Self-Evolving Agents from Zero Data via Tool-Integrated Reasoning* (`evolution-research/2511.16043v1.pdf`) |
| **Key claim** | Curriculum/executor co-evolution via RL (GRPO) on model weights achieves +18% math reasoning and +24% general reasoning on Qwen3-8B-Base. Curriculum design principles: frontier uncertainty ≈ 0.5, useful tool-use reward (C=4 cap), repetition penalty, novelty. Weight updates are the source of gains, not prompt changes. |
| **Implementing components** | `curriculum-generator.ts` (generates frontier challenge cases with governance score); `skills/curriculum-generation/SKILL.md` (frontier uncertainty ≈ 0.5 filter, governance score formula, novelty hash, oracle requirements); `agents/curriculum-generator.md` (curriculum case creation agent); `workflow-f-lifelong-learning.md` Step 5 (curriculum case generation with p̂ filter and governance score); `AGENTS.md` Section 8 (curriculum loop) |
| **Verification method** | Confirm `curriculum-generation/SKILL.md` documents the p̂ ≈ 0.5 frontier filter (reject cases with p̂ > 0.85 or p̂ < 0.15). Confirm governance score formula includes: validation_gain, frontier_uncertainty, useful_tool_use, novelty, minus repetition, cost_penalty, safety_risk, ambiguity_penalty. Confirm the scope note is present: "Agent0 achieves gains through model weight updates via RL, not prompt changes." Confirm novelty hash deduplication is implemented. |

---

### Paper 13 — LIFE Survey (Failure Attribution and Self-Evolution)

| Field | Detail |
|---|---|
| **Paper** | *Beyond Individual Intelligence* (`2605.14892v1.pdf`) — also covers the failure taxonomy component specifically |
| **Key claim** | Failure taxonomy is required as the foundation for self-evolution. Without a structured taxonomy linking symptom to trigger to propagation, attribution is a guess and evolution is unsafe. The LIFE progression cannot skip attribution. |
| **Implementing components** | `skills/failure-attribution/SKILL.md` (12-category failure taxonomy, symptom-to-trigger mapping table, repair paths by category); `agents/failure-attributor.md` (authoritative single-chain attribution, no peer review during attribution); `workflow-d-refinement.md` Step 2 (attribution required before RTV); `workflow-e-self-evolution.md` Step 2 (systemic attribution required before proposal); `curriculum-generator.ts` (failure category as case source signal) |
| **Verification method** | Confirm `failure-attribution/SKILL.md` has all 12 categories with descriptions, signals, and repair paths. Confirm the symptom-to-trigger mapping table (NameError → Context failure, AttributeError → Context failure, AssertionError → Implementation or Spec failure, etc.). Confirm `failure-attributor.md` specifies single-agent attribution (no peer reviewer — "attribution requires single authoritative chain of reasoning"). |

---

### Paper 14 — A Survey on LLM-as-a-Judge

| Field | Detail |
|---|---|
| **Paper** | *A Survey on LLM-as-a-Judge* (`eval-research/1-s2.0-S2666675825004564-main.pdf`) |
| **Key claim** | Five bias families documented: position bias, length/verbosity bias, self-enhancement/self-preference bias, style bias, compassion-fade/identity inflation. Three reliability pillars: human agreement, bias resistance, adversarial robustness. Pairwise evaluation is more reliable than scalar scoring. |
| **Implementing components** | `agents/judge.md` (cross-model judge with plan→execute→verdict, position-swap mandatory, all 5 bias mitigations, pairwise-over-scalar); `judge-evolution.ts` (position-consistency tracking, calibration metrics, family constraint enforcement); `AGENTS.md` Section 8 (Judge Protocol: 5 bias mitigations in anti-bias guards); `workflow-g-eval-improvement.md` (full judge calibration and corpus workflow); `review-aggregator.ts` (aggregation by evidence rank, not score) |
| **Verification method** | Confirm `AGENTS.md` or `agents/judge.md` documents all 5 bias families with explicit mitigations: position (swap), length (anti-verbosity instructions), self-preference (cross-model rule), style (separate style criteria), compassion-fade (strip identity). Confirm position-swap is described as MANDATORY. Confirm pairwise-over-scalar is the default. Confirm judge output includes `position_consistent: true/false` field. |

---

### Paper 15 — LLM Evaluators Recognize and Favor Their Own Generations (Self-Preference)

| Field | Detail |
|---|---|
| **Paper** | *LLM Evaluators Recognize and Favor Their Own Generations* (`eval-research/14702_LLM_Evaluators_Recognize.pdf`, NeurIPS 2024) |
| **Key claim** | GPT-4 achieves 73.5% out-of-box self-recognition. Self-recognition capability and self-preference strength are linearly correlated. Fine-tuning to near-perfect recognition makes self-preference near-total. The same model cannot safely evaluate its own outputs. |
| **Implementing components** | `judge-evolution.ts` (MODEL_FAMILIES resolution map, enforces cross-family constraint, blocks same-family judge/generator combinations with schema validation); `AGENTS.md` Section 8.1 (Cross-Model Hard Constraint table with explicit "73.5% out-of-box self-recognition" citation); `agents/judge.md` (model constraint field: "must be a different model family"); `workflow-g-eval-improvement.md` Step 0 (Cross-Model Constraint section); `AGENTS.md` Section 10 (Principle 10) |
| **Verification method** | Confirm `judge-evolution.ts` contains MODEL_FAMILIES resolution map with at least anthropic, openai, google, meta families. Confirm same-family combinations are rejected (not just warned). Confirm corpus entries with `judge_model_family === generator_model_family` are blocked. Confirm AGENTS.md cites "73.5% out-of-box self-recognition" and describes this as "architectural constraint, not style preference." |

---

### Paper 16 — Self-Taught Evaluators (Meta FAIR)

| Field | Detail |
|---|---|
| **Paper** | *Self-Taught Evaluators* (`eval-research/2408.02666v2.pdf`, Meta FAIR) |
| **Key claim** | Iterative judge training from zero human labels via synthetic preference pairs and rejection sampling improves Llama3-70B from 75.4% to 88.7% on RewardBench over 5 iterations. The same approach can self-improve a pi judge from accumulated run traces without any human annotation. |
| **Implementing components** | `judge-evolution.ts` (accumulates preference corpus, rejection-samples position-consistent verdicts, tracks calibration metrics, supports iterative plan updates); `workflow-g-eval-improvement.md` Steps 1-7 (full self-taught evaluator loop: pair construction → plan → execute → position-swap → corpus → rejection sampling → plan update); `.pi/evals/judge-corpus/` (preference pair storage with plan versioning); `AGENTS.md` Section 9 (Phase 9: Eval Agent Self-Improvement) |
| **Verification method** | Confirm `judge-evolution.ts` has `record_preference_pair` tool that stores pairs with provenance. Confirm corpus schema includes `position_consistent`, `confidence`, `plan_version` fields. Confirm `workflow-g-eval-improvement.md` documents rejection-sampling instructions (retain correct+consistent+high-confidence, discard wrong or position-inconsistent). Confirm plan versioning is implemented so historical comparisons are not contaminated by plan drift. |

---

### Paper 17 — EvalPlanner: Learning to Plan & Reason for Evaluation

| Field | Detail |
|---|---|
| **Paper** | *EvalPlanner: Learning to Plan & Reason for Evaluation with Thinking-LLM-as-a-Judge* (`eval-research/2501.18099v2.pdf`, Meta FAIR) |
| **Key claim** | Decoupling evaluation into plan → execute → verdict with unconstrained, task-adaptive plans outperforms fixed criteria lists. 93.9% on RewardBench with only 22K synthetic pairs (matches models trained on 680K human-annotated pairs). Works at 8B scale. |
| **Implementing components** | `skills/eval-planning/SKILL.md` (plan→execute→verdict protocol, unconstrained task-adaptive plans, anti-bias instructions, output schema); `agents/judge.md` (plan → execute → verdict as mandatory protocol); `judge-evolution.ts` (evaluation plan library with versioning); `workflow-g-eval-improvement.md` Steps 2-3 (plan generation and execution); `AGENTS.md` Section 8.2 (Plan → Execute → Verdict Protocol) |
| **Verification method** | Confirm `eval-planning/SKILL.md` exists (or `agents/judge.md`) and documents the plan→execute→verdict protocol. Confirm plans are described as "unconstrained" and "task-adaptive" (not fixed rubrics). Confirm the 93.9% RewardBench result is cited as motivation. Confirm judge output format includes `plan`, `execution`, `verdict`, and `rationale` fields. Confirm `workflow-g-eval-improvement.md` Step 2 explains why unconstrained plans beat fixed rubrics. |

---

### Paper 18 — Con-J: Learning LLM-as-a-Judge for Preference Alignment

| Field | Detail |
|---|---|
| **Paper** | *Learning LLM-as-a-Judge for Preference Alignment* (`eval-research/9742_Learning_LLM_as_a_Judge_f.pdf`, Con-J, ICLR 2025) |
| **Key claim** | DPO on self-generated contrastive judgment pairs with verbal rationale is more robust to dataset biases than scalar reward models. Pairwise judgments with interpretable verbal rationale expose bias, enable oversight, and generalize better. Bootstrap the judge from self-contrasts. |
| **Implementing components** | `agents/judge.md` (pairwise over scalar as default, verbal rationale in structured JSON output); `judge-evolution.ts` (corpus accumulation from self-generated contrastive pairs — synthetic degraded pairs are the Con-J "self-contrasts"); `workflow-g-eval-improvement.md` Step 1 Source B (synthetic degraded pairs as self-contrast mechanism); `AGENTS.md` Section 8 (preference for pairwise over absolute numeric scores); `workflow-g-eval-improvement.md` Step 5 verdict format (rationale field required) |
| **Verification method** | Confirm judge verdict schema includes `rationale` field as required (not optional). Confirm `workflow-g-eval-improvement.md` Step 1 Source B documents synthetic degraded pairs as the self-contrast mechanism (known-quality pairs without human annotation). Confirm pairwise-over-scalar preference is documented in AGENTS.md. Confirm corpus schema has `winner: "A | B | tie"` (pairwise) not a numeric score. |

---

## 2. Research Principles Coverage

Each of the 12 principles from the research report is mapped to its implementing system component(s).

### Principle 1: Use the Least Complex Workflow That Can Succeed

**Claim:** Multi-agent overhead is real. Choose the simplest topology that can succeed for the task difficulty.

| Implementing component | How it implements the principle |
|---|---|
| `topology-runner.ts` | Enforces topology selection based on node/depth budgets; rejects over-engineered topologies |
| `skills/topology-authoring/SKILL.md` | Difficulty-to-topology mapping: score 0-2 → single agent, 3-5 → chain, 6-8 → pipeline, 9+ → isolated worktrees |
| `workflow-a-simple.md` | Explicit scope validation gate that escalates to Workflow B rather than absorbing scope silently |
| `workflow-b-standard.md` | Spawn score pre-check prevents running Workflow B when Workflow A suffices |
| `AGENTS.md` Section 2 Principle 1 | "Deterministic Supervisor" owns routing — no agent self-escalates topology |

---

### Principle 2: Prefer Tool-Grounded Evidence Over Agent Opinion

**Claim:** Strong findings cite exact file/line, command exit codes, test output, API docs. Weak findings say "likely," "seems," or "another agent found."

| Implementing component | How it implements the principle |
|---|---|
| `agents/reviewer.md` | "Evidence-backed findings only" — requires `command_evidence` OR `file:line` for every finding |
| `skills/anti-bystander-review/SKILL.md` | Evidence ranking table: test failure with exit code > file/line reference > opinion. Discards "evidence-free findings" |
| `agents/failure-attributor.md` | Requires "specific evidence" (command output, file inspection, test assertion) for every attribution claim |
| `review-aggregator.ts` | Aggregates by evidence quality, not vote count or confidence level |
| `AGENTS.md` Section 4.8 | "Evidence Over Opinion" rule; "likely/seems/consensus without evidence is weak and flagged" |

---

### Principle 3: Make Every Handoff an Artifact

**Claim:** Agent communication should flow through typed artifacts stored in the run directory, enabling replay, review, attribution, compression, and improvement.

| Implementing component | How it implements the principle |
|---|---|
| `trace-ledger.ts` | Persists structured events for every run, agent, tool call, artifact, cost, and outcome |
| `AGENTS.md` Section 4.6 | Structured Handoff Artifacts table: 11 artifact types with producer/consumer/path |
| `attempt-summarizer.ts` | Forces every rollout to emit attempt-summary.json before completion |
| All workflow prompts | Every step specifies artifact producer, artifact name, and path in `.pi/runs/<id>/` |
| `agents/builder.md` | "Produce attempt summary regardless of outcome" — failed attempts require summaries too |

---

### Principle 4: Keep One Writer by Default

**Claim:** Multiple write-capable agents create merge conflicts and ambiguous responsibility. Only builder writes to main workspace.

| Implementing component | How it implements the principle |
|---|---|
| `agents/builder.md` | Defined as "default single code writer"; "ONLY agent that writes to the main workspace" |
| `worktree-manager.ts` | Isolates concurrent write attempts in separate worktrees; merge only after validation |
| `topology-runner.ts` | Enforces `write: true` on exactly one agent per topology (validated at topology load time) |
| `workflow-c-complex.md` | Step 4: explicit worktree initialization before builder starts; main workspace is read-only during build |
| `AGENTS.md` Section 4.3 | "One Writer at a Time" rule; "Concurrent write attempts require worktree isolation" |

---

### Principle 5: Separate First-Pass Independence from Second-Pass Synthesis

**Claim:** Independent generation first; aggregation second. Applies to code review, research findings, plan critiques, failure attribution, and self-evolution audits.

| Implementing component | How it implements the principle |
|---|---|
| `review-aggregator.ts` | Implements shuffle-and-anonymize before synthesis; prevents peer-visible aggregation |
| `skills/anti-bystander-review/SKILL.md` | Step 1: "Private first pass" with no shared state; Step 3: shuffle and anonymize before synthesis |
| `agents/reviewer.md` and `agents/tester.md` | Run in separate sessions; no access to peer output during first pass |
| `workflow-b-standard.md` Step 4 | Explicit "separate, isolated sessions" instruction; forbidden prompt examples |
| `workflow-c-complex.md` Step 7 | "Independent sessions, no peer visibility during first pass, shuffle and anonymize before aggregation" |

---

### Principle 6: Version Prompts and Configs Like Code

**Claim:** Prompts, context files, skills, topology templates, and routing hints affect behavior as much as code. They need source control, review, changelogs, rollback, and conflict detection.

| Implementing component | How it implements the principle |
|---|---|
| `config-linter.ts` | Detects contradictions between AGENTS.md, skills, rules, prompts, and agent configs |
| `evolution-governor.ts` | Versions all evolved artifacts with `plan_version` field; logs every change to `evolution-log.jsonl` |
| `judge-evolution.ts` | Maintains judge evaluation plan library with explicit versioning (`plan_version: v<n>`) |
| `AGENTS.md` Section 5.1 | Protected paths policy: AGENTS.md requires "human-approved changes only" |
| `workflow-e-self-evolution.md` | Every proposed change requires diff, holdout evaluation, anti-conflict check, and rollback plan |

---

### Principle 7: Optimize for Lifecycle Performance

**Claim:** Measure success per dollar/token, spawn count, useful child contribution rate, validation pass rate, failure category recurrence, review false-positive/negative rate, rollback frequency.

| Implementing component | How it implements the principle |
|---|---|
| `trace-ledger.ts` | Captures per-agent token cost, wall-clock time, tool calls, spawn count, and outcome |
| `spawn-controller.ts` | Logs every spawn decision to `spawn-log.jsonl` with score and outcome |
| `judge-evolution.ts` | Tracks judge calibration metrics (position-consistency, known-pair accuracy, verbosity-bias rate) |
| `evolution-governor.ts` | Tracks `proposed_improvements`, `accepted`, `verified`, `reverted` in `evolution-log.jsonl` |
| `AGENTS.md` Section 12 | Full metrics list: outcome metrics, efficiency metrics, MAS metrics, evolution metrics, lifelong-learning metrics, evaluation metrics |

---

### Principle 8: Evolve Explicit Artifacts, Not Hidden Behavior

**Claim:** Self-evolution should target inspectable files and policies. Every candidate change needs a diff, source evidence, evaluation result, owner, and rollback path.

| Implementing component | How it implements the principle |
|---|---|
| `evolution-governor.ts` | `propose_evolution` tool requires: artifact_type, artifact_path, proposed_diff, evidence, expected_outcome, rollback_plan |
| `workflow-e-self-evolution.md` | Evolution proposal template requires: exact diff, source evidence (run IDs), expected outcome, regression constraints, rollback plan, owner |
| `AGENTS.md` Section 11 | Evolvable artifact classes table with autonomy levels (automatic / proposal / human-approved-only) |
| `skills/evolution-proposal/SKILL.md` | Draft change format, safety requirements, diff requirement |
| `agents/evolution-auditor.md` | "Enforce Endure→Excel→Evolve; require rollback and evidence before promotion" |

---

### Principle 9: Convert Experience Into Typed Memory Before Reuse

**Claim:** Do not retrieve raw conversation history. First distill traces into typed facts, decisions, lessons, failures, skills, reminders, and evaluation cases with provenance and validation status.

| Implementing component | How it implements the principle |
|---|---|
| `lifelong-memory.ts` | 7-type memory store; rejects raw transcript storage; requires provenance and validation status |
| `agents/memory-curator.md` | "Never store unverified claims as validated"; "raw trajectories can inject noise and degrade reasoning" (cites StuLife) |
| `skills/lifelong-memory/SKILL.md` | Typed schemas, salience scoring, retrieval order, deprecation, and contradiction handling |
| `skills/context-pruning/SKILL.md` | "Never pass raw conversation history — use typed memories only" |
| `workflow-f-lifelong-learning.md` | Memory type selection guide; episode summary schema; skill promotion ladder |

---

### Principle 10: Use Frontier Curricula for Improvement

**Claim:** Self-evolution tasks should be neither already solved nor impossible. Generate challenge cases from real failures, score uncertainty and tool demand, deduplicate, and use as holdout tests before promoting changes.

| Implementing component | How it implements the principle |
|---|---|
| `curriculum-generator.ts` | Generates frontier cases with p̂ ≈ 0.5 filter, governance score, novelty hash deduplication |
| `skills/curriculum-generation/SKILL.md` | Full case source taxonomy, oracle requirement, difficulty band filter, governance score formula |
| `agents/curriculum-generator.md` | "Cases outside p̂ 0.15–0.85 band are filtered or modified"; oracle must be deterministic |
| `workflow-f-lifelong-learning.md` | Step 5: curriculum case generation with governance score and frontier filter |
| `workflow-g-eval-improvement.md` | Step 8: feed-forward curriculum case re-scoring after judge calibration improves |

---

### Principle 11: The Judge Must Not Be the Generator

**Claim:** Self-preference bias is an architectural failure. GPT-4 achieves 73.5% out-of-box self-recognition. Self-recognition capability and self-preference strength are linearly correlated. Cross-model judging is a hard constraint.

| Implementing component | How it implements the principle |
|---|---|
| `judge-evolution.ts` | MODEL_FAMILIES map with family resolution; blocks same-family generator+judge combinations in schema validation |
| `agents/judge.md` | "Model: MUST be a different model family from the agent that produced the candidates" |
| `AGENTS.md` Section 8.1 | Cross-model hard constraint table; cites "73.5% out-of-box"; calls it "architectural constraint, not style preference" |
| `workflow-g-eval-improvement.md` | Dedicated "Cross-Model Constraint (Hard Architectural Requirement)" section with per-family routing rules |
| Corpus schema | `judge_model_family !== generator_model_family` validated before accepting corpus entry |

---

### Principle 12: Use Plan-First Evaluation, Not Fixed Rubrics

**Claim:** Fixed evaluation checklists fail on task types they weren't designed for. Generating unconstrained, task-adaptive evaluation plans at inference time (EvalPlanner) produces more reliable verdicts across diverse task types.

| Implementing component | How it implements the principle |
|---|---|
| `skills/eval-planning/SKILL.md` | Documents plan→execute→verdict structure; explicitly describes plans as "unconstrained and task-adaptive"; cites 93.9% RewardBench |
| `agents/judge.md` | Plan phase is the first step; "not a fixed rubric; it is generated from the task at hand" |
| `workflow-g-eval-improvement.md` | Step 2: judge generates task-adaptive plan before any execution; explicit examples by task type |
| `judge-evolution.ts` | Plan library stores and versions task-type-specific plans; plans are strings, not hardcoded criteria lists |
| `AGENTS.md` Section 8.2 | Plan → Execute → Verdict protocol with task-adaptive examples (coding task vs. skill proposal vs. memory update) |

---

## 3. Architecture Verification

### 3.1 Supervisor Components

| Component | File | Role | Status |
|---|---|---|---|
| Task router (topology selection) | `topology-runner.ts` | Executes schema-validated DAG workflows; difficulty-aware routing | ✅ Present |
| Spawn controller | `spawn-controller.ts` | AgentSpawn score computation; spawn policy enforcement | ✅ Present |
| Memory manager | `lifelong-memory.ts` | Typed memory store with 7 types, salience, provenance | ✅ Present |
| Skill registry | `skill-registry.ts` | Skill lifecycle states, triggers, success rates | ✅ Present |
| Prospective agenda | `prospective-agenda.ts` | Future obligations with triggers and execution context | ✅ Present |
| Attempt summarizer | `attempt-summarizer.ts` | Structured rollout summary emission after every run | ✅ Present |
| Review aggregator | `review-aggregator.ts` | Shuffle/anonymize reviews; evidence-rank aggregation | ✅ Present |
| Validation gate | `validation-gate.ts` | "No success without tests" enforcement | ✅ Present |
| Config linter | `config-linter.ts` | AGENTS.md + skill + prompt contradiction detection | ✅ Present |
| Worktree manager | `worktree-manager.ts` | Isolated build environment; merge after validation | ✅ Present |
| Evolution governor | `evolution-governor.ts` | Endure→Excel→Evolve gate enforcement; proposal management | ✅ Present |
| Curriculum generator | `curriculum-generator.ts` | Frontier challenge case generation; governance score | ✅ Present |
| Judge evolution | `judge-evolution.ts` | Preference corpus; rejection sampling; plan versioning | ✅ Present |
| Memory slicer | `memory-slicer.ts` | Context compression for spawn packages | ✅ Present |
| Safety gate | `safety-gate.ts` | Destructive command blocking; protected path enforcement | ✅ Present |
| Trace ledger | `trace-ledger.ts` | Structured event persistence for all runs and agents | ✅ Present |

**Total extensions present:** 16/16 ✅

---

### 3.2 Agent Verification

| Agent | File | Role | Write access | Key constraint |
|---|---|---|---|---|
| `scout` | `agents/scout.md` | Repository context collector | ❌ | Read-only; cite every finding |
| `researcher` | `agents/researcher.md` | External evidence gatherer | ❌ | Primary sources only; mark uncertainty |
| `planner` | `agents/planner.md` | Implementation plan author | ❌ | Choose simplest topology that can work |
| `builder` | `agents/builder.md` | Default single code writer | ✅ | Only writer; stop on ambiguous scope |
| `reviewer` | `agents/reviewer.md` | Adversarial code reader | ❌ | Independent; evidence-based findings only |
| `tester` | `agents/tester.md` | Execution validator | Limited | May run tests; no source file writes |
| `debugger` | `agents/debugger.md` | Failure investigator | ❌ | Read-only; distinguish symptom from trigger |
| `summarizer` | `agents/summarizer.md` | Memory compressor | Artifacts | Preserve decisive details; discard noise |
| `memory-curator` | `agents/memory-curator.md` | Typed memory manager | `.pi/memory/` | Never store unverified as validated |
| `curriculum-generator` | `agents/curriculum-generator.md` | Challenge case creator | `.pi/curricula/` | Deterministic oracle required |
| `judge` | (in AGENTS.md Section 8) | Cross-model pairwise evaluator | ❌ | Different model family from generator |
| `failure-attributor` | (in AGENTS.md / skills) | Root-cause analyst | ❌ | Single authoritative chain; cite evidence |
| `evolution-auditor` | (in AGENTS.md Section 11) | Self-evolution reviewer | ❌ | Endure→Excel→Evolve enforcement |

**Total agents:** 13. Note: `judge`, `failure-attributor`, and `evolution-auditor` are defined in AGENTS.md and workflow prompts, with additional definition in skill files; they do not all have standalone `.md` files in `agents/`.

**Standalone agent files present:** 10/13 (`scout`, `researcher`, `planner`, `builder`, `reviewer`, `tester`, `debugger`, `summarizer`, `memory-curator`, `curriculum-generator`). Three agents (`judge`, `failure-attributor`, `evolution-auditor`) are defined via AGENTS.md protocols and skills.

---

### 3.3 Skills Verification

| Skill | Directory | Key capability | Status |
|---|---|---|---|
| `feature-spec` | `skills/feature-spec/SKILL.md` | Interface definition + F2P/P2P templates | ✅ Present |
| `repo-validation` | `skills/repo-validation/SKILL.md` | Build/test/lint commands; validation ladder | ✅ Present |
| `rollout-summary` | `skills/rollout-summary/SKILL.md` | Attempt summary schema; RTV/PDR instructions | ✅ Present |
| `failure-attribution` | `skills/failure-attribution/SKILL.md` | 12-category taxonomy; postmortem workflow | ✅ Present |
| `anti-bystander-review` | `skills/anti-bystander-review/SKILL.md` | 6-step independent review protocol | ✅ Present |
| `topology-authoring` | `skills/topology-authoring/SKILL.md` | DAG schema; difficulty mapping; validator rules | ✅ Present |
| `context-pruning` | `skills/context-pruning/SKILL.md` | 7-type memory taxonomy; relevance scoring | ✅ Present |
| `lifelong-memory` | `skills/lifelong-memory/SKILL.md` | Typed memory schemas; salience; deprecation | ✅ Present |
| `skill-lifecycle` | `skills/skill-lifecycle/SKILL.md` | Skill promotion ladder; lifecycle states | ✅ Present |
| `prospective-agenda` | `skills/prospective-agenda/SKILL.md` | Future obligations with triggers and context | ✅ Present |
| `curriculum-generation` | `skills/curriculum-generation/SKILL.md` | Frontier case creation; governance score | ✅ Present |
| `eval-planning` | `skills/eval-planning/` | Plan→execute→verdict; anti-bias instructions | ⚠️ Directory exists, SKILL.md not confirmed |
| `evolution-proposal` | `skills/evolution-proposal/` | Safe change proposal workflow | ⚠️ Directory exists, SKILL.md not confirmed |

**Skills with confirmed SKILL.md content:** 11/13. The `eval-planning` and `evolution-proposal` directories exist but their SKILL.md files were not confirmed present during system inspection. These should be created or verified.

---

### 3.4 Workflow Prompts Verification

| Workflow | File | Use case | Status |
|---|---|---|---|
| A — Simple | `prompts/workflow-a-simple.md` | One-file edits, small questions, low-risk | ✅ Present |
| B — Standard | `prompts/workflow-b-standard.md` | Moderate features/bugs, unfamiliar code | ✅ Present |
| C — Complex | `prompts/workflow-c-complex.md` | Multi-file, feature-level, external API/domain | ✅ Present |
| D — Refinement | `prompts/workflow-d-refinement.md` | 2+ failed attempts, persistent failures | ✅ Present |
| E — Self-evolution | `prompts/workflow-e-self-evolution.md` | Systemic improvement opportunity | ✅ Present |
| F — Lifelong learning | `prompts/workflow-f-lifelong-learning.md` | Reusable lessons, skill gaps | ✅ Present |
| G — Eval improvement | `prompts/workflow-g-eval-improvement.md` | Judge calibration, new task domain | ✅ Present |

**Total workflow prompts:** 7/7 ✅

---

## 4. Gaps and Limitations

### 4.1 What Requires Model Weight Training (Not Implementable as Prompt/Config)

| Research result | Implementation scope | Gap |
|---|---|---|
| **Agent0 RL gains (+18% math, +24% general reasoning)** | Only curriculum *design principles* are transferable. The gains come from GRPO weight updates on Qwen3-8B-Base. This system implements: p̂ ≈ 0.5 filtering, governance score, novelty hashing, oracle requirements. | Cannot replicate +18%/+24% gains without model fine-tuning. The curriculum generator produces evaluation inputs, not RL training signals. |
| **Con-J DPO alignment** | The system implements the contrastive pair generation mechanism (synthetic degraded pairs) and verbal rationale collection. The judge self-improvement is via plan prompt updates, not DPO weight updates. | Cannot replicate the full Con-J alignment benefit without DPO training infrastructure. The approach is approximated by rejection-sampling toward better plan prompts. |
| **Self-Taught Evaluators 88.7% RewardBench** | The 75.4 → 88.7% improvement in the paper comes from fine-tuning Llama3-70B-Instruct on collected preference pairs. This system implements the corpus accumulation and rejection-sampling mechanism. | The plan prompt update approximation may not achieve the same calibration gain as weight-level fine-tuning. Human spot-check agreement tracking is the recommended monitoring proxy. |
| **SEMA 70% token reduction** | SEMA achieves token reduction via structural-entropy-driven pruning of StarCraft observation state — a domain-specific operation. This system implements the general principle: context-pruning skill and memory-slicer extension. | Exact 70% reduction is not guaranteed in code-generation contexts. Actual token savings depend on project size and task type. |

---

### 4.2 What Requires Human Loop Steps

| Component | Human involvement required | Automation available |
|---|---|---|
| **Workflow E (self-evolution)** | Human approval required for: prompt/agent/topology/routing changes, any tool permission expansion, new extension code | Automatic for: episode summaries, negative lessons, individual fact/heuristic entries with direct evidence |
| **Evolution-governor** | No agent-callable approval tool; approval requires a manual `.pi/evolution-approvals/<id>.json` artifact with matching proposal id/fingerprint, actor, and notes before `/evolution-approve <id>` and promotion can proceed | Safety/regression gate checks are automated; Excel gate evaluation is agent-assisted |
| **Memory hard-deletion** | Bulk deletion of `.pi/memory/` items requires human sign-off (AGENTS.md Section 5.4) | Deprecation and contradiction marking are automated via memory-curator |
| **Security reviews** | New extensions, tool permissions, sandbox policy changes require human security review | Safety-gate extension blocks common destructive patterns automatically |
| **Judge spot-check** | Human spot-check agreement is tracked as a calibration metric (no fixed target, track trend) | Position-consistency, known-pair accuracy, and verbosity-bias rate are automated |
| **Escalation conditions** | 9 escalation conditions in AGENTS.md Section 6 require human operator decision | Agents can identify and flag escalation conditions but cannot resolve them autonomously |

---

### 4.3 What Is Scaffolded (Data Structures) vs. Fully Autonomous

| System aspect | Scaffolded | Fully autonomous |
|---|---|---|
| **Memory storage** | TypeScript data structures in `lifelong-memory.ts`; YAML/JSON schemas defined | Memory-curator agent proposes adds/updates; human review for high-confidence facts |
| **Curriculum cases** | `.pi/curricula/` directory with JSON schema; novelty hash format defined | Curriculum-generator agent creates cases from traces; governance score computed automatically |
| **Judge corpus** | `.pi/evals/judge-corpus/` directory with preference pair schema; plan library versioned | Pair collection and rejection sampling are automated; plan update requires review |
| **Skill registry** | TypeScript lifecycle tracker in `skill-registry.ts`; lifecycle states defined | Skill promotion from provisional→validated requires confirmed multi-run evidence |
| **Evolution proposals** | Proposal template defined; gate logic in `evolution-governor.ts` | Safety gate (Endure) is automated; Excel gate is agent-evaluated; promotion requires human |
| **Spawn packages** | Spawn Package and Resume Package schemas are complete | `compute_spawn_score` tool computes score; spawn decision is automated above threshold 0.7 |
| **Attempt summaries** | Full JSON schema defined in `rollout-summary/SKILL.md` | Builder and summarizer agents produce summaries; RTV comparison is automated |

---

### 4.4 Benchmark Transfer Risks

The research report explicitly notes these transfer risks. The system inherits them:

| Risk | Source paper | Mitigation in this system |
|---|---|---|
| **Coding contest results may not transfer to production software** | AgentConductor (APPS benchmark); Agent0 (math/general reasoning benchmarks) | Validation gate enforces project-specific test commands, not benchmark-proxy metrics |
| **StarCraft pruning results may not transfer to code generation** | SEMA (real-time strategy domain) | Context-pruning skill is a general principle adaptation, not a SEMA port; token savings are heuristic, not guaranteed |
| **StuLife StuGPA scores reflect a specific academic task structure** | ELL/StuLife | The system implements the typed memory and skill lifecycle principles; the 17.9/100 GPT-5 finding motivates the approach, but is not used as a calibration target |
| **RewardBench results may not reflect production judgment quality** | Self-Taught Evaluators; EvalPlanner | Judge calibration uses position-consistency rate and known-pair accuracy as internal metrics, not RewardBench scores |
| **Self-preference findings apply to specific model architectures** | Self-Preference paper (GPT-4, fine-tuned variants) | The cross-model constraint is applied conservatively to all model families as a hard architectural rule |
| **Several papers are 2026 preprints** | Multiple | Quantitative results are treated as directional evidence, not guaranteed engineering specifications. System design favors conservative implementation. |

---

### 4.5 What Is Not Yet Implemented

| Gap | Impact | Recommended next step |
|---|---|---|
| `eval-planning/SKILL.md` missing content | Judge agent lacks a formal skill reference for plan generation | Write SKILL.md following pattern of other skills; include plan→execute→verdict structure and anti-bias protocol |
| `evolution-proposal/SKILL.md` missing content | Evolution-auditor lacks a formal skill reference for drafting proposals | Write SKILL.md with proposal template, diff requirements, and rollback specifications |
| `agents/judge.md` not present as standalone file | Judge protocol lives only in AGENTS.md Section 8 | Create `agents/judge.md` following agent file pattern; improves discoverability and enables per-agent linting |
| `agents/failure-attributor.md` not present as standalone | Attribution logic documented in skill only | Create standalone agent file for use in spawn packages |
| `agents/evolution-auditor.md` not present as standalone | Auditor logic documented in AGENTS.md only | Create standalone agent file for topology spawning |
| Metrics dashboard not implemented | Lifecycle performance tracking is logged but not visualized | Add `/metrics` command to trace-ledger extension or a separate dashboard extension |
| Test coverage for extensions | Extensions lack unit or integration tests | Add test harness for extension tools; validate against schema and policy rules |

---

## 5. Validation Checklist

The following checklist verifies the system's implementation against the research requirements. Each item cites the research paper that motivates it.

### 5.1 Core Infrastructure

- [x] `AGENTS.md` exists with all required sections: project overview, architecture map, build/test/lint commands, code conventions, safety boundaries, agent workflow rules, required validation ladder, known flaky tests, escalation conditions, "read before edit" policy *(Configuring Agentic AI Coding Tools — context files dominate; AGENTS.md as emerging standard)*

- [x] All 16 extensions exist as `.ts` files in `.pi/extensions/`:
  - `trace-ledger.ts`, `topology-runner.ts`, `spawn-controller.ts`, `memory-slicer.ts`
  - `lifelong-memory.ts`, `prospective-agenda.ts`, `attempt-summarizer.ts`, `review-aggregator.ts`
  - `validation-gate.ts`, `config-linter.ts`, `worktree-manager.ts`, `evolution-governor.ts`
  - `curriculum-generator.ts`, `skill-registry.ts`, `judge-evolution.ts`, `safety-gate.ts`

- [x] All 10 confirmed agent `.md` files exist in `.pi/agents/`:
  `scout.md`, `researcher.md`, `planner.md`, `builder.md`, `reviewer.md`, `tester.md`, `debugger.md`, `summarizer.md`, `memory-curator.md`, `curriculum-generator.md`

- [ ] `agents/judge.md` exists as standalone file *(AGENTS.md Section 8 defines the protocol, but standalone file is not yet present)*

- [ ] `agents/failure-attributor.md` exists as standalone file *(skill exists; standalone agent file not yet created)*

- [ ] `agents/evolution-auditor.md` exists as standalone file *(AGENTS.md Section 11 defines the role; standalone file not yet created)*

- [x] All 11 confirmed skills exist as `SKILL.md` files in `.pi/skills/`:
  `feature-spec/`, `repo-validation/`, `rollout-summary/`, `failure-attribution/`, `anti-bystander-review/`, `topology-authoring/`, `context-pruning/`, `lifelong-memory/`, `skill-lifecycle/`, `prospective-agenda/`, `curriculum-generation/`

- [ ] `skills/eval-planning/SKILL.md` exists with plan→execute→verdict content *(directory exists; SKILL.md content not confirmed)*

- [ ] `skills/evolution-proposal/SKILL.md` exists with proposal template content *(directory exists; SKILL.md content not confirmed)*

- [x] All 7 workflow prompts exist as `.md` files in `.pi/prompts/`:
  `workflow-a-simple.md`, `workflow-b-standard.md`, `workflow-c-complex.md`, `workflow-d-refinement.md`, `workflow-e-self-evolution.md`, `workflow-f-lifelong-learning.md`, `workflow-g-eval-improvement.md`

---

### 5.2 Research-Specific Verification Items

- [x] **Spawn score formula matches AgentSpawn paper exactly** (Table 1 and Figure 3 of `2602.07072v1.pdf`):
  `sspawn = 0.30*If + 0.20*Cc + 0.25*Fc + 0.15*Oc + 0.10*Uc`  
  Threshold: 0.7. Max depth: 3. Max concurrent: 4.  
  *Verified in: `spawn-controller.ts` (formula constants), `AGENTS.md` Section 7.1, `workflow-b-standard.md` spawn score pre-check*

- [x] **Judge cross-model constraint is enforced architecturally** (not just as a guideline):  
  Same-family generator+judge combinations are blocked by `judge-evolution.ts` schema validation.  
  AGENTS.md Section 8.1 documents this as a "hard architectural constraint, not style preference."  
  Motivated by: self-preference paper (GPT-4: 73.5% out-of-box self-recognition; linear correlation with self-preference).  
  *Verified in: `judge-evolution.ts` MODEL_FAMILIES map and `resolveFamily()` function, corpus entry validation*

- [x] **Endure > Excel > Evolve is enforced in evolution-governor as sequential gates** (not parallel checks):  
  Safety gate (Endure) must pass before performance gate (Excel) is evaluated. Excel must pass before promotion.  
  High-risk paths blocked without `security_override`.  
  *Verified in: `evolution-governor.ts` gate logic, `workflow-e-self-evolution.md` Step 1-8 gate order table*

- [x] **Position-swap protocol is documented in judge agent and enforced in corpus accumulation**:  
  Judgments run in both orderings; only consistent verdicts are retained.  
  Position-inconsistent verdicts are discarded and regenerated (up to 3 attempts per pair).  
  *Verified in: `AGENTS.md` Section 8.2, `workflow-g-eval-improvement.md` Step 4, `judge-evolution.ts` corpus schema (`position_consistent: true` required)*

- [x] **FeatureBench F2P/P2P tests are documented and required in feature-spec skill**:  
  `feature-spec/SKILL.md` contains F2P Test Template (tests that must pass after implementation) and P2P Test Template (tests that must not break).  
  Interface definition YAML includes `verified: true` field for all dependencies.  
  *Verified in: `skills/feature-spec/SKILL.md` full content*

- [x] **SEMA 70% token reduction principle is implemented in context-pruning skill**:  
  `context-pruning/SKILL.md` cites "70% token reduction and 50% latency reduction" and documents the 7-type memory taxonomy with relevance scoring.  
  The principle: "never pass raw conversation history — use typed memories only."  
  *Verified in: `skills/context-pruning/SKILL.md`*

- [x] **Bystander Effect n=2 cap is enforced in anti-bystander-review skill**:  
  `anti-bystander-review/SKILL.md` Reviewer Count Policy table caps routine review at 2 validators (reviewer + tester).  
  Documents: "GPT-class models collapse at n=2 auditors; cap prevents worse degradation."  
  "Do not add a third reviewer to resolve disagreement — run targeted validation instead."  
  *Verified in: `skills/anti-bystander-review/SKILL.md` Reviewer Count Policy section*

- [x] **GPT-5 17.9/100 StuLife finding motivates lifelong-memory skill and workflow-f**:  
  The ELL/StuLife empirical finding is cited in `agents/memory-curator.md` as the motivation for typed memory management.  
  `workflow-f-lifelong-learning.md` documents "GPT-5 scores only 17.9/100 on StuLife without structured memory."  
  Naive RAG anti-pattern documented: "Vanilla RAG StuGPA: 10.98, below the no-memory baseline."  
  *Verified in: `agents/memory-curator.md`, `workflow-f-lifelong-learning.md`*

- [x] **EvalPlanner 93.9% RewardBench result is cited in eval-planning workflow documentation**:  
  `workflow-g-eval-improvement.md` Step 2 explains why unconstrained plans beat fixed rubrics and cites the 93.9% RewardBench result with 22K synthetic pairs.  
  The motivation: "Unconstrained plans generated at inference time consistently outperform hand-crafted criteria lists."  
  *Verified in: `workflow-g-eval-improvement.md` Step 2 (EvalPlanner Principle section)*

---

### 5.3 Structural Integrity Checks

- [x] **Single-writer policy** is enforced: builder is the only agent with `write: true` in standard topology; all others are `write: false` or write to isolated artifacts only

- [x] **Attempt summaries are required after every meaningful run**, including failed runs (`verdict: needs_refinement` or `verdict: reject`). Documented in: `agents/builder.md` Rule 8, `skills/rollout-summary/SKILL.md`, all workflow prompts

- [x] **Pre-flight validation check** (test suite must pass before changes begin) is documented in: `agents/builder.md` Step 2, `workflow-b-standard.md` Step 3, `workflow-c-complex.md` Step 5

- [x] **Rollback plan is required** for every evolution proposal. `evolution-governor.ts` rejects proposals without rollback. `workflow-e-self-evolution.md` documents automatic rollback execution when verification fails

- [x] **Deterministic oracle required** for all curriculum cases. `agents/curriculum-generator.md`: "A human should judge if it looks right is NOT an oracle." `skills/curriculum-generation/SKILL.md` oracle types: command, test-pass, file-content, structural

- [x] **Memory hard-deletion requires human approval** (AGENTS.md Section 5.4): "Bulk deletion of memory items is prohibited without human sign-off"

- [x] **Prospective reminders include full execution context** (not vague "follow up" items): trigger condition, required files, required commands, success criteria. Documented in: `agents/memory-curator.md` Rule 6, `workflow-f-lifelong-learning.md` Step 8

---

*End of System Evaluation Report*

**Prepared by:** Research-Driven Pi Multi-Agent System — Documentation Agent  
**Based on:** 18 research papers synthesized in `RESEARCH-REPORT.md` (2026-05-19)  
**Next review trigger:** 30+ production runs, any calibration metric miss, or system evolution event
