import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateMemory } from "./validate-memory.mjs";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(demoRoot, "output");
const templates = path.join(demoRoot, "templates");
const runId = "workflow-f-demo-20260527-provenance";
const createdAt = "2026-05-27T00:00:00.000Z";

execFileSync(process.execPath, [path.join(demoRoot, "scripts", "reset-demo.mjs")], { stdio: "inherit" });
for (const relative of ["run", "memory", "curriculum", "fixtures"]) {
  fs.mkdirSync(path.join(output, relative), { recursive: true });
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(templates, relative), "utf8"));
}

function writeJson(relative, value) {
  fs.writeFileSync(path.join(output, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyTemplate(relative, target = relative) {
  fs.copyFileSync(path.join(templates, relative), path.join(output, target));
}

copyTemplate("run/context.md");
copyTemplate("run/plan.md");
copyTemplate("fixtures/invalid-memory.json");
copyTemplate("fixtures/corrected-memory.json");

const invalid = readJson("fixtures/invalid-memory.json");
const corrected = readJson("fixtures/corrected-memory.json");
const invalidResult = validateMemory(invalid);
const correctedResult = validateMemory(corrected);
if (invalidResult.valid) throw new Error("The invalid fixture unexpectedly passed validation.");
if (!correctedResult.valid) throw new Error(`The corrected fixture failed: ${correctedResult.errors.join("; ")}`);

const attempt01 = {
  attempt_id: "demo-attempt-01-unverified-promotion",
  hypothesis: "A policy-sounding memory claim may be promoted directly to validated.",
  files_inspected: ["templates/fixtures/invalid-memory.json"],
  files_changed: ["output/fixtures/invalid-memory.json"],
  commands_run: ["node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail - exit 0 - rejection observed"],
  tests_passed: ["invalid fixture rejected as expected"],
  tests_failed: ["memory proposal is not eligible for promotion"],
  progress_made: ["captured reproducible promotion failure"],
  failure_modes: ["validated memory lacked deterministic provenance"],
  remaining_risks: ["similar unsupported promotions may recur"],
  reusable_insights: ["validated status requires provenance evidence"],
  verdict: "reject",
  saved_at: createdAt
};
writeJson("run/attempt-01-summary.json", attempt01);

const attribution = {
  postmortem_id: "demo-pm-provenance-before-promotion",
  task_ref: "Promote a validation-memory rule safely",
  attempt_ids: [attempt01.attempt_id],
  failure: {
    symptom: "The validator rejected a memory item marked validated.",
    category: "memory",
    confidence: "high"
  },
  location: {
    agent: "memory-curator",
    step: "promotion gate",
    file: "output/fixtures/invalid-memory.json",
    line: null,
    tool: "validate-memory.mjs"
  },
  propagation: [
    "trigger: proposed validated status without provenance",
    "memory validator found no confirmed_by evidence",
    "promotion was rejected"
  ],
  evidence: [
    {
      type: "command_output",
      ref: "node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail",
      content: invalidResult.errors[0],
      supports: "The proposal violates provenance requirements."
    }
  ],
  repair: {
    action: "Keep the learned rule provisional and attach attribution evidence.",
    files_changed: ["output/fixtures/corrected-memory.json"],
    commands_run: ["node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json"],
    outcome: "fixed"
  },
  validation: {
    commands: ["node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json - exit 0"],
    verdict: "confirmed_fixed"
  },
  systemic_changes: [
    {
      artifact: "memory",
      description: "Retain a provenance-first heuristic as provisional until holdout evidence exists.",
      urgency: "medium"
    }
  ],
  curriculum_candidate: true,
  curriculum_oracle: "node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail"
};
writeJson("run/failure-attribution.json", attribution);

const attempt02 = {
  attempt_id: "demo-attempt-02-provisional-with-evidence",
  hypothesis: "A provisional heuristic with failure provenance preserves learning without overpromotion.",
  files_inspected: ["output/run/failure-attribution.json", "templates/fixtures/corrected-memory.json"],
  files_changed: ["output/fixtures/corrected-memory.json", "output/memory/heuristic.json"],
  commands_run: ["node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json - exit 0 - valid provisional memory"],
  tests_passed: ["corrected memory fixture accepted"],
  tests_failed: [],
  progress_made: ["repaired memory lifecycle violation", "retained provenance-linked lesson"],
  failure_modes: [],
  remaining_risks: ["heuristic is not validated until future holdout runs"],
  reusable_insights: ["provisional is the safe starting status for learned heuristics"],
  verdict: "candidate",
  saved_at: createdAt
};
writeJson("run/attempt-02-summary.json", attempt02);

writeJson("run/learning-candidates.json", {
  run_id: runId,
  source_attempt_ids: [attempt01.attempt_id, attempt02.attempt_id],
  most_important_finding: "Memory promotion must be evidence-backed; plausible text is not validation.",
  typed_memory_candidates: [
    { type: "episode", id: "mem-demo-episode", source: "output/run/failure-attribution.json" },
    { type: "negative_lesson", id: "mem-demo-unverified-promotion", source: "output/run/attempt-01-summary.json" },
    { type: "heuristic", id: corrected.id, source: "output/run/attempt-02-summary.json" },
    { type: "reminder", id: "mem-demo-holdout-reminder", source: "output/run/attempt-02-summary.json" }
  ],
  curriculum_candidate: "output/curriculum/provenance-before-promotion.json",
  skill_proposal: null,
  skill_proposal_reason: "One run is insufficient evidence for skill promotion."
});

const memoryBase = {
  scope: "repo",
  source: "episode",
  created_at: createdAt,
  last_validated_at: createdAt
};
writeJson("memory/episode.json", {
  ...memoryBase,
  id: "mem-demo-episode",
  type: "episode",
  status: "provisional",
  salience: "failure-linked",
  content: "A validated memory proposal was rejected for missing provenance; a provisional evidence-linked repair passed.",
  confidence: "high",
  metadata: { run_id: runId, attempt_ids: [attempt01.attempt_id, attempt02.attempt_id] }
});
writeJson("memory/negative-lesson.json", {
  ...memoryBase,
  id: "mem-demo-unverified-promotion",
  type: "negative_lesson",
  status: "provisional",
  salience: "failure-linked",
  content: "Do not mark learned memory as validated solely because its wording matches policy; require deterministic provenance.",
  confidence: "high",
  metadata: { artifact_ref: "output/run/failure-attribution.json" }
});
writeJson("memory/heuristic.json", corrected);
writeJson("memory/reminder.json", {
  ...memoryBase,
  id: "mem-demo-holdout-reminder",
  type: "reminder",
  status: "provisional",
  salience: "future-critical",
  content: "Evaluate the provenance-first heuristic on additional memory-promotion cases before promoting its status.",
  confidence: "medium",
  metadata: {
    trigger: "Before changing mem-demo-provenance-first from provisional to validated.",
    required_files: ["output/memory/heuristic.json", "output/curriculum/provenance-before-promotion.json"],
    required_commands: ["npm run validate"],
    success_criteria: "At least two independent holdout runs pass the deterministic oracle."
  }
});

const taskFingerprint = "memory-promotion|validated-without-provenance|command";
const noveltyHash = `sha256:${crypto.createHash("sha256").update(taskFingerprint).digest("hex")}`;
writeJson("curriculum/provenance-before-promotion.json", {
  id: "cc-demo-provenance-before-promotion",
  title: "Reject unproven validated memory",
  task: "Evaluate a typed memory proposal marked validated and reject it unless deterministic provenance is present.",
  source: "stale_memory",
  oracle: "node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail exits 0 and reports provenance rejection",
  required_tools: ["read", "bash"],
  novelty_hash: noveltyHash,
  difficulty_estimate: 0.5,
  curriculum_score: 0.9,
  status: "candidate",
  trace_ref: "output/run/failure-attribution.json",
  promotion_criteria: "After three attempts, retain only if solve rate remains in the 0.15-0.85 frontier band.",
  created_at: createdAt,
  attempt_count: 0,
  pass_count: 0
});

fs.writeFileSync(path.join(output, "holdout-evaluation.md"), `# Holdout Evaluation

**Run:** \`${runId}\`

| Candidate | Oracle | Result |
|---|---|---|
| Baseline: validated claim without provenance | \`node scripts/validate-memory.mjs templates/fixtures/invalid-memory.json --expect-fail\` | Rejected as expected |
| Repair: provisional heuristic with attribution evidence | \`node scripts/validate-memory.mjs templates/fixtures/corrected-memory.json\` | Accepted |

The repaired heuristic remains \`provisional\`. This run demonstrates the
learning path but does not satisfy multi-run promotion evidence.
`, "utf8");

fs.writeFileSync(path.join(output, "validation.md"), `# Demo Validation Evidence

**Run:** \`${runId}\`

| Check | Expected result | Observed result |
|---|---|---|
| Invalid memory fixture | Validator rejects unsupported promotion | ${invalidResult.errors[0]} |
| Corrected memory fixture | Validator accepts provisional proposal | accepted |
| Curriculum oracle | Deterministic command-based rejection test | recorded in curriculum artifact |

Run \`npm run validate\` to re-execute these checks and verify artifact links.
`, "utf8");

console.log("Workflow F demo generated: failed attempt, repair, typed memory, and curriculum case.");
