# Workflow F End-to-End Demo

This directory is a contained, rerunnable demonstration of the repository's
lifelong-learning loop:

```text
failed attempt -> attribution -> repaired attempt -> typed memory -> curriculum case
```

The scenario is intentionally realistic for this repository: an agent attempts
to promote a memory statement to `validated` without deterministic provenance.
The demo validator rejects it, the failure is attributed, a corrected
`provisional` proposal passes, and the learning is preserved as typed outputs
plus a future challenge case.

The demo does not write into the live `.pi/memory/`, `.pi/curricula/`,
`.pi/skills/`, or `.pi/evals/` stores. All generated state is confined to
`output/`.

## Run It

From the repository root:

```powershell
npm --prefix workflow-f-demo run reset
npm --prefix workflow-f-demo run demo
npm --prefix workflow-f-demo run validate
```

From inside `workflow-f-demo/`:

```powershell
npm run reset
npm run demo
npm run validate
```

Do not add `--prefix workflow-f-demo` when your current directory is already
`workflow-f-demo/`; npm would then search for a nested
`workflow-f-demo/workflow-f-demo/package.json`.

The `demo` command resets its own output before producing a fresh run, so this
short form is also sufficient:

```powershell
npm --prefix workflow-f-demo run demo
npm --prefix workflow-f-demo run validate
```

## What It Produces

| Artifact | Workflow F role |
|---|---|
| `output/run/context.md` | Scout context consumed before attempting work |
| `output/run/plan.md` | Executable acceptance criteria for the modeled run |
| `output/run/attempt-01-summary.json` | Rejected attempt with validation failure |
| `output/run/failure-attribution.json` | Root-cause analysis and prevention path |
| `output/run/attempt-02-summary.json` | Corrected candidate attempt |
| `output/run/learning-candidates.json` | Bridge from trace to learning outputs |
| `output/memory/*.json` | Typed episode, negative lesson, heuristic, reminder |
| `output/curriculum/provenance-before-promotion.json` | Frontier challenge with deterministic oracle |
| `output/holdout-evaluation.md` | Baseline-versus-corrected result |
| `output/validation.md` | Commands and expected results for the demo run |

## Containment And Reset

`scripts/reset-demo.mjs` refuses to delete anything unless its resolved target
is exactly this directory's `output/` folder. Templates and scripts remain
immutable between runs. Running the full cycle repeatedly regenerates the same
artifact set without changing live agent state.

## Implementation Mapping

The JSON outputs use the compact shapes implemented by:

- `.pi/extensions/attempt-summarizer.ts`
- `.pi/extensions/lifelong-memory.ts`
- `.pi/extensions/curriculum-generator.ts`

The supporting markdown and postmortem JSON retain the richer evidence chain
specified by `.pi/prompts/workflow-f-lifelong-learning.md` and the associated
skills. This is a demo fixture, not a record of a production run.
