/**
 * config-linter.ts
 *
 * Detects contradictory or duplicated instructions across AGENTS.md, skills,
 * rules, prompts, and agent config files. Surfaces conflicts to prevent
 * prompt/config drift.
 *
 * Research basis: "Configuring Agentic AI Coding Tools" — 2,853 repos show
 *   context files dominate; contradictory duplicated configs are the main risk.
 *   AGENTS.md should be the shared core; other files should adapt, not duplicate.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

type LintSeverity = "error" | "warning" | "info";

interface LintIssue {
  severity: LintSeverity;
  file: string;
  issue: string;
  suggestion?: string;
}

interface LintResult {
  files_scanned: string[];
  issues: LintIssue[];
  errors: number;
  warnings: number;
  info: number;
}

// ─── Config file patterns to scan ─────────────────────────────────────────────

const CONFIG_FILE_PATTERNS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CURSOR.md",
  ".cursorrules",
  ".clinerules",
  ".copilot-instructions.md",
  "copilot-instructions.md",
  ".pi/settings.json",
];

const SKILL_DIRS = [".pi/skills", ".pi/prompts"];
const AGENT_DIR = ".pi/agents";

// ─── Contradiction rules ──────────────────────────────────────────────────────

// Pairs of contradictory directives (lowercase patterns)
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp, string]> = [
  [
    /never\s+use\s+git\s+stash/i,
    /use\s+git\s+stash/i,
    "Contradictory git stash instructions",
  ],
  [
    /always\s+run\s+tests\s+before/i,
    /skip\s+tests/i,
    "Contradictory test execution policy",
  ],
  [
    /do\s+not\s+write\s+to\s+main/i,
    /write\s+to\s+main\s+directly/i,
    "Contradictory write-to-main policy",
  ],
  [
    /use\s+typescript/i,
    /do\s+not\s+use\s+typescript/i,
    "Contradictory TypeScript usage instructions",
  ],
  [
    /prefer\s+async\/await/i,
    /avoid\s+async\/await/i,
    "Contradictory async/await preference",
  ],
];

// Rules that should only appear in AGENTS.md (not duplicated elsewhere)
const AGENTS_MD_ONLY_PATTERNS: RegExp[] = [
  /build\/test\/lint\s+commands/i,
  /project\s+overview/i,
  /repository\s+structure/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileSafe(fp: string): string | null {
  try {
    return fs.readFileSync(fp, "utf-8");
  } catch {
    return null;
  }
}

function findExistingConfigFiles(cwd: string): string[] {
  const found: string[] = [];
  for (const pattern of CONFIG_FILE_PATTERNS) {
    const fp = path.join(cwd, pattern);
    if (fs.existsSync(fp)) found.push(fp);
  }
  // Scan skill dirs
  for (const skillDir of SKILL_DIRS) {
    const dp = path.join(cwd, skillDir);
    if (!fs.existsSync(dp)) continue;
    const files = fs.readdirSync(dp).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
    for (const f of files) found.push(path.join(dp, f));
  }
  // Scan agent dir
  const agentDirFull = path.join(cwd, AGENT_DIR);
  if (fs.existsSync(agentDirFull)) {
    const files = fs.readdirSync(agentDirFull).filter((f) => f.endsWith(".md") || f.endsWith(".yml") || f.endsWith(".yaml"));
    for (const f of files) found.push(path.join(agentDirFull, f));
  }
  return found;
}

function lintConfigs(cwd: string): LintResult {
  const issues: LintIssue[] = [];
  const scannedFiles: string[] = [];
  const fileContents = new Map<string, string>();

  // Read all config files
  const configFiles = findExistingConfigFiles(cwd);
  for (const fp of configFiles) {
    const content = readFileSafe(fp);
    if (content !== null) {
      fileContents.set(fp, content);
      scannedFiles.push(path.relative(cwd, fp));
    }
  }

  // Check AGENTS.md exists
  const agentsMd = path.join(cwd, "AGENTS.md");
  if (!fileContents.has(agentsMd)) {
    issues.push({
      severity: "warning",
      file: "AGENTS.md",
      issue: "AGENTS.md not found. This file should be the shared cross-tool agent contract.",
      suggestion: "Create AGENTS.md with project overview, commands, conventions, safety rules.",
    });
  }

  // Check for contradictions within each file
  for (const [fp, content] of fileContents) {
    const relPath = path.relative(cwd, fp);

    for (const [patternA, patternB, description] of CONTRADICTION_PAIRS) {
      if (patternA.test(content) && patternB.test(content)) {
        issues.push({
          severity: "error",
          file: relPath,
          issue: `${description} detected in the same file.`,
          suggestion: "Remove one of the contradicting instructions.",
        });
      }
    }
  }

  // Check for cross-file contradictions
  const allFilesList = [...fileContents.entries()];
  for (let i = 0; i < allFilesList.length; i++) {
    for (let j = i + 1; j < allFilesList.length; j++) {
      const [fpA, contentA] = allFilesList[i];
      const [fpB, contentB] = allFilesList[j];
      const relA = path.relative(cwd, fpA);
      const relB = path.relative(cwd, fpB);

      for (const [patternA, patternB, description] of CONTRADICTION_PAIRS) {
        if (patternA.test(contentA) && patternB.test(contentB)) {
          issues.push({
            severity: "error",
            file: `${relA} vs ${relB}`,
            issue: `Cross-file contradiction: ${description}`,
            suggestion: `Reconcile in AGENTS.md and remove from ${relB}.`,
          });
        }
        if (patternA.test(contentB) && patternB.test(contentA)) {
          issues.push({
            severity: "error",
            file: `${relB} vs ${relA}`,
            issue: `Cross-file contradiction: ${description}`,
            suggestion: `Reconcile in AGENTS.md and remove from ${relA}.`,
          });
        }
      }
    }
  }

  // Check for AGENTS.md-only content duplicated in other files
  const agentsMdContent = fileContents.get(agentsMd) ?? "";
  for (const [fp, content] of fileContents) {
    if (fp === agentsMd) continue;
    const relPath = path.relative(cwd, fp);
    for (const pattern of AGENTS_MD_ONLY_PATTERNS) {
      if (pattern.test(content) && pattern.test(agentsMdContent)) {
        issues.push({
          severity: "warning",
          file: relPath,
          issue: `Content matching '${pattern.source}' also present in AGENTS.md — potential duplication.`,
          suggestion: "Keep authoritative instructions in AGENTS.md only; other files should reference it.",
        });
      }
    }
  }

  // Check for very large config files (context bloat)
  for (const [fp, content] of fileContents) {
    const relPath = path.relative(cwd, fp);
    if (content.length > 20000) {
      issues.push({
        severity: "warning",
        file: relPath,
        issue: `Config file is very large (${Math.round(content.length / 1024)} KB). Large configs consume context budget.`,
        suggestion: "Split into focused sections or use skills for detailed workflows.",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;

  return {
    files_scanned: scannedFiles,
    issues,
    errors,
    warnings,
    info,
  };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let sessionCwd: string | null = null;

  pi.on("session_start", async (event, ctx) => {
    sessionCwd = ctx.cwd;

    // Run lint automatically on startup (info-level issues only — don't be noisy)
    if (event.reason !== "startup") return;
    try {
      const result = lintConfigs(ctx.cwd);
      if (result.errors > 0) {
        ctx.ui.notify(
          `Config lint: ${result.errors} error(s), ${result.warnings} warning(s) across ${result.files_scanned.length} file(s). Run /lint-config for details.`,
          "error",
        );
      } else if (result.warnings > 2) {
        ctx.ui.notify(
          `Config lint: ${result.warnings} warning(s) across ${result.files_scanned.length} file(s). Run /lint-config for details.`,
          "info",
        );
      }
    } catch {
      // ignore lint errors at startup
    }
  });

  // ─── /lint-config: run config lint on demand ──────────────────────────────
  pi.registerCommand("lint-config", {
    description: "Scan AGENTS.md, skills, prompts, and agent configs for contradictions and duplication",
    handler: async (_args, ctx) => {
      const cwd = sessionCwd ?? ctx.cwd;
      try {
        const result = lintConfigs(cwd);
        const lines = [
          `Config lint — ${result.files_scanned.length} file(s) scanned`,
          `  Errors: ${result.errors}  Warnings: ${result.warnings}`,
          `  Files: ${result.files_scanned.join(", ")}`,
          "",
        ];

        if (result.issues.length === 0) {
          lines.push("✓ No issues found.");
        } else {
          for (const issue of result.issues) {
            const icon = { error: "✗", warning: "⚠", info: "ℹ" }[issue.severity];
            lines.push(`${icon} [${issue.severity}] ${issue.file}`);
            lines.push(`  ${issue.issue}`);
            if (issue.suggestion) lines.push(`  → ${issue.suggestion}`);
            lines.push("");
          }
        }

        ctx.ui.notify(lines.join("\n"), result.errors > 0 ? "error" : "info");
      } catch (err) {
        ctx.ui.notify(`Config lint failed: ${String(err)}`, "error");
      }
    },
  });
}
