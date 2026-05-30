/**
 * curriculum-generator.ts
 *
 * Generates repo-grounded frontier challenge cases from real run failures,
 * weak spots, and tool misuse. Filters to the informative capability band
 * (near p̂ ≈ 0.5 — neither trivially solved nor impossible).
 *
 * Research basis: Agent0 — curriculum co-evolution via frontier task filtering.
 *   Key principle: tasks near the executor's 0.5 self-consistency band drive
 *   improvement (not weight updates — that's Agent0's RL; here: challenge cases).
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

type ChallengeStatus = "candidate" | "promoted" | "retired" | "ambiguous";

type ChallengeSource =
  | "failed_validation"
  | "tool_misuse"
  | "context_miss"
  | "review_false_negative"
  | "stale_memory"
  | "ambiguous_handoff"
  | "cost_overrun"
  | "security_near_miss"
  | "manual";

interface ChallengeCase {
  id: string;
  title: string;
  task: string;
  source: ChallengeSource;
  oracle: string;
  required_tools: string[];
  novelty_hash: string;
  difficulty_estimate: number;
  curriculum_score: number;
  status: ChallengeStatus;
  trace_ref?: string;
  promotion_criteria: string;
  created_at: string;
  promoted_at?: string;
  attempt_count: number;
  pass_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function hashForNovelty(task: string): string {
  // Simple content hash for deduplication
  let hash = 0;
  for (let i = 0; i < task.length; i++) {
    hash = ((hash << 5) - hash + task.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function computeCurriculumScore(params: {
  difficulty: number;
  tool_use_count: number;
  novelty: boolean;
  has_oracle: boolean;
  cost_estimate: number;
  safety_risk: boolean;
}): number {
  // Frontier uncertainty: peak at difficulty ≈ 0.5 (Gaussian-like curve)
  const frontierUncertainty = 1 - 4 * Math.pow(params.difficulty - 0.5, 2);

  // Useful tool use: reward up to 4, penalize > 6
  const toolScore = Math.min(1, params.tool_use_count / 4) * (params.tool_use_count <= 6 ? 1 : 0.5);

  const noveltyBonus = params.novelty ? 0.2 : 0;
  const oracleBonus = params.has_oracle ? 0.1 : -0.2;
  const costPenalty = Math.min(0.3, params.cost_estimate * 0.01);
  const safetyPenalty = params.safety_risk ? -0.5 : 0;

  return Math.max(0, Math.min(1, frontierUncertainty + toolScore * 0.3 + noveltyBonus + oracleBonus - costPenalty + safetyPenalty));
}

function curriculaDir(piDir: string): string {
  const d = path.join(piDir, "curricula");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function challengeFilePath(piDir: string, id: string): string {
  return path.join(curriculaDir(piDir), `${id}.json`);
}

function readChallenge(piDir: string, id: string): ChallengeCase | null {
  const fp = challengeFilePath(piDir, id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as ChallengeCase;
  } catch {
    return null;
  }
}

function writeChallenge(piDir: string, challenge: ChallengeCase): void {
  fs.writeFileSync(challengeFilePath(piDir, challenge.id), JSON.stringify(challenge, null, 2), "utf-8");
}

function listChallenges(piDir: string): ChallengeCase[] {
  const dir = curriculaDir(piDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as ChallengeCase;
      } catch {
        return null;
      }
    })
    .filter((c): c is ChallengeCase => c !== null)
    .sort((a, b) => b.curriculum_score - a.curriculum_score);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    fs.mkdirSync(basePiDir, { recursive: true });
  });

  // ─── Tool: generate_challenge ──────────────────────────────────────────────
  pi.registerTool({
    name: "generate_challenge",
    label: "Generate Challenge",
    description:
      "Generate a frontier challenge case from a real failure or weak spot. " +
      "Challenges are scored by curriculum score (peak at difficulty ≈ 0.5). " +
      "Used for holdout evaluation and regression testing before promoting changes.",
    parameters: Type.Object({
      title: Type.String({ description: "Short title for the challenge case" }),
      task: Type.String({
        description: "Detailed task description. Must be specific, executable, and verifiable.",
      }),
      source: StringEnum(
        [
          "failed_validation",
          "tool_misuse",
          "context_miss",
          "review_false_negative",
          "stale_memory",
          "ambiguous_handoff",
          "cost_overrun",
          "security_near_miss",
          "manual",
        ] as const,
        { description: "What real failure or signal generated this challenge" },
      ),
      oracle: Type.String({
        description:
          "How to verify the task was solved correctly: specific command, expected output, test name, etc.",
      }),
      required_tools: Type.Array(Type.String(), {
        description: "Tools needed to attempt this challenge: read, bash, write, etc.",
      }),
      difficulty_estimate: Type.Number({
        description:
          "Estimated difficulty 0–1. 0=trivially easy (never fail), 1=impossible. Target 0.4–0.6 for frontier.",
        minimum: 0,
        maximum: 1,
      }),
      tool_use_count_estimate: Type.Optional(
        Type.Number({ description: "Expected number of tool calls needed (default: 3)" }),
      ),
      trace_ref: Type.Optional(
        Type.String({ description: "Reference to the run trace that produced this challenge" }),
      ),
      promotion_criteria: Type.String({
        description: "Criteria for promoting a proposed change: 'solve rate > 80%', 'all acceptance tests pass', etc.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Curriculum directory not initialized" }], isError: true };
      }

      const noveltyHash = hashForNovelty(params.task);

      // Check for duplicates
      const existing = listChallenges(basePiDir);
      const duplicate = existing.find((c) => c.novelty_hash === noveltyHash);
      if (duplicate) {
        return {
          content: [
            {
              type: "text",
              text: `Duplicate challenge detected (hash match: ${noveltyHash}). Existing: ${duplicate.id} "${duplicate.title}"`,
            },
          ],
          details: { duplicate_id: duplicate.id },
        };
      }

      const toolCount = params.tool_use_count_estimate ?? 3;
      const curriculumScore = computeCurriculumScore({
        difficulty: params.difficulty_estimate,
        tool_use_count: toolCount,
        novelty: true,
        has_oracle: params.oracle.trim().length > 10,
        cost_estimate: toolCount * 0.5,
        safety_risk: params.source === "security_near_miss",
      });

      const id = `cc-${Date.now()}-${generateId()}`;
      const challenge: ChallengeCase = {
        id,
        title: params.title,
        task: params.task,
        source: params.source,
        oracle: params.oracle,
        required_tools: params.required_tools,
        novelty_hash: noveltyHash,
        difficulty_estimate: params.difficulty_estimate,
        curriculum_score: curriculumScore,
        status: "candidate",
        trace_ref: params.trace_ref,
        promotion_criteria: params.promotion_criteria,
        created_at: new Date().toISOString(),
        attempt_count: 0,
        pass_count: 0,
      };

      writeChallenge(basePiDir, challenge);

      // Warn about difficulty extremes
      const warnings: string[] = [];
      if (params.difficulty_estimate < 0.2) warnings.push("⚠ Very low difficulty — may be trivially solved.");
      if (params.difficulty_estimate > 0.85) warnings.push("⚠ Very high difficulty — may be impossible to solve.");
      if (curriculumScore < 0.3) warnings.push("⚠ Low curriculum score — consider a harder/easier variant.");

      return {
        content: [
          {
            type: "text",
            text:
              `Challenge case created: ${id}\n` +
              `  Title: ${params.title}\n` +
              `  Source: ${params.source}\n` +
              `  Difficulty: ${params.difficulty_estimate.toFixed(2)}\n` +
              `  Curriculum score: ${curriculumScore.toFixed(3)}\n` +
              (warnings.length > 0 ? `\n${warnings.join("\n")}` : ""),
          },
        ],
        details: challenge,
      };
    },
  });

  // ─── Tool: list_challenges ─────────────────────────────────────────────────
  pi.registerTool({
    name: "list_challenges",
    label: "List Challenges",
    description: "List curriculum challenge cases sorted by curriculum score.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.String({ description: "Filter by status: candidate, promoted, retired, ambiguous" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Curriculum directory not initialized" }], isError: true };
      }
      let challenges = listChallenges(basePiDir);
      if (params.status) challenges = challenges.filter((c) => c.status === params.status);
      if (challenges.length === 0) {
        return { content: [{ type: "text", text: "No challenges found." }], details: { challenges: [] } };
      }
      const lines = challenges.slice(0, 20).map((c, i) => {
        const passRate = c.attempt_count > 0 ? `${Math.round((c.pass_count / c.attempt_count) * 100)}%` : "n/a";
        return `${i + 1}. [${c.status}] score=${c.curriculum_score.toFixed(2)} diff=${c.difficulty_estimate.toFixed(2)} pass=${passRate}\n   ${c.title} (${c.source})`;
      });
      return {
        content: [{ type: "text", text: `${challenges.length} challenge(s):\n\n${lines.join("\n\n")}` }],
        details: { challenges: challenges.slice(0, 20) },
      };
    },
  });

  // ─── Tool: promote_challenge ───────────────────────────────────────────────
  pi.registerTool({
    name: "promote_challenge",
    label: "Promote Challenge",
    description: "Promote a candidate challenge to the holdout evaluation suite.",
    parameters: Type.Object({
      challenge_id: Type.String({ description: "Challenge ID to promote" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Curriculum directory not initialized" }], isError: true };
      }
      const challenge = readChallenge(basePiDir, params.challenge_id);
      if (!challenge) {
        return { content: [{ type: "text", text: `Challenge not found: ${params.challenge_id}` }], isError: true };
      }
      const updated: ChallengeCase = {
        ...challenge,
        status: "promoted",
        promoted_at: new Date().toISOString(),
      };
      writeChallenge(basePiDir, updated);
      return {
        content: [{ type: "text", text: `Challenge ${params.challenge_id} promoted to holdout evaluation suite.` }],
        details: updated,
      };
    },
  });

  // ─── /curriculum: show challenges ─────────────────────────────────────────
  pi.registerCommand("curriculum", {
    description: "Show curriculum challenge cases sorted by score",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Curriculum directory not initialized", "error");
        return;
      }
      const challenges = listChallenges(basePiDir);
      if (challenges.length === 0) {
        ctx.ui.notify("No curriculum challenges yet. Use generate_challenge to create them.", "info");
        return;
      }
      const counts = { candidate: 0, promoted: 0, retired: 0, ambiguous: 0 };
      for (const c of challenges) counts[c.status]++;
      const top5 = challenges.filter((c) => c.status === "candidate").slice(0, 5);
      const lines = [
        `Curriculum: ${challenges.length} total — ${counts.candidate} candidate, ${counts.promoted} promoted`,
        "",
        "Top 5 candidates by score:",
        ...top5.map(
          (c, i) =>
            `  ${i + 1}. score=${c.curriculum_score.toFixed(2)} diff=${c.difficulty_estimate.toFixed(2)} | ${c.title}`,
        ),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
