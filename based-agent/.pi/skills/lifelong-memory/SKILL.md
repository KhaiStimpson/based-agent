---
name: lifelong-memory
description: Store and retrieve typed memories to maintain cognitive continuity across sessions. Use when you discover something worth remembering, when a session ends, or when starting a task in an unfamiliar codebase. Invoke at session start to load context, and at session end to store discoveries and obligations. Never use raw conversation history as memory.
---

# Lifelong Memory

Cognitive continuity is the primary bottleneck for self-evolving agents. ELL/StuLife research finds that even GPT-5 scores only 17.9/100 on the StuLife benchmark — and vanilla RAG over raw trajectories reduces performance *below* no-memory baseline. Structured typed memory is the fix.

**Sources:** ELL/StuLife (2508.19005v6); SEMA (2603.23875v1); LIFE survey (2605.14892v1)

---

## Memory Type Definitions

| Type | Contents | Examples | Source |
|---|---|---|---|
| **Working** | Current task state, active files, open blockers | "Currently editing `auth.py`; plan step 3 of 5" | SEMA, AgentSpawn |
| **Episodic** | Summarized past runs, failures, repairs, outcomes | "Run 2026-05-18: fixed cache TTL bug in weather/client.py" | ELL (Trajectory Memory) |
| **Declarative** | Stable project facts, commands, API constraints, user decisions | "Test command: `pytest tests/ -v`; DB uses PostgreSQL 15" | ELL (Declarative Knowledge) |
| **Structural** | File/module/tool/agent relationships and call graphs | "auth.py imports from models.py line 14; WeatherClient._fetch at line 47" | ELL (Structural Knowledge) |
| **Procedural** | Validated skills, playbooks, topology templates | "For cache tasks: use LRUCache wrapper pattern (validated 3x)" | ELL (Procedural Knowledge) |
| **Prospective** | Future obligations: pending tests, follow-ups, deferred cleanup | "TODO: add rate-limit tests for /api/auth — blocked by missing mock" | ELL (Proactive Initiative Score) |
| **Negative** | Known failed approaches, unsafe patterns, traps to avoid | "Do NOT use `os.system()` for subprocesses — use subprocess.run()" | pi-specific extension |

**Note:** ELL formally defines six knowledge types. Prospective derives from ELL's Proactive Initiative Score (PIS) metric. Negative is a pi-specific extension not in the ELL paper.

---

## Full YAML Metadata Schema

Every memory item must have this metadata:

```yaml
id: "<type-prefix>-<date>-<hash>"   # e.g., "decl-20260519-a4f2"
type: working | episodic | declarative | structural | procedural | prospective | negative
scope: repo | project | user | global
  # repo: specific to this repository (by remote URL or path)
  # project: specific to this codebase / tech stack
  # user: specific to this user's preferences
  # global: applies broadly across all tasks
status: provisional | validated | deprecated | contradicted
  # provisional: newly stored, not yet confirmed by use
  # validated: confirmed useful in at least one run
  # deprecated: superseded or outdated
  # contradicted: conflicted with newer evidence
source: file | command | user | episode | external
  # file: derived from reading a specific file
  # command: derived from running a command
  # user: stated by the user directly
  # episode: derived from a past run summary
  # external: from documentation, API specs, etc.
salience: novel | constraint | future-critical | failure-linked | preference | validation-linked
  # novel: new information not previously known
  # constraint: a rule or limit that must be obeyed
  # future-critical: important for a future action
  # failure-linked: discovered via a failure — high retention priority
  # preference: user/project style choice
  # validation-linked: needed for correct validation
content: "<the actual memory content>"
source_ref: "<file:line or command or run_id>"
created_at: "YYYY-MM-DD"
last_validated_at: "YYYY-MM-DD"
confidence: low | medium | high
tags: ["<optional keyword tags>"]
```

---

## Memory Lifecycle

### Add
Store when:
- You discover a fact about the codebase not already stored
- A command reveals something important (save the command AND its output)
- A user states a preference or constraint
- A run succeeds with a reusable pattern (make it procedural)
- A run fails and the cause is clear (make it negative + episodic)

```
memory_add({
  type: "declarative",
  scope: "repo",
  salience: "constraint",
  content: "pytest requires PYTHONPATH=. to find local modules",
  source: "command",
  source_ref: "pytest tests/ — error: ModuleNotFoundError",
  confidence: "high"
})
```

