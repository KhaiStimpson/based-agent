/**
 * evolution-governor.ts
 *
 * Proposal-based self-evolution gate with explicit approve/reject/promote/
 * rollback lifecycle. Promotion is guarded by approval, safety/regression
 * evidence, target allowlists, and rollback snapshots.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
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


type ArtifactClass = "prompt" | "skill" | "agent" | "topology" | "routing_rule" | "memory_policy" | "tool_description";
type EvolutionStatus = "proposed" | "approved" | "rejected" | "promoted" | "rolled_back";

interface LifecycleEvent { at: string; action: string; actor?: string; notes?: string; }
interface ManualApprovalArtifact { proposal_id: string; proposal_fingerprint: string; approved_by: string; reviewer_notes: string; approved_at?: string; }
interface EvolutionProposal {
  id: string; artifact_class: ArtifactClass; target_file: string; description: string; motivation: string; diff_summary: string; evidence: string;
  holdout_eval_result?: string; safety_gate_passed?: boolean; regression_gate_passed?: boolean; status: EvolutionStatus; created_at: string;
  reviewed_at?: string; reviewer_notes?: string; promoted_at?: string; rolled_back_at?: string; rollback_reason?: string;
  proposed_patch?: string; proposed_content?: string; proposed_content_ref?: string; approval_required?: boolean; approved_by?: string;
  rejected_reason?: string; promoted_snapshot_ref?: string; rollback_snapshot_ref?: string; promoted_target_existed?: boolean; validation_commands?: string[]; lifecycle_events?: LifecycleEvent[];
}

function generateId(): string { return crypto.randomBytes(6).toString("hex"); }
function proposalDir(piDir: string): string { const d = path.join(piDir, "evolution-proposals"); fs.mkdirSync(d, { recursive: true }); return d; }
function snapshotDir(piDir: string): string { const d = path.join(piDir, "evolution-snapshots"); fs.mkdirSync(d, { recursive: true }); return d; }
function approvalDir(piDir: string): string { const d = path.join(piDir, "evolution-approvals"); fs.mkdirSync(d, { recursive: true }); return d; }
function isSafeArtifactId(id: string): boolean { return /^[A-Za-z0-9._-]+$/.test(id) && !id.includes(".."); }
function proposalPath(piDir: string, id: string): string { return path.join(proposalDir(piDir), `${id}.json`); }
function approvalPath(piDir: string, id: string): string { if (!isSafeArtifactId(id)) throw new Error("Unsafe approval id"); return path.join(approvalDir(piDir), `${id}.json`); }
function normalizeProposal(raw: EvolutionProposal): EvolutionProposal {
  const p = { ...raw };
  p.status = p.status ?? "proposed";
  p.approval_required = p.approval_required === true || requiresHumanApproval(p) || isGovernedTarget(p);
  p.validation_commands = p.validation_commands ?? [];
  p.lifecycle_events = p.lifecycle_events ?? [];
  return p;
}
function readProposal(piDir: string, id: string): EvolutionProposal | null {
  if (!isSafeArtifactId(id)) return null;
  const fp = proposalPath(piDir, id); if (!fs.existsSync(fp)) return null;
  try { const p = normalizeProposal(JSON.parse(fs.readFileSync(fp, "utf-8")) as EvolutionProposal); return isSafeArtifactId(p.id) ? p : null; } catch { return null; }
}
function writeProposal(piDir: string, proposal: EvolutionProposal): void { fs.writeFileSync(proposalPath(piDir, proposal.id), JSON.stringify(proposal, null, 2), "utf-8"); }
function listProposals(piDir: string): EvolutionProposal[] {
  const dir = proposalDir(piDir);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
    try { return normalizeProposal(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as EvolutionProposal); } catch { return null; }
  }).filter((p): p is EvolutionProposal => p !== null).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
function addEvent(p: EvolutionProposal, action: string, notes?: string, actor?: string): void {
  p.lifecycle_events = p.lifecycle_events ?? []; p.lifecycle_events.push({ at: new Date().toISOString(), action, actor, notes });
}
function checkSafetyGate(proposal: EvolutionProposal): { passed: boolean; reason: string } {
  const desc = `${proposal.description} ${proposal.diff_summary} ${proposal.target_file}`.toLowerCase();
  if (/permission|credential|api.key|secret|sandbox|network.access|firewall/.test(desc)) return { passed: false, reason: "Permissions, credentials, network, or sandbox changes are blocked from automatic promotion." };
  if (!proposal.evidence || proposal.evidence.trim().length < 20) return { passed: false, reason: "Insufficient evidence; attach trace refs, tests, or attribution." };
  return { passed: true, reason: "Safety gate passed." };
}
function requiresHumanApproval(p: EvolutionProposal): boolean {
  return p.artifact_class === "agent" || p.artifact_class === "routing_rule" || p.artifact_class === "topology" || /all agents|global policy|permission|extension/.test(`${p.diff_summary} ${p.description}`.toLowerCase());
}
function isGovernedTarget(p: EvolutionProposal): boolean {
  return p.artifact_class === "prompt" || p.artifact_class === "skill" || p.artifact_class === "agent" || p.artifact_class === "topology";
}
function hasText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isHumanApprovalActor(value: unknown): value is string {
  return typeof value === "string" && /\b(human|manual|user)\b/i.test(value.trim());
}
function hasHumanApprovalEvent(p: EvolutionProposal): boolean {
  return (p.lifecycle_events ?? []).some((event) => event.action === "approved" && event.actor === p.approved_by && event.notes === p.reviewer_notes && isHumanApprovalActor(event.actor) && hasText(event.notes));
}
function stableProposalFingerprint(p: EvolutionProposal): string {
  const stable = {
    id: p.id,
    artifact_class: p.artifact_class,
    target_file: p.target_file,
    description: p.description,
    motivation: p.motivation,
    diff_summary: p.diff_summary,
    evidence: p.evidence,
    holdout_eval_result: p.holdout_eval_result ?? "",
    proposed_patch: p.proposed_patch ?? "",
    proposed_content: p.proposed_content ?? "",
    proposed_content_ref: p.proposed_content_ref ?? "",
    validation_commands: p.validation_commands ?? [],
    created_at: p.created_at,
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
function manualApprovalTemplate(p: EvolutionProposal): string {
  return JSON.stringify({ proposal_id: p.id, proposal_fingerprint: stableProposalFingerprint(p), approved_by: "human:<name-or-initials>", reviewer_notes: "<non-empty manual review notes>", approved_at: new Date().toISOString() }, null, 2);
}
function readManualApproval(piDir: string, id: string): ManualApprovalArtifact | null {
  if (!isSafeArtifactId(id)) return null;
  const fp = approvalPath(piDir, id);
  if (!fs.existsSync(fp)) return null;
  try { return JSON.parse(fs.readFileSync(fp, "utf-8")) as ManualApprovalArtifact; } catch { return null; }
}
function manualApprovalCheck(piDir: string, p: EvolutionProposal): { error: string | null; artifact?: ManualApprovalArtifact } {
  const artifact = readManualApproval(piDir, p.id);
  if (!artifact) return { error: `Manual approval artifact is missing. A human must create ${path.relative(path.dirname(piDir), approvalPath(piDir, p.id)).replace(/\\/g, "/")} with:\n${manualApprovalTemplate(p)}` };
  if (artifact.proposal_id !== p.id) return { error: "Manual approval artifact proposal_id does not match proposal id." };
  if (artifact.proposal_fingerprint !== stableProposalFingerprint(p)) return { error: "Manual approval artifact fingerprint does not match the current proposal." };
  if (!isHumanApprovalActor(artifact.approved_by)) return { error: "Manual approval artifact approved_by must identify a human/manual/user actor." };
  if (!hasText(artifact.reviewer_notes)) return { error: "Manual approval artifact requires non-empty reviewer_notes." };
  if (p.approved_by && p.approved_by !== artifact.approved_by) return { error: "Proposal approved_by does not match the manual approval artifact actor." };
  if (p.reviewer_notes && p.reviewer_notes !== artifact.reviewer_notes) return { error: "Proposal reviewer_notes do not match the manual approval artifact notes." };
  return { error: null, artifact };
}
function approvalGateCheck(piDir: string, p: EvolutionProposal): string | null {
  if (p.approval_required !== true) return "Governed evolution targets require approval_required=true.";
  const manual = manualApprovalCheck(piDir, p); if (manual.error) return manual.error;
  if (!isHumanApprovalActor(p.approved_by)) return "Promotion requires approved_by to match a human/manual/user approval artifact.";
  if (!hasText(p.reviewer_notes)) return "Promotion requires non-empty approval notes from the manual approval artifact.";
  if (!hasHumanApprovalEvent(p)) return "Promotion requires an approved lifecycle event matching the manual approval artifact actor and notes.";
  return null;
}
function allowedTarget(p: EvolutionProposal): boolean {
  const rel = p.target_file.replace(/\\/g, "/");
  if (rel.includes("..") || path.isAbsolute(rel)) return false;
  if (p.artifact_class === "prompt") return /^\.pi\/prompts\/.+\.md$/.test(rel);
  if (p.artifact_class === "skill") return /^\.pi\/skills\/[^/]+\/(SKILL|REFERENCE)\.md$/.test(rel);
  if (p.artifact_class === "agent") return /^\.pi\/agents\/.+\.md$/.test(rel);
  if (p.artifact_class === "topology") return /^\.pi\/curricula\/|^workflow-f-demo\//.test(rel);
  return false;
}
function proposedContent(piDir: string, p: EvolutionProposal): string | null {
  if (typeof p.proposed_content === "string") return p.proposed_content;
  if (p.proposed_content_ref) {
    const ref = p.proposed_content_ref.replace(/\\/g, "/");
    if (ref.includes("..") || path.isAbsolute(ref)) return null;
    const fp = path.join(path.dirname(piDir), ref);
    if (fs.existsSync(fp)) return fs.readFileSync(fp, "utf-8");
  }
  return null;
}
function snapshotTarget(piDir: string, p: EvolutionProposal): string {
  const target = path.join(path.dirname(piDir), p.target_file);
  const ref = `${p.id}-${Date.now()}-${path.basename(p.target_file)}.snapshot`;
  const dest = path.join(snapshotDir(piDir), ref);
  fs.writeFileSync(dest, fs.existsSync(target) ? fs.readFileSync(target) : "", "utf-8");
  return path.relative(piDir, dest).replace(/\\/g, "/");
}
function promoteCheck(piDir: string, p: EvolutionProposal): string | null {
  if (p.status !== "approved") return "Only approved proposals can be promoted.";
  const safety = checkSafetyGate(p); if (!safety.passed || p.safety_gate_passed === false) return `Safety gate failed: ${safety.reason}`;
  if (!p.regression_gate_passed && !(p.holdout_eval_result && p.holdout_eval_result.trim().length > 10)) return "Promotion requires regression/holdout evidence.";
  if (!allowedTarget(p)) return "Target path is not in the promotion allowlist.";
  const approvalBlocked = approvalGateCheck(piDir, p); if (approvalBlocked) return approvalBlocked;
  const content = proposedContent(piDir, p);
  if (!content && !p.proposed_patch) return "Promotion requires proposed_content, proposed_content_ref, or proposed_patch.";
  if (p.proposed_patch && !content) return "Patch application is intentionally not automatic; provide full proposed_content or proposed_content_ref.";
  return null;
}
function nextActions(p: EvolutionProposal): string { return p.status === "proposed" ? "approve/reject" : p.status === "approved" ? "promote/reject" : p.status === "promoted" ? "rollback" : "none"; }

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;
  pi.on("session_start", async (_event, ctx) => { basePiDir = PACKAGE_PI_DIR; });

  pi.registerTool({
    name: "propose_evolution", label: "Propose Evolution", description: "Create a governed evolution proposal; does not apply changes.",
    parameters: Type.Object({
      artifact_class: StringEnum(["prompt", "skill", "agent", "topology", "routing_rule", "memory_policy", "tool_description"] as const),
      target_file: Type.String(), description: Type.String(), motivation: Type.String(), diff_summary: Type.String(), evidence: Type.String(),
      holdout_eval_result: Type.Optional(Type.String()), proposed_content: Type.Optional(Type.String()), proposed_content_ref: Type.Optional(Type.String()), proposed_patch: Type.Optional(Type.String()), validation_commands: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params) {
      if (!basePiDir) return { content: [{ type: "text", text: "Evolution governor not initialized" }], isError: true };
      const id = `ep-${Date.now()}-${generateId()}`;
      const proposal: EvolutionProposal = { id, artifact_class: params.artifact_class, target_file: params.target_file, description: params.description, motivation: params.motivation, diff_summary: params.diff_summary, evidence: params.evidence, holdout_eval_result: params.holdout_eval_result, proposed_content: params.proposed_content, proposed_content_ref: params.proposed_content_ref, proposed_patch: params.proposed_patch, validation_commands: params.validation_commands ?? [], status: "proposed", created_at: new Date().toISOString() };
      proposal.safety_gate_passed = checkSafetyGate(proposal).passed; proposal.regression_gate_passed = !!(proposal.holdout_eval_result && proposal.holdout_eval_result.trim().length > 10); proposal.approval_required = true; addEvent(proposal, "proposed", "Proposal recorded; promotion requires approval and snapshot."); writeProposal(basePiDir, proposal);
      return { content: [{ type: "text", text: `Evolution proposal created: ${id}\nStatus: proposed\nManual approval fingerprint: ${stableProposalFingerprint(proposal)}\nNext: have a human create .pi/evolution-approvals/${id}.json, then run /evolution-approve ${id}; or /evolution-reject ${id} <reason>` }], details: proposal };
    },
  });

  // Intentionally no approve_evolution tool: agents must not be able to self-approve by passing arbitrary approved_by/notes.
  // Approval requires an external manual artifact under .pi/evolution-approvals/<id>.json, then the slash command verifies it.
  pi.registerTool({ name: "reject_evolution", label: "Reject Evolution", description: "Reject a proposed or approved evolution.", parameters: Type.Object({ id: Type.String(), reason: Type.String() }), async execute(_id, params) { return lifecycleReject(basePiDir, params.id, params.reason); } });
  pi.registerTool({ name: "promote_evolution", label: "Promote Evolution", description: "Apply an approved proposal after gates and snapshot creation.", parameters: Type.Object({ id: Type.String() }), async execute(_id, params) { return lifecyclePromote(basePiDir, params.id); } });
  pi.registerTool({ name: "rollback_evolution", label: "Rollback Evolution", description: "Restore a promoted proposal from its snapshot.", parameters: Type.Object({ id: Type.String(), reason: Type.String() }), async execute(_id, params) { return lifecycleRollback(basePiDir, params.id, params.reason); } });

  function notifyResult(ctx: { ui: { notify: (message: string, level?: string) => void } }, result: { content: Array<{ text?: string }>; isError?: boolean }) { ctx.ui.notify(result.content.map((c) => c.text ?? "").join("\n"), result.isError ? "error" : "info"); }
  pi.registerCommand("evolution-approve", { description: "Verify manual approval artifact and approve a proposal. Usage: /evolution-approve <id>", handler: async (args, ctx) => { notifyResult(ctx, await lifecycleApprove(basePiDir, args.trim().split(/\s+/)[0])); } });
  pi.registerCommand("evolution-reject", { description: "Reject a proposal. Usage: /evolution-reject <id> <reason>", handler: async (args, ctx) => { const [id, ...rest] = args.trim().split(/\s+/); notifyResult(ctx, await lifecycleReject(basePiDir, id, rest.join(" ") || "No reason provided")); } });
  pi.registerCommand("evolution-promote", { description: "Promote an approved proposal. Usage: /evolution-promote <id>", handler: async (args, ctx) => { notifyResult(ctx, await lifecyclePromote(basePiDir, args.trim().split(/\s+/)[0])); } });
  pi.registerCommand("evolution-rollback", { description: "Rollback a promoted proposal. Usage: /evolution-rollback <id> <reason>", handler: async (args, ctx) => { const [id, ...rest] = args.trim().split(/\s+/); notifyResult(ctx, await lifecycleRollback(basePiDir, id, rest.join(" ") || "Rollback requested")); } });
  pi.registerCommand("evolution-log", { description: "Show all evolution proposals and lifecycle state", handler: async (_args, ctx) => { if (!basePiDir) return ctx.ui.notify("Evolution governor not initialized", "error"); const proposals = listProposals(basePiDir); const lines = proposals.slice(-15).map((p) => `${p.id} [${p.status}] ${p.artifact_class}→${p.target_file}\n  approval:${p.approval_required ? "required" : "not-required"} safety:${p.safety_gate_passed ? "✓" : "?"} regression:${p.regression_gate_passed ? "✓" : "?"} next:${nextActions(p)}\n  evidence:${String(p.evidence || "").slice(0, 90)}`); ctx.ui.notify(lines.length ? `${proposals.length} proposal(s):\n\n${lines.join("\n\n")}` : "No evolution proposals recorded.", "info"); } });
  pi.registerCommand("evolution-pending", { description: "Show pending evolution proposals and next actions", handler: async (_args, ctx) => { if (!basePiDir) return ctx.ui.notify("Evolution governor not initialized", "error"); const pending = listProposals(basePiDir).filter((p) => p.status === "proposed" || p.status === "approved"); const lines = pending.map((p) => `${p.id} [${p.status}] ${p.artifact_class} ${p.target_file}\n  gates safety:${p.safety_gate_passed ? "✓" : "?"} regression:${p.regression_gate_passed ? "✓" : "?"}\n  fingerprint:${stableProposalFingerprint(p)}\n  validation:${(p.validation_commands ?? []).join("; ") || "not recorded"}\n  next:${nextActions(p)} — create .pi/evolution-approvals/${p.id}.json then /evolution-approve ${p.id}; /evolution-reject; /evolution-promote`); ctx.ui.notify(lines.length ? `${pending.length} pending proposal(s):\n\n${lines.join("\n\n")}` : "No pending evolution proposals.", "info"); } });
}

async function lifecycleApprove(piDir: string | null, id: string) {
  if (!piDir || !id) return { content: [{ type: "text", text: "Usage: /evolution-approve <id> after a human creates .pi/evolution-approvals/<id>.json" }], isError: true };
  const p = readProposal(piDir, id); if (!p) return { content: [{ type: "text", text: `Proposal not found: ${id}` }], isError: true };
  if (p.status !== "proposed") return { content: [{ type: "text", text: `Invalid transition ${p.status} -> approved` }], isError: true };
  const manual = manualApprovalCheck(piDir, p);
  if (manual.error || !manual.artifact) return { content: [{ type: "text", text: `Approval blocked: ${manual.error}` }], isError: true };
  p.approval_required = true; p.status = "approved"; p.reviewed_at = new Date().toISOString(); p.reviewer_notes = manual.artifact.reviewer_notes.trim(); p.approved_by = manual.artifact.approved_by.trim(); addEvent(p, "approved", p.reviewer_notes, p.approved_by); writeProposal(piDir, p);
  return { content: [{ type: "text", text: `Approved ${id} using manual approval artifact. No files changed. Next: /evolution-promote ${id}` }], details: p };
}
async function lifecycleReject(piDir: string | null, id: string, reason: string) {
  if (!piDir || !id) return { content: [{ type: "text", text: "Usage: reject_evolution/evolution-reject <id> <reason>" }], isError: true };
  const p = readProposal(piDir, id); if (!p) return { content: [{ type: "text", text: `Proposal not found: ${id}` }], isError: true };
  if (!(p.status === "proposed" || p.status === "approved")) return { content: [{ type: "text", text: `Invalid transition ${p.status} -> rejected` }], isError: true };
  p.status = "rejected"; p.reviewed_at = new Date().toISOString(); p.rejected_reason = reason; addEvent(p, "rejected", reason); writeProposal(piDir, p);
  return { content: [{ type: "text", text: `Rejected ${id}: ${reason}` }], details: p };
}
async function lifecyclePromote(piDir: string | null, id: string) {
  if (!piDir || !id) return { content: [{ type: "text", text: "Usage: promote_evolution/evolution-promote <id>" }], isError: true };
  const p = readProposal(piDir, id); if (!p) return { content: [{ type: "text", text: `Proposal not found: ${id}` }], isError: true };
  const blocked = promoteCheck(piDir, p); if (blocked) return { content: [{ type: "text", text: `Promotion blocked: ${blocked}` }], isError: true };
  const content = proposedContent(piDir, p)!; const root = path.dirname(piDir); const target = path.join(root, p.target_file); p.promoted_target_existed = fs.existsSync(target); p.promoted_snapshot_ref = snapshotTarget(piDir, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, "utf-8"); p.status = "promoted"; p.promoted_at = new Date().toISOString(); addEvent(p, "promoted", `Snapshot: ${p.promoted_snapshot_ref}`); writeProposal(piDir, p);
  return { content: [{ type: "text", text: `Promoted ${id} to ${p.target_file}. Snapshot: ${p.promoted_snapshot_ref}` }], details: p };
}
async function lifecycleRollback(piDir: string | null, id: string, reason: string) {
  if (!piDir || !id) return { content: [{ type: "text", text: "Usage: rollback_evolution/evolution-rollback <id> <reason>" }], isError: true };
  const p = readProposal(piDir, id); if (!p) return { content: [{ type: "text", text: `Proposal not found: ${id}` }], isError: true };
  if (p.status !== "promoted") return { content: [{ type: "text", text: `Invalid transition ${p.status} -> rolled_back` }], isError: true };
  if (!p.promoted_snapshot_ref) return { content: [{ type: "text", text: "No promotion snapshot is recorded." }], isError: true };
  const snapshot = path.join(piDir, p.promoted_snapshot_ref); if (!fs.existsSync(snapshot)) return { content: [{ type: "text", text: `Snapshot missing: ${p.promoted_snapshot_ref}` }], isError: true };
  const target = path.join(path.dirname(piDir), p.target_file); p.rollback_snapshot_ref = snapshotTarget(piDir, p); if (p.promoted_target_existed === false) { if (fs.existsSync(target)) fs.unlinkSync(target); } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, fs.readFileSync(snapshot, "utf-8"), "utf-8"); } p.status = "rolled_back"; p.rolled_back_at = new Date().toISOString(); p.rollback_reason = reason; addEvent(p, "rolled_back", reason); writeProposal(piDir, p);
  return { content: [{ type: "text", text: `Rolled back ${id}: ${reason}` }], details: p };
}
