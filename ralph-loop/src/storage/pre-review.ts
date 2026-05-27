import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { PreReviewReport } from '../types.js';

const FILE = join(config.paths.data, 'pre-review.json');

function ensureDir(): void {
  if (!existsSync(config.paths.data)) mkdirSync(config.paths.data, { recursive: true });
}

export function loadPreReview(): PreReviewReport | null {
  ensureDir();
  if (!existsSync(FILE)) return null;
  try { return JSON.parse(readFileSync(FILE, 'utf8')) as PreReviewReport; }
  catch { return null; }
}

export function savePreReview(report: PreReviewReport): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(report, null, 2), 'utf8');
}
