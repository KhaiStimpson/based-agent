# Holdout Evaluation

**Run:** `workflow-f-demo-20260527-provenance`

| Candidate | Oracle | Result |
|---|---|---|
| Baseline: validated claim without provenance | `node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail` | Rejected as expected |
| Repair: provisional heuristic with attribution evidence | `node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json` | Accepted |

The repaired heuristic remains `provisional`. This run demonstrates the
learning path but does not satisfy multi-run promotion evidence.
