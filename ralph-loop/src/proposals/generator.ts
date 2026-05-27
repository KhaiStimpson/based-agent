import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { quality, extractJSON } from '../llm/ollama.js';
import { ResearchItem, Proposal, ScoreBreakdown } from '../types.js';
import { emit } from '../events/bus.js';

const SYSTEM_GENERATOR = `You are a senior AI systems engineer reviewing research papers to improve a multi-agent coding assistant.
Your proposals must be specific, actionable, and grounded in concrete evidence from the research.
Always respond with valid JSON — no prose before or after the JSON block.`;

// ─── Codebase scanning ────────────────────────────────────────────────────────

interface TargetFile {
  relativePath: string;   // relative to BASED_AGENT_PATH
  content: string;
  type: 'extension' | 'agent' | 'prompt' | 'skill' | 'config';
}

function readTargetFiles(): TargetFile[] {
  const root = config.paths.basedAgent;
  if (!existsSync(root)) {
    console.warn('[generator] based-agent path not found:', root);
    return [];
  }

  const files: TargetFile[] = [];

  const scanDir = (dir: string, type: TargetFile['type'], ext: string) => {
    const full = join(root, dir);
    if (!existsSync(full)) return;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(ext)) continue;
      const fullPath = join(full, f);
      try {
        const content = readFileSync(fullPath, 'utf8').slice(0, 6000); // cap per file
        files.push({ relativePath: join(dir, f), content, type });
      } catch { /* skip unreadable */ }
    }
  };

  scanDir('.pi/extensions', 'extension', '.ts');
  scanDir('.pi/agents', 'agent', '.md');
  scanDir('.pi/prompts', 'prompt', '.md');
  scanDir('.pi/skills', 'skill', '.md');

  // Also include top-level .md files
  for (const f of ['AGENTS.md', 'EVALUATION.md']) {
    const fullPath = join(root, f);
    if (existsSync(fullPath)) {
      try {
        files.push({
          relativePath: f,
          content: readFileSync(fullPath, 'utf8').slice(0, 6000),
          type: 'config',
        });
      } catch { /* skip */ }
    }
  }

  return files;
}

// ─── Proposal generation ──────────────────────────────────────────────────────

interface RawProposal {
  title: string;
  summary: string;
  rationale: string;
  evidence: Array<{ title: string; url: string; relevance: string }>;
  targetFile: string;
  targetSection?: string;
  suggestedChange: string;
  patch?: string;
  scoreBreakdown: {
    novelty: number;
    impact: number;
    feasibility: number;
    evidenceQuality: number;
  };
}

async function generateForInsight(
  insight: string,
  sourceItem: ResearchItem,
  targetFiles: TargetFile[],
  cycleId: number,
): Promise<Proposal | null> {
  // Pick the most relevant target files (keep prompt short for 7B model)
  const relevantFiles = targetFiles.slice(0, 4).map(
    (f) =>
      `FILE: ${f.relativePath}\n` +
      `TYPE: ${f.type}\n` +
      `CONTENT (truncated):\n${f.content.slice(0, 1200)}\n`,
  ).join('\n---\n');

  const prompt = `You are improving a multi-agent AI coding assistant (based-agent).

RESEARCH INSIGHT:
${insight}

SOURCE: ${sourceItem.title} (${sourceItem.url})
SUMMARY: ${sourceItem.summary}

CURRENT CODEBASE FILES (pick the most relevant one to improve):
${relevantFiles}

Generate ONE specific improvement proposal. Be concrete — describe exactly what code, prompt, or configuration to change.

Respond ONLY with this JSON structure:
{
  "title": "<short descriptive title, max 80 chars>",
  "summary": "<1-2 sentence TL;DR for the UI card>",
  "rationale": "<3-5 sentence explanation of why this improves the system, citing the research>",
  "evidence": [{"title": "${sourceItem.title}", "url": "${sourceItem.url}", "relevance": "<one sentence>"}],
  "targetFile": "<path relative to based-agent root, e.g. .pi/extensions/safety-gate.ts>",
  "targetSection": "<optional: function name or section heading>",
  "suggestedChange": "<specific description of what to add/modify/remove>",
  "patch": "<optional unified diff starting with --- and +++, or omit if too complex>",
  "scoreBreakdown": {
    "novelty": <0-25>,
    "impact": <0-25>,
    "feasibility": <0-25>,
    "evidenceQuality": <0-25>
  }
}`;

  try {
    const raw = await quality(prompt, SYSTEM_GENERATOR, { temperature: 0.5, numPredict: 2000 });
    const result = extractJSON<RawProposal>(raw);
    if (!result?.title) return null;

    const breakdown = result.scoreBreakdown ?? { novelty: 10, impact: 10, feasibility: 10, evidenceQuality: 10 };
    const score = Math.min(100, (breakdown.novelty + breakdown.impact + breakdown.feasibility + breakdown.evidenceQuality));

    const now = new Date().toISOString();
    return {
      id: uuidv4(),
      title: result.title,
      summary: result.summary ?? '',
      rationale: result.rationale ?? '',
      evidence: result.evidence ?? [],
      targetFile: result.targetFile ?? '',
      targetSection: result.targetSection,
      suggestedChange: result.suggestedChange ?? '',
      patch: result.patch && result.patch.includes('---') ? result.patch : undefined,
      score,
      scoreBreakdown: {
        novelty: Math.min(25, Math.max(0, breakdown.novelty)),
        impact: Math.min(25, Math.max(0, breakdown.impact)),
        feasibility: Math.min(25, Math.max(0, breakdown.feasibility)),
        evidenceQuality: Math.min(25, Math.max(0, breakdown.evidenceQuality)),
      },
      scoreHistory: [{ score, reason: 'Initial score at generation', cycleId, timestamp: now }],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      cycleId,
      sourceIds: [sourceItem.id],
    };
  } catch (e) {
    console.warn('[generator] proposal generation error:', e);
    return null;
  }
}

/** Generate proposals from a batch of distilled research items */
export async function generateProposals(
  items: ResearchItem[],
  cycleId: number,
): Promise<Proposal[]> {
  if (items.length === 0) return [];

  const targetFiles = readTargetFiles();
  if (targetFiles.length === 0) {
    console.warn('[generator] no target files found — based-agent path may be wrong');
  }

  const proposals: Proposal[] = [];

  // Generate at most 2 proposals per cycle to keep quality high
  const highValue = items
    .filter((i) => (i.relevanceScore ?? 0) >= 7)
    .slice(0, 2);

  if (highValue.length === 0 && items.length > 0) {
    highValue.push(items[0]); // fallback: use the first item
  }

  for (const item of highValue) {
    for (const insight of (item.insights ?? []).slice(0, 1)) {
      console.log(`[generator] generating proposal from: "${item.title}"`);
      emit({ type: 'generate-start', level: 'info', cycleId,
        message: `Drafting proposal from: ${item.title.slice(0, 70)}` });
      const proposal = await generateForInsight(insight, item, targetFiles, cycleId);
      if (proposal) {
        proposals.push(proposal);
        console.log(`[generator] created proposal: "${proposal.title}" (score: ${proposal.score})`);
        emit({ type: 'proposal-new', level: 'success', cycleId,
          message: `Proposal ready (${proposal.score}/100): "${proposal.title.slice(0, 70)}"` });
      }
    }
  }

  return proposals;
}
