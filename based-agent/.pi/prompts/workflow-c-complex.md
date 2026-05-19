---
name: workflow-c-complex
description: Complex feature workflow for multi-file, feature-level changes with external API or domain knowledge requirements. Sequences parallel scout/researcher → planner → isolated builder worktree → tester/debugger → reviewer/tester → final validation. Includes worktree isolation, feature-spec skill, and full topology YAML.
---

# Workflow C — Complex Feature

Use this workflow for significant feature implementations, multi-module changes, and tasks requiring external domain knowledge or API research. Builder works in an **isolated worktree** to prevent partial-patch contamination. Independent review is non-negotiable for feature-level work.

**Research basis:** FeatureBench (executable validation for feature-level work), AgentConductor (difficulty-aware topology), AgentSpawn (worktree isolation + coherence), Anti-Bystander protocol, SEMA (context pruning for large codebases).

---

## When to Use Workflow C

✅ Use when:
- Task touches **6+ files** or spans multiple modules/packages
- Feature-level change: new API surface, new data model, significant behavioral addition
- External API integration, third-party library adoption, or domain-specific knowledge required
- Difficulty score **6–8**
- High regression risk (changed code is critical path or widely imported)
- Concurrent parallel hypotheses are genuinely useful (e.g., two implementation strategies)

❌ Escalate to Workflow D when:
- **2+ previous attempts have failed** on this task

❌ Use Workflow B instead when:
- Difficulty score is 3–5 and no external research is required

---

## Topology

```yaml
version: 1
workflow: C-complex
budget:
  max_nodes: 7
  max_parallel: 2
  max_rounds: 2
  max_wall_minutes: 60
layers:
  - id: context
    parallel: true                       # Scout and researcher run simultaneously
    agents:
      - id: scout
        role: scout
        output: context.md
        write: false
      - id: researcher
        role: researcher
        output: external-evidence.md
        write: false
  - id: spec
    agents:
      - id: spec-synthesizer
        role: planner
        inputs: [scout, researcher]
        skill: feature-spec              # feature-spec skill mandatory for Workflow C
        output: feature-spec.md
        write: false
  - id: plan
    agents:
      - id: planner
        role: planner
        inputs: [spec-synthesizer, scout]
        output: plan.md
        write: false
  - id: build
    agents:
      - id: builder
        role: builder
        inputs: [planner, scout]
        write: true
        worktree: isolated              # CRITICAL: builder works in isolated worktree
  - id: verify
    parallel: true
    independent: true
    agents:
      - id: tester
        role: tester
        inputs: [builder]
        write: false
      - id: debugger
        role: debugger
        inputs: [builder, tester]
        write: false
  - id: review
    parallel: true
    independent: true
    agents:
      - id: reviewer
        role: reviewer
        inputs: [builder]
        write: false
      - id: final-tester
        role: tester
        inputs: [builder]
        write: false
  - id: validate
    agents:
      - id: validation-gate
        inputs: [reviewer, final-tester, tester, debugger]
        type: gate                       # merge only after gate passes
```

**Validator rules:** acyclic, single writer in isolated worktree, independent parallel review layers, final gate before main-workspace merge.

---

## Step 1 — Parallel Context Gathering

Launch **scout** and **researcher** simultaneously. Both are read-only.

### Scout (repository context):
```
Spawn scout agent:
  Task: "<full feature description>"
  Output: .pi/runs/<run-id>/context.md
  Constraints: read-only; no writes
  Focus areas:
    - All files the feature will touch (minimum 2-hop import trace)
    - Public interfaces of affected modules (read the actual definitions)
    - Existing test coverage of affected paths
    - Architecture notes: module boundaries, data flow
    - Blast radius: files imported by 5+ modules
    - AGENTS.md rules relevant to this feature area
  Budget: 20,000 tokens max
```

### Researcher (external evidence):
```
Spawn researcher agent:
  Task: "<what external knowledge is needed: library docs, API specs, domain patterns>"
  Output: .pi/runs/<run-id>/external-evidence.md
  Constraints: read-only; cite primary sources only
  Focus areas:
    - Official API documentation for third-party integrations
    - Library interface contracts and version compatibility
    - Known failure patterns for this class of feature
    - Security considerations specific to the domain
  Budget: 15,000 tokens max
```

Both agents run concurrently. Wait for both before proceeding.

---

## Step 2 — Feature Specification (feature-spec skill)

