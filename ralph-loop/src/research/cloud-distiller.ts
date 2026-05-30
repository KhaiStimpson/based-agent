/**
 * cloud-distiller.ts
 *
 * Used in PIPELINE_MODE=cloud only.
 *
 * Replaces the phi4-mini distillation loop + separate keyword extraction with
 * a single gpt-5.5 batch call that:
 *   - Scores all pre-filtered items for relevance (0-10)
 *   - Writes a 2-3 sentence summary per item
 *   - Extracts 1-2 key insights per item
 *   - Surfaces 2-3 new search keywords from patterns across the whole batch
 *
 * Advantage over local distillation:
 *   - Reads raw abstracts, not phi4-mini's compressed summaries
 *   - Makes relevance decisions with full frontier model reasoning
 *   - Spots cross-paper patterns that suggest novel keywords
 *   - One call instead of N sequential phi4-mini calls
 */

import { ResearchItem } from '../types.js';
import { piComplete } from '../llm/pi-client.js';
import { extractJSON } from '../llm/ollama.js';
import { config } from '../config.js';
import { emit } from '../events/bus.js';
import { appendResearchScoring } from '../storage/research.js';
import { SeedCandidate, loadDynamicSeeds } from '../storage/seeds.js';
import { SEEDS } from './seeds.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudDistillResult {
  items: ResearchItem[];
  keywords: SeedCandidate[];
}

interface RawItemResult {
  id: string;
  relevanceScore: number;
  relevanceReason?: string;
  summary: string;
  insights: string[];
}

