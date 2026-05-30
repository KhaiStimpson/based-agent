# Adversarial UX/Cohesion Review — `based-agent/`

Scope reviewed: `based-agent/` only. I could not read the requested repo-level `plan.md` or `progress.md` because neither file exists at the repository root in this checkout (`find . -name plan.md` and `find . -name progress.md` returned no matches). I inspected `based-agent/AGENTS.md`, `EVALUATION.md`, `.pi/settings.json`, extension/prompt files, and the Workflow F demo.

## Correct

- The package has a coherent conceptual architecture: `AGENTS.md` defines workflow rules, validation expectations, protected paths, structured handoff artifacts, spawn policy, memory policy, and self-evolution governance (`based-agent/AGENTS.md:108-185`, `based-agent/AGENTS.md:207-230`).
- The demo is runnable and contained. `workflow-f-demo/README.md` gives exact commands and says generated state is confined to `output/` (`based-agent/workflow-f-demo/README.md:16-18`, `based-agent/workflow-f-demo/README.md:20-48`). I verified:
  - `npm --prefix workflow-f-demo run demo` exited 0.
  - `npm --prefix workflow-f-demo run validate` exited 0 and reported `Validated 13 generated artifacts and both memory oracle paths.`
- There are real implementation hooks for persistent traces, attempt summaries, memory, prospective agenda, and evolution proposals rather than only prose. Examples: trace JSONL persistence (`based-agent/.pi/extensions/trace-ledger.ts:40-65`), attempt summary tool (`based-agent/.pi/extensions/attempt-summarizer.ts:133-218`), memory add/update tools (`based-agent/.pi/extensions/lifelong-memory.ts:142-239`), and agenda startup alerts (`based-agent/.pi/extensions/prospective-agenda.ts:91-119`).

## Blocker

1. **No top-level onboarding path; developers are dropped into a dense contract instead of a usable product.**
   - Evidence: `based-agent/` has no `README.md`; the only README is the nested demo README (`based-agent/workflow-f-demo/README.md`). `package.json` contains metadata and pi paths only, with no `scripts`, usage, install, or validation commands (`based-agent/package.json:1-12`).
   - UX impact: a developer cannot quickly answer: “How do I install this in pi?”, “What command do I run first?”, “What tools/commands become available?”, “How do I know the extensions loaded?”, or “What does self-evolution do without me?” The first visible document, `AGENTS.md`, is comprehensive but too policy-heavy to serve as onboarding.
   - Recommendation: add a root `README.md` with a 5-minute quickstart: prerequisites, install/load instructions for pi, expected directory layout, first demo command, command index, what is automatic vs manual, troubleshooting, and the exact validation ladder.

2. **Root package commands are missing, so documented validation expectations fail at the package entry point.**
   - Evidence: running `npm test` in `based-agent/` failed with `npm error Missing script: "test"`. `package.json` defines no scripts (`based-agent/package.json:1-12`). Meanwhile `AGENTS.md` says `npm test` is part of the required validation ladder when available (`based-agent/AGENTS.md:80-91`) and the zero-tolerance rule says available commands must pass (`based-agent/AGENTS.md:104`).
   - UX impact: developers reasonably start with `npm test` or `npm run`; they get a dead end. This also weakens trust in the package’s “validation-first” message.
   - Recommendation: add root scripts that proxy the demo and validate package structure, e.g. `demo`, `validate:demo`, `validate:json`, `validate:extensions`/`typecheck` if dependencies are available, and either a real `test` script or explicit documentation that no root test suite exists.

3. **The extension TypeScript cannot be independently installed or type-checked from this package as presented.**
   - Evidence: extensions import `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` (`based-agent/.pi/extensions/attempt-summarizer.ts:12-14`, repeated across extensions), but root `package.json` declares no `dependencies` or `devDependencies` (`based-agent/package.json:1-12`). There is also no root `tsconfig.json` or typecheck script.
   - UX impact: a developer cannot distinguish “this is a pi package that pi compiles with its own bundled deps” from “this repo is incomplete.” If an extension fails to load, there is no local command to reproduce it.
   - Recommendation: document pi’s dependency resolution if external packages are provided by the host; otherwise add dependencies and a root typecheck command. Include a “verify extensions loaded” command list.

## High Priority

