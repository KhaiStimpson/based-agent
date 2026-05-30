import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function env(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}
function envInt(key: string, defaultValue: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : defaultValue;
}

// ─── Pipeline mode ────────────────────────────────────────────────────────────

export type PipelineMode = 'local' | 'hybrid' | 'cloud';

function parsePipelineMode(raw: string): PipelineMode {
  const v = raw.trim().toLowerCase();
  if (v === 'local' || v === 'hybrid' || v === 'cloud') return v;
  console.warn(`[config] Unknown PIPELINE_MODE "${raw}", falling back to "hybrid"`);
  return 'hybrid';
}

export const PIPELINE_DESCRIPTIONS: Record<PipelineMode, string> = {
  local:  'phi4-mini distil → phi4-mini keywords → local generation → local re-rank',
  hybrid: 'phi4-mini distil → phi4-mini keywords → cloud synthesis  → local re-rank',
  cloud:  'phi4-mini pre-filter → cloud batch distil+keywords → cloud synthesis → cloud re-rank',
};

// ─── Config ───────────────────────────────────────────────────────────────────

export const config = {
  pipeline: {
    mode: parsePipelineMode(env('PIPELINE_MODE', 'hybrid')),
  },
  ollama: {
    url:          env('OLLAMA_URL', 'http://localhost:11434'),
    fastModel:    env('RALPH_FAST_MODEL', 'phi4-mini'),
    qualityModel: env('RALPH_QUALITY_MODEL', 'mistral'),
  },
  github: {
    token: env('GITHUB_TOKEN', ''),
  },
  semanticScholar: {
    apiKey: env('SEMANTIC_SCHOLAR_KEY', ''),
  },
  cloud: {
    // cloud.enabled is derived from PIPELINE_MODE — true when mode is hybrid or cloud.
    // CLOUD_ENABLED=false overrides everything and forces local mode.
    get enabled() {
      if (env('CLOUD_ENABLED', 'true') === 'false') return false;
      return config.pipeline.mode !== 'local';
    },
    model: env('CLOUD_MODEL', 'github-copilot/gpt-5.5'),
  },
  loop: {
    cycleMinutes:           envInt('CYCLE_MINUTES', 75),
    checkpointHours:        envInt('CHECKPOINT_HOURS', 24),
    seedsPerCycle:          envInt('SEEDS_PER_CYCLE', 4),
    arxivResultsPerQuery:   envInt('ARXIV_RESULTS_PER_QUERY', 8),
    githubResultsPerQuery:  envInt('GITHUB_RESULTS_PER_QUERY', 5),
    minRelevance:           envInt('MIN_RELEVANCE', 6),
    // In cloud mode, pre-filter is very lenient (let cloud model decide relevance)
    get preFilterThreshold() {
      return config.pipeline.mode === 'cloud' ? 3 : config.loop.minRelevance;
    },
  },
  paths: {
    basedAgent: resolve(process.cwd(), env('BASED_AGENT_PATH', '../based-agent')),
    data:       resolve(process.cwd(), 'data'),
  },
  server: {
    port: envInt('PORT', 3741),
  },
} as const;
