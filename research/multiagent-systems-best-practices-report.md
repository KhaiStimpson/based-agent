# Research-Driven Best Practices for Developing Multi-Agent Systems

**Date:** 2026-05-19
**Scope:** This report distills the research papers present in this directory and `evolution-research/` into actionable best practices for designing a research-driven `pi` agent system with custom extensions, agents, skills, pipelines, lifelong memory, and governed self-evolution. The self-evolution folder contains four PDFs, with `2508.19005v6.pdf` superseding `2508.19005v5.pdf` for synthesis purposes.

## Executive summary

The strongest cross-paper conclusion is that effective multi-agent systems are not "more agents talking more." They are **bounded, evidence-driven orchestration systems** that use specialized agents only when they add measurable value, preserve independent reasoning before aggregation, validate work with deterministic tools, and retain structured experience for future runs.

For a `pi`-based system, the recommended architecture is:

1. **A central, deterministic supervisor** in `pi` that owns task routing, budgets, trace logging, safety gates, topology validation, worktree isolation, and final adjudication.
2. **Small, role-specialized agents** with clear contracts: scout/context collector, planner, builder, reviewer, tester, researcher, summarizer/compressor, failure-attributor, and evolution auditor.
3. **Versioned context and configuration** centered on `AGENTS.md`, with tool-specific files as thin adapters, and skills for recurring workflows.
4. **Dynamic spawning and topology selection** based on runtime signals, not static always-on swarms.
5. **Independent review/test phases** capped and isolated to avoid bystander effects, cognitive loafing, lead-anchor bias, and majority-vote failure.
6. **Structured attempt summaries** as first-class artifacts, enabling selection, refinement, reuse, failure attribution, and self-evolution.
7. **A conservative self-evolution loop**: trace → attribute → propose improvement → validate → promote/rollback.
8. **A lifelong-learning substrate** that converts raw traces into typed memories, validated skills, prospective reminders, frontier evaluation tasks, and deterministic mechanisms.
9. **Curriculum-driven improvement** that generates repo-grounded challenge cases from failures and weak spots, then promotes only changes that improve validated outcomes without safety or cost regressions.
10. **A self-improving cross-model judge** that evaluates pairwise using plan→execute→verdict, guards against five bias families, and iteratively refines its evaluation plans from accumulated trace-derived preference pairs without human annotation.

The system should optimize for **resolved outcomes per cost**, not agent count, prompt length, or apparent consensus.

---

## Research corpus

| File | Paper | Primary contribution | Most important design implication |
|---|---|---|---|
| `2601.09822v2.pdf` | *LLM-Based Agentic Systems for Software Engineering: Challenges and Opportunities* | Survey/concept paper on LLM-based MAS across the software development lifecycle. | Use role specialization, tool feedback, RAG, human intervention, and cost controls; evaluate collaboration, not only individual tasks. |
| `2602.07072v1.pdf` | *AgentSpawn: Adaptive Multi-Agent Collaboration Through Dynamic Spawning for Long-Horizon Code Generation* | Runtime spawning, memory transfer, skill inheritance, resume protocol, coherence manager. | Spawn specialists only when runtime complexity signals justify it; pass memory slices, not full history. |
| `2602.10975v1.pdf` | *FeatureBench: Benchmarking Agentic Coding for Complex Feature Development* | Feature-level executable benchmark showing current agents are weak at real feature work. | Require executable specs, interfaces, repository reading, F2P/P2P tests, and no-success-without-tests. |
| `2602.14690v4.pdf` | *Configuring Agentic AI Coding Tools: An Exploratory Study* | Empirical study of 2,853 GitHub repositories covering context files, skills, subagents, commands, rules, settings, MCP, hooks; 85.5% of skills contain no executable scripts. | Standardize around `AGENTS.md`; keep advanced mechanisms governed and measurable; prefer static documentation for skills. |
| `2602.17100v1.pdf` | *AgentConductor: Topology Evolution for Multi-Agent Competition-Level Code Generation* | Difficulty-aware, feedback-driven topology generation as layered DAGs; 3B-parameter backbone achieves 14.6 pp accuracy gain and 68% token cost reduction over best prior method. | Treat topology as data: schema-validated, density-capped, adapted to difficulty and feedback; topology strategy can outperform raw model scale. |
| `2603.23875v1.pdf` | *SEMA: Self-Evolving Multi-Agent Framework for Efficient Decision Making in Real-Time Strategy Scenarios* | Structural-entropy-driven observation pruning reduces input tokens by 70% and decision latency by 50% vs HIMA; decision/evaluation/policy agents; hybrid memory. | Prune context aggressively; use step-level and episode-level learning loops. |
| `2604.16529v1.pdf` | *Scaling Test-Time Compute for Agentic Coding* | Structured rollout summaries, Recursive Tournament Voting, Parallel-Distill-Refine. | Test-time scaling works through representation, selection, and reuse, not raw trace accumulation. |
| `2605.10698v1.pdf` | *The Bystander Effect in Multi-Agent Reasoning* | 22,500 trajectories across GAIA/SWE-bench/MultiChallenge; GPT-5.4 collapses at n=2 auditors; quantifies cognitive loafing, sovereignty collapse, lead-anchor effects. | Keep critiques independent, cap reviewers, avoid consensus prompts and majority voting. |
| `2605.14892v1.pdf` | *Beyond Individual Intelligence: Surveying Collaboration, Failure Attribution, and Self-Evolution in LLM-based Multi-Agent Systems* | LIFE framework: capability foundation, collaboration, attribution, evolution. | Build traceability and attribution before self-evolution; collaboration without diagnosis is brittle. |
| `evolution-research/2508.07407v2.pdf` | *A Comprehensive Survey of Self-Evolving AI Agents* | MOP/MOA/MAO/MASE trajectory, closed-loop self-evolution framework, and the Endure/Excel/Evolve laws. | Treat self-evolution as governed optimization over versioned artifacts; safety and regression preservation outrank autonomy. |
| `evolution-research/2508.19005v6.pdf` | *Building Self-Evolving Agents via Experience-Driven Lifelong Learning* | ELL framework and StuLife benchmark: experience exploration, long-term memory, skill learning, internalization; GPT-5 scores only 17.9/100 on StuLife; naive RAG actively harms performance. | Build typed memory, skill lifecycle, prospective agenda, and lifelong evaluations; avoid naive raw-trace RAG. |
| `evolution-research/2508.19005v5.pdf` | Earlier version of the ELL/StuLife paper. | Superseded locally by v6 for this report. | Use v6 findings. |
| `evolution-research/2511.16043v1.pdf` | *Agent0: Unleashing Self-Evolving Agents from Zero Data via Tool-Integrated Reasoning* | Curriculum/executor co-evolution via RL on model weights; +18% math reasoning, +24% general reasoning on Qwen3-8B-Base; frontier task filtering; tool-integrated reasoning. | Borrow the curriculum design principles (frontier uncertainty ≈ 0.5, tool-use reward, repetition penalty) for `pi` config/prompt evaluation; note that Agent0's gains come from weight updates, not prompt changes. |
| `eval-research/1-s2.0-S2666675825004564-main.pdf` | *A Survey on LLM-as-a-Judge* | Taxonomy of five bias families (position, length/verbosity, self-enhancement, style, compassion-fade); three reliability pillars: agreement with humans, bias, adversarial robustness. | Instrument every judge call with position-swap, identity-strip, and pairwise-over-scalar; measure all three reliability pillars periodically. |
| `eval-research/14702_LLM_Evaluators_Recognize.pdf` | *LLM Evaluators Recognize and Favor Their Own Generations* (NeurIPS 2024) | Self-recognition capability is linearly correlated with self-preference strength; GPT-4 achieves 73.5% out-of-box self-recognition; fine-tuning to near-perfect recognition makes self-preference near-total. | Never use the same model backbone as both generator and judge in any self-evolution loop. |
| `eval-research/2408.02666v2.pdf` | *Self-Taught Evaluators* (Meta FAIR) | Iterative judge training from zero human labels via synthetic preference pairs and rejection sampling; improved Llama3-70B from 75.4 → 88.7 on RewardBench over five iterations. | A `pi` judge agent can self-improve from accumulated run traces without any human annotation. |
| `eval-research/2501.18099v2.pdf` | *EvalPlanner: Learning to Plan & Reason for Evaluation with Thinking-LLM-as-a-Judge* (Meta FAIR) | Decouple evaluation into plan → execute → verdict; unconstrained task-adaptive plans outperform fixed criteria lists; 93.9% on RewardBench with only 22K synthetic pairs; works at 8B scale. | Replace fixed evaluation rubrics with dynamically generated task-specific evaluation plans that adapt to each instruction. |
| `eval-research/9742_Learning_LLM_as_a_Judge_f.pdf` | *Learning LLM-as-a-Judge for Preference Alignment* (Con-J, ICLR 2025) | DPO on self-generated contrastive judgment pairs; verbal rationale makes judgments interpretable; more robust to dataset biases than scalar reward models. | Use generative pairwise judgments with rationale rather than scalar scores for all self-evolution proposal evaluations; bootstrap the judge from self-contrasts. |

