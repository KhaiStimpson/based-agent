import { mkdirSync, existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { ResearchItem, ResearchScoringRecord } from '../types.js';

const DIR = join(config.paths.data, 'research');
const FILE = join(DIR, 'items.jsonl');
const SCORING_FILE = join(DIR, 'scoring-history.jsonl');

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

export function appendResearchScoring(record: Omit<ResearchScoringRecord, 'id'>): void {
  ensureDir();
  const full: ResearchScoringRecord = {
    ...record,
    id: `${record.itemId}:${record.scoredAt}`,
  };
  appendFileSync(SCORING_FILE, JSON.stringify(full) + '\n', 'utf8');
}

export function loadResearchScoringHistory(limit = 300): ResearchScoringRecord[] {
  ensureDir();
  if (!existsSync(SCORING_FILE)) return [];
  const lines = readFileSync(SCORING_FILE, 'utf8').split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((line) => {
      try { return JSON.parse(line) as ResearchScoringRecord; }
      catch { return null; }
    })
    .filter((x): x is ResearchScoringRecord => x !== null)
    .sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());
}

export function getResearchScoringForItem(itemId: string): ResearchScoringRecord[] {
  return loadResearchScoringHistory(2000).filter((r) => r.itemId === itemId);
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
