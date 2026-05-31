/**
 * skill-memory-curator.ts
 *
 * Converts validated run outcomes into governed reusable skill memory.
 * Research basis: search-as-memory, LLM-Wiki retrieval-as-reasoning, EvoMap.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

type SkillStatus = "candidate" | "promoted" | "retired";

interface AttemptSummary {
  attempt_id: string;
  hypothesis?: string;
  files_changed?: string[];
  tests_passed?: string[];
  tests_failed?: string[];
  progress_made?: string[];
  failure_modes?: string[];
  reusable_insights?: string[];
  verdict?: string;
  saved_at?: string;
}

interface SkillMemory {
  id: string;
  title: string;
  trigger_terms: string[];
  instruction: string;
  evidence_refs: string[];
  counterexample_refs: string[];
  confidence: number;
  status: SkillStatus;
  created_at: string;
  updated_at: string;
}

const MIN_PROMOTION_SUPPORT = 2;

function sha(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe<T>(fp: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const fp = path.join(root, item.name);
    if (item.isDirectory()) out.push(...listJsonFiles(fp));
    else if (item.name.endsWith(".json")) out.push(fp);
  }
  return out;
}

function normalizeInsight(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
}

function triggerTerms(text: string): string[] {
  return Array.from(
    new Set(
      normalizeInsight(text)
        .split(" ")
        .filter((w) => w.length >= 5)
        .slice(0, 12),
    ),
  );
}

function skillPath(piDir: string, id: string): string {
  return path.join(piDir, "evals", "skills", "generated", `${id}.json`);
}

function indexPath(piDir: string): string {
  return path.join(piDir, "evals", "skills", "generated", "index.json");
}

function loadExisting(piDir: string): Map<string, SkillMemory> {
  const dir = path.join(piDir, "evals", "skills", "generated");
  const map = new Map<string, SkillMemory>();
  for (const fp of listJsonFiles(dir)) {
    if (fp.endsWith(`${path.sep}index.json`)) continue;
    const item = readJsonSafe<SkillMemory>(fp);
    if (item?.id) map.set(item.id, item);
  }
  return map;
}

function deriveCandidates(piDir: string): SkillMemory[] {
  const runsDir = path.join(piDir, "runs");
  const candidates = new Map<string, SkillMemory>();

  for (const fp of listJsonFiles(runsDir)) {
    if (!fp.endsWith("-summary.json")) continue;
    const summary = readJsonSafe<AttemptSummary>(fp);
    if (!summary) continue;

    const ref = path.relative(piDir, fp);
    const positive = summary.verdict === "candidate" || (summary.tests_passed?.length ?? 0) > 0;
    const negative = summary.verdict === "reject" || (summary.tests_failed?.length ?? 0) > 0;

    for (const raw of summary.reusable_insights ?? []) {
      const instruction = raw.trim();
      if (instruction.length < 24) continue;
      const id = sha(normalizeInsight(instruction));
      const existing = candidates.get(id) ?? {
        id,
        title: instruction.slice(0, 80),
        trigger_terms: triggerTerms(`${instruction} ${summary.hypothesis ?? ""} ${(summary.files_changed ?? []).join(" ")}`),
        instruction,
        evidence_refs: [],
        counterexample_refs: [],
        confidence: 0,
        status: "candidate" as SkillStatus,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (positive && !existing.evidence_refs.includes(ref)) existing.evidence_refs.push(ref);
      if (negative && !existing.counterexample_refs.includes(ref)) existing.counterexample_refs.push(ref);
      candidates.set(id, existing);
    }
  }

  return Array.from(candidates.values());
}

function score(skill: SkillMemory): number {
  const support = skill.evidence_refs.length;
  const contradiction = skill.counterexample_refs.length;
  return Math.max(0, Math.min(1, support / (support + contradiction + 1)));
}

function writeIndex(piDir: string, skills: SkillMemory[]): void {
  const promoted = skills
    .filter((s) => s.status === "promoted")
    .map((s) => ({ id: s.id, title: s.title, trigger_terms: s.trigger_terms, confidence: s.confidence }));
  fs.writeFileSync(indexPath(piDir), JSON.stringify({ generated_at: new Date().toISOString(), skills: promoted }, null, 2));
}

export default function (pi: ExtensionAPI) {
  function curate(ctx: { cwd: string }): { total: number; promoted: number; output: string } {
    const piDir = path.join(ctx.cwd, ".pi");
    const outDir = path.join(piDir, "evals", "skills", "generated");
    ensureDir(outDir);

    const existing = loadExisting(piDir);
    for (const candidate of deriveCandidates(piDir)) {
      const prior = existing.get(candidate.id);
      const merged: SkillMemory = prior
        ? {
            ...prior,
            trigger_terms: Array.from(new Set([...prior.trigger_terms, ...candidate.trigger_terms])).slice(0, 16),
            evidence_refs: Array.from(new Set([...prior.evidence_refs, ...candidate.evidence_refs])),
            counterexample_refs: Array.from(new Set([...prior.counterexample_refs, ...candidate.counterexample_refs])),
            updated_at: new Date().toISOString(),
          }
        : candidate;
      merged.confidence = score(merged);
      if (merged.evidence_refs.length >= MIN_PROMOTION_SUPPORT && merged.confidence >= 0.6) merged.status = "promoted";
      if (merged.counterexample_refs.length > merged.evidence_refs.length) merged.status = "retired";
      existing.set(merged.id, merged);
      fs.writeFileSync(skillPath(piDir, merged.id), JSON.stringify(merged, null, 2));
    }

    writeIndex(piDir, Array.from(existing.values()));
    const skills = Array.from(existing.values());
    return {
      total: skills.length,
      promoted: skills.filter((s) => s.status === "promoted").length,
      output: path.relative(ctx.cwd, outDir).replace(/\\/g, "/"),
    };
  }

  pi.on("agent_end", async (_event, ctx) => {
    curate(ctx);
  });

  pi.registerCommand("skill-memory", {
    description: "Refresh generated skill memory from validated attempt summaries.",
    handler: async (_args, ctx) => {
      const result = curate(ctx);
      ctx.ui.notify(
        `Skill memory refreshed\n- total generated: ${result.total}\n- promoted: ${result.promoted}\n- output: ${result.output}`,
        "info",
      );
    },
  });
}
