---
name: repo-validation
description: Run the correct validation commands for this project. Use when verifying code changes, before marking a task complete, before emitting a rollout summary, or whenever tests have not been explicitly run. No task is complete without validation evidence.
---

# Repo Validation

## Quick start

Use this before declaring work done. Discover the project type, run the available validation ladder, and record exact evidence for any skipped command.

## Workflow

- Inspect project files to choose syntax, lint, tests, schema checks, and security gates.
- Run targeted checks first when available, then broader suite if needed.
- Document command, exit code, and key output.
- If a command is unavailable, explain why and name the fallback used.

## Example

For a TypeScript repo, run typecheck, lint, tests, and JSON/schema checks relevant to changed files before completion.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