---

## Core findings from the papers

### 1. Multi-agent systems help when roles map to real expertise and tools

The SE survey (`2601.09822v2`) argues that MAS are promising because agents can specialize, run in parallel, use tools, and collaborate across SDLC phases. But it also highlights major gaps: weak domain-specific expertise, unclear human intervention points, insufficient SDLC data use, high compute cost, and inadequate benchmarks for collaboration.

**Best practice:** define agents around real boundaries:

- repository scout / context collector,
- planner / architect,
- builder / code writer,
- tester / command runner,
- reviewer / adversarial code reader,
- researcher / external evidence gatherer,
- failure-attributor / postmortem analyst,
- summarizer / memory compressor.

Avoid decorative roles such as "CEO," "product manager," or "critic" unless they have a concrete input, output, tool boundary, and success metric.

### 2. Feature-level coding remains hard; executable validation is non-negotiable

FeatureBench (`2602.10975v1`) shows a major gap between bug-fix benchmarks and feature development. Claude Opus 4.5 reportedly reaches 74.4% on SWE-bench but only about 11% on FeatureBench. Feature tasks are much larger: longer prompts, more files, more functions, more fail-to-pass and pass-to-pass tests.

Observed failure modes include:

- **NameError:** missed cross-file dependencies,
- **TypeError / AttributeError:** guessed interfaces instead of reading definitions,
- **AssertionError:** runnable but semantically incomplete implementations.

Note: "tool-schema hallucinations" is a real failure mode documented in SE literature generally but is **not** a named category in FeatureBench's empirical failure analysis; the four categories above are the ones the paper specifically identifies.

**Best practice:** every coding task should be converted into an executable contract:

- precise behavior,
- import paths and interfaces,
- affected modules,
- fail-to-pass tests for new behavior,
- pass-to-pass tests for regression protection,
- explicit "done means all required checks pass."

### 3. Context files dominate real-world configuration; `AGENTS.md` should be the shared core

The configuration study (`2602.14690v4`) analysed **2,853 GitHub repositories** and found context files dominate across agentic coding tools, with `AGENTS.md` emerging as a cross-tool convention. Advanced mechanisms such as skills and subagents are adopted less often, and **85.5% of skills contain no executable scripts** - the vast majority function as structured static documentation rather than runnable automation.

**Best practice for `pi`:** use `AGENTS.md` as the repository-level operating contract. Tool-specific context files should point to or adapt the shared core, not duplicate and drift from it.

Recommended `AGENTS.md` sections:

- project overview and architecture map,
- build/test/lint/typecheck commands,
- code conventions,
- safety boundaries,
- agent workflow rules,
- required validation ladder,
- known flaky tests/environment notes,
- escalation conditions,
- "read before edit" policy.

### 4. Dynamic spawning beats fixed crews, but only with bounded policies

AgentSpawn (`2602.07072v1`) proposes runtime spawning with memory slicing, skill inheritance, resume packages, and coherence management. It reports higher completion and reduced memory overhead through selective slicing. Its most important conceptual point is metacognition: the parent agent asks, "Am I the right agent for this subtask?"

**Best practice:** spawn a child agent only when there is evidence:

- task spans many files or domains,
- context budget exceeds a threshold,
- tests fail repeatedly,
- uncertainty is high,
- specialized domain knowledge is required,
- parallel hypotheses are genuinely useful,
- conflict/coherence can be managed.

Each spawned agent should receive a compact **Spawn Package**:

```json
{
  "task": "bounded subtask",
  "role": "tester | reviewer | researcher | refactorer | debugger",
  "constraints": ["no writes", "cite files", "run targeted tests"],
  "memory_slice_refs": ["artifact ids, files, summaries"],
  "allowed_tools": ["read", "bash"],
  "budget": { "tokens": 20000, "wall_minutes": 15 },
  "success_criteria": ["specific output contract"],
  "merge_policy": "advisory | patch proposal | isolated worktree diff"
}
```

And return a **Resume Package**:

```json
{
  "status": "success | partial | failed | blocked",
  "findings": [],
  "files_read": [],
  "files_changed": [],
  "commands_run": [],
  "tests": [],
  "summary": "compact reusable result",
  "risks": [],
  "recommended_next_step": "..."
}
```

### 5. Topology should be selected per task and validated as data

AgentConductor (`2602.17100v1`) treats agent interaction topology as a generated, difficulty-aware layered DAG. Using a **3B-parameter backbone** (Qwen2.5-Instruct-3B), it outperforms the strongest prior topology method by **14.6 percentage points in pass@1 accuracy** with a **68% reduction in token cost** and 13% reduction in topology density on the APPS benchmark - demonstrating that topology strategy and difficulty-aware density control contribute more than raw model scale.

**Best practice:** do not run unstructured group chats. Represent workflows as validated graphs.

Example `pi` topology schema:

```yaml
version: 1
budget:
  max_nodes: 5
  max_parallel: 2
  max_rounds: 2
  max_wall_minutes: 45
layers:
  - id: context
    parallel: true
    agents:
      - id: scout
        role: scout
        output: context.md
      - id: researcher
        role: researcher
        output: external-evidence.md
  - id: plan
    agents:
      - id: planner
        role: planner
        inputs: [scout, researcher]
        output: plan.md
  - id: build
    agents:
      - id: builder
        role: builder
        inputs: [plan]
        write: true
  - id: review
    parallel: true
    independent: true
    agents:
      - id: reviewer
        role: reviewer
      - id: tester
        role: tester
```

Validator rules:

- acyclic graph,
- known agents only,
- final validation phase for non-trivial changes,
- single writer unless isolated worktrees are used,
- max node/parallel/depth limits,
- no review agent sees peer review output during first pass,
- every edge has an artifact reference.

### 6. Context pruning and memory design are central, especially for constrained orchestration

SEMA (`2603.23875v1`) shows that reducing irrelevant observation data can cut latency and improve decision quality. Compared with the HIMA baseline, SEMA's structural-entropy-driven pruning reduced input tokens by **70%** and decision latency by **50%**, while achieving a 100% win rate on Melee maps. Its broader lesson is not StarCraft-specific: raw environment state is too large and noisy; the system must compress observations into decision-relevant state.

**Best practice:** all agent calls should pass curated context, not raw logs.

Recommended memory types (synthesised across SEMA, ELL/StuLife, and LIFE survey; the ELL paper formally defines six knowledge types: Trajectory Memory, Declarative Knowledge, Structural Knowledge, Procedural Knowledge, Meta-Knowledge, and Heuristic Knowledge):

| Memory | Purpose | Retention |
|---|---|---|
| Working memory | Current task state, active files, open blockers | Short-lived |
| Episodic memory | Run traces, failures, repairs, outcomes | Long-lived but compressed |
| Semantic memory | Project facts, architecture, APIs, docs | Updated with provenance |
| Procedural memory | Skills, prompt recipes, topology templates | Promoted only after validation |
| Negative memory | Known failed approaches and traps - *`pi`-specific extension, not a formal ELL category* | Retain as anti-patterns |

Retrieval should combine:

- file/path overlap,
- keyword match,
- dependency/call graph proximity,
- recency,
- outcome utility,
- embedding similarity where available,
- failure similarity.

### 7. Test-time scaling depends on summaries, selection, and reuse

The test-time scaling paper (`2604.16529v1`) argues that long-horizon agentic coding attempts produce trajectories too verbose to compare directly. The key artifact is a compact structured rollout summary. Recursive Tournament Voting compares summaries in small groups; Parallel-Distill-Refine uses selected summaries to condition fresh attempts.

