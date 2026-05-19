/**
 * worktree-manager.ts
 *
 * Manages git worktrees for isolated parallel attempts. Only validated
 * diffs are merged back — prevents coherence failures from concurrent writes.
 *
 * Research basis: AgentSpawn coherence manager — concurrent patches require
 *   isolation; merge only after deterministic validation.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorktreeStatus = "active" | "validated" | "merged" | "abandoned";

interface WorktreeRecord {
  id: string;
  branch: string;
  worktree_path: string;
  purpose: string;
  created_at: string;
  status: WorktreeStatus;
  validated_at?: string;
  merged_at?: string;
  merge_validation?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

let basePiDir: string | null = null;
let sessionCwd: string | null = null;

function worktreeRegistryPath(piDir: string): string {
  fs.mkdirSync(piDir, { recursive: true });
  return path.join(piDir, "worktrees.json");
}

function readRegistry(piDir: string): WorktreeRecord[] {
  const fp = worktreeRegistryPath(piDir);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as WorktreeRecord[];
  } catch {
    return [];
  }
}

function writeRegistry(piDir: string, records: WorktreeRecord[]): void {
  fs.writeFileSync(worktreeRegistryPath(piDir), JSON.stringify(records, null, 2), "utf-8");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    basePiDir = path.join(ctx.cwd, ".pi");
    sessionCwd = ctx.cwd;
    fs.mkdirSync(basePiDir, { recursive: true });
  });

  // ─── Tool: create_worktree ────────────────────────────────────────────────
  pi.registerTool({
    name: "create_worktree",
    label: "Create Worktree",
    description:
      "Create an isolated git worktree for a parallel coding attempt. " +
      "Worktrees allow multiple branches to be checked out simultaneously. " +
      "Each attempt gets its own directory; only validated work is merged back.",
    parameters: Type.Object({
      branch_name: Type.String({
        description: "New branch name for this worktree, e.g. 'attempt/fix-auth-bug-v2'",
      }),
      purpose: Type.String({
        description: "What this worktree is for, e.g. 'parallel hypothesis: use mutex instead of semaphore'",
      }),
      base_branch: Type.Optional(
        Type.String({ description: "Branch to base the worktree on (default: current HEAD)" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir || !sessionCwd) {
        return { content: [{ type: "text", text: "Worktree manager not initialized" }], isError: true };
      }

      const id = `wt-${Date.now().toString(36)}`;
      const worktreePath = path.join(sessionCwd, "..", `${path.basename(sessionCwd)}-${params.branch_name.replace(/[^a-zA-Z0-9-]/g, "-")}`);
      const baseBranch = params.base_branch ?? "HEAD";

      try {
        // Create the worktree via git
        const { stderr: err1 } = await pi.exec("git", ["worktree", "add", "-b", params.branch_name, worktreePath, baseBranch]);

        if (err1 && err1.trim().length > 0 && !err1.includes("Preparing worktree")) {
          return {
            content: [{ type: "text", text: `git worktree add failed: ${err1}` }],
            isError: true,
          };
        }

        const record: WorktreeRecord = {
          id,
          branch: params.branch_name,
          worktree_path: worktreePath,
          purpose: params.purpose,
          created_at: new Date().toISOString(),
          status: "active",
        };

        const registry = readRegistry(basePiDir);
        registry.push(record);
        writeRegistry(basePiDir, registry);

        return {
          content: [
            {
              type: "text",
              text:
                `Worktree created:\n  ID: ${id}\n  Branch: ${params.branch_name}\n  Path: ${worktreePath}\n  Purpose: ${params.purpose}\n\n` +
                `Use this path for isolated work. Merge back only after validation with merge_worktree.`,
            },
          ],
          details: record,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to create worktree: ${String(err)}` }],
          isError: true,
        };
      }
    },
  });

  // ─── Tool: list_worktrees ─────────────────────────────────────────────────
  pi.registerTool({
    name: "list_worktrees",
    label: "List Worktrees",
    description: "List all tracked worktrees and their status.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Worktree manager not initialized" }], isError: true };
      }

      const registry = readRegistry(basePiDir);
      if (registry.length === 0) {
        return { content: [{ type: "text", text: "No worktrees tracked." }], details: { worktrees: [] } };
      }

      const lines = registry.map((wt) => {
        const statusEmoji = { active: "🔵", validated: "✓", merged: "✅", abandoned: "✗" }[wt.status];
        return `${statusEmoji} ${wt.id} [${wt.status}]\n  Branch: ${wt.branch}\n  Path: ${wt.worktree_path}\n  Purpose: ${wt.purpose}`;
      });

      return {
        content: [{ type: "text", text: `${registry.length} worktree(s):\n\n${lines.join("\n\n")}` }],
        details: { worktrees: registry },
      };
    },
  });

  // ─── Tool: merge_worktree ─────────────────────────────────────────────────
  pi.registerTool({
    name: "merge_worktree",
    label: "Merge Worktree",
    description:
      "Merge a validated worktree branch back to the main branch. " +
      "REQUIRES validation_evidence — do not merge without confirmed test passage.",
    parameters: Type.Object({
      worktree_id: Type.String({ description: "Worktree ID to merge (from list_worktrees)" }),
      target_branch: Type.Optional(
        Type.String({ description: "Branch to merge into (default: main or master)" }),
      ),
      validation_evidence: Type.String({
        description:
          "Evidence that this worktree's changes have been validated: test output, exit codes, etc. REQUIRED.",
      }),
      merge_strategy: Type.Optional(
        Type.String({ description: "Git merge strategy: --ff-only, --no-ff, --squash (default: --no-ff)" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir || !sessionCwd) {
        return { content: [{ type: "text", text: "Worktree manager not initialized" }], isError: true };
      }

      if (!params.validation_evidence || params.validation_evidence.trim().length < 10) {
        return {
          content: [
            {
              type: "text",
              text: "Merge blocked: validation_evidence is required and must be substantive. Run tests first.",
            },
          ],
          isError: true,
        };
      }

      const registry = readRegistry(basePiDir);
      const idx = registry.findIndex((wt) => wt.id === params.worktree_id);
      if (idx < 0) {
        return {
          content: [{ type: "text", text: `Worktree not found: ${params.worktree_id}` }],
          isError: true,
        };
      }

      const wt = registry[idx];
      const strategy = params.merge_strategy ?? "--no-ff";

      try {
        const { stdout, stderr } = await pi.exec("git", [
          "merge",
          strategy,
          wt.branch,
          "-m",
          `Merge ${wt.branch}: ${wt.purpose}\n\nValidation: ${params.validation_evidence}`,
        ]);

        if (stderr && stderr.includes("CONFLICT")) {
          return {
            content: [
              { type: "text", text: `Merge conflict detected. Resolve conflicts before merging.\n${stderr}` },
            ],
            isError: true,
          };
        }

        registry[idx] = {
          ...wt,
          status: "merged",
          merged_at: new Date().toISOString(),
          merge_validation: params.validation_evidence,
        };
        writeRegistry(basePiDir, registry);

        return {
          content: [
            {
              type: "text",
              text: `Worktree ${wt.id} merged successfully.\n  Branch: ${wt.branch}\n${stdout}`,
            },
          ],
          details: registry[idx],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Merge failed: ${String(err)}` }],
          isError: true,
        };
      }
    },
  });

  // ─── Tool: delete_worktree ────────────────────────────────────────────────
  pi.registerTool({
    name: "delete_worktree",
    label: "Delete Worktree",
    description: "Remove a worktree that has been merged or abandoned.",
    parameters: Type.Object({
      worktree_id: Type.String({ description: "Worktree ID to delete" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Worktree manager not initialized" }], isError: true };
      }

      const registry = readRegistry(basePiDir);
      const idx = registry.findIndex((wt) => wt.id === params.worktree_id);
      if (idx < 0) {
        return { content: [{ type: "text", text: `Worktree not found: ${params.worktree_id}` }], isError: true };
      }

      const wt = registry[idx];
      if (wt.status === "active") {
        return {
          content: [
            {
              type: "text",
              text: `Cannot delete active worktree. Set status to abandoned or merged first.`,
            },
          ],
          isError: true,
        };
      }

      try {
        await pi.exec("git", ["worktree", "remove", wt.worktree_path]);
        await pi.exec("git", ["branch", "-d", wt.branch]).catch(() => {
          // ignore branch deletion failures (branch may not exist or have unmerged changes)
        });

        registry.splice(idx, 1);
        writeRegistry(basePiDir, registry);

        return { content: [{ type: "text", text: `Worktree ${wt.id} removed.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Delete failed: ${String(err)}` }], isError: true };
      }
    },
  });

  // ─── /worktrees: list worktrees ────────────────────────────────────────────
  pi.registerCommand("worktrees", {
    description: "List all tracked worktrees",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Worktree manager not initialized", "error");
        return;
      }
      const registry = readRegistry(basePiDir);
      if (registry.length === 0) {
        ctx.ui.notify("No worktrees tracked. Use create_worktree to start an isolated attempt.", "info");
        return;
      }
      const lines = registry.map((wt) => {
        const statusEmoji = { active: "🔵", validated: "✓", merged: "✅", abandoned: "✗" }[wt.status];
        return `${statusEmoji} ${wt.id}: ${wt.branch} [${wt.status}]\n  ${wt.purpose}`;
      });
      ctx.ui.notify(`${registry.length} worktree(s):\n\n${lines.join("\n\n")}`, "info");
    },
  });
}