### Update
Update when:
- Source file changes (re-read and verify structural/declarative memory)
- A previously valid command no longer works
- User changes a preference
- A validated skill fails on a new task

```
memory_update({
  id: "decl-20260518-a4f2",
  content: "pytest requires PYTHONPATH=src (updated after repo restructure)",
  source_ref: "pyproject.toml — testpaths=['src']",
  confidence: "high",
  last_validated_at: "2026-05-19"
})
```

### Delete / Deprecate
**Never silently delete.** Mark as deprecated with reason:

```
memory_deprecate({
  id: "decl-20260510-b3c1",
  reason: "Superseded by updated API version; old endpoint /v1/weather removed",
  deprecated_by: "decl-20260519-f7a2"
})
```

### Combine
When 3+ episodic items share the same pattern:
```
memory_combine({
  source_ids: ["ep-20260510-001", "ep-20260515-003", "ep-20260518-007"],
  combined_type: "procedural",
  combined_content: "Pattern: all cache failures due to missing TTL default — always set default=300",
  confidence: "high"
})
```

### Validate
Periodically verify memories are still accurate:
```
memory_query({
  type: "declarative",
  scope: "repo",
  status: "validated",
  older_than_days: 30
})
# For each: re-run source command or re-read source file; update or deprecate
```

---

## Anti-Naive-RAG Rule

**ELL finding:** Vanilla RAG over raw trajectories reduced StuGPA to 10.98 — *below* the no-memory baseline of 14.13. MemGPT-style structured memory achieved 19.99.

```
❌ NEVER: retrieve raw conversation history as context
❌ NEVER: embed full run transcripts as searchable memory
❌ NEVER: use keyword search over unstructured text as primary retrieval
✅ ALWAYS: store distilled, typed, metadata-rich memory items
✅ ALWAYS: retrieve by type + scope + relevance, not by embedding similarity alone
✅ ALWAYS: validate retrieved memory before acting on it
```

---

## Using Memory Tools

```
# Add a new memory item
memory_add({ type, scope, salience, content, source, source_ref, confidence })

# Query memory
memory_query({
  type: ["declarative", "structural"],     // optional filter
  scope: "repo",                            // optional
  status: ["validated", "provisional"],     // optional
  keywords: ["cache", "TTL"],               // optional keyword filter
  relevant_files: ["weather/client.py"],    // optional file relevance filter
  limit: 10
})

# Update existing item
memory_update({ id, content?, status?, confidence?, last_validated_at? })

# Deprecate item
memory_deprecate({ id, reason, deprecated_by? })

# Combine multiple items into one
memory_combine({ source_ids, combined_type, combined_content, confidence })
```

---

## Salience Tags — When to Use Each

| Tag | Use when | Example |
|---|---|---|
| `novel` | First time this fact is discovered | "Found that auth uses JWT, not sessions" |
| `constraint` | A rule that must always be obeyed | "Never commit secrets to .env" |
| `future-critical` | Needed for a planned future action | "Rate limit tests blocked until mock is built" |
| `failure-linked` | Discovered via failure analysis | "NameError: forgot to import from models.py" |
| `preference` | User or project stylistic choice | "User prefers dataclasses over TypedDict" |
| `validation-linked` | Required for correct test/lint/typecheck | "mypy requires --strict flag for this module" |

---

## Run-End Reflection Checklist

Before ending any non-trivial session, answer each question and store the result:

```markdown
## Run-End Reflection — <date> — <task>

1. What changed? (declarative/structural memory updates needed)
   - Files modified: ...
   - APIs discovered: ...
   - Commands that now work: ...

2. What was validated? (update status: provisional → validated)
   - Skills/patterns that worked: ...
   - Commands confirmed correct: ...

3. What failed? (episodic + negative memory)
   - What went wrong: ...
   - Root cause: ...
   - Pattern to avoid: ...

4. What should be remembered? (new declarative/structural items)
   - ...

5. Which skill should be created or updated? (procedural memory)
   - ...

6. What future obligations remain? (prospective memory)
   - Pending validation: ...
   - Deferred cleanup: ...
   - Follow-ups promised: ...

7. Are any existing memories now stale? (deprecation candidates)
   - ...
```

Store the reflection itself as an episodic memory item with `salience: novel` and link it to the attempt summary `attempt_id`.