**Best practice:** after every meaningful attempt, emit a structured summary:

```json
{
  "attempt_id": "...",
  "hypothesis": "root cause or solution strategy",
  "files_inspected": [],
  "files_changed": [],
  "commands_run": [],
  "tests_passed": [],
  "tests_failed": [],
  "progress_made": [],
  "failure_modes": [],
  "remaining_risks": [],
  "reusable_insights": [],
  "diff_ref": "...",
  "verdict": "candidate | reject | needs_refinement"
}
```

For `pi`, this maps naturally to:

- artifacts under `.pi/runs/<run-id>/`,
- summaries in JSONL or SQLite,
- pairwise or small-group selection agents,
- a refinement run seeded by the top 2-4 summaries,
- a final validation/judge pass based on tests and evidence, not style preference.

### 8. Multi-agent consensus can harm reasoning

The bystander-effect paper (`2605.10698v1`) directly challenges the assumption that more agents improve reasoning. Evaluated across **22,500 deterministic trajectories** spanning GAIA, SWE-bench, and MultiChallenge with three frontier models (Claude Sonnet 4.6, Gemini 3.1 Pro, GPT 5.4), it reports cognitive loafing, sovereignty gaps, and lead-anchor effects. Critically, GPT-5.4 suffers **total accuracy collapse with as few as n=2 auditors** - the Interaction Depth Limit DL - while Claude Sonnet 4.6 maintains perfect sovereignty across all plurality levels tested.

**Best practice:** critique must be independent before aggregation.

Rules for `pi` review phases:

- cap routine review to two validators, usually reviewer + tester,
- run them in separate sessions,
- do not show peer conclusions before first-pass output,
- shuffle/anonymize outputs before aggregation,
- aggregate by evidence quality, not vote count,
- preserve minority high-severity findings until disproven,
- treat peer claims as hypotheses, not truth.

Avoid prompts such as:

> "Three other agents agree this is correct. Verify quickly."

Prefer:

> "Independently inspect the code and tests. Derive findings only from repository evidence and command output. Do not assume another agent checked anything."

### 9. Self-evolution requires attribution first

The LIFE survey (`2605.14892v1`) organizes MAS as: Lay individual foundations, Integrate collaboration, Find faults through attribution, Evolve through self-improvement. The critical dependency is that collaboration produces traces; attribution identifies root causes; only then can evolution safely improve the system.

**Best practice:** never let a multi-agent system self-modify based only on final success/failure. It needs structured attribution.

Every failed run should answer:

- What failed? spec, plan, code, test, tool, memory, merge, review, budget, or environment?
- Where did it fail? agent, step, tool call, topology edge, memory item, or config instruction?
- How did it propagate?
- What evidence proves the diagnosis?
- What repair was applied?
- Did the repair validate?
- Should a prompt, skill, topology, memory, or extension policy change?

### 10. Self-evolution must obey safety-first laws

The self-evolving agents survey (`evolution-research/2508.07407v2`) frames the field as a progression from static foundation models to online adaptation, multi-agent orchestration, and finally multi-agent self-evolution. Its most useful operational contribution is the hierarchy **Endure → Excel → Evolve**:

1. **Endure:** preserve safety and stability.
2. **Excel:** preserve or improve task performance under safety constraints.
3. **Evolve:** autonomously optimize only after safety and performance gates pass.

**Best practice:** a `pi` system should not let agents directly rewrite production prompts, skills, tools, extensions, routing rules, or topologies. Evolution should be proposal-based:

```text
run traces → attribution → candidate change → safety gate → regression gate → human/owner approval when needed → staged rollout → monitoring → rollback
```

The evolvable search space should be explicit and bounded: prompt wording, agent contracts, skill triggers, topology templates, context slicing policies, validation ladders, and routing thresholds. Higher-risk artifacts-extension code, tool permissions, sandbox policy, credentials, network access-require stronger review and human approval.

### 11. Lifelong learning needs typed memory, skill lifecycle, and prospective agenda

The ELL/StuLife paper (`evolution-research/2508.19005v6`) argues that the bottleneck for self-evolving agents is **cognitive continuity**: agents fail to preserve the right details, transform experience into reusable skills, retrieve them at the right time, and act proactively on future obligations. A key empirical finding: even GPT-5, the best model evaluated, scores only **17.9 out of 100** on the StuLife benchmark, revealing a vast gap between current AI and human-level autonomous learning. The paper also demonstrates that naive RAG over raw trajectories actively **harms** performance by injecting unfiltered noise (Vanilla RAG StuGPA: 10.98, below the no-memory baseline); structured memory management (MemGPT) achieved the highest StuGPA at 19.99.

**Best practice:** every non-trivial `pi` run should produce a learning artifact in addition to the user deliverable:

- what changed,
- what evidence validated it,
- what failed or nearly failed,
- what should be remembered,
- which skill should be created or updated,
- what future obligation remains.

Use typed stores, not one undifferentiated transcript pile. The table below is a `pi`-specific synthesis; the ELL/StuLife paper formally defines six knowledge types (Trajectory Memory, Declarative Knowledge, Structural Knowledge, Procedural Knowledge, Meta-Knowledge, Heuristic Knowledge). **Prospective** is derived from ELL's *Proactive Initiative Score* metric rather than a standalone storage type in the paper; **Negative** is a `pi`-specific extension not in any cited paper:

| Memory type | Role in `pi` | Source |
|---|---|---|
| Working | active goal, plan, changed files, blockers | SEMA, AgentSpawn |
| Episodic | summarized runs, failures, repairs, outcomes | ELL, LIFE |
| Declarative | stable project facts, commands, user decisions, API constraints | ELL |
| Structural | file/module/tool/agent relationships and dependencies | ELL |
| Procedural | reusable skills, playbooks, validated topologies | ELL |
| Prospective | future obligations: pending tests, follow-ups, deferred cleanup - *from ELL's PIS metric* | ELL |
| Negative | known bad assumptions, failed strategies, unsafe patterns - *`pi`-specific extension* | (none; original) |

A reminder without execution context is not adequate memory. Prospective items should include triggers, why they matter, required files/commands, and success criteria.

### 12. Curriculum-driven self-evolution should generate frontier tasks, not arbitrary tasks

Agent0 (`evolution-research/2511.16043v1`) trains a curriculum agent and executor agent to co-evolve from zero external data using reinforcement learning (GRPO) on model weights - improving a Qwen3-8B-Base model by **18%** on mathematical reasoning and **24%** on general reasoning benchmarks. **Important scope note:** Agent0 achieves these gains through actual model weight updates via RL, not through prompt or config changes. The directly transferable lesson for `pi` is the curriculum *design principles*: a curriculum generator creates frontier tasks scored by executor uncertainty near 0.5 (neither trivially solved nor impossible), useful tool-call frequency, and novelty/diversity, while penalising repetition; only frontier cases - filtered to a challenging band - drive improvement.

**Best practice for `pi`:** create a curriculum/evaluation generator that turns real traces into challenge cases:

- failed validation commands,
- repeated tool misuse,
- context-retrieval misses,
- reviewer false negatives,
- ambiguous handoffs,
- stale-memory incidents,
- excessive-cost workflows,
- security-gate near misses.

A candidate challenge should include a task, oracle or validation method, required tools, novelty hash, difficulty estimate, and promotion criteria. Keep tasks that are informative-not trivial, not impossible, not duplicates.

