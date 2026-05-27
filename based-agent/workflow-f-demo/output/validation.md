# Demo Validation Evidence

**Run:** `workflow-f-demo-20260527-provenance`

| Check | Expected result | Observed result |
|---|---|---|
| Invalid memory fixture | Validator rejects unsupported promotion | validated memory requires metadata.provenance.artifact_ref and confirmed_by |
| Corrected memory fixture | Validator accepts provisional proposal | accepted |
| Curriculum oracle | Deterministic command-based rejection test | recorded in curriculum artifact |

Run `npm run validate` to re-execute these checks and verify artifact links.
