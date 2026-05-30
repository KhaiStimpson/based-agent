import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '../config.js';
import { Proposal } from '../types.js';
import { applyPatchText, dryRunPatchText } from './patcher.js';
import { piComplete } from '../llm/pi-client.js';
import { extractJSON } from '../llm/ollama.js';
import { emit } from '../events/bus.js';

export interface BatchApplyResult {
  ok: boolean;
  mode: 'deterministic' | 'pre-review-merge' | 'cloud-merge' | 'failed';
  results: Array<{ id: string; status: string; error?: string }>;
  error?: string;
  mergedPatch?: string;
  mergeRationale?: string;
}

export interface BatchApplyOptions {
  applyMode?: 'individual' | 'custom-merged' | 'manual';
  mergedPatch?: string;
  mergeRationale?: string;
}

interface MergeResponse {
  mergedPatch: string;
  rationale: string;
  warnings?: string[];
}

function tempCopyBasedAgent(): string {
  const dest = join(tmpdir(), `ralph-based-agent-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dest, { recursive: true });
  cpSync(config.paths.basedAgent, dest, {
    recursive: true,
    filter: (src) => !src.includes('node_modules') && !src.includes('.git'),
  });
  return dest;
}

function touchedFiles(proposals: Proposal[]): string[] {
  return [...new Set(proposals.map((p) => p.targetFile).filter(Boolean))];
}

function readTouchedFiles(files: string[]): string {
  return files.map((f) => {
    const path = join(config.paths.basedAgent, f);
    if (!existsSync(path)) return `### ${f}\n(MISSING)`;
    return `### ${f}\n\`\`\`\n${readFileSync(path, 'utf8').slice(0, 8000)}\n\`\`\``;
  }).join('\n\n');
}

function buildMergePrompt(proposals: Proposal[], failedError: string): string {
  const files = touchedFiles(proposals);
  const proposalBlock = proposals.map((p, i) => `### Proposal ${i + 1}\nID: ${p.id}\nTITLE: ${p.title}\nTARGET: ${p.targetFile}\nSUMMARY: ${p.summary}\nCHANGE: ${p.suggestedChange}\nPATCH:\n\`\`\`diff\n${p.patch ?? '(no patch)'}\n\`\`\``).join('\n\n---\n\n');
  return `A batch of improvement proposal patches failed deterministic application. Produce ONE merged unified diff that applies cleanly to the current files.\n\nPatch failure:\n${failedError}\n\nCurrent files:\n${readTouchedFiles(files)}\n\nProposals to merge:\n${proposalBlock}\n\nRules:\n- Preserve the intent of all complementary proposals.\n- If two proposals conflict, prefer the stronger/superset design and mention the tradeoff in rationale.\n- Return only JSON.\n- mergedPatch must be a complete unified diff with --- a/path and +++ b/path headers.\n\nJSON:\n{\n  "mergedPatch": "<unified diff>",\n  "rationale": "<why this merged patch is correct>",\n  "warnings": ["<any risk>"]\n}`;
}

async function cloudMergePatch(proposals: Proposal[], failedError: string, cycleId?: number): Promise<MergeResponse | null> {
  if (!config.cloud.enabled) return null;
  emit({ type: 'info', level: 'info', cycleId, message: `Batch patches conflicted — asking ${config.cloud.model} for merged patch…` });
  const raw = await piComplete(
    buildMergePrompt(proposals, failedError),
    'You are an expert patch-merging engineer. Return only valid JSON.',
    300_000,
  );
  const parsed = extractJSON<MergeResponse>(raw);
  if (!parsed?.mergedPatch) return null;
  return parsed;
}

/**
 * Smart batch apply:
 * 1. If pre-review supplied a custom merged patch, dry-run/apply that exact patch.
 * 2. Otherwise test all patches sequentially in a temp copy.
 * 3. If all clean, apply patches sequentially to real based-agent.
 * 4. If a patch fails, ask cloud model for one merged patch, dry-run it, then apply.
 */
