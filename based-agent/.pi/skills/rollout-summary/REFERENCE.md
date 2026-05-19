# Rollout Summary Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Rollout Summary

Structured attempt summaries are the primary substrate for test-time scaling (Recursive Tournament Voting, Parallel-Distill-Refine), failure attribution, curriculum generation, and self-evolution. Raw traces are too verbose to compare; this compact schema enables selection and refinement.

**Source:** Scaling Test-Time Compute for Agentic Coding (2604.16529v1)

---

## Full JSON Schema

```json
{
  "attempt_id": "string — unique ID, format: <run_date>-<task_hash>-<attempt_n>",
  "task_ref": "string — task description or ticket ID (≤ 100 chars)",
  "hypothesis": "string — the core strategy or root-cause theory this attempt tested (≤ 80 chars)",
  "files_inspected": [
    "path/to/file.py — what you learned (≤ 50 chars)"
  ],
  "files_changed": [
    "path/to/file.py — what changed and why (≤ 50 chars)"
  ],
  "commands_run": [
    "command — exit_code — result_summary (≤ 50 chars)"
  ],
  "tests_passed": [
    "test_name or test_suite_result (≤ 50 chars)"
  ],
  "tests_failed": [
    "test_name — failure_reason (≤ 50 chars)"
  ],
  "progress_made": [
    "specific advance: what now works that didn't before (≤ 50 chars)"
  ],
  "failure_modes": [
    "what went wrong and where (≤ 50 chars)"
  ],
  "remaining_risks": [
    "what could still break (≤ 50 chars)"
  ],
  "reusable_insights": [
    "fact/pattern useful for future runs on this codebase (≤ 50 chars)"
  ],
  "diff_ref": "string — path to patch file or git commit hash",
  "cost": {
    "tokens_used": 0,
    "wall_seconds": 0,
    "agent_spawns": 0
  },
  "verdict": "candidate | reject | needs_refinement"
}
```

---

## Required Fields

All fields are required. Use `[]` for empty arrays, `null` for unknown string fields, `0` for unknown numerics.

| Field | Purpose | Failure if missing |
|---|---|---|
| `attempt_id` | Uniquely identifies this attempt for RTV comparison | Cannot deduplicate or select |
| `hypothesis` | Explains the strategy — enables PDR seeding | Top attempts cannot seed refinement |
| `files_inspected` | What was read — distinguishes real from guessed knowledge | NameError/TypeError failures recur |
| `files_changed` | Audit trail for diff replay | Cannot rollback or attribute |
| `commands_run` | Validation evidence | No success guarantee |
| `tests_passed` / `tests_failed` | P2P/F2P status | Cannot compute RTV score |
| `failure_modes` | Attribution seed | Evolution loop loses signal |
| `reusable_insights` | Feeds declarative memory | Knowledge lost across runs |
| `diff_ref` | Points to actual patch | Cannot apply top attempt |
| `verdict` | Drives selection logic | RTV and PDR cannot proceed |

---

## Determining Verdict

| Verdict | Meaning | Conditions |
|---|---|---|
| `candidate` | This attempt may be the best solution | All F2P tests pass AND no P2P regressions AND validation commands exit 0 |
| `needs_refinement` | Partial progress, worth seeding a follow-up | Some F2P tests pass OR meaningful progress_made AND failure_modes identified AND remaining_risks are specific |
| `reject` | This strategy doesn't work | All F2P tests fail OR new regressions introduced AND failure_modes explain why AND hypothesis is disproven |

**Never emit `candidate` without:**
1. At least one passing validation command with exit code
2. Zero P2P regressions (or documented explanation for each)
3. `diff_ref` pointing to a real file or commit

---

## Compact Format Guidelines

Keep each list item ≤ 50 characters. Use abbreviations for commands:

```
# Good (compact, informative)
"commands_run": [
  "pytest tests/ — 0 — 47 passed",
  "mypy . — 0 — no errors",
  "ruff check . — 0 — clean"
]

# Bad (too verbose)
"commands_run": [
  "I ran pytest on the tests directory and it showed 47 tests passing with no failures and 0 errors in the output"
]
```

For `files_inspected` and `files_changed`, include only the decisive detail:
```
# Good
"weather/client.py — found _fetch() at line 47"
"weather/cache.py — added LRUCache wrapper"

# Bad  
"I looked at the weather client file to understand how the fetch method works"
```

---

## How Summaries Are Used

### Recursive Tournament Voting (RTV)
The `judge` agent compares attempt summaries in small groups. Summaries with clear hypotheses, specific evidence, and passing tests win over verbose or unvalidated ones. The winner of each group advances to the next round.

**Implication:** a well-structured summary from a partial attempt can beat a sloppy summary from a "complete" one if the evidence is stronger.

### Parallel-Distill-Refine (PDR)
The top 2–4 summaries by RTV score seed a fresh refinement attempt. The refiner receives:
- Top candidates' `hypothesis`, `files_changed`, `reusable_insights`
- All `failure_modes` from rejected attempts (negative knowledge)
- Combined `remaining_risks`

**Implication:** `reusable_insights` and `failure_modes` are the most valuable fields for PDR. Fill them carefully.

### Self-Evolution
`failure_modes` from multiple runs feed the `failure-attribution` skill and eventually `curriculum-generation`. Recurring failure patterns across summaries become curriculum cases and skill updates.

---

## Using the Tool

```
save_attempt_summary({
  attempt_id: "2026-05-19-abc123-1",
  task_ref: "Add cache layer to WeatherClient",
  hypothesis: "Wrap _fetch() in LRUCache with TTL",
  files_inspected: [
    "weather/client.py — _fetch() at line 47",
    "weather/models.py — WeatherData type at line 12"
  ],
  files_changed: [
    "weather/client.py — added get_weather_cached()",
    "weather/cache.py — new LRUCache implementation"
  ],
  commands_run: [
    "pytest tests/test_weather.py — 0 — 12 passed",
    "mypy weather/ — 0 — no errors"
  ],
  tests_passed: ["test_cache_hit", "test_cache_miss", "test_ttl_expiry"],
  tests_failed: [],
  progress_made: ["Cache layer functional", "TTL expiry works"],
  failure_modes: [],
  remaining_risks: ["Cache not persisted across process restart"],
  reusable_insights: [
    "WeatherData is frozen dataclass — hashable",
    "_fetch() raises NetworkError on timeout"
  ],
  diff_ref: ".pi/runs/2026-05-19-abc123-1/patch.diff",
  cost: { tokens_used: 18420, wall_seconds: 47, agent_spawns: 0 },
  verdict: "candidate"
})
```

---

## Run-End Reflection

Before emitting the summary, answer:
1. What is the most important thing this attempt proved or disproved?
2. What would the next attempt do differently?
3. What facts about the codebase are now certain (should be stored as declarative memory)?
4. What failed that could become a curriculum case?

