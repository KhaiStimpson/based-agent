/** Proposal-only autonomous evolution scanner. Never edits governed artifacts. */
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



interface Finding { artifact_class: string; target_file: string; trigger: string; severity: "info" | "warning" | "safety"; evidence_refs: string[]; description: string; }
function walk(dir: string): string[] { if (!fs.existsSync(dir)) return []; const out: string[] = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const fp = path.join(dir, e.name); if (e.isDirectory()) out.push(...walk(fp)); else out.push(fp); } return out; }
function rel(piDir: string, fp: string): string { return path.relative(piDir, fp).replace(/\\/g, "/"); }
function fingerprint(f: Finding): string { return crypto.createHash("sha256").update(`${f.artifact_class}|${f.target_file}|${f.trigger}|${f.evidence_refs.sort().join(",")}`).digest("hex").slice(0, 16); }
function proposalDir(piDir: string): string { const d = path.join(piDir, "evolution-proposals"); fs.mkdirSync(d, { recursive: true }); return d; }
function openFingerprints(piDir: string): Set<string> {
  const set = new Set<string>();
  for (const fp of walk(proposalDir(piDir)).filter((f) => f.endsWith(".json"))) {
    try { const p = JSON.parse(fs.readFileSync(fp, "utf-8")); if (["proposed", "approved"].includes(p.status) && p.fingerprint) set.add(p.fingerprint); } catch { /* skip */ }
  }
  return set;
}
function scan(piDir: string): Finding[] {
  const findings: Finding[] = [];
  const summaries = walk(path.join(piDir, "runs")).filter((f) => f.endsWith("-summary.json")).slice(-100);
  const lowConfidence = summaries.filter((fp) => { try { const j = JSON.parse(fs.readFileSync(fp, "utf-8")); return j.auto_generated && j.verdict === "needs_refinement"; } catch { return false; } });
  if (lowConfidence.length >= 2) findings.push({ artifact_class: "prompt", target_file: ".pi/prompts/workflow-d-refinement.md", trigger: "repeated-low-confidence-auto-summaries", severity: "warning", evidence_refs: lowConfidence.slice(-5).map((f) => rel(piDir, f)), description: "Repeated auto-generated summaries lacked enough validation evidence; consider strengthening refinement/validation prompts." });
  const noValidation = summaries.filter((fp) => { try { const j = JSON.parse(fs.readFileSync(fp, "utf-8")); return !j.tests_passed?.length && /validation/i.test(JSON.stringify(j.remaining_risks ?? [])); } catch { return false; } });
  if (noValidation.length >= 2) findings.push({ artifact_class: "skill", target_file: ".pi/skills/repo-validation/SKILL.md", trigger: "missing-validation-recurs", severity: "warning", evidence_refs: noValidation.slice(-5).map((f) => rel(piDir, f)), description: "Multiple attempts ended without passing validation evidence; consider improving repo-validation guidance." });
  const traces = walk(path.join(piDir, "mas-traces")).filter((f) => f.endsWith(".jsonl")).slice(-50);
  const safetyRefs = traces.filter((fp) => /safety|blocked|credential|secret/i.test(fs.readFileSync(fp, "utf-8"))).map((f) => rel(piDir, f));
  if (safetyRefs.length >= 1) findings.push({ artifact_class: "prompt", target_file: ".pi/prompts/workflow-b-standard.md", trigger: "safety-warning-observed", severity: "safety", evidence_refs: safetyRefs.slice(-5), description: "Safety-related trace warnings were observed; consider making safety checks more explicit in standard workflow guidance." });
  return findings.filter((f) => f.severity === "safety" || f.evidence_refs.length >= 2).slice(0, 5);
}
function writeProposal(piDir: string, finding: Finding): string | null {
  const fp = fingerprint(finding);
  if (openFingerprints(piDir).has(fp)) return null;
  const id = `scan-${Date.now()}-${fp}`;
  const proposal = {
    id, fingerprint: fp, artifact_class: finding.artifact_class, target_file: finding.target_file, description: finding.description,
    motivation: finding.trigger, diff_summary: "Scanner proposal only; no patch was applied.", evidence: finding.evidence_refs.join("; "), evidence_refs: finding.evidence_refs,
    status: "proposed", approval_required: true, safety_gate_passed: finding.severity !== "safety" ? true : false, regression_gate_passed: false,
    validation_commands: [], lifecycle_events: [{ at: new Date().toISOString(), action: "proposed_by_scanner", notes: "Proposal-only scanner wrote metadata; governed artifacts unchanged." }], created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(proposalDir(piDir), `${id}.json`), JSON.stringify(proposal, null, 2), "utf-8");
  return id;
}
export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;
  pi.on("session_start", async (_event, ctx) => { basePiDir = PACKAGE_PI_DIR; });
  pi.registerCommand("evolution-scan", { description: "Scan for evolution opportunities. Use /evolution-scan --write to create proposal JSON only.", handler: async (args, ctx) => {
    const piDir = basePiDir ?? PACKAGE_PI_DIR; const findings = scan(piDir); const write = /(^|\s)--write(\s|$)/.test(args);
    const created: string[] = []; if (write) for (const f of findings) { const id = writeProposal(piDir, f); if (id) created.push(id); }
    const lines = findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.trigger} → ${f.target_file}\n   evidence: ${f.evidence_refs.length} ref(s)\n   ${f.description}`);
    ctx.ui.notify(`${findings.length} evolution scan finding(s).${write ? ` Created ${created.length} proposal(s): ${created.join(", ") || "none (duplicates skipped)"}` : " No files written; add --write to create proposals."}\n\n${lines.join("\n\n") || "No conservative findings."}`, "info");
  } });
}
