---
name: curriculum-generation
description: Generate frontier challenge cases from real failures and weak spots in agent runs. Use after failure attribution to create holdout tests, when building self-evolution evaluation data, or when a recurring failure needs a regression test. Every case must have a deterministic oracle.
---

# Curriculum Generation

Self-improving systems need evaluation tasks that are neither trivially solved nor impossible — the "frontier band." Agent0 research shows that filtering curriculum tasks to this band (executor uncertainty ≈ 0.5) produces the most useful training signal. For pi, this translates to challenge cases that expose capability gaps without being unsolvable.

**Source:** Agent0 (2511.16043v1); LIFE survey (2605.14892v1); ELL/StuLife (2508.19005v6)

**Important scope note:** Agent0's gains come from weight updates via RL on a Qwen3-8B-Base model. The curriculum *design principles* — frontier filtering, governance scoring, oracle requirements — transfer to pi's config/prompt evaluation. The weight-training loop itself does not.

---

## Frontier Task Principle

A good challenge case targets **p̂ ≈ 0.5**: the agent's current self-consistency on this task type should be near 50% — not already solved (p̂ > 0.85, too easy) and not impossible (p̂ < 0.15, too hard).

**How to estimate p̂ for a task type:**
1. Check attempt summaries for similar tasks: what fraction ended in `verdict: candidate`?
2. If > 85% are candidates: too easy — need harder variant
3. If < 15% are candidates: too hard or unverifiable — improve oracle before generating more
4. If 20–80%: frontier zone — generate more cases of this type

---

## 8 Source Categories for Challenge Cases

Generate cases from real traces in these categories:

### 1. Validation Failures
Tasks where the agent completed code but validation commands failed. The case tests whether the agent can run and interpret validation correctly.

### 2. Tool Misuse
Runs where an agent called a tool with wrong arguments, wrong schema, or in the wrong context. The case tests correct tool usage.

### 3. Context Misses
Runs where the agent guessed an interface instead of reading the file (NameError, AttributeError). The case tests whether the agent reads before it writes.

### 4. Reviewer False Negatives
Review passes that approved code which later failed tests. The case tests the reviewer's ability to catch real bugs.

### 5. Ambiguous Handoffs
Agent A produced output, agent B misinterpreted the contract. The case tests whether handoff artifacts are precise enough.

### 6. Stale-Memory Incidents
Runs where retrieved memory was outdated and caused a wrong decision. The case tests whether the agent validates memory before acting on it.

### 7. Cost Runaway
Runs that exceeded token/time budgets without completing. The case tests efficient routing and topology selection.

### 8. Security Near-Misses
Runs where an agent almost ran a destructive command or accessed a protected path. The case tests whether safety gates catch the pattern.

---

## Challenge Case Schema

```json
{
  "case_id": "curr-<date>-<hash>",
  "title": "<descriptive title ≤ 60 chars>",
  "source_category": "<one of 8 categories above>",
  "source_run_id": "<run_id that inspired this case>",
  "source_failure_mode": "<from failure-attribution postmortem>",
  
  "task_description": "<precise task statement — what must be accomplished>",
  "task_files": ["<files the agent will need to read or modify>"],
  "task_tools": ["<tools the agent must use>"],
  
  "difficulty_estimate": 0.5,  // p̂ — target near 0.5
  "difficulty_justification": "<why this is in the frontier band>",
  
  "oracle": {
    "type": "command | test | file_check | assertion",
    "method": "<exact command or check that verifies success deterministically>",
    "expected_output": "<what the oracle must return for success>",
    "failure_output": "<what the oracle returns on failure>"
  },
  
  "novelty_hash": "<hash of task_description + source_category — for deduplication>",
  "governance_score": 0.0,  // see scoring formula below
  
  "promotion_criteria": {
    "min_attempts_before_promote": 3,
    "target_success_rate": "0.4-0.7",  // frontier band
    "oracle_validated": true
  },
  
  "tags": ["<keywords>"],
  "created_at": "YYYY-MM-DD",
  "status": "active | retired | superseded | ambiguous"
}
```

---

## Governance Score

The governance score determines which candidate cases are prioritized. Higher score = higher priority.

```
governance_score = 
    frontier_uncertainty      # reward cases near p̂ ≈ 0.5 (neither too easy nor impossible)
  + useful_tool_use           # reward cases requiring ≥1 meaningful tool call
  + novelty                   # reward cases that are genuinely new (not near existing cases)
  - repetition                # penalize cases that test the same pattern as existing ones
  - cost_penalty              # penalize cases requiring excessive tokens/time to evaluate
  - safety_risk               # penalize cases with ambiguous or unsafe oracle methods
  - ambiguity_penalty         # penalize cases where success criteria are subjective
```

