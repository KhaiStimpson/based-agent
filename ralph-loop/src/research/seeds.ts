// ─── Research Seeds ────────────────────────────────────────────────────────────
// Each seed defines one arxiv query and one GitHub query.
// Queries rotate across cycles so we don't hammer the same endpoints every run.

export interface Seed {
  id: string;
  label: string;
  arxiv: {
    query: string;         // arxiv API search_query format
    categories?: string[]; // e.g. ['cs.AI', 'cs.LG']
  };
  github: {
    query: string;         // GitHub code search query
  };
}

export const SEEDS: Seed[] = [
  // ── Multi-Agent Systems ───────────────────────────────────────────────────
  {
    id: 'mas-coordination',
    label: 'Multi-Agent Coordination',
    arxiv: { query: 'multi-agent+LLM+coordination', categories: ['cs.AI', 'cs.MA'] },
    github: { query: 'multi-agent LLM framework stars:>100' },
  },
  {
    id: 'mas-self-evolution',
    label: 'Self-Evolving Agents',
    arxiv: { query: 'self-evolving+agent+LLM', categories: ['cs.AI'] },
    github: { query: 'self-improving AI agent stars:>50' },
  },
  {
    id: 'mas-topology',
    label: 'Agent Topology & Orchestration',
    arxiv: { query: 'agent+topology+orchestration+DAG', categories: ['cs.AI', 'cs.MA'] },
    github: { query: 'agentic workflow orchestration DAG' },
  },
  {
    id: 'mas-spawn-routing',
    label: 'Dynamic Agent Spawning & Routing',
    arxiv: { query: 'dynamic+agent+spawning+routing+LLM', categories: ['cs.AI'] },
    github: { query: 'dynamic agent routing LLM stars:>50' },
  },
  // ── Evaluation & Judgment ─────────────────────────────────────────────────
  {
    id: 'llm-as-judge',
    label: 'LLM-as-a-Judge',
    arxiv: { query: 'LLM+judge+evaluation+bias', categories: ['cs.CL', 'cs.AI'] },
    github: { query: 'LLM judge evaluation framework stars:>100' },
  },
  {
    id: 'eval-benchmark',
    label: 'Agentic Benchmarks',
    arxiv: { query: 'agentic+benchmark+evaluation', categories: ['cs.AI', 'cs.LG'] },
    github: { query: 'agentic AI benchmark evaluation stars:>100' },
  },
  // ── Memory & RAG ──────────────────────────────────────────────────────────
  {
    id: 'agent-memory',
    label: 'Agent Memory & Context',
    arxiv: { query: 'agent+memory+long-context+LLM', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'agent memory RAG long context stars:>100' },
  },
  {
    id: 'rag-improvements',
    label: 'RAG Techniques',
    arxiv: { query: 'retrieval-augmented+generation+improvements', categories: ['cs.IR', 'cs.CL'] },
    github: { query: 'advanced RAG retrieval augmented generation stars:>200' },
  },
  // ── Reasoning & Planning ──────────────────────────────────────────────────
  {
    id: 'chain-of-thought',
    label: 'Reasoning & Chain of Thought',
    arxiv: { query: 'chain-of-thought+reasoning+planning+LLM', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'chain of thought reasoning LLM stars:>100' },
  },
  {
    id: 'test-time-compute',
    label: 'Test-Time Compute Scaling',
    arxiv: { query: 'test-time+compute+scaling+LLM+inference', categories: ['cs.LG', 'cs.AI'] },
    github: { query: 'test time compute scaling inference stars:>50' },
  },
  // ── Tool Use & Code ───────────────────────────────────────────────────────
  {
    id: 'tool-use',
    label: 'Tool Use & Function Calling',
    arxiv: { query: 'tool+use+function+calling+LLM+agent', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'LLM tool use function calling agent stars:>100' },
  },
  {
    id: 'coding-agents',
    label: 'Coding Agents & SWE',
    arxiv: { query: 'coding+agent+software+engineering+LLM', categories: ['cs.SE', 'cs.AI'] },
    github: { query: 'AI coding agent software engineering stars:>200' },
  },
  // ── Prompt Engineering ────────────────────────────────────────────────────
  {
    id: 'prompt-optimization',
    label: 'Prompt Optimization & DSPy',
    arxiv: { query: 'prompt+optimization+automatic+LLM', categories: ['cs.CL', 'cs.AI'] },
    github: { query: 'automatic prompt optimization DSPy stars:>100' },
  },
  {
    id: 'system-prompt-design',
    label: 'System Prompt & Instruction Design',
    arxiv: { query: 'system+prompt+instruction+tuning+agent', categories: ['cs.CL'] },
    github: { query: 'system prompt engineering agent design stars:>50' },
  },
  // ── Safety & Reliability ──────────────────────────────────────────────────
  {
    id: 'agent-safety',
    label: 'Agent Safety & Guardrails',
    arxiv: { query: 'agent+safety+guardrails+alignment+LLM', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'LLM agent safety guardrails alignment stars:>50' },
  },
  {
    id: 'hallucination-reduction',
    label: 'Hallucination & Reliability',
    arxiv: { query: 'hallucination+reduction+grounding+LLM', categories: ['cs.CL', 'cs.AI'] },
    github: { query: 'LLM hallucination reduction grounding stars:>100' },
  },
  // ── Emerging agent operations ─────────────────────────────────────────────
  {
    id: 'agent-context-engineering',
    label: 'Agent Context Engineering',
    arxiv: { query: 'context+engineering+LLM+agents+memory', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'context engineering LLM agent memory stars:>50' },
  },
  {
    id: 'agent-runtime-evaluation',
    label: 'Runtime Agent Evaluation',
    arxiv: { query: 'runtime+evaluation+LLM+agents+production', categories: ['cs.AI', 'cs.SE'] },
    github: { query: 'LLM agent runtime evaluation telemetry stars:>50' },
  },
  {
    id: 'agent-failure-attribution',
    label: 'Agent Failure Attribution',
    arxiv: { query: 'failure+attribution+LLM+agents+debugging', categories: ['cs.AI', 'cs.SE'] },
    github: { query: 'LLM agent failure attribution debugging stars:>50' },
  },
  {
    id: 'multi-agent-verification',
    label: 'Multi-Agent Verification',
    arxiv: { query: 'multi-agent+verification+LLM+agents', categories: ['cs.AI', 'cs.SE'] },
    github: { query: 'multi-agent verification LLM agents stars:>50' },
  },
  {
    id: 'agent-tool-use-reliability',
    label: 'Tool-Use Reliability',
    arxiv: { query: 'tool+use+reliability+LLM+agents', categories: ['cs.AI', 'cs.CL'] },
    github: { query: 'LLM tool use reliability agents stars:>50' },
  },
  {
    id: 'computer-use-agents',
    label: 'Computer-Use Agents',
    arxiv: { query: 'computer+use+agents+GUI+LLM', categories: ['cs.AI', 'cs.HC'] },
    github: { query: 'computer use agents GUI LLM stars:>50' },
  },
];

