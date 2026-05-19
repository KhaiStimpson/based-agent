/**
 * memory-slicer.ts
 *
 * Retrieve and compress relevant context from .pi/memory/ for agents.
 * Scores memory items by keyword overlap, recency, and salience.
 *
 * Research basis: AgentSpawn memory slicing; SEMA context pruning.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryItem {
  id?: string;
  type?: string;
  content?: string;
  scope?: string;
  status?: string;
  salience?: string;
  confidence?: string;
  created_at?: string;
  last_validated_at?: string;
  source?: string;
  [key: string]: unknown;
}

// Salience → base score
const SALIENCE_SCORES: Record<string, number> = {
  "future-critical": 1.0,
  constraint: 0.9,
  "failure-linked": 0.8,
  "validation-linked": 0.7,
  preference: 0.5,
  novel: 0.4,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function keywordOverlap(taskTokens: Set<string>, content: string): number {
  if (!content) return 0;
  const contentTokens = tokenize(content);
  let matches = 0;
  for (const t of taskTokens) {
    if (contentTokens.has(t)) matches++;
  }
  return taskTokens.size > 0 ? matches / taskTokens.size : 0;
}

function recencyScore(createdAt: string | undefined): number {
  if (!createdAt) return 0.3;
  try {
    const age = Date.now() - new Date(createdAt).getTime();
    const ageDays = age / (1000 * 60 * 60 * 24);
    // Decay: 1.0 for today, 0.5 for 7 days, 0.1 for 30 days
    return Math.max(0.05, Math.exp(-ageDays / 14));
  } catch {
    return 0.3;
  }
}

function scoreItem(item: MemoryItem, taskTokens: Set<string>): number {
  const overlap = keywordOverlap(taskTokens, item.content ?? JSON.stringify(item));
  const recency = recencyScore(item.created_at);
  const salience = SALIENCE_SCORES[item.salience ?? ""] ?? 0.3;
  const statusPenalty = item.status === "deprecated" || item.status === "contradicted" ? -0.5 : 0;
  return overlap * 0.5 + recency * 0.2 + salience * 0.3 + statusPenalty;
}

function readAllMemoryItems(memoryDir: string, typeFilter?: string[]): MemoryItem[] {
  const items: MemoryItem[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Subdirectory corresponds to a memory type
        if (typeFilter && !typeFilter.includes(entry.name)) continue;
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        try {
          if (ext === ".json") {
            const raw = fs.readFileSync(fullPath, "utf-8");
            const parsed = JSON.parse(raw) as MemoryItem;
            if (!parsed.type) {
              // Infer type from parent directory name
              parsed.type = path.basename(path.dirname(fullPath));
            }
            items.push(parsed);
          } else if (ext === ".jsonl") {
            const lines = fs.readFileSync(fullPath, "utf-8").trim().split("\n");
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line) as MemoryItem;
                if (!parsed.type) parsed.type = path.basename(fullPath, ".jsonl");
                items.push(parsed);
              } catch {
                // skip malformed lines
              }
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  scanDir(memoryDir);
  return items;
}

function compressItems(items: MemoryItem[], maxItems: number): string {
  const top = items.slice(0, maxItems);
  return top
    .map((item, i) => {
      const type = item.type ?? "unknown";
      const salience = item.salience ?? "?";
      const status = item.status ?? "?";
      const content = typeof item.content === "string" ? item.content.slice(0, 300) : JSON.stringify(item).slice(0, 300);
      return `[${i + 1}] type=${type} salience=${salience} status=${status}\n${content}`;
    })
    .join("\n\n");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let memoryDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    memoryDir = path.join(ctx.cwd, ".pi", "memory");
    fs.mkdirSync(memoryDir, { recursive: true });
  });

  // ─── Tool: slice_memory ────────────────────────────────────────────────────
  pi.registerTool({
    name: "slice_memory",
    label: "Slice Memory",
    description:
      "Retrieve and compress relevant context from .pi/memory/ for a given task. " +
      "Scores items by keyword overlap, recency, and salience. " +
      "Returns the top-N most relevant items as compressed context. " +
      "Use this before starting a complex task to retrieve relevant prior knowledge.",
    parameters: Type.Object({
      task: Type.String({
        description: "Task description — used to score memory relevance by keyword overlap",
      }),
      max_items: Type.Optional(
        Type.Number({ description: "Maximum memory items to return (default: 10)", default: 10 }),
      ),
      types: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Filter by memory types: fact, decision, skill, heuristic, episode, reminder, negative_lesson. Empty = all.",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!memoryDir) {
        return { content: [{ type: "text", text: "Memory directory not initialized" }], isError: true };
      }

      const maxItems = params.max_items ?? 10;
      const typeFilter = params.types && params.types.length > 0 ? params.types : undefined;
      const allItems = readAllMemoryItems(memoryDir, typeFilter);

      if (allItems.length === 0) {
        return {
          content: [{ type: "text", text: "No memory items found. Memory store is empty." }],
          details: { items_found: 0, items_returned: 0 },
        };
      }

      const taskTokens = tokenize(params.task);
      const scored = allItems
        .map((item) => ({ item, score: scoreItem(item, taskTokens) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);

      const topItems = scored.slice(0, maxItems).map((x) => x.item);
      const compressed = compressItems(topItems, maxItems);

      return {
        content: [
          {
            type: "text",
            text:
              `Found ${allItems.length} total items; returning top ${topItems.length} by relevance.\n\n` +
              `## Relevant Memory Context\n\n${compressed}`,
          },
        ],
        details: {
          items_found: allItems.length,
          items_returned: topItems.length,
          type_filter: typeFilter ?? "all",
        },
      };
    },
  });

  // ─── /memory-search: search by keyword ────────────────────────────────────
  pi.registerCommand("memory-search", {
    description: "Search memory items by keyword. Usage: /memory-search <keyword>",
    handler: async (args, ctx) => {
      if (!memoryDir) {
        ctx.ui.notify("Memory directory not initialized", "error");
        return;
      }
      const keyword = args.trim();
      if (!keyword) {
        ctx.ui.notify("Usage: /memory-search <keyword>", "info");
        return;
      }
      const all = readAllMemoryItems(memoryDir);
      const tokens = tokenize(keyword);
      const matches = all
        .filter((item) => keywordOverlap(tokens, item.content ?? JSON.stringify(item)) > 0)
        .slice(0, 10);
      if (matches.length === 0) {
        ctx.ui.notify(`No memory items match '${keyword}'`, "info");
        return;
      }
      const lines = matches.map((item, i) => {
        const content = (item.content ?? JSON.stringify(item)).slice(0, 100);
        return `${i + 1}. [${item.type ?? "?"}/${item.salience ?? "?"}] ${content}`;
      });
      ctx.ui.notify(`${matches.length} matches for '${keyword}':\n${lines.join("\n")}`, "info");
    },
  });

  // ─── /memory-stats: show counts by type ───────────────────────────────────
  pi.registerCommand("memory-stats", {
    description: "Show memory item counts by type",
    handler: async (_args, ctx) => {
      if (!memoryDir) {
        ctx.ui.notify("Memory directory not initialized", "error");
        return;
      }
      const all = readAllMemoryItems(memoryDir);
      const counts: Record<string, number> = {};
      for (const item of all) {
        const t = item.type ?? "unknown";
        counts[t] = (counts[t] ?? 0) + 1;
      }
      const lines = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `  ${t}: ${n}`);
      ctx.ui.notify(
        `Memory stats (${all.length} total items):\n${lines.length > 0 ? lines.join("\n") : "  (empty)"}`,
        "info",
      );
    },
  });
}
