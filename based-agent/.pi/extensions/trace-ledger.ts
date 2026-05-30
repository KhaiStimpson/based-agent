/**
 * trace-ledger.ts
 *
 * Persists structured JSONL trace events for every run, agent call, tool call,
 * artifact, cost, and outcome to .pi/mas-traces/<date>/<session-id>.jsonl
 *
 * Research basis: LIFE attribution/evolution; test-time scaling summaries.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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


// Module-level state

let traceFilePath: string | null = null;
let sessionId: string | null = null;
let basePiDir: string | null = null;
let sessionToolCallCount = 0;
let sessionHadErrors = false;
const toolCallStartTimes = new Map<string, number>();
const toolNamesById = new Map<string, string>();
let sessionCommands: string[] = [];
let sessionWritePaths: string[] = [];
let sessionToolErrors: string[] = [];
let sessionValidations: string[] = [];
let sessionOutputSummaries: string[] = [];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function redact(value: string): string {
  return value.replace(/([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]");
}
function compact(value: unknown, max = 200): string { return redact(JSON.stringify(value)).slice(0, max); }
function looksLikeValidation(command: string): boolean { return /\b(test|check|lint|tsc|validate|doctor|status)\b|npm run (test|check|lint|validate|doctor|status)/i.test(command); }

function appendTrace(event: Record<string, unknown>): void {
  if (!traceFilePath) return;
  try {
    const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + "\n";
    fs.appendFileSync(traceFilePath, line, "utf-8");
  } catch {
    // Silently ignore write errors — never crash the session
  }
}

export default function (pi: ExtensionAPI) {
  // ─── Session start: open trace file ────────────────────────────────────────
  pi.on("session_start", async (event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    sessionToolCallCount = 0;
    sessionHadErrors = false;
    toolCallStartTimes.clear();
    toolNamesById.clear();
    sessionCommands = [];
    sessionWritePaths = [];
    sessionToolErrors = [];
    sessionValidations = [];
    sessionOutputSummaries = [];

    const date = getDateString();
    const sessionFile = ctx.sessionManager.getSessionFile();
    sessionId = sessionFile
      ? path.basename(sessionFile, path.extname(sessionFile))
      : `ephemeral-${generateId()}`;

    const traceDir = path.join(basePiDir, "mas-traces", date);
    fs.mkdirSync(traceDir, { recursive: true });
    traceFilePath = path.join(traceDir, `${sessionId}.jsonl`);

    appendTrace({
      type: "session_start",
      session_id: sessionId,
      reason: event.reason,
      model: (ctx.model as { id?: string } | undefined)?.id ?? "unknown",
      cwd: ctx.cwd,
    });
  });

  // ─── Turn start ─────────────────────────────────────────────────────────────
  pi.on("turn_start", async (event) => {
    appendTrace({
      type: "turn_start",
      turn_index: (event as { turnIndex?: number }).turnIndex ?? 0,
    });
  });

  // ─── Tool call: record start time, emit event ────────────────────────────────
  pi.on("tool_call", async (event) => {
    toolCallStartTimes.set(event.toolCallId, Date.now());
    toolNamesById.set(event.toolCallId, event.toolName);
    sessionToolCallCount++;

    const inputSummary = compact(event.input, 200);
    const command = (event.input as { command?: string; cmd?: string }).command ?? (event.input as { command?: string; cmd?: string }).cmd;
    if (command && ["bash", "shell", "terminal"].includes(event.toolName)) {
      const safe = redact(String(command)).slice(0, 300);
      sessionCommands.push(safe);
      if (looksLikeValidation(safe)) sessionValidations.push(safe);
    }
    if (["write", "edit", "create"].includes(event.toolName)) {
      const fileArg = (event.input as { path?: string; file_path?: string }).path ?? (event.input as { path?: string; file_path?: string }).file_path;
      if (fileArg) sessionWritePaths.push(String(fileArg));
    }
    appendTrace({
      type: "tool_call",
      tool_name: event.toolName,
      tool_call_id: event.toolCallId,
      input_summary: inputSummary,
    });

    return undefined;
  });

  // ─── Tool result: emit event with duration ────────────────────────────────────
  pi.on("tool_result", async (event) => {
    const startTime = toolCallStartTimes.get(event.toolCallId);
    const durationMs = startTime !== undefined ? Date.now() - startTime : null;
    toolCallStartTimes.delete(event.toolCallId);
    toolNamesById.delete(event.toolCallId);

    if (event.isError) sessionHadErrors = true;

    const resultParts: string[] = [];
    for (const c of event.content) {
      if (c.type === "text") {
        resultParts.push(c.text.slice(0, 200));
      } else {
        resultParts.push(`[${c.type}]`);
      }
    }
    const resultSummary = redact(resultParts.join(" ")).slice(0, 200);
    sessionOutputSummaries.push(`${event.toolName}: ${resultSummary}`.slice(0, 240));
    if (event.isError) sessionToolErrors.push(`${event.toolName}: ${resultSummary}`.slice(0, 240));

    appendTrace({
      type: "tool_result",
      tool_name: event.toolName,
      tool_call_id: event.toolCallId,
      result_summary: resultSummary,
      success: !event.isError,
      duration_ms: durationMs,
    });

    return undefined;
  });

  // ─── Agent end: emit final status ────────────────────────────────────────────
  pi.on("agent_end", async () => {
    appendTrace({
      type: "agent_end",
      session_id: sessionId,
      total_tool_calls: sessionToolCallCount,
      had_errors: sessionHadErrors,
      commands: [...new Set(sessionCommands)].slice(0, 50),
      write_paths: [...new Set(sessionWritePaths)].slice(0, 100),
      tool_errors: sessionToolErrors.slice(0, 25),
      validations: [...new Set(sessionValidations)].slice(0, 25),
      output_summaries: sessionOutputSummaries.slice(-25),
    });
  });

  // ─── /trace-status: show current trace path ──────────────────────────────────
  pi.registerCommand("trace-status", {
    description: "Show current session trace file path",
    handler: async (_args, ctx) => {
      if (!traceFilePath) {
        ctx.ui.notify("No active trace file (session not started yet)", "info");
        return;
      }
      const exists = fs.existsSync(traceFilePath);
      ctx.ui.notify(
        `Trace file: ${traceFilePath}\nExists: ${exists}\nSession: ${sessionId}`,
        "info",
      );
    },
  });

  // ─── /trace-last: show last 5 events ─────────────────────────────────────────
  pi.registerCommand("trace-last", {
    description: "Print the last 5 events from the current trace file",
    handler: async (_args, ctx) => {
      if (!traceFilePath) {
        ctx.ui.notify("No active trace file", "info");
        return;
      }
      try {
        const content = fs.readFileSync(traceFilePath, "utf-8");
        const lines = content
          .trim()
          .split("\n")
          .filter((l) => l.trim().length > 0);
        if (lines.length === 0) {
          ctx.ui.notify("Trace file is empty", "info");
          return;
        }
        const last5 = lines.slice(-5);
        const formatted = last5.map((l) => {
          try {
            const e = JSON.parse(l) as Record<string, unknown>;
            const ts = typeof e.timestamp === "string" ? e.timestamp.slice(11, 19) : "??:??:??";
            const tool = e.tool_name ?? e.reason ?? e.turn_index ?? "";
            return `[${ts}] ${e.type}: ${tool}`;
          } catch {
            return l.slice(0, 120);
          }
        });
        ctx.ui.notify(`Last ${last5.length} events:\n${formatted.join("\n")}`, "info");
      } catch (err) {
        ctx.ui.notify(`Could not read trace file: ${String(err)}`, "error");
      }
    },
  });
}
