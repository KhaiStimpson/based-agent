/** /ba command hub: read-only package status and command map. */
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
const PACKAGE_ROOT = path.dirname(findPackagePiDir());


function countFiles(dir: string, suffix?: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) n += countFiles(fp, suffix);
    else if (!suffix || e.name.endsWith(suffix)) n++;
  }
  return n;
}
function counts(root: string) {
  return {
    extensions: countFiles(path.join(root, ".pi/extensions"), ".ts"),
    agents: countFiles(path.join(root, ".pi/agents"), ".md"),
    prompts: countFiles(path.join(root, ".pi/prompts"), ".md"),
    skills: fs.existsSync(path.join(root, ".pi/skills")) ? fs.readdirSync(path.join(root, ".pi/skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0,
    memory: countFiles(path.join(root, ".pi/memory")),
    judge: countFiles(path.join(root, ".pi/evals/judge-corpus")),
    runs: countFiles(path.join(root, ".pi/runs"), ".json"),
    traces: countFiles(path.join(root, ".pi/mas-traces"), ".jsonl"),
    proposals: countFiles(path.join(root, ".pi/evolution-proposals"), ".json"),
  };
}
function validate(root: string): string[] {
  const missing: string[] = [];
  for (const rel of ["AGENTS.md", "package.json", ".pi/settings.json", ".pi/extensions", ".pi/agents", ".pi/prompts", ".pi/skills"]) if (!fs.existsSync(path.join(root, rel))) missing.push(rel);
  for (const rel of ["package.json", ".pi/settings.json"]) try { JSON.parse(fs.readFileSync(path.join(root, rel), "utf-8")); } catch { missing.push(`${rel} (invalid JSON)`); }
  return missing;
}
const HELP = `based-agent /ba hub\n\nAutopilot: /autopilot, /autopilot reload, /autopilot promote\nRead-only: /ba status, /ba doctor, /ba validate-structure\nAttempts: /ba attempts -> /attempt-history, /attempt-compare\nEvolution: /ba evolution, /evolution-pending, /evolution-log, /evolution-scan, /evolution-approve, /evolution-reject, /evolution-promote, /evolution-rollback\nSafety: /ba safety -> /safety-rules, /validation-rules\nMemory: /memory-search, /memory-stats, /memory-add, /memory-curate\nSkills: /skills, /skill-audit, /skill-candidates, /skill-memory\nJudge/Topology/Traces: /judge-corpus, /judge-calibrate, /topology-validate, /trace-status, /trace-last, /trajectory-last`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ba", {
    description: "based-agent command hub. Usage: /ba [help|autopilot|status|doctor|validate-structure|attempts|evolution|evolution-scan|safety|memory|skills|judge|topology|traces]",
    handler: async (args, ctx) => {
      const root = PACKAGE_ROOT;
      const sub = args.trim().split(/\s+/)[0] || "help";
      if (sub === "help") return ctx.ui.notify(HELP, "info");
      if (sub === "autopilot") return ctx.ui.notify("Autopilot is the default supervisor. Use /autopilot for status, /autopilot reload to refresh Pi resources, or /autopilot promote to promote current working memory.", "info");
      if (sub === "status") {
        const c = counts(root);
        return ctx.ui.notify(`based-agent status\n${Object.entries(c).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`, "info");
      }
      if (sub === "validate-structure" || sub === "doctor") {
        const missing = validate(root);
        const c = counts(root);
        const health = missing.length === 0 ? "passed" : `failed: ${missing.join(", ")}`;
        return ctx.ui.notify(`${sub}: ${health}\nArtifacts: ${c.extensions} extensions, ${c.agents} agents, ${c.prompts} prompts, ${c.skills} skills`, missing.length ? "error" : "info");
      }
      if (sub === "attempts") return ctx.ui.notify("Attempts: use /attempt-history and /attempt-compare. Write-bearing runs auto-save minimal summaries/evidence under .pi/runs/<date>/.", "info");
      if (sub === "evolution") return ctx.ui.notify("Evolution lifecycle: /evolution-scan [--write] proposes only; /evolution-pending; human/operator creates .pi/evolution-approvals/<id>.json outside the agent tool path, then /evolution-approve <id>; /evolution-reject <id> <reason>; /evolution-promote <id>; /evolution-rollback <id> <reason>; /evolution-log.", "info");
      if (sub === "evolution-scan") return ctx.ui.notify("Run /evolution-scan to report opportunities or /evolution-scan --write to create proposal JSON files only.", "info");
      if (sub === "safety") return ctx.ui.notify("Safety: /safety-rules and /validation-rules. Agent tools are blocked from .pi/evolution-approvals/ and generic proposal tampering; promotion requires external approval and snapshots.", "info");
      if (sub === "memory") return ctx.ui.notify("Memory: /memory-search, /memory-stats, /memory-add, /memory-curate. Protected path: .pi/memory/.", "info");
      if (sub === "skills") return ctx.ui.notify("Skills: /skills, /skill-audit, /skill-candidates, /skill-memory. Generated candidates are written under governed .pi/evals/skills/ outputs.", "info");
      if (sub === "judge") return ctx.ui.notify("Judge: /judge-corpus and /judge-calibrate. Protected path: .pi/evals/judge-corpus/.", "info");
      if (sub === "topology") return ctx.ui.notify("Topology: /topology-validate and topology runner commands.", "info");
      if (sub === "traces") return ctx.ui.notify("Traces: /trace-status, /trace-last, /trajectory-last. JSONL traces live under .pi/mas-traces/; trajectory reports live under .pi/trajectories/.", "info");
      ctx.ui.notify(HELP, "info");
    },
  });
}