A useful governance score (a `pi`-specific adaptation of Agent0's curriculum reward principles - Agent0 itself trains model weights via RL; these factors are applied here to config/prompt evaluation):

```text
score = validation_gain
      + frontier_uncertainty   # reward tasks near the executor's 0.5 self-consistency band
                               # (neither already solved nor impossible)
      + useful_tool_use        # capped; penalise spurious or excessive calls
      + novelty
      - repetition
      - cost_penalty
      - safety_risk
      - ambiguity_penalty
```

Promotion still requires passing safety and validation gates; the score only prioritizes candidates.

### 13. Evaluation quality determines self-evolution quality

The five eval-research papers collectively fill a critical gap in the self-evolution pipeline: they specify how the **evaluation signal** itself should be built, biased-proofed, and self-improved. Without a reliable judge, every stage of the loop—frontier task scoring, attribution validation, promotion gating, regression testing—drifts silently toward the judge's biases rather than genuine improvement.

**Five documented bias families** (LLM-as-a-Judge survey; self-preference paper):

| Bias | Description | Mitigation |
|---|---|---|
| **Position bias** | Judges systematically favour the option appearing first or second | Run both orderings; accept only position-consistent verdicts |
| **Length/verbosity bias** | Judges prefer longer, more elaborate outputs independent of quality | Explicit anti-verbosity instructions; separate length from correctness criteria |
| **Self-preference / self-enhancement** | The generator model scores its own outputs higher; GPT-4 achieves 73.5% out-of-box self-recognition and self-preference is **linearly correlated** with self-recognition | Use a different model family as judge — this is an architectural constraint, not a style choice |
| **Compassion-fade / identity inflation** | Attaching a prestigious model name (e.g., “GPT-4”) inflates scores | Strip model identity from all outputs before judging |
| **Style bias** | Judges prefer well-formatted, emoji-enriched outputs over correct plain text | Separate style criteria from correctness criteria in the evaluation plan |

**Why generative pairwise judgments beat scalar scores** (Con-J; LLM-as-a-Judge survey): scalar reward signals lack interpretability, amplify dataset biases, and produce no rationale for human oversight. A generative judge that outputs a rationale alongside its verdict exposes bias, enables spot-checking, and is more robust to distribution shift.

**Task-adaptive evaluation plans beat fixed rubrics** (EvalPlanner): a coding task’s evaluation plan should generate test cases; a skill proposal’s plan should check coherence and examples; a memory update’s plan should verify accuracy against source evidence. Unconstrained plans generated at inference time consistently outperform hand-crafted criteria lists across all tested benchmarks (93.9% on RewardBench with 22K synthetic pairs, matching models trained on 680K human-annotated pairs).

**The judge itself can self-improve without human labels** (Self-Taught Evaluators): generate synthetic preference pairs from run traces, rejection-sample judgments that are internally consistent and position-consistent, fine-tune or update judge prompts iteratively. Starting from Llama3-70B-Instruct (75.4% on RewardBench), five iterations of this loop reach 88.7%—outperforming the same model trained on 10K human-annotated preference pairs (85.6%).

**Best practice:** treat the judge as a first-class component, not an afterthought. Build it on a different model family from the generator, give it plan→execute→verdict structure, protect it from all five bias families, and close the loop by letting it improve from accumulated traces.

### Principle 1: Use the least complex workflow that can succeed

Multi-agent overhead is real: tokens, latency, coordination failures, context pollution, and social bias. A robust router should choose:

| Task type | Recommended workflow |
|---|---|
| Simple question or tiny edit | Single agent |
| Moderate code change | Plan → build → test/review |
| Unknown codebase or ambiguous feature | Scout/research → plan → build → independent review/test |
| High-risk refactor | Parallel context → plan → isolated build → independent validation |
| Research synthesis | Parallel independent researchers → evidence-weighted synthesis |
| Repeated failure | Failure-attribution → revised topology → refinement |

### Principle 2: Prefer tool-grounded evidence over agent opinion

A finding is strong when it cites:

- exact file/line,
- exact command and exit code,
- test output,
- API documentation,
- benchmark criteria,
- reproducible environment state.

A finding is weak when it says "likely," "seems," "consensus," or "another agent found" without evidence.

### Principle 3: Make every handoff an artifact

Agent communication should not be hidden in chat. Use artifacts:

- `context.md`,
- `plan.md`,
- `diff.patch`,
- `validation.md`,
- `review-findings.json`,
- `attempt-summary.json`,
- `failure-attribution.json`,
- `evolution-proposal.md`.

Artifacts enable replay, review, attribution, compression, and improvement.

### Principle 4: Keep one writer by default

Multiple write-capable agents create merge conflicts and ambiguous responsibility. Default policy:

- only builder writes to the main workspace,
- children are read-only advisory unless isolated in worktrees,
- concurrent patches require a coherence manager,
- final merge requires deterministic validation.

### Principle 5: Separate first-pass independence from second-pass synthesis

Independent generation first; aggregation second. This applies to:

- code review,
- research findings,
- plan critiques,
- failure attribution,
- self-evolution audits.

### Principle 6: Version prompts and configs like code

Prompts, context files, skills, topology templates, and routing hints affect behavior as much as code. They need:

- source control,
- review,
- changelogs,
- tests or evaluation tasks,
- rollback,
- conflict detection.

### Principle 7: Optimize for lifecycle performance

Measure not just final success, but:

- success per dollar/token,
- success per wall-clock minute,
- number of spawns,
- useful child contribution rate,
- validation pass rate,
- recurrence of failure categories,
- review false positive/negative rate,
- prompt/config regressions,
- rollback frequency.

### Principle 8: Evolve explicit artifacts, not hidden behavior

Self-evolution should target inspectable files and policies: prompts, skills, topology templates, routing rules, memory policies, validation checklists, and tool descriptions. Every candidate change needs a diff, source evidence, evaluation result, owner, and rollback path.

### Principle 9: Convert experience into typed memory before reuse

Do not retrieve raw conversation history unless debugging a specific past failure. First distill traces into typed facts, decisions, lessons, failures, skills, reminders, and evaluation cases with provenance and validation status.

### Principle 10: Use frontier curricula for improvement

A good self-evolution task is neither already solved nor impossible. Generate challenge cases from real failures and weak signals, deduplicate them, score uncertainty and tool demand, and use them as holdout/regression tests before promoting changes.

### Principle 11: The judge must not be the generator

Self-preference bias is an architectural failure, not a prompt-engineering problem. Because self-recognition capability and self-preference strength are linearly correlated — and frontier models achieve 73.5%+ out-of-box self-recognition — any system where the same backbone generates candidates AND evaluates them will systematically favour its own proposals. Route all pairwise evaluation to a different model family. Treat this as a hard constraint.

### Principle 12: Use plan-first evaluation, not fixed rubrics

Fixed evaluation checklists fail when applied to tasks they were not designed for. Generating an unconstrained, task-adaptive evaluation plan before each judgment (EvalPlanner approach) produces more reliable verdicts across the breadth of task types a `pi` system encounters, requires no domain-specific tuning, and enables the evaluation rationale to be spot-checked by humans.

---

## Recommended `pi` agent-system architecture

```text
pi supervisor
  ├─ task router
  ├─ context/config loader
  ├─ topology generator + validator
  ├─ spawn controller
  ├─ memory manager
  ├─ skill registry
  ├─ prospective agenda
  ├─ curriculum/evaluation generator
  ├─ artifact store
  ├─ tool/test runner
  ├─ worktree/sandbox manager
  ├─ review aggregator
  ├─ judge calibration tracker
  ├─ failure attribution engine
  ├─ self-evolution gate
  └─ metrics dashboard

agents
  ├─ scout
  ├─ researcher
  ├─ planner
  ├─ builder        # default single writer
  ├─ reviewer       # independent, evidence-based
  ├─ tester         # independent execution validator
  ├─ debugger
  ├─ summarizer
  ├─ memory-curator
  ├─ curriculum-generator
  ├─ judge            # cross-model pairwise evaluator
  ├─ failure-attributor
  └─ evolution-auditor

skills
  ├─ repo-context
  ├─ feature-spec
  ├─ test-validation
  ├─ failure-attribution
  ├─ rollout-summary
  ├─ topology-authoring
  ├─ anti-bystander-review
  └─ domain-specific skills
```

### Recommended `pi` resource layout

Use project-local resources for repository-specific behavior and package/global resources for reusable infrastructure:

```text
.pi/
  settings.json              # project package/resource settings when needed
  extensions/                # project-local TypeScript extensions
  agents/                    # project-local subagent definitions if trusted
  skills/                    # project-specific skills
  prompts/                   # workflow prompt templates
  runs/                      # proposed run artifacts and summaries
  mas-traces/                # proposed structured orchestration traces
  memory/                    # typed facts, episodes, skills, reminders, negative lessons
  curricula/                 # generated frontier challenge cases and holdout tasks
  evals/                     # regression/lifelong evaluation suites
  evals/judge-corpus/        # accumulated preference pairs, evaluation plans, calibration records
AGENTS.md                    # shared cross-tool agent contract
```

For reusable distribution, bundle resources as a `pi` package with a `package.json` manifest:

```json
{
  "name": "research-driven-pi-mas",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": []
  }
}
```

Security policy: load project-local agents/extensions only in trusted repositories; extensions execute with system permissions, and skills can instruct the model to run arbitrary commands.

### Extension layer

`pi` extensions are TypeScript modules that can register tools, commands, UI, event hooks, state, commands, shortcuts, and custom rendering. The following custom extensions are recommended.

| Extension | Purpose | Research basis |
|---|---|---|
| `trace-ledger` | Persist structured events for every run, agent, tool call, artifact, cost, and outcome. | LIFE attribution/evolution; test-time scaling summaries. |
| `topology-runner` | Execute schema-validated DAG workflows with node/layer budgets. | AgentConductor. |
| `spawn-controller` | Compute spawn scores and launch bounded subagents with memory slices. | AgentSpawn. |
| `memory-slicer` | Retrieve and compress relevant context for each agent. | AgentSpawn, SEMA. |
| `lifelong-memory` | Maintain typed memories with add/update/delete/combine/validate operations, salience, scope, status, and provenance. | ELL/StuLife. |
| `prospective-agenda` | Track future obligations, pending validations, spawned outputs awaiting review, and completion blockers. | ELL/StuLife prospective memory. |
| `attempt-summarizer` | Force every rollout to emit compact structured summaries. | Scaling Test-Time Compute. |
| `review-aggregator` | Shuffle/anonymize independent reviews; aggregate by evidence not votes. | Bystander Effect. |
| `validation-gate` | Enforce "no success without tests/checks." | FeatureBench. |
| `config-linter` | Detect contradictory `AGENTS.md`, skills, rules, prompts, and agent configs. | Configuring Agentic AI Coding Tools. |
| `worktree-manager` | Isolate parallel attempts and merge only validated diffs. | AgentSpawn coherence; coding-agent best practices. |
| `evolution-governor` | Propose prompt/skill/topology changes with human confirmation and rollback. | LIFE, pi-mas self-evolution; Endure/Excel/Evolve laws. |
| `curriculum-generator` | Generate repo-grounded frontier challenge cases from failures, uncertainty, weak validation, and tool misuse. | Agent0. |
| `skill-registry` | Track skill lifecycle states, triggers, contraindications, examples, success rates, and deprecation. | ELL/StuLife. |
| `judge-evolution` | Collect good/bad attempt pairs from traces; rejection-sample position-consistent judgments; iteratively refine judge evaluation plan prompts from accumulated corpus without human annotation. | Self-Taught Evaluators; EvalPlanner iterative DPO. |
| `safety-gate` | Block destructive shell commands, protected paths, unsafe extensions. | Pi extension security model and operational safety. |

### Agent definitions

Recommended initial agents:

#### `scout`

- **Write:** no.
- **Tools:** read/search/list/bash read-only.
- **Output:** compressed repository context, likely files, commands, risks.
- **Rules:** follow imports and call sites; do not guess architecture.

#### `researcher`

- **Write:** no.
- **Output:** external evidence with sources and applicability.
- **Rules:** prefer primary docs/papers/repos; mark uncertainty.

#### `planner`

- **Write:** no.
- **Output:** implementation plan with assumptions, acceptance criteria, validation ladder, and risk level.
- **Rules:** choose simplest topology that can work.

#### `builder`

- **Write:** yes, default single writer.
- **Output:** patch plus validation evidence.
- **Rules:** stop on ambiguous scope, failing environment, or unapproved architecture change.

#### `reviewer`

- **Write:** no by default.
- **Output:** evidence-backed findings only.
- **Rules:** independent; no reliance on peer reviewers; no majority reasoning.

#### `tester`

- **Write:** no, except optional temporary test probes in isolated workspace.
- **Output:** commands, exit codes, failure summaries, confidence.
- **Rules:** verify acceptance criteria and regressions.

#### `failure-attributor`

- **Write:** no.
- **Output:** root-cause classification, propagation path, repair recommendation.
- **Rules:** distinguish symptom from trigger.

#### `summarizer`

- **Write:** artifacts only.
- **Output:** compact attempt summaries and memory updates.
- **Rules:** preserve decisive details; omit low-value trace noise.

#### `memory-curator`

- **Write:** memory artifacts only.
- **Output:** typed memory add/update/delete/combine proposals with provenance, salience, validation status, and deprecation notes.
- **Rules:** prefer distilled facts, decisions, lessons, and skills over raw trace retrieval; flag contradictions and stale memories.

#### `curriculum-generator`

- **Write:** evaluation/challenge artifacts only.
- **Output:** frontier challenge cases with oracle, required tools, novelty hash, difficulty estimate, and promotion criteria.
- **Rules:** generate from real traces and weak spots; avoid duplicate, impossible, or unverifiable tasks.

#### `evolution-auditor`

- **Write:** no.
- **Output:** safety/performance/cost review of proposed prompt, skill, topology, memory, or tool-description changes.
- **Rules:** enforce Endure → Excel → Evolve; require rollback and evidence before promotion.

#### `judge`

- **Write:** no.
- **Model:** **must be a different model family** from the agent that produced the candidates being evaluated (self-preference constraint). If the builder/proposer is Claude-family, use Gemini or GPT-family, and vice versa.
- **Protocol:** Plan → Execute → Verdict:
  - *Plan:* generate an unconstrained, task-adaptive evaluation plan specifying what to check, how to verify, what a reference answer looks like, and which criteria are objective vs. subjective.
  - *Execute:* follow the plan step-by-step against both candidates, citing specific evidence from files, commands, test output, or memory.
  - *Verdict:* pairwise preference with rationale in structured JSON.
- **Anti-bias guards (mandatory):**
  - Run the judgment twice with candidates in reversed order; accept only verdicts consistent across both orderings.
  - Strip model identity, author attribution, and formatting decorations before judging.
  - Use majority vote (3+ samples) for high-stakes promotion decisions.
  - Prefer pairwise relative comparison over absolute numeric scores.
- **Output:** `{ "plan": "...", "execution": "...", "verdict": "A|B|tie", "rationale": "...", "position_consistent": true|false, "confidence": "high|medium|low" }`
- **Rules:** never judge outputs from your own model family; flag verbosity-biased verdicts; flag when verdict rationale references length or formatting rather than correctness or evidence.

### Skill layer

Skills should be used for recurring workflows that need more than a context file but less than a full extension.

Recommended project skills:

| Skill | Contents |
|---|---|
| `feature-spec` | How to turn a request into interfaces, F2P/P2P tests, and acceptance criteria. |
| `repo-validation` | Project-specific build/test/lint/typecheck commands and fallback checks. |
| `rollout-summary` | Required JSON/Markdown schema for attempt summaries. |
| `failure-attribution` | Failure taxonomy and postmortem workflow. |
| `anti-bystander-review` | Independent review instructions and aggregation rules. |
| `topology-authoring` | DAG schema, density caps, examples. |
| `context-pruning` | How to select relevant files/logs/memory slices. |
| `lifelong-memory` | Typed memory schemas, salience scoring, retrieval order, deprecation, and contradiction handling. |
| `skill-lifecycle` | How to create, validate, promote, measure, and deprecate reusable skills. |
| `prospective-agenda` | How to store future obligations with triggers, required context, commands, and completion criteria. |
| `curriculum-generation` | How to create frontier challenge cases from traces and evaluate them safely. |
| `eval-planning` | How to generate unconstrained, task-adaptive evaluation plans before judging; plan structure (objective verification steps, reference answer derivation, subjective criteria rubrics, edge-case checklist); anti-bias instructions (no identity, no length preference, position-swap protocol); output schema for plan+execution+verdict JSON. |
| `evolution-proposal` | How to propose prompt/skill/agent changes safely. |

Keep skills small, specific, and versioned. Include scripts only where deterministic automation adds value.

---

## Workflow recommendations

### Workflow A: simple task

```text
single agent → targeted validation → summary
```

Use when:

- one file or small question,
- low risk,
- clear requirements,
- cheap validation.

### Workflow B: standard implementation

```text
scout → planner → builder → independent reviewer + tester → adjudicated fixes
```

Use when:

- moderate feature or bug,
- unfamiliar code,
- tests available,
- validation matters.

### Workflow C: complex feature

```text
parallel scout/research → planner → builder in worktree → tester/debugger → reviewer/tester → final validation
```

Use when:

- multiple files/modules,
- feature-level change,
- external API/domain knowledge,
- high regression risk.

### Workflow D: repeated failure/refinement

```text
attempt summaries → failure attribution → select top evidence → refined attempt → final validation
```

Use when:

- two or more failed attempts,
- test failures persist,
- context is noisy,
- multiple hypotheses exist.

### Workflow E: self-evolution

```text
trace audit → attribution → improvement proposal → human approval → verify → promote/rollback
```

Use when:

- repeated workflow failure,
- recurring prompt/config issue,
- measurable opportunity to improve routing, skills, or topology.

### Workflow F: lifelong learning and curriculum improvement

```text
run trace → episode summary → typed memory/skill proposal → curriculum case generation → holdout evaluation → promotion gate
```

Use when:

- a run produces a reusable lesson,
- a failure reveals a missing skill or memory rule,
- agents repeatedly miss obligations or context,
- validation gaps need new challenge cases,
- a proposed change needs frontier/holdout evaluation before promotion.

### Workflow G: eval-agent self-improvement

```text
good/bad attempt pairs from traces
  → judge generates task-adaptive evaluation plan
  → judge executes plan against both candidates
  → position-swap check: retain only consistent verdicts
  → accumulate preference corpus in evaluation memory
  → rejection-sample: keep high-confidence, position-consistent judgments only
  → update judge evaluation plan prompts from corpus
  → better judge → better curriculum scoring → better self-evolution signals
```

Use when:

- judge position-consistency rate falls below 80%,
- self-evolution proposals are being accepted or rejected inconsistently,
- curriculum cases need more reliable frontier detection,
- a new task domain requires the judge to build new evaluation plans,
- accumulated trace corpus reaches a new size threshold (e.g., 500 confirmed pairs).

---

## Routing and spawning policy

### Difficulty estimate

Compute a rough difficulty score before topology selection:

```text
difficulty = f(
  affected_files,
  unknown_codebase,
  requirement_ambiguity,
  test_availability,
  security_risk,
  cross_module_dependencies,
  expected_loc,
  prior_failures,
  context_pressure
)
```

Suggested routing:

| Score | Workflow |
|---:|---|
| 0-2 | Single agent |
| 3-5 | Chain: plan/build/validate |
| 6-8 | Pipeline with scout/research and independent review/test |
| 9+ | Pipeline plus isolated worktrees, failure-attribution, and human checkpoints |

### Spawn score

Spawn only when useful. The five complexity metrics below are taken directly from AgentSpawn (`2602.07072v1`, Table 1 and Figure 3); the additional `pi`-specific factors that follow are extensions not in that paper:

```text
# --- From AgentSpawn (exact paper weights) ---
sspawn = 0.30 * norm(If)   # file interdependency count
       + 0.20 * norm(Cc)   # max cyclomatic complexity of modified functions
       + 0.25 * norm(Fc)   # test failure cascade count
       + 0.15 * norm(Oc)   # context window saturation fraction
       + 0.10 * norm(Uc)   # agent uncertainty (from logprobs)

# --- pi-specific extensions (not from the paper) ---
#    domain_specialization_need
#    parallelizable_hypotheses
#    expected_value_vs_cost
# Add these as weighted additions if adopting a richer spawn policy,
# but keep the five-factor formula as the validated baseline.
```

Default policy (from AgentSpawn paper, Table 1):

- spawn if `sspawn >= 0.7`,
- max spawn depth **3** (parent → child → grandchild),
- max concurrent children **4**,
- never spawn for social proof,
- never spawn without a merge/validation plan.

---

## Self-evolution governance policy

Use the self-evolution papers to separate **learning** from **promotion**. Agents may learn provisionally from every run, but persistent behavior changes require gates.

### Evolvable artifact classes

| Artifact | Default autonomy | Required gate |
|---|---|---|
| Episode summaries and negative lessons | automatic write | schema validation and provenance |
| Memory facts/decisions | proposal or automatic if directly evidenced | source citation, scope, confidence, deprecation path |
| Skills/playbooks | proposal | examples, preconditions, validation evidence, owner approval if broad scope |
| Prompt/agent instructions | proposal | diff, holdout evaluation, anti-conflict check, rollback |
| Topology/routing rules | proposal | comparison against baseline on task classes, cost and safety review |
| Tool descriptions | proposal | schema/tool-call regression checks |
| New tools/extensions/permissions | human-approved only | security review, sandboxing, rollback, least privilege |

### Memory lifecycle

Every persistent memory item should support:

- **Add:** save new validated facts, lessons, failures, commands, or obligations.
- **Update:** revise when source files, configs, tools, or user preferences change.
- **Delete/deprecate:** mark obsolete or contradicted information instead of silently retaining it.
- **Combine:** merge repeated lessons into one skill or rule.
- **Validate:** periodically check whether retrieved memory improves outcomes.

Minimum metadata:

```yaml
id: ...
type: fact | decision | skill | heuristic | episode | reminder | negative_lesson
scope: repo | project | user | global
status: provisional | validated | deprecated | contradicted
source: file | command | user | episode | external
salience: novel | constraint | future-critical | failure-linked | preference | validation-linked
created_at: ...
last_validated_at: ...
confidence: low | medium | high
```

### Skill promotion ladder

```text
raw trace → episode summary → lesson → provisional skill → validated skill → project policy/tool/test/hook → optional fine-tuning/eval data
```

Prefer deterministic internalization for critical rules. If an agent repeatedly forgets a validation step, add a gate or test; do not rely only on another reminder in a prompt.

### Curriculum loop

```text
trace corpus + known failures
  → curriculum-generator proposes challenge cases
  → current workflow attempts them with tools/tests
  → frontier filter selects informative cases (near p̂ ≈ 0.5)
  → judge agent evaluates pairwise: new behaviour vs. baseline on sampled tasks
       – different model family from generator
       – plan → execute → verdict with position-consistency check
       – majority vote (3+ samples) for promotion decisions
  → evolution-governor proposes bounded changes
  → safety/regression/cost gates decide promotion
```

Frontier cases should be neither solved by all runs nor failed by all runs. Ambiguous cases require better oracles, not training pressure. Judge verdicts that are not position-consistent are discarded and regenerated.

---

## Dedicated self-learning evaluation loop

The self-evolution pipeline (trace → attribution → proposal → gate → promotion) needs a reliable pairwise evaluation signal at every decision point. The five eval-research papers collectively specify how to build that signal, protect it from bias, and self-improve it over time.

### The problem

Currently, `pi`’s self-evolution loop relies on scalar proxies (test pass rate, attribution accuracy) to decide whether a proposed change is an improvement. Scalar signals:

- cannot explain *why* proposal B is better than proposal A,
- do not generalise to novel task types,
- are vulnerable to reward hacking (a change that improves test pass rate but degrades latency, safety, or coherence),
- silently incorporate the judge’s biases into the improvement direction.

A structured, self-improving judge addresses all four problems.

### Architecture of the evaluation loop

**Step 1 — Pair construction** *(Self-Taught Evaluators principle)*

From the trace ledger, identify pairs where one run succeeded and one failed, or where test-time scaling summaries have clear quality gaps. Additionally generate synthetic pairs by deliberately introducing a modified (degraded) instruction and running a new attempt against it — producing a known-quality preference pair without human annotation.

**Step 2 — Evaluation plan generation** *(EvalPlanner principle)*

The `judge` agent generates an unconstrained, task-adaptive evaluation plan for the specific pair. The plan is not a fixed rubric; it is generated from the task at hand:

- *Coding task pair:* plan generates test cases, checks for correctness and completeness, derives reference answer step-by-step.
- *Skill proposal pair:* plan checks coherence, preconditions, example coverage, and absence of contradictions.
- *Memory update pair:* plan verifies accuracy against cited source evidence, checks for staleness.
- *Topology proposal pair:* plan compares cost, depth, validation pass rate, and coherence properties.

**Step 3 — Plan execution and verdict** *(EvalPlanner principle)*

The judge executes the plan step-by-step against both candidates. Each step produces specific evidence. The final verdict is a pairwise preference with structured rationale. This grounds the decision in observable evidence rather than holistic impression.

**Step 4 — Bias filtering** *(LLM-as-a-Judge survey + self-preference paper)*

- Run the judgment in both candidate orderings.
- Retain only position-consistent verdicts (same winner regardless of order).
- Strip model identity, formatting, and length signals before judging.
- Route to a different model family from the generator.
- For high-stakes promotion decisions, use majority vote across 3+ independent judge samples.

Discard any verdict that fails the position-consistency check and regenerate with a different sampled evaluation plan.

**Step 5 — Corpus accumulation** *(Self-Taught Evaluators)*

Store confirmed preference pairs in evaluation memory with:

```yaml
type: preference_pair
task_type: coding | skill_proposal | memory_update | topology | ...
winner: A | B
rationale: "..."
position_consistent: true
judge_model_family: gemini | gpt | ...
generator_model_family: claude | ...
confidence: high | medium
trace_ref: "..."
created_at: ...
```

**Step 6 — Judge self-improvement** *(Self-Taught Evaluators + Con-J)*

Periodically:
1. Sample the judge’s predictions on a held-out subset of the corpus.
2. Identify correct vs. incorrect judgments using known-quality pairs as ground truth.
3. Use rejection sampling to collect correct reasoning chains.
4. Update the judge’s evaluation plan prompt library from the high-quality chains.
5. Track calibration metrics and trigger Workflow G if position-consistency drops.

This is the evaluation analogue of the curriculum self-improvement loop. Agent0 improves the executor; this loop improves the judge. Together they form a complete, human-label-free self-improvement system.

**Step 7 — Feed-forward to curriculum and evolution gates**

The improved judge feeds better signals into:

- **Curriculum scoring:** more reliable detection of which attempts are near the capability frontier (p̂ ≈ 0.5).
- **Evolution gates:** before/after pairwise comparison on held-out evaluation tasks determines whether a proposed skill or prompt change represents genuine improvement.
- **Attribution validation:** judge confirms that the attributed root cause is consistent with the observed quality difference between successful and failed runs.

### Judge calibration metrics

| Metric | What it measures | Target |
|---|---|---|
| Position-consistency rate | Fraction of verdicts unchanged when candidate order is swapped | ≥ 80% |
| Inter-run stability | Fraction of verdicts unchanged on identical re-runs (temperature > 0) | ≥ 90% |
| Known-pair accuracy | Accuracy on pairs where ground-truth quality is deterministic (e.g., test pass vs. fail) | ≥ 85% |
| Human spot-check agreement | Agreement with human reviewer on sampled pairs | Track trend |
| Verbosity-bias rate | Fraction of verdicts where rationale cites length as a quality signal | < 5% |

When any metric drifts outside target, trigger Workflow G to update the judge’s evaluation plans.

---

## Review and aggregation protocol

1. **Private first pass:** reviewer and tester run independently.
2. **Structured findings:** severity, file/line, command output, reproduction, suggested fix.
3. **Shuffle/anonymize:** remove order/model identity before synthesis.
4. **Cross-model judging:** when the same backbone generated the candidates being compared, route all pairwise judgments to a **different model family** to prevent self-preference contamination (GPT-4 achieves 73.5% out-of-box self-recognition; self-preference is linearly correlated with self-recognition).
5. **Position swap:** for every pairwise judgment, run both orderings; accept only verdicts consistent across both orderings. Flag any judgment that flips on reorder as unreliable and re-run with a different judge.
6. **Identity and style strip:** remove model names, author attribution, formatting decorations, and length signals before judging. The judge responds to substance only.
7. **Pairwise over scalar:** use relative comparison (A vs. B) rather than absolute numeric scores wherever possible; relative comparison is more stable under prompt variation.
8. **Evidence ranking:** correctness/security/test failures outrank style opinions.
9. **Minority preservation:** one reproducible blocker is enough to block.
10. **No majority vote:** disagreement triggers targeted validation or human escalation.
11. **Builder handoff:** pass only adjudicated findings and acceptance criteria.
12. **Trace outcomes:** record which findings were true, false, fixed, or deferred; track judge position-consistency rate over time — if it falls below 80%, flag judge prompts for revision.

---

## Failure taxonomy for attribution

| Category | Examples | Repair path |
|---|---|---|
| Spec failure | ambiguous requirements, missing interface | ask user, write executable spec |
| Context failure | missed files, wrong API, stale docs | improve scout/memory retrieval |
| Planning failure | bad decomposition, missing validation | revise plan template/topology |
| Tool failure | wrong command, schema hallucination, env issue | tool schema validation, environment doc |
| Implementation failure | syntax, cross-file dependency, semantic bug | builder fix, targeted tests |
| Verification failure | tests not run, wrong tests, flaky tests | validation gate update |
| Review failure | false positive/negative, anchoring | review prompt/aggregation update |
| Communication failure | bad handoff, lost assumption | artifact schema update |
| Memory failure | stale or irrelevant memory retrieved | memory decay/reranking |
| Merge/coherence failure | conflicting edits, partial patch | worktree/coherence policy |
| Budget failure | too many tokens/time/agents | routing/topology caps |
| Safety failure | destructive command, sensitive file | safety gate extension |

---

## Metrics to collect

### Outcome metrics

- task completion/resolution rate,
- all-checks-pass rate,
- regression rate,
- human acceptance rate,
- rollback rate.

### Efficiency metrics

- tokens per successful task,
- cost per successful task,
- wall-clock time,
- number of tool calls,
- context reduction ratio,
- retry count.

### MAS metrics

- spawn count,
- useful child contribution rate,
- topology nodes/edges/depth,
- review disagreement rate,
- false review finding rate,
- failure attribution accuracy,
- recurrence of failure categories.

### Evolution metrics

- proposed improvements,
- accepted improvements,
- verified improvements,
- reverted improvements,
- performance before/after,
- cost/risk deltas.

### Lifelong-learning metrics

- memory retrieval precision and usefulness,
- stale/contradicted memory rate,
- skill creation, validation, promotion, and deprecation counts,
- skill transfer success on related tasks,
- prospective obligation completion rate,
- forgetting/regression rate across older task classes,
- perfect-context vs realistic-context performance gap,
- curriculum case novelty, difficulty, and oracle quality.

### Evaluation (judge) metrics

- judge position-consistency rate (target ≥ 80%),
- known-pair accuracy (target ≥ 85%),
- inter-run stability on identical inputs (target ≥ 90%),
- verbosity-bias rate — fraction of verdicts citing length as quality signal (target < 5%),
- human spot-check agreement (track trend),
- confirmed preference pairs accumulated per week,
- judge plan revision count (tracks self-improvement activity).

---

## Concrete implementation roadmap for `pi`

### Phase 1: Foundation

- Create project `AGENTS.md` standard.
- Define core agents: scout, planner, builder, reviewer, tester, researcher.
- Add structured artifact directory: `.pi/runs/` or `.pi/mas-traces/`.
- Add validation gate: success requires explicit checks or documented reason checks are unavailable.
- Add anti-bystander review rules.

### Phase 2: Trace, summary, and typed memory system

- Implement `trace-ledger` extension.
- Emit structured run, agent, tool, artifact, cost, and validation events.
- Implement attempt-summary schema.
- Store failed attempts as reusable negative memory.
- Add typed memory records for facts, decisions, episodes, skills, reminders, and contradictions.
- Add salience metadata: novel, constraint, future-critical, failure-linked, preference, validation-linked.

### Phase 3: Topology and routing

- Implement task router with difficulty estimate.
- Define validated DAG workflow schema.
- Add topology caps by difficulty.
- Add standard workflows: simple, standard, complex, audit, repeated-failure.

### Phase 4: Dynamic spawning, memory slicing, and prospective agenda

- Implement spawn score.
- Create Spawn Package and Resume Package schemas.
- Add memory retrieval/slicing.
- Add worktree isolation for concurrent write attempts.
- Add agenda checks before final responses: pending validations, spawned outputs, unresolved assumptions, deferred cleanup.
- Store future obligations with full execution context, not vague reminders.

### Phase 5: Failure attribution

- Add failure-attributor agent.
- Add postmortem artifact schema.
- Classify recurring failures.
- Use attribution to update routing, prompts, skills, and validation.

### Phase 6: Skill lifecycle and lifelong learning

- Add `memory-curator` and `skill-registry` workflows.
- Convert repeated lessons into provisional skills.
- Validate skills on multiple tasks before promotion.
- Deprecate stale or harmful skills and memories.
- Add perfect-context vs realistic-context evaluations to separate reasoning failures from retrieval/memory failures.

### Phase 7: Conservative self-evolution

- Implement improvement proposal workflow.
- Require human approval for prompt/agent/skill/topology changes.
- Verify every change with regression tasks or structural validation.
- Add rollback.
- Enforce Endure → Excel → Evolve: safety, then performance, then autonomy.

### Phase 8: Curriculum-driven evaluation

- Generate frontier challenge cases from real failures and weak spots.
- Deduplicate and reject unverifiable/ambiguous challenge cases.
- Score uncertainty, useful tool use, novelty, cost, and safety risk.
- Use curriculum cases as holdout/regression tests before promoting changes.

### Phase 9: Eval agent and judge self-improvement

- Deploy structured pairwise `judge` agent using a **different model family** from the main generator.
- Implement plan → execute → verdict protocol with position-swap verification as a mandatory filter.
- Collect preference pairs from run traces (good/bad attempt pairs from outcome signals and synthetic degraded pairs).
- Apply rejection sampling to retain only position-consistent, high-confidence pairs.
- Iteratively refine judge evaluation plan prompts from the accumulated corpus (Workflow G).
- Track judge calibration metrics: position-consistency rate, known-pair accuracy, verbosity-bias rate.
- Feed calibrated judge outputs into curriculum scoring and evolution gate decisions.
- Add `evals/judge-corpus/` to the `.pi/` resource layout for storing preference pairs and evaluation plans.

### Phase 10: Test-time scaling

- Run small parallel attempts for high-value tasks.
- Summarize attempts.
- Use pairwise/small-group selection.
- Refine from the top 2-4 summaries.
- Final validation decides, not the judge alone.

---

## Research-to-policy mapping

| Research insight | `pi` policy |
|---|---|
| Feature tasks fail without explicit interfaces and tests. | Require executable specs and F2P/P2P validation for non-trivial code changes. |
| Agents guess instead of reading files. | Scout/read-before-edit policy; reviewers flag uninspected interface assumptions. |
| Context files dominate and `AGENTS.md` is emerging standard. | Make `AGENTS.md` the shared core; lint overlapping configs. |
| Dynamic spawning helps long-horizon complexity. | Spawn only from runtime metrics; bounded depth/concurrency. |
| Memory slicing reduces overhead. | Pass children curated memory slices and artifact refs, not full chat. |
| Topology density should match difficulty. | Route tasks to simple/chain/pipeline workflows with node caps; a 3B-parameter topology-aware orchestrator (AgentConductor) can outperform larger models. |
| Raw trajectories are poor scaling substrates. | Store structured summaries and use them for selection/refinement. |
| Consensus can induce cognitive loafing. | Independent reviewers, cap count, shuffle outputs, no majority voting; GPT-class models can collapse at n=2 auditors. |
| Self-evolution depends on failure attribution. | Build trace/attribution before autonomous prompt/skill/topology changes. |
| Self-evolving agents need safety-first laws. | Apply Endure → Excel → Evolve: safety gate, regression gate, then autonomy/promotion gate. |
| Lifelong learning requires cognitive continuity. | Maintain typed memories, skill lifecycle, prospective agenda, and run-end reflection; even GPT-5 scores 17.9/100 on StuLife without these. |
| Naive raw-trace RAG actively hurts. | Retrieve distilled typed memories first; Vanilla RAG fell *below* no-memory baseline in StuLife tests. |
| Agent0-style co-evolution selects frontier tasks (uncertainty ≈ 0.5). | In `pi`, generate challenge cases filtered to the capability frontier; borrow the curriculum principles, not the RL weight-training loop. |
| Tool-use rewards can be hacked. | Reward useful tool use that changes decisions or validates outcomes; cap calls (Agent0 uses C=4 cap) and audit. |
| Real-time systems need observation pruning. | Enforce context budgets and pruning before every agent call; SEMA achieved 70% token reduction and 50% latency reduction via structural-entropy pruning. |
| Self-preference is linear in self-recognition; GPT-4 73.5% self-recognition out-of-box. | Never use the same model family as both generator and judge in any self-evolution loop — hard architectural constraint, not style preference. |
| Iterative evaluator self-improvement from zero human labels is possible. | Build a self-improving judge from accumulated traces; generate synthetic preference pairs; rejection-sample correct position-consistent judgments; update judge plans iteratively. |
| Plan→execute→verdict (EvalPlanner) outperforms fixed evaluation rubrics; 93.9% on RewardBench with 22K synthetic pairs. | Generate task-adaptive, unconstrained evaluation plans before each pairwise judgment; do not hard-code criteria lists. |
| Position bias and length bias systematically distort LLM judgments. | Swap response order, strip identity and formatting, require position-consistent verdicts across both orderings; prefer pairwise over scalar. |
| Scalar reward signals lack interpretability and amplify dataset biases. | Use generative pairwise judges with verbal rationale for all self-evolution proposal evaluations; bootstrap from self-generated contrastive pairs (Con-J approach). |

---

## Risks and cautions

1. **Preprint uncertainty:** several papers are 2026 preprints; treat quantitative results as directional, not guaranteed.
2. **Benchmark transfer risk:** results from coding contests, StarCraft, or benchmark environments may not transfer directly to production software.
3. **Overfitting to traces:** self-evolution can optimize for local tasks and degrade general behavior.
4. **Prompt/config drift:** duplicated instructions across `AGENTS.md`, skills, agents, and prompts can conflict.
5. **Security:** `pi` extensions and packages run with system permissions; skills can instruct dangerous actions. Use trust boundaries and safety gates.
6. **Aggregation bias:** even independent reviews can be mis-aggregated if the coordinator overweights first/longer/more confident outputs.
7. **Memory poisoning:** stale, incorrect, or over-retrieved memory can create systematic failures.
8. **Cost runaway:** parallel rollouts and rich topologies can consume tokens quickly. Enforce budgets outside prompts.
9. **Naive memory retrieval:** raw trajectories can inject noise and degrade reasoning. Use typed, summarized, validated memory first.
10. **Curriculum collapse:** generated self-evolution tasks can become repetitive, ambiguous, or unverifiable. Deduplicate and require oracles.
11. **Reward hacking:** tool-use, novelty, or solve-rate rewards can be gamed. Use composite scores and safety/cost penalties.
12. **Autonomous drift:** prompt/skill/topology changes can silently change behavior. Require diffs, evaluation, approval, and rollback.
13. **Self-preference contamination:** if the same model backbone generates AND evaluates its own proposed changes, it will systematically favour acceptance. Self-recognition accuracy (73.5% for GPT-4 out-of-box) directly predicts this inflation. Cross-model judging is a hard architectural constraint, not optional.
14. **Judge verbosity and length bias:** LLM judges favour longer, more elaborately formatted outputs independent of quality. Suppress with explicit anti-verbosity criteria and structure-stripping before judging.
15. **Judge style bias:** judges may prefer outputs with headers, bullet points, or emojis over correct plain-text outputs. Separate style criteria from correctness criteria in every evaluation plan.
16. **Judge version drift:** as judge evaluation plans evolve via self-improvement, historical comparisons become unreliable. Maintain frozen judge plan snapshots for regression testing; never compare a new run against an old baseline judged by a different plan version without re-judging both on the same plan.
17. **Compassion-fade / identity inflation:** presenting a model name (e.g., “generated by GPT-4”) inflates scores. Always strip model identity from all outputs before the judge sees them.

---

## Final recommendations

Build the `pi` multi-agent system as a **small, inspectable, evidence-first orchestration layer** rather than a large free-form swarm.

The initial high-leverage package should include:

1. `AGENTS.md` template and config linter.
2. Core agents: scout, planner, builder, reviewer, tester, researcher.
3. Anti-bystander review protocol.
4. Trace ledger and attempt-summary artifacts.
5. Validation gate with project-specific commands.
6. Simple router: normal → chain → pipeline.
7. Failure attribution schema.
8. Typed memory substrate with salience, provenance, validation status, and deprecation.
9. Skill registry with provisional/validated/deprecated lifecycle states.
10. Prospective agenda for pending validations, reminders, spawned outputs, and deferred obligations.
11. Curriculum generator for frontier challenge cases.
12. Cross-model `judge` agent (different family from generator) with plan→execute→verdict protocol and position-swap filter.
13. Human-approved improvement workflow.

Only after those foundations are reliable should the system add aggressive dynamic spawning, topology evolution, test-time scaling, and automated self-evolution. The research is clear: MAS quality comes from **structured coordination, independent evidence, executable validation, memory discipline, curriculum-grounded evaluation, trustworthy cross-model judging, and closed-loop learning**, not from more agents or louder consensus.