**Scoring guidance:**

| Factor | Score +0.5 | Score 0 | Score -0.5 |
|---|---|---|---|
| frontier_uncertainty | p̂ between 0.35–0.65 | p̂ between 0.20–0.80 | p̂ < 0.15 or > 0.85 |
| useful_tool_use | ≥2 essential tool calls | 1 essential call | No tools required |
| novelty | No similar case within edit distance 0.3 | Somewhat similar | Near-duplicate |
| repetition | — | — | 3+ similar cases already active |
| cost_penalty | — | — | Estimated > 30K tokens to evaluate |
| safety_risk | Oracle is fully safe | — | Oracle could modify state |
| ambiguity_penalty | Fully deterministic oracle | — | Oracle requires human judgment |

Promote cases with `governance_score > 0.5`. Reject cases with `governance_score < 0`.

---

## Oracle Requirement

**Every challenge case must have a verifiable oracle.** A case without a deterministic oracle is not a challenge case — it is an ambiguous prompt.

```
✅ Valid oracles:
  - "pytest tests/test_auth.py::test_refresh_valid exits with code 0"
  - "grep 'def get_weather_cached' weather/client.py — returns non-empty"
  - "mypy weather/client.py — exits with code 0"
  - "python -c 'from weather.client import WeatherClient; c = WeatherClient(); print(c.get_weather_cached.__doc__)' — returns non-empty string"

❌ Invalid oracles (require human judgment):
  - "The code looks correct"
  - "The implementation follows best practices"
  - "Tests are comprehensive"
  - "The solution is efficient"
```

---

## Deduplication

Before adding a new case, check for duplicates:

```
generate_curriculum_case({
  task_description: "<new task>",
  check_duplicates: true,
  similarity_threshold: 0.3  // reject if cosine sim > 0.3 to existing active case
})
```

Two cases are duplicates if they:
1. Test the same failure mode (same source_category + same mechanism)
2. Use the same oracle with minor variations
3. Have nearly identical task_description (normalized)

Keep the case with the higher governance_score; retire the other.

---

## Using the Curriculum Tools

```
# Generate a new challenge case from a failure
generate_curriculum_case({
  source_run_id: "<run_id>",
  source_category: "context_miss",
  task_description: "<derived from failure>",
  oracle_method: "<exact command>",
  check_duplicates: true
})

# Score an existing case
score_curriculum_case({
  case_id: "curr-20260519-abc",
  run_results: [
    { run_id: "run-001", verdict: "candidate" },
    { run_id: "run-002", verdict: "reject" },
    { run_id: "run-003", verdict: "candidate" }
  ]
  // Updates difficulty_estimate to 0.67, governance_score to 0.6
})

# Query frontier cases for a task type
curriculum_query({
  source_categories: ["validation_failure", "context_miss"],
  status: "active",
  governance_score_min: 0.3,
  order_by: "governance_score desc",
  limit: 10
})
```

---

## Example Challenge Case

**Source:** Run `2026-05-10-abc123` failed with `AttributeError: 'WeatherClient' object has no attribute 'cache'` — the agent guessed that `cache` attribute existed without reading the class definition.

```json
{
  "case_id": "curr-20260519-ctxmiss-001",
  "title": "Read class definition before accessing attributes",
  "source_category": "context_miss",
  "source_run_id": "2026-05-10-abc123",
  "source_failure_mode": "AttributeError from guessed interface",
  
  "task_description": "Add a method get_weather_cached() to WeatherClient that caches results. Do not guess any attributes or methods — read weather/client.py first.",
  "task_files": ["weather/client.py", "weather/models.py"],
  "task_tools": ["read", "bash", "edit"],
  
  "difficulty_estimate": 0.5,
  "difficulty_justification": "Interface is not obvious from name alone; requires reading file",
  
  "oracle": {
    "type": "command",
    "method": "python -c \"from weather.client import WeatherClient; c = WeatherClient('test'); r = c.get_weather_cached('London'); assert r is not None\"",
    "expected_output": "exit code 0",
    "failure_output": "AttributeError or ImportError"
  },
  
  "novelty_hash": "sha256:context_miss:weatherclient_attribute",
  "governance_score": 0.65,
  
  "promotion_criteria": {
    "min_attempts_before_promote": 3,
    "target_success_rate": "0.4-0.7",
    "oracle_validated": true
  },
  
  "tags": ["context-miss", "attribute-error", "interface-reading"],
  "created_at": "2026-05-19",
  "status": "active"
}
```
