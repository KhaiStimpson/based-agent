# Autopilot Context Pack
Generated: 2026-05-30T23:51:21.866Z

## Task Profile
- kinds: coding, debugging, review, research, memory, topology, judge, curriculum, evolution
- risk_flags: protected_or_governed_change, multi_file_or_cross_module, validation_required, review_required, spawn_score_required, topology_required, evolution_proposal_required, curriculum_seed_candidate
- topology: evolution_pipeline
- spawn_score: 0.718

## Selected Skills
- repo-validation
- rollout-summary
- failure-attribution
- anti-bystander-review
- lifelong-memory
- skill-lifecycle
- feature-spec
- context-pruning
- topology-authoring
- prospective-agenda
- curriculum-generation
- eval-planning
- evolution-proposal

## Capability Plan
- [startup] config-linter: validate AGENTS.md/settings/schema drift at session start
- [startup] memory-hygiene-gate: prefer clean selected memory and quarantine unstable items
- [startup] revisitable-memory-router: surface evidence cards from prior attempt summaries
- [during] trace-ledger: record tool calls/results for attribution and summaries
- [during] safety-gate: block destructive or protected operations
- [completion] validation-gate: enforce done means available checks pass
- [completion] attempt-summarizer: emit compact attempt summary for memory/curriculum/evolution
- [completion] trajectory-auditor: detect command/extension/validation lessons from traces
- [completion] context-memory-curator: keep low-latency typed context memory fresh
- [planning] context-pack-builder: build role-aware compressed context pack for complex tasks
- [planning] memory-slicer: retrieve scoped typed memory instead of raw transcript context
- [planning] spawn-controller: computed spawn score 0.718
- [planning] topology-runner: schema-check difficulty-aware workflow before parallel work
- [review] review-aggregator: run independent evidence-first review/test aggregation
- [review] judge-evolution: use pairwise plan-execute-verdict and bias guards
- [startup] skill-ecosystem-auditor: find skill registry gaps and stale skills
- [completion] skill-internalizer: turn repeated lessons into governed skill candidates
- [completion] skill-memory-curator: promote reusable skill outcomes into skill memory candidates
- [completion] curriculum-generator: seed frontier tasks from failures and reusable insights
- [completion] evolution-scanner: convert observed improvement opportunities into proposals
- [completion] evolution-governor: keep protected changes in approval/promote/rollback lifecycle
- [completion] prospective-agenda: record future obligations with trigger and success criteria

## Selected Memory
- No selected memory.

## Research/Proposal Inspiration
- Add judge bias sentinel and counterfactual packets [approved]: Create paired, anonymized, order-swapped judge packets for code evaluations and log bias diagnostics. This directly targets self-preference, position, verbosity, agreeableness, and
- Add low-latency typed context memory curator [applied]: Introduce a deterministic memory curator that deduplicates, sensitivity-tags, detects conflicts, and applies decay without LLM calls. This gives long-running agents safer persisten
- Add trajectory-aware tool-use auditing [applied]: Record and score the full tool-call trajectory, not just final task success. This catches inefficient, unsafe, or hallucinated tool use early.
- Add revisitable evidence memory index [applied]: Create a memory router that stores compact evidence cards from runs and retrieves them by task intent, recency, and conflict risk before new agent sessions.
- Add memory provenance tracing and attribution ledger [applied]: Create a MemTrace-style extension that records every memory read/write with provenance, evidence type, consumer, and later failure attribution hooks. This makes stale or misleading