import type { DynamicSeed } from '../types.js';

/** Convert a stored DynamicSeed into the Seed shape used by the crawlers */
function dynamicToSeed(d: DynamicSeed): Seed {
  return {
    id: d.id,
    label: `${d.label} ★${d.frequency}`,
    arxiv: { query: d.query.replace(/\s+/g, '+') },
    github: { query: d.githubQuery },
  };
}

/**
 * Build the seed pool for one cycle by merging static seeds with dynamic ones.
 *
 * Strategy:
 *   - Pool = SEEDS (static, 16) + top dynamic seeds sorted by frequency
 *   - Round-robin offset advances by `count` each cycle so we never
 *     repeat the same seeds two cycles in a row
 *   - Dynamic seeds appear naturally once the pool grows past 16
 */
export function seedsForCycle(
  cycleId: number,
  count: number,
  dynamicSeeds: DynamicSeed[] = [],
): Seed[] {
  // Interleave: for every 2 static seeds include 1 dynamic seed when available
  const staticSeeds = SEEDS;
  const dynSeeds = dynamicSeeds
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, Math.min(dynamicSeeds.length, staticSeeds.length)) // cap at 1:1 ratio
    .map(dynamicToSeed);

  // Interleaved pool: s s d s s d s s d ...
  const pool: Seed[] = [];
  const dynStep = dynSeeds.length > 0 ? Math.ceil(staticSeeds.length / dynSeeds.length) : Infinity;
  let dynIdx = 0;
  for (let i = 0; i < staticSeeds.length; i++) {
    pool.push(staticSeeds[i]);
    if ((i + 1) % dynStep === 0 && dynIdx < dynSeeds.length) {
      pool.push(dynSeeds[dynIdx++]);
    }
  }
  // Append any remaining dynamic seeds at the end
  while (dynIdx < dynSeeds.length) pool.push(dynSeeds[dynIdx++]);

  const offset = (cycleId * count) % pool.length;
  const result: Seed[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[(offset + i) % pool.length]);
  }
  return result;
}
