import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TYPES = new Set(["fact", "decision", "skill", "heuristic", "episode", "reminder", "negative_lesson"]);
const STATUSES = new Set(["provisional", "validated", "deprecated", "contradicted"]);

export function validateMemory(item) {
  const errors = [];
  for (const field of ["id", "type", "scope", "status", "source", "salience", "content", "confidence"]) {
    if (typeof item[field] !== "string" || item[field].trim() === "") {
      errors.push(`missing string field: ${field}`);
    }
  }
  if (item.type && !TYPES.has(item.type)) errors.push(`unsupported memory type: ${item.type}`);
  if (item.status && !STATUSES.has(item.status)) errors.push(`unsupported memory status: ${item.status}`);

  if (item.status === "validated") {
    const provenance = item.metadata?.provenance;
    if (!provenance?.artifact_ref || !provenance?.confirmed_by) {
      errors.push("validated memory requires metadata.provenance.artifact_ref and confirmed_by");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    status: item.status,
    promotion_eligible: item.status === "validated" && errors.length === 0
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const expectFail = args.includes("--expect-fail");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  if (!fileArg) {
    console.error("Usage: node scripts/validate-memory.mjs <memory.json> [--expect-fail]");
    process.exitCode = 2;
    return;
  }

  const absolutePath = path.resolve(process.cwd(), fileArg);
  const item = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const result = validateMemory(item);
  const expectationMet = expectFail ? !result.valid : result.valid;
  console.log(JSON.stringify({ file: fileArg, expected: expectFail ? "invalid" : "valid", ...result }, null, 2));
  process.exitCode = expectationMet ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli();
