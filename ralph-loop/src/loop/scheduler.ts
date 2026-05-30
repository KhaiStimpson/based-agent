import { config, PIPELINE_DESCRIPTIONS } from '../config.js';
import { LoopState, CycleRecord, LoopStatus, ResearchItem } from '../types.js';
import { seedsForCycle } from '../research/seeds.js';
import { crawlSeed } from '../research/crawler.js';
import { distillBatch } from '../research/distiller.js';
import { cloudDistill } from '../research/cloud-distiller.js';
import { generateProposals } from '../proposals/generator.js';
import { reRankProposals } from '../proposals/ranker.js';
import { extractKeywords } from '../research/keyword-extractor.js';
import { cloudSynthesize } from '../proposals/cloud-synthesizer.js';
import { runPreReview } from '../proposals/pre-reviewer.js';
import { emit } from '../events/bus.js';
import {
  appendResearchItems,
  getAllResearchIds,
} from '../storage/research.js';
import {
  loadProposals,
  saveProposals,
  loadState,
  saveState,
  upsertProposal,
} from '../storage/proposals.js';
import {
  loadDynamicSeeds,
  upsertDynamicSeeds,
  getTopDynamicSeeds,
} from '../storage/seeds.js';
import { loadSeenFromStorage } from '../research/crawler.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cycleDelayMs(): number {
  const base = config.loop.cycleMinutes * 60_000;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(30_000, base + jitter);
}

function isCheckpointDue(state: LoopState): boolean {
  return (Date.now() - new Date(state.startedAt).getTime()) / 3_600_000 >= config.loop.checkpointHours;
}

// ─── Shared crawl step (all modes) ────────────────────────────────────────────

async function crawlStep(cycleId: number): Promise<ResearchItem[]> {
  const dynamicSeeds = getTopDynamicSeeds(30);
  const seeds = seedsForCycle(cycleId, config.loop.seedsPerCycle, dynamicSeeds);

  emit({ type: 'info', level: 'info', cycleId,
    message: `Seeds: ${seeds.map((s) => s.label).join(' · ')}` });

  const rawItems: ResearchItem[] = [];
  for (const seed of seeds) {
    emit({ type: 'crawl', level: 'info', cycleId, message: `Crawling: ${seed.label}` });
    const items = await crawlSeed(seed);
    rawItems.push(...items);
    emit({ type: 'crawl-result', level: items.length > 0 ? 'success' : 'info', cycleId,
      message: `${seed.label}: ${items.length} new item${items.length !== 1 ? 's' : ''}` });
  }
  return rawItems;
}

// ─── Shared re-rank + persist ─────────────────────────────────────────────────

async function reRankStep(
  distilled: ResearchItem[],
  cycleId: number,
  useCloud: boolean,
): Promise<number> {
  if (distilled.length === 0) return 0;
  const allProposals = loadProposals();
  const pending = allProposals.filter((p) => p.status === 'pending');
  if (pending.length === 0) return 0;

  emit({ type: 'rerank-start', level: 'info', cycleId,
    message: `Re-ranking ${pending.length} proposal${pending.length !== 1 ? 's' : ''}${useCloud ? ' with cloud model' : ''}…` });

  const reRanked = await reRankProposals(allProposals, distilled, cycleId, useCloud);
  saveProposals(reRanked);

  emit({ type: 'rerank-end', level: 'success', cycleId,
    message: `Re-ranking complete` });

  return reRanked.filter((p) => p.status === 'pending').length;
}

// ─── Pipeline: local ──────────────────────────────────────────────────────────
// phi4-mini distil → phi4-mini keywords → local generation → local re-rank

async function runLocal(cycleId: number, record: CycleRecord): Promise<void> {
  const rawItems = await crawlStep(cycleId);

  // Distil
  if (rawItems.length > 0) {
    emit({ type: 'distill-start', level: 'info', cycleId,
      message: `Distilling ${rawItems.length} items with ${config.ollama.fastModel}…` });
  }
  const distilled = await distillBatch(rawItems);
  if (distilled.length > 0) {
    appendResearchItems(distilled);
    record.newResearchItems = distilled.length;
    emit({ type: 'distill-end', level: 'success', cycleId,
      message: `Kept ${distilled.length}/${rawItems.length} items (≥${config.loop.minRelevance}/10)` });
  }

  // Keywords
  if (distilled.length > 0) {
    emit({ type: 'keywords', level: 'info', cycleId, message: 'Extracting keywords…' });
    const candidates = await extractKeywords(distilled, loadDynamicSeeds());
    if (candidates.length > 0) {
      const updated = upsertDynamicSeeds(candidates, distilled.map((i) => i.id), cycleId);
      emit({ type: 'keyword-result', level: 'success', cycleId,
        message: `${candidates.length} keyword${candidates.length !== 1 ? 's' : ''}: ${candidates.map((c) => `"${c.label}"`).join(', ')} (pool: ${updated.length})` });
    } else {
      emit({ type: 'keyword-result', level: 'info', cycleId, message: 'No new keywords' });
    }
  }

  // Local generation (only pipeline that uses this)
  if (distilled.length > 0) {
    emit({ type: 'generate-start', level: 'info', cycleId,
      message: `Generating proposals with ${config.ollama.qualityModel}…` });
  }
  const localProposals = await generateProposals(distilled, cycleId);
  for (const p of localProposals) upsertProposal(p);
  record.newProposals = localProposals.length;
  if (localProposals.length > 0) {
    emit({ type: 'generate-end', level: 'success', cycleId,
      message: `${localProposals.length} proposal${localProposals.length !== 1 ? 's' : ''} generated locally` });
  }

  // Local re-rank
  record.reRankedProposals = await reRankStep(distilled, cycleId, false);
}

