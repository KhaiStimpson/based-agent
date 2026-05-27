import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { piComplete } from '../llm/pi-client.js';
import { extractJSON } from '../llm/ollama.js';
import { ResearchItem, Proposal } from '../types.js';
import { emit } from '../events/bus.js';

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a senior AI systems research engineer reviewing cutting-edge research to improve a production multi-agent coding assistant.

You synthesise insights ACROSS multiple papers — proposals that combine findings from several sources are preferred over single-paper proposals. You write concrete, actionable improvements with specific file targets and diffs where possible.

Respond ONLY with a valid JSON array. No markdown. No preamble. No explanation outside the JSON.`;

// ─── Codebase reader ──────────────────────────────────────────────────────────

interface TargetFile { path: string; type: string; content: string; }

function readTargetFiles(maxFiles = 5, maxCharsPerFile = 3000): TargetFile[] {
  const root = config.paths.basedAgent;
  if (!existsSync(root)) return [];

  const files: TargetFile[] = [];

  const scan = (dir: string, type: string, ext: string) => {
    const full = join(root, dir);
    if (!existsSync(full)) return;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(ext)) continue;
      try {
        files.push({ path: join(dir, f), type, content: readFileSync(join(full, f), 'utf8').slice(0, maxCharsPerFile) });
      } catch { /* skip */ }
    }
  };

  // Prioritise: operating contract first, then extensions, then agents/prompts
  for (const f of ['AGENTS.md', 'EVALUATION.md']) {
    const fp = join(root, f);
    if (existsSync(fp)) {
      try { files.push({ path: f, type: 'contract', content: readFileSync(fp, 'utf8').slice(0, maxCharsPerFile) }); }
      catch { /* skip */ }
    }
  }
  scan('.pi/extensions', 'extension', '.ts');
  scan('.pi/agents',     'agent',     '.md');
  scan('.pi/prompts',    'prompt',    '.md');

  return files.slice(0, maxFiles);
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  items: ResearchItem[],
  existingProposals: Proposal[],
  cycleId: number,
): string {
  const researchBlock = items
    .map((item, i) =>
      `### ${i + 1}. ${item.title}\n` +
      `URL: ${item.url}\n` +
      `Relevance: ${item.relevanceScore}/10\n` +
      `Summary: ${item.summary}\n` +
      `Key insights:\n${(item.insights ?? []).map((s) => `  - ${s}`).join('\n')}`
    )
    .join('\n\n');

  const codebaseBlock = readTargetFiles()
    .map((f) => `#### ${f.path} (${f.type})\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const existingBlock = existingProposals
    .filter((p) => p.status === 'pending')
    .slice(0, 6)
    .map((p) => `  - [${p.score}/100] "${p.title}" → ${p.targetFile}`)
    .join('\n') || '  (none yet)';

  return (
    `## Research Cycle #${cycleId} — ${items.length} distilled items\n\n` +
    `${researchBlock}\n\n` +
    `---\n\n## Codebase (based-agent)\n\n${codebaseBlock}\n\n` +
    `---\n\n## Existing Pending Proposals (avoid duplicating)\n\n${existingBlock}\n\n` +
    `---\n\n` +
    `Generate 2–3 high-impact improvement proposals. Synthesise across multiple research items where possible.\n\n` +
    `Return a JSON array where each element has:\n` +
    `{\n` +
    `  "title": "<80 char max>",\n` +
    `  "summary": "<1-2 sentence UI card summary>",\n` +
    `  "rationale": "<3-5 paragraphs citing specific research>",\n` +
    `  "evidence": [{"title":"...","url":"...","relevance":"..."}],\n` +
    `  "targetFile": "<path relative to based-agent root>",\n` +
    `  "targetSection": "<optional function or section name>",\n` +
    `  "suggestedChange": "<exactly what to add/modify/remove>",\n` +
    `  "patch": "<unified diff starting with --- and +++, or null>",\n` +
    `  "scoreBreakdown": {"novelty":<0-25>,"impact":<0-25>,"feasibility":<0-25>,"evidenceQuality":<0-25>}\n` +
    `}`
  );
}