4. **Self-evolution is mostly reactive and human-gated; the package does not yet deliver “self-evolution without human triggering” in the UX.**
   - Evidence: Workflow E says to use self-evolution only when recurring patterns across multiple runs signal a needed artifact change, and says behavior-changing evolution is “always proposal-based and human-approved” (`based-agent/.pi/prompts/workflow-e-self-evolution.md:8-12`). It requires 3+ same-category postmortems or 2+ same-mechanism occurrences before proceeding (`based-agent/.pi/prompts/workflow-e-self-evolution.md:16-30`, `based-agent/.pi/prompts/workflow-e-self-evolution.md:81-89`). The governor only notifies about already-pending proposals at session start (`based-agent/.pi/extensions/evolution-governor.ts:141-158`) and provides proposal listing commands (`based-agent/.pi/extensions/evolution-governor.ts:267-316`); it does not automatically mine traces and create proposals.
   - UX impact: the system improves if a human or agent explicitly runs Workflow F/E or calls tools. That is valuable, but not the advertised autonomous loop. Developers may expect the system to notice repeated failures and initiate evolution; current behavior is closer to “assisted governance after manual trigger.”
   - Recommendation: implement or document an automatic evolution scheduler/trigger: on session end or startup, scan recent `.pi/runs`/`.pi/mas-traces`, compute recurrence thresholds, create a draft trace-audit/proposal, and notify the developer. Keep promotion human-gated, but make detection/proposal automatic.

5. **Attempt summaries are required by policy but only prompted in interactive sessions, not enforced.**
   - Evidence: `AGENTS.md` says attempt summaries are mandatory (`based-agent/AGENTS.md:144-145`). The implementation merely watches write tools and, on agent end, asks the UI to save a summary; it explicitly skips non-interactive mode (`based-agent/.pi/extensions/attempt-summarizer.ts:116-127`, especially `based-agent/.pi/extensions/attempt-summarizer.ts:120`).
   - UX impact: the memory/evolution flywheel silently starves in automation/headless use. If summaries are not saved, later Workflow F/E has no evidence substrate.
   - Recommendation: make summary capture a hard gate for write sessions or emit an automatic minimal summary from trace data when the agent does not call `save_attempt_summary`. At minimum, show a session-end warning that names the missing artifact and command/tool to run.

6. **Memory promotion can bypass provenance requirements through `memory_update`.**
   - Evidence: `memory_add` always creates `status: "provisional"` (`based-agent/.pi/extensions/lifelong-memory.ts:172-185`), which is good. But `memory_update` accepts `status: "validated"` as an optional update (`based-agent/.pi/extensions/lifelong-memory.ts:202-207`) and writes the update directly (`based-agent/.pi/extensions/lifelong-memory.ts:228-233`) without requiring provenance metadata. The demo validator rejects validated memory without provenance, but that validator is only in the demo (`based-agent/workflow-f-demo/scripts/validate-memory.mjs`).
   - UX/cohesion impact: the live memory implementation is weaker than the demo’s lesson. A developer may believe provenance-first validation is enforced globally because the demo showcases it, but the actual tool allows unsupported promotion.
   - Recommendation: enforce the same provenance rule in `lifelong-memory.ts` before allowing `status: validated`, and expose a root validation command that scans `.pi/memory` for invalid promotions.

## Medium Priority

7. **Command discoverability is fragmented.**
   - Evidence: commands/tools are spread across extension files (`/attempt-history`, `/attempt-compare`, `/trace-status`, `/trace-last`, `/evolution-log`, `/evolution-pending`, agenda tools, memory tools), but there is no root command index. The demo README only documents demo npm scripts (`based-agent/workflow-f-demo/README.md:20-48`).
   - UX impact: developers cannot discover what the package adds after install without reading TypeScript files.
   - Recommendation: add `COMMANDS.md` or a README section listing slash commands, registered tools, what creates artifacts, and what to run when something goes wrong.

8. **The package over-claims research coverage relative to what a developer can verify locally.**
   - Evidence: `EVALUATION.md` is a broad implementation-coverage report, but the root package has no validation script to check the coverage claims; root `npm test` fails due no script. Some claims are only policy/prose, while executable checks live mostly in demo scripts.
   - UX impact: high credibility risk. The more comprehensive the claims, the more important it is to provide a simple verification path.
   - Recommendation: convert key claims into executable smoke tests: extension import/typecheck, required files present, command registrations detectable, protected-path patterns configured, demo validates, memory schema validates.

9. **Live self-evolution promotion remains manual after proposal creation.**
   - Evidence: after `propose_evolution`, the next steps say “promote to target file manually or via promotion workflow” (`based-agent/.pi/extensions/evolution-governor.ts:252-257`). The extension only lists proposals; it does not provide approve/promote/rollback tools in the inspected portion (`based-agent/.pi/extensions/evolution-governor.ts:267-316`).
   - UX impact: developers get governance records, but the “loop” is not cohesive end-to-end inside the tool.
   - Recommendation: add explicit `approve_evolution`, `promote_evolution`, and `rollback_evolution` commands/tools with dry-run, diff display, regression command capture, and artifact status transitions.

## Notes

- The Workflow F demo is the strongest UX asset. It should be linked from a root README and made the first-run experience.
- The project’s policies are thoughtful, but the package currently reads more like a research artifact/config bundle than a developer-ready agent product. The fastest cohesion win is not more agent theory; it is a root quickstart, scripts, command index, and a visible autonomous trigger path for trace-to-learning/proposal generation.
