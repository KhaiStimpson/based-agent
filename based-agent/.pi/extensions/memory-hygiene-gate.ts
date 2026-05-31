/**
 * memory-hygiene-gate.ts
 *
 * Filters long-term memory before it is reused by agents. The gate reduces
 * redundant context, flags likely contamination, and quarantines unstable or
 * contradictory memories instead of letting them silently bias future runs.
 *
 * Research basis:
 * - MGRetrieval: reflective retrieval should avoid redundant memory context.
 * - MemGuard: long-term memories need contamination prevention.
 * - Cross-Chunk GraphRAG: useful evidence often spans files/chunks, so report
 *   cross-file links rather than isolated snippets only.
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


type MemoryRisk = "duplicate" | "contradiction" | "unstable" | "stale";


interface MemoryItem {
  id: string;
  file: string;
  text: string;
  normalized: string;
  hash: string;
  mtimeMs: number;
  risk: MemoryRisk[];
}

interface HygieneReport {
  generated_at: string;
  files_scanned: number;
  memories_scanned: number;
  selected_context: Array<Pick<MemoryItem, "id" | "file" | "text" | "risk">>;
  quarantined: Array<Pick<MemoryItem, "id" | "file" | "risk">>;
  duplicate_groups: string[][];
  contradiction_pairs: Array<[string, string, string]>;
  guidance: string[];
}

const MAX_SELECTED = 24;
const MAX_TEXT = 1200;
const MEMORY_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt"]);

const CONTRADICTION_PATTERNS: Array<[RegExp, RegExp, string]> = [
  [/\btests?\s+pass(?:ed|ing)?\b/i, /\btests?\s+fail(?:ed|ing)?\b/i, "test outcome conflict"],
  [/\bbuild\s+pass(?:ed|ing)?\b/i, /\bbuild\s+fail(?:ed|ing)?\b/i, "build outcome conflict"],
  [/\bimplemented\b/i, /\bnot\s+implemented\b/i, "implementation status conflict"],
  [/\buse\s+([\w.-]+)\b/i, /\bavoid\s+([\w.-]+)\b/i, "use/avoid directive conflict"],
  [/\bstable\b/i, /\bexperimental\b|\bunstable\b/i, "stability conflict"]
];

function sha(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_#>\-[\]{}()]/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}(t[^\s]+)?\b/g, " <date> ")
    .replace(/\s+/g, " ")
    .trim();
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "quarantine") continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fp, out);
    else if (MEMORY_EXTENSIONS.has(path.extname(entry.name))) out.push(fp);
  }
  return out;
}

function extractItems(memoryDir: string): MemoryItem[] {
  const files = walk(memoryDir);
  const items: MemoryItem[] = [];

  for (const file of files) {
    let raw = "";
    try {
      raw = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const rel = path.relative(memoryDir, file);
    const stat = fs.statSync(file);
    const chunks = raw
      .split(/\n\s*\n|\n(?=#+\s+)/g)
      .map((s) => s.trim())
      .filter((s) => s.length >= 40)
      .slice(0, 80);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i].slice(0, MAX_TEXT);
      const normalized = normalize(text);
      items.push({
        id: sha(`${rel}:${i}:${normalized}`),
        file: rel,
        text,
        normalized,
        hash: sha(normalized),
        mtimeMs: stat.mtimeMs,
        risk: []
      });
    }
  }
  return items;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(/\W+/).filter((t) => t.length > 3));
}

function jaccard(a: string, b: string): number {
  const as = tokenSet(a);
  const bs = tokenSet(b);
  let inter = 0;
  for (const t of as) if (bs.has(t)) inter++;
  return inter / Math.max(1, as.size + bs.size - inter);
}

function analyze(items: MemoryItem[]): HygieneReport {
  const duplicateGroups: string[][] = [];
  const contradictionPairs: Array<[string, string, string]> = [];
  const byHash = new Map<string, MemoryItem[]>();
  const now = Date.now();

  for (const item of items) {
    if (/\bmaybe\b|\bpossibly\b|\buntested\b|\bassumption\b|\bhypothesis\b/i.test(item.text)) {
      item.risk.push("unstable");
    }
    if (now - item.mtimeMs > 1000 * 60 * 60 * 24 * 90) {
      item.risk.push("stale");
    }
    const arr = byHash.get(item.hash) ?? [];
    arr.push(item);
    byHash.set(item.hash, arr);
  }

  for (const group of byHash.values()) {
    if (group.length > 1) {
      duplicateGroups.push(group.map((x) => x.id));
      for (const item of group.slice(1)) item.risk.push("duplicate");
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < Math.min(items.length, i + 160); j++) {
      const a = items[i];
      const b = items[j];
      if (a.file === b.file && jaccard(a.normalized, b.normalized) < 0.25) continue;
      for (const [pa, pb, reason] of CONTRADICTION_PATTERNS) {
        if ((pa.test(a.text) && pb.test(b.text)) || (pb.test(a.text) && pa.test(b.text))) {
          a.risk.push("contradiction");
          b.risk.push("contradiction");
          contradictionPairs.push([a.id, b.id, reason]);
          break;
        }
      }
    }
  }

  const quarantined = items.filter((x) => x.risk.includes("contradiction") || x.risk.includes("unstable"));
  const selected = items
    .filter((x) => !x.risk.includes("duplicate") && !x.risk.includes("contradiction") && !x.risk.includes("unstable"))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SELECTED);

  return {
    generated_at: new Date().toISOString(),
    files_scanned: new Set(items.map((x) => x.file)).size,
    memories_scanned: items.length,
    selected_context: selected.map(({ id, file, text, risk }) => ({ id, file, text, risk })),
    quarantined: quarantined.map(({ id, file, risk }) => ({ id, file, risk })),
    duplicate_groups: duplicateGroups,
    contradiction_pairs: contradictionPairs.slice(0, 100),
    guidance: [
      "Prefer selected_context over raw memory dumps.",
      "Do not treat quarantined memories as facts until memory-curator resolves them.",
      "When selected memories disagree with repo state, repo state wins."
    ]
  };
}

function writeQuarantineIndex(memoryDir: string, report: HygieneReport): void {
  const quarantineDir = path.join(memoryDir, "quarantine");
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.writeFileSync(path.join(quarantineDir, "index.json"), JSON.stringify(report.quarantined, null, 2));
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const memoryDir = path.join(PACKAGE_PI_DIR, "memory");
    fs.mkdirSync(memoryDir, { recursive: true });
    const items = extractItems(memoryDir);
    const report = analyze(items);
    fs.writeFileSync(path.join(memoryDir, "hygiene-report.json"), JSON.stringify(report, null, 2));
    writeQuarantineIndex(memoryDir, report);

    if (report.quarantined.length > 0 || report.duplicate_groups.length > 0) {
      ctx.ui.notify(
        `Memory hygiene gate flagged ${report.quarantined.length} risky and ${report.duplicate_groups.length} duplicate memory groups. See .pi/memory/hygiene-report.json.`,
        "warning",
      );
    }
  });
}
