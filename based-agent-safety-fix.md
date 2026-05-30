# based-agent safety fix

## Summary

Implemented the evolution-governor post-review safety fixes in `based-agent/.pi/extensions/evolution-governor.ts`.

## Changes

- `approve_evolution` now requires explicit `approved_by` and non-empty approval notes.
- Approval actors must indicate human/manual/user approval; approvals no longer default missing tool callers to `human`.
- Promotion now requires:
  - `approval_required=true`,
  - human/manual/user `approved_by`,
  - non-empty reviewer notes,
  - an `approved` lifecycle event with a human/manual/user actor and notes.
- Governed evolution targets are normalized to require approval.
- Fixed `proposed_content_ref` + `proposed_patch` handling so a resolved full content ref can promote safely, while patch-only proposals remain blocked.
- Rollback now records whether the promoted target existed before promotion and deletes newly-created targets on rollback instead of restoring an empty file.

## Validation

Ran from `based-agent`:

- `npm run check:scripts` — passed
- `npm run validate:structure` — passed (`Structure validation passed (0 warning(s)).`)
- `npm run doctor` — passed (`Doctor passed (0 warning(s)).`)

## Notes / risks

- Rollback delete semantics apply to promotions recorded after this change via the new `promoted_target_existed` proposal field. Older promoted proposals without that field keep legacy snapshot-restore behavior.
