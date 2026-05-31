/**
 * skill-ecosystem-auditor.ts
 *
 * Audits repo-local skills for executable workflow quality, traceability, and
 * drift risk. Complements config-linter: this checks whether skills are useful
 * and evaluable, not merely non-contradictory.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface SkillAudit {
  file: string;
  score: number;
  missing: string[];
}

const REQUIRED_SECTIONS: Array<[string, RegExp]> = [
  ["trigger", /(^|\n)#{1,3}\s*(trigger|when to use|applicability)/i],
  ["inputs", /(^|\n)#{1,3}\s*(inputs?|preconditions?)/i],
  ["ordered_steps", /(^|\n)#{1,3}\s*(steps|procedure|workflow|algorithm)/i],
  ["tools", /(^|\n)#{1,3}\s*(tools?|permissions?)/i],
  ["oracle", /(^|\n)#{1,3}\s*(oracle|validation|success criteria|checks?)/i],
  ["failure_modes", /(^|\n)#{1,3}\s*(failure modes?|risks?|fallbacks?)/i],
  ["trace_tags", /(^|\n)#{1,3}\s*(trace tags?|attribution|intended agents?)/i],
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(fp));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(fp);
  }
  return out;
}

function auditSkill(cwd: string, fp: string): SkillAudit {
  const text = fs.readFileSync(fp, "utf-8");
  const missing: string[] = [];
  let score = 100;

  for (const [name, re] of REQUIRED_SECTIONS) {
    if (!re.test(text)) {
      missing.push(name);
      score -= 12;
    }
  }

  if (!/AGENTS\.md|agent contract|canonical/i.test(text)) {
    missing.push("AGENTS.md linkage");
    score -= 8;
  }

  if (!/```|\n\s*\d+\.|\n\s*- \[[ x]\]/.test(text)) {
    missing.push("executable structure");
    score -= 8;
  }

  if (/always|never|must/i.test(text) && !/exception|unless|fallback/i.test(text)) {
    missing.push("absolute directive without exception policy");
    score -= 6;
  }

  return {
    file: path.relative(cwd, fp),
    score: Math.max(0, score),
    missing,
  };
}

function writeReport(cwd: string, audits: SkillAudit[]): string {
  const reportDir = path.join(cwd, ".pi", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const fp = path.join(reportDir, "skill-audit.json");
  fs.writeFileSync(
    fp,
    JSON.stringify(
      {
        saved_at: new Date().toISOString(),
        audited: audits.length,
        failing: audits.filter((a) => a.score < 70).length,
        audits,
      },
      null,
      2,
    ),
  );
  return fp;
}

export default function (pi: ExtensionAPI) {
  function runAudit(cwd: string): { audits: SkillAudit[]; report: string | null } {
    const skillDir = path.join(cwd, ".pi", "skills");
    const files = walk(skillDir);
    if (files.length === 0) return { audits: [], report: null };

    const audits = files.map((fp) => auditSkill(cwd, fp));
    return { audits, report: writeReport(cwd, audits) };
  }

  pi.on("session_start", async (_event, ctx) => {
    const { audits, report } = runAudit(ctx.cwd);
    if (!report) return;

    const weak = audits.filter((a) => a.score < 70);
    if (weak.length > 0) {
      await ctx.ui.notify(
        `Skill audit found ${weak.length} weak skill(s). See ${path.relative(ctx.cwd, report)}. Lowest: ` +
          weak
            .sort((a, b) => a.score - b.score)
            .slice(0, 3)
            .map((a) => `${a.file}=${a.score}`)
            .join(", "),
        "warning",
      );
    }
  });

  pi.registerCommand("skill-audit", {
    description: "Audit repo-local skills for executable workflow quality and drift risk.",
    handler: async (_args, ctx) => {
      const { audits, report } = runAudit(ctx.cwd);
      if (!report) return ctx.ui.notify("No skills found under .pi/skills.", "info");
      const weak = audits.filter((a) => a.score < 70);
      const lowest = audits
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map((a) => `- ${a.file}: ${a.score}${a.missing.length ? ` (${a.missing.join(", ")})` : ""}`)
        .join("\n");
      return ctx.ui.notify(
        `Skill audit complete\n- audited: ${audits.length}\n- weak: ${weak.length}\n- report: ${path.relative(ctx.cwd, report)}\n\n${lowest}`,
        weak.length ? "warning" : "info",
      );
    },
  });
}
