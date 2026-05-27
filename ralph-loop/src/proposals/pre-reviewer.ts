import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { piComplete } from '../llm/pi-client.js';
import { extractJSON } from '../llm/ollama.js';
import { emit } from '../events/bus.js';
import { Proposal, PreReviewReport } from '../types.js';
import { savePreReview } from '../storage/pre-review.js';

const SYSTEM = `You are a senior AI architecture review board for a self-improving multi-agent coding system.
You review pending improvement proposals before human approval.
Your job: group complementary proposals, detect overlaps/conflicts, recommend accept/defer/reject/merge options, and preserve human authority.
Respond ONLY with valid JSON. No markdown.`;

interface RawBatch {
  title: string;
  verdict: 'accept-together' | 'accept-individually' | 'defer' | 'reject' | 'merge-option';
  proposalIds: string[];
  rationale: string;
  expectedBenefit: string;
  riskNotes: string[];
  batchScore: number;
  applyOrder?: string[];
}

interface RawConflict {
  title: string;
  conflictingProposalIds: string[];
  preferredProposalIds: string[];
  deferredProposalIds: string[];
  rationale: string;
  mergeProposal?: {
    title: string;
    summary: string;
    suggestedChange: string;
    targetFile?: string;
    rationale?: string;
  };
}

interface RawReport {
  summary: string;
  batches: RawBatch[];
  conflicts: RawConflict[];
}

interface LooseReport {
  summary?: string;
  batches?: RawBatch[];
  batchRecommendations?: RawBatch[];
  recommendations?: RawBatch[];
  groups?: RawBatch[];
  conflicts?: RawConflict[];
  conflictGroups?: RawConflict[];
}

function saveDebugResponse(raw: string): string {
  if (!existsSync(config.paths.data)) mkdirSync(config.paths.data, { recursive: true });
  const path = join(config.paths.data, 'debug-last-pre-review-response.txt');
  writeFileSync(path, raw, 'utf8');
  return path;
}

