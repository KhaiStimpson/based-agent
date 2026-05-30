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
  applyMode?: 'individual' | 'custom-merged' | 'manual';
  mergedPatch?: string | null;
  mergeRationale?: string;
  mergeWarnings?: string[];
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

function compactProposal(p: Proposal, includePatch = true): string {
  return [
    `ID: ${p.id}`,
    `TITLE: ${p.title}`,
    `SCORE: ${p.score}/100`,
    `TARGET: ${p.targetFile}${p.targetSection ? ' :: ' + p.targetSection : ''}`,
    `SUMMARY: ${p.summary}`,
    `CHANGE: ${p.suggestedChange}`,
    `EVIDENCE: ${(p.evidence ?? []).map((e) => e.title).slice(0, 3).join(' | ')}`,
    `HAS_PATCH: ${p.patch ? 'yes' : 'no'}`,
    includePatch && p.patch ? `PATCH_PREVIEW:\n\`\`\`diff\n${p.patch.slice(0, 2400)}\n\`\`\`` : '',
  ].filter(Boolean).join('\n');
}

function buildPrompt(pending: Proposal[], cycleId: number, compact = false): string {
  const proposals = pending
    .sort((a, b) => b.score - a.score)
    .map((p, i) => compact
      ? `#${i + 1} ID:${p.id} SCORE:${p.score} TARGET:${p.targetFile} TITLE:${p.title.slice(0, 90)} CHANGE:${p.suggestedChange.slice(0, 160)} HAS_PATCH:${p.patch ? 'yes' : 'no'}`
      : `### Proposal ${i + 1}\n${compactProposal(p, true)}`)
    .join(compact ? '\n' : '\n\n---\n\n');

  return `Review pending proposals at the 24-hour human checkpoint.\n\nCycle: ${cycleId}\nPending proposals: ${pending.length}\n\n${proposals}\n\nInstructions:\n- Prefer small, low-risk batches; do not combine proposals merely because they are pending.\n- Only use accept-together when patches are independent or intentionally integrated.\n- For overlapping patch proposals, prefer merge-option with a custom mergedPatch that combines compatible intent and drops risky/conflicting hunks.\n- If no safe combined patch is possible, recommend prefer-best/defer-rest or manual.\n- Flag overlaps/conflicts and explain risk reduction, not just apply order.\n- Human remains final authority.\n- HARD OUTPUT LIMITS: max 8 batches, max 6 conflicts, max 3 riskNotes per batch.\n- Keep every non-patch string under 220 characters. No paragraphs. No markdown outside JSON.\n\nReturn compact JSON only:\n{\n  "summary": "<one sentence>",\n  "batches": [\n    {\n      "title": "<short batch name>",\n      "verdict": "accept-together|accept-individually|defer|reject|merge-option",\n      "proposalIds": ["<id>"],\n      "rationale": "<one sentence>",\n      "expectedBenefit": "<one sentence>",\n      "riskNotes": ["<short risk>"],\n      "batchScore": <0-100>,\n      "applyOrder": ["<id>"],\n      "applyMode": "individual|custom-merged|manual",\n      "mergedPatch": "<optional unified diff using knowledge from included patches, or null>",\n      "mergeRationale": "<why this custom patch lowers risk>",\n      "mergeWarnings": ["<short risk>"]\n    }\n  ],\n  "conflicts": [\n    {\n      "title": "<short conflict title>",\n      "conflictingProposalIds": ["<id>"],\n      "preferredProposalIds": ["<id>"],\n      "deferredProposalIds": ["<id>"],\n      "rationale": "<one sentence>",\n      "mergeProposal": {\n        "title": "<short merged option>",\n        "summary": "<one sentence>",\n        "suggestedChange": "<one sentence>",\n        "targetFile": "<optional>",\n        "rationale": "<one sentence>"\n      }\n    }\n  ]\n}`;
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
    raw = await piComplete(buildPrompt(pending, cycleId, false), SYSTEM, 300_000);
  } catch (e) {
    emit({ type: 'error', level: 'error', cycleId, message: `Cloud pre-review failed: ${String(e).slice(0, 120)}` });
    return null;
  }

  let parsed = normalizeReport(extractJSON<unknown>(raw));

  // If the model over-produced and response was truncated, retry once with an ultra-compact prompt.
  if (!parsed) {
    const path = saveDebugResponse(raw);
    emit({ type: 'warn', level: 'warn', cycleId, message: `Cloud pre-review JSON failed — saved to ${path}; retrying compact mode…` });
    try {
      raw = await piComplete(buildPrompt(pending, cycleId, true), SYSTEM, 300_000);
      parsed = normalizeReport(extractJSON<unknown>(raw));
    } catch (e) {
      emit({ type: 'error', level: 'error', cycleId, message: `Compact pre-review retry failed: ${String(e).slice(0, 120)}` });
      return null;
    }
  }

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
      applyMode: b.applyMode ?? (b.mergedPatch ? 'custom-merged' : undefined),
      mergedPatch: b.mergedPatch && b.mergedPatch.includes('---') ? b.mergedPatch : undefined,
      mergeRationale: b.mergeRationale ?? '',
      mergeWarnings: Array.isArray(b.mergeWarnings) ? b.mergeWarnings : [],
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
