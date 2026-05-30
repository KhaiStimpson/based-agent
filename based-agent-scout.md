# Code Context

## Files Retrieved
1. `based-agent/package.json` (lines 1-12) - package identity and pi resource registration; notably no npm scripts or dependencies.
2. `based-agent/.pi/settings.json` (lines 1-6) - pi discovery config for extensions, skills, prompts, and skill command flag.
3. `based-agent/AGENTS.md` (lines 1-544) - canonical operating contract: architecture, validation ladder, workflow rules, safety boundaries, spawn policy, judge protocol, memory policy, self-evolution governance, routing table, failure taxonomy.
4. `based-agent/.pi/SYSTEMS-GUIDE.md` (lines 1-180) - user-facing onboarding, directory map, first-run checklist; contains several drift points versus actual file layout.
5. `based-agent/.pi/RESEARCH-REPORT.md` (lines 1-160) - research synthesis that explains the design basis for agents, workflows, memory, spawning, judges, and self-evolution.
6. `based-agent/.pi/agents/*.md` (representative lines: `scout.md` 1-90, `planner.md` 1-90, `reviewer.md` 1-90, `tester.md` 1-90, `judge.md` 1-90, `memory-curator.md` 1-90, `failure-attributor.md` 1-90, `evolution-auditor.md` 6-90) - agent role contracts, permissions, and outputs.
7. `based-agent/.pi/prompts/workflow-e-self-evolution.md` (lines 1-150) - self-evolution workflow trigger thresholds, gate order, trace audit, attribution, proposal schema.
8. `based-agent/.pi/prompts/workflow-f-lifelong-learning.md` (lines 1-230) - lifelong learning workflow, memory type selection, summarizer/memory-curator/curriculum flow, promotion ladder.
9. `based-agent/.pi/skills/lifelong-memory/SKILL.md` (lines 1-21) - compact skill entrypoint that delegates detailed protocol to `REFERENCE.md`.
10. `based-agent/.pi/skills/evolution-proposal/SKILL.md` (lines 1-21) - compact skill entrypoint for governed proposal workflow.
11. `based-agent/.pi/extensions/spawn-controller.ts` (lines 20-55, 90-110, 146-207) - spawn score types, constants, formula, log path, tool/command registration.
12. `based-agent/.pi/extensions/lifelong-memory.ts` (lines 20-31, 65-79, 143-315) - memory type/status schema and tools (`memory_add`, `memory_update`, `memory_deprecate`, `memory_query`, `/memory-add`).
13. `based-agent/.pi/extensions/evolution-governor.ts` (lines 22-38, 107-126, 161-290) - proposal types, safety checks, human-approval detection, `propose_evolution`, `/evolution-log`, `/evolution-pending`.
14. `based-agent/.pi/extensions/judge-evolution.ts` (lines 28-65, 123-151, 172-402) - preference pair/eval-plan types, calibration, `record_preference_pair`, `generate_eval_plan`, judge commands.
15. `based-agent/.pi/extensions/curriculum-generator.ts` (lines 22-35, 69-86, 143-332) - challenge case schema, curriculum scoring, generate/list/promote challenge tools.
16. `based-agent/.pi/extensions/validation-gate.ts` (lines 21-23, 73-96, 144-192) - validation record schema, prompt injection, `validation_complete`, `/validation-rules`.
17. `based-agent/.pi/extensions/safety-gate.ts` (lines 17-24, 101-145, 176-215) - destructive command and protected path gates.
18. `based-agent/.pi/extensions/review-aggregator.ts` (lines 20-53, 106-159, 188-223, 306-309) - anti-bystander review aggregation and consensus-prompt detection.
19. `based-agent/workflow-f-demo/package.json` (lines 1-10) - demo npm scripts (`reset`, `demo`, `validate`).
20. `based-agent/workflow-f-demo/README.md` (lines 1-82) - runnable Workflow F demo docs and containment guarantees.
21. `based-agent/workflow-f-demo/scripts/run-demo.mjs` (lines 1-232) - demo generator for failed attempt, attribution, typed memory, curriculum, validation artifacts.
22. `based-agent/workflow-f-demo/scripts/validate-demo.mjs` (lines 1-51) - demo artifact and oracle validator.
23. `based-agent/workflow-f-demo/scripts/validate-memory.mjs` (lines 1-51) - memory item validation CLI and exported validator.
24. `based-agent/workflow-f-demo/scripts/reset-demo.mjs` (lines 1-16) - guarded output reset.

