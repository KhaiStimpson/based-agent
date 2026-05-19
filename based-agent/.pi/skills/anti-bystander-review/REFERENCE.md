# Anti-Bystander Review Reference

This file preserves the detailed guidance split out of `SKILL.md` so the skill entrypoint stays short and trigger-focused.

# Anti-Bystander Review

Multi-agent review degrades when agents see each other's work before forming independent conclusions. Research across 22,500 trajectories (GAIA, SWE-bench, MultiChallenge) shows cognitive loafing, sovereignty collapse, and lead-anchor effects. GPT-class models collapse in accuracy with as few as n=2 auditors.

**Source:** The Bystander Effect in Multi-Agent Reasoning (2605.10698v1)

---

## The Protocol (6 Steps)

### Step 1: Private First Pass

Each reviewer runs in complete isolation:

```
Reviewer spawn instructions:
  "Independently inspect the code and tests. Derive findings only from
   repository evidence and command output. Do not assume another agent
   checked anything. Do not rely on any prior review you have seen."

Tools: read, bash (read-only)
No shared state: no access to peer reviewer output
No pre-briefing: do not tell reviewer what other agents found
Budget: 12,000 tokens max per reviewer
```

**Forbidden during first pass:**
- Showing reviewer A's output to reviewer B before B's first pass
- Briefing reviewer with "the builder says X is correct"
- Asking reviewer to "verify" something (implies it's already correct)

### Step 2: Structured Findings

Each reviewer outputs structured findings only:

```json
{
  "reviewer_id": "<opaque — do not include model name>",
  "findings": [
    {
      "severity": "critical | high | medium | low",
      "file": "path/to/file.py",
      "line": 42,
      "category": "correctness | security | regression | api-contract | style",
      "command_evidence": "<exact command that exposes the issue>",
      "reproduction_steps": "<minimal steps to see the problem>",
      "finding": "<what is wrong, ≤ 80 chars>",
      "suggested_fix": "<concrete fix, or 'investigate further'>",
      "confidence": "high | medium | low"
    }
  ],
  "tests_run": ["<command> — <exit_code> — <summary>"],
  "files_inspected": ["<path>"],
  "overall_assessment": "block | concerns | approve",
  "rationale": "<evidence-based, ≤ 100 chars>"
}
```

**A finding is only valid if it includes `command_evidence` or a specific file/line reference. Opinion without evidence is discarded.**

### Step 3: Shuffle and Anonymize

Before synthesis:
1. Remove `reviewer_id` from all findings
2. Remove any model name references
3. Randomize the order of finding sets
4. Do NOT include which reviewer made which finding in the synthesis prompt

The synthesis agent sees a merged list of anonymous findings, not "Reviewer A said X, Reviewer B said Y."

### Step 4: Evidence Ranking

Rank findings by evidence quality, not by reviewer confidence or vote count:

| Rank | Evidence type |
|---|---|
| 1 (strongest) | Test failure with exact command and exit code |
| 2 | File/line reference with reproduction steps |
| 3 | File/line reference without reproduction steps |
| 4 | Category-level concern with file reference |
| 5 (weakest) | Style opinion without file reference |

**Correctness > security > regression > api-contract > style**

### Step 5: Minority Preservation

- One `critical` or `high` severity finding with command evidence is sufficient to block, regardless of how many other reviewers approved
- Do not override a high-evidence minority finding because the majority approved
- Minority findings must be resolved by targeted investigation, not by vote

```
Rule: A single reproducible blocker blocks.
Rule: Disagreement triggers validation, not majority-wins resolution.
```

### Step 6: Builder Handoff

Pass to builder:
- Adjudicated findings (severity + file + line + suggested_fix)
- Acceptance criteria (must re-validate these specifically)
- Do NOT pass which reviewer found what
- Do NOT pass overall reviewer sentiment

---

## Reviewer Count Policy

| Scenario | Max reviewers | Rationale |
|---|---|---|
| Routine code change | 2 (reviewer + tester) | More than 2 adds bystander risk without accuracy gain |
| Critical path (security, data migration) | 2 (cross-model preferred) | GPT-class collapse observed at n=2; cap prevents worse degradation |
| Research synthesis | 2 independent researchers | Same principle |
| Audit / postmortem | 1 attributor (authoritative) | Attribution requires single authoritative chain of reasoning |

**Do not add a third reviewer to resolve disagreement between two.** Instead, run targeted validation (tests, commands) to resolve empirically.

---

## Forbidden Prompts

Never use these in any prompt that goes to a reviewer:

```
❌ "Multiple agents agree this is correct. Verify quickly."
❌ "The other reviewer approved this. Do you concur?"
❌ "This has been reviewed. Just confirm."
❌ "Three experts say X. Do you agree?"
❌ "Consensus is that this is fine."
❌ "Your peer reviewer found no issues."
❌ "Quickly verify that [specific thing] is correct."
```

These prompts trigger cognitive loafing and anchor the reviewer to a conclusion before independent inspection.

---

## Preferred Prompts

```
✅ "Independently inspect the code and tests. Derive findings only from 
    repository evidence and command output. Do not assume another agent 
    checked anything."

✅ "Read the files, run the tests, and report what you find. Do not rely 
    on any prior review conclusions."

✅ "Your role is to find problems. Assume nothing has been verified. 
    Cite specific file/line/command evidence for every finding."

✅ "This is a fresh inspection. No prior reviewer output is available 
    to you. Inspect from first principles."
```

---

## Using aggregate_reviews Tool

```
aggregate_reviews({
  findings: [<array of anonymous finding objects>],
  aggregation_method: "evidence_rank",  // NOT "majority_vote"
  preserve_minority: true,
  minimum_evidence_for_block: "command_evidence OR file_line_ref",
  output: "adjudicated_findings"
})
```

The tool returns:
```json
{
  "adjudicated_findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "...",
      "line": 0,
      "finding": "...",
      "suggested_fix": "...",
      "evidence_strength": 1,
      "source_count": 1,
      "status": "block|investigate|advisory"
    }
  ],
  "verdict": "block|approve_with_concerns|approve",
  "minority_preserved": ["<any minority high-severity findings>"]
}
```

---

## Cross-Model Reviewer Pairing

When reviewing high-stakes changes:
- Use one Claude-family reviewer and one GPT/Gemini-family reviewer
- This prevents both reviewers from sharing the same training-induced blind spots
- Particularly important for security reviews and self-evolution audits
- Do not disclose model identity to the synthesis agent

---

## Common Anti-Patterns to Catch

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Review theater | Reviewer approves everything; findings always "low" | Check that reviewer ran commands; increase budget |
| Anchored review | Reviewer repeats builder's explanation | Reviewer saw builder output before first pass — re-run isolated |
| Consensus collapse | Two reviewers agree on wrong answer | Was output shuffled/anonymized? Were they run independently? |
| Evidence-free finding | "This looks wrong" with no file/line | Discard; request specific evidence |
| Style masquerading as correctness | "This function is too long" as high severity | Downrank to style; do not block on style |

