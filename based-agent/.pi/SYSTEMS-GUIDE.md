# SYSTEMS-GUIDE.md — Research-Driven Pi MAS

**System:** Research-Driven Pi Multi-Agent System
**Version:** 1.0.0
**Date:** 2026-05-19
**Authority:** Operational reference guide. For the binding agent contract, see `AGENTS.md`.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Directory Structure](#2-directory-structure)
3. [Autopilot Supervisor](#3-autopilot-supervisor)
4. [Extensions — What They Do](#4-extensions)
5. [13 Agents — When to Invoke Them](#5-13-agents)
6. [13 Skills — Automatic Selection](#6-13-skills)
7. [7 Workflow Templates (A–G)](#7-7-workflow-templates)
8. [9-Phase Implementation Roadmap](#8-9-phase-implementation-roadmap)
9. [Self-Learning Evaluation Loop (Steps 1–7)](#9-self-learning-evaluation-loop)
10. [Spawn Score Formula](#10-spawn-score-formula)
11. [Judge Calibration Targets](#11-judge-calibration-targets)
12. [Memory Types and How to Add Entries](#12-memory-types-and-how-to-add-entries)
13. [Research Basis Summary](#13-research-basis-summary)

---

## 1. Getting Started

### 1.1 Prerequisites

- **pi** coding agent installed and configured
- Node.js 18+ (for TypeScript extensions)
- Access to at least two different LLM model families (e.g., Claude + Gemini, or Claude + GPT) — required for cross-model judging

### 1.2 Install

This system is a project-local pi package. It activates automatically when pi is run from this repository root. The `package.json` and `.pi/settings.json` files register all extensions, skills, and prompts.

```bash
# Clone or navigate to the repository
cd /path/to/based-agent

# Pi will auto-discover resources via package.json:
# {
#   "pi": {
#     "extensions": [".pi/extensions"],
#     "skills": [".pi/skills"],
#     "prompts": [".pi/prompts"]
#   }
# }

# Run pi
pi
```

### 1.3 Configuration

The system has three configuration layers:

| File | Purpose |
|---|---|
| `AGENTS.md` | Cross-tool operating contract — read by all agents at task start |
| `.pi/settings.json` | Pi-specific resource discovery and feature flags |
| `.pi/autopilot.json` | Autopilot autonomy, retry, memory, reload, review, and research-import settings |
| `package.json` | Package manifest — pi uses this to discover extensions/skills/prompts |

### 1.4 First Run Checklist

Before using the system for the first time:

1. **Review `AGENTS.md`** — understand safety boundaries and escalation conditions
2. **Confirm two model families are available** — judge must differ from generator
3. **Check `.pi/memory/` is writable** — memory-curator and autopilot completion promotion need write access
4. **Verify `.pi/evals/judge-corpus/` exists** — judge-evolution extension writes here
5. **Set up safety-gate extension** — prevents destructive shell commands (see Phase 1 roadmap)
6. **Review `.pi/autopilot.json`** — default is autonomous, with proposal-first protected changes and checkpointed reload behavior

### 1.5 Running Your First Task

```
# Simple task (single agent, Workflow A):
"Fix the typo in config.ts line 42"

# Standard feature (Workflow B):
"Add email validation to the registration form"

# Complex feature (Workflow C):
"Implement OAuth2 integration with Google and GitHub providers"

# Repeated failure (Workflow D):
"The database connection pool keeps timing out — investigate and fix"
```

Pi will route tasks through the appropriate workflow based on difficulty scoring. Autopilot is the default supervisor: it profiles the task, selects skills, retrieves memory, records working memory during development, and coordinates validation/review/completion hooks without the user manually invoking each command.

---

## 2. Directory Structure

```
based-agent/
├── AGENTS.md                          # Cross-tool agent operating contract
├── package.json                       # Pi package manifest
└── .pi/
    ├── settings.json                  # Pi settings: extensions, skills, prompts
    ├── autopilot.json                 # Default automation policy
    ├── RESEARCH-REPORT.md             # Source research synthesis (18 papers)
    ├── SYSTEMS-GUIDE.md               # This file
    ├── extensions/                    # TypeScript extensions
    │   ├── autopilot.ts
    │   ├── trace-ledger.ts
    │   ├── topology-runner.ts
    │   ├── spawn-controller.ts
    │   ├── memory-slicer.ts
    │   ├── lifelong-memory.ts
    │   ├── prospective-agenda.ts
    │   ├── attempt-summarizer.ts
    │   ├── review-aggregator.ts
    │   ├── validation-gate.ts
    │   ├── config-linter.ts
    │   ├── worktree-manager.ts
    │   ├── evolution-governor.ts
    │   ├── curriculum-generator.ts
    │   ├── skill-registry.ts
    │   ├── judge-evolution.ts
    │   ├── safety-gate.ts
    │   └── additional memory, skill, context, trajectory, and command-hub extensions
    ├── agents/                        # Agent definitions (13 total)
    │   ├── scout.md
    │   ├── researcher.md
    │   ├── planner.md
    │   ├── builder.md
    │   ├── reviewer.md
    │   ├── tester.md
    │   ├── debugger.md
    │   ├── summarizer.md
    │   ├── memory-curator.md
    │   ├── curriculum-generator.md
    │   ├── judge.md
    │   ├── failure-attributor.md
    │   └── evolution-auditor.md
    ├── skills/                        # Skill definitions (13 total)
    │   ├── feature-spec.md
    │   ├── repo-validation.md
    │   ├── rollout-summary.md
    │   ├── failure-attribution.md
    │   ├── anti-bystander-review.md
    │   ├── topology-authoring.md
    │   ├── context-pruning.md
    │   ├── lifelong-memory.md
    │   ├── skill-lifecycle.md
    │   ├── prospective-agenda.md
    │   ├── curriculum-generation.md
    │   ├── eval-planning.md
    │   └── evolution-proposal.md
    ├── prompts/                       # Workflow prompt templates (7 total)
    │   ├── workflow-a-simple.md
    │   ├── workflow-b-standard.md
    │   ├── workflow-c-complex.md
    │   ├── workflow-d-refinement.md
    │   ├── workflow-e-evolution.md
    │   ├── workflow-f-lifelong.md
    │   └── workflow-g-judge-improvement.md
    ├── runs/                          # Run artifacts and attempt summaries
    │   └── <run-id>/
    │       ├── context.md
    │       ├── plan.md
    │       ├── attempt-summary.json
    │       ├── review-findings.json
    │       └── failure-attribution.json
    ├── mas-traces/                    # Structured orchestration trace events
    ├── memory/                        # Typed memory stores
    │   ├── working/
    │   ├── episodic/
    │   ├── declarative/
    │   ├── structural/
    │   ├── procedural/
    │   ├── prospective/
    │   └── negative/
    ├── curricula/                     # Frontier challenge cases
    └── evals/
        └── judge-corpus/              # Preference pairs and evaluation plans
```

---

## 3. Autopilot Supervisor

Autopilot is the default operating layer for normal Pi usage. The user should be able to prompt for a build, fix, review, or research task and let the system choose the right skills, extensions, memory, validation, and review flow.

### 3.1 Interaction Model

```text
user prompt
  -> task profile and workflow selection
  -> skill and memory selection
  -> capability plan
  -> working-memory updates during development
  -> validation/review/retry
  -> completion promotion, proposals, and runtime report
```

Autopilot announces its selected workflow, skills, relevant memory, and retry budget. It then injects operating instructions into the agent context so the chosen skills and extension capabilities are used even when the user did not call them by name.

### 3.2 Automatic Capability Plan

| Phase | Automatically incorporated components |
|---|---|
| Startup | `config-linter`, `memory-hygiene-gate`, `revisitable-memory-router`, `skill-ecosystem-auditor` when relevant |
| Planning | `context-pack-builder`, `memory-slicer`, `spawn-controller`, `topology-runner` when complexity warrants it |
| During work | `trace-ledger`, `safety-gate`, `validation-gate`, `working_memory_add`, retry steering |
| Review | `review-aggregator`, `judge-evolution`, `eval-planning` when risk or prompt requires evaluation |
| Completion | `attempt-summarizer`, `trajectory-auditor`, `context-memory-curator`, `skill-internalizer`, `skill-memory-curator`, `curriculum-generator`, `evolution-scanner`, `evolution-governor` |

### 3.3 Memory During Development

Autopilot writes working memory while the task is still active so the current session can use newly discovered constraints, failures, decisions, and validation signals. A checkpointed refresh injects the latest working-memory items back into the running context. At completion, eligible items promote according to `.pi/autopilot.json`.

Failed-attempt lessons begin as session-local working memory. They can promote after task completion, which prevents premature durable memory pollution while still letting the current run learn from its own failures.

### 3.4 Governed Changes

Protected changes remain proposal-first. Autopilot may identify that an extension, skill, prompt, routing rule, topology, or policy should change, but those changes go through the evolution proposal/governor path instead of direct application.

### 3.5 Configuration

| Setting | Default | Purpose |
|---|---:|---|
| `enabled` | `true` | Enables the supervisor layer |
| `mode` | `autonomous` | Uses relevant skills/extensions automatically |
| `retry_limit` | `2` | Validation retry budget before escalation |
| `working_memory.promote_on_completion` | `true` | Allows task-local memory to become durable after completion |
| `durable_memory.write_mode` | `automatic` | Writes durable memory automatically; use `proposal_first` for review-first memory |
| `working_skills.proposal_first` | `true` | Routes skill candidates into governed outputs |
| `reload.strategy` | `checkpointed` | Refreshes working context at turn boundaries |
| `review.auto_review` | `risk_based` | Runs review behavior when task risk justifies it |
| `external_research.ralph_proposals_path` | `../ralph-loop/data/proposals/proposals.json` | Optional proposal corpus for local inspiration |

### 3.6 Commands

| Command | Use |
|---|---|
| `/autopilot` | Show current workflow, profile, skills, memory hits, capability plan, and artifact path |
| `/autopilot reload` | Reload Pi resources after durable skill/prompt/extension changes |
| `/autopilot promote` | Force completion-style working-memory promotion |
| `/ba autopilot` | Command-hub pointer to the same status and reload controls |

### 3.7 Artifacts

Autopilot writes run-local artifacts under `.pi/runs/<date>/<run-id>/`:

| Artifact | Purpose |
|---|---|
| `working-memory.jsonl` | Session-local facts, failures, decisions, observations, and validation signals |
| `working-skills.jsonl` | Session-local skill candidates |
| `context-pack-autopilot.md` | Compact profile, skill, capability, memory, and proposal inspiration pack |
| `autopilot-runtime.json` | Completion report with profile, commands, files, failures, and promotion counts |

---

## 4. Extensions

Extensions are TypeScript modules that register tools, event hooks, commands, and custom rendering in pi. They execute with system permissions. New extensions require human approval (see `AGENTS.md` Section 5.5).

### Extension 1: `trace-ledger`

**Purpose:** Persist structured events for every run, agent, tool call, artifact, cost, and outcome.

**Research basis:** LIFE framework (attribution before evolution); test-time scaling (attempt summaries as scaling substrate).

**What it does:**
- Emits a structured event at every agent invocation, tool call, artifact write, validation run, and task completion
- Stores events in `.pi/mas-traces/` as JSONL with run-id, timestamp, agent role, tool, cost, and outcome
- Provides replay capability for attribution and self-evolution
- Feeds the attempt-summarizer and curriculum-generator

**Event schema:**
```jsonc
{
  "run_id": "...",
  "event_type": "agent_start | tool_call | artifact_write | validation | task_end",
  "agent_role": "scout | planner | builder | ...",
  "tool": "read | bash | ...",
  "input_tokens": 0,
  "output_tokens": 0,
  "cost_usd": 0.00,
  "outcome": "success | failure | partial",
  "artifact_ref": "path or null",
  "timestamp": "ISO 8601"
}
```

**When it activates:** Automatically on every pi session.

---

### Extension 2: `topology-runner`

**Purpose:** Execute schema-validated DAG workflows with per-node budgets and dependency enforcement.

**Research basis:** AgentConductor — topology as data; difficulty-aware density control achieved 14.6 pp accuracy gain, 68% token reduction over prior methods.

**What it does:**
- Validates topology YAML against the DAG schema (acyclic, known agents, single writer, node/parallel/depth caps)
- Executes layers in dependency order, parallelizing nodes within a layer when marked `parallel: true`
- Enforces artifact references on every edge (no agent receives context from the void)
- Enforces review agent isolation: no reviewer sees peer output during first pass
- Reports per-node token cost and validation status

**Topology YAML schema (excerpt):**
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
  - id: review
    parallel: true
    independent: true   # isolates agents from each other's output
    agents:
      - id: reviewer
        role: reviewer
      - id: tester
        role: tester
```

---

### Extension 3: `spawn-controller`

**Purpose:** Compute spawn scores and launch bounded subagents with memory slices.

**Research basis:** AgentSpawn — dynamic spawning, memory slicing, Spawn/Resume Packages, coherence management.

**What it does:**
- Computes `sspawn` using the 5-factor formula (see Section 9)
- Blocks spawning when `sspawn < 0.7`, depth > 3, or concurrent children ≥ 4
- Constructs Spawn Packages with bounded task, role, constraints, memory slices, allowed tools, and budget
- Validates Resume Packages from child agents before integrating findings
- Logs spawn cost and useful contribution rate to trace-ledger

---

### Extension 4: `memory-slicer`

**Purpose:** Retrieve and compress relevant context for each agent call.

**Research basis:** AgentSpawn (pass memory slices, not full history); SEMA (structural-entropy pruning cut tokens 70%, latency 50%).

**What it does:**
- Retrieves relevant memory items using a priority-ranked multi-signal query: file/path overlap, keyword match, dependency proximity, recency, outcome utility, and failure similarity
- Compresses the retrieved slice to fit the agent's context budget
- Strips low-salience items below a configurable threshold
- NEVER returns raw conversation history for general task use

**Retrieval priority order:**
1. Structural (dependency graph, file relationships)
2. Declarative (facts, decisions, commands)
3. Procedural (skills, playbooks)
4. Negative (anti-patterns)
5. Episodic (past runs, similar tasks)
6. Prospective (open obligations)

---

### Extension 5: `lifelong-memory`

**Purpose:** Maintain typed memories with add/update/delete/combine/validate operations, salience, scope, status, and provenance.

**Research basis:** ELL/StuLife — GPT-5 scores 17.9/100 without structured memory; MemGPT achieved 19.99/100 (highest); naive RAG scored 10.98 (below no-memory baseline).

**What it does:**
- Maintains 7 typed memory stores: working, episodic, declarative, structural, procedural, prospective, negative
- Enforces the full memory item schema (id, type, scope, status, source, salience, confidence, provenance)
- Provides add/update/deprecate/contradict/combine/validate operations (memory-curator agent only)
- Periodic validation: checks whether retrieved memory improved recent outcomes; flags stale items
- Blocks bulk deletion without human approval

---

### Extension 6: `prospective-agenda`

**Purpose:** Track future obligations, pending validations, spawned outputs awaiting review, and completion blockers.

**Research basis:** ELL/StuLife Proactive Initiative Score (PIS) — agents fail because they don't act on future obligations; a reminder without execution context is inadequate memory.

**What it does:**
- Maintains a prospective agenda store in `.pi/memory/prospective/`
- Each item includes: trigger condition, why it matters, required files/commands, success criteria, deadline/staleness threshold
- At task end, the supervisor checks the agenda for open items before emitting a final response
- Integrates with trace-ledger to detect when spawned child outputs are awaiting integration
- Escalates overdue items to the human operator

---

### Extension 7: `attempt-summarizer`

**Purpose:** Force every meaningful rollout to emit a compact structured attempt summary.

**Research basis:** Scaling Test-Time Compute — structured summaries are the substrate for RTV (Recursive Tournament Voting) and PDR (Parallel-Distill-Refine); raw traces are too verbose for direct comparison.

**What it does:**
- Intercepts task completion and requires an attempt summary before the run closes
- Validates the summary schema (see Section 5, `rollout-summary` skill)
- Stores summaries in `.pi/runs/<run-id>/attempt-summary.json`
- Feeds summaries to the selection and refinement pipelines for test-time scaling

**Summary schema:**
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

---

### Extension 8: `review-aggregator`

**Purpose:** Shuffle and anonymize independent reviews; aggregate by evidence quality, not vote count.

**Research basis:** Bystander Effect paper — 22,500 trajectories; GPT-5.4 collapses at n=2 auditors; cognitive loafing, sovereignty collapse, lead-anchor bias quantified.

**What it does:**
- Collects independent reviewer and tester outputs
- Strips model identity and ordering signals before synthesis
- Aggregates by evidence weight (correctness/security > style)
- Preserves minority high-severity findings until disproven
- Blocks majority-vote resolution — disagreement triggers targeted validation or escalation
- Never prompts with "other agents agreed" or similar social proof

---

### Extension 9: `validation-gate`

**Purpose:** Enforce "no success without passing tests/checks."

**Research basis:** FeatureBench — agents fail at feature tasks because they don't run tests; Claude Opus 4.5 reaches 74.4% on SWE-bench but only ~11% on FeatureBench. No-test = not done.

**What it does:**
- Maintains the project-specific validation command ladder from `AGENTS.md` Section 3
- Intercepts task completion and requires evidence that all available validation commands passed
- Accepts documented reasons only when specific commands are genuinely unavailable (not skipped)
- Logs validation outcomes to the trace-ledger
- Blocks "done" status on tasks with available but unrun checks

---

### Extension 10: `config-linter`

**Purpose:** Detect contradictory AGENTS.md, skills, rules, prompts, and agent configs before they cause silent failures.

**Research basis:** Configuring Agentic AI Coding Tools study (2,853 repos) — 85.5% of skills contain no executable scripts; configs can drift and contradict each other.

**What it does:**
- Scans `AGENTS.md`, `.pi/skills/`, `.pi/prompts/`, `.pi/agents/`, and tool-specific config files for contradictions
- Detects duplicate rules, conflicting constraints, stale references, and missing required sections
- Reports conflicts before task execution so agents don't receive contradictory instructions
- Flags skills with no examples, no preconditions, or no validation evidence
- Integrates with evolution-governor to check proposed changes against existing configs

---

### Extension 11: `worktree-manager`

**Purpose:** Isolate parallel write attempts and merge only validated diffs.

**Research basis:** AgentSpawn coherence management; coding-agent best practices for concurrent editing.

**What it does:**
- Creates isolated git worktrees for parallel builder attempts
- Enforces the single-writer rule in the main workspace
- Manages coherence: detects conflicting edits across worktrees before merge
- Validates a diff before promoting it to the main workspace
- Rolls back failed merge attempts automatically

---

### Extension 12: `evolution-governor`

**Purpose:** Propose prompt/skill/topology/agent changes with human confirmation and rollback capability.

**Research basis:** LIFE framework; Endure/Excel/Evolve laws from self-evolving agents survey.

**What it does:**
- Receives improvement proposals from the evolution-auditor agent
- Applies the Endure → Excel → Evolve gate sequence (Section 10 of AGENTS.md)
- Requires: diff artifact, holdout evaluation result, anti-conflict check, rollback plan
- Routes high-risk proposals (new tools, extensions, permissions) to human approval queue
- Maintains a changelog of all accepted proposals with before/after snapshots
- Supports one-command rollback of any promoted change

---

### Extension 13: `curriculum-generator`

**Purpose:** Generate repo-grounded frontier challenge cases from failures, uncertainty, and weak validation.

**Research basis:** Agent0 — curriculum/executor co-evolution; frontier task filtering at uncertainty ≈ 0.5; +18% math reasoning, +24% general reasoning on Qwen3-8B-Base.

**What it does:**
- Mines trace-ledger for failure categories, repeated tool misuse, context-retrieval misses, reviewer false negatives
- Generates challenge cases scored by: frontier uncertainty (self-consistency ≈ 0.5), useful tool use, novelty, cost, safety risk
- Deduplicates using novelty hashes; rejects unverifiable or impossible tasks
- Stores cases in `.pi/curricula/` with oracle, required tools, difficulty estimate, and promotion criteria
- Feeds cases to the judge for pairwise evaluation of proposed changes vs. baseline

---

### Extension 14: `skill-registry`

**Purpose:** Track skill lifecycle states, triggers, contraindications, examples, success rates, and deprecation.

**Research basis:** ELL/StuLife — skill learning and internalization; skill lifecycle management.

**What it does:**
- Maintains skill records with fields: trigger patterns, preconditions, contraindications, examples, success_rate, status (provisional/validated/deprecated)
- Tracks skill promotion through the ladder: lesson → provisional → validated → policy
- Measures skill performance per task type
- Deprecates skills with declining success rates or contradicted assumptions
- Integrates with config-linter to detect stale skill references

---

### Extension 15: `judge-evolution`

**Purpose:** Collect good/bad attempt pairs from traces; rejection-sample position-consistent judgments; iteratively refine judge evaluation plan prompts from accumulated corpus without human annotation.

**Research basis:** Self-Taught Evaluators (75.4 → 88.7% RewardBench in 5 iterations); EvalPlanner iterative improvement; Con-J contrastive judgment pairs.

**What it does:**
- Identifies preference pairs from the trace-ledger: success vs. failure on same task type, or synthetic degraded pairs
- Routes pairs to the judge agent (different model family from generator)
- Runs position-swap verification: accepts only verdicts consistent across both orderings
- Applies rejection sampling: keeps only position-consistent, high-confidence judgments
- Stores accepted pairs in `.pi/evals/judge-corpus/` with full schema validation
- Periodically samples held-out corpus to measure judge calibration metrics
- Triggers Workflow G when position-consistency rate drops below 80%
- Updates judge evaluation plan prompts from high-quality reasoning chains

---

### Extension 16: `safety-gate`

**Purpose:** Block destructive shell commands, protected path writes, and unsafe extension behaviors.

**Research basis:** Pi extension security model; operational safety best practices; AGENTS.md safety boundaries.

**What it does:**
- Intercepts all shell command tool calls and validates against a blocklist: `rm -rf`, `git reset --hard`, `DROP TABLE`, `truncate`, `wipefs`, and similar destructive patterns
- Blocks writes to protected paths: `.pi/evals/judge-corpus/` (without schema validation), `.pi/memory/` (without memory-curator authorization), `AGENTS.md` (without human approval)
- Requires explicit confirmation from the human operator for any destructive action
- Logs all gate events to trace-ledger with blocking reason
- Cannot be bypassed by agent instructions — only by human confirmation

---

## 5. 13 Agents

### When to Invoke Each Agent

| Agent | Role | Invoke When | Write? |
|---|---|---|---|
| `scout` | Repository context collector | Before any non-trivial task; unknown codebase; uncertain file structure | No |
| `researcher` | External evidence gatherer | Need API docs, best practices, library documentation, or competitive analysis | No |
| `planner` | Task architect | After context is established; before any code is written | No |
| `builder` | Code writer (default writer) | Plan is approved; all ambiguities resolved | Yes |
| `reviewer` | Adversarial code reader | After builder produces a diff; independent of tester | No (default) |
| `tester` | Execution validator | After builder; runs commands and verifies acceptance criteria | No (test probes only, isolated) |
| `debugger` | Failure investigator | Tests fail; unexpected behavior; stack trace analysis needed | No |
| `summarizer` | Artifact compressor | After every meaningful attempt; before memory storage | Artifacts only |
| `memory-curator` | Typed memory manager | After a run produces reusable lessons, skills, or negative patterns | Memory only |
| `curriculum-generator` | Challenge case factory | After failures; when weak spots are identified; before promoting changes | Evaluation artifacts only |
| `judge` | Cross-model pairwise evaluator | Pairwise comparison of attempts, proposals, skills, topologies, memory updates | No |
| `failure-attributor` | Root-cause analyst | After any failed run; before self-evolution proposals | No |
| `evolution-auditor` | Change safety reviewer | Before any prompt/skill/topology/agent change is promoted | No |

---

### Agent Detail Reference

#### `scout`
- **Output:** `context.md` — compressed repository context, likely files, commands, risks
- **Key rules:** Follow imports and call sites; do not guess architecture; cite exact file paths and line numbers
- **Never:** Guess interfaces, make assumptions about module structure, or skip reading before reporting
- **Feeds:** planner, builder, memory-slicer

#### `researcher`
- **Output:** `external-evidence.md` — findings with sources, applicability assessment, and uncertainty flags
- **Key rules:** Prefer primary docs, papers, and official repos; mark uncertainty explicitly; do not fabricate citations
- **Feeds:** planner

#### `planner`
- **Output:** `plan.md` — implementation plan with: assumptions listed, acceptance criteria, validation ladder, risk level (0–9), and recommended topology
- **Key rules:** Choose the simplest topology that can succeed; surface ambiguities rather than resolving them silently; cite context.md and external-evidence.md
- **Never:** Write code; skip the validation ladder; route difficulty 0–2 tasks through multi-agent pipelines

#### `builder`
- **Output:** Modified files + `diff.patch`
- **Key rules:** Read before edit; stop on ambiguous scope or failing environment; use validation-gate before claiming done; only writer by default
- **Never:** Write to `.pi/memory/`, `.pi/evals/`, or `AGENTS.md`; skip tests when they exist

#### `reviewer`
- **Output:** `review-findings.json` — findings with: severity (blocker/major/minor/info), file/line, evidence, reproduction steps, suggested fix
- **Key rules:** Derive findings only from repository evidence and command output; assume nothing was checked; cite specific lines
- **Never:** See tester output before emitting first-pass findings; use social proof; prefer style over correctness

#### `tester`
- **Output:** `validation.md` — commands run, exit codes, failure summaries, pass/fail against acceptance criteria, confidence level
- **Key rules:** Run all available validation commands; distinguish environment failures from code failures; do not assume tests passed
- **Never:** See reviewer output before first pass; mark done when tests are unavailable without documenting why

#### `debugger`
- **Output:** Diagnosis with exact file/line, stack trace interpretation, minimal reproduction, proposed fix
- **Invoke when:** Stack traces present; test failures are cryptic; environment behavior is unexpected
- **Key rules:** Distinguish symptom from cause; verify the fix with targeted tests

#### `summarizer`
- **Output:** `attempt-summary.json` (see schema in extension 7)
- **Key rules:** Preserve decisive details; omit low-value trace noise; verdict must be one of: `candidate | reject | needs_refinement`
- **Feeds:** selection (RTV), refinement (PDR), memory-curator, curriculum-generator

#### `memory-curator`
- **Output:** Memory add/update/deprecate/contradict proposals in `.pi/memory/`
- **Key rules:** Include full provenance; flag contradictions; prefer distilled facts over raw trace retrieval; never bulk-delete
- **Schema:** See Section 11 (Memory Types)

#### `curriculum-generator`
- **Output:** Challenge case files in `.pi/curricula/` with: task, oracle, required tools, novelty hash, difficulty estimate, promotion criteria
- **Key rules:** Generate from real traces and weak spots; target uncertainty ≈ 0.5; deduplicate; reject unverifiable tasks
- **Scoring:** See AGENTS.md Section 11.3

#### `judge`
- **Model constraint:** MUST use a different model family from the generator (hard constraint — self-preference is linearly correlated with self-recognition; GPT-4: 73.5% self-recognition out-of-box)
- **Output:** `{ "plan": "...", "execution": "...", "verdict": "A|B|tie", "rationale": "...", "position_consistent": true, "confidence": "high|medium|low" }`
- **Protocol:** Plan → Execute → Verdict (EvalPlanner)
- **Mandatory guards:** Position swap, identity strip, anti-verbosity instruction, pairwise not scalar
- **Never:** Judge outputs from its own model family; accept verdicts that flip on position swap

#### `failure-attributor`
- **Output:** `failure-attribution.json` — root-cause category, propagation path, repair recommendation, evidence
- **Key rules:** Use the 12-category taxonomy (AGENTS.md Section 13); distinguish symptom from trigger; every claim needs evidence
- **Feeds:** evolution-governor (via evolution-auditor), planner (for retry), memory-curator

#### `evolution-auditor`
- **Output:** Safety/performance/cost review of proposed changes
- **Key rules:** Apply Endure → Excel → Evolve; require diff, holdout evaluation, rollback plan; escalate safety regressions immediately
- **Never:** Approve changes with safety regressions regardless of performance improvement

---

## 6. 13 Skills

Skills provide structured documentation and workflow guidance for recurring patterns. Autopilot selects and applies them automatically from the user's prompt and task profile; `/skill:<name>` remains available for explicit inspection or manual invocation. 85.5% of real-world skills contain no executable scripts — they are structured static documentation that shapes agent behavior.

---

### `/skill:feature-spec`

**Purpose:** Convert a feature request into an executable contract.

**When to use:** Any new feature or significant change request before planning begins.

**Contents:**
- How to extract precise behavior requirements from vague requests
- How to identify affected modules and import paths (read before guessing)
- How to write fail-to-pass (F2P) tests for new behavior
- How to write pass-to-pass (P2P) tests for regression protection
- Acceptance criteria template
- Interface extraction protocol: read actual definitions, never guess
- "Done means" checklist: all F2P pass, all P2P pass, validation ladder complete

**Example invocation:**
```
/skill:feature-spec
Task: Add rate limiting to the API gateway
```

---

### `/skill:repo-validation`

**Purpose:** Run project-specific build/test/lint/typecheck commands.

**When to use:** At every task completion checkpoint; before emitting a "done" verdict.

**Contents:**
- Project-specific command ladder (populated from `AGENTS.md` Section 3)
- Fallback checks when primary commands are unavailable
- How to document unavailability (acceptable reason vs. skip)
- Environment issue detection: distinguish missing tool vs. broken code
- Exit code interpretation guide

---

### `/skill:rollout-summary`

**Purpose:** Emit a complete, standards-compliant attempt summary after every meaningful run.

**When to use:** After any attempt, whether successful or failed.

**Contents:**
- Required JSON schema (see extension 7 schema)
- Guidance on choosing verdict: `candidate | reject | needs_refinement`
- What counts as a "reusable insight" worth preserving
- How to describe failure modes for future attribution
- Storage location: `.pi/runs/<run-id>/attempt-summary.json`
- How summaries feed into RTV selection and PDR refinement

---

### `/skill:failure-attribution`

**Purpose:** Diagnose root causes and produce actionable attribution artifacts.

**When to use:** After any failed run or repeated failure pattern.

**Contents:**
- The 12-category failure taxonomy (from AGENTS.md Section 13)
- Distinguishing symptom from trigger
- Propagation path documentation
- Evidence requirements for each category
- `failure-attribution.json` schema
- How to translate attribution into skill/prompt/topology improvement proposals

---

### `/skill:anti-bystander-review`

**Purpose:** Enforce independent review and safe aggregation.

**When to use:** In every review phase involving more than one validator.

**Contents:**
- Independent session protocol: reviewer and tester never see peer output first
- Prompting rules: "Independently inspect the code and tests. Derive findings only from repository evidence and command output. Do not assume another agent checked anything."
- Anonymization and shuffling before synthesis
- Evidence-weight aggregation (correctness/security > style)
- Minority-finding preservation rule: one reproducible blocker blocks
- What triggers escalation vs. targeted validation
- Banned prompts list (e.g., "other agents agreed", "verify quickly")

---

### `/skill:topology-authoring`

**Purpose:** Design schema-valid DAG workflows for pi tasks.

**When to use:** When a task needs a multi-agent workflow beyond the default chain.

**Contents:**
- Full DAG YAML schema with all fields documented
- Difficulty-to-density mapping (AgentConductor: a 3B backbone with topology awareness outperformed larger models)
- Validator rules: acyclic, known agents, single writer, node/parallel/depth caps
- Review layer independence requirements (`independent: true`)
- Artifact reference requirement for every edge
- Examples for each workflow type (A–G)

---

### `/skill:context-pruning`

**Purpose:** Select relevant files, logs, and memory slices for each agent call.

**When to use:** Before passing context to any agent call; always in spawn packages.

**Contents:**
- SEMA structural-entropy pruning principles (70% token reduction, 50% latency reduction)
- Multi-signal retrieval: file/path overlap, keyword match, dependency proximity, recency, outcome utility, failure similarity
- Context budget enforcement
- What to include vs. strip (low-salience, redundant, superseded)
- Memory priority order (structural → declarative → procedural → negative → episodic → prospective)
- How to compress without losing decisive details

---

### `/skill:lifelong-memory`

**Purpose:** Use and maintain the typed memory system correctly.

**When to use:** When adding, updating, or retrieving memory items; when a run produces lessons.

**Contents:**
- The 7 memory types and their roles (from AGENTS.md Section 9)
- Full item schema (id, type, scope, status, source, salience, confidence, provenance)
- Operation guide: add, update, deprecate, contradict, combine, validate
- Salience scoring: novel, constraint, future-critical, failure-linked, preference, validation-linked
- Retrieval priority order
- Anti-pattern: never retrieve raw chat history for general use
- Prospective item requirements: trigger, why it matters, files/commands, success criteria, deadline

---

### `/skill:skill-lifecycle`

**Purpose:** Create, validate, promote, measure, and deprecate reusable skills.

**When to use:** When a pattern recurs enough to warrant a skill; when auditing existing skills.

**Contents:**
- Promotion ladder: raw trace → episode summary → lesson → provisional skill → validated skill → project policy
- Validation requirements: tested on ≥2 independent tasks before promotion
- Skill metadata schema: trigger, preconditions, contraindications, examples, success_rate, status
- Deprecation trigger: declining success rate, contradicted assumptions, or superseded by better skill
- Critical internalization rule: if an agent repeatedly misses a step, make it a gate — not a reminder

---

### `/skill:prospective-agenda`

**Purpose:** Store and act on future obligations correctly.

**When to use:** When a run creates future obligations (pending tests, follow-ups, deferred cleanup).

**Contents:**
- Why vague reminders fail (from ELL/StuLife: agents fail the Proactive Initiative Score dimension)
- Required fields: trigger, importance, files, commands, success criteria, deadline
- Storage: `.pi/memory/prospective/`
- Agenda check protocol: supervisor checks agenda before emitting final response
- Staleness threshold: when to escalate overdue items
- Integration with spawned-child tracking: mark completion when child resume package arrives

---

### `/skill:curriculum-generation`

**Purpose:** Generate frontier challenge cases from real traces that drive improvement without overfitting.

**When to use:** After failures; when weak spots are identified; before promoting self-evolution proposals.

**Contents:**
- Agent0 curriculum principles (adapted): frontier uncertainty ≈ 0.5 self-consistency band
- Governance scoring formula:
  ```
  score = validation_gain + frontier_uncertainty + useful_tool_use
        + novelty - repetition - cost_penalty - safety_risk - ambiguity_penalty
  ```
- Challenge case schema: task, oracle, required tools, novelty hash, difficulty estimate, promotion criteria
- Deduplication: novelty hash comparison before adding
- Rejection criteria: impossible tasks, unverifiable oracles, duplicates
- Storage: `.pi/curricula/`

---

### `/skill:eval-planning`

**Purpose:** Generate unconstrained, task-adaptive evaluation plans before each pairwise judgment.

**When to use:** Whenever the judge agent needs to evaluate a pair of candidates.

**Contents:**
- EvalPlanner principle: fixed rubrics fail on tasks they weren't designed for; 93.9% on RewardBench with 22K synthetic pairs (vs. fixed rubrics)
- Plan structure template:
  - Objective verification steps (what can be checked deterministically)
  - Reference answer derivation (how to establish ground truth for this specific task)
  - Subjective criteria rubrics (with explicit anti-bias instructions)
  - Edge-case checklist
- Anti-bias instructions embedded in every plan:
  - "Do not prefer outputs based on length, formatting, or stylistic elaboration"
  - "Strip model identity before evaluating"
  - "This judgment will be run twice with candidates in reversed order"
- Output schema: `{ "plan": "...", "execution": "...", "verdict": "A|B|tie", "rationale": "...", "position_consistent": true, "confidence": "high|medium|low" }`
- When to use majority vote (3+ samples): high-stakes promotion decisions

---

### `/skill:evolution-proposal`

**Purpose:** Propose prompt/skill/agent/topology changes safely through the governance pipeline.

**When to use:** When failure attribution identifies a systemic improvement opportunity.

**Contents:**
- What can be proposed autonomously vs. requires human approval (AGENTS.md Section 11.1)
- Required proposal artifacts: diff, source evidence, holdout evaluation result, anti-conflict check, rollback plan
- Gate sequence: Endure (safety) → Excel (regression) → Evolve (autonomy/approval)
- `evolution-proposal.md` template
- How to use the evolution-governor extension
- Rollback procedure
- Changelog requirement

---

## 7. 7 Workflow Templates (A–G)

### Workflow A: Simple Task

**Use when:** Single file or small question; low risk; clear requirements; cheap validation.

**Difficulty score:** 0–2

```
single agent
  → targeted validation (validation-gate)
  → attempt summary (attempt-summarizer)
```

**Example tasks:**
- Fix a typo in a config file
- Answer a question about a specific function
- Update a single constant value

**Template:** `.pi/prompts/workflow-a-simple.md`

---

### Workflow B: Standard Implementation

**Use when:** Moderate feature or bug; unfamiliar code; tests available; validation matters.

**Difficulty score:** 3–5

```
scout (context.md)
  → planner (plan.md)
  → builder (diff.patch)
  → [independent] reviewer (review-findings.json)
               + tester (validation.md)
  → review-aggregator (adjudicated findings)
  → builder applies adjudicated fixes
  → validation-gate (final check)
  → attempt-summarizer (attempt-summary.json)
```

**Key rules:**
- Reviewer and tester run in separate sessions; no cross-visibility on first pass
- One reproducible blocker from either validator blocks completion
- review-aggregator aggregates by evidence quality, not vote count

**Template:** `.pi/prompts/workflow-b-standard.md`

---

### Workflow C: Complex Feature

**Use when:** Multiple files/modules; feature-level change; external API/domain knowledge; high regression risk.

**Difficulty score:** 6–9

```
[parallel] scout (context.md)
         + researcher (external-evidence.md)
  → planner (plan.md)
  → builder in worktree (diff.patch)
  → [if failures] debugger
  → [independent] reviewer (review-findings.json)
               + tester (validation.md)
  → review-aggregator
  → builder applies adjudicated fixes
  → final validation-gate
  → summarizer (attempt-summary.json)
  → memory-curator (lessons → .pi/memory/)
```

**Key rules:**
- Use worktree-manager for builder isolation
- External evidence is required — don't plan without it
- If difficulty ≥ 9: add human checkpoints and failure-attribution on any failure

**Template:** `.pi/prompts/workflow-c-complex.md`

---

### Workflow D: Repeated Failure / Refinement

**Use when:** Two or more failed attempts; test failures persist; context is noisy; multiple hypotheses exist.

**Difficulty score:** Any (triggered by failure count, not difficulty)

```
attempt summaries from prior runs (attempt-summary.json × N)
  → failure-attributor (failure-attribution.json)
  → summarizer selects top evidence (reusable-insights)
  → refined attempt (seeded by top 2–4 summaries via PDR)
  → validation-gate (stricter: all tests must pass)
  → attempt-summarizer
  → memory-curator (failure patterns → negative memory)
```

**Key rules:**
- Never start a third attempt without failure attribution
- Pass the top 2–4 summaries as context seeds (Parallel-Distill-Refine)
- If 3rd attempt fails the same validation command → escalate (Section 6 of AGENTS.md)

**Template:** `.pi/prompts/workflow-d-refinement.md`

---

### Workflow E: Self-Evolution

**Use when:** Repeated workflow failure; recurring prompt/config issue; measurable opportunity to improve routing, skills, or topology.

**Trigger conditions:**
- Failure-attributor identifies a systemic pattern across ≥3 runs
- Skill success rate falls below 60% over a 30-day window
- Memory retrieval usefulness score declines
- Judge position-consistency rate falls below 80%

```
trace audit (trace-ledger)
  → failure-attributor (systemic pattern identification)
  → evolution-auditor (safety/performance review)
  → evolution-governor (proposal + gates)
       → Endure gate (safety check)
       → Excel gate (regression check on holdout tasks)
       → human approval (for broad-scope changes)
  → staged rollout
  → monitoring (trace-ledger)
  → rollback if regression detected
```

**Key rules:**
- Never skip the Endure gate regardless of apparent improvement
- Broad-scope changes (AGENTS.md, routing rules, new extensions) always require human approval
- Every promoted change must have a diff, evidence citation, and rollback path

**Template:** `.pi/prompts/workflow-e-evolution.md`

---

### Workflow F: Lifelong Learning and Curriculum Improvement

**Use when:** A run produces a reusable lesson; a failure reveals a missing skill or memory rule; agents repeatedly miss obligations; new challenge cases are needed.

```
run trace (trace-ledger)
  → summarizer (episode summary → .pi/runs/)
  → memory-curator (typed memory/skill proposals → .pi/memory/)
  → curriculum-generator (frontier challenge cases → .pi/curricula/)
  → validation-gate (challenge case oracle verification)
  → holdout evaluation (judge: new behavior vs. baseline on challenge cases)
  → evolution-governor (promotion gate)
```

**Key rules:**
- Memory items require full provenance and schema validation
- Skill proposals enter as `provisional` status; promoted to `validated` after ≥2 independent task tests
- Curriculum cases must pass oracle verification (not unverifiable)
- Judge evaluates before/after on held-out cases — not on the training cases

**Template:** `.pi/prompts/workflow-f-lifelong.md`

---

### Workflow G: Eval-Agent Self-Improvement

**Use when:** Judge position-consistency rate < 80%; inconsistent proposal accept/reject patterns; new task domain needs evaluation plan coverage; accumulated corpus reaches size threshold (e.g., 500 confirmed pairs).

```
good/bad attempt pairs from trace-ledger
  [+ synthetic degraded pairs for known-quality ground truth]
  → judge generates task-adaptive evaluation plan (eval-planning skill)
  → judge executes plan against both candidates
  → position-swap verification: run both orderings
  → retain only position-consistent verdicts
  → accumulate in .pi/evals/judge-corpus/ (schema-validated)
  → rejection sampling: keep high-confidence, position-consistent judgments only
  → update judge evaluation plan prompts from high-quality reasoning chains
  → re-measure calibration metrics
  → better judge → better curriculum scoring → better self-evolution signals
```

**Key rules:**
- Judge must be a different model family from the generator of the pairs
- ONLY position-consistent verdicts enter the corpus
- Calibration re-measurement after each update cycle
- If known-pair accuracy < 85% after 3 update cycles → escalate to human

**Template:** `.pi/prompts/workflow-g-judge-improvement.md`

---

## 8. 9-Phase Implementation Roadmap

The system is implemented in 9 phases ordered by dependency. Each phase builds on the previous. **Do not skip phases** — self-evolution (Phase 7) without attribution (Phase 5) is brittle; the judge self-improvement (Phase 9) without the judge itself (Phase 9 prerequisite from Phase 2) is impossible.

### Phase 1: Foundation *(High priority — implement first)*

**Goal:** Establish the basic coordination infrastructure and validation discipline.

**Deliverables:**
- `AGENTS.md` complete and lint-checked (config-linter)
- Core agents defined: scout, planner, builder, reviewer, tester, researcher
- `.pi/runs/` artifact directory structure
- validation-gate extension (basic version): success requires explicit checks or documented unavailability
- anti-bystander review rules (review-aggregator skeleton)
- safety-gate extension (basic version): block destructive shell commands

**Success criteria:** A standard Workflow B task completes with all validation commands run and all artifacts stored.

---

### Phase 2: Trace, Summary, and Typed Memory *(Build on Phase 1)*

**Goal:** Every run produces structured artifacts that enable learning.

**Deliverables:**
- trace-ledger extension: structured events for every agent call, tool call, artifact write, validation, and task end
- attempt-summarizer extension: mandatory summary after every meaningful attempt
- Typed memory stores: `.pi/memory/` with 7 subdirectories
- lifelong-memory extension: add/update/deprecate/contradict/combine operations
- Failed attempt storage: negative memory via memory-curator
- Salience metadata on all items

**Success criteria:** After 3 test runs, the trace-ledger has complete event logs, attempt-summary.json files exist for each run, and at least one memory item has been curated with full provenance.

---

### Phase 3: Topology and Routing *(Build on Phase 1–2)*

**Goal:** Route tasks to the right workflow complexity automatically.

**Deliverables:**
- Task router with difficulty estimation (0–9 scale)
- DAG workflow schema definition
- topology-runner extension: schema-validated execution
- Standard workflow templates A–D as YAML topologies
- Topology caps by difficulty

**Success criteria:** A difficulty-7 task is routed to Workflow C (parallel scout/research + worktrees + independent review), while a difficulty-2 task routes to Workflow A (single agent).

---

### Phase 4: Dynamic Spawning, Memory Slicing, and Prospective Agenda *(Build on Phase 2–3)*

**Goal:** Enable bounded dynamic specialization and obligation tracking.

**Deliverables:**
- spawn-controller extension: sspawn formula, Spawn/Resume Package schemas
- memory-slicer extension: multi-signal retrieval with priority ordering
- worktree-manager extension: isolated parallel write attempts
- prospective-agenda extension: obligation tracking with execution context
- Agenda check at task end before final response

**Success criteria:** A spawn score computation runs on a complex task; a child agent receives a proper Spawn Package (bounded task, memory slice, budget, allowed tools); agenda items are checked before final response.

---

### Phase 5: Failure Attribution *(Build on Phase 2–4)*

**Goal:** Every failed run is diagnosed before retry.

**Deliverables:**
- failure-attributor agent definition
- `failure-attribution.json` artifact schema
- 12-category taxonomy integration
- Routing update: two successive failures on the same validation command → invoke failure-attributor before retry
- Attribution feeds: routing planner (for retry), memory-curator (for negative lessons)

**Success criteria:** A deliberately broken task produces a `failure-attribution.json` with correct root-cause category, propagation path, evidence citations, and repair recommendation.

---

### Phase 6: Skill Lifecycle and Lifelong Learning *(Build on Phase 5)*

**Goal:** Convert repeated lessons into reusable skills; maintain cognitive continuity.

**Deliverables:**
- skill-registry extension: lifecycle tracking (provisional → validated → deprecated)
- memory-curator agent: full workflow for adding skills from episodes
- Skill validation protocol: ≥2 independent tasks before promotion
- Deprecation detection: declining success rates
- Perfect-context vs. realistic-context evaluations (to separate reasoning failures from retrieval failures)
- Workflow F template

**Success criteria:** A pattern identified in 3 failed runs becomes a provisional skill; the skill is tested on 2 tasks; if it improves outcomes, it promotes to validated.

---

### Phase 7: Conservative Self-Evolution *(Build on Phase 5–6)*

**Goal:** The system can propose and safely apply improvements to its own prompts, skills, and topologies.

**Deliverables:**
- evolution-governor extension: full gate sequence (Endure → Excel → Evolve)
- evolution-auditor agent definition
- `/skill:evolution-proposal` with required artifacts
- Human approval queue for broad-scope changes
- Rollback mechanism for all promoted changes
- Workflow E template

**Success criteria:** A proposed skill change goes through: diff → evidence → holdout evaluation → safety gate → Excel gate → human approval (for broad scope) → staged rollout → monitoring. A simulated regression triggers automatic rollback.

---

### Phase 8: Curriculum-Driven Evaluation *(Build on Phase 6–7)*

**Goal:** Self-evolution proposals are tested against frontier challenge cases, not just training examples.

**Deliverables:**
- curriculum-generator extension (full implementation)
- Challenge case scoring formula (governance score)
- Novelty hashing and deduplication
- Oracle verification gate
- `.pi/curricula/` store
- Integration with evolution-governor: proposals tested on held-out challenge cases

**Success criteria:** After 10 completed runs, the curriculum-generator proposes 3+ frontier challenge cases from real failures; at least 1 challenge case is used to evaluate a proposed skill change before promotion.

---

### Phase 9: Eval Agent and Judge Self-Improvement *(Build on Phase 7–8)*

**Goal:** The judge self-improves from accumulated traces without human annotation; evaluation signal becomes reliable enough to fully close the self-evolution loop.

**Deliverables:**
- judge agent definition (with cross-model constraint enforcement)
- judge-evolution extension (full implementation)
- `.pi/evals/judge-corpus/` schema validation
- Position-swap verification as hard filter
- Rejection sampling for corpus quality
- Calibration metrics dashboard (position-consistency, known-pair accuracy, verbosity-bias rate, inter-run stability)
- Workflow G template and trigger conditions
- Calibration alerts: trigger Workflow G when position-consistency < 80%
- Feed-forward: improved judge → curriculum scoring → evolution gates

**Success criteria:** The judge's position-consistency rate is measurably tracked; after 50 preference pairs are accumulated, a Workflow G iteration improves known-pair accuracy on a held-out set; calibration metrics are visible in the pi session.

---

## 9. Self-Learning Evaluation Loop (Steps 1–7)

This is the closed-loop judge self-improvement system. It enables the evaluation signal to improve without human annotation — based on the Self-Taught Evaluators paper (75.4 → 88.7% RewardBench in 5 iterations) and EvalPlanner.

### Step 1 — Pair Construction

**Principle:** Self-Taught Evaluators

From the trace-ledger, identify candidate preference pairs:
- **Outcome pairs:** Same task type, one run succeeded, one failed
- **Summary-quality pairs:** Test-time scaling summaries with clear quality gaps (one has all tests passing, one doesn't)
- **Synthetic degraded pairs:** Take a successful run; deliberately degrade the instruction (inject ambiguity, remove a constraint); run again; the original is known-better

Goal: produce preference pairs where ground-truth quality is deterministic (test pass/fail, oracle verification) — not dependent on human annotation.

Storage: pair construction is logged in `.pi/mas-traces/` before routing to the judge.

---

### Step 2 — Evaluation Plan Generation

**Principle:** EvalPlanner

The judge agent generates a task-adaptive, unconstrained evaluation plan specific to this pair's task type:

- **Coding task pair:** plan generates test cases, checks correctness and completeness, derives reference answer step-by-step
- **Skill proposal pair:** plan checks coherence, preconditions, example coverage, and absence of contradictions
- **Memory update pair:** plan verifies accuracy against cited source evidence, checks for staleness and scope creep
- **Topology proposal pair:** plan compares cost, depth, validation pass rate, and coherence properties

The plan is NOT a fixed rubric. It is generated from the task at hand. Fixed rubrics fail on tasks they weren't designed for; unconstrained plans generalize across task types.

---

### Step 3 — Plan Execution and Verdict

**Principle:** EvalPlanner

The judge follows the generated plan step-by-step against both candidates. Each step must cite specific evidence:
- File paths and line numbers
- Command outputs and exit codes
- Test results
- Memory item contents and provenance

The verdict is a pairwise preference (A / B / tie) with structured rationale grounded in the execution evidence. No holistic impressions — every claim traces back to a plan step.

---

### Step 4 — Bias Filtering

**Principle:** LLM-as-a-Judge survey + Self-Preference paper

Four mandatory filters applied to every verdict:

1. **Position swap:** Run the judgment with candidates in reversed order. If the verdict changes, it is position-inconsistent — discard and regenerate with a different sampled evaluation plan.

2. **Identity strip:** Before the judge sees either candidate: remove model names, author attribution, formatting decorations, length signals. The judge responds to substance only.

3. **Anti-verbosity instruction:** Explicit text in every judge call: "Do not prefer outputs based on length, number of bullet points, presence of headers, or stylistic elaboration. Judge correctness, completeness, and evidence only."

4. **Cross-model routing:** Verify that the judge model family differs from the generator model family before running. Block if same family.

---

### Step 5 — Corpus Accumulation

**Principle:** Self-Taught Evaluators

Accepted (position-consistent) verdicts are stored in `.pi/evals/judge-corpus/`:

```yaml
type: preference_pair
task_type: coding | skill_proposal | memory_update | topology | evolution_proposal
winner: A | B
rationale: "evidence-based explanation"
position_consistent: true          # NEVER false
judge_model_family: gemini | gpt | claude
generator_model_family: claude | gpt | gemini
confidence: high | medium          # never write low-confidence pairs
trace_ref: "run-id"
created_at: "ISO 8601"
```

Rejection criteria (do not add to corpus):
- `position_consistent: false`
- `confidence: low`
- `judge_model_family == generator_model_family`
- Missing `rationale` or missing `trace_ref`

---

### Step 6 — Judge Self-Improvement

**Principle:** Self-Taught Evaluators + Con-J

Periodic improvement cycle (trigger: new 50+ pairs, or calibration metric drop):

1. Sample the judge's predictions on a held-out subset of the corpus (pairs with known-quality ground truth)
2. Compare judge verdicts to ground truth; identify correct vs. incorrect judgments
3. Use rejection sampling to collect correct, position-consistent reasoning chains
4. Extract evaluation plan patterns from the high-quality chains
5. Update the judge's evaluation plan prompt library (stored in `.pi/evals/`)
6. Re-measure calibration metrics on the held-out set
7. If known-pair accuracy improved → log successful improvement cycle
8. If 3 cycles without improvement → escalate to human (judge prompts may need structural revision)

---

### Step 7 — Feed-Forward to Curriculum and Evolution Gates

**Principle:** Closed-loop self-improvement

The calibrated judge improves signals at every decision point:

**→ Curriculum scoring:** More reliable detection of which attempts are near the capability frontier (self-consistency ≈ 0.5). The curriculum-generator uses judge verdicts to filter challenge cases to the informative band.

**→ Evolution gates:** Before/after pairwise comparison on held-out evaluation tasks determines whether a proposed skill or prompt change represents genuine improvement. An uncalibrated judge here produces false promotions.

**→ Attribution validation:** Judge confirms that the attributed root cause is consistent with the observed quality difference between successful and failed runs. Catches false attributions before they corrupt skill proposals.

Together, Steps 1–7 form a complete human-label-free self-improvement loop for the evaluation signal.

---

## 10. Spawn Score Formula

From AgentSpawn (paper Table 1 and Figure 3). These five weights are from the validated paper — do not adjust without empirical validation.

```
sspawn = 0.30 × norm(If)   # file interdependency count
       + 0.20 × norm(Cc)   # max cyclomatic complexity of modified functions
       + 0.25 × norm(Fc)   # test failure cascade count
       + 0.15 × norm(Oc)   # context window saturation fraction
       + 0.10 × norm(Uc)   # agent uncertainty (from logprobs or self-consistency)
```

All inputs `norm()` are normalized to [0, 1] before multiplication.

**Threshold and limits:**

| Parameter | Value | Source |
|---|---|---|
| Spawn if | `sspawn ≥ 0.7` | AgentSpawn paper default |
| Max depth | 3 | AgentSpawn paper |
| Max concurrent | 4 | AgentSpawn paper |

**Input measurement guide:**

| Factor | How to measure |
|---|---|
| `If` (file interdependency) | Count files that import/depend on the files being changed |
| `Cc` (cyclomatic complexity) | Use static analysis tool on modified functions (e.g., `lizard`, `radon`, `eslint complexity`) |
| `Fc` (test failure cascade) | Run tests after a partial change; count failing tests beyond the directly modified area |
| `Oc` (context saturation) | Current prompt token count ÷ context window limit |
| `Uc` (uncertainty) | For models supporting logprobs: entropy of key decision tokens. Otherwise: count of "I'm not sure / might be / possibly" hedges ÷ response length |

**Pi-specific augmentation factors** (not from AgentSpawn, add to policy if extending):
- `domain_specialization_need`: does the task require skills outside the parent agent's context?
- `parallelizable_hypotheses`: are there ≥2 independent solution strategies worth exploring?
- `expected_value_vs_cost`: estimated improvement ÷ estimated token/time cost

**Never spawn for:**
- Checking if another agent agrees (social proof)
- Tasks the parent can complete within budget
- Situations where merge conflicts would be unresolvable
- Any spawn that would exceed depth (>3) or concurrency (>4) limits

---

## 11. Judge Calibration Targets

These targets define when the judge is operating correctly. Missing any target triggers the corresponding action.

| Metric | Definition | Target | Action if Missed |
|---|---|---|---|
| **Position-consistency rate** | Fraction of verdicts unchanged when candidate order is swapped (A,B) → (B,A) | ≥ 80% | Trigger Workflow G: update judge evaluation plan prompts |
| **Inter-run stability** | Fraction of verdicts unchanged on identical re-runs (temperature > 0, same prompt, same candidates) | ≥ 90% | Lower judge temperature; audit prompt for ambiguous instructions |
| **Known-pair accuracy** | Accuracy on pairs where ground-truth quality is deterministic (e.g., test pass vs. fail, oracle-verified) | ≥ 85% | Expand rejection-sampling corpus; review evaluation plan quality |
| **Human spot-check agreement** | Agreement with human reviewer on a sampled subset of verdicts | Track trend | Investigate systematic deviations; do not set a hard target that could be gamed |
| **Verbosity-bias rate** | Fraction of verdicts where the rationale cites length, formatting, or bullet-point count as a quality signal | < 5% | Strengthen anti-verbosity instruction in judge prompt; add explicit examples of what NOT to cite |

### Calibration Measurement Protocol

1. **Continuous:** Every verdict is checked for position-consistency automatically by judge-evolution extension
2. **Weekly:** Sample 20 pairs from corpus; compute known-pair accuracy; log to calibration dashboard
3. **On trigger:** When any metric hits its action threshold, run Workflow G before the next self-evolution proposal is evaluated
4. **Version snapshots:** Maintain frozen judge plan snapshots for regression testing — never compare a new run against an old baseline judged by a different plan version without re-judging both

### What Counts as a Position-Consistent Verdict

- Run judgment: A=candidate1, B=candidate2 → verdict: **A**
- Run judgment: A=candidate2, B=candidate1 → verdict: **B** (same winner, position-consistent ✓)
- Run judgment: A=candidate2, B=candidate1 → verdict: **A** (different winner, position-inconsistent ✗ → discard)

---

## 12. Memory Types and How to Add Entries

### Memory Type Reference

| Type | Location | Contents | Retention |
|---|---|---|---|
| Working | `.pi/memory/working/` | Current task goal, plan, active files, open blockers | Task scope only — cleared when task closes |
| Episodic | `.pi/memory/episodic/` | Summarized run traces, failures, repairs, outcomes | Long-lived, compressed after 30 days |
| Declarative | `.pi/memory/declarative/` | Stable project facts, API constraints, user decisions, commands | Until superseded or deprecated |
| Structural | `.pi/memory/structural/` | File/module/tool/agent relationships, dependency graph | Updated when architecture changes |
| Procedural | `.pi/memory/procedural/` | Reusable skills, playbooks, validated topologies | Promoted after validation; deprecated when superseded |
| Prospective | `.pi/memory/prospective/` | Future obligations with triggers, context, and success criteria | Until completed or deadline passed |
| Negative | `.pi/memory/negative/` | Known failed approaches, unsafe patterns, bad assumptions | Retained indefinitely as anti-patterns |

### Memory Item Schema (required fields)

```yaml
id: "unique-slug-or-uuid"
type: fact | decision | skill | heuristic | episode | reminder | negative_lesson
scope: repo | project | user | global
status: provisional | validated | deprecated | contradicted
source: file | command | user | episode | external
salience: novel | constraint | future-critical | failure-linked | preference | validation-linked
created_at: "2026-05-19T00:00:00Z"
last_validated_at: "2026-05-19T00:00:00Z"
confidence: low | medium | high
content: |
  The substantive memory content goes here.
  Can be multi-line.
provenance: "file path, line number, command output, or episode run-id"
```

### How to Add a Memory Entry (via memory-curator agent)

**Step 1 — Identify the type:**
- Stable project fact → `declarative`
- A past run's outcome → `episodic`
- A pattern that failed and should be avoided → `negative`
- A future obligation (test to write, follow-up needed) → `prospective`
- A reusable recipe or playbook → `procedural`
- A file/module relationship → `structural`

**Step 2 — Determine scope:**
- Applies only to this repo → `repo`
- Applies to this project (multi-repo) → `project`
- Applies to the current user's preferences → `user`
- Applies universally → `global`

**Step 3 — Set salience:**
| Salience Value | Use When |
|---|---|
| `novel` | First time encountering this pattern |
| `constraint` | A hard rule that must not be violated |
| `future-critical` | Will be urgently needed in a future task |
| `failure-linked` | Directly associated with a past failure |
| `preference` | User or team preference (not a hard rule) |
| `validation-linked` | Related to a validation gate or test |

**Step 4 — Cite provenance:** File path + line number, or command + output, or episode run-id. No provenance = reject.

**Step 5 — Set status:**
- New item with no validation history → `provisional`
- Tested and confirmed on ≥2 tasks → `validated`
- No longer accurate or superseded → `deprecated`
- New evidence contradicts it → `contradicted`

### Prospective Memory Special Requirements

A prospective item MUST include all of these or it is rejected:
```yaml
trigger: "When condition X occurs (e.g., before closing PR #123)"
importance: "What breaks if this is missed"
required_files: ["path/to/file.ts", "path/to/test.ts"]
required_commands: ["npm test", "npm run lint"]
success_criteria: "All tests pass; PR has test coverage above 80%"
deadline: "2026-05-26T00:00:00Z"
```

### Adding a Negative Lesson

Negative lessons are the most valuable memory type for avoiding repeated failures. Template:

```yaml
id: "negative-<slug>"
type: negative_lesson
scope: repo
status: validated
source: episode
salience: failure-linked
content: |
  NEVER do X when condition Y is true.
  Root cause: [what goes wrong]
  Evidence: [run-id or command output]
  Better approach: [what to do instead]
  Affected agents: [which agents need to see this]
provenance: "run-id: abc123, failure-attribution.json, category: context_failure"
```

### Memory Anti-Patterns (Do Not Do)

❌ Retrieve raw conversation history for general task use (naive RAG actively hurts — below no-memory baseline in StuLife)
❌ Store vague reminders without trigger/context/criteria (prospective items need execution context)
❌ Delete memory items without deprecating them first (status: deprecated preserves audit trail)
❌ Store memory without provenance (unverifiable facts become memory poisoning)
❌ Ignore the `status` field (contradicted items are never treated as facts)
❌ Add duplicate entries (combine repeated lessons into one skill or rule)

---

## 13. Research Basis Summary

All design decisions in this system trace back to one or more of these 18 papers:

| Paper | Key Contribution | Maps To |
|---|---|---|
| SE Survey (2601.09822v2) | Role specialization, tool feedback, cost controls | Agent definitions, 13-agent taxonomy |
| AgentSpawn (2602.07072v1) | Runtime spawning, memory slicing, Spawn/Resume Packages | spawn-controller, memory-slicer, Sections 7 & 9 |
| FeatureBench (2602.10975v1) | F2P/P2P tests, executable specs, no-test = not done | validation-gate, feature-spec skill |
| Config Study (2602.14690v4) | AGENTS.md as cross-tool standard, 85.5% skills static | AGENTS.md design, skill structure |
| AgentConductor (2602.17100v1) | Topology as data, difficulty-aware density, 14.6pp gain | topology-runner, Workflow templates |
| SEMA (2603.23875v1) | 70% token reduction, 50% latency reduction via pruning | memory-slicer, context-pruning skill |
| Test-Time Scaling (2604.16529v1) | RTV/PDR, structured summaries as scaling substrate | attempt-summarizer, Workflow D |
| Bystander Effect (2605.10698v1) | GPT-5.4 collapses at n=2 auditors; cognitive loafing | review-aggregator, anti-bystander-review skill |
| LIFE Survey (2605.14892v1) | Attribution before evolution; LIFE framework | failure-attributor, evolution-governor |
| Self-Evolving Survey (2508.07407v2) | Endure/Excel/Evolve laws | AGENTS.md Section 10, evolution-governor |
| ELL/StuLife (2508.19005v6) | Typed memory, skill lifecycle, prospective agenda; GPT-5: 17.9/100 | lifelong-memory, skill-registry, prospective-agenda |
| Agent0 (2511.16043v1) | Curriculum co-evolution, frontier filtering, tool-use rewards | curriculum-generator, Workflow F |
| LLM-as-a-Judge Survey | 5 bias families taxonomy | judge protocol, Section 8 |
| Self-Preference (NeurIPS 2024) | 73.5% GPT-4 self-recognition; linear correlation with self-preference | Cross-model constraint (hard architectural rule) |
| Self-Taught Evaluators (Meta FAIR) | 75.4→88.7% RewardBench in 5 iterations, zero human labels | judge-evolution, Workflow G, Step 6 |
| EvalPlanner (Meta FAIR) | Plan→execute→verdict; 93.9% RewardBench, 22K synthetic pairs | judge protocol, eval-planning skill |
| Con-J (ICLR 2025) | DPO on self-generated contrastive pairs; verbal rationale | judge corpus, pairwise-over-scalar rule |

**Endure → Excel → Evolve.** Safety first. Performance second. Autonomy third.

---

*This SYSTEMS-GUIDE.md is a reference companion to `AGENTS.md`. If they conflict, `AGENTS.md` is authoritative.*
