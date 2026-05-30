/**
 * validation-gate.ts
 *
 * Enforces "no success without tests/checks" — the central FeatureBench finding.
 * Injects validation requirements into the system prompt. Provides a tool for
 * agents to record validation evidence. Tracks whether validation ran.
 *
 * Research basis: FeatureBench — feature tasks fail without executable contracts
 *   and F2P/P2P tests. "Done means all required checks pass."
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

type ValidationStatus = "passed" | "failed" | "skipped" | "blocked";

interface ValidationRecord {
  id: string;
  session_id?: string;
  check_type: string;
  command?: string;
  exit_code?: number;
  output_summary?: string;
  status: ValidationStatus;
  rationale?: string;
  timestamp: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let basePiDir: string | null = null;
let sessionValidations: ValidationRecord[] = [];

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function validationLogPath(piDir: string): string {
  const d = path.join(piDir, "runs", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(d, { recursive: true });
  return path.join(d, "validation-log.jsonl");
}

function appendValidationLog(record: ValidationRecord): void {
  if (!basePiDir) return;
  try {
    const logPath = validationLogPath(basePiDir);
    fs.appendFileSync(logPath, JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // ignore
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    sessionValidations = [];
  });

  pi.on("agent_start", async () => {
    sessionValidations = [];
  });

  // ─── Inject validation requirements into system prompt ────────────────────
  pi.on("before_agent_start", async (event, _ctx) => {
    const validationInstructions = [
      "",
      "## Validation Gate (required)",
      "",
      "BEFORE declaring any coding task complete:",
      "1. Run the project's test suite or the relevant targeted tests.",
      "2. Run the linter and type-checker if available (check AGENTS.md for commands).",
      "3. Verify acceptance criteria from the task spec pass.",
      "4. Record results using the `validation_complete` tool.",
      "5. If tests are unavailable, use `validation_complete` with status=skipped and a rationale.",
      "",
      "Rule: 'Done' means all required checks pass or their absence is documented.",
      "Never mark a coding task complete without calling `validation_complete`.",
    ].join("\n");

    return {
      systemPrompt: event.systemPrompt + validationInstructions,
    };
  });

  // ─── Tool: validation_complete ────────────────────────────────────────────
  pi.registerTool({
    name: "validation_complete",
    label: "Validation Complete",
    description:
      "Record the result of a validation check (test run, lint, typecheck, acceptance criteria). " +
      "MUST be called before declaring any coding task complete. " +
      "Use status=skipped with a rationale if validation is genuinely unavailable.",
    parameters: Type.Object({
      check_type: Type.String({
        description:
          "Type of check: test_suite, unit_tests, lint, typecheck, acceptance_criteria, manual_verification, etc.",
      }),
      command: Type.Optional(
        Type.String({ description: "The exact command run, e.g. 'npm test' or 'python -m pytest tests/'" }),
      ),
      exit_code: Type.Optional(
        Type.Number({ description: "Exit code from the command (0 = success)" }),
      ),
      output_summary: Type.Optional(
        Type.String({ description: "Brief summary of the output (test counts, error messages, etc.)" }),
      ),
      status: StringEnum(["passed", "failed", "skipped", "blocked"] as const, {
        description:
          "passed = checks green; failed = checks red; skipped = unavailable (needs rationale); blocked = environment issue",
      }),
      rationale: Type.Optional(
        Type.String({
          description: "Required if status=skipped or blocked: why the check could not be run",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Validation directory not initialized" }], isError: true };
      }

      if ((params.status === "skipped" || params.status === "blocked") && !params.rationale) {
        return {
          content: [
            {
              type: "text",
              text: `Validation record rejected: status=${params.status} requires a rationale explaining why the check was not run.`,
            },
          ],
          isError: true,
        };
      }

      const record: ValidationRecord = {
        id: generateId(),
        check_type: params.check_type,
        command: params.command,
        exit_code: params.exit_code,
        output_summary: params.output_summary,
        status: params.status,
        rationale: params.rationale,
        timestamp: new Date().toISOString(),
      };

      sessionValidations.push(record);
      appendValidationLog(record);

      const statusEmoji = { passed: "✓", failed: "✗", skipped: "⊘", blocked: "⊗" }[params.status];
      const lines = [
        `${statusEmoji} Validation recorded: ${params.check_type}`,
        params.command ? `  Command: ${params.command}` : null,
        params.exit_code !== undefined ? `  Exit code: ${params.exit_code}` : null,
        params.output_summary ? `  Output: ${params.output_summary.slice(0, 200)}` : null,
        params.rationale ? `  Rationale: ${params.rationale}` : null,
      ].filter(Boolean);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: record,
      };
    },
  });

  // ─── agent_end: warn if no validation was recorded ────────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    // Check if any write tools were called without validation
    if (!ctx.hasUI) return;

    if (sessionValidations.length === 0) return;

    const failed = sessionValidations.filter((v) => v.status === "failed");
    if (failed.length > 0) {
      ctx.ui.notify(
        `⚠️ Validation gate: ${failed.length} check(s) FAILED:\n` +
          failed.map((v) => `  ✗ ${v.check_type}: ${v.output_summary ?? "no output"}`).join("\n"),
        "error",
      );
    }
  });

  // ─── /validation-rules: display validation protocol ────────────────────────
  pi.registerCommand("validation-rules", {
    description: "Display the validation gate rules and current session status",
    handler: async (_args, ctx) => {
      const rules = [
        "Validation Gate Rules",
        "======================",
        "",
        "1. No coding task is complete without calling validation_complete.",
        "2. Required checks (from AGENTS.md): test suite, linter, type-checker.",
        "3. Acceptance criteria must be verified, not assumed.",
        "4. If tests unavailable: status=skipped requires explicit rationale.",
        "5. A failed validation blocks the 'done' declaration.",
        "6. FeatureBench finding: 11% feature-task success vs 74% SWE-bench = tests matter.",
        "",
        `Session validation records (${sessionValidations.length}):`,
        ...sessionValidations.map((v) => {
          const emoji = { passed: "✓", failed: "✗", skipped: "⊘", blocked: "⊗" }[v.status];
          return `  ${emoji} ${v.check_type}${v.command ? ` (${v.command})` : ""}`;
        }),
      ];
      if (sessionValidations.length === 0) rules.push("  (none recorded this run)");
      ctx.ui.notify(rules.join("\n"), "info");
    },
  });
}