interface RawDistillResponse {
  items: RawItemResult[];
  keywords: Array<{ label: string; query: string; githubQuery: string }>;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are an AI research analyst scoring papers and repositories for relevance to multi-agent AI systems. Respond ONLY with valid JSON. No markdown. No preamble.`;

function existingSeedBlock(): string {
  return [
    ...SEEDS.map((s) => s.label),
    ...loadDynamicSeeds().slice(0, 30).map((s) => `${s.label} / ${s.query}`),
  ].join('\n- ');
}

function buildPrompt(items: ResearchItem[]): string {
  const itemsBlock = items
    .map((item, i) => {
      const authors = item.authors?.length
        ? `Authors: ${item.authors.slice(0, 3).join(', ')}\n`
        : '';
      return (
        `ITEM ${i + 1}\n` +
        `ID: ${item.id}\n` +
        `Source: ${item.source}\n` +
        `Title: ${item.title}\n` +
        `${authors}` +
        `Text: ${(item.abstract || '').slice(0, 700)}`
      );
    })
    .join('\n\n---\n\n');

  return (
    `Score these ${items.length} AI research items for relevance to multi-agent systems.\n\n` +
    `${itemsBlock}\n\n` +
    `---\n\n` +
    `Scoring guide:\n` +
    `  8-10  Direct technique improving multi-agent systems, LLM agents, or evaluation\n` +
    `  6-7   Relevant to AI agents, reasoning, planning, memory, or tool use\n` +
    `  4-5   Tangentially related (general ML, adjacent domains)\n` +
    `  1-3   Minimal relevance\n` +
    `  0     Unrelated\n\n` +
    `Existing search topics (do NOT repeat):\n- ${existingSeedBlock()}\n\n` +
    `Also extract 3-5 NEW, specific search keywords surfaced by patterns across the batch.\n` +
    `Prefer concrete method names, benchmarks, protocols, or failure modes over broad areas.\n` +
    `GitHub queries must be text search queries with stars:>50, never URLs.\n\n` +
    `Return JSON only:\n` +
    `{\n` +
    `  "items": [\n` +
    `    {\n` +
    `      "id": "<exact id from above>",\n` +
    `      "relevanceScore": <0-10>,\n` +
    `      "summary": "<2-3 sentences>",\n` +
    `      "relevanceReason": "<why this score was assigned>",\n` +
    `      "insights": ["<key technique 1>", "<key technique 2>"]\n` +
    `    }\n` +
    `  ],\n` +
    `  "keywords": [\n` +
    `    {\n` +
    `      "label": "<short topic name>",\n` +
    `      "query": "<3-6 word search phrase>",\n` +
    `      "githubQuery": "<github search with stars:>50>"\n` +
    `    }\n` +
    `  ]\n` +
    `}`
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Distil a batch of raw items using the cloud model.
 * Returns items scored above minRelevance plus extracted keywords.
 */
export async function cloudDistill(
  rawItems: ResearchItem[],
  cycleId: number,
): Promise<CloudDistillResult> {
  if (rawItems.length === 0) return { items: [], keywords: [] };

  emit({
    type: 'distill-start', level: 'info', cycleId,
    message: `Cloud distil: scoring ${rawItems.length} items with ${config.cloud.model}…`,
  });

  const prompt = buildPrompt(rawItems);

  let raw: string;
  try {
    raw = await piComplete(prompt, SYSTEM, 300_000);
  } catch (e) {
    emit({ type: 'error', level: 'error', cycleId,
      message: `Cloud distil failed: ${String(e).slice(0, 120)}` });
    console.error('[cloud-distiller] piComplete error:', e);
    return { items: [], keywords: [] };
  }

  const parsed = extractJSON<RawDistillResponse>(raw);
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    emit({ type: 'warn', level: 'warn', cycleId,
      message: 'Cloud distil: could not parse response JSON' });
    console.warn('[cloud-distiller] unparseable response:', raw.slice(0, 300));
    return { items: [], keywords: [] };
  }

  // Build a lookup from ID → raw item for enrichment
  const lookup = new Map(rawItems.map((i) => [i.id, i]));
  const now = new Date().toISOString();
  const threshold = config.loop.minRelevance; // use the configured threshold for final filtering
  const kept: ResearchItem[] = [];

  for (const r of parsed.items) {
    const base = lookup.get(r.id);
    if (!base) continue;

    const score = Math.min(10, Math.max(0, Number(r.relevanceScore) || 0));
    const enriched: ResearchItem = {
      ...base,
      summary: r.summary ?? '',
      insights: Array.isArray(r.insights) ? r.insights : [],
      relevanceScore: score,
      relevanceReason: r.relevanceReason ?? '',
      scoringModel: config.cloud.model,
      scoredAt: now,
      fetchedAt: base.fetchedAt ?? now,
    };

    const isKept = score >= threshold;
    appendResearchScoring({
      itemId: enriched.id,
      cycleId,
      source: enriched.source,
      title: enriched.title,
      url: enriched.url,
      abstract: enriched.abstract,
      publishedAt: enriched.publishedAt,
      model: config.cloud.model,
      pipeline: 'cloud',
      relevanceScore: score,
      threshold,
      kept: isKept,
      relevanceReason: enriched.relevanceReason ?? '',
      summary: enriched.summary ?? '',
      insights: enriched.insights ?? [],
      scoredAt: now,
    });

    if (isKept) {
      kept.push(enriched);
      emit({ type: 'distill-item', level: 'success', cycleId,
        researchItemId: enriched.id,
        score,
        threshold,
        relevanceReason: enriched.relevanceReason,
        message: `✓ ${base.title.slice(0, 60)} (${score}/10)` });
    } else {
      emit({ type: 'distill-item', level: 'info', cycleId,
        researchItemId: enriched.id,
        score,
        threshold,
        relevanceReason: enriched.relevanceReason,
        message: `✗ ${base.title.slice(0, 60)} (${score}/10 — below threshold)` });
    }
  }

  // Validate keywords
  const keywords: SeedCandidate[] = (parsed.keywords ?? [])
    .map((k) => {
      const query = String(k.query || '').toLowerCase().replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim();
      const githubQuery = String(k.githubQuery || `${query} stars:>50`).trim();
      return {
        label: String(k.label || '').replace(/[_+]+/g, ' ').slice(0, 80),
        query,
        githubQuery: githubQuery.includes('stars:') ? githubQuery : `${githubQuery} stars:>50`,
      };
    })
    .filter((k) => k.label && k.query && k.query.trim().split(/\s+/).length >= 2)
    .filter((k) => !/^https?:\/\//i.test(k.githubQuery))
    .filter((k) => !/^(llm|ai|agent|agents|multi-agent|rag)$/i.test(k.query))
    .slice(0, 6);

  emit({
    type: 'distill-end', level: 'success', cycleId,
    message: `Cloud distil complete — kept ${kept.length}/${rawItems.length}, ${keywords.length} keyword${keywords.length !== 1 ? 's' : ''} extracted`,
  });

  return { items: kept, keywords };
}