export async function applyBatchSmart(proposals: Proposal[], cycleId?: number, options: BatchApplyOptions = {}): Promise<BatchApplyResult> {
  const ordered = proposals.filter((p) => p.status === 'pending');
  const patchProposals = ordered.filter((p) => p.patch);
  const manualOnly = ordered.filter((p) => !p.patch);

  if (ordered.length === 0) return { ok: true, mode: 'deterministic', results: [] };

  if (options.applyMode === 'manual') {
    return {
      ok: true,
      mode: 'deterministic',
      results: ordered.map((p) => ({ id: p.id, status: 'approved' })),
    };
  }

  if (options.applyMode === 'custom-merged' || options.mergedPatch) {
    if (!options.mergedPatch) {
      return { ok: false, mode: 'failed', results: [], error: 'Pre-review requested a custom merged apply but did not provide mergedPatch.' };
    }
    const dry = dryRunPatchText(options.mergedPatch);
    if (!dry.success) {
      return { ok: false, mode: 'failed', results: [], error: `Pre-review merged patch dry-run failed: ${dry.error}`, mergedPatch: options.mergedPatch, mergeRationale: options.mergeRationale };
    }
    const applied = applyPatchText(options.mergedPatch);
    if (!applied.success) {
      return { ok: false, mode: 'failed', results: [], error: `Pre-review merged patch apply failed: ${applied.error}`, mergedPatch: options.mergedPatch, mergeRationale: options.mergeRationale };
    }
    return {
      ok: true,
      mode: 'pre-review-merge',
      mergedPatch: options.mergedPatch,
      mergeRationale: options.mergeRationale,
      results: [
        ...patchProposals.map((p) => ({ id: p.id, status: 'applied' })),
        ...manualOnly.map((p) => ({ id: p.id, status: 'approved' })),
      ],
    };
  }

  let tempRoot = '';
  let firstFailure: { proposal: Proposal; error: string } | null = null;

  try {
    tempRoot = tempCopyBasedAgent();
    for (const p of patchProposals) {
      const dry = dryRunPatchText(p.patch!, tempRoot);
      if (!dry.success) { firstFailure = { proposal: p, error: dry.error ?? 'dry-run failed' }; break; }
      const applied = applyPatchText(p.patch!, tempRoot);
      if (!applied.success) { firstFailure = { proposal: p, error: applied.error ?? 'temp apply failed' }; break; }
    }
  } finally {
    if (tempRoot) { try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ } }
  }

  // Clean deterministic path
  if (!firstFailure) {
    const results: BatchApplyResult['results'] = [];
    for (const p of patchProposals) {
      const dry = dryRunPatchText(p.patch!);
      if (!dry.success) return { ok: false, mode: 'failed', results, error: `Unexpected real dry-run failure for ${p.title}: ${dry.error}` };
      const applied = applyPatchText(p.patch!);
      results.push({ id: p.id, status: applied.success ? 'applied' : 'apply-failed', error: applied.error });
      if (!applied.success) return { ok: false, mode: 'failed', results, error: applied.error };
    }
    for (const p of manualOnly) results.push({ id: p.id, status: 'approved' });
    return { ok: true, mode: 'deterministic', results };
  }

  // Cloud merge fallback
  try {
    const merged = await cloudMergePatch(patchProposals, firstFailure.error, cycleId);
    if (!merged) return { ok: false, mode: 'failed', results: [], error: `Patch conflict and cloud merge unavailable/unparseable: ${firstFailure.error}` };

    const dry = dryRunPatchText(merged.mergedPatch);
    if (!dry.success) {
      return { ok: false, mode: 'failed', results: [], error: `Merged patch dry-run failed: ${dry.error}`, mergedPatch: merged.mergedPatch, mergeRationale: merged.rationale };
    }
    const applied = applyPatchText(merged.mergedPatch);
    if (!applied.success) {
      return { ok: false, mode: 'failed', results: [], error: `Merged patch apply failed: ${applied.error}`, mergedPatch: merged.mergedPatch, mergeRationale: merged.rationale };
    }

    return {
      ok: true,
      mode: 'cloud-merge',
      mergedPatch: merged.mergedPatch,
      mergeRationale: merged.rationale,
      results: [
        ...patchProposals.map((p) => ({ id: p.id, status: 'applied' })),
        ...manualOnly.map((p) => ({ id: p.id, status: 'approved' })),
      ],
    };
  } catch (e) {
    return { ok: false, mode: 'failed', results: [], error: String(e) };
  }
}