// ─── Pipeline: hybrid ─────────────────────────────────────────────────────────
// phi4-mini distil → phi4-mini keywords → cloud synthesis → local re-rank

async function runHybrid(cycleId: number, record: CycleRecord): Promise<void> {
  const rawItems = await crawlStep(cycleId);

  // Distil (local)
  if (rawItems.length > 0) {
    emit({ type: 'distill-start', level: 'info', cycleId,
      message: `Distilling ${rawItems.length} items with ${config.ollama.fastModel}…` });
  }
  const distilled = await distillBatch(rawItems);
  if (distilled.length > 0) {
    appendResearchItems(distilled);
    record.newResearchItems = distilled.length;
    emit({ type: 'distill-end', level: 'success', cycleId,
      message: `Kept ${distilled.length}/${rawItems.length} items (≥${config.loop.minRelevance}/10)` });
  }

  // Keywords (local)
  if (distilled.length > 0) {
    emit({ type: 'keywords', level: 'info', cycleId, message: 'Extracting keywords…' });
    const candidates = await extractKeywords(distilled, loadDynamicSeeds());
    if (candidates.length > 0) {
      const updated = upsertDynamicSeeds(candidates, distilled.map((i) => i.id), cycleId);
      emit({ type: 'keyword-result', level: 'success', cycleId,
        message: `${candidates.length} keyword${candidates.length !== 1 ? 's' : ''}: ${candidates.map((c) => `"${c.label}"`).join(', ')} (pool: ${updated.length})` });
    } else {
      emit({ type: 'keyword-result', level: 'info', cycleId, message: 'No new keywords' });
    }
  }

  // Cloud synthesis
  const cloudProposals = await cloudSynthesize(distilled, loadProposals(), cycleId);
  for (const p of cloudProposals) upsertProposal(p);
  record.newProposals = cloudProposals.length;

  // Local re-rank
  record.reRankedProposals = await reRankStep(distilled, cycleId, false);
}

// ─── Pipeline: cloud ──────────────────────────────────────────────────────────
// phi4-mini pre-filter (lenient) → cloud batch distil+keywords → cloud synthesis → cloud re-rank

async function runCloud(cycleId: number, record: CycleRecord): Promise<void> {
  const rawItems = await crawlStep(cycleId);

  // Lenient pre-filter — phi4-mini just removes obvious junk (threshold: 3/10)
  // Real quality decisions are made by the cloud model in the next step
  const preFilterThreshold = config.loop.preFilterThreshold; // 3 in cloud mode
  if (rawItems.length > 0) {
    emit({ type: 'distill-start', level: 'info', cycleId,
      message: `Pre-filtering ${rawItems.length} items (lenient ≥${preFilterThreshold}/10)…` });
  }
  const preFiltered = await distillBatch(rawItems); // uses preFilterThreshold via config
  if (preFiltered.length > 0) {
    emit({ type: 'distill-end', level: 'info', cycleId,
      message: `Pre-filter kept ${preFiltered.length}/${rawItems.length} — passing to cloud…` });
  }

  // Cloud batch distil + keywords (one call, raw text in)
  const { items: distilled, keywords } = await cloudDistill(preFiltered, cycleId);
  if (distilled.length > 0) {
    appendResearchItems(distilled);
    record.newResearchItems = distilled.length;
  }

  // Persist cloud-extracted keywords
  if (keywords.length > 0) {
    const updated = upsertDynamicSeeds(keywords, distilled.map((i) => i.id), cycleId);
    emit({ type: 'keyword-result', level: 'success', cycleId,
      message: `${keywords.length} keyword${keywords.length !== 1 ? 's' : ''} from cloud: ${keywords.map((k) => `"${k.label}"`).join(', ')} (pool: ${updated.length})` });
  }

  // Cloud synthesis
  const cloudProposals = await cloudSynthesize(distilled, loadProposals(), cycleId);
  for (const p of cloudProposals) upsertProposal(p);
  record.newProposals = cloudProposals.length;

  // Cloud re-rank
  record.reRankedProposals = await reRankStep(distilled, cycleId, true);
}

