import { execSync } from 'child_process';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '../config.js';
import { Proposal } from '../types.js';

export interface PatchResult { success: boolean; error?: string; stdout?: string; stderr?: string }

function shellQuote(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

/** Dry-run or apply arbitrary unified diff text against a root directory. */
export function runPatchText(
  patchText: string,
  rootDir = config.paths.basedAgent,
  dryRun = true,
): PatchResult {
  if (!patchText?.trim()) return { success: false, error: 'Empty patch text.' };
  if (!existsSync(rootDir)) return { success: false, error: `Root path not found: ${rootDir}` };

  const tmpPatch = join(tmpdir(), `ralph-patch-${Date.now()}-${Math.random().toString(16).slice(2)}.diff`);
  try {
    writeFileSync(tmpPatch, patchText, 'utf8');
    const cmd = `patch ${dryRun ? '--dry-run ' : ''}-p1 -d ${shellQuote(rootDir)} < ${shellQuote(tmpPatch)}`;
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, stdout };
  } catch (e: unknown) {
    const any = e as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string };
    const stderr = any.stderr ? String(any.stderr) : '';
    const stdout = any.stdout ? String(any.stdout) : '';
    return {
      success: false,
      error: (stderr || stdout || any.message || String(e)).slice(0, 1200),
      stdout,
      stderr,
    };
  } finally {
    try { unlinkSync(tmpPatch); } catch { /* ignore */ }
  }
}

export function dryRunPatchText(patchText: string, rootDir = config.paths.basedAgent): PatchResult {
  return runPatchText(patchText, rootDir, true);
}

export function applyPatchText(patchText: string, rootDir = config.paths.basedAgent): PatchResult {
  return runPatchText(patchText, rootDir, false);
}

/** Apply a proposal's patch to the based-agent codebase. */
export function applyPatch(proposal: Proposal): PatchResult {
  if (!proposal.patch) return { success: false, error: 'No patch attached to this proposal.' };
  const dry = dryRunPatchText(proposal.patch);
  if (!dry.success) return dry;
  return applyPatchText(proposal.patch);
}

/** Generate a minimal unified diff string (best-effort, used as a fallback hint) */
export function formatPatchPreview(targetFile: string, suggestedChange: string): string {
  return [
    `--- a/${targetFile}`,
    `+++ b/${targetFile}`,
    `@@ ... @@`,
    `# Suggested change (apply manually):`,
    `# ${suggestedChange.replace(/\n/g, '\n# ')}`,
  ].join('\n');
}
