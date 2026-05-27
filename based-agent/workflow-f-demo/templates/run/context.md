## Repository Context

**Task:** Demonstrate Workflow F with a contained failure, repair, typed memory, and curriculum artifact.
**Language / Build System:** JavaScript ESM / npm
**AGENTS.md found:** yes

### Build & Validation Commands
- Targeted tests: `node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail`
- Targeted tests: `node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json`
- Demo validation: `npm run validate`
- Notes: the repository root has no test script; this demo supplies executable checks inside its own package.

### Affected Files
| File | Role | Change Risk | Test Coverage |
|---|---|---|---|
| `workflow-f-demo/` | Isolated example package | low | `npm run validate` |

### Existing Interfaces Used
- `.pi/extensions/attempt-summarizer.ts` stores compact attempt summaries.
- `.pi/extensions/lifelong-memory.ts` stores typed memory with `metadata`.
- `.pi/extensions/curriculum-generator.ts` stores executable challenge cases.

### Flags & Risks
- The live `.pi/memory/` and `.pi/curricula/` paths are not used by this demo.
- Reset is limited to `workflow-f-demo/output/`.

### Recommended Starting Points For Planner
- Primary output location: `workflow-f-demo/output/`
- Oracle command: `npm --prefix workflow-f-demo run validate`