## Key Code

### Package / config entry points
```json
// based-agent/package.json lines 7-11
"pi": {
  "extensions": [".pi/extensions"],
  "skills": [".pi/skills"],
  "prompts": [".pi/prompts"]
}
```
`based-agent/.pi/settings.json` duplicates the same discovery paths and enables skill commands (lines 1-6). There are no root `scripts`, `dependencies`, `devDependencies`, lockfile, `tsconfig.json`, or test/lint/typecheck commands in the root package.

### Canonical operating contract
`based-agent/AGENTS.md` declares itself the authority for all agents/tools/workflows (lines 1-6). Key developer-facing rules:
- 13 core agents listed in line 46.
- Validation ladder recommends `npx tsc --noEmit`, `npx eslint .`, `npm test`, and JSON/YAML validation (lines 74-104), but the root package does not provide scripts/dependencies to run these out of the box.
- Scout/read-before-edit/one-writer/independent-review rules are lines 108-148.
- Protected paths and destructive command gates are lines 152-185.
- Spawn formula and package schemas are lines 207-271.
- Judge protocol, anti-bias guards, and preference schema are lines 275-344.
- Memory schema and retrieval policy are lines 348-405.
- Self-evolution gates and artifact classes are lines 409-459.
- Routing table for Workflows A-G is lines 478-489.

### Extension CLI/tool surface
Discovered 19 TypeScript extension files in `based-agent/.pi/extensions`, not 16 as docs claim. Major registered tools/commands include:
- `compute_spawn_score`, `/spawn-policy` in `spawn-controller.ts` (lines 109-207). Formula: `0.30*If + 0.20*Cc + 0.25*Fc + 0.15*Oc + 0.10*Uc` (lines 54-55), with threshold/depth/concurrency constants at lines 43-45.
- Memory tools in `lifelong-memory.ts`: `memory_add`, `memory_update`, `memory_deprecate`, `memory_query`, `/memory-add` (lines 143-315). Schema types are lines 20-31.
- Evolution tools in `evolution-governor.ts`: `propose_evolution`, `/evolution-log`, `/evolution-pending` (lines 161-290), with safety/human approval logic lines 107-126.
- Judge tools in `judge-evolution.ts`: `record_preference_pair`, `generate_eval_plan`, `/judge-corpus`, `/judge-calibrate` (lines 172-402).
- Curriculum tools in `curriculum-generator.ts`: `generate_challenge`, `list_challenges`, `promote_challenge`, `/curriculum` (lines 143-332).
- Workflow support: `validation_complete`/`/validation-rules`; `aggregate_reviews`/`/review-rules`; `slice_memory`/`/memory-search`/`/memory-stats`; `save_attempt_summary`/`/attempt-history`/`/attempt-compare`; worktree tools; safety/config/trace commands.

### Agents and workflows
Actual agent count is cohesive: 13 files under `.pi/agents`, matching `AGENTS.md` and the system guide. Roles are explicit and permissioned. Examples:
- `scout.md` lines 1-22: read-only repo mapper; lines 38-45 require extracting all validation commands.
- `planner.md` lines 60-74: chooses simplest topology and maps difficulty to Workflows A-G.
- `reviewer.md` lines 27-35: independent anti-bystander review.
- `tester.md` lines 54-69: ordered validation ladder.
- `judge.md` lines 12-23: hard same-model-family refusal; lines 48-68: bias families and plan-first judging.
- `memory-curator.md` lines 31-69: typed memory taxonomy and schema.
- `failure-attributor.md` lines 39-57: 12-category failure taxonomy.
- `evolution-auditor.md` lines 26-48: Endure -> Excel -> Evolve audit frame.

