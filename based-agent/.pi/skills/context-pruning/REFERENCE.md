# Context Pruning Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Context Pruning

Raw context degrades decision quality. SEMA research shows structural-entropy-driven pruning achieves 70% token reduction and 50% latency reduction while improving decision accuracy. The principle applies beyond real-time strategy: any agent call benefits from curated, decision-relevant context.

**Source:** SEMA (2603.23875v1); AgentSpawn (2602.07072v1); ELL/StuLife (2508.19005v6)

---

## Memory Types and When to Retrieve Each

| Memory Type | Contents | When to Retrieve |
|---|---|---|
| **Working** | Current task state, open files, active plan, blockers | Always — every agent call |
| **Declarative** | Project facts, commands, API constraints, user decisions | When agent needs to know how the codebase works |
| **Structural** | File/module/tool/agent relationships and call graphs | When agent crosses file or module boundaries |
| **Procedural** | Validated skills, playbooks, topology templates | When task type matches a known pattern |
| **Episodic** | Summarized past runs, failures, repairs | When task is similar to previous work |
| **Negative** | Known failed approaches, unsafe patterns, anti-patterns | When planning — to avoid known bad paths |
| **Prospective** | Pending obligations, deferred work, follow-ups | At session start and before marking work complete |

---

## Relevance Scoring

Score each candidate context item before including it. Higher score = include first, cut last.

```
relevance_score = (
  file_overlap          * 0.30   # files this item mentions that are in the current task
  + keyword_match       * 0.20   # shared terms between item and task description
  + dependency_proximity* 0.20   # how close in the call/import graph
  + recency             * 0.15   # how recently this item was validated or updated
  + outcome_utility     * 0.15   # fraction of past retrievals that helped vs. hurt
)
```

**Thresholds:**
- Score ≥ 0.6: always include
- Score 0.4–0.59: include if budget allows
- Score < 0.4: exclude unless it's the only relevant item

For negative memory: always include if it directly matches a planned action (regardless of score).

---

## SEMA Principle: 70% Token Reduction via Structural Filtering

The key insight: most of the state space is irrelevant to the current decision. Filter by:

1. **Task-relevant files only** — include only files the agent will read, write, or import
2. **Relevant memory types only** — match memory type to agent role (see table above)
3. **Compressed summaries, not raw traces** — use episode summaries, not full conversation logs
4. **Deduplicate** — if two memory items say the same thing, keep the one with higher confidence and more recent validation

```python
# Pseudocode for context selection
def select_context(task, memory_store, token_budget):
    candidates = []
    
    # Always include: working memory
    candidates.extend(memory_store.get(type="working"))
    
    # Score and rank all other items
    for item in memory_store.get_all():
        score = relevance_score(item, task)
        candidates.append((score, item))
    
    # Sort by score descending
    candidates.sort(key=lambda x: x[0], reverse=True)
    
    # Fill token budget
    selected = []
    used_tokens = 0
    for score, item in candidates:
        item_tokens = estimate_tokens(item)
        if used_tokens + item_tokens <= token_budget:
            selected.append(item)
            used_tokens += item_tokens
        elif score >= 0.6:
            # Compress and include high-relevance items even over budget
            compressed = compress(item, target_tokens=200)
            selected.append(compressed)
            used_tokens += 200
    
    return selected
```

---

## Anti-Noise Rule

**Never inject raw conversation history into an agent context.** Raw history:
- Contains superseded information from earlier in the conversation
- Includes failed hypotheses that may anchor the agent incorrectly
- Consumes tokens without adding decision value
- Triggers the Vanilla RAG problem: ELL research found Vanilla RAG reduced performance *below* no-memory baseline

**Instead, always use typed memories:**
1. Distill the relevant facts from the conversation first
2. Store them as typed memory (declarative, episodic, etc.)
3. Retrieve by relevance score, not by time

---

## Retrieval Order (When Budget Is Tight)

When tokens are scarce, retrieve in this order:

```
1. Declarative  — stable project facts, commands (most reusable)
2. Procedural   — validated skills for this task type
3. Working      — current task state (always)
4. Structural   — file/module relationships (add if crossing module boundaries)
5. Episodic     — past runs (add if task matches prior work)
6. Negative     — failed approaches (add if planning phase)
7. Prospective  — future obligations (add at session start or wrap-up)
```

---

## Using the slice_memory Tool

```
slice_memory({
  task_description: "<current task ≤ 100 chars>",
  relevant_files: ["<list of files this task touches>"],
  memory_types: ["working", "declarative", "procedural"],  // start narrow, add types if needed
  token_budget: 20000,
  min_relevance_score: 0.4,
  include_negative: true,         // always include matching negative memory
  exclude_raw_history: true,      // always true
  output_format: "structured"     // returns typed sections, not flat text
})
```

Returns:
```json
{
  "working_memory": { ... },
  "declarative_facts": [ ... ],
  "procedural_skills": [ ... ],
  "episodic_summaries": [ ... ],
  "negative_lessons": [ ... ],
  "tokens_used": 18420,
  "items_excluded": 14,
  "exclusion_reason": "below relevance threshold"
}
```

---

## Compression Targets per Agent Type

| Agent Role | Max Context Tokens | Primary Memory Types | Notes |
|---|---|---|---|
| Scout | 15,000 | Working, Structural | File-focused; keep call graph context |
| Planner | 20,000 | Working, Declarative, Procedural, Episodic | Needs patterns; include top-3 episodic summaries |
| Builder | 30,000 | Working, Declarative, Structural | Needs exact interfaces; heavy structural |
| Reviewer | 15,000 | Working, Negative | Load negative lessons to know what to look for |
| Tester | 10,000 | Working, Declarative | Commands and test locations primarily |
| Summarizer | 8,000 | Working, Episodic | Summaries compress from episodic; don't need full state |
| Failure-Attributor | 12,000 | Working, Episodic, Negative | Needs failure patterns for classification |
| Memory-Curator | 8,000 | All types (metadata only) | Needs type/id/salience of all items, not full content |

---

## Spawn Package Context Slice

When preparing context for a child agent, create a minimal spawn package:

```json
{
  "task": "<bounded subtask ≤ 80 chars>",
  "role": "<agent role>",
  "relevant_files": ["<files the child needs>"],
  "memory_slice": {
    "declarative_facts": ["<only facts relevant to subtask, ≤ 5 items>"],
    "structural_map": "<compressed call graph for relevant modules only>",
    "negative_lessons": ["<known pitfalls for this subtask type>"],
    "procedural_skill": "<name of applicable skill if any>"
  },
  "constraints": ["<specific constraints>"],
  "budget": { "tokens": 20000, "wall_minutes": 15 }
}
```

**Do not pass:**
- Full conversation history
- Unrelated module documentation
- Episodic summaries from different task types
- Raw test output (use parsed summaries)

---

## Context Budget Triggers

Prune context proactively when any of these thresholds are hit:

- Total context > 50K tokens → apply full slice_memory
- File list > 15 files → keep only files with relevance_score ≥ 0.5
- Episodic items > 10 → keep only 3 most relevant by file_overlap + recency
- Memory store > 500 items → run memory_curator to deduplicate and compress
- Child agent spawn → always create fresh minimal slice; never pass parent's full context

