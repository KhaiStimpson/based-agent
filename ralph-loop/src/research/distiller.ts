import { ResearchItem } from '../types.js';
import { fast, extractJSON } from '../llm/ollama.js';
import { config } from '../config.js';
import { emit } from '../events/bus.js';

// ─── System prompt ─────────────────────────────────────────────────────────────
// Keep this SHORT. Small models (phi4-mini) ignore long system prompts.
const SYSTEM_DISTILLER = `You are an AI research analyst. Respond ONLY with a valid JSON object. No markdown. No explanation. No code fences. Raw JSON only.`;

interface DistillResult {
  summary: string;
  insights: string[];
  relevanceScore: number;
  relevanceReason: string;
}

// ─── Prompt builder ────────────────────────────────────────────────────────────
// Deliberately compact so small models don't lose context.

function buildPrompt(item: ResearchItem): string {
  const kind = item.source === 'arxiv' ? 'research paper' : 'GitHub repository';
  const authorsLine = item.authors?.length
    ? `Authors: ${item.authors.slice(0, 3).join(', ')}\n`
    : '';
  // Hard-cap abstract at 800 chars — small models degrade on long inputs
  const text = (item.abstract || item.title).slice(0, 800);

  return (
    `Analyze this ${kind} for relevance to multi-agent AI systems.\n` +
    `Title: ${item.title}\n` +
    `${authorsLine}` +
    `Text: ${text}\n\n` +
    `Return this JSON (no other text):\n` +
    `{"summary":"<2-3 sentences>","insights":["<insight1>","<insight2>"],"relevanceScore":<0-10>,"relevanceReason":"<1 sentence>"}`
  );
}

// ─── Fallback heuristic scoring ────────────────────────────────────────────────
// If the model completely fails to produce JSON, score based on keyword matches
// rather than silently dropping the item at score 0.

const AGENT_KEYWORDS = [
  'agent', 'multi-agent', 'llm', 'language model', 'reinforcement',
  'reasoning', 'planning', 'tool use', 'rag', 'retrieval', 'memory',
  'evaluation', 'benchmark', 'prompt', 'fine-tuning', 'alignment',
  'self-evolv', 'self-improv', 'orchestrat', 'workflow', 'autonomy',
];

function heuristicScore(item: ResearchItem): number {
  const hay = `${item.title} ${item.abstract}`.toLowerCase();
  const hits = AGENT_KEYWORDS.filter((kw) => hay.includes(kw)).length;
  // 0 hits → 3, 1 hit → 5, 2+ hits → 6-8, generous enough to not drop good papers
  if (hits === 0) return 3;
  if (hits === 1) return 5;
  if (hits <= 3) return 6;
  if (hits <= 5) return 7;
  return 8;
}

// ─── Single-item distillation ──────────────────────────────────────────────────

export async function distillItem(item: ResearchItem): Promise<ResearchItem> {
  const prompt = buildPrompt(item);

  try {
    const raw = await fast(prompt, SYSTEM_DISTILLER, {
      temperature: 0.2,
      numPredict: 512,   // Short output keeps latency low
      jsonMode: true,    // Instructs Ollama to enforce valid JSON
    });

    const result = extractJSON<DistillResult>(raw);

    if (!result || typeof result.relevanceScore !== 'number') {
      // Partial parse — salvage what we can
      const score = typeof result?.relevanceScore === 'number'
        ? result.relevanceScore
        : heuristicScore(item);
      console.warn(`[distiller] partial JSON for ${item.id} \u2014 using heuristic score ${score}`);
      return {
        ...item,
        summary: result?.summary || item.abstract.slice(0, 200),
        insights: result?.insights || [],
        relevanceScore: score,
      };
    }

    return {
      ...item,
      summary: result.summary ?? '',
      insights: Array.isArray(result.insights) ? result.insights : [],
      relevanceScore: Math.min(10, Math.max(0, Number(result.relevanceScore) || 0)),
    };
  } catch (e) {
    const score = heuristicScore(item);
    console.warn(`[distiller] Ollama error for ${item.id}: ${e} \u2014 heuristic score ${score}`);
    return {
      ...item,
      relevanceScore: score,
      summary: item.abstract.slice(0, 200),
      insights: [],
    };
  }
}

// ─── Batch distillation ────────────────────────────────────────────────────────
// Run sequentially — phi4-mini on a single consumer GPU handles one inference
// at a time anyway; parallel calls just queue in Ollama and add latency noise.

export async function distillBatch(items: ResearchItem[]): Promise<ResearchItem[]> {
  if (items.length === 0) return [];
  console.log(`[distiller] distilling ${items.length} items (threshold: ${config.loop.minRelevance}/10)`);

  const distilled: ResearchItem[] = [];

  for (const item of items) {
    emit({ type: 'distill-item', level: 'info',
      message: `Scoring: ${item.title.slice(0, 70)}` });
    const result = await distillItem(item);
    if ((result.relevanceScore ?? 0) >= config.loop.minRelevance) {
      distilled.push(result);
      emit({ type: 'distill-item', level: 'success',
        message: `✓ ${result.title.slice(0, 60)} (${result.relevanceScore}/10)` });
    } else {
      console.log(`[distiller] dropped "${result.title}" (score: ${result.relevanceScore})`);
      emit({ type: 'distill-item', level: 'info',
        message: `✗ ${result.title.slice(0, 60)} (${result.relevanceScore}/10 — below threshold)` });
    }
  }

  console.log(`[distiller] kept ${distilled.length}/${items.length} above threshold`);
  return distilled;
}

// ─── Batch summary for ranker ─────────────────────────────────────────────────

export function buildBatchSummary(items: ResearchItem[]): string {
  if (items.length === 0) return '(no new research this cycle)';
  return items
    .map(
      (item, i) =>
        `${i + 1}. [${item.source.toUpperCase()}] ${item.title}\n` +
        `   Score: ${item.relevanceScore}/10\n` +
        `   Summary: ${item.summary}\n` +
        `   Key insights: ${(item.insights ?? []).join(' | ')}`,
    )
    .join('\n\n');
}
