/**
 * memory-provenance-tracer.ts
 *
 * Traces memory reads/writes as first-class events so stale or misleading
 * memory can be attributed to later failures. The trace is intentionally
 * model/provider-agnostic and append-only.
 *
 * Research basis: MemTrace; Personal Visual Memory from Explicit and Implicit
 * Evidence; Human Label Variation as Stable Signal.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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


type MemoryEventKind = "read" | "write" | "update" | "delete" | "slice";
type EvidenceKind = "explicit" | "implicit" | "inferred" | "unknown";


interface MemoryTraceEvent {
  id: string;
  run_id: string;
  timestamp: string;
  kind: MemoryEventKind;
  tool_name: string;
  agent?: string;
  memory_id?: string;
  content_hash?: string;
  evidence_kind: EvidenceKind;
  evidence_ref?: string;
  query_hash?: string;
  consumer_goal?: string;
  confidence?: number;
  raw_keys: string[];
}

interface MemoryAttributionStub {
  id: string;
  run_id: string;
  timestamp: string;
  suspected_memory_event_ids: string[];
  failure_signal: string;
  attribution_status: "open" | "confirmed" | "rejected";
  notes: string;
}

const MEMORY_TOOL_PATTERNS = [/memory/i, /remember/i, /recall/i, /retrieve/i, /rag/i, /context/i];

let piDir: string | null = null;
let runId = "unknown";
let recentEvents: MemoryTraceEvent[] = [];

function id(): string {
  return crypto.randomBytes(6).toString("hex");
}

function sha(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function traceDir(): string | null {
  if (!piDir) return null;
  const d = path.join(piDir, "memory-traces", new Date().toISOString().slice(0, 10));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function appendJsonl(file: string, obj: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, "utf-8");
}

function looksLikeMemoryTool(toolName: string): boolean {
  return MEMORY_TOOL_PATTERNS.some((p) => p.test(toolName));
}

function classifyKind(toolName: string, input: Record<string, unknown>): MemoryEventKind {
  const s = `${toolName} ${Object.keys(input).join(" ")}`.toLowerCase();
  if (/delete|remove|forget/.test(s)) return "delete";
  if (/update|patch|curate/.test(s)) return "update";
  if (/slice|spawn/.test(s)) return "slice";
  if (/write|store|remember|save|insert/.test(s)) return "write";
  return "read";
}

function classifyEvidence(input: Record<string, unknown>): EvidenceKind {
  const text = JSON.stringify(input).toLowerCase();
  if (/explicit|user said|user stated|direct evidence|source:/.test(text)) return "explicit";
  if (/implicit|observed|inferred from behavior|usage pattern/.test(text)) return "implicit";
  if (/infer|likely|probably|assume|hypothesis/.test(text)) return "inferred";
  return "unknown";
}

function pickString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function confidenceFor(evidence: EvidenceKind): number {
  if (evidence === "explicit") return 0.9;
  if (evidence === "implicit") return 0.65;
  if (evidence === "inferred") return 0.45;
  return 0.5;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    piDir = PACKAGE_PI_DIR;
    runId = String((event as any)?.runId ?? (event as any)?.sessionId ?? id());
    recentEvents = [];
  });

  pi.on("tool_call", async (event) => {
    if (!looksLikeMemoryTool(event.toolName)) return;
    const d = traceDir();
    if (!d) return;

    const input = ((event as any).input ?? (event as any).args ?? {}) as Record<string, unknown>;
    const evidenceKind = classifyEvidence(input);
    const kind = classifyKind(event.toolName, input);
    const content = input.content ?? input.text ?? input.memory ?? input.value ?? input.items;
    const query = input.query ?? input.prompt ?? input.search ?? input.keywords;

    const traceEvent: MemoryTraceEvent = {
      id: id(),
      run_id: runId,
      timestamp: new Date().toISOString(),
      kind,
      tool_name: event.toolName,
      agent: String((event as any).agent ?? (event as any).agentName ?? "" ) || undefined,
      memory_id: pickString(input, ["memory_id", "memoryId", "id", "key"]),
      content_hash: content === undefined ? undefined : sha(content),
      evidence_kind: evidenceKind,
      evidence_ref: pickString(input, ["source", "source_url", "file", "trace_ref"]),
      query_hash: query === undefined ? undefined : sha(query),
      consumer_goal: pickString(input, ["goal", "task", "reason", "consumer_goal"]),
      confidence: confidenceFor(evidenceKind),
      raw_keys: Object.keys(input).sort()
    };

    recentEvents.push(traceEvent);
    recentEvents = recentEvents.slice(-200);
    appendJsonl(path.join(d, `${runId}-memory-events.jsonl`), traceEvent);
  });

  pi.on("agent_end", async (event) => {
    const d = traceDir();
    if (!d || recentEvents.length === 0) return;

    const text = JSON.stringify(event).toLowerCase();
    const failed = /fail|error|timeout|rollback|reject|stale_memory|context_miss/.test(text);
    if (!failed) return;

    const suspects = recentEvents
      .filter((e) => e.kind === "read" || e.kind === "slice")
      .filter((e) => e.evidence_kind !== "explicit" || (e.confidence ?? 0) < 0.7)
      .slice(-10)
      .map((e) => e.id);

    if (suspects.length === 0) return;

    const stub: MemoryAttributionStub = {
      id: id(),
      run_id: runId,
      timestamp: new Date().toISOString(),
      suspected_memory_event_ids: suspects,
      failure_signal: "agent_end contained failure-like signal after uncertain memory reads/slices",
      attribution_status: "open",
      notes: "Route to failure-attributor before promoting memory, skill, or prompt changes."
    };

    fs.writeFileSync(path.join(d, `${runId}-memory-attribution-open.json`), JSON.stringify(stub, null, 2));
  });
}
