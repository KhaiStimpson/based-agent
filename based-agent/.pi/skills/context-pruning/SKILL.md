---
name: context-pruning
description: Select and compress relevant context before any agent call to prevent token overflow and decision noise. Use when context exceeds 50K tokens, when an agent works across many files, or when preparing a spawn package for a child agent. Never pass raw conversation history — use typed memories only.
---

# Context Pruning

## Quick start

Use this before large agent calls, child spawns, or memory retrieval. Select typed, task-relevant context instead of raw transcripts or broad file dumps.

## Workflow

- Identify the agent role and output contract.
- Rank structural, declarative, procedural, negative, episodic, and prospective context by task relevance.
- Summarize large sources into a bounded context slice with paths, decisions, risks, and validation commands.
- Exclude raw conversation history unless the user explicitly asks for it.

## Example

Before spawning a builder, pass only touched file summaries, API constraints, failing command output, and acceptance criteria.

## Reference

See [REFERENCE.md](REFERENCE.md) for the detailed protocol, schemas, command examples, and longer checklists.
