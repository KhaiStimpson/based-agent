/**
 * spawn-controller.ts
 *
 * Computes AgentSpawn spawn scores (from the AgentSpawn paper, Table 1) and
 * enforces spawn policies: max depth 3, max concurrent 4.
 *
 * Formula: Sspawn = 0.30*If + 0.20*Cc + 0.25*Fc + 0.15*Oc + 0.10*Uc
 * Threshold: spawn when Sspawn >= 0.7
 *
 * Research basis: AgentSpawn — adaptive spawning via runtime complexity signals.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Locate the package .pi directory ──────────────────────────────────────
// Walk up from process.cwd() to find the nearest AGENTS.md (package root).
// Falls back to cwd if not found. This is robust across pi launch directories
// and jiti ESM/CJS compilation modes.
function findPackagePiDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md'))) return path.join(dir, '.pi');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also check based-agent as a subdirectory (common when pi is run from parent)
  const sub = path.join(process.cwd(), 'based-agent');
  if (fs.existsSync(path.join(sub, 'AGENTS.md'))) return path.join(sub, '.pi');
  return path.join(process.cwd(), '.pi');
}
const PACKAGE_PI_DIR = findPackagePiDir();



// ─── Types ────────────────────────────────────────────────────────────────────

interface SpawnDecision {
  score: number;
  should_spawn: boolean;
  specialization: string;
  dominant_metric: string;
  inputs: { If: number; Cc: number; Fc: number; Oc: number; Uc: number };
  spawn_package_template: SpawnPackage;
  timestamp: string;
}

interface SpawnPackage {
  task: string;
  role: string;
  constraints: string[];
  memory_slice_refs: string[];
  allowed_tools: string[];
  budget: { tokens: number; wall_minutes: number };
  success_criteria: string[];
  merge_policy: string;
}

// ─── Spawn state ──────────────────────────────────────────────────────────────

const MAX_DEPTH = 3;
const MAX_CONCURRENT = 4;
const SPAWN_THRESHOLD = 0.7;

let basePiDir: string | null = null;
let currentConcurrent = 0;
let currentDepth = 0;
const recentDecisions: SpawnDecision[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeSpawnScore(If_: number, Cc: number, Fc: number, Oc: number, Uc: number): number {
  const s = 0.30 * If_ + 0.20 * Cc + 0.25 * Fc + 0.15 * Oc + 0.10 * Uc;
  return Math.round(s * 1000) / 1000;
}

function pickSpecialization(metrics: { If: number; Cc: number; Fc: number; Oc: number; Uc: number }): {
  specialization: string;
  dominant: string;
} {
  const weighted = [
    { key: "If", value: metrics.If * 0.30, spec: "refactoring-specialist" },
    { key: "Cc", value: metrics.Cc * 0.20, spec: "code-simplification" },
    { key: "Fc", value: metrics.Fc * 0.25, spec: "testing-debugger" },
    { key: "Oc", value: metrics.Oc * 0.15, spec: "context-compressor" },
    { key: "Uc", value: metrics.Uc * 0.10, spec: "researcher" },
  ];
  weighted.sort((a, b) => b.value - a.value);
  return { specialization: weighted[0].spec, dominant: weighted[0].key };
}

function buildSpawnPackageTemplate(role: string): SpawnPackage {
  return {
    task: "<FILL: bounded subtask description>",
    role,
    constraints: ["no writes to main workspace", "cite files and line numbers", "run targeted tests only"],
    memory_slice_refs: ["<FILL: relevant artifact ids or summaries>"],
    allowed_tools: ["read", "bash"],
    budget: { tokens: 20000, wall_minutes: 15 },
    success_criteria: ["<FILL: specific output contract>"],
    merge_policy: "advisory",
  };
}

function appendSpawnLog(decision: SpawnDecision): void {
  if (!basePiDir) return;
  try {
    const logPath = path.join(basePiDir, "mas-traces", "spawn-log.jsonl");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(decision) + "\n", "utf-8");
  } catch {
    // ignore
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    currentConcurrent = 0;
    currentDepth = 0;
    recentDecisions.length = 0;
  });

  // ─── Tool: compute_spawn_score ─────────────────────────────────────────────
  pi.registerTool({
    name: "compute_spawn_score",
    label: "Compute Spawn Score",
    description:
      "Compute AgentSpawn spawn score to determine whether spawning a sub-agent is justified. " +
      "Formula: Sspawn = 0.30*If + 0.20*Cc + 0.25*Fc + 0.15*Oc + 0.10*Uc (threshold 0.7). " +
      "Enforces max depth 3 and max concurrent 4. " +
      "Returns score, should_spawn decision, recommended specialization, and spawn package template.",
    parameters: Type.Object({
      If: Type.Number({
        description: "File interdependency factor (0–1): normalized count of files the task touches across modules",
        minimum: 0,
        maximum: 1,
      }),
      Cc: Type.Number({
        description: "Cyclomatic complexity factor (0–1): normalized max cyclomatic complexity of modified functions",
        minimum: 0,
        maximum: 1,
      }),
      Fc: Type.Number({
        description: "Test failure cascade factor (0–1): normalized count of failing tests",
        minimum: 0,
        maximum: 1,
      }),
      Oc: Type.Number({
        description: "Context saturation factor (0–1): fraction of context window currently used",
        minimum: 0,
        maximum: 1,
      }),
      Uc: Type.Number({
        description: "Agent uncertainty factor (0–1): estimated uncertainty derived from logprobs or self-report",
        minimum: 0,
        maximum: 1,
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { If: If_, Cc, Fc, Oc, Uc } = params;

      // Clamp inputs to [0,1]
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      const metrics = {
        If: clamp(If_),
        Cc: clamp(Cc),
        Fc: clamp(Fc),
        Oc: clamp(Oc),
        Uc: clamp(Uc),
      };

      const score = computeSpawnScore(metrics.If, metrics.Cc, metrics.Fc, metrics.Oc, metrics.Uc);
      const { specialization, dominant } = pickSpecialization(metrics);

      // Policy enforcement
      let shouldSpawn = score >= SPAWN_THRESHOLD;
      const policyReasons: string[] = [];

      if (shouldSpawn && currentDepth >= MAX_DEPTH) {
        shouldSpawn = false;
        policyReasons.push(`max depth ${MAX_DEPTH} reached (current depth: ${currentDepth})`);
      }
      if (shouldSpawn && currentConcurrent >= MAX_CONCURRENT) {
        shouldSpawn = false;
        policyReasons.push(`max concurrent ${MAX_CONCURRENT} reached (current: ${currentConcurrent})`);
      }

      const decision: SpawnDecision = {
        score,
        should_spawn: shouldSpawn,
        specialization,
        dominant_metric: dominant,
        inputs: metrics,
        spawn_package_template: buildSpawnPackageTemplate(specialization),
        timestamp: new Date().toISOString(),
      };

      recentDecisions.push(decision);
      if (recentDecisions.length > 20) recentDecisions.shift();
      appendSpawnLog(decision);

      const lines = [
        `Spawn score: ${score.toFixed(3)} (threshold: ${SPAWN_THRESHOLD})`,
        `Should spawn: ${shouldSpawn ? "YES" : "NO"}`,
        ...(policyReasons.length > 0 ? [`Policy blocks: ${policyReasons.join("; ")}`] : []),
        `Recommended specialization: ${specialization} (dominant metric: ${dominant})`,
        `Current depth: ${currentDepth}/${MAX_DEPTH}  Concurrent: ${currentConcurrent}/${MAX_CONCURRENT}`,
        "",
        "Spawn package template:",
        JSON.stringify(decision.spawn_package_template, null, 2),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: decision,
      };
    },
  });

  // ─── /spawn-policy: show limits and last 5 decisions ──────────────────────
  pi.registerCommand("spawn-policy", {
    description: "Show current spawn limits and last 5 spawn decisions",
    handler: async (_args, ctx) => {
      const last5 = recentDecisions.slice(-5);
      const lines = [
        `Spawn policy:`,
        `  Threshold: ${SPAWN_THRESHOLD}`,
        `  Max depth: ${MAX_DEPTH} (current: ${currentDepth})`,
        `  Max concurrent: ${MAX_CONCURRENT} (current: ${currentConcurrent})`,
        "",
        `Last ${last5.length} decisions:`,
        ...last5.map((d, i) => {
          const ts = d.timestamp.slice(11, 19);
          return `  ${i + 1}. [${ts}] score=${d.score.toFixed(3)} spawn=${d.should_spawn} role=${d.specialization}`;
        }),
      ];
      if (last5.length === 0) lines.push("  (no decisions yet this session)");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
