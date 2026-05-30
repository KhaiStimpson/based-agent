# based-agent approval/proposal path protection

## Findings and fix

Implemented the remaining blocker by hardening the agent-facing safety gate:

- Blocks agent `write`, `edit`, `create`, and `delete` tool calls targeting `.pi/evolution-approvals/`.
- Blocks generic agent `write`, `edit`, `create`, and `delete` tool calls targeting `.pi/evolution-proposals/`.
- Adds bash-shell mutation blocking for governed evolution artifacts, so common mutation routes such as redirection, `rm`, `mv`, `cp`, `mkdir`, `touch`, `tee`, `truncate`, and in-place `sed`/`perl` are denied when they target `.pi/evolution-approvals/` or `.pi/evolution-proposals/`.
- Leaves scanner/governor extension internals able to write lifecycle/proposal records via direct Node `fs`, because the safety gate intercepts agent tool calls rather than internal extension writes.

## Documentation updates

- Updated `based-agent/README.md` to state approval files must be created outside the agent tool path by a human/operator.
- Updated `/ba evolution` and `/ba safety` help text with the same external-approval requirement and protection summary.

## Doctor/validation updates

- Added `.pi/evolution-approvals` and `.pi/evolution-proposals` to the protected path list used by package structure helpers.
- Updated `doctor` to validate that every protected path marker is present in `.pi/extensions/safety-gate.ts` without requiring generated governance directories to already exist.

## Changed files

- `based-agent/.pi/extensions/safety-gate.ts`
- `based-agent/.pi/extensions/ba-command-hub.ts`
- `based-agent/README.md`
- `based-agent/scripts/lib/structure.mjs`
- `based-agent/scripts/doctor.mjs`

## Validation run

From `based-agent/`:

```text
npm run check:scripts
npm run validate:structure
npm run doctor
npm run status
node scripts/status.mjs --json
```

All commands passed. `doctor` passed with 0 warnings.

## Risks / notes

- The shell blocker is intentionally conservative for governed evolution paths. It may block some unusual shell commands containing redirects plus these paths, but this is aligned with the goal of preventing approval/proposal tampering through agent-accessible tool paths.
- No TypeScript compiler validation was run because the package scripts only include Node syntax checks for `.mjs` scripts and no local `tsc` validation script is defined.
