---
name: rollout-summary
description: Produce a structured attempt summary at the end of any agent run that changed code or attempted a task. Use when a run ends, whether successful or not, to support test-time scaling, RTV selection, PDR refinement, and self-evolution.
---

# Rollout Summary

## Quick start

Use this at the end of any meaningful attempt. Summarize goal, changes, validation, failures, and next steps in structured form for selection, refinement, memory, and evolution.

## Workflow

- Record task, approach, files changed, and commands run.
- Capture validation passed, failed, skipped, and why.
- List failure modes, risks, and lessons without raw trace dumping.
- Keep the summary compact enough to be reused as context.

## Example

After a failed repair, include the failing command, root symptom, suspected category, and recommended next attempt.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
