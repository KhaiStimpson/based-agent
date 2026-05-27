import { XMLParser } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { ResearchItem } from '../types.js';
import type { Seed } from './seeds.js';

const XML_PARSER = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ─── Seen-items deduplication ─────────────────────────────────────────────────

const seenIds = new Set<string>();
export function markSeen(id: string): void  { seenIds.add(id); }
export function isSeen(id: string): boolean { return seenIds.has(id); }
export function loadSeenFromStorage(ids: string[]): void {
  for (const id of ids) seenIds.add(id);
}

// ─── Generic rate-limit queue factory ────────────────────────────────────────
// Returns an enqueue() function that serialises calls behind a promise chain
// with a minimum gap between completions.

function makeQueue(gapMs: number) {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const slot = tail.then(() => fn());
    tail = slot.then(() => sleep(gapMs)).catch(() => sleep(gapMs));
    return slot;
  };
}

// arxiv:  5 req/min sustainable, so 12 s gap is safe (was still hitting 429 at 5 s)
const arxivEnqueue = makeQueue(12_000);
// S2:     100 req/5-min unauthenticated → ~1 req/s → 1.1 s gap is safe
const s2Enqueue    = makeQueue(1_100);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Semantic Scholar (PRIMARY academic source) ───────────────────────────────
// Indexes all arxiv papers, returns JSON, far more lenient rate limits than arxiv.
// Free key optional: https://www.semanticscholar.org/product/api#api-key

interface S2Paper {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  authors: Array<{ name: string }>;
  externalIds: { ArXiv?: string } | null;
  publicationDate: string | null;
}
interface S2Response { data: S2Paper[]; }

/** Extract plain keyword string from a seed's arxiv query (strip category filters) */
function s2Query(seed: Seed): string {
  return seed.arxiv.query
    .replace(/\+AND\+.*/i, '')   // drop category filters
    .replace(/\+/g, ' ')
    .trim();
}

export async function fetchSemanticScholar(seed: Seed): Promise<ResearchItem[]> {
  return s2Enqueue(() => fetchS2Inner(seed));
}

async function fetchS2Inner(seed: Seed): Promise<ResearchItem[]> {
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', s2Query(seed));
  url.searchParams.set('fields', 'paperId,title,abstract,year,authors,externalIds,publicationDate');
  url.searchParams.set('limit', String(config.loop.arxivResultsPerQuery));
  // Prefer recent papers
  url.searchParams.set('sort', 'relevance');

  const headers: Record<string, string> = { 'User-Agent': 'RALPH-loop/0.1' };
  if (config.semanticScholar.apiKey) {
    headers['x-api-key'] = config.semanticScholar.apiKey;
  }

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[crawler] S2 failed for "${seed.id}": HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as S2Response;
    const items: ResearchItem[] = [];

    for (const paper of data.data ?? []) {
      if (!paper.title || !paper.abstract) continue;

      // Use arxiv ID as canonical if available so S2 + arxiv dedup correctly
      const arxivIdStr = paper.externalIds?.ArXiv;
      const id = arxivIdStr ? `arxiv:${arxivIdStr}` : `s2:${paper.paperId}`;
      if (isSeen(id)) continue;
      markSeen(id);

      items.push({
        id,
        source: 'arxiv',
        title: paper.title,
        url: arxivIdStr
          ? `https://arxiv.org/abs/${arxivIdStr}`
          : `https://www.semanticscholar.org/paper/${paper.paperId}`,
        abstract: (paper.abstract ?? '').slice(0, 2000),
        publishedAt: paper.publicationDate ?? `${paper.year ?? new Date().getFullYear()}-01-01`,
        authors: (paper.authors ?? []).map((a) => a.name),
        fetchedAt: new Date().toISOString(),
      });
    }

    console.log(`[crawler] S2 "${seed.label}": ${items.length} new papers`);
    return items;
  } catch (e) {
    console.warn(`[crawler] S2 error for "${seed.id}": ${e}`);
    return [];
  }
}

// ─── arxiv (SUPPLEMENTARY — best-effort) ─────────────────────────────────────
// S2 already covers arxiv papers, but arxiv may surface newer submissions
// before S2 indexes them. Run it in parallel; 429s are gracefully skipped.

interface ArxivEntry {
  id?: string | { '#text': string };
  title?: string | { '#text': string };
  summary?: string | { '#text': string };
  published?: string;
  author?: { name: string } | Array<{ name: string }>;
  category?: { '@_term': string } | Array<{ '@_term': string }>;
}

function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && '#text' in (v as object))
    return String((v as { '#text': unknown })['#text']).trim();
  return '';
}

function parseArxivId(rawId: unknown): string {
  const s = textOf(rawId);
  const m = s.match(/abs\/([0-9]+\.[0-9]+)/);
  return m ? `arxiv:${m[1]}` : `arxiv:${uuidv4()}`;
}

export async function fetchArxiv(seed: Seed): Promise<ResearchItem[]> {
  return arxivEnqueue(() => fetchArxivInner(seed));
}