// ─── Raw proposal shape from LLM ─────────────────────────────────────────────

interface RawCloudProposal {
  title?: string;
  summary?: string;
  rationale?: string;
  evidence?: Array<{ title: string; url: string; relevance: string }>;
  targetFile?: string;
  targetSection?: string;
  suggestedChange?: string;
  patch?: string | null;
  scoreBreakdown?: { novelty: number; impact: number; feasibility: number; evidenceQuality: number };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function cloudSynthesize(
  items: ResearchItem[],
  existingProposals: Proposal[],
  cycleId: number,
): Promise<Proposal[]> {
  if (!config.cloud.enabled) return [];
  if (items.length === 0) return [];

  emit({ type: 'generate-start', level: 'info', cycleId,
    message: `Cloud synthesis: sending ${items.length} research items to ${config.cloud.model}…` });

  const prompt = buildPrompt(items, existingProposals, cycleId);

  let raw: string;
  try {
    raw = await piComplete(prompt, SYSTEM, 300_000);
  } catch (e) {
    emit({ type: 'error', level: 'error', cycleId,
      message: `Cloud synthesis failed: ${String(e).slice(0, 120)}` });
    console.error('[cloud-synthesizer] piComplete error:', e);
    return [];
  }

  const parsed = extractJSON<RawCloudProposal[]>(raw);
  if (!Array.isArray(parsed)) {
    emit({ type: 'warn', level: 'warn', cycleId,
      message: 'Cloud synthesis: could not parse JSON response — check console for raw output' });
    // Log full response to a debug file so it's inspectable without console scrolling
    const debugPath = join(config.paths.data, 'debug-last-cloud-response.txt');
    try {
      const { writeFileSync, mkdirSync } = await import('fs');
      mkdirSync(config.paths.data, { recursive: true });
      writeFileSync(debugPath, raw, 'utf8');
      console.warn(`[cloud-synthesizer] non-array response written to: ${debugPath}`);
    } catch {
      console.warn('[cloud-synthesizer] non-array response (first 600 chars):\n', raw.slice(0, 600));
    }
    return [];
  }

  const now = new Date().toISOString();
  const proposals: Proposal[] = [];

  for (const r of parsed.slice(0, 3)) {
    if (!r.title || !r.suggestedChange) continue;
    const bd = r.scoreBreakdown ?? { novelty: 15, impact: 15, feasibility: 15, evidenceQuality: 15 };
    const score = Math.min(100,
      Math.min(25, bd.novelty) + Math.min(25, bd.impact) +
      Math.min(25, bd.feasibility) + Math.min(25, bd.evidenceQuality));

    const p: Proposal = {
      id: uuidv4(),
      title: r.title.slice(0, 100),
      summary: r.summary ?? '',
      rationale: r.rationale ?? '',
      evidence: r.evidence ?? [],
      targetFile: r.targetFile ?? '',
      targetSection: r.targetSection,
      suggestedChange: r.suggestedChange,
      patch: r.patch && r.patch.includes('---') ? r.patch : undefined,
      score,
      scoreBreakdown: {
        novelty:         Math.min(25, Math.max(0, bd.novelty)),
        impact:          Math.min(25, Math.max(0, bd.impact)),
        feasibility:     Math.min(25, Math.max(0, bd.feasibility)),
        evidenceQuality: Math.min(25, Math.max(0, bd.evidenceQuality)),
      },
      scoreHistory: [{ score, reason: 'Cloud synthesis initial score', cycleId, timestamp: now }],
      status: 'pending',
      source: 'cloud',
      createdAt: now,
      updatedAt: now,
      cycleId,
      sourceIds: items.map((i) => i.id),
    };
    proposals.push(p);
    emit({ type: 'proposal-new', level: 'success', cycleId,
      message: `✨ Cloud proposal (${score}/100): "${p.title.slice(0, 70)}"` });
  }

  emit({ type: 'generate-end', level: 'success', cycleId,
    message: `Cloud synthesis complete — ${proposals.length} proposal${proposals.length !== 1 ? 's' : ''} from ${config.cloud.model}` });

  return proposals;
}
