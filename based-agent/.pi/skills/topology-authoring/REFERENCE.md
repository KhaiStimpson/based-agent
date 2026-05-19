# Topology Authoring Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Topology Authoring

Agent interaction topology should be a validated, schema-compliant DAG — not an unstructured group chat. AgentConductor research shows a 3B-parameter topology-aware orchestrator achieves 14.6 pp accuracy gain and 68% token cost reduction over the best prior method by treating topology as data.

**Source:** AgentConductor: Topology Evolution for Multi-Agent Competition-Level Code Generation (2602.17100v1)

---

## Difficulty-to-Topology Mapping

Compute difficulty score before selecting topology:

```
difficulty = (affected_files > 5 ? 2 : 0)
           + (unknown_codebase ? 2 : 0)
           + (requirement_ambiguity ? 1 : 0)
           + (no_test_suite ? 1 : 0)
           + (security_risk ? 2 : 0)
           + (cross_module_deps > 3 ? 1 : 0)
           + (prior_failures > 1 ? 1 : 0)
           + (context_pressure ? 1 : 0)
```

| Score | Topology | Max Nodes | Max Parallel |
|---|---|---|---|
| 0–2 | Single agent | 1 | 1 |
| 3–5 | Chain: plan → build → validate | 4 | 1 |
| 6–8 | Pipeline: scout/research → plan → build → review+test | 7 | 2 |
| 9+ | Full pipeline + isolated worktrees + human checkpoints | 10 | 5 |

---

## YAML Topology Schema

```yaml
version: 1
task_ref: "<task description ≤ 60 chars>"
difficulty_score: <0-10>

budget:
  max_nodes: <4 | 7 | 10>        # per difficulty tier
  max_parallel: <1 | 2 | 5>      # per difficulty tier
  max_rounds: <1 | 2 | 3>        # re-iteration cycles allowed
  max_wall_minutes: <15 | 30 | 60>
  max_tokens_total: <50000 | 100000 | 200000>

layers:
  - id: <layer_id>            # unique string
    parallel: true | false    # agents in this layer run concurrently
    independent: true | false # agents MUST NOT see each other's output (use for review layers)
    agents:
      - id: <agent_id>        # unique string
        role: scout | researcher | planner | builder | reviewer | tester | debugger | summarizer
        write: true | false   # only one agent may have write: true unless worktrees: true
        worktrees: true | false  # isolated git worktree for this agent
        inputs:               # list of agent_ids whose outputs feed this agent
          - <agent_id>
        output: <artifact_filename>   # what this agent produces
        budget:
          max_tokens: <number>
          max_wall_minutes: <number>
        constraints:
          - "<specific constraint string>"

validation:
  required: true | false    # must be true for any topology that writes code
  final_layer: <layer_id>   # the last layer must run validation
  commands:
    - "<exact validation command>"
  success_criteria: "all_pass | majority_pass"
```

---

## Validation Rules (Enforce Before Running)

A topology is invalid if ANY of the following are true:

```
RULE 1: ACYCLIC
  No agent's inputs may contain its own id or create a cycle
  Check: topological sort must succeed

RULE 2: KNOWN AGENTS ONLY
  Every agent.role must be one of the defined roles
  Check: role ∈ {scout, researcher, planner, builder, reviewer, tester, debugger, summarizer}

RULE 3: FINAL VALIDATION REQUIRED
  Any topology with write:true agents must have validation.required=true
  The final layer must be a validation/tester layer
  Check: last layer contains no write:true agents

RULE 4: SINGLE WRITER
  At most one agent may have write:true UNLESS worktrees:true is set for those agents
  Check: count(write:true) ≤ 1 OR all write:true agents have worktrees:true

RULE 5: INDEPENDENT REVIEW ISOLATION
  Any layer with independent:true must have parallel:true
  Agents in an independent layer must NOT list each other in inputs
  Check: no cross-references within an independent layer

RULE 6: BUDGET CAPS
  max_nodes ≤ difficulty cap (4/7/10)
  max_parallel ≤ difficulty cap (1/2/5)
  Check: count(agents) ≤ max_nodes, max_concurrent ≤ max_parallel

RULE 7: EVERY EDGE HAS ARTIFACT
  Every input reference must correspond to a defined output artifact
  Check: for each (A→B edge), A.output must be defined

RULE 8: MAX DEPTH 5
  Longest path from source to sink ≤ 5 layers
  Check: BFS/DFS depth
```

---

## Node Budget Caps by Difficulty

