/**
 * safety-gate.ts
 *
 * Blocks destructive shell commands, writes to protected paths, and
 * unsafe extension patterns. Provides auditable safety rule display.
 *
 * Research basis: Pi extension security model and operational safety.
 *   Extensions run with system permissions — pi itself notes that
 *   "skills can instruct the model to run arbitrary commands."
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";

// ─── Destructive command patterns ─────────────────────────────────────────────

interface CommandRule {
  pattern: RegExp;
  description: string;
  severity: "block" | "warn";
  reason: string;
}

const COMMAND_RULES: CommandRule[] = [
  {
    pattern: /\brm\s+(-rf?|--recursive\s+--force|--force\s+--recursive)\s+\//i,
    description: "Recursive delete from root",
    severity: "block",
    reason: "Recursive deletion from filesystem root would destroy the system",
  },
  {
    pattern: /\brm\s+-rf\s+(~|\/home\/|\/root\/|\/etc\/|\/usr\/|\/var\/|\/sys\/|\/proc\/)/i,
    description: "Recursive delete of system/home directory",
    severity: "block",
    reason: "Recursive deletion of system or home directories",
  },
  {
    pattern: /\bdd\b.*\bof=\/dev\/(sd[a-z]|nvme\d|disk\d)/i,
    description: "Raw disk write via dd",
    severity: "block",
    reason: "Direct disk write would overwrite device data",
  },
  {
    pattern: />\s*\/dev\/(sd[a-z]|nvme\d|disk\d)/i,
    description: "Output redirect to raw disk device",
    severity: "block",
    reason: "Redirecting to a raw disk device would overwrite it",
  },
  {
    pattern: /\bchmod\s+(777|a\+rwx|ugo\+rwx)\s+\//i,
    description: "World-writable permissions on root",
    severity: "block",
    reason: "Setting world-writable on system paths is a security vulnerability",
  },
  {
    pattern: /\bsudo\s+(rm|dd|mkfs|fdisk|parted|wipefs|shred)\b/i,
    description: "Privileged destructive command",
    severity: "block",
    reason: "Privileged destructive operations require explicit human authorization",
  },
  {
    pattern: /\bcurl\b.*\|\s*(bash|sh|zsh|fish|python|node|ruby|perl)\b/i,
    description: "Curl-pipe-to-shell",
    severity: "block",
    reason: "Downloading and executing code from the internet without inspection is unsafe",
  },
  {
    pattern: /\bwget\b.*-O\s*-.*\|\s*(bash|sh|zsh|python|node)\b/i,
    description: "Wget-pipe-to-shell",
    severity: "block",
    reason: "Downloading and executing code from the internet without inspection is unsafe",
  },
  {
    pattern: /\bsudo\s+passwd\b/i,
    description: "Password change via sudo",
    severity: "block",
    reason: "Changing system passwords requires explicit human authorization",
  },
  {
    pattern: /\b(export|set)\s+[A-Z_]*(SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY)[A-Z_]*\s*=/i,
    description: "Exporting credential to environment",
    severity: "warn",
    reason: "Credentials should not be exported to shell environment — use secret managers",
  },
  {
    pattern: /\bnohup\b.*\&\s*$|\bscreen\b|\btmux\b.*new\b/i,
    description: "Background / detached process launch",
    severity: "warn",
    reason: "Background processes may persist after the agent session ends",
  },
  {
    pattern: /\biptables\b|\bufw\b.*\bdeny\b|\bfirewall-cmd\b/i,
    description: "Firewall modification",
    severity: "warn",
    reason: "Firewall rule changes affect network security and may be hard to reverse",
  },
];

// ─── Protected path patterns ──────────────────────────────────────────────────

const PROTECTED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\/\.ssh\//i, reason: "SSH credentials" },
  { pattern: /\/\.gnupg\//i, reason: "GPG keys" },
  { pattern: /\/\.aws\//i, reason: "AWS credentials" },
  { pattern: /\/\.config\/gcloud\//i, reason: "GCloud credentials" },
  { pattern: /\/\.azure\//i, reason: "Azure credentials" },
  { pattern: /\/(etc\/passwd|etc\/shadow|etc\/sudoers)/i, reason: "System auth files" },
  { pattern: /\/\.env(\.local|\.production|\.staging)?$/i, reason: "Environment secrets file" },
  { pattern: /\/(secrets|credentials)\.(json|yaml|yml|toml)$/i, reason: "Credentials file" },
  { pattern: /node_modules\/.bin\//i, reason: "node_modules binary — edit package source instead" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkCommand(command: string): { shouldBlock: boolean; rule: CommandRule | null } {
  for (const rule of COMMAND_RULES) {
    if (rule.pattern.test(command)) {
      return { shouldBlock: rule.severity === "block", rule };
    }
  }
  return { shouldBlock: false, rule: null };
}

function checkPath(filePath: string): { isProtected: boolean; reason: string } | null {
  const normalized = filePath.replace(/\\/g, "/");
  for (const { pattern, reason } of PROTECTED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isProtected: true, reason };
    }
  }
  return null;
}

function resolveWritePath(input: Record<string, unknown>): string | null {
  const p = (input.path ?? input.file_path ?? input.filename ?? "") as string;
  return typeof p === "string" && p.length > 0 ? p : null;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ─── Intercept bash tool_call ──────────────────────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      const { shouldBlock, rule } = checkCommand(command);

      if (rule) {
        if (shouldBlock) {
          ctx.ui.notify(
            `🛑 Safety gate BLOCKED bash command:\n  Rule: ${rule.description}\n  Reason: ${rule.reason}\n  Command preview: ${command.slice(0, 100)}`,
            "error",
          );
          return { block: true, reason: `Safety gate: ${rule.reason}` };
        } else {
          // Warn but allow
          ctx.ui.notify(
            `⚠️ Safety gate WARNING:\n  Rule: ${rule.description}\n  Reason: ${rule.reason}`,
            "error",
          );
          pi.sendMessage(
            {
              customType: "safety-gate-warning",
              content: `⚠️ Safety warning: ${rule.description} — ${rule.reason}. Proceed with caution.`,
              display: true,
            },
            { deliverAs: "steer", triggerTurn: false },
          );
        }
      }
      return undefined;
    }

    // ─── Intercept write/edit tool_call ────────────────────────────────────
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "create") {
      const filePath = resolveWritePath(event.input as Record<string, unknown>);
      if (!filePath) return undefined;

      const pathCheck = checkPath(filePath);
      if (pathCheck) {
        ctx.ui.notify(
          `🛑 Safety gate BLOCKED write to protected path:\n  Path: ${filePath}\n  Reason: ${pathCheck.reason}`,
          "error",
        );
        return {
          block: true,
          reason: `Safety gate: write to protected path (${pathCheck.reason}): ${filePath}`,
        };
      }

      // Warn about .pi/ extension or skill file modification
      const normalized = filePath.replace(/\\/g, "/");
      if (/\/\.pi\/extensions\/.*\.ts$/.test(normalized)) {
        ctx.ui.notify(
          `⚠️ Safety gate: Writing to .pi/extensions/ — extension files run with system permissions. Verify intent.`,
          "error",
        );
        pi.sendMessage(
          {
            customType: "safety-gate-warning",
            content: `⚠️ Writing to .pi/extensions/${path.basename(filePath)} — extension code runs with full system permissions. Use evolution-governor to propose changes.`,
            display: true,
          },
          { deliverAs: "steer", triggerTurn: false },
        );
      }

      return undefined;
    }

    return undefined;
  });

  // ─── /safety-rules: show all safety rules ────────────────────────────────
  pi.registerCommand("safety-rules", {
    description: "Display all active safety gate rules",
    handler: async (_args, ctx) => {
      const lines = [
        "Safety Gate Rules",
        "==================",
        "",
        "BLOCKED bash patterns:",
        ...COMMAND_RULES.filter((r) => r.severity === "block").map(
          (r) => `  🛑 ${r.description}: ${r.reason}`,
        ),
        "",
        "WARNED bash patterns:",
        ...COMMAND_RULES.filter((r) => r.severity === "warn").map(
          (r) => `  ⚠  ${r.description}: ${r.reason}`,
        ),
        "",
        "Protected write paths:",
        ...PROTECTED_PATH_PATTERNS.map((p) => `  🔒 ${p.pattern.source}: ${p.reason}`),
        "",
        "Additional rules:",
        "  • Writing to .pi/extensions/ triggers a warning (system permission scope).",
        "  • Use evolution-governor to propose changes to prompts, skills, and agents.",
        "  • New tools/extensions/permissions require human-approved evolution proposals.",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
