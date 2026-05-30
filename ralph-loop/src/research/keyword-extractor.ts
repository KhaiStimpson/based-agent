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

  // Compact item list — prefer distilled insights, but fall back to title/abstract
  // so seed discovery still works when the distiller kept relevant items with
  // sparse insight fields.
  const insightText = items
    .slice(0, 10)
    .map((i) => {
      const insights = (i.insights ?? []).filter(Boolean).join('; ');
      const fallback = `${i.summary || i.abstract || ''}`.slice(0, 280);
      return `• ${i.title}: ${insights || fallback}`;
    })
    .join('\n');

  if (!insightText.trim()) return [];

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
      const query = String(kw.query).toLowerCase().replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim();
      // Skip if the query is suspiciously short/generic or duplicates a static seed label.
      if (query.split(/\s+/).length < 2) continue;
      if (/^(llm|ai|agent|agents|multi-agent|rag)$/i.test(query)) continue;
      const githubQuery = String(kw.githubQuery || `${query} stars:>50`).trim();
      if (/^https?:\/\//i.test(githubQuery)) continue;
      valid.push({
        label: String(kw.label).replace(/[_+]+/g, ' ').slice(0, 80),
        query,
        githubQuery: githubQuery.includes('stars:') ? githubQuery : `${githubQuery} stars:>50`,
      });
    }
    return valid;
  } catch (e) {
    console.warn('[keyword-extractor] error:', e);
    return [];
  }
}
