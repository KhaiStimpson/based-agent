---
name: eval-planning
description: Generate task-adaptive evaluation plans before any pairwise judgment. Use when judging code quality, skill proposals, memory updates, topology proposals, or other candidate outputs. Generates a plan FIRST, then executes it, then produces a verdict; never jumps to verdict from impression alone.
---

# Eval Planning

## Quick start

Use this before pairwise judgment of code, skills, memory updates, topology, or evolution proposals. Produce a plan, execute it against candidates, then deliver a verdict.

## Workflow

- Strip candidate identity and avoid length or formatting preference.
- Define task-specific objective checks and subjective criteria.
- Evaluate both candidates with cited evidence.
- Run position-swap verification and accept only consistent verdicts.

## Example

For two skill drafts, compare trigger clarity, one-level references, concrete examples, and validation coverage before choosing a winner.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
