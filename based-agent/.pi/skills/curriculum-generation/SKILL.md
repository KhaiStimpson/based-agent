---
name: curriculum-generation
description: Generate frontier challenge cases from real failures and weak spots in agent runs. Use when failure attribution should become holdout tests, self-evolution evaluation data, or regression coverage for a recurring failure. Every case must have a deterministic oracle.
---

# Curriculum Generation

## Quick start

Use this after failure attribution or recurring weak spots. Convert real failures into frontier challenge cases with deterministic oracles.

## Workflow

- Start from a documented failure, weak spot, or regression risk.
- Write a challenge case with task type, input, expected behavior, oracle, and difficulty rationale.
- Reject cases without deterministic validation.
- Deduplicate against existing cases before adding it to a corpus.

## Example

Turn a repeated schema-validation miss into a fixture plus command that fails before the repair and passes after it.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
