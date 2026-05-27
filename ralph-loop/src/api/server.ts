import express, { Request, Response } from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from '../config.js';
import {
  loadProposals,
  saveProposals,
  getProposalById,
  loadState,
} from '../storage/proposals.js';
import { loadDynamicSeeds } from '../storage/seeds.js';
import { SEEDS } from '../research/seeds.js';
import { applyPatch } from '../proposals/patcher.js';
import { applyBatchSmart } from '../proposals/batch-applier.js';
import { releaseCheckpoint, pauseLoop } from '../loop/scheduler.js';
import { bus } from '../events/bus.js';
import { loadPreReview } from '../storage/pre-review.js';
import { runPreReview } from '../proposals/pre-reviewer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startServer(): void {
  const app = express();
  app.use(express.json());

  // Serve the approval UI from /public
  const publicDir = join(__dirname, '../../public');
  app.use(express.static(publicDir));

  // ─── Proposals ─────────────────────────────────────────────────────────────

  /** GET /api/proposals — returns all proposals sorted by score desc */
  app.get('/api/proposals', (_req: Request, res: Response) => {
    const proposals = loadProposals().sort((a, b) => b.score - a.score);
    res.json(proposals);
  });

  /** GET /api/proposals/:id — single proposal */
  app.get('/api/proposals/:id', (req: Request, res: Response) => {
    const p = getProposalById(req.params.id);
    if (!p) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(p);
  });

  /** POST /api/proposals/:id/approve — mark as approved and attempt patch */
  app.post('/api/proposals/:id/approve', (req: Request, res: Response) => {
    const proposals = loadProposals();
    const idx = proposals.findIndex((p) => p.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }

    const proposal = proposals[idx];
    const now = new Date().toISOString();

    if (proposal.patch) {
      const result = applyPatch(proposal);
      proposal.status = result.success ? 'applied' : 'apply-failed';
      if (!result.success) proposal.applyError = result.error;
    } else {
      proposal.status = 'approved';
    }
    proposal.updatedAt = now;
    proposals[idx] = proposal;
    saveProposals(proposals);

    res.json({
      ok: true,
      status: proposal.status,
      applyError: proposal.applyError,
    });
  });

  /** POST /api/proposals/:id/reject — mark as rejected */
  app.post('/api/proposals/:id/reject', (req: Request, res: Response) => {
    const proposals = loadProposals();
    const idx = proposals.findIndex((p) => p.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }

    proposals[idx].status = 'rejected';
    proposals[idx].updatedAt = new Date().toISOString();
    saveProposals(proposals);
    res.json({ ok: true });
  });

  // ─── Cloud pre-review ───────────────────────────────────────────────────────

  app.get('/api/pre-review', (_req: Request, res: Response) => {
    res.json(loadPreReview());
  });

  app.post('/api/pre-review/run', async (_req: Request, res: Response) => {
    const state = loadState();
    const pending = loadProposals().filter((p) => p.status === 'pending');
    const report = await runPreReview(pending, state.currentCycleId);
    res.json({ ok: !!report, report });
  });

  app.post('/api/pre-review/batches/:id/apply', async (req: Request, res: Response) => {
    const report = loadPreReview();
    if (!report) { res.status(404).json({ error: 'No pre-review report' }); return; }
    const batch = report.batches.find((b) => b.id === req.params.id);
    if (!batch) { res.status(404).json({ error: 'Batch not found' }); return; }

    let proposals = loadProposals();
    const order = batch.applyOrder?.length ? batch.applyOrder : batch.proposalIds;
    const selected = order
      .map((id) => proposals.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const result = await applyBatchSmart(selected, report.cycleId);

    // Persist proposal statuses according to smart applier results.
    proposals = loadProposals();
    const now = new Date().toISOString();
    for (const r of result.results) {
      const idx = proposals.findIndex((p) => p.id === r.id);
      if (idx === -1) continue;
      if (r.status === 'applied' || r.status === 'approved' || r.status === 'apply-failed') {
        proposals[idx].status = r.status as any;
        proposals[idx].updatedAt = now;
        if (r.error) proposals[idx].applyError = r.error;
      }
    }
    saveProposals(proposals);

    res.json({ batchId: batch.id, ...result });
  });

  // ─── Loop control ───────────────────────────────────────────────────────────

  /** GET /api/state — loop state + counts + pipeline mode */
  app.get('/api/state', (_req: Request, res: Response) => {
    const state = loadState();
    const proposals = loadProposals();
    res.json({
      ...state,
      pipelineMode: config.pipeline.mode,
      cloudModel: config.pipeline.mode !== 'local' ? config.cloud.model : null,
      pendingProposals:  proposals.filter((p) => p.status === 'pending').length,
      approvedProposals: proposals.filter((p) => p.status === 'approved' || p.status === 'applied').length,
      rejectedProposals: proposals.filter((p) => p.status === 'rejected').length,
    });
  });

  /** POST /api/resume-loop — release 24h checkpoint and continue */
  app.post('/api/resume-loop', (_req: Request, res: Response) => {
    releaseCheckpoint();
    res.json({ ok: true, message: 'Loop resumed' });
  });

  /** POST /api/pause-loop — pause the loop */
  app.post('/api/pause-loop', (_req: Request, res: Response) => {
    pauseLoop();
    res.json({ ok: true, message: 'Loop paused' });
  });

  // ─── Seeds ──────────────────────────────────────────────────────────────────

  /** GET /api/seeds — static seed list + dynamic seeds sorted by frequency */
  app.get('/api/seeds', (_req: Request, res: Response) => {
    const dynamic = loadDynamicSeeds().sort((a, b) => b.frequency - a.frequency);
    res.json({
      static: SEEDS.map((s) => ({
        id: s.id,
        label: s.label,
        query: s.arxiv.query,
        githubQuery: s.github.query,
      })),
      dynamic,
    });
  });

  // ─── SSE — live activity stream ──────────────────────────────────────────────────────────

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Replay last 100 events so a fresh page load sees recent history
    for (const evt of bus.getHistory(100)) {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }

    const listener = (evt: unknown) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
    bus.on('event', listener);

    // 25-second heartbeat to keep the connection alive through proxies
    const hb = setInterval(() => res.write(': heartbeat\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(hb);
      bus.off('event', listener);
    });
  });

  // ─── Fallback to index.html ─────────────────────────────────────────────────
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  app.listen(config.server.port, () => {
    console.log(`🌐 Approval UI: http://localhost:${config.server.port}`);
  });
}