function normalizeReport(parsed: unknown): RawReport | null {
  // Some strong models return the batch array directly even when asked for an object.
  if (Array.isArray(parsed)) {
    return { summary: 'Cloud returned batch recommendations.', batches: parsed as RawBatch[], conflicts: [] };
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as LooseReport;
  const batches = p.batches ?? p.batchRecommendations ?? p.recommendations ?? p.groups;
  const conflicts = p.conflicts ?? p.conflictGroups ?? [];
  if (!Array.isArray(batches)) return null;
  return {
    summary: p.summary ?? '',
    batches,
    conflicts: Array.isArray(conflicts) ? conflicts : [],
  };
}

function compactProposal(p: Proposal): string {
  return [
    `ID: ${p.id}`,
    `TITLE: ${p.title}`,
    `SCORE: ${p.score}/100`,
    `TARGET: ${p.targetFile}${p.targetSection ? ' :: ' + p.targetSection : ''}`,
    `SUMMARY: ${p.summary}`,
    `CHANGE: ${p.suggestedChange}`,
    `EVIDENCE: ${(p.evidence ?? []).map((e) => e.title).slice(0, 3).join(' | ')}`,
    `HAS_PATCH: ${p.patch ? 'yes' : 'no'}`,
  ].join('\n');
}

function buildPrompt(pending: Proposal[], cycleId: number): string {
  const proposals = pending
    .sort((a, b) => b.score - a.score)
    .map((p, i) => `### Proposal ${i + 1}\n${compactProposal(p)}`)
    .join('\n\n---\n\n');

  return `Review these pending proposals at the 24-hour human checkpoint.\n\nCycle: ${cycleId}\nPending proposals: ${pending.length}\n\n${proposals}\n\nInstructions:\n- Identify proposals that are complementary and should be accepted together.\n- Identify proposals that overlap or conflict.\n- For conflicts, provide BOTH: (a) prefer-best/defer-rest recommendation and (b) a mergeProposal option when useful.\n- Do not auto-approve. Human remains final authority.\n- Prefer smaller coherent batches over one giant batch unless all are clearly complementary.\n- Consider patch conflict risk, conceptual overlap, target file overlap, and implementation order.\n\nReturn JSON only:\n{\n  "summary": "<overall checkpoint recommendation>",\n  "batches": [\n    {\n      "title": "<batch name>",\n      "verdict": "accept-together|accept-individually|defer|reject|merge-option",\n      "proposalIds": ["<id>"],\n      "rationale": "<why this batch/verdict>",\n      "expectedBenefit": "<combined benefit>",\n      "riskNotes": ["<risk 1>"],\n      "batchScore": <0-100>,\n      "applyOrder": ["<id in recommended application order>"]\n    }\n  ],\n  "conflicts": [\n    {\n      "title": "<conflict title>",\n      "conflictingProposalIds": ["<id>"],\n      "preferredProposalIds": ["<best id(s)>"] ,\n      "deferredProposalIds": ["<defer id(s)>"] ,\n      "rationale": "<why>",\n      "mergeProposal": {\n        "title": "<optional merged alternative>",\n        "summary": "<summary>",\n        "suggestedChange": "<merged approach>",\n        "targetFile": "<optional target>",\n        "rationale": "<optional rationale>"\n      }\n    }\n  ]\n}`;
}

export async function runPreReview(pending: Proposal[], cycleId: number): Promise<PreReviewReport | null> {
  if (pending.length === 0) return null;
  if (!config.cloud.enabled) {
    emit({ type: 'warn', level: 'warn', cycleId, message: 'Pre-review skipped: cloud model disabled' });
    return null;
  }

  emit({ type: 'info', level: 'info', cycleId, message: `Cloud pre-review: reviewing ${pending.length} pending proposals…` });

  let raw: string;
  try {
    raw = await piComplete(buildPrompt(pending, cycleId), SYSTEM, 300_000);
  } catch (e) {
    emit({ type: 'error', level: 'error', cycleId, message: `Cloud pre-review failed: ${String(e).slice(0, 120)}` });
    return null;
  }

  const parsedUnknown = extractJSON<unknown>(raw);
  const parsed = normalizeReport(parsedUnknown);
  if (!parsed) {
    const path = saveDebugResponse(raw);
    emit({ type: 'warn', level: 'warn', cycleId, message: `Cloud pre-review returned unparseable JSON — saved to ${path}` });
    return null;
  }

  const validIds = new Set(pending.map((p) => p.id));
  const report: PreReviewReport = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    cycleId,
    model: config.cloud.model,
    summary: parsed.summary ?? '',
    proposalCount: pending.length,
    batches: parsed.batches.map((b) => ({
      id: uuidv4(),
      title: b.title ?? 'Untitled batch',
      verdict: b.verdict ?? 'defer',
      proposalIds: (b.proposalIds ?? []).filter((id) => validIds.has(id)),
      rationale: b.rationale ?? '',
      expectedBenefit: b.expectedBenefit ?? '',
      riskNotes: Array.isArray(b.riskNotes) ? b.riskNotes : [],
      batchScore: Math.min(100, Math.max(0, Number(b.batchScore) || 0)),
      applyOrder: (b.applyOrder ?? b.proposalIds ?? []).filter((id) => validIds.has(id)),
    })).filter((b) => b.proposalIds.length > 0),
    conflicts: (parsed.conflicts ?? []).map((c) => ({
      id: uuidv4(),
      title: c.title ?? 'Potential conflict',
      conflictingProposalIds: (c.conflictingProposalIds ?? []).filter((id) => validIds.has(id)),
      preferredProposalIds: (c.preferredProposalIds ?? []).filter((id) => validIds.has(id)),
      deferredProposalIds: (c.deferredProposalIds ?? []).filter((id) => validIds.has(id)),
      rationale: c.rationale ?? '',
      mergeProposal: c.mergeProposal,
    })).filter((c) => c.conflictingProposalIds.length > 0),
  };

  savePreReview(report);
  emit({ type: 'info', level: 'success', cycleId, message: `Cloud pre-review ready — ${report.batches.length} batches, ${report.conflicts.length} conflicts` });
  return report;
}
