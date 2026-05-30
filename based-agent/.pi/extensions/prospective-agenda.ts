/**
 * prospective-agenda.ts
 *
 * Tracks future obligations (ELL prospective memory) — pending tests,
 * follow-ups, deferred cleanup. Notifies about overdue/high-priority
 * obligations at session start.
 *
 * Research basis: ELL/StuLife prospective memory — Proactive Initiative Score.
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

type AgendaPriority = "high" | "medium" | "low";
type AgendaStatus = "open" | "completed" | "cancelled";

interface AgendaItem {
  id: string;
  obligation: string;
  trigger: string;
  required_files: string[];
  required_commands: string[];
  success_criteria: string;
  priority: AgendaPriority;
  status: AgendaStatus;
  created_at: string;
  completed_at?: string;
  outcome?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function agendaFilePath(piDir: string): string {
  const memDir = path.join(piDir, "memory");
  fs.mkdirSync(memDir, { recursive: true });
  return path.join(memDir, "prospective-agenda.jsonl");
}

function readAllItems(filePath: string): AgendaItem[] {
  if (!fs.existsSync(filePath)) return [];
  const items: AgendaItem[] = [];
  const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line) as AgendaItem);
    } catch {
      // skip malformed lines
    }
  }
  return items;
}

function rewriteAllItems(filePath: string, items: AgendaItem[]): void {
  const content = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
}

function isOverdue(item: AgendaItem): boolean {
  // Simple heuristic: check if trigger contains a date that has passed
  const match = item.trigger.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) {
    try {
      return new Date(match[1]) < new Date();
    } catch {
      return false;
    }
  }
  return false;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let piDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    piDir = PACKAGE_PI_DIR;
    fs.mkdirSync(piDir, { recursive: true });

    // Check for overdue or high-priority obligations
    try {
      const fp = agendaFilePath(piDir);
      const items = readAllItems(fp);
      const openItems = items.filter((i) => i.status === "open");
      const urgent = openItems.filter((i) => i.priority === "high" || isOverdue(i));

      if (urgent.length > 0) {
        const lines = urgent.map((item) => {
          const overdueTag = isOverdue(item) ? " [OVERDUE]" : "";
          return `  • [${item.priority.toUpperCase()}]${overdueTag} ${item.obligation}\n    Trigger: ${item.trigger}`;
        });

        pi.sendMessage(
          {
            customType: "prospective-agenda-alert",
            content:
              `## Agenda Alert\n\nYou have ${urgent.length} high-priority or overdue obligation(s):\n\n` +
              lines.join("\n\n") +
              "\n\nUse agenda_check to see all open obligations.",
            display: true,
          },
          { triggerTurn: false },
        );
      }
    } catch {
      // ignore errors during startup
    }
  });

  // ─── Tool: agenda_add ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "agenda_add",
    label: "Agenda Add",
    description:
      "Add a future obligation to the prospective agenda. Use this to record things that MUST be " +
      "done later: pending tests, follow-up reviews, deferred cleanups, validation runs, etc. " +
      "Include full execution context so the obligation can be acted on without memory.",
    parameters: Type.Object({
      obligation: Type.String({ description: "What must be done — be specific and actionable" }),
      trigger: Type.String({
        description:
          "When to execute: e.g. 'after feature X is deployed', 'before release', '2026-06-01', or a condition",
      }),
      required_files: Type.Array(Type.String(), {
        description: "Files that must exist or be read to fulfill this obligation",
      }),
      required_commands: Type.Array(Type.String(), {
        description: "Commands to run as part of fulfilling this obligation",
      }),
      success_criteria: Type.String({
        description: "How to determine this obligation has been successfully fulfilled",
      }),
      priority: StringEnum(["high", "medium", "low"] as const, {
        description: "Priority: high = must not be forgotten, medium = important, low = nice-to-have",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!piDir) {
        return { content: [{ type: "text", text: "Agenda directory not initialized" }], isError: true };
      }
      const id = `${Date.now()}-${generateId()}`;
      const item: AgendaItem = {
        id,
        obligation: params.obligation,
        trigger: params.trigger,
        required_files: params.required_files,
        required_commands: params.required_commands,
        success_criteria: params.success_criteria,
        priority: params.priority,
        status: "open",
        created_at: new Date().toISOString(),
      };
      const fp = agendaFilePath(piDir);
      fs.appendFileSync(fp, JSON.stringify(item) + "\n", "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `Agenda item added: id=${id}\n  Obligation: ${item.obligation}\n  Trigger: ${item.trigger}\n  Priority: ${item.priority}`,
          },
        ],
        details: item,
      };
    },
  });

  // ─── Tool: agenda_check ───────────────────────────────────────────────────
  pi.registerTool({
    name: "agenda_check",
    label: "Agenda Check",
    description: "Return all open agenda obligations, sorted by priority and overdue status.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!piDir) {
        return { content: [{ type: "text", text: "Agenda directory not initialized" }], isError: true };
      }
      const fp = agendaFilePath(piDir);
      const all = readAllItems(fp);
      const open = all.filter((i) => i.status === "open");
      if (open.length === 0) {
        return { content: [{ type: "text", text: "No open agenda obligations." }], details: { items: [] } };
      }
      // Sort: overdue first, then by priority
      const priorityOrder: Record<AgendaPriority, number> = { high: 0, medium: 1, low: 2 };
      open.sort((a, b) => {
        const aOverdue = isOverdue(a) ? -1 : 0;
        const bOverdue = isOverdue(b) ? -1 : 0;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      const formatted = open.map((item) => {
        const overdueTag = isOverdue(item) ? " [OVERDUE]" : "";
        return (
          `id=${item.id}${overdueTag}\n` +
          `  Priority: ${item.priority}\n` +
          `  Obligation: ${item.obligation}\n` +
          `  Trigger: ${item.trigger}\n` +
          `  Success criteria: ${item.success_criteria}`
        );
      });
      return {
        content: [{ type: "text", text: `${open.length} open obligation(s):\n\n${formatted.join("\n\n")}` }],
        details: { items: open },
      };
    },
  });

  // ─── Tool: agenda_complete ────────────────────────────────────────────────
  pi.registerTool({
    name: "agenda_complete",
    label: "Agenda Complete",
    description: "Mark an agenda obligation as completed with an outcome description.",
    parameters: Type.Object({
      id: Type.String({ description: "Agenda item ID to mark complete" }),
      outcome: Type.String({ description: "Description of what was done and the result" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!piDir) {
        return { content: [{ type: "text", text: "Agenda directory not initialized" }], isError: true };
      }
      const fp = agendaFilePath(piDir);
      const all = readAllItems(fp);
      const idx = all.findIndex((i) => i.id === params.id);
      if (idx < 0) {
        return { content: [{ type: "text", text: `Agenda item not found: ${params.id}` }], isError: true };
      }
      all[idx] = {
        ...all[idx],
        status: "completed",
        completed_at: new Date().toISOString(),
        outcome: params.outcome,
      };
      rewriteAllItems(fp, all);
      return {
        content: [
          {
            type: "text",
            text: `Agenda item completed: id=${params.id}\nOutcome: ${params.outcome}`,
          },
        ],
        details: all[idx],
      };
    },
  });

  // ─── /agenda: show open obligations ───────────────────────────────────────
  pi.registerCommand("agenda", {
    description: "Show current open agenda obligations",
    handler: async (_args, ctx) => {
      if (!piDir) {
        ctx.ui.notify("Agenda not initialized", "error");
        return;
      }
      const fp = agendaFilePath(piDir);
      const all = readAllItems(fp);
      const open = all.filter((i) => i.status === "open");
      const completed = all.filter((i) => i.status === "completed").length;
      if (open.length === 0) {
        ctx.ui.notify(`No open obligations (${completed} completed).`, "info");
        return;
      }
      const lines = open.map((item, i) => {
        const overdueTag = isOverdue(item) ? " ⚠ OVERDUE" : "";
        return `${i + 1}. [${item.priority.toUpperCase()}]${overdueTag} ${item.obligation}\n   Trigger: ${item.trigger}`;
      });
      ctx.ui.notify(
        `${open.length} open obligation(s) (${completed} completed):\n\n${lines.join("\n\n")}`,
        "info",
      );
    },
  });
}