Before planning, invoke the **`feature-spec` skill** to convert the feature request into a precise executable contract.

```
Invoke skill: feature-spec
Inputs:
  - task description (from user)
  - scout's context.md (for verified interface definitions)
  - researcher's external-evidence.md (for API contracts)

Required outputs:
  - Precise behavior definition: exact inputs, outputs, exceptions
  - Interface definition YAML: all types verified by reading source files
  - F2P test templates (Fail-to-Pass): tests that MUST PASS after implementation
  - P2P test templates (Pass-to-Pass): tests that MUST NOT break
  - Acceptance criteria checklist
  - "Done means" definition (exact commands, exit 0)

Output: .pi/runs/<run-id>/feature-spec.md
```

**This step is non-optional for Workflow C.** FeatureBench research shows feature-level agents fail primarily from:
- NameError: missing cross-file dependency (prevented by reading interfaces)
- TypeError/AttributeError: guessed interface instead of reading definition
- AssertionError: implementation complete but semantically wrong (prevented by F2P tests)

The feature spec prevents all three by forcing interface verification and test definition before any code is written.

---

## Step 3 — Plan Phase

Launch the **planner agent** with all context artifacts.

```
Spawn planner agent:
  Inputs: feature-spec.md, context.md, external-evidence.md, AGENTS.md
  Output: .pi/runs/<run-id>/plan.md
  Constraints: no source file writes
  Budget: 15,000 tokens max
```

**Plan must include:**
- Layered implementation steps (each step independently testable)
- Per-step acceptance criterion referencing the feature spec
- Full F2P test list (reference feature-spec.md)
- Full P2P test list with baseline commands
- Worktree setup instructions for builder
- Validation ladder with exact commands
- Dependency tree (which step must complete before another begins)
- Risk matrix: what could go wrong at each step and mitigation
- "Done means" from feature spec, plus any additional integration checks

**Topology check from plan:** if plan requires 6+ implementation steps across 3+ modules, confirm the Workflow C topology is appropriate. Do not try to force a complex feature into a simpler topology.

---

## Step 4 — Worktree Isolation Setup

Before the builder writes any code, initialize an isolated worktree.

```
Use: worktree-manager extension

worktree_create({
  branch: "feature/<run-id>",
  base: "main",             # or appropriate base branch
  path: ".pi/worktrees/<run-id>/"
})
```

**Why worktree isolation:**
- Prevents partial patches from contaminating the main workspace
- Enables rollback if review fails without reverting committed work
- Supports parallel hypothesis testing if needed (separate worktrees per hypothesis)
- Merge only occurs after all review gates pass

**Builder works exclusively in the worktree path.** Main workspace is read-only during the build phase.

---

## Step 5 — Build Phase

Launch the **builder agent** in the isolated worktree.

```
Spawn builder agent:
  Inputs: plan.md, feature-spec.md, context.md
  Working directory: .pi/worktrees/<run-id>/
  Output: changed files + .pi/runs/<run-id>/attempt-summary.json
  Permissions: read+write (worktree only; main workspace read-only)
  Budget: 40,000 tokens max
```

**Builder pre-flight (in worktree):**
```bash
# Confirm worktree is clean and test suite passes before changes
cd .pi/worktrees/<run-id>/
<project_test_command>     # must exit 0 — if not, report environment failure
```

**Builder implementation rules:**
1. Follow feature-spec.md interface definitions exactly — no guessing types
2. Implement in the order specified by plan.md
3. Run targeted tests after each plan step, not just at the end
4. Write F2P tests before implementing (test-first for clarity, not dogma)
5. Produce attempt summary with all commands and exit codes recorded

---

## Step 6 — Tester and Debugger Pass

Run **tester** and **debugger** in the worktree before the full review.

```
Spawn tester agent:
  Input: plan.md, feature-spec.md, worktree state
  Output: .pi/runs/<run-id>/test-results.md
  Budget: 12,000 tokens max

  Tests to run (in order):
  1. F2P tests from feature-spec.md → all must pass
  2. P2P tests from feature-spec.md → all must still pass
  3. Full validation ladder from plan.md
  4. Record every command + exit code + relevant output

Spawn debugger agent (if tester reports failures):
  Input: test-results.md, attempt-summary.json, relevant source files
  Output: .pi/runs/<run-id>/debug-findings.md
  Constraints: read-only; may suggest fixes but not apply them
  Budget: 15,000 tokens max
```

