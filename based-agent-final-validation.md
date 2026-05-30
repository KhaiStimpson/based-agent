# based-agent final validation

## `npm run check:scripts`

```text
> research-driven-pi-mas@1.0.0 check:scripts
> node --check scripts/lib/structure.mjs && node --check scripts/validate-structure.mjs && node --check scripts/doctor.mjs && node --check scripts/status.mjs
```

Exit code: 0

## `npm run validate:structure`

```text
> research-driven-pi-mas@1.0.0 validate:structure
> node scripts/validate-structure.mjs

Structure validation passed (0 warning(s)).
```

Exit code: 0

## `npm run doctor`

```text
> research-driven-pi-mas@1.0.0 doctor
> node scripts/doctor.mjs

based-agent doctor
Artifacts: 21 extensions, 13 agents, 7 prompts, 13 skills
Doctor passed (0 warning(s)).
```

Exit code: 0

## `npm run status`

```text
> research-driven-pi-mas@1.0.0 status
> node scripts/status.mjs

based-agent status
- extensions: 21
- agents: 13
- prompts: 7
- skills: 13
- memory items: 0
- judge corpus entries: 0
- runs: 0
- traces: 0
- evolution proposals: 0
```

Exit code: 0

## `node scripts/status.mjs --json`

```json
{
  "cwd": "C:\\Users\\khail\\OneDrive\\Documents\\Dev\\agentic-coding-research\\based-agent",
  "counts": {
    "extensions": 21,
    "agents": 13,
    "prompts": 7,
    "skills": 13,
    "memory_items": 0,
    "judge_corpus_entries": 0,
    "runs": 0,
    "traces": 0,
    "evolution_proposals": 0
  }
}
```

Exit code: 0
