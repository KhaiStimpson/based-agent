import { execFileSync, execSync } from 'child_process';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { config } from '../config.js';
import { Proposal } from '../types.js';

export interface PatchResult { success: boolean; error?: string; stdout?: string; stderr?: string }

function shellQuote(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

function errorText(e: unknown): Pick<PatchResult, 'error' | 'stdout' | 'stderr'> {
  const any = e as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string };
  const stderr = any.stderr ? String(any.stderr) : '';
  const stdout = any.stdout ? String(any.stdout) : '';
  return {
    error: (stderr || stdout || any.message || String(e)).slice(0, 1200),
    stdout,
    stderr,
  };
}

function runGitApply(tmpPatch: string, rootDir: string, dryRun: boolean): PatchResult {
  try {
    const args = ['-C', rootDir, 'apply', '--whitespace=nowarn', '--recount'];
    if (dryRun) args.push('--check');
    args.push(tmpPatch);
    const stdout = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { success: true, stdout };
  } catch (e: unknown) {
    return { success: false, ...errorText(e) };
  }
}

function runUnixPatch(tmpPatch: string, rootDir: string, dryRun: boolean): PatchResult {
  try {
    const cmd = `patch ${dryRun ? '--dry-run ' : ''}-p1 -d ${shellQuote(rootDir)} < ${shellQuote(tmpPatch)}`;
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, stdout };
  } catch (e: unknown) {
    return { success: false, ...errorText(e) };
  }
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

    // Prefer git apply because it is available on Windows with Git for Windows,
    // while Unix patch.exe usually is not. It also works without shell redirection.
    const git = runGitApply(tmpPatch, rootDir, dryRun);
    if (git.success) return git;

    // If git itself is unavailable, fall back to POSIX patch for Unix hosts.
    const gitMissing = /not recognized|not found|ENOENT|cannot find/i.test(git.error ?? '');
    if (gitMissing) {
      const unixPatch = runUnixPatch(tmpPatch, rootDir, dryRun);
      if (unixPatch.success) return unixPatch;
      return {
        success: false,
        error: `git apply unavailable (${git.error}); patch fallback failed (${unixPatch.error})`,
        stdout: `${git.stdout ?? ''}\n${unixPatch.stdout ?? ''}`,
        stderr: `${git.stderr ?? ''}\n${unixPatch.stderr ?? ''}`,
      };
    }

    return git;
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
