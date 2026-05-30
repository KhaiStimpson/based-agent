/**
 * judge-evolution.ts
 *
 * Self-improving judge: collects good/bad attempt pairs from traces,
 * rejection-samples position-consistent verdicts, and iteratively refines
 * judge evaluation plan prompts without human annotation.
 *
 * Architecture enforces cross-model judging (never same backbone as generator).
 * Implements plan → execute → verdict with mandatory position-swap check.
 *
 * Research basis:
 *   - Self-Taught Evaluators (Meta FAIR) — synthetic preference pairs, rejection sampling
 *   - EvalPlanner (Meta FAIR) — plan → execute → verdict, task-adaptive unconstrained plans
 *   - LLM-as-a-Judge survey — five bias families; position-swap filter
 *   - Con-J (ICLR 2025) — generative pairwise with rationale
 *   - Self-preference paper — GPT-4 73.5% self-recognition; cross-model hard constraint
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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

type TaskType = "coding" | "skill_proposal" | "memory_update" | "topology" | "general";
type Verdict = "A" | "B" | "tie";
type Confidence = "high" | "medium" | "low";

interface PreferencePair {
  id: string;
  task_type: TaskType;
  task_description: string;
  candidate_a: string;
  candidate_b: string;
  winner: Verdict;
  rationale: string;
  position_consistent: boolean;
  judge_model_family: string;
  generator_model_family: string;
  confidence: Confidence;
  trace_ref?: string;
  created_at: string;
  // Reverse-order verdict (for position-consistency check)
  reverse_winner?: Verdict;
  reverse_rationale?: string;
}

interface EvalPlan {
  id: string;
  task_type: TaskType;
  task_description: string;
  objective_checks: string[];
  reference_answer_derivation: string;
  subjective_criteria_rubric: string[];
  edge_case_checklist: string[];
  anti_bias_instructions: string[];
  created_at: string;
  use_count: number;
  success_rate?: number;
}

interface CalibrationRecord {
  timestamp: string;
  position_consistency_rate: number;
  known_pair_accuracy?: number;
  verbosity_bias_rate?: number;
  total_pairs_evaluated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function judgeCorpusDir(piDir: string): string {
  const d = path.join(piDir, "evals", "judge-corpus");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function pairsFile(piDir: string): string {
  return path.join(judgeCorpusDir(piDir), "preference-pairs.jsonl");
}

function plansFile(piDir: string): string {
  return path.join(judgeCorpusDir(piDir), "eval-plans.jsonl");
}

function calibrationFile(piDir: string): string {
  return path.join(judgeCorpusDir(piDir), "calibration-log.jsonl");
}

function appendJsonl(filePath: string, record: unknown): void {
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
}

function readJsonlFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const items: T[] = [];
  const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      // skip malformed
    }
  }
  return items;
}

function isPositionConsistent(winner: Verdict, reverseWinner: Verdict): boolean {
  if (winner === "tie" && reverseWinner === "tie") return true;
  if (winner === "A" && reverseWinner === "B") return true;
  if (winner === "B" && reverseWinner === "A") return true;
  return false;
}

function computeCalibration(pairs: PreferencePair[]): CalibrationRecord {
  if (pairs.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      position_consistency_rate: 1,
      total_pairs_evaluated: 0,
    };
  }
  const withReverse = pairs.filter((p) => p.reverse_winner !== undefined);
  const consistentCount = withReverse.filter((p) => p.position_consistent).length;
  const consistencyRate = withReverse.length > 0 ? consistentCount / withReverse.length : 1;

  // Verbosity bias: check rationale for length-related language
  const verbosityBiased = pairs.filter((p) =>
    /\b(longer|more.detailed|more.elaborate|more.comprehensive|thorough.response)\b/i.test(p.rationale),
  ).length;
  const verbosityRate = pairs.length > 0 ? verbosityBiased / pairs.length : 0;

  return {
    timestamp: new Date().toISOString(),
    position_consistency_rate: Math.round(consistencyRate * 1000) / 1000,
    verbosity_bias_rate: Math.round(verbosityRate * 1000) / 1000,
    total_pairs_evaluated: pairs.length,
  };
}

// ─── Default anti-bias instructions (injected into every eval plan) ──────────

const ANTI_BIAS_INSTRUCTIONS = [
  "Strip all model identity, author attribution, and formatting decorations before judging.",
  "Do not mention or consider response length as a quality signal — evaluate correctness and evidence only.",
  "If your verdict would change based on which response appears first or second, discard it and regenerate.",
  "Use pairwise relative comparison (A vs B) — never scalar numeric scores.",
  "For high-stakes decisions: collect 3+ independent samples and use majority vote.",
  "Flag any rationale that cites formatting, style, or verbosity as a quality criterion.",
  "Self-preference: if you generated any candidate, do not judge that pair — route to a different model family.",
];

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    fs.mkdirSync(basePiDir, { recursive: true });
  });

  // ─── Tool: record_preference_pair ─────────────────────────────────────────
  pi.registerTool({
    name: "record_preference_pair",
    label: "Record Preference Pair",
    description:
      "Record a judge preference pair (A vs B) with position-consistency verification. " +
      "ARCHITECTURAL CONSTRAINT: judge_model_family MUST differ from generator_model_family. " +
      "Always run the judgment twice with candidates swapped; only store position-consistent verdicts. " +
      "Builds the self-improving judge corpus from run traces.",
    parameters: Type.Object({
      task_type: StringEnum(
        ["coding", "skill_proposal", "memory_update", "topology", "general"] as const,
      ),
      task_description: Type.String({ description: "What task was being evaluated" }),
      candidate_a: Type.String({ description: "Candidate A response/artifact (identity-stripped)" }),
      candidate_b: Type.String({ description: "Candidate B response/artifact (identity-stripped)" }),
      winner: StringEnum(["A", "B", "tie"] as const, {
        description: "Winner from forward order (A appears first)",
      }),
      rationale: Type.String({
        description: "Judgment rationale citing specific evidence, correctness, completeness",
      }),
      reverse_winner: StringEnum(["A", "B", "tie"] as const, {
        description: "Winner from reverse order (B appears first). Required for position-consistency check.",
      }),
      reverse_rationale: Type.String({
        description: "Judgment rationale from reverse order",
      }),
      judge_model_family: Type.String({
        description: "Model family used as judge: gemini, gpt, claude, llama, etc.",
      }),
      generator_model_family: Type.String({
        description: "Model family that generated the candidates. MUST differ from judge_model_family.",
      }),
      confidence: StringEnum(["high", "medium", "low"] as const),
      trace_ref: Type.Optional(Type.String({ description: "Reference to source run trace" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Judge corpus not initialized" }], isError: true };
      }

      // Hard constraint: cross-model judging
      if (params.judge_model_family.toLowerCase() === params.generator_model_family.toLowerCase()) {
        return {
          content: [
            {
              type: "text",
              text:
                `ARCHITECTURAL VIOLATION: judge_model_family (${params.judge_model_family}) must differ from ` +
                `generator_model_family (${params.generator_model_family}). ` +
                `Self-preference bias: GPT-4 achieves 73.5% out-of-box self-recognition; ` +
                `self-recognition and self-preference are linearly correlated. ` +
                `Route this judgment to a different model family.`,
            },
          ],
          isError: true,
        };
      }

      // Position consistency check
      const posConsistent = isPositionConsistent(params.winner, params.reverse_winner);
      if (!posConsistent) {
        return {
          content: [
            {
              type: "text",
              text:
                `Position-inconsistent verdict REJECTED:\n` +
                `  Forward: ${params.winner}  Reverse: ${params.reverse_winner}\n` +
                `  The verdict changed when candidate order was swapped — this indicates position bias.\n` +
                `  Discard and regenerate with a different evaluation plan.`,
            },
          ],
          details: { position_consistent: false, winner: params.winner, reverse_winner: params.reverse_winner },
        };
      }

      const id = `pp-${Date.now()}-${generateId()}`;
      const pair: PreferencePair = {
        id,
        task_type: params.task_type,
        task_description: params.task_description,
        candidate_a: params.candidate_a.slice(0, 500),
        candidate_b: params.candidate_b.slice(0, 500),
        winner: params.winner,
        rationale: params.rationale,
        position_consistent: true,
        judge_model_family: params.judge_model_family,
        generator_model_family: params.generator_model_family,
        confidence: params.confidence,
        trace_ref: params.trace_ref,
        created_at: new Date().toISOString(),
        reverse_winner: params.reverse_winner,
        reverse_rationale: params.reverse_rationale,
      };

      appendJsonl(pairsFile(basePiDir), pair);

      return {
        content: [
          {
            type: "text",
            text:
              `Preference pair recorded: ${id}\n` +
              `  Type: ${params.task_type}  Winner: ${params.winner}\n` +
              `  Position consistent: ✓  Confidence: ${params.confidence}\n` +
              `  Judge: ${params.judge_model_family} | Generator: ${params.generator_model_family}`,
          },
        ],
        details: pair,
      };
    },
  });

  // ─── Tool: generate_eval_plan ─────────────────────────────────────────────
  pi.registerTool({
    name: "generate_eval_plan",
    label: "Generate Eval Plan",
    description:
      "Generate a task-adaptive, unconstrained evaluation plan (EvalPlanner approach). " +
      "Plans are generated fresh for each task — never use fixed rubrics. " +
      "Plan structure: objective checks → reference answer derivation → subjective rubric → edge cases → anti-bias instructions.",
    parameters: Type.Object({
      task_type: StringEnum(
        ["coding", "skill_proposal", "memory_update", "topology", "general"] as const,
      ),
      task_description: Type.String({ description: "The task being evaluated" }),
      objective_checks: Type.Array(Type.String(), {
        description:
          "Objective verification steps: e.g. 'Run npm test and verify exit code 0', 'Check TypeScript compiles'",
      }),
      reference_answer_derivation: Type.String({
        description:
          "How to derive the reference/expected answer for this specific task — step by step",
      }),
      subjective_criteria_rubric: Type.Array(Type.String(), {
        description: "Rubric items for subjective quality dimensions (completeness, clarity, correctness)",
      }),
      edge_case_checklist: Type.Array(Type.String(), {
        description: "Edge cases that should be checked: error handling, boundary conditions, etc.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Judge corpus not initialized" }], isError: true };
      }

      const id = `ep-${Date.now()}-${generateId()}`;
      const plan: EvalPlan = {
        id,
        task_type: params.task_type,
        task_description: params.task_description,
        objective_checks: params.objective_checks,
        reference_answer_derivation: params.reference_answer_derivation,
        subjective_criteria_rubric: params.subjective_criteria_rubric,
        edge_case_checklist: params.edge_case_checklist,
        anti_bias_instructions: ANTI_BIAS_INSTRUCTIONS,
        created_at: new Date().toISOString(),
        use_count: 0,
      };

      appendJsonl(plansFile(basePiDir), plan);

      const formatted = [
        `Evaluation plan: ${id} (${params.task_type})`,
        "",
        `Objective checks (${params.objective_checks.length}):`,
        ...params.objective_checks.map((c) => `  • ${c}`),
        "",
        `Reference answer derivation:\n  ${params.reference_answer_derivation}`,
        "",
        `Subjective rubric (${params.subjective_criteria_rubric.length}):`,
        ...params.subjective_criteria_rubric.map((r) => `  • ${r}`),
        "",
        `Edge cases (${params.edge_case_checklist.length}):`,
        ...params.edge_case_checklist.map((e) => `  • ${e}`),
        "",
        `Anti-bias instructions (${ANTI_BIAS_INSTRUCTIONS.length} applied automatically).`,
      ];

      return {
        content: [{ type: "text", text: formatted.join("\n") }],
        details: plan,
      };
    },
  });

  // ─── /judge-corpus: show corpus stats ────────────────────────────────────
  pi.registerCommand("judge-corpus", {
    description: "Show judge corpus statistics and calibration metrics",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Judge corpus not initialized", "error");
        return;
      }
      const pairs = readJsonlFile<PreferencePair>(pairsFile(basePiDir));
      const plans = readJsonlFile<EvalPlan>(plansFile(basePiDir));
      const calibration = computeCalibration(pairs);

      const byType: Record<string, number> = {};
      for (const p of pairs) {
        byType[p.task_type] = (byType[p.task_type] ?? 0) + 1;
      }

      const status = calibration.position_consistency_rate < 0.8 ? "⚠ BELOW TARGET" : "✓";
      const lines = [
        `Judge Corpus Statistics`,
        `  Total preference pairs: ${pairs.length}`,
        `  Evaluation plans: ${plans.length}`,
        "",
        `Calibration Metrics:`,
        `  Position consistency rate: ${(calibration.position_consistency_rate * 100).toFixed(1)}% ${status} (target ≥ 80%)`,
        calibration.verbosity_bias_rate !== undefined
          ? `  Verbosity bias rate: ${(calibration.verbosity_bias_rate * 100).toFixed(1)}% (target < 5%)`
          : "",
        "",
        `Pairs by task type:`,
        ...Object.entries(byType).map(([t, n]) => `  ${t}: ${n}`),
        "",
        `Architectural constraint: judge_model_family MUST differ from generator.`,
        `Self-preference correlation is linear with self-recognition (73.5% out-of-box for GPT-4).`,
      ].filter(Boolean);

      ctx.ui.notify(lines.join("\n"), calibration.position_consistency_rate < 0.8 ? "error" : "info");
    },
  });

  // ─── /judge-calibrate: run calibration check ─────────────────────────────
  pi.registerCommand("judge-calibrate", {
    description: "Compute and log judge calibration metrics from the current corpus",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Judge corpus not initialized", "error");
        return;
      }
      const pairs = readJsonlFile<PreferencePair>(pairsFile(basePiDir));
      if (pairs.length === 0) {
        ctx.ui.notify("No preference pairs yet. Use record_preference_pair to build the corpus.", "info");
        return;
      }
      const record = computeCalibration(pairs);
      appendJsonl(calibrationFile(basePiDir), record);

      const lines = [
        `Calibration logged at ${record.timestamp.slice(0, 16)}`,
        `  Position consistency: ${(record.position_consistency_rate * 100).toFixed(1)}% (target ≥ 80%)`,
        record.verbosity_bias_rate !== undefined
          ? `  Verbosity bias: ${(record.verbosity_bias_rate * 100).toFixed(1)}% (target < 5%)`
          : "",
        `  Total pairs: ${record.total_pairs_evaluated}`,
        "",
        record.position_consistency_rate < 0.8
          ? "⚠ Position consistency below 80% — trigger Workflow G (judge plan refinement)."
          : "✓ Position consistency within target range.",
      ].filter(Boolean);

      ctx.ui.notify(lines.join("\n"), record.position_consistency_rate < 0.8 ? "error" : "info");
    },
  });
}
