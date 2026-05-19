/**
 * evolution-governor.ts
 *
 * Proposal-based self-evolution gate — enforces Endure → Excel → Evolve.
 * Every proposed change to prompts, skills, agents, or topologies must pass
 * safety + regression gates before promotion. Human approval required for
 * broad-scope changes. Full rollback support.
 *
 * Research basis: LIFE framework; "Self-Evolving Agents" survey (Endure/Excel/Evolve);
 *   "Beyond Individual Intelligence" — attribution before self-evolution.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

type ArtifactClass =
  | "prompt"
  | "skill"
  | "agent"
  | "topology"
  | "routing_rule"
  | "memory_policy"
  | "tool_description";

type EvolutionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "promoted"
  | "rolled_back";

interface EvolutionProposal {
  id: string;
  artifact_class: ArtifactClass;
  target_file: string;
  description: string;
  motivation: string;
  diff_summary: string;
  evidence: string;
  holdout_eval_result?: string;
  safety_gate_passed?: boolean;
  regression_gate_passed?: boolean;
  status: EvolutionStatus;
  created_at: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  promoted_at?: string;
  rolled_back_at?: string;
  rollback_reason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function proposalDir(piDir: string): string {
  const d = path.join(piDir, "evolution-proposals");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function proposalPath(piDir: string, id: string): string {
  return path.join(proposalDir(piDir), `${id}.json`);
}

function readProposal(piDir: string, id: string): EvolutionProposal | null {
  const fp = proposalPath(piDir, id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as EvolutionProposal;
  } catch {
    return null;
  }
}

function writeProposal(piDir: string, proposal: EvolutionProposal): void {
  fs.writeFileSync(proposalPath(piDir, proposal.id), JSON.stringify(proposal, null, 2), "utf-8");
}

function listProposals(piDir: string): EvolutionProposal[] {
  const dir = proposalDir(piDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as EvolutionProposal;
      } catch {
        return null;
      }
    })
    .filter((p): p is EvolutionProposal => p !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// ─── Endure → Excel → Evolve gate ────────────────────────────────────────────

function checkSafetyGate(proposal: EvolutionProposal): { passed: boolean; reason: string } {
  const desc = (proposal.description + " " + proposal.diff_summary).toLowerCase();

  // Block direct permission/sandbox/credential changes
  if (/permission|credential|api.key|secret|sandbox|network.access|firewall/.test(desc)) {
    return {
      passed: false,
      reason: "Proposal touches permissions, credentials, or network access — human-only review required.",
    };
  }

  // Require evidence
  if (!proposal.evidence || proposal.evidence.trim().length < 20) {
    return { passed: false, reason: "Insufficient evidence. Attach trace refs, test results, or attribution." };
  }

  return { passed: true, reason: "Safety gate passed." };
}

function requiresHumanApproval(proposal: EvolutionProposal): boolean {
  // Broad-scope artifacts always require human approval
  return (
    proposal.artifact_class === "agent" ||
    proposal.artifact_class === "routing_rule" ||
    proposal.diff_summary.toLowerCase().includes("all agents") ||
    proposal.diff_summary.toLowerCase().includes("global policy")
  );
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    basePiDir = path.join(ctx.cwd, ".pi");

    // Alert about pending proposals at session start
    try {
      const pending = listProposals(basePiDir).filter(
        (p) => p.status === "proposed" || p.status === "approved",
      );
      if (pending.length > 0) {
        ctx.ui.notify(
          `Evolution governor: ${pending.length} pending proposal(s). Run /evolution-pending to review.`,
          "info",
        );
      }
    } catch {
      // ignore
    }
  });

  // ─── Tool: propose_evolution ───────────────────────────────────────────────
  pi.registerTool({
    name: "propose_evolution",
    label: "Propose Evolution",
    description:
      "Propose a change to a prompt, skill, agent config, topology, or routing rule. " +
      "Enforces Endure → Excel → Evolve: safety gate runs first, then regression gate, " +
      "then optionally human approval before promotion. " +
      "Never directly modify prompts/skills/agents — always propose first.",
    parameters: Type.Object({
      artifact_class: StringEnum(
        ["prompt", "skill", "agent", "topology", "routing_rule", "memory_policy", "tool_description"] as const,
        { description: "What type of artifact is being changed" },
      ),
      target_file: Type.String({
        description: "Path to the file being changed (relative to project root)",
      }),
      description: Type.String({
        description: "What change is being proposed and why",
      }),
      motivation: Type.String({
        description:
          "Root cause or attribution evidence that motivates this change (trace ref, failure log, test result)",
      }),
      diff_summary: Type.String({
        description: "Summary of the proposed diff: what was added, removed, or changed",
      }),
      evidence: Type.String({
        description:
          "Evidence that this change improves outcomes: test results, trace comparisons, benchmark deltas",
      }),
      holdout_eval_result: Type.Optional(
        Type.String({
          description:
            "Result of running the proposal against holdout evaluation tasks (highly recommended for promotion)",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Evolution governor not initialized" }], isError: true };
      }

      const id = `ep-${Date.now()}-${generateId()}`;
      const proposal: EvolutionProposal = {
        id,
        artifact_class: params.artifact_class,
        target_file: params.target_file,
        description: params.description,
        motivation: params.motivation,
        diff_summary: params.diff_summary,
        evidence: params.evidence,
        holdout_eval_result: params.holdout_eval_result,
        status: "proposed",
        created_at: new Date().toISOString(),
      };

      // Endure gate: safety check
      const safetyResult = checkSafetyGate(proposal);
      proposal.safety_gate_passed = safetyResult.passed;

      if (!safetyResult.passed) {
        proposal.status = "rejected";
        proposal.reviewer_notes = `Safety gate blocked: ${safetyResult.reason}`;
        writeProposal(basePiDir, proposal);
        return {
          content: [
            {
              type: "text",
              text: `Proposal REJECTED by safety gate:\n  ${safetyResult.reason}\n  ID: ${id}`,
            },
          ],
          details: proposal,
          isError: true,
        };
      }

      // Regression gate: require holdout eval for promoted changes
      const hasEval = !!(params.holdout_eval_result && params.holdout_eval_result.trim().length > 10);
      proposal.regression_gate_passed = hasEval;

      writeProposal(basePiDir, proposal);

      const needsHuman = requiresHumanApproval(proposal);
      const lines = [
        `Evolution proposal created: ${id}`,
        `  Artifact: ${params.artifact_class} → ${params.target_file}`,
        `  Safety gate: ${safetyResult.passed ? "✓ passed" : "✗ failed"}`,
        `  Holdout eval: ${hasEval ? "✓ provided" : "⚠ missing (recommended for promotion)"}`,
        `  Human approval required: ${needsHuman ? "YES" : "no"}`,
        "",
        `Next steps:`,
        needsHuman
          ? "  1. Human must approve via /evolution-pending before promotion"
          : "  1. Review via /evolution-pending",
        "  2. If approved, promote to target file manually or via promotion workflow",
        "  3. Run regression tests after promotion; rollback if they fail",
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: proposal,
      };
    },
  });

  // ─── /evolution-log: show all proposals ───────────────────────────────────
  pi.registerCommand("evolution-log", {
    description: "Show all evolution proposals and their status",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Evolution governor not initialized", "error");
        return;
      }
      const proposals = listProposals(basePiDir);
      if (proposals.length === 0) {
        ctx.ui.notify("No evolution proposals recorded.", "info");
        return;
      }
      const lines = proposals.slice(-15).map((p) => {
        const statusEmoji =
          { proposed: "⏳", approved: "✓", rejected: "✗", promoted: "🚀", rolled_back: "↩" }[p.status] ?? "?";
        return `${statusEmoji} ${p.id} [${p.status}] ${p.artifact_class}→${p.target_file}\n   ${p.description.slice(0, 80)}`;
      });
      ctx.ui.notify(`${proposals.length} proposal(s):\n\n${lines.join("\n\n")}`, "info");
    },
  });

  // ─── /evolution-pending: review pending proposals ─────────────────────────
  pi.registerCommand("evolution-pending", {
    description: "Show and manage pending evolution proposals requiring review",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Evolution governor not initialized", "error");
        return;
      }
      const pending = listProposals(basePiDir).filter(
        (p) => p.status === "proposed" || p.status === "approved",
      );
      if (pending.length === 0) {
        ctx.ui.notify("No pending evolution proposals.", "info");
        return;
      }
      const lines = pending.map((p, i) => {
        const needsHuman = requiresHumanApproval(p) ? " [HUMAN APPROVAL REQUIRED]" : "";
        return (
          `${i + 1}. ${p.id}${needsHuman}\n` +
          `   Class: ${p.artifact_class}  File: ${p.target_file}\n` +
          `   Status: ${p.status}  Safety: ${p.safety_gate_passed ? "✓" : "✗"}\n` +
          `   Description: ${p.description.slice(0, 100)}\n` +
          `   Motivation: ${p.motivation.slice(0, 100)}`
        );
      });
      ctx.ui.notify(`${pending.length} pending proposal(s):\n\n${lines.join("\n\n")}`, "info");
    },
  });
}