From AgentConductor research — topology density should be controlled, not maximized:

| Difficulty | Max Total Nodes | Max Parallel Nodes | Max Rounds |
|---|---|---|---|
| Easy (0–2) | 1 | 1 | 1 |
| Medium (3–5) | 4 | 1 | 2 |
| Hard (6–8) | 7 | 2 | 2 |
| Expert (9+) | 10 | 5 | 3 |

**More nodes ≠ better results.** AgentConductor achieved 68% token cost reduction partly by reducing topology density.

---

## Complete Example: Complex Feature Task

Task: "Add OAuth2 authentication to the REST API" (difficulty score: 8)

```yaml
version: 1
task_ref: "Add OAuth2 auth to REST API"
difficulty_score: 8

budget:
  max_nodes: 7
  max_parallel: 2
  max_rounds: 2
  max_wall_minutes: 45
  max_tokens_total: 120000

layers:
  - id: context
    parallel: true
    agents:
      - id: scout
        role: scout
        write: false
        inputs: []
        output: context.md
        budget:
          max_tokens: 15000
          max_wall_minutes: 8
        constraints:
          - "Read auth-related files only"
          - "Find all existing auth middleware and route handlers"
      - id: researcher
        role: researcher
        write: false
        inputs: []
        output: oauth2-evidence.md
        budget:
          max_tokens: 10000
          max_wall_minutes: 8
        constraints:
          - "Document OAuth2 flow requirements"
          - "Find existing OAuth2 library usage in codebase"

  - id: plan
    parallel: false
    agents:
      - id: planner
        role: planner
        write: false
        inputs: [scout, researcher]
        output: plan.md
        budget:
          max_tokens: 12000
          max_wall_minutes: 8
        constraints:
          - "Include F2P and P2P test plan"
          - "Define acceptance criteria"

  - id: build
    parallel: false
    agents:
      - id: builder
        role: builder
        write: true
        inputs: [planner]
        output: implementation.diff
        budget:
          max_tokens: 40000
          max_wall_minutes: 15
        constraints:
          - "Single writer — no concurrent writes"
          - "Follow interfaces from context.md exactly"

  - id: review
    parallel: true
    independent: true
    agents:
      - id: reviewer
        role: reviewer
        write: false
        inputs: [builder]
        output: review-findings.json
        budget:
          max_tokens: 15000
          max_wall_minutes: 8
        constraints:
          - "Independent inspection — do not reference tester output"
          - "Cite file/line/command for every finding"
      - id: tester
        role: tester
        write: false
        inputs: [builder]
        output: test-results.json
        budget:
          max_tokens: 10000
          max_wall_minutes: 10
        constraints:
          - "Run all auth-related tests"
          - "Record exact commands and exit codes"

  - id: validate
    parallel: false
    agents:
      - id: summarizer
        role: summarizer
        write: false
        inputs: [reviewer, tester]
        output: validation-summary.md
        budget:
          max_tokens: 8000
          max_wall_minutes: 5
        constraints:
          - "Aggregate by evidence rank, not vote count"
          - "Preserve any critical findings from minority"

validation:
  required: true
  final_layer: validate
  commands:
    - "pytest tests/test_auth.py -v"
    - "mypy api/auth.py"
  success_criteria: all_pass
```

---

## Using the run_topology Tool

```
run_topology({
  topology_yaml: "<yaml string or file path>",
  validate_first: true,       // always validate schema before running
  dry_run: false,
  artifact_dir: ".pi/runs/<run-id>/",
  on_failure: "stop | continue_non_blocking | human_checkpoint"
})
```

The tool returns:
```json
{
  "status": "success | partial | failed | blocked_on_validation",
  "layers_completed": ["context", "plan", "build"],
  "layers_failed": ["review"],
  "artifacts": { "plan.md": "...", "implementation.diff": "..." },
  "validation_result": { "commands": [], "verdict": "pass|fail" },
  "budget_consumed": { "tokens": 0, "wall_seconds": 0, "nodes_used": 0 }
}
```

---

## When to Add Human Checkpoints

Add a human checkpoint layer when:
- Difficulty score ≥ 9
- Task involves security, credentials, or data migration
- Builder makes an architectural decision not in the plan
- Tests fail at the end of the review layer

```yaml
  - id: human_check
    parallel: false
    agents:
      - id: checkpoint
        role: summarizer
        write: false
        inputs: [reviewer, tester]
        output: checkpoint-request.md
        constraints:
          - "Pause for human approval before continuing"
          - "Summarize findings and proposed next steps"
```

