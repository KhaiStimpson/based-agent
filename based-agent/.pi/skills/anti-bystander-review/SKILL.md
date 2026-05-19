---
name: anti-bystander-review
description: Conduct independent code review following the anti-bystander protocol. Use when reviewing code, adding reviewer or tester agents to a workflow, or aggregating findings from multiple reviewers. Never show one reviewer's output to another before their first pass is complete.
---

# Anti-Bystander Review

## Quick start

Use this before any review or review aggregation. Keep first-pass reviewers isolated, cap routine validation at two independent reviewers, and aggregate by evidence quality rather than vote count.

## Workflow

- Create identical review packets that omit peer findings.
- Collect independent findings with file, line, command, or reproduction evidence.
- Aggregate blockers by severity and preserve any reproducible high-severity minority finding until disproven.
- Only share synthesized results after first-pass independence is complete.

## Example

For a PR review, send the same diff and validation commands to reviewer and tester separately, then merge findings only after both return evidence.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