If debugger identifies fixable failures, return to builder for targeted repairs. **Maximum 2 tester→debugger→builder cycles** before escalating to Workflow D.

---

## Step 7 — Independent Review Phase (Anti-Bystander Protocol)

After tester confirms baseline validation passes, run **reviewer** and **final tester** independently.

```
Spawn reviewer agent (Session A):
  Input: worktree diff, plan.md, feature-spec.md
  Output: .pi/runs/<run-id>/review-findings.json
  Instructions: "Independently inspect all changed files against the feature
    spec. Derive findings from repository evidence only. You have not seen
    any other agent's output."
  Budget: 15,000 tokens max

Spawn final-tester agent (Session B):
  Input: worktree state, validation ladder
  Output: .pi/runs/<run-id>/final-validation.md
  Instructions: "Run the complete validation ladder fresh. Record every command
    and exit code. Find failures — do not confirm success."
  Budget: 12,000 tokens max
```

**Anti-bystander protocol applies in full:** independent sessions, no peer visibility during first pass, shuffle and anonymize before aggregation.

**Cross-model reviewer pairing** is strongly recommended for Workflow C due to feature-level risk: use one Claude-family reviewer and one GPT/Gemini-family reviewer to eliminate shared training blind spots.

---

## Step 8 — Final Validation Gate

Use the **validation-gate extension** to make the merge/approve decision.

```
validation_gate({
  attempt_summary: ".pi/runs/<run-id>/attempt-summary.json",
  review_findings: ".pi/runs/<run-id>/review-findings.json",
  final_validation: ".pi/runs/<run-id>/final-validation.md",
  feature_spec: ".pi/runs/<run-id>/feature-spec.md",
  gate_criteria: {
    f2p_tests_pass: true,       // ALL fail-to-pass tests must pass
    p2p_tests_pass: true,       // NO pass-to-pass regressions
    validation_ladder: true,    // Full ladder exit 0
    no_critical_findings: true  // No unresolved critical/high review findings
  }
})
```

**Gate outcomes:**
- `pass` → proceed to merge
- `conditional` → advisory concerns; builder addresses, then re-gate
- `fail` → specific blockers must be fixed; re-enter build phase
- `escalate` → fundamental issue; escalate to Workflow D

---

## Step 9 — Merge and Cleanup

After gate passes:

```bash
# Merge worktree into main workspace
worktree_merge({
  source: ".pi/worktrees/<run-id>/",
  target: "main",
  method: "squash_or_merge",
  require_clean: true
})

# Clean up worktree
worktree_cleanup({ path: ".pi/worktrees/<run-id>/" })
```

**Post-merge steps:**
1. Run full project test suite one final time in main workspace
2. Record final outcome in attempt summary (update verdict to `candidate`)
3. Summarizer produces consolidated run summary
4. Memory-curator proposes typed memory additions from run insights
5. Log for curriculum consideration if any failures occurred

---

## Step 10 — Run Reflection

After completion, the summarizer agent consolidates all artifacts:

```
Spawn summarizer agent:
  Input: all .pi/runs/<run-id>/ artifacts
  Output: .pi/runs/<run-id>/final-summary.md + memory proposals

  Answer for each run:
  1. What is the most important thing this feature implementation proved?
  2. What interfaces were hardest to discover? (update declarative memory)
  3. What review findings were most valuable? (update heuristic memory)
  4. What failures occurred? (feed failure-attributor if needed)
  5. Any prospective obligations? (schema migrations, docs updates, followups)
```

---

## Artifacts Produced

| Artifact | Producer | Path |
|---|---|---|
| `context.md` | scout | `.pi/runs/<id>/` |
| `external-evidence.md` | researcher | `.pi/runs/<id>/` |
| `feature-spec.md` | planner+feature-spec | `.pi/runs/<id>/` |
| `plan.md` | planner | `.pi/runs/<id>/` |
| `attempt-summary.json` | builder | `.pi/runs/<id>/` |
| `test-results.md` | tester | `.pi/runs/<id>/` |
| `debug-findings.md` | debugger | `.pi/runs/<id>/` |
| `review-findings.json` | reviewer | `.pi/runs/<id>/` |
| `final-validation.md` | final-tester | `.pi/runs/<id>/` |
| `final-summary.md` | summarizer | `.pi/runs/<id>/` |
| `changes.patch` | worktree-manager | `.pi/runs/<id>/` |
