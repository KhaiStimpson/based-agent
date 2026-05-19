---
name: feature-spec
description: Convert a feature request into a complete executable contract with interfaces, F2P/P2P tests, and acceptance criteria. Use when starting any non-trivial coding task to prevent NameError/TypeError failures from guessing interfaces. Invoke before writing any code when the task touches more than one file, involves external APIs, modifies existing data structures, or has unclear acceptance criteria.
---

# Feature Spec

## Quick start

Use this before non-trivial coding work. Convert the request into an executable contract with behavior, interfaces, acceptance criteria, and fail-to-pass/pass-to-pass tests.

## Workflow

- Read relevant files before defining interfaces.
- State inputs, outputs, side effects, errors, and invariants.
- Identify or create F2P tests for new behavior and P2P tests for preserved behavior.
- Define done criteria and validation commands before implementation.

## Example

For an API cache, specify cache key inputs, TTL behavior, invalidation rules, and tests for hit, miss, and stale cases.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