Workflow prompts are present for A-G. Workflow E defines recurring-pattern thresholds and proposal gates (lines 16-61, 65-150). Workflow F defines the learning loop, memory types, extraction questions, memory-curator step, skill promotion ladder, and curriculum frontier filter (lines 16-230).

### Demo workflow entry point
`workflow-f-demo` is the only runnable npm surface:
```json
// based-agent/workflow-f-demo/package.json lines 5-8
"scripts": {
  "reset": "node scripts/reset-demo.mjs",
  "demo": "node scripts/run-demo.mjs",
  "validate": "node scripts/validate-demo.mjs"
}
```
The README documents root commands with `npm --prefix workflow-f-demo run ...` (lines 20-48), produced artifacts (lines 50-63), and containment (lines 65-70). `run-demo.mjs` resets output, copies templates, validates invalid/corrected memory fixtures, then emits attempt summaries, attribution, memory, curriculum, holdout, and validation docs (lines 14-232). `reset-demo.mjs` guards deletion to exactly the demo `output/` folder (lines 5-15).

## Architecture

`based-agent` is primarily a pi package/scaffold, not a conventional app/library. The intended runtime is pi auto-discovery from root `package.json` plus `.pi/settings.json`:

1. **Configuration core**: `AGENTS.md` is the source of truth for operating rules, safety, validation, routing, memory, judge, and evolution.
2. **Pi resources**:
   - `.pi/agents`: role contracts used by the supervisor/runtime.
   - `.pi/skills/<skill>/SKILL.md` + `REFERENCE.md`: static procedures and command-facing skills.
   - `.pi/prompts`: Workflow A-G templates.
   - `.pi/extensions/*.ts`: runtime hooks/tools/commands for spawning, topology, tracing, memory, validation, review, worktrees, evolution, curriculum, judge calibration, safety.
3. **Artifacts**:
   - `.pi/runs/<run-id>/`: handoff artifacts (`context.md`, `plan.md`, `attempt-summary.json`, etc.).
   - `.pi/mas-traces/`: trace logs and spawn logs.
   - `.pi/memory/`: typed memory stores.
   - `.pi/curricula/`: frontier challenge cases.
   - `.pi/evals/judge-corpus/`: preference pairs and eval plans.
4. **Self-evolution path**: trace/attempt summary -> failure attribution -> evolution proposal -> safety/regression/human gate -> staged promote/rollback. Production prompt/skill/agent/topology/extension changes are not supposed to happen directly.
5. **Learning path**: attempt summary -> learning candidates -> memory-curator writes typed memories -> curriculum-generator writes challenge cases -> judge/evolution gates decide promotion.
6. **Demo path**: `workflow-f-demo` models the learning path in a contained Node ESM fixture; it does not exercise real pi extension loading.

## Package scripts / commands

### Root `based-agent`
- No npm scripts in `based-agent/package.json` (lines 1-12).
- No root package dependencies/devDependencies, despite TypeScript extensions importing `@earendil-works/pi-coding-agent` and using TS types.
- Pi runtime command is documented as simply `pi` from `based-agent` root in `.pi/SYSTEMS-GUIDE.md` lines 35-53.
- Required validation commands are policy-only in `AGENTS.md` lines 74-104; there is no root implementation of `npm test`, `npm run lint`, `npm run typecheck`, or config-linter invocation.

### Workflow F demo
From `based-agent` root:
- `npm --prefix workflow-f-demo run reset`
- `npm --prefix workflow-f-demo run demo`
- `npm --prefix workflow-f-demo run validate`

From `based-agent/workflow-f-demo`:
- `npm run reset`
- `npm run demo`
- `npm run validate`

The README explicitly warns not to combine current directory `workflow-f-demo/` with `--prefix workflow-f-demo` (lines 38-40).

