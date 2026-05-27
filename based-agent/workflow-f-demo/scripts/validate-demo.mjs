import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(demoRoot, "output");
const required = [
  "run/context.md",
  "run/plan.md",
  "run/attempt-01-summary.json",
  "run/attempt-02-summary.json",
  "run/failure-attribution.json",
  "run/learning-candidates.json",
  "memory/episode.json",
  "memory/negative-lesson.json",
  "memory/heuristic.json",
  "memory/reminder.json",
  "curriculum/provenance-before-promotion.json",
  "holdout-evaluation.md",
  "validation.md"
];

for (const relative of required) {
  if (!fs.existsSync(path.join(output, relative))) throw new Error(`Missing generated artifact: ${relative}`);
}

for (const relative of required.filter((file) => file.endsWith(".json"))) {
  JSON.parse(fs.readFileSync(path.join(output, relative), "utf8"));
}

execFileSync(process.execPath, ["scripts/validate-memory.mjs", "templates/fixtures/invalid-memory.json", "--expect-fail"], {
  cwd: demoRoot,
  stdio: "pipe"
});
execFileSync(process.execPath, ["scripts/validate-memory.mjs", "templates/fixtures/corrected-memory.json"], {
  cwd: demoRoot,
  stdio: "pipe"
});

const learning = JSON.parse(fs.readFileSync(path.join(output, "run", "learning-candidates.json"), "utf8"));
if (!fs.existsSync(path.join(demoRoot, learning.curriculum_candidate))) {
  throw new Error(`Broken curriculum reference: ${learning.curriculum_candidate}`);
}

const reminder = JSON.parse(fs.readFileSync(path.join(output, "memory", "reminder.json"), "utf8"));
for (const relative of reminder.metadata.required_files) {
  if (!fs.existsSync(path.join(demoRoot, relative))) throw new Error(`Broken reminder reference: ${relative}`);
}

console.log(`Validated ${required.length} generated artifacts and both memory oracle paths.`);
