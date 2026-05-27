## Implementation Plan

**Task:** Test whether an agent promotes a typed memory claim without provenance, then preserve the repaired lesson.
**Date:** 2026-05-27
**Risk Level:** 2 - contained generated artifacts only
**Recommended Workflow:** F - the run yields reusable learning and a curriculum case.

### Acceptance Criteria

#### Fail-to-Pass
- `node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail` exits `0` only because rejection is observed.
- `node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json` exits `0`.

#### Pass-to-Pass
- `npm run validate` confirms all generated output references resolve.
- No generated artifact is written outside `workflow-f-demo/output/`.

### Execution Steps

1. Validate the unsupported `validated` memory fixture and record its rejection.
2. Attribute the rejection to a memory lifecycle failure.
3. Validate a corrected `provisional` proposal with provenance.
4. Emit typed memory outputs and a curriculum challenge with an executable oracle.
5. Record holdout and validation evidence.

### Promotion Gate

The new heuristic remains `provisional`: one successful repair demonstrates a
candidate lesson, not enough evidence to promote a broad reusable rule.
