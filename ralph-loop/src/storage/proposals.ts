import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { Proposal, LoopState } from '../types.js';

const DIR = join(config.paths.data, 'proposals');
const PROPOSALS_FILE = join(DIR, 'proposals.json');
const STATE_FILE = join(config.paths.data, 'state.json');

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  if (!existsSync(config.paths.data)) mkdirSync(config.paths.data, { recursive: true });
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export function loadProposals(): Proposal[] {
  ensureDir();
  if (!existsSync(PROPOSALS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(PROPOSALS_FILE, 'utf8')) as Proposal[];
  } catch {
    return [];
  }
}

export function saveProposals(proposals: Proposal[]): void {
  ensureDir();
  writeFileSync(PROPOSALS_FILE, JSON.stringify(proposals, null, 2), 'utf8');
}

export function upsertProposal(proposal: Proposal): void {
  const proposals = loadProposals();
  const idx = proposals.findIndex((p) => p.id === proposal.id);
  if (idx === -1) {
    proposals.push(proposal);
  } else {
    proposals[idx] = proposal;
  }
  saveProposals(proposals);
}

export function getProposalById(id: string): Proposal | undefined {
  return loadProposals().find((p) => p.id === id);
}

export function getPendingProposals(): Proposal[] {
  return loadProposals().filter((p) => p.status === 'pending');
}

// ─── Loop State ───────────────────────────────────────────────────────────────

const DEFAULT_STATE: LoopState = {
  status: 'idle',
  currentCycleId: 0,
  startedAt: new Date().toISOString(),
  totalCycles: 0,
  totalResearchItems: 0,
  totalProposals: 0,
  history: [],
};

export function loadState(): LoopState {
  ensureDir();
  if (!existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as LoopState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: LoopState): void {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}
