---
name: failure-attribution
description: Run a structured postmortem on any failed task to classify root cause and propose prevention. Use when tests fail, a task stalls after two attempts, a repair is needed, or a recurring problem is suspected. Invoke before attempting a third pass at any failing task.
---

# Failure Attribution

## Quick start

Use this after failed validation, stalled repair, repeated tool friction, or before a third attempt. Classify one primary root cause and produce a prevention path.

## Workflow

- Collect exact evidence: command, exit code, output, files, and attempted fix.
- Separate symptom, trigger, and root cause.
- Choose exactly one primary failure category.
- Recommend a repair, validation command, and durable prevention if the pattern recurs.

## Example

If tests fail because an API was guessed, classify context failure and require a scout pass before the next implementation.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
