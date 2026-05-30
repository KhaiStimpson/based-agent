#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findCommandNames, GENERATED_PROTECTED_PATHS, packageCounts, PROTECTED_PATHS, readJson, validateStructure } from "./lib/structure.mjs";

const root = process.cwd();
const errors = [];
const warnings = [];
const structure = validateStructure(root);
errors.push(...structure.errors);
warnings.push(...structure.warnings);

const settings = readJson(root, ".pi/settings.json");
if (!settings.ok) errors.push(`Could not parse .pi/settings.json: ${settings.error}`);
else {
  for (const key of ["extensions", "skills", "prompts"]) {
    const values = Array.isArray(settings.value?.[key]) ? settings.value[key] : [];
    if (values.length === 0) errors.push(`settings.json has no ${key} directories configured`);
    for (const rel of values) if (!fs.existsSync(path.join(root, rel))) errors.push(`Configured ${key} directory missing: ${rel}`);
  }
}

const byName = new Map();
for (const cmd of findCommandNames(root)) {
  const list = byName.get(cmd.name) ?? [];
  list.push(cmd.file);
  byName.set(cmd.name, list);
}
for (const [name, files] of byName) if (files.length > 1) errors.push(`Duplicate command /${name}: ${files.join(", ")}`);
for (const rel of PROTECTED_PATHS) {
  if (!GENERATED_PROTECTED_PATHS.includes(rel) && !fs.existsSync(path.join(root, rel))) warnings.push(`Protected path missing (governance may be inactive): ${rel}`);
}

const safetyGate = fs.existsSync(path.join(root, ".pi/extensions/safety-gate.ts"))
  ? fs.readFileSync(path.join(root, ".pi/extensions/safety-gate.ts"), "utf8")
  : "";
for (const rel of PROTECTED_PATHS) {
  const marker = rel === "AGENTS.md" ? "AGENTS" : rel.split("/").at(-1);
  if (!safetyGate.includes(marker)) errors.push(`Safety gate missing protected path marker: ${rel}`);
}

console.log("based-agent doctor");
const counts = packageCounts(root);
console.log(`Artifacts: ${counts.extensions} extensions, ${counts.agents} agents, ${counts.prompts} prompts, ${counts.skills} skills`);
for (const warning of warnings) console.warn(`WARN  ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) {
  console.error("Doctor failed. Remediate the ERROR lines above, then rerun npm run doctor.");
  process.exit(1);
}
console.log(`Doctor passed (${warnings.length} warning(s)).`);
