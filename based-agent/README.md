# based-agent

`based-agent` is a pi package for research-driven multi-agent coding workflows. It bundles agents, prompts, skills, safety gates, trace capture, attempt summaries, memory tools, judge/evaluation helpers, and governed self-evolution.

## Safety model

- Evolution scanning is proposal-only: `/evolution-scan --write` may create JSON records under `.pi/evolution-proposals/` and must not edit prompts, skills, agents, settings, or extensions.
- Approval artifacts under `.pi/evolution-approvals/` must be created outside the agent tool path by a human/operator; agent write/edit/create/delete tools and shell mutations are blocked from fabricating them.
- Generic agent tampering with `.pi/evolution-proposals/` is blocked; scanner/governor extension code writes lifecycle changes internally via `fs`.
- Promotion requires an approved proposal, safety/regression evidence, an allowlisted target, explicit proposed content, and a rollback snapshot.
- Protected paths include `AGENTS.md`, `.pi/skills/`, `.pi/memory/`, `.pi/evals/judge-corpus/`, `.pi/evolution-approvals/`, and `.pi/evolution-proposals/`.
- Auto-generated attempt summaries are conservative and use `verdict: "needs_refinement"`.

## Use as a pi package

The package advertises pi metadata in `package.json` and `.pi/settings.json`:

- extensions: `.pi/extensions`
- skills: `.pi/skills`
- prompts: `.pi/prompts`

Load the `based-agent` directory as the package root in a pi session.

## Autopilot

Autopilot is enabled by default through `.pi/autopilot.json` and `.pi/extensions/autopilot.ts`. A user can just prompt Pi to build, fix, review, or research; autopilot classifies the task, selects relevant skills, retrieves hygienic/revisitable memory, creates working-memory updates during development, and plans complementary extensions such as safety, validation, context packs, spawn/topology checks, review aggregation, curriculum, judge, and evolution governance.

The intended interaction model is:

```text
user prompt -> autopilot profile -> selected skills/extensions -> working memory during development -> validation/review -> completion promotion/proposals
```

Autopilot tells the user which workflow, skills, memory, and retry budget it selected. The agent should use the selected skills internally; the user should not need to call `/skills`, `/memory-search`, `/context-pack`, `/spawn-policy`, `/topology-validate`, or evolution commands just to get a normal task done.

### What autopilot does automatically

| Phase | Automatic behavior |
|---|---|
| Startup | config linting, memory hygiene, revisitable memory packet, skill ecosystem audit when relevant |
| Planning | task profile, risk flags, skill selection, context pack, memory slices, spawn score/topology guidance |
| During work | trace capture, safety checks, validation failure capture, working-memory writes, retry steering |
| Review | anti-bystander review aggregation and judge/eval planning when risk or prompt calls for it |
| Completion | validation gate, attempt summary, trajectory audit, memory/skill candidate curation, curriculum/evolution proposal hooks |

Protected changes stay proposal-first. Working memory is session-local while the task is active and promotes at completion according to config. Failed-attempt lessons start session-local and can promote after the task completes. Use `/autopilot` for status, `/autopilot reload` after durable resource changes, or `/autopilot promote` to force a completion-style memory promotion.

### Configuration

`.pi/autopilot.json` controls autonomy without changing extension code:

| Setting | Default | Meaning |
|---|---:|---|
| `enabled` | `true` | Turns the supervisor layer on or off |
| `mode` | `autonomous` | Uses skills/extensions by default instead of waiting for explicit user commands |
| `retry_limit` | `2` | Maximum validation retry count before escalation |
| `durable_memory.write_mode` | `automatic` | Promotes eligible working memory automatically; set to `proposal_first` for review-first behavior |
| `working_skills.proposal_first` | `true` | Skill candidates go to governed candidate outputs, not directly into live skills |
| `reload.strategy` | `checkpointed` | Injects refreshed working context at turn checkpoints |
| `review.auto_review` | `risk_based` | Runs review logic when prompt/risk flags justify it |
| `external_research.ralph_proposals_path` | `../ralph-loop/data/proposals/proposals.json` | Optional local proposal corpus used as inspiration when available |

Autopilot writes task-local artifacts under `.pi/runs/<date>/<run-id>/`, including `working-memory.jsonl`, `working-skills.jsonl`, `context-pack-autopilot.md`, and `autopilot-runtime.json`.

## npm scripts

Run from `based-agent/`:

```bash
npm run status
npm run validate:structure
npm run doctor
npm run check:scripts
node scripts/status.mjs --json
```

`status` prints artifact counts. `validate:structure` verifies required package files/directories and JSON parseability. `doctor` adds operational health checks such as configured directories and duplicate slash commands.

## `/ba` command hub

Use `/ba` or `/ba help` for the command map.

Common entries:

- `/ba autopilot` -> `/autopilot`, `/autopilot reload`, `/autopilot promote`
- `/ba status`, `/ba doctor`, `/ba validate-structure`
- `/ba attempts` → `/attempt-history`, `/attempt-compare`
- `/ba evolution` → `/evolution-pending`, `/evolution-log`, `/evolution-scan`, `/evolution-approve`, `/evolution-reject`, `/evolution-promote`, `/evolution-rollback`
- `/ba safety` → `/safety-rules`, `/validation-rules`
- `/ba memory`, `/ba skills`, `/ba judge`, `/ba topology`, `/ba traces`

## Attempts and evidence

Write-bearing runs automatically create compact artifacts under `.pi/runs/<date>/` when no manual summary was saved:

- `auto-<timestamp>-summary.json`
- `auto-<timestamp>-evidence.json`

Evidence includes changed file paths, compact command/validation records, safety warnings, and a trace reference when available. Obvious secret-looking values are redacted.

## Evolution flow

1. Scan: `/evolution-scan` reports findings without writing. `/evolution-scan --write` creates deduplicated proposal JSON only.
2. Review: `/evolution-pending` or `/evolution-log` shows status, gates, evidence, validation commands, and next actions.
3. Decide: reject with `/evolution-reject <id> <reason>`, or manually approve by having a human/operator create `.pi/evolution-approvals/<id>.json` outside the agent write/edit/create/delete/bash tool path with the proposal id, displayed fingerprint, `approved_by` human/manual/user actor, and non-empty `reviewer_notes`; then run `/evolution-approve <id>` to verify the artifact.
4. Promote: `/evolution-promote <id>` applies only approved, gated proposals whose manual approval artifact still matches the proposal id/fingerprint, actor, and notes; it creates a snapshot first.
5. Roll back: `/evolution-rollback <id> <reason>` restores from the promotion snapshot and preserves proposal history.

## Validation ladder

Before handoff, run:

```bash
npm run check:scripts
npm run validate:structure
npm run doctor
npm run status
node scripts/status.mjs --json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('.pi/settings.json','utf8')); JSON.parse(require('fs').readFileSync('.pi/autopilot.json','utf8'))"
```

If the pi runtime dependencies are installed, also run TypeScript over the touched extensions. A full `.pi/extensions/*.ts` check may currently report older tool-result typing drift in pre-existing extensions; treat that as a separate cleanup unless the touched file is involved.
