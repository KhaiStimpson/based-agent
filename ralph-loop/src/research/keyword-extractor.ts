import { ResearchItem } from '../types.js';
import { fast, extractJSON } from '../llm/ollama.js';
import { SEEDS } from './seeds.js';
import { DynamicSeed } from '../types.js';
import { SeedCandidate } from '../storage/seeds.js';

const SYSTEM = `You are a research librarian. Respond ONLY with valid JSON. No markdown. No explanation.`;

interface ExtractedKeyword {
  label: string;       // Short human-readable topic, e.g. "Speculative Decoding Agents"
  query: string;       // Plain keyword phrase for Semantic Scholar / arxiv
  githubQuery: string; // Adapted for GitHub repo search
}

/**
 * Given a batch of distilled research items, ask phi4-mini to identify
 * NEW search topics not already covered by the current seed list.
 * Returns 0–4 candidates per call.
 */
export async function extractKeywords(
  items: ResearchItem[],
  existingDynamic: DynamicSeed[],
): Promise<SeedCandidate[]> {
  if (items.length === 0) return [];

  // Build a compact list of all current search terms to avoid redundancy
  const existingTerms = [
    ...SEEDS.map((s) => s.label),
    ...existingDynamic.slice(0, 20).map((s) => `${s.label} (×${s.frequency})`),
  ].join('\n- ');

  // Compact insight list — keep per-item text short for small models
  const insightText = items
    .filter((i) => (i.insights?.length ?? 0) > 0)
    .slice(0, 6)
    .map((i) => `• ${i.title}: ${(i.insights ?? []).join('; ')}`)
    .join('\n');

  if (!insightText) return [];

  const prompt =
    `Current search topics (do NOT repeat these):\n- ${existingTerms}\n\n` +
    `New research insights found this cycle:\n${insightText}\n\n` +
    `Extract 1-3 NEW specific search terms NOT already in the list above.\n` +
    `Focus on: technique names, algorithm names, specific method/framework names, or emerging concepts.\n` +
    `Avoid generic terms like "LLM" or "AI agent" alone.\n\n` +
    `Return JSON only:\n` +
    `{"keywords":[{"label":"<short topic name>","query":"<3-6 word search phrase>","githubQuery":"<github search, include stars:>50>"}]}`;

  try {
    const raw = await fast(prompt, SYSTEM, {
      temperature: 0.5,  // slightly creative to surface novel terms
      numPredict: 512,
      jsonMode: true,
    });

    const result = extractJSON<{ keywords: ExtractedKeyword[] }>(raw);
    if (!result?.keywords || !Array.isArray(result.keywords)) return [];

    // Validate and normalise each candidate
    const valid: SeedCandidate[] = [];
    for (const kw of result.keywords.slice(0, 4)) {
      if (!kw.label || !kw.query) continue;
      // Skip if the query is suspiciously short (likely a hallucination)
      if (kw.query.trim().split(/\s+/).length < 2) continue;
      valid.push({
        label: String(kw.label).slice(0, 80),
        query: String(kw.query).toLowerCase().trim(),
        githubQuery: String(kw.githubQuery || kw.query).trim(),
      });
    }
    return valid;
  } catch (e) {
    console.warn('[keyword-extractor] error:', e);
    return [];
  }
}
