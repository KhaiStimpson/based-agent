import { quality, extractJSON } from '../llm/ollama.js';
import { piComplete } from '../llm/pi-client.js';
import { Proposal, ResearchItem } from '../types.js';

const SYSTEM_RANKER = `You are an AI systems evaluator. Score improvement proposals 0-25 per dimension. Respond ONLY with valid JSON. No markdown.`;

interface RankUpdate {
  id: string;
  novelty: number;
  impact: number;
  feasibility: number;
  evidenceQuality: number;
  reason: string;
}

/** Condense research items to a short keyword list — avoids bloating the prompt */
function researchKeywords(items: ResearchItem[]): string {
  return items
    .filter((i) => (i.insights?.length ?? 0) > 0)
    .slice(0, 5)
    .map((i) => `- ${i.title.slice(0, 60)}: ${(i.insights ?? []).join('; ').slice(0, 120)}`)
    .join('\n') || '(no new insights)';
}

async function rankBatch(
  batch: Proposal[],
  researchSummary: string,
  cycleId: number,
  useCloud = false,
  attempt = 1,
): Promise<Map<string, RankUpdate>> {
  const updatedMap = new Map<string, RankUpdate>();

  // Keep per-proposal text minimal — just id, short title, current score
  const proposalLines = batch
    .map((p) => `ID:${p.id} TITLE:${p.title.slice(0, 60)} SCORE:${p.score}`)
    .join('\n');

  const prompt =
    `New research insights:\n${researchSummary}\n\n` +
    `Re-score these proposals. For each return novelty/impact/feasibility/evidenceQuality (0-25 each) and a short reason.\n` +
    `Proposals:\n${proposalLines}\n\n` +
    `JSON array only:\n` +
    `[{"id":"...","novelty":N,"impact":N,"feasibility":N,"evidenceQuality":N,"reason":"..."}]`;

  try {
    const raw = useCloud
      ? await piComplete(prompt, SYSTEM_RANKER, 300_000)
      : await quality(prompt, SYSTEM_RANKER, {
          temperature: 0.2,
          numPredict: 400,
          jsonMode: true,
          timeoutMs: 240_000,
        });

    const updates = extractJSON<RankUpdate[]>(raw);
    if (Array.isArray(updates)) {
      for (const u of updates) {
        if (u.id) updatedMap.set(u.id, u);
      }
    }
  } catch (e) {
    const msg = String(e);
    if (attempt === 1 && (msg.includes('timeout') || msg.includes('aborted'))) {
      console.warn(`[ranker] timeout on batch of ${batch.length} — retrying with batch of 2`);
      // Retry with a smaller batch (first 2 only) to recover partial results
      const half = await rankBatch(batch.slice(0, 2), researchSummary, cycleId, useCloud, 2);
      half.forEach((v, k) => updatedMap.set(k, v));
    } else {
      console.warn('[ranker] re-rank error:', msg.slice(0, 200));
    }
  }

  return updatedMap;
}

/**
 * Re-rank all pending proposals against the latest research batch.
 * Returns the full proposal list with scores updated where the model responded.
 */
export async function reRankProposals(
  proposals: Proposal[],
  newResearch: ResearchItem[],
  cycleId: number,
  useCloud = false,
): Promise<Proposal[]> {
  const pending = proposals.filter((p) => p.status === 'pending');
  if (pending.length === 0) return proposals;

  const researchSummary = researchKeywords(newResearch);
  const BATCH_SIZE = 3;
  const updatedMap = new Map<string, RankUpdate>();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchUpdates = await rankBatch(batch, researchSummary, cycleId, useCloud);
    batchUpdates.forEach((v, k) => updatedMap.set(k, v));
  }

  if (updatedMap.size === 0) {
    console.log('[ranker] no scores returned — proposals unchanged');
    return proposals;
  }

  const now = new Date().toISOString();
  const updated = proposals.map((p) => {
    const u = updatedMap.get(p.id);
    if (!u || p.status !== 'pending') return p;

    const breakdown = {
      novelty:        Math.min(25, Math.max(0, u.novelty)),
      impact:         Math.min(25, Math.max(0, u.impact)),
      feasibility:    Math.min(25, Math.max(0, u.feasibility)),
      evidenceQuality: Math.min(25, Math.max(0, u.evidenceQuality)),
    };
    const newScore = breakdown.novelty + breakdown.impact + breakdown.feasibility + breakdown.evidenceQuality;

    return {
      ...p,
      score: newScore,
      scoreBreakdown: breakdown,
      scoreHistory: [
        ...p.scoreHistory,
        { score: newScore, reason: u.reason ?? '', cycleId, timestamp: now },
      ],
      updatedAt: now,
    };
  });

  const changed = updated.filter((p, i) => p.score !== proposals[i]?.score).length;
  console.log(`[ranker] re-ranked ${updatedMap.size}/${pending.length} proposals (${changed} scores changed)`);
  return updated;
}