async function fetchArxivInner(seed: Seed, attempt = 1): Promise<ResearchItem[]> {
  const MAX_RETRIES = 2; // Only 2 retries — S2 is already covering this
  const { query, categories } = seed.arxiv;
  const catFilter = categories?.length
    ? `+AND+(${categories.map((c) => `cat:${c}`).join('+OR+')})`
    : '';
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `${query}${catFilter}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(config.loop.arxivResultsPerQuery));
  url.searchParams.set('sortBy', 'submittedDate');
  url.searchParams.set('sortOrder', 'descending');

  let xml: string;
  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'RALPH-loop/0.1 (mailto:research@example.com)' },
      signal: AbortSignal.timeout(45_000),
    });

    if (res.status === 429) {
      if (attempt > MAX_RETRIES) {
        // Not a problem — S2 has us covered
        console.log(`[crawler] arxiv rate-limited for "${seed.id}" (S2 already fetched this seed)`);
        return [];
      }
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1_000 : Math.min(2 ** attempt * 15_000, 120_000);
      console.warn(`[crawler] arxiv 429 for "${seed.id}" — waiting ${Math.round(waitMs / 1000)}s (${attempt}/${MAX_RETRIES})`);
      await sleep(waitMs);
      return fetchArxivInner(seed, attempt + 1);
    }
    if (!res.ok) { console.warn(`[crawler] arxiv HTTP ${res.status} for "${seed.id}"`); return []; }
    xml = await res.text();
  } catch (e) {
    if (attempt <= MAX_RETRIES && String(e).includes('timeout')) {
      await sleep(attempt * 8_000);
      return fetchArxivInner(seed, attempt + 1);
    }
    console.warn(`[crawler] arxiv fetch failed for "${seed.id}": ${e}`);
    return [];
  }

  let parsed: unknown;
  try { parsed = XML_PARSER.parse(xml); }
  catch (e) { console.warn(`[crawler] arxiv XML parse failed: ${e}`); return []; }

  const feed = (parsed as { feed?: { entry?: ArxivEntry | ArxivEntry[] } }).feed;
  if (!feed?.entry) return [];

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
  const items: ResearchItem[] = [];

  for (const entry of entries) {
    const id = parseArxivId(entry.id);
    if (isSeen(id)) continue; // already fetched by S2
    markSeen(id);

    items.push({
      id,
      source: 'arxiv',
      title: textOf(entry.title).replace(/\s+/g, ' '),
      url: `https://arxiv.org/abs/${id.replace('arxiv:', '')}`,
      abstract: textOf(entry.summary).replace(/\s+/g, ' ').slice(0, 2000),
      publishedAt: typeof entry.published === 'string' ? entry.published : new Date().toISOString(),
      authors: entry.author
        ? (Array.isArray(entry.author) ? entry.author : [entry.author]).map((a) => a.name)
        : [],
      topics: entry.category
        ? (Array.isArray(entry.category) ? entry.category : [entry.category]).map((c) => c['@_term'])
        : [],
      fetchedAt: new Date().toISOString(),
    });
  }

  if (items.length) console.log(`[crawler] arxiv "${seed.label}": ${items.length} extra papers not in S2`);
  return items;
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

interface GitHubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  topics: string[];
  pushed_at: string;
}
interface GitHubSearchResponse { items: GitHubRepo[]; }

export async function fetchGitHub(seed: Seed): Promise<ResearchItem[]> {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', `${seed.github.query} pushed:>${thirtyDaysAgo()}`);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(config.loop.githubResultsPerQuery));

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RALPH-loop/0.1',
  };
  if (config.github.token) headers['Authorization'] = `Bearer ${config.github.token}`;

  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[crawler] GitHub ${res.status} for "${seed.id}": ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return [];
    }
    const data = (await res.json()) as GitHubSearchResponse;
    const items: ResearchItem[] = [];
    for (const repo of data.items ?? []) {
      const id = `github:${repo.full_name}`;
      if (isSeen(id)) continue;
      markSeen(id);
      items.push({
        id, source: 'github', title: repo.full_name, url: repo.html_url,
        abstract: (repo.description ?? '').slice(0, 1000),
        publishedAt: repo.pushed_at, topics: repo.topics,
        fetchedAt: new Date().toISOString(),
      });
    }
    return items;
  } catch (e) {
    console.warn(`[crawler] GitHub error for "${seed.id}": ${e}`);
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thirtyDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

/**
 * Crawl one seed. Strategy:
 *   - S2 + GitHub run in parallel (separate APIs, no shared rate limit)
 *   - arxiv runs in parallel via its own queue (best-effort; 429s logged, not fatal)
 * Seeds are called sequentially by the scheduler so there's at most 1 of each
 * in flight at any given time.
 */
export async function crawlSeed(seed: Seed): Promise<ResearchItem[]> {
  console.log(`[crawler] crawling seed: ${seed.label}`);

  const [s2Result, ghResult, arxivResult] = await Promise.allSettled([
    fetchSemanticScholar(seed),
    fetchGitHub(seed),
    fetchArxiv(seed),
  ]);

  const s2Items     = s2Result.status     === 'fulfilled' ? s2Result.value     : [];
  const ghItems     = ghResult.status     === 'fulfilled' ? ghResult.value     : [];
  const arxivItems  = arxivResult.status  === 'fulfilled' ? arxivResult.value  : [];

  const items = [...s2Items, ...ghItems, ...arxivItems];
  console.log(
    `[crawler] "${seed.label}": ${items.length} total` +
    ` (S2:${s2Items.length} gh:${ghItems.length} arxiv:${arxivItems.length})`
  );
  return items;
}