// ─── Single cycle dispatcher ──────────────────────────────────────────────────

async function runCycle(cycleId: number): Promise<CycleRecord> {
  const start = Date.now();
  const record: CycleRecord = {
    cycleId,
    startedAt: new Date().toISOString(),
    newResearchItems: 0,
    newProposals: 0,
    reRankedProposals: 0,
  };

  const mode = config.pipeline.mode;

  try {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`RALPH CYCLE #${cycleId}  [${mode.toUpperCase()}]  ${new Date().toLocaleTimeString()}`);
    console.log(`${'═'.repeat(60)}`);

    emit({ type: 'cycle-start', level: 'info', cycleId,
      message: `Cycle #${cycleId} started [${mode}]` });

    if (mode === 'cloud') {
      await runCloud(cycleId, record);
    } else if (mode === 'hybrid') {
      await runHybrid(cycleId, record);
    } else {
      await runLocal(cycleId, record);
    }

    record.completedAt = new Date().toISOString();
    record.durationMs = Date.now() - start;

    emit({ type: 'cycle-end', level: 'success', cycleId,
      message: `Cycle #${cycleId} done in ${Math.round(record.durationMs / 1000)}s — ${record.newResearchItems} items, ${record.newProposals} proposals` });

    console.log(`[cycle #${cycleId}] done — ${record.newResearchItems} items, ${record.newProposals} proposals, ${record.reRankedProposals} re-ranked`);
  } catch (e) {
    record.error = String(e);
    emit({ type: 'error', level: 'error', cycleId,
      message: `Cycle #${cycleId} error: ${String(e).slice(0, 120)}` });
    console.error(`[cycle #${cycleId}] ERROR:`, e);
  }

  return record;
}

// ─── State transitions ────────────────────────────────────────────────────────

export function pauseLoop(): void {
  const state = loadState();
  if (state.status === 'running') {
    setStatus('paused', state);
    emit({ type: 'info', level: 'warn', message: 'Loop paused by user' });
  }
}

export function releaseCheckpoint(): void {
  const state = loadState();
  if (state.status !== 'checkpoint' && state.status !== 'paused') return;
  state.checkpointReleasedAt = new Date().toISOString();
  state.startedAt = new Date().toISOString();
  state.status = 'running';
  saveState(state);
  emit({ type: 'resume', level: 'success', message: 'Checkpoint released — research loop resuming' });
  void mainLoop();
}

function setStatus(status: LoopStatus, state: LoopState): void {
  state.status = status;
  saveState(state);
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function mainLoop(): Promise<void> {
  let state = loadState();
  state.status = 'running';
  state.startedAt = state.startedAt || new Date().toISOString();
  saveState(state);

  loadSeenFromStorage(getAllResearchIds());
  emit({ type: 'info', level: 'info',
    message: `RALPH started — pipeline: ${config.pipeline.mode}` });

  while (true) {
    state = loadState();

    if (state.status === 'paused') {
      console.log('[loop] paused — waiting for resume via API');
      return;
    }

    if (isCheckpointDue(state)) {
      const pending = loadProposals().filter((p) => p.status === 'pending');
      if (pending.length > 0) {
        emit({ type: 'info', level: 'info', cycleId: state.currentCycleId,
          message: `Checkpoint pre-review starting for ${pending.length} pending proposals…` });
        await runPreReview(pending, state.currentCycleId);
      }
      state.status = 'checkpoint';
      state.checkpointReachedAt = new Date().toISOString();
      saveState(state);
      emit({ type: 'checkpoint', level: 'warn',
        message: '24-hour checkpoint — open the UI to review proposal batches and continue' });
      console.log(`\n⏰  24-HOUR CHECKPOINT — http://localhost:${config.server.port}\n`);
      return;
    }

    const cycleId = state.currentCycleId + 1;
    state.currentCycleId = cycleId;
    saveState(state);

    const record = await runCycle(cycleId);

    state = loadState();
    state.totalCycles = (state.totalCycles || 0) + 1;
    state.totalResearchItems = (state.totalResearchItems || 0) + record.newResearchItems;
    state.totalProposals = (state.totalProposals || 0) + record.newProposals;
    state.lastCycleAt = new Date().toISOString();
    state.history = [record, ...(state.history || [])].slice(0, 50);

    const delay = cycleDelayMs();
    state.nextCycleAt = new Date(Date.now() + delay).toISOString();
    saveState(state);

    emit({ type: 'info', level: 'info',
      message: `Next cycle in ${Math.round(delay / 60_000)} min (${new Date(Date.now() + delay).toLocaleTimeString()})` });

    await sleep(delay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
