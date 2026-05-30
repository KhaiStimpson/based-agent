# Based-Agent Path Protection Final Validation

Working directory for npm/node commands: `C:\Users\khail\OneDrive\Documents\Dev\agentic-coding-research\based-agent`

## `npm run check:scripts`

```text
> research-driven-pi-mas@1.0.0 check:scripts
> node --check scripts/lib/structure.mjs && node --check scripts/validate-structure.mjs && node --check scripts/doctor.mjs && node --check scripts/status.mjs
```

## `npm run validate:structure`

```text
> research-driven-pi-mas@1.0.0 validate:structure
> node scripts/validate-structure.mjs

Structure validation passed (0 warning(s)).
```

## `npm run doctor`

```text
> research-driven-pi-mas@1.0.0 doctor
> node scripts/doctor.mjs

based-agent doctor
Artifacts: 21 extensions, 13 agents, 7 prompts, 13 skills
Doctor passed (0 warning(s)).
```

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

## `grep` safety-gate for `evolution-approvals|evolution-proposals`

Command target: `based-agent/.pi/extensions/safety-gate.ts`

```text
safety-gate.ts-99- // ─── Protected path patterns ──────────────────────────────────────────────────
safety-gate.ts-100- 
safety-gate.ts-101- const PROTECTED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
safety-gate.ts:102:   { pattern: /(^|\/)\.pi\/evolution-approvals(\/|$)/i, reason: "manual evolution approval artifacts must be created outside agent tools" },
safety-gate.ts-103-   { pattern: /(^|\/)\.pi\/evolution-proposals(\/|$)/i, reason: "evolution proposal lifecycle is writable only by scanner/governor extension code" },
safety-gate.ts-104-   { pattern: /(^|\/)\.pi\/skills(\/|$)/i, reason: "validated skill proposals only; no direct agent write" },
safety-gate.ts-105-   { pattern: /(^|\/)\.pi\/memory(\/|$)/i, reason: "memory writes require authorized memory tooling" },
safety-gate.ts-100- 
safety-gate.ts-101- const PROTECTED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
safety-gate.ts-102-   { pattern: /(^|\/)\.pi\/evolution-approvals(\/|$)/i, reason: "manual evolution approval artifacts must be created outside agent tools" },
safety-gate.ts:103:   { pattern: /(^|\/)\.pi\/evolution-proposals(\/|$)/i, reason: "evolution proposal lifecycle is writable only by scanner/governor extension code" },
safety-gate.ts-104-   { pattern: /(^|\/)\.pi\/skills(\/|$)/i, reason: "validated skill proposals only; no direct agent write" },
safety-gate.ts-105-   { pattern: /(^|\/)\.pi\/memory(\/|$)/i, reason: "memory writes require authorized memory tooling" },
safety-gate.ts-106-   { pattern: /(^|\/)\.pi\/evals\/judge-corpus(\/|$)/i, reason: "judge corpus writes require schema validation" },
safety-gate.ts-253-         ...PROTECTED_PATH_PATTERNS.map((p) => `  🔒 ${p.pattern.source}: ${p.reason}`),
safety-gate.ts-254-         "",
safety-gate.ts-255-         "Additional rules:",
safety-gate.ts:256:         "  • Agent write/edit/create/delete tools are blocked from .pi/evolution-approvals/ and .pi/evolution-proposals/.",
safety-gate.ts-257-         "  • Shell mutations of .pi/evolution-approvals/ and .pi/evolution-proposals/ are blocked for agent bash calls.",
safety-gate.ts-258-         "  • Writing to .pi/extensions/ triggers a warning (system permission scope).",
safety-gate.ts-259-         "  • Use evolution-governor to propose changes to prompts, skills, and agents.",
safety-gate.ts-254-         "",
safety-gate.ts-255-         "Additional rules:",
safety-gate.ts-256-         "  • Agent write/edit/create/delete tools are blocked from .pi/evolution-approvals/ and .pi/evolution-proposals/.",
safety-gate.ts:257:         "  • Shell mutations of .pi/evolution-approvals/ and .pi/evolution-proposals/ are blocked for agent bash calls.",
safety-gate.ts-258-         "  • Writing to .pi/extensions/ triggers a warning (system permission scope).",
safety-gate.ts-259-         "  • Use evolution-governor to propose changes to prompts, skills, and agents.",
safety-gate.ts-260-         "  • New tools/extensions/permissions require human-approved evolution proposals created outside the agent tool path."
```
