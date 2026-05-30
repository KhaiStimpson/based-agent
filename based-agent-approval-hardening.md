# based-agent approval hardening

## Findings

- The previous `approve_evolution` tool allowed an agent-callable path to set `approved_by` and notes from tool parameters.
- That path has been removed from `based-agent/.pi/extensions/evolution-governor.ts`.
- Approval now requires an external manual approval artifact at `.pi/evolution-approvals/<proposal-id>.json` containing:
  - `proposal_id`
  - `proposal_fingerprint`
  - `approved_by` identifying a human/manual/user actor
  - non-empty `reviewer_notes`
  - optional `approved_at`
- `/evolution-approve <id>` no longer accepts approval notes or actor from command/tool parameters. It only verifies the manual artifact and copies its trusted actor/notes into the proposal lifecycle.
- Promotion re-checks that the manual approval artifact still exists under `.pi/evolution-approvals/` and matches the proposal id, stable fingerprint, actor, and notes before applying any content.
- Approval/proposal ids are constrained to safe filename characters before proposal or approval files are read.
- `reject_evolution` remains agent-callable because rejection does not create a promotion-bearing approval path.

## Changed files

- `based-agent/.pi/extensions/evolution-governor.ts`
- `based-agent/README.md`
- `based-agent/EVALUATION.md`
- `based-agent/.pi/extensions/ba-command-hub.ts`

## Validation

Ran:

```bash
cd based-agent && npm run check:scripts && grep -R "registerTool({ name: \"approve_evolution\"" -n . || true && grep -R "approved_by: Type.String" -n . || true
```

Result:

- Existing script syntax checks passed.
- No `approve_evolution` tool registration remains.
- No `approved_by: Type.String` approval parameter path remains.

## Remaining risk

This hardening prevents approval through proposal/tool parameters. It relies on the manual approval artifact being created by a trusted human/operator process outside the agent approval tool path, as requested.
