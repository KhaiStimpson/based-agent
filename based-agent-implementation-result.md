# based-agent implementation result

Implemented all approved based-agent phases within `based-agent/`.

## Summary

- Added `based-agent/README.md` as the package entry point with safety model, scripts, `/ba` hub, auto-summary/evidence, scanner, and evolution lifecycle docs.
- Added dependency-free Node scripts and helpers for status, structure validation, doctor checks, and script syntax checks.
- Added `/ba` command hub extension with read-only status/doctor/validation summaries and command routing help.
- Enhanced trace capture with compact command, write path, validation, error, and output evidence summaries with secret redaction.
- Enhanced attempt summarization to auto-write conservative summaries and evidence artifacts after write-bearing runs when no manual summary was saved.
- Added proposal-only evolution scanner with conservative evidence thresholds, fingerprints, duplicate suppression, and proposal JSON output only when `--write` is explicit.
- Reworked evolution governor lifecycle with backward-compatible proposal normalization plus approve, reject, promote, and rollback controls. Promotion is gated by approval, safety/regression evidence, target allowlist, explicit proposed content, and snapshot creation.

## Files changed/created by this implementation

- `based-agent/README.md`
- `based-agent/package.json`
- `based-agent/scripts/lib/structure.mjs`
- `based-agent/scripts/validate-structure.mjs`
- `based-agent/scripts/doctor.mjs`
- `based-agent/scripts/status.mjs`
- `based-agent/.pi/extensions/ba-command-hub.ts`
- `based-agent/.pi/extensions/evolution-scanner.ts`
- `based-agent/.pi/extensions/trace-ledger.ts`
- `based-agent/.pi/extensions/attempt-summarizer.ts`
- `based-agent/.pi/extensions/evolution-governor.ts`

Note: the working tree also contains pre-existing/unrelated `based-agent/workflow-f-demo` and some untracked extension changes that were not part of this implementation.

## Validation results

Passed:

```bash
cd based-agent
npm run check:scripts
npm run validate:structure
npm run doctor
npm run status
node scripts/status.mjs --json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('.pi/settings.json','utf8'))"
```

Observed outputs included:

- Structure validation passed with 0 warnings.
- Doctor passed with 0 warnings.
- Status counted 21 extensions, 13 agents, 7 prompts, 13 skills, 0 memory items, 0 judge corpus entries, 0 runs, 0 traces, and 0 evolution proposals.

Attempted TypeScript validation:

```bash
npx tsc --noEmit
```

This was unavailable as a meaningful project check because `based-agent` has no `tsconfig.json`; TypeScript printed help and exited nonzero.

A targeted TypeScript command against modified extensions also could not complete because local runtime/type dependencies are not installed (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`, and Node type declarations). It reported missing module/type declarations rather than implementation syntax errors.

## Caveats

- Evolution promotion intentionally does not apply arbitrary patches automatically. It requires full `proposed_content` or `proposed_content_ref`; `proposed_patch` is recorded but blocked from automatic application for safety.
- Auto summaries remain conservative (`needs_refinement`) even when validation commands are detected, per safety requirements.
- `/evolution-scan` is read-only by default; proposals are written only with `/evolution-scan --write` and only under `.pi/evolution-proposals/`.
