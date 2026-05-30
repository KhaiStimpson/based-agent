import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { config } from '../config.js';
import { DynamicSeed } from '../types.js';

const FILE = join(config.paths.data, 'dynamic-seeds.json');
const MAX_SEEDS = 100; // prune beyond this, keeping highest-frequency

function ensureDir(): void {
  const dir = config.paths.data;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Stable ID: SHA-1 of the lowercased, whitespace-normalised query */
export function seedId(query: string): string {
  return createHash('sha1')
    .update(query.toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex')
    .slice(0, 16);
}

export function loadDynamicSeeds(): DynamicSeed[] {
  ensureDir();
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as DynamicSeed[];
  } catch {
    return [];
  }
}

export function saveDynamicSeeds(seeds: DynamicSeed[]): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(seeds, null, 2), 'utf8');
}

export interface SeedCandidate {
  label: string;
  query: string;       // plain words
  githubQuery: string;
}

function normalizeCandidate(c: SeedCandidate): SeedCandidate | null {
  const query = String(c.query || '')
    .toLowerCase()
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (query.split(/\s+/).length < 2) return null;
  if (/^(llm|ai|agent|agents|multi-agent|rag)$/i.test(query)) return null;

  const label = String(c.label || query).replace(/[_+]+/g, ' ').trim().slice(0, 80);
  let githubQuery = String(c.githubQuery || `${query} stars:>50`).replace(/[_+]+/g, ' ').trim();
  if (/^https?:\/\//i.test(githubQuery)) githubQuery = `${query} stars:>50`;
  if (!githubQuery.includes('stars:')) githubQuery = `${githubQuery} stars:>50`;

  return { label, query, githubQuery };
}

/**
 * Insert a new dynamic seed or increment frequency if one with the same
 * query already exists.  Prunes the list to MAX_SEEDS after each write.
 */
export function upsertDynamicSeeds(
  candidates: SeedCandidate[],
  sourceItemIds: string[],
  cycleId: number,
): DynamicSeed[] {
  const seeds = loadDynamicSeeds();
  const now = new Date().toISOString();
  const changed: DynamicSeed[] = [];

  for (const raw of candidates) {
    const c = normalizeCandidate(raw);
    if (!c) continue;
    const id = seedId(c.query);
    const existing = seeds.find((s) => s.id === id);

    if (existing) {
      existing.frequency += 1;
      existing.lastSeenAt = now;
      existing.lastCycleId = cycleId;
      // Add any new source items not already tracked
      for (const sid of sourceItemIds) {
        if (!existing.sourceItemIds.includes(sid)) existing.sourceItemIds.push(sid);
      }
      changed.push(existing);
    } else {
      const fresh: DynamicSeed = {
        id,
        label: c.label,
        query: c.query,
        githubQuery: c.githubQuery,
        frequency: 1,
        sourceItemIds: [...sourceItemIds],
        createdAt: now,
        lastSeenAt: now,
        firstCycleId: cycleId,
        lastCycleId: cycleId,
      };
      seeds.push(fresh);
      changed.push(fresh);
    }
  }

  if (changed.length === 0) return seeds;

  // Sort by frequency desc, recency as tiebreaker, then prune
  seeds.sort((a, b) =>
    b.frequency - a.frequency || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
  const pruned = seeds.slice(0, MAX_SEEDS);
  saveDynamicSeeds(pruned);
  return pruned;
}

/** Return the top N dynamic seeds for use in the cycle seed pool */
export function getTopDynamicSeeds(n = 30): DynamicSeed[] {
  return loadDynamicSeeds()
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, n);
}
