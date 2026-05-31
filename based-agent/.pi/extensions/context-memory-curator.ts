/**
 * context-memory-curator.ts
 *
 * Deterministic context intelligence layer for persistent agent memory.
 * Provides write-time style dedupe, sensitivity tagging, conflict detection,
 * and hierarchical decay without LLM calls.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

type Sensitivity = "public" | "internal" | "secret";
type DecayTier = "hot" | "warm" | "cold" | "expired";

interface MemoryRecord {
  id: string;
  file: string;
  hash: string;
  bytes: number;
  sensitivity: Sensitivity;
  decay_tier: DecayTier;
  duplicate_of?: string;
  conflict_keys: string[];
  updated_at: string;
}

interface ContextIndex {
  generated_at: string;
  records: MemoryRecord[];
  duplicates: Array<{ file: string; duplicate_of: string }>;
  conflicts: Array<{ key: string; files: string[] }>;
  sensitive_files: string[];
}

const MEMORY_DIR = ".pi/memory";
const INDEX_FILE = ".pi/memory/context-index.json";

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(fp));
    else if (!e.name.endsWith("context-index.json")) out.push(fp);
  }
  return out;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function sensitivityOf(text: string): Sensitivity {
  if (/(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]/i.test(text)) return "secret";
  if (/(customer|credential|proprietary|internal only|confidential)/i.test(text)) return "internal";
  return "public";
}

function decayTier(file: string, text: string): DecayTier {
  const ageMs = Date.now() - fs.statSync(file).mtimeMs;
  const days = ageMs / 86400000;
  if (/pinned|canonical|contract|do not decay/i.test(text)) return "hot";
  if (days <= 7) return "hot";
  if (days <= 30) return "warm";
  if (days <= 90) return "cold";
  return "expired";
}

function conflictKeys(text: string): string[] {
  const keys = new Set<string>();
  const patterns: Array<[RegExp, string]> = [
    [/\b(use|prefer|require)\s+typescript\b/i, "typescript-policy"],
    [/\b(do not|avoid|never)\s+use\s+typescript\b/i, "typescript-policy"],
    [/\b(always|must)\s+run\s+tests\b/i, "test-policy"],
    [/\b(skip|avoid)\s+tests\b/i, "test-policy"],
    [/\bnever\s+use\s+git\s+stash\b/i, "git-stash-policy"],
    [/\buse\s+git\s+stash\b/i, "git-stash-policy"]
  ];
  for (const [re, key] of patterns) if (re.test(text)) keys.add(key);
  return [...keys];
}

function curate(root: string): ContextIndex {
  const memoryRoot = path.join(root, MEMORY_DIR);
  fs.mkdirSync(memoryRoot, { recursive: true });
  const files = walk(memoryRoot);
  const seen = new Map<string, string>();
  const records: MemoryRecord[] = [];
  const duplicates: Array<{ file: string; duplicate_of: string }> = [];
  const conflictsByKey = new Map<string, string[]>();

  for (const fp of files) {
    const text = fs.readFileSync(fp, "utf-8");
    const rel = path.relative(root, fp).replace(/\\/g, "/");
    const hash = sha256(normalize(text));
    const duplicate_of = seen.get(hash);
    if (!duplicate_of) seen.set(hash, rel);
    else duplicates.push({ file: rel, duplicate_of });

    const keys = conflictKeys(text);
    for (const key of keys) conflictsByKey.set(key, [...(conflictsByKey.get(key) || []), rel]);

    records.push({
      id: sha256(rel).slice(0, 12),
      file: rel,
      hash,
      bytes: Buffer.byteLength(text),
      sensitivity: sensitivityOf(text),
      decay_tier: decayTier(fp, text),
      duplicate_of,
      conflict_keys: keys,
      updated_at: fs.statSync(fp).mtime.toISOString()
    });
  }

  const conflicts = [...conflictsByKey.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({ key, files }));

  return {
    generated_at: new Date().toISOString(),
    records,
    duplicates,
    conflicts,
    sensitive_files: records.filter((r) => r.sensitivity !== "public").map((r) => r.file)
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("memory-curate", {
    description: "Build .pi/memory/context-index.json with dedupe, sensitivity, conflict, and decay metadata.",
    handler: async (_args, ctx) => {
      const index = curate(ctx.cwd);
      const out = path.join(ctx.cwd, INDEX_FILE);
      fs.writeFileSync(out, JSON.stringify(index, null, 2));
      return ctx.ui.notify(
        `memory curated\n- records: ${index.records.length}\n- duplicates: ${index.duplicates.length}\n- conflicts: ${index.conflicts.length}\n- sensitive: ${index.sensitive_files.length}`,
        index.conflicts.length || index.sensitive_files.length ? "warning" : "info"
      );
    }
  });
}