### Pi extension commands/tools (runtime dependent)
Documented by code registration, not root npm scripts:
- Commands: `/spawn-policy`, `/memory-add`, `/skills`, `/judge-corpus`, `/judge-calibrate`, `/curriculum`, `/evolution-log`, `/evolution-pending`, `/validation-rules`, `/safety-rules`, `/review-rules`, `/topology-validate`, `/trace-status`, `/trace-last`, `/attempt-history`, `/attempt-compare`, `/memory-search`, `/memory-stats`, `/worktrees`, `/agenda`, `/lint-config`.
- Tools: `compute_spawn_score`, `memory_add`, `memory_update`, `memory_deprecate`, `memory_query`, `skill_register`, `skill_promote`, `skill_deprecate`, `skill_query`, `record_preference_pair`, `generate_eval_plan`, `generate_challenge`, `list_challenges`, `promote_challenge`, `validation_complete`, `aggregate_reviews`, `run_topology`, `slice_memory`, `save_attempt_summary`, `create_worktree`, `list_worktrees`, `merge_worktree`, `delete_worktree`, `agenda_add`, `agenda_check`, `agenda_complete`, `propose_evolution`.

## Documentation and cohesion findings

### Strong cohesion
- The same conceptual loops repeat across `AGENTS.md`, agent docs, workflow prompts, extensions, and demo: scout before build, evidence over opinion, validation before done, typed memory, attribution before evolution, anti-bystander review, cross-model judge.
- Agents are not decorative; each has a concrete role, permissions table, and output artifact expectations.
- Workflow E/F docs are detailed enough to explain the self-evolution and lifelong-learning mechanisms without needing code first.
- `workflow-f-demo` is a useful contained example and has good reset safety.

### Drift / inconsistencies
1. **Extension count drift**: `.pi/SYSTEMS-GUIDE.md` table of contents and directory map claim “16 Extensions” (lines 14 and 106-122), but the directory contains 19 `.ts` files. Extra actual files include `memory-hygiene-gate.ts`, `memory-provenance-tracer.ts`, and `revisitable-memory-router.ts` in addition to the 16 named in the guide.
2. **Guide file layout drift**: `.pi/SYSTEMS-GUIDE.md` lines 106-122 show extension entries as directory-like names without `.ts`; actual files are flat `.ts` modules. Lines 137-150 show skills as `feature-spec.md` etc.; actual layout is `.pi/skills/<name>/SKILL.md` plus `REFERENCE.md`. Lines 151-158 show prompt filenames like `workflow-e-evolution.md`, `workflow-f-lifelong.md`, `workflow-g-judge-improvement.md`; actual files are `workflow-e-self-evolution.md`, `workflow-f-lifelong-learning.md`, and `workflow-g-eval-improvement.md`.
3. **Guide says setup safety-gate “see Phase 1 roadmap”** at lines 66-75, but the immediate setup steps do not give a concrete verification command for extension loading.
4. **EVALUATION.md appears stale in places**: earlier report language claims some agent/skill files were unconfirmed, while actual `find` confirms 13 agent files and 13 `SKILL.md` files now exist.
5. **Date drift**: many docs hardcode 2026-05-19; demo hardcodes 2026-05-27. That is acceptable for fixtures but may confuse users trying to distinguish template dates from current runtime dates.

## Developer usability friction points

