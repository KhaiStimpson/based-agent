import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { ResearchItem } from '../types.js';

const DIR = join(config.paths.data, 'research');
const FILE = join(DIR, 'items.jsonl');

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

export function appendResearchItems(items: ResearchItem[]): void {
  ensureDir();
  for (const item of items) {
    appendFileSync(FILE, JSON.stringify(item) + '\n', 'utf8');
  }
}

export function loadAllResearchItems(): ResearchItem[] {
  ensureDir();
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as ResearchItem; }
      catch { return null; }
    })
    .filter((x): x is ResearchItem => x !== null);
}

export function getAllResearchIds(): string[] {
  return loadAllResearchItems().map((i) => i.id);
}

/** Return the N most recent high-relevance items (sorted by relevanceScore desc) */
export function getTopResearchItems(n = 20): ResearchItem[] {
  return loadAllResearchItems()
    .filter((i) => (i.relevanceScore ?? 0) >= config.loop.minRelevance)
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, n);
}
