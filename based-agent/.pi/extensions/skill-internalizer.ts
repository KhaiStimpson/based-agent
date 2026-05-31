/**
 * skill-internalizer.ts
 *
 * Distills repeated reusable insights from attempt summaries into governed
 * candidate skills. This is prompt/runtime internalization, not model training.
 *
 * Research basis: ESC-Skills — discover and self-evolve interpretable skills;
 * PEAM — convert experience into compact reusable capabilities instead of only
 * retrieving raw memories at inference time.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

type Verdict = "candidate" | "reject" | "needs_refinement";

interface AttemptSummary {
  attempt_id: string;
  hypothesis: string;
  files_changed: string[];
  tests_passed: string[];
  tests_failed: string[];
  reusable_insights: string[];
  failure_modes: string[];
  verdict: Verdict;
  saved_at: string;
}

interface SkillCandidateMeta {
  id: string;
  title: string;
  status: "candidate";
  insight_hash: string;
  evidence_count: number;
  positive_evidence_count: number;
  source_attempts: string[];
  source_files_changed: string[];
  contraindications: string[];
  promotion_criteria: string;
  rollback_trigger: string;
  created_at: string;
  updated_at: string;
}

interface InsightBucket {
  normalized: string;
  examples: string[];
  attempts: AttemptSummary[];
}

const MIN_EVIDENCE = 3;
const MIN_POSITIVE = 2;

function normalizeInsight(s: string): string {
  return s
    .toLowerCase()
    .replace(/`[^`]+`/g, "<code>")
    .replace(/\b[\w./-]+\.(ts|tsx|js|jsx|py|md|json)\b/g, "<file>")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function titleFromInsight(insight: string): string {
  const clean = insight.replace(/[\n\r]+/g, " ").trim();
  const short = clean.length > 68 ? `${clean.slice(0, 65)}...` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function runsDir(cwd: string): string {
  return path.join(cwd, ".pi", "runs");
}

function candidateDir(cwd: string): string {
  const dir = path.join(cwd, ".pi", "evals", "skills", "candidates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readRecentSummaries(cwd: string, limit = 100): AttemptSummary[] {
  const root = runsDir(cwd);
  if (!fs.existsSync(root)) return [];

  const out: AttemptSummary[] = [];
  const dateDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  for (const dateDir of dateDirs) {
    const full = path.join(root, dateDir);
    const files = fs
      .readdirSync(full)
      .filter((f) => f.endsWith("-summary.json"))
      .sort()
      .reverse();

    for (const file of files) {
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(full, file), "utf-8")) as AttemptSummary);
        if (out.length >= limit) return out;
      } catch {
        // Ignore malformed summaries.
      }
    }
  }

  return out;
}

function bucketInsights(summaries: AttemptSummary[]): Map<string, InsightBucket> {
  const buckets = new Map<string, InsightBucket>();

  for (const summary of summaries) {
    for (const insight of summary.reusable_insights || []) {
      const normalized = normalizeInsight(insight);
      if (normalized.length < 24) continue;
      const key = hash(normalized);
      const bucket = buckets.get(key) ?? { normalized, examples: [], attempts: [] };
      bucket.examples.push(insight);
      bucket.attempts.push(summary);
      buckets.set(key, bucket);
    }
  }

  return buckets;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function writeCandidate(cwd: string, key: string, bucket: InsightBucket): void {
  const dir = candidateDir(cwd);
  const mdPath = path.join(dir, `${key}.md`);
  const metaPath = path.join(dir, `${key}.json`);
  const now = new Date().toISOString();
  const existing: Partial<SkillCandidateMeta> = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
    : {};

  const attempts = bucket.attempts;
  const positive = attempts.filter((a) => a.verdict === "candidate" && (a.tests_failed || []).length === 0);
  const filesChanged = unique(attempts.flatMap((a) => a.files_changed || [])).slice(0, 25);
  const failureModes = unique(attempts.flatMap((a) => a.failure_modes || [])).slice(0, 10);
  const representative = bucket.examples.sort((a, b) => b.length - a.length)[0];

  const meta: SkillCandidateMeta = {
    id: key,
    title: titleFromInsight(representative),
    status: "candidate",
    insight_hash: key,
    evidence_count: attempts.length,
    positive_evidence_count: positive.length,
    source_attempts: unique(attempts.map((a) => a.attempt_id)).slice(0, 20),
    source_files_changed: filesChanged,
    contraindications: failureModes,
    promotion_criteria:
      "Promote only after a reviewer confirms the skill is general, non-duplicative, and has at least one passing validation trace after being applied intentionally.",
    rollback_trigger:
      "Retire or revise if two later summaries cite this skill in a failure mode, regression, or misleading-memory incident.",
    created_at: existing.created_at ?? now,
    updated_at: now,
  };

  const md = `# ${meta.title}\n\n` +
    `Status: candidate\n\n` +
    `## Skill\n\n${representative}\n\n` +
    `## When to use\n\nUse when the current task matches the repeated evidence pattern in the source attempts. Prefer concrete repo signals over generic similarity.\n\n` +
    `## Evidence\n\n- Evidence count: ${meta.evidence_count}\n- Positive evidence count: ${meta.positive_evidence_count}\n- Source attempts: ${meta.source_attempts.join(", ")}\n\n` +
    `## Contraindications\n\n${meta.contraindications.map((c) => `- ${c}`).join("\n") || "- None recorded yet."}\n\n` +
    `## Governance\n\n${meta.promotion_criteria}\n\nRollback: ${meta.rollback_trigger}\n`;

  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

export default function (pi: ExtensionAPI) {
  function internalize(cwd: string): { candidates_written: number; summaries_read: number } {
    const summaries = readRecentSummaries(cwd);
    const buckets = bucketInsights(summaries);
    let candidatesWritten = 0;

    for (const [key, bucket] of buckets) {
      const positive = bucket.attempts.filter(
        (a) => a.verdict === "candidate" && (a.tests_failed || []).length === 0,
      );
      if (bucket.attempts.length >= MIN_EVIDENCE && positive.length >= MIN_POSITIVE) {
        writeCandidate(cwd, key, bucket);
        candidatesWritten += 1;
      }
    }

    return { candidates_written: candidatesWritten, summaries_read: summaries.length };
  }

  pi.on("agent_end", async (_event, ctx) => {
    internalize(ctx.cwd);
  });

  pi.registerCommand("skill-candidates", {
    description: "Derive governed candidate skills from repeated attempt-summary insights.",
    handler: async (_args, ctx) => {
      const result = internalize(ctx.cwd);
      const dir = path.relative(ctx.cwd, candidateDir(ctx.cwd)).replace(/\\/g, "/");
      ctx.ui.notify(
        `Skill candidates refreshed\n- summaries read: ${result.summaries_read}\n- candidates written: ${result.candidates_written}\n- output: ${dir}`,
        "info",
      );
    },
  });
}
