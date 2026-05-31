/** Build compressed, role-aware context packs for spawned agents. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface IndexedRecord {
  file: string;
  sensitivity: "public" | "internal" | "secret";
  decay_tier: "hot" | "warm" | "cold" | "expired";
  duplicate_of?: string;
  bytes: number;
}

const ROLE_HINTS: Record<string, RegExp> = {
  planner: /(plan|architecture|contract|agents|workflow|topology)/i,
  builder: /(implementation|code|api|typescript|patch|build)/i,
  reviewer: /(risk|review|policy|safety|conflict|validation)/i,
  tester: /(test|lint|check|validation|failure|bug)/i,
  researcher: /(research|paper|evidence|citation|benchmark)/i,
  "memory-curator": /(memory|context|decay|dedupe|sensitivity)/i
};

function loadIndex(root: string): IndexedRecord[] {
  const fp = path.join(root, ".pi/memory/context-index.json");
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, "utf-8")).records || [];
}

function readSnippet(root: string, rel: string, max = 1800): string {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) return "";
  return fs.readFileSync(fp, "utf-8").slice(0, max).trim();
}

function recentAttempts(root: string, maxFiles = 3): string[] {
  const runs = path.join(root, ".pi/runs");
  if (!fs.existsSync(runs)) return [];
  const files: string[] = [];
  function walk(d: string): void {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/attempt.*\.json$/i.test(e.name)) files.push(fp);
    }
  }
  walk(runs);
  return files
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, maxFiles)
    .map((f) => fs.readFileSync(f, "utf-8").slice(0, 1200));
}

function selectRecords(root: string, role: string): IndexedRecord[] {
  const hint = ROLE_HINTS[role] || /./;
  return loadIndex(root)
    .filter((r) => !r.duplicate_of)
    .filter((r) => r.sensitivity !== "secret")
    .filter((r) => r.decay_tier !== "expired")
    .filter((r) => hint.test(r.file) || r.decay_tier === "hot")
    .sort((a, b) => {
      const tier = { hot: 0, warm: 1, cold: 2, expired: 3 };
      return tier[a.decay_tier] - tier[b.decay_tier] || a.bytes - b.bytes;
    })
    .slice(0, 8);
}

function buildPack(root: string, role: string): string {
  const records = selectRecords(root, role);
  const sections = records.map((r) => `## ${r.file}\n- decay: ${r.decay_tier}\n- sensitivity: ${r.sensitivity}\n\n${readSnippet(root, r.file)}`);
  const attempts = recentAttempts(root).map((a, i) => `## Recent attempt ${i + 1}\n${a}`);
  return [
    `# Context Pack: ${role}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Selection rules: no secret records, no expired records, no duplicates, role-relevant hot memory first.",
    "",
    "# Memory",
    ...sections,
    "",
    "# Recent Attempt Evidence",
    ...attempts
  ].join("\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context-pack", {
    description: "Build a compressed role-aware context pack. Usage: /context-pack planner",
    handler: async (args, ctx) => {
      const role = args.trim() || "planner";
      const outDir = path.join(ctx.cwd, ".pi/runs");
      fs.mkdirSync(outDir, { recursive: true });
      const out = path.join(outDir, `context-pack-${role}.md`);
      fs.writeFileSync(out, buildPack(ctx.cwd, role));
      return ctx.ui.notify(`context pack written: ${path.relative(ctx.cwd, out).replace(/\\/g, "/")}`, "info");
    }
  });
}
