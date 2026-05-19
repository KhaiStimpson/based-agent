---
name: topology-authoring
description: Design and validate a DAG workflow topology for a multi-agent task. Use when a task requires more than 3 agents, complex coordination, or when the difficulty score is 6 or higher. Invoke before spawning any multi-agent workflow to ensure the graph is acyclic, budget-capped, and has a final validation layer.
---

# Topology Authoring

## Quick start

Use this when a task needs a multi-agent workflow. Represent the workflow as a schema-validated DAG with budget caps, spawn limits, and a final validation layer.

## Workflow

- Choose the simplest topology matching difficulty and risk.
- Define each node with role, input artifact, output artifact, tools, budget, and dependencies.
- Validate acyclicity, max concurrency, max depth, and protected-path rules.
- Add human checkpoints for safety, ambiguity, or high-impact changes.

## Example

For a difficulty 6 feature, define scout/research in parallel, planner, isolated builder, independent reviewer/tester, and final validation.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
