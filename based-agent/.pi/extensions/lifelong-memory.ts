/**
 * lifelong-memory.ts
 *
 * CRUD operations on typed memory items with salience, scope, provenance,
 * and status lifecycle. On turn start, injects high-salience active memories.
 *
 * Research basis: ELL/StuLife — typed memory with skill lifecycle;
 *                 SEMA — curated context over raw transcripts.
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

type MemoryType = "fact" | "decision" | "skill" | "heuristic" | "episode" | "reminder" | "negative_lesson";
type MemoryScope = "repo" | "project" | "user" | "global";
type MemoryStatus = "provisional" | "validated" | "deprecated" | "contradicted";
type MemorySalience = "novel" | "constraint" | "future-critical" | "failure-linked" | "preference" | "validation-linked";
type MemoryConfidence = "low" | "medium" | "high";

interface MemoryItem {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  status: MemoryStatus;
  source: string;
  salience: MemorySalience;
  content: string;
  confidence: MemoryConfidence;
  created_at: string;
  last_validated_at: string;
  metadata?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function memoryFilePath(memoryDir: string, type: MemoryType, id: string): string {
  const typeDir = path.join(memoryDir, type);
  fs.mkdirSync(typeDir, { recursive: true });
  return path.join(typeDir, `${id}.json`);
}

function readMemoryItem(filePath: string): MemoryItem | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MemoryItem;
  } catch {
    return null;
  }
}

function writeMemoryItem(filePath: string, item: MemoryItem): void {
  fs.writeFileSync(filePath, JSON.stringify(item, null, 2), "utf-8");
}

function findMemoryById(memoryDir: string, id: string): { item: MemoryItem; filePath: string } | null {
  const typeNames: MemoryType[] = [
    "fact", "decision", "skill", "heuristic", "episode", "reminder", "negative_lesson",
  ];
  for (const type of typeNames) {
    const fp = path.join(memoryDir, type, `${id}.json`);
    if (fs.existsSync(fp)) {
      const item = readMemoryItem(fp);
      if (item) return { item, filePath: fp };
    }
  }
  return null;
}

function scanAllMemory(memoryDir: string): MemoryItem[] {
  const items: MemoryItem[] = [];
  if (!fs.existsSync(memoryDir)) return items;

  const entries = fs.readdirSync(memoryDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const typeDir = path.join(memoryDir, entry.name);
    const files = fs.readdirSync(typeDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const item = readMemoryItem(path.join(typeDir, file));
      if (item) items.push(item);
    }
  }
  return items;
}

function formatHighSalienceMemories(items: MemoryItem[]): string {
  return items
    .map((item) => {
      const header = `[${item.type.toUpperCase()} / ${item.salience} / ${item.confidence}]`;
      return `${header}\n${item.content}`;
    })
    .join("\n\n");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let memoryDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    memoryDir = path.join(PACKAGE_PI_DIR, "memory");
    fs.mkdirSync(memoryDir, { recursive: true });
  });

  // ─── Inject high-salience memories before each agent turn ────────────────
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!memoryDir) return undefined;

    try {
      const all = scanAllMemory(memoryDir);
      const highPriority = all.filter(
        (item) =>
          item.status !== "deprecated" &&
          item.status !== "contradicted" &&
          (item.salience === "future-critical" || item.salience === "constraint"),
      );

      if (highPriority.length === 0) return undefined;

      const content = formatHighSalienceMemories(highPriority);
      return {
        message: {
          customType: "lifelong-memory-injection",
          content: `## High-Priority Memory Context\n\nThe following memories are marked as critical constraints or future obligations:\n\n${content}`,
          display: true,
        },
      };
    } catch {
      return undefined;
    }
  });

  // ─── Tool: memory_add ─────────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_add",
    label: "Memory Add",
    description:
      "Add a new typed memory item to .pi/memory/. Use this to preserve facts, decisions, " +
      "lessons, skills, or future obligations with salience and provenance metadata.",
    parameters: Type.Object({
      type: StringEnum(
        ["fact", "decision", "skill", "heuristic", "episode", "reminder", "negative_lesson"] as const,
        { description: "Memory type" },
      ),
      content: Type.String({ description: "Memory content — the actual knowledge to preserve" }),
      scope: StringEnum(["repo", "project", "user", "global"] as const, {
        description: "Scope of this memory",
      }),
      salience: StringEnum(
        ["novel", "constraint", "future-critical", "failure-linked", "preference", "validation-linked"] as const,
        { description: "Salience level — determines injection priority and retrieval weight" },
      ),
      source: Type.String({ description: "Where this memory came from: file path, command, user, episode ID, etc." }),
      confidence: StringEnum(["low", "medium", "high"] as const, {
        description: "Confidence in this memory's accuracy",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!memoryDir) {
        return { content: [{ type: "text", text: "Memory directory not initialized" }], isError: true };
      }
      const id = `${Date.now()}-${generateId()}`;
      const now = new Date().toISOString();
      const item: MemoryItem = {
        id,
        type: params.type,
        scope: params.scope,
        status: "provisional",
        source: params.source,
        salience: params.salience,
        content: params.content,
        confidence: params.confidence,
        created_at: now,
        last_validated_at: now,
      };
      const fp = memoryFilePath(memoryDir, params.type, id);
      writeMemoryItem(fp, item);
      return {
        content: [{ type: "text", text: `Memory added: id=${id} type=${params.type} salience=${params.salience}` }],
        details: item,
      };
    },
  });

  // ─── Tool: memory_update ──────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_update",
    label: "Memory Update",
    description: "Update an existing memory item by ID. Provide any fields to change.",
    parameters: Type.Object({
      id: Type.String({ description: "Memory item ID to update" }),
      updates: Type.Object(
        {
          content: Type.Optional(Type.String()),
          status: Type.Optional(
            StringEnum(["provisional", "validated", "deprecated", "contradicted"] as const),
          ),
          salience: Type.Optional(
            StringEnum(["novel", "constraint", "future-critical", "failure-linked", "preference", "validation-linked"] as const),
          ),
          confidence: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
        },
        { description: "Fields to update" },
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!memoryDir) {
        return { content: [{ type: "text", text: "Memory directory not initialized" }], isError: true };
      }
      const found = findMemoryById(memoryDir, params.id);
      if (!found) {
        return {
          content: [{ type: "text", text: `Memory item not found: ${params.id}` }],
          isError: true,
        };
      }
      const updated: MemoryItem = {
        ...found.item,
        ...params.updates,
        last_validated_at: new Date().toISOString(),
      };
      writeMemoryItem(found.filePath, updated);
      return {
        content: [{ type: "text", text: `Memory updated: id=${params.id}` }],
        details: updated,
      };
    },
  });

  // ─── Tool: memory_deprecate ───────────────────────────────────────────────
  pi.registerTool({
    name: "memory_deprecate",
    label: "Memory Deprecate",
    description: "Mark a memory item as deprecated (soft delete with reason). Preferred over deletion.",
    parameters: Type.Object({
      id: Type.String({ description: "Memory item ID to deprecate" }),
      reason: Type.String({ description: "Why this memory is no longer valid or relevant" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!memoryDir) {
        return { content: [{ type: "text", text: "Memory directory not initialized" }], isError: true };
      }
      const found = findMemoryById(memoryDir, params.id);
      if (!found) {
        return { content: [{ type: "text", text: `Memory item not found: ${params.id}` }], isError: true };
      }
      const updated: MemoryItem = {
        ...found.item,
        status: "deprecated",
        metadata: { ...found.item.metadata, deprecation_reason: params.reason },
        last_validated_at: new Date().toISOString(),
      };
      writeMemoryItem(found.filePath, updated);
      return {
        content: [{ type: "text", text: `Memory deprecated: id=${params.id} reason="${params.reason}"` }],
        details: updated,
      };
    },
  });

  // ─── Tool: memory_query ───────────────────────────────────────────────────
  pi.registerTool({
    name: "memory_query",
    label: "Memory Query",
    description: "Search memory items by keyword query, optional type filter, and optional status filter.",
    parameters: Type.Object({
      query: Type.String({ description: "Search keywords" }),
      type: Type.Optional(
        Type.String({ description: "Filter by type: fact, decision, skill, heuristic, episode, reminder, negative_lesson" }),
      ),
      status: Type.Optional(
        Type.String({ description: "Filter by status: provisional, validated, deprecated, contradicted" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!memoryDir) {
        return { content: [{ type: "text", text: "Memory directory not initialized" }], isError: true };
      }
      const all = scanAllMemory(memoryDir);
      const q = params.query.toLowerCase();
      const results = all.filter((item) => {
        if (params.type && item.type !== params.type) return false;
        if (params.status && item.status !== params.status) return false;
        const text = (item.content + " " + (item.source ?? "")).toLowerCase();
        return text.includes(q);
      });
      if (results.length === 0) {
        return { content: [{ type: "text", text: `No memory items match '${params.query}'` }] };
      }
      const formatted = results
        .slice(0, 20)
        .map((item) => `id=${item.id} type=${item.type} salience=${item.salience} status=${item.status}\n${item.content.slice(0, 200)}`)
        .join("\n\n---\n\n");
      return {
        content: [{ type: "text", text: `${results.length} result(s):\n\n${formatted}` }],
        details: { count: results.length, items: results.slice(0, 20) },
      };
    },
  });

  // ─── /memory-add: quick CLI memory addition ───────────────────────────────
  pi.registerCommand("memory-add", {
    description: "Quick-add a memory item. Usage: /memory-add <content>",
    handler: async (args, ctx) => {
      const content = args.trim();
      if (!content || !memoryDir) {
        ctx.ui.notify("Usage: /memory-add <content>", "info");
        return;
      }
      const id = `${Date.now()}-${generateId()}`;
      const now = new Date().toISOString();
      const item: MemoryItem = {
        id,
        type: "fact",
        scope: "repo",
        status: "provisional",
        source: "user-command",
        salience: "novel",
        content,
        confidence: "medium",
        created_at: now,
        last_validated_at: now,
      };
      const fp = memoryFilePath(memoryDir, "fact", id);
      writeMemoryItem(fp, item);
      ctx.ui.notify(`Memory added: id=${id}\n${content.slice(0, 80)}`, "info");
    },
  });
}
