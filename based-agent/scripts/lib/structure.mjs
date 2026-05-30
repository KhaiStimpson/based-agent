import fs from "node:fs";
import path from "node:path";

export const REQUIRED_FILES = ["AGENTS.md", "package.json", ".pi/settings.json"];
export const REQUIRED_GLOBS = [
  { label: ".pi/extensions/*.ts", dir: ".pi/extensions", suffix: ".ts" },
  { label: ".pi/agents/*.md", dir: ".pi/agents", suffix: ".md" },
  { label: ".pi/prompts/workflow-*.md", dir: ".pi/prompts", prefix: "workflow-", suffix: ".md" },
  { label: ".pi/skills/*/SKILL.md", dir: ".pi/skills", nestedFile: "SKILL.md" },
  { label: ".pi/skills/*/REFERENCE.md", dir: ".pi/skills", nestedFile: "REFERENCE.md" },
];
export const PROTECTED_PATHS = ["AGENTS.md", ".pi/evals/judge-corpus", ".pi/memory", ".pi/skills", ".pi/evolution-approvals", ".pi/evolution-proposals"];
export const GENERATED_PROTECTED_PATHS = [".pi/evolution-approvals", ".pi/evolution-proposals"];

export function exists(root, rel) { return fs.existsSync(path.join(root, rel)); }
export function readJson(root, rel) {
  const fp = path.join(root, rel);
  try { return { ok: true, value: JSON.parse(fs.readFileSync(fp, "utf8")) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
export function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(fp, predicate));
    else if (predicate(fp)) out.push(fp);
  }
  return out;
}
export function countFiles(root, rel, predicate = () => true) {
  return listFiles(path.join(root, rel), predicate).length;
}
export function listJsonFiles(root) { return listFiles(root, (fp) => fp.endsWith(".json")); }
export function relative(root, fp) { return path.relative(root, fp).replace(/\\/g, "/"); }

export function findCommandNames(root) {
  const extDir = path.join(root, ".pi", "extensions");
  const files = listFiles(extDir, (fp) => fp.endsWith(".ts"));
  const commands = [];
  const re = /registerCommand\(\s*["'`]([^"'`]+)["'`]/g;
  for (const fp of files) {
    const text = fs.readFileSync(fp, "utf8");
    let match;
    while ((match = re.exec(text))) commands.push({ name: match[1], file: relative(root, fp) });
  }
  return commands;
}

function globMatches(root, spec) {
  const dir = path.join(root, spec.dir);
  if (!fs.existsSync(dir)) return [];
  if (spec.nestedFile) {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, spec.nestedFile)))
      .map((e) => path.join(dir, e.name, spec.nestedFile));
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => (!spec.prefix || name.startsWith(spec.prefix)) && (!spec.suffix || name.endsWith(spec.suffix)))
    .map((name) => path.join(dir, name));
}

export function validateStructure(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  for (const rel of REQUIRED_FILES) if (!exists(root, rel)) errors.push(`Missing required file: ${rel}`);
  for (const spec of REQUIRED_GLOBS) {
    const matches = globMatches(root, spec);
    if (matches.length === 0) errors.push(`Missing required artifact(s): ${spec.label}`);
  }
  for (const fp of listJsonFiles(root)) {
    try { JSON.parse(fs.readFileSync(fp, "utf8")); }
    catch (error) { errors.push(`Invalid JSON: ${relative(root, fp)} (${error instanceof Error ? error.message : String(error)})`); }
  }
  const skillsDir = path.join(root, ".pi", "skills");
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const file of ["SKILL.md", "REFERENCE.md"]) {
        if (!fs.existsSync(path.join(skillsDir, entry.name, file))) warnings.push(`Skill ${entry.name} missing ${file}`);
      }
    }
  }
  return { errors, warnings };
}

export function packageCounts(root = process.cwd()) {
  return {
    extensions: countFiles(root, ".pi/extensions", (fp) => fp.endsWith(".ts")),
    agents: countFiles(root, ".pi/agents", (fp) => fp.endsWith(".md")),
    prompts: countFiles(root, ".pi/prompts", (fp) => fp.endsWith(".md")),
    skills: fs.existsSync(path.join(root, ".pi/skills")) ? fs.readdirSync(path.join(root, ".pi/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0,
    memory_items: countFiles(root, ".pi/memory", (fp) => fp.endsWith(".json") || fp.endsWith(".md")),
    judge_corpus_entries: countFiles(root, ".pi/evals/judge-corpus", (fp) => fp.endsWith(".json") || fp.endsWith(".jsonl")),
    runs: countFiles(root, ".pi/runs", (fp) => fp.endsWith(".json")),
    traces: countFiles(root, ".pi/mas-traces", (fp) => fp.endsWith(".jsonl")),
    evolution_proposals: countFiles(root, ".pi/evolution-proposals", (fp) => fp.endsWith(".json")),
  };
}
