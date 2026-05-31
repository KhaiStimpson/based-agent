/**
 * trajectory-auditor.ts
 *
 * Scores the observed tool-use trajectory of each session rather than relying
 * only on the final answer or the agent's self-summary.
 *
 * Research basis: TRAJECT-Bench, MCPVerse, compressed-agent capability evals.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

type Severity = "info" | "warning" | "error";

interface ToolStep {
  index: number;
  tool: string;
  file?: string;
  command?: string;
  started_at: string;
  ok?: boolean;
  error_excerpt?: string;
}

interface TrajectoryIssue {
  severity: Severity;
  code: string;
  message: string;
}

interface TrajectoryReport {
  id: string;
  cwd: string;
  started_at: string;
  ended_at: string;
  steps: ToolStep[];
  issues: TrajectoryIssue[];
  metrics: {
    tool_calls: number;
    unique_tools: number;
    write_before_read: boolean;
    repeated_write_bursts: number;
    shell_errors: number;
    score: number;
  };
}

const READ_TOOLS = new Set(["read", "grep", "search", "list", "glob"]);
const WRITE_TOOLS = new Set(["write", "edit", "create", "delete"]);
const SHELL_TOOLS = new Set(["bash", "shell", "run", "terminal"]);

let cwd = "";
let piDir = "";
let startedAt = "";
let steps: ToolStep[] = [];
let readFiles = new Set<string>();
let writeFiles = new Map<string, number>();

function findPackagePiDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "AGENTS.md"))) return path.join(dir, ".pi");
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const sub = path.join(process.cwd(), "based-agent");
  if (fs.existsSync(path.join(sub, "AGENTS.md"))) return path.join(sub, ".pi");
  return path.join(process.cwd(), ".pi");
}

function id(): string {
  return crypto.randomBytes(6).toString("hex");
}

function safeString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

function extractFile(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return safeString(obj.file) || safeString(obj.path) || safeString(obj.filePath);
}

function extractCommand(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return safeString(obj.command) || safeString(obj.cmd);
}

function trajectoriesDir(): string {
  const d = path.join(piDir, "trajectories", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function analyse(): Omit<TrajectoryReport, "id" | "cwd" | "started_at" | "ended_at"> {
  const issues: TrajectoryIssue[] = [];
  let writeBeforeRead = false;
  let repeatedWriteBursts = 0;
  let shellErrors = 0;

  for (const step of steps) {
    if (WRITE_TOOLS.has(step.tool) && step.file && !readFiles.has(step.file)) {
      writeBeforeRead = true;
    }
    if (SHELL_TOOLS.has(step.tool) && step.ok === false) shellErrors += 1;
  }

  for (const [file, count] of writeFiles.entries()) {
    if (count >= 3) {
      repeatedWriteBursts += 1;
      issues.push({
        severity: "warning",
        code: "repeated_write_burst",
        message: `File edited ${count} times in one session: ${file}`,
      });
    }
  }

  if (writeBeforeRead) {
    issues.push({
      severity: "warning",
      code: "write_before_read",
      message: "A file was modified before an observed read/search of that file.",
    });
  }

  if (steps.length > 40) {
    issues.push({
      severity: "info",
      code: "long_tool_chain",
      message: `Long tool trajectory (${steps.length} calls); consider summarizing or spawning a specialist.`,
    });
  }

  if (shellErrors >= 3) {
    issues.push({
      severity: "error",
      code: "unrecovered_shell_errors",
      message: `${shellErrors} shell/tool errors observed; require debugger or tester review before promotion.`,
    });
  }

  const uniqueTools = new Set(steps.map((s) => s.tool)).size;
  let score = 100;
  if (writeBeforeRead) score -= 20;
  score -= Math.min(25, repeatedWriteBursts * 10);
  score -= Math.min(25, shellErrors * 5);
  if (steps.length > 60) score -= 10;
  score = Math.max(0, score);

  return {
    steps,
    issues,
    metrics: {
      tool_calls: steps.length,
      unique_tools: uniqueTools,
      write_before_read: writeBeforeRead,
      repeated_write_bursts: repeatedWriteBursts,
      shell_errors: shellErrors,
      score,
    },
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    piDir = findPackagePiDir();
    startedAt = new Date().toISOString();
    steps = [];
    readFiles = new Set();
    writeFiles = new Map();
  });

  pi.on("tool_call", async (event) => {
    const file = extractFile(event.input);
    const command = extractCommand(event.input);
    const tool = event.toolName;

    steps.push({
      index: steps.length + 1,
      tool,
      file,
      command,
      started_at: new Date().toISOString(),
    });

    if (file && READ_TOOLS.has(tool)) readFiles.add(file);
    if (file && WRITE_TOOLS.has(tool)) writeFiles.set(file, (writeFiles.get(file) || 0) + 1);
  });

  pi.on("tool_result", async (event) => {
    const last = steps[steps.length - 1];
    if (!last) return;
    last.ok = !event.isError;
    if (event.isError) {
      last.error_excerpt = event.content
        .map((c) => c.type === "text" ? c.text : `[${c.type}]`)
        .join(" ")
        .slice(0, 300);
    }
  });

  pi.on("agent_end", async () => {
    if (!piDir) return;
    const analysed = analyse();
    const report: TrajectoryReport = {
      id: id(),
      cwd,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      ...analysed,
    };
    const out = path.join(trajectoriesDir(), `${report.id}-trajectory.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
  });

  pi.registerCommand("trajectory-last", {
    description: "Show the latest trajectory audit report.",
    handler: async (_args, ctx) => {
      const basePiDir = findPackagePiDir();
      const root = path.join(basePiDir, "trajectories");
      if (!fs.existsSync(root)) return ctx.ui.notify("No trajectory reports found.", "info");
      const reports: string[] = [];
      function walk(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fp = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(fp);
          else if (entry.name.endsWith("-trajectory.json")) reports.push(fp);
        }
      }
      walk(root);
      reports.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      const latest = reports[0];
      if (!latest) return ctx.ui.notify("No trajectory reports found.", "info");
      const report = JSON.parse(fs.readFileSync(latest, "utf-8")) as TrajectoryReport;
      return ctx.ui.notify(
        `Latest trajectory audit\n- report: ${path.relative(ctx.cwd, latest).replace(/\\/g, "/")}\n- score: ${report.metrics.score}\n- tool calls: ${report.metrics.tool_calls}\n- issues: ${report.issues.length}`,
        report.issues.some((i) => i.severity === "error") ? "error" : "info",
      );
    },
  });
}
