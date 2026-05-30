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

- `/ba status`, `/ba doctor`, `/ba validate-structure`
- `/ba attempts` → `/attempt-history`, `/attempt-compare`
- `/ba evolution` → `/evolution-pending`, `/evolution-log`, `/evolution-scan`, `/evolution-approve`, `/evolution-reject`, `/evolution-promote`, `/evolution-rollback`
- `/ba safety` → `/safety-rules`, `/validation-rules`
- `/ba memory`, `/ba judge`, `/ba topology`, `/ba traces`

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
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('.pi/settings.json','utf8'))"
```

If the pi runtime dependencies are installed, also run `npx tsc --noEmit`.
