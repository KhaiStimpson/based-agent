// ─── RALPH Core Types ─────────────────────────────────────────────────────────

export type ResearchSource = 'arxiv' | 'github' | 'semantic-scholar';

export interface ResearchItem {
  id: string;                    // e.g. "arxiv:2505.14996" or "github:owner/repo"
  source: ResearchSource;
  title: string;
  url: string;
  abstract: string;              // Raw abstract or repo description
  publishedAt: string;           // ISO date string
  authors?: string[];
  topics?: string[];             // GitHub topics or arxiv categories
  // Filled in by distiller
  summary?: string;              // 3-5 sentence distilled summary
  insights?: string[];           // Key techniques/contributions (1-3)
  relevanceScore?: number;       // 0–10, Ollama/cloud-graded
  relevanceReason?: string;      // why this item received its score
  scoringModel?: string;         // model or heuristic that produced the score
  scoredAt?: string;             // ISO timestamp when score was assigned
  fetchedAt: string;             // ISO timestamp when RALPH processed it
}

export interface ResearchScoringRecord {
  id: string;
  itemId: string;
  cycleId?: number;
  source: ResearchSource;
  title: string;
  url: string;
  abstract: string;
  publishedAt: string;
  model: string;
  pipeline: 'local' | 'cloud' | 'heuristic';
  relevanceScore: number;
  threshold: number;
  kept: boolean;
  relevanceReason: string;
  summary: string;
  insights: string[];
  scoredAt: string;
}

// ─── Proposals ───────────────────────────────────────────────────────────────

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'apply-failed';

export interface Evidence {
  title: string;
  url: string;
  relevance: string;             // 1-sentence explanation of why this source matters
}

export interface ScoreBreakdown {
  novelty: number;               // 0–25: How new is this insight to the codebase?
  impact: number;                // 0–25: Estimated improvement in system quality
  feasibility: number;           // 0–25: How easy/safe to apply?
  evidenceQuality: number;       // 0–25: Strength of supporting research
}

export interface ScoreHistoryEntry {
  score: number;
  reason: string;
  cycleId: number;
  timestamp: string;
}

export interface Proposal {
  id: string;                    // UUID
  title: string;
  summary: string;               // 1-2 sentence TL;DR shown in the UI card
  rationale: string;             // Detailed reasoning (markdown)
  evidence: Evidence[];
  targetFile: string;            // Path relative to BASED_AGENT_PATH
  targetSection?: string;        // Optional: which section/function to modify
  suggestedChange: string;       // Human-readable description of what to change
  patch?: string;                // Unified diff (optional, best-effort)
  score: number;                 // 0–100 composite
  scoreBreakdown: ScoreBreakdown;
  scoreHistory: ScoreHistoryEntry[];
  status: ProposalStatus;
  source?: 'local' | 'cloud';    // which tier generated this proposal
  applyError?: string;           // Set if status === 'apply-failed'
  createdAt: string;
  updatedAt: string;
  cycleId: number;
  sourceIds: string[];           // ResearchItem ids that fed this proposal
}

// ─── Cloud Pre-review ─────────────────────────────────────────────────────────

export type PreReviewVerdict = 'accept-together' | 'accept-individually' | 'defer' | 'reject' | 'merge-option';

export interface PreReviewBatch {
  id: string;
  title: string;
  verdict: PreReviewVerdict;
  proposalIds: string[];
  rationale: string;
  expectedBenefit: string;
  riskNotes: string[];
  batchScore: number;            // 0-100 cloud reviewer score for the batch
  applyOrder?: string[];         // proposal IDs in recommended apply order
  applyMode?: 'individual' | 'custom-merged' | 'manual';
  mergedPatch?: string;          // optional reviewer-authored unified diff combining proposal intent
  mergeRationale?: string;       // why the custom patch reduces integration risk
  mergeWarnings?: string[];
}

export interface PreReviewConflictGroup {
  id: string;
  title: string;
  conflictingProposalIds: string[];
  preferredProposalIds: string[];
  deferredProposalIds: string[];
  rationale: string;
  mergeProposal?: {
    title: string;
    summary: string;
    suggestedChange: string;
    targetFile?: string;
    rationale?: string;
  };
}

export interface PreReviewReport {
  id: string;
  createdAt: string;
  cycleId: number;
  model: string;
  summary: string;
  batches: PreReviewBatch[];
  conflicts: PreReviewConflictGroup[];
  proposalCount: number;
}

// ─── Dynamic Seeds ────────────────────────────────────────────────────────────
// Keywords extracted from distilled research and added to the seed rotation.

export interface DynamicSeed {
  id: string;              // stable hash of the normalised query
  label: string;           // human-readable topic label
  query: string;           // search query (plain words, used for S2 + arxiv)
  githubQuery: string;     // GitHub search query
  frequency: number;       // times this keyword was independently rediscovered
  sourceItemIds: string[]; // research item IDs that first surfaced this keyword
  createdAt: string;       // ISO — first extracted
  lastSeenAt: string;      // ISO — last cycle this keyword was reinforced
  firstCycleId: number;
  lastCycleId: number;
}

// ─── Loop State ──────────────────────────────────────────────────────────────

export type LoopStatus =
  | 'idle'
  | 'running'
  | 'checkpoint'   // 24h elapsed, waiting for human
  | 'paused';      // Manually paused via API

export interface CycleRecord {
  cycleId: number;
  startedAt: string;
  completedAt?: string;
  newResearchItems: number;
  newProposals: number;
  reRankedProposals: number;
  durationMs?: number;
  error?: string;
}

export interface LoopState {
  status: LoopStatus;
  currentCycleId: number;
  startedAt: string;             // ISO — when this session started
  lastCycleAt?: string;          // ISO — when last cycle completed
  nextCycleAt?: string;          // ISO — estimated start of next cycle
  checkpointReachedAt?: string;  // ISO — when the 24h checkpoint was hit
  checkpointReleasedAt?: string; // ISO — when human released the checkpoint
  totalCycles: number;
  totalResearchItems: number;
  totalProposals: number;
  history: CycleRecord[];        // Last 50 cycle summaries
}
