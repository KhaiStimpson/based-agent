/**
 * attempt-summarizer.ts
 *
 * Forces every agent run that produces code changes to emit a compact
 * structured attempt summary. Supports Recursive Tournament Voting and
 * Parallel-Distill-Refine patterns.
 *
 * Research basis: Scaling Test-Time Compute — structured rollout summaries,
 *                 RTV selection, Parallel-Distill-Refine.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

type Verdict = "candidate" | "reject" | "needs_refinement";

interface AttemptSummary {
  attempt_id: string;
  hypothesis: string;
  files_inspected: string[];
  files_changed: string[];
  commands_run: string[];
  tests_passed: string[];
  tests_failed: string[];
  progress_made: string[];
  failure_modes: string[];
  remaining_risks: string[];
  reusable_insights: string[];
  verdict: Verdict;
  saved_at: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const WRITE_TOOLS = new Set(["write", "edit", "create"]);
let sessionWriteToolsSeen: string[] = [];
let basePiDir: string | null = null;

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function summaryDir(piDir: string): string {
  const d = path.join(piDir, "runs", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function readRecentSummaries(piDir: string, limit: number): AttemptSummary[] {
  const runsDir = path.join(piDir, "runs");
  if (!fs.existsSync(runsDir)) return [];

  const summaries: AttemptSummary[] = [];
  const dateDirs = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  for (const dateDir of dateDirs) {
    const dateFullPath = path.join(runsDir, dateDir);
    const files = fs
      .readdirSync(dateFullPath)
      .filter((f) => f.endsWith("-summary.json"))
      .sort()
      .reverse();

    for (const file of files) {
      try {
        const item = JSON.parse(
          fs.readFileSync(path.join(dateFullPath, file), "utf-8"),
        ) as AttemptSummary;
        summaries.push(item);
        if (summaries.length >= limit) return summaries;
      } catch {
        // skip
      }
    }
    if (summaries.length >= limit) break;
  }
  return summaries;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    basePiDir = path.join(ctx.cwd, ".pi");
    sessionWriteToolsSeen = [];
  });

  // Track which write tools were called this session
  pi.on("tool_call", async (event) => {
    if (WRITE_TOOLS.has(event.toolName)) {
      const fileArg =
        (event.input as { path?: string; file_path?: string }).path ??
        (event.input as { path?: string; file_path?: string }).file_path ??
        "unknown";
      sessionWriteToolsSeen.push(`${event.toolName}:${fileArg}`);
    }
    return undefined;
  });

  // Reset per-agent-run tracking
  pi.on("agent_start", async () => {
    sessionWriteToolsSeen = [];
  });

  // On agent end: if code changes detected, prompt to save a summary
  pi.on("agent_end", async (_event, ctx) => {
    if (sessionWriteToolsSeen.length === 0) return;

    if (!ctx.hasUI) return; // Skip in non-interactive mode

    try {
      const changedFiles = [...new Set(sessionWriteToolsSeen.map((s) => s.split(":").slice(1).join(":")))];
      const message =
        `This run modified ${changedFiles.length} file(s):\n  ${changedFiles.slice(0, 5).join("\n  ")}\n\n` +
        `Save an attempt summary? (Use save_attempt_summary tool or /attempt-history to review)`;
      ctx.ui.notify(message, "info");
    } catch {
      // ignore
    }
  });

  // ─── Tool: save_attempt_summary ───────────────────────────────────────────
  pi.registerTool({
    name: "save_attempt_summary",
    label: "Save Attempt Summary",
    description:
      "Save a structured attempt summary for this run. Required after every meaningful coding attempt. " +
      "Summaries enable Recursive Tournament Voting (RTV) selection and Parallel-Distill-Refine.",
    parameters: Type.Object({
      attempt_id: Type.Optional(
        Type.String({ description: "Attempt ID (auto-generated if omitted)" }),
      ),
      hypothesis: Type.String({
        description: "Root cause hypothesis or solution strategy tried in this attempt",
      }),
      files_inspected: Type.Array(Type.String(), {
        description: "Files read or examined during this attempt",
      }),
      files_changed: Type.Array(Type.String(), {
        description: "Files that were written or edited",
      }),
      commands_run: Type.Array(Type.String(), {
        description: "Commands executed (tests, builds, lints)",
      }),
      tests_passed: Type.Array(Type.String(), {
        description: "Test names or test IDs that passed",
      }),
      tests_failed: Type.Array(Type.String(), {
        description: "Test names or test IDs that failed",
      }),
      progress_made: Type.Array(Type.String(), {
        description: "Concrete forward progress achieved in this attempt",
      }),
      failure_modes: Type.Array(Type.String(), {
        description: "Ways this attempt failed or fell short",
      }),
      remaining_risks: Type.Array(Type.String(), {
        description: "Known risks or unknowns that were not resolved",
      }),
      reusable_insights: Type.Array(Type.String(), {
        description: "Observations or patterns that can seed future attempts",
      }),
      verdict: StringEnum(["candidate", "reject", "needs_refinement"] as const, {
        description:
          "candidate = can be promoted or merged; reject = discard; needs_refinement = promising but incomplete",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Runs directory not initialized" }], isError: true };
      }
      const attemptId = params.attempt_id ?? `${Date.now()}-${generateId()}`;
      const summary: AttemptSummary = {
        attempt_id: attemptId,
        hypothesis: params.hypothesis,
        files_inspected: params.files_inspected,
        files_changed: params.files_changed,
        commands_run: params.commands_run,
        tests_passed: params.tests_passed,
        tests_failed: params.tests_failed,
        progress_made: params.progress_made,
        failure_modes: params.failure_modes,
        remaining_risks: params.remaining_risks,
        reusable_insights: params.reusable_insights,
        verdict: params.verdict,
        saved_at: new Date().toISOString(),
      };
      const dir = summaryDir(basePiDir);
      const fp = path.join(dir, `${attemptId}-summary.json`);
      fs.writeFileSync(fp, JSON.stringify(summary, null, 2), "utf-8");
      return {
        content: [
          {
            type: "text",
            text:
              `Attempt summary saved: ${fp}\n` +
              `  ID: ${attemptId}\n` +
              `  Verdict: ${summary.verdict}\n` +
              `  Files changed: ${summary.files_changed.length}\n` +
              `  Tests passed/failed: ${summary.tests_passed.length}/${summary.tests_failed.length}`,
          },
        ],
        details: summary,
      };
    },
  });

  // ─── /attempt-history: show last 10 attempt summaries ────────────────────
  pi.registerCommand("attempt-history", {
    description: "Show last 10 attempt summaries with their verdicts",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Runs directory not initialized", "error");
        return;
      }
      const summaries = readRecentSummaries(basePiDir, 10);
      if (summaries.length === 0) {
        ctx.ui.notify("No attempt summaries found. Use save_attempt_summary tool after each attempt.", "info");
        return;
      }
      const lines = summaries.map((s, i) => {
        const ts = s.saved_at.slice(0, 16).replace("T", " ");
        const verdictEmoji =
          s.verdict === "candidate" ? "✓" : s.verdict === "reject" ? "✗" : "⟳";
        return (
          `${i + 1}. ${verdictEmoji} [${s.verdict}] ${ts}\n` +
          `   ID: ${s.attempt_id}\n` +
          `   Hypothesis: ${s.hypothesis.slice(0, 80)}\n` +
          `   Changed: ${s.files_changed.length} files  Tests: ${s.tests_passed.length}✓/${s.tests_failed.length}✗`
        );
      });
      ctx.ui.notify(`Last ${summaries.length} attempt(s):\n\n${lines.join("\n\n")}`, "info");
    },
  });

  // ─── /attempt-compare: show two attempts side by side ────────────────────
  pi.registerCommand("attempt-compare", {
    description: "Compare two attempt summaries for RTV selection. Usage: /attempt-compare <id1> <id2>",
    handler: async (args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Runs directory not initialized", "error");
        return;
      }
      const [id1, id2] = args.trim().split(/\s+/);
      if (!id1 || !id2) {
        ctx.ui.notify("Usage: /attempt-compare <attempt-id-1> <attempt-id-2>", "info");
        return;
      }
      function findSummary(id: string): AttemptSummary | null {
        const runsDir = path.join(basePiDir!, "runs");
        if (!fs.existsSync(runsDir)) return null;
        const dateDirs = fs.readdirSync(runsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory()).map((e) => e.name);
        for (const dd of dateDirs) {
          const fp = path.join(runsDir, dd, `${id}-summary.json`);
          if (fs.existsSync(fp)) {
            try { return JSON.parse(fs.readFileSync(fp, "utf-8")) as AttemptSummary; } catch { return null; }
          }
        }
        return null;
      }
      const a = findSummary(id1);
      const b = findSummary(id2);
      if (!a) { ctx.ui.notify(`Attempt not found: ${id1}`, "error"); return; }
      if (!b) { ctx.ui.notify(`Attempt not found: ${id2}`, "error"); return; }

      const lines = [
        `Attempt A (${a.verdict}): ${id1}`,
        `Attempt B (${b.verdict}): ${id2}`,
        "",
        `Hypothesis:`,
        `  A: ${a.hypothesis}`,
        `  B: ${b.hypothesis}`,
        "",
        `Tests passed:   A=${a.tests_passed.length}  B=${b.tests_passed.length}`,
        `Tests failed:   A=${a.tests_failed.length}  B=${b.tests_failed.length}`,
        `Files changed:  A=${a.files_changed.length}  B=${b.files_changed.length}`,
        "",
        `Failure modes A: ${a.failure_modes.join("; ") || "none"}`,
        `Failure modes B: ${b.failure_modes.join("; ") || "none"}`,
        "",
        `Reusable insights A: ${a.reusable_insights.join("; ") || "none"}`,
        `Reusable insights B: ${b.reusable_insights.join("; ") || "none"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