1. **No root quickstart command**: A developer cannot run `npm test`, `npm run validate`, `npm run demo`, or `npm run typecheck` at `based-agent` root. The only executable package scripts are nested in `workflow-f-demo`.
2. **No installable dev environment for extensions**: TypeScript extension files import `@earendil-works/pi-coding-agent`, but root `package.json` has no dependency/devDependency and no `tsconfig.json`. This makes editor IntelliSense, typechecking, and CI validation unclear.
3. **Policy validation ladder is not executable as-is**: `AGENTS.md` mandates `npx tsc --noEmit`, `npx eslint .`, `npm test`, etc. (lines 74-104), but these commands are generic examples and not wired to this package. Users may think they are required and then hit missing config/deps.
4. **Docs imply automatic pi routing but do not show how to verify it**: `.pi/SYSTEMS-GUIDE.md` says pi auto-discovers resources (lines 35-53), but there is no smoke-test command such as “run `/lint-config`” or “check `/trace-status`” after launch.
5. **Runtime bridge assumptions are implicit**: Extension code registers pi tools/commands, but a non-pi developer has no local harness to load or test those modules. The demo validates only a small Workflow F fixture and does not test extension registration.
6. **Terminology overload**: `memory` is described as 7 conceptual stores in `AGENTS.md` lines 354-362, but implementation type names are `fact`, `decision`, `skill`, `heuristic`, `episode`, `reminder`, `negative_lesson` in `lifelong-memory.ts` lines 20-31 and demo validator lines 5-6. The mapping is learnable but not surfaced in a single “implementation vs concept” table.
7. **Self-evolution is highly documented but hard to execute manually**: Workflow E requires trace audit, systemic attribution, proposal, gates, holdout eval, and human approval. The code has `propose_evolution`, but docs do not show a concrete sample invocation or artifact path lifecycle from proposal to approval.
8. **Demo path is nested and easy to misuse**: README mitigates this with `--prefix` guidance, but the root package could still provide wrapper scripts to reduce friction.
9. **No README at root**: The root has `AGENTS.md`, `EVALUATION.md`, and `.pi/SYSTEMS-GUIDE.md`, but many developers will look for `README.md` first. The only README is inside `workflow-f-demo`.
10. **Evaluation/report docs are large and claim-heavy**: `EVALUATION.md` and `RESEARCH-REPORT.md` are valuable but long; there is no small “operator cheat sheet” at root besides `AGENTS.md` quick reference.
11. **Protected-path policy conflicts with demo expectations unless scoped carefully**: `AGENTS.md` protects `.pi/memory`, `.pi/skills`, `.pi/evals`, and `AGENTS.md` (lines 152-185). The demo properly writes under `workflow-f-demo/output`, but developers may not immediately know which places are safe for experiments.
12. **Counts and claims should be generated or linted**: The extension count drift shows that static docs are already out of sync with actual files. This is especially ironic because `config-linter.ts` exists; docs should either be generated or validated by it.

## Common workflows mapped

### First use / orientation
1. Open `based-agent/.pi/SYSTEMS-GUIDE.md` lines 27-92 for prerequisites and examples.
2. Read `based-agent/AGENTS.md` lines 40-70 for architecture and lines 108-148 for working rules.
3. Launch `pi` from `based-agent` root; verify commands/extensions in pi if available.

### Normal coding task
- Workflow selection from `AGENTS.md` lines 478-489 or `planner.md` lines 60-74.
- For difficulty >=3, scout produces `context.md` before planning (`AGENTS.md` lines 110-117).
- Planner writes `plan.md`; builder is sole main-workspace writer; tester/reviewer run independently; summarizer emits attempt summary.

### Review/test
- Reviewer reads changed files and one-hop callers, emits file:line findings (`reviewer.md` lines 59-90).
- Tester reruns exact plan commands and records exit codes (`tester.md` lines 54-69).
- Review aggregation should use `aggregate_reviews` and avoid consensus/majority prompts (`review-aggregator.ts` lines 188-223, 306-309).

### Self-evolution
- Use Workflow E only for repeated/systemic failures, not one-offs (`workflow-e-self-evolution.md` lines 16-29).
- Gate order: Endure, Excel, Evolve (`workflow-e-self-evolution.md` lines 33-61; `AGENTS.md` lines 409-429).
- Proposal must include target artifact, evidence, diff, test cases, regression constraints, rollback (`workflow-e-self-evolution.md` lines 129-150+).
- Code support: `propose_evolution`, `/evolution-log`, `/evolution-pending` in `evolution-governor.ts`.

### Lifelong learning
- Workflow F after reusable fact/lesson/skill gap/curriculum candidate (`workflow-f-lifelong-learning.md` lines 16-30).
- Summarizer extracts candidates; memory-curator writes typed memory; curriculum-generator writes challenge cases; skill promotion requires evidence and often Workflow E (`workflow-f-lifelong-learning.md` lines 54-230).
- Demo: run nested npm scripts in `workflow-f-demo`.

## Start Here
Open `based-agent/.pi/SYSTEMS-GUIDE.md` first for onboarding intent, but immediately cross-check it against `based-agent/package.json`, `based-agent/.pi/settings.json`, and actual `.pi` directory contents because the guide has file layout/count drift. For behavior changes or usability fixes, start with root `package.json` and `.pi/SYSTEMS-GUIDE.md`: they are the first developer contact points and currently cause the most friction.
