import { config } from '../config.js';

export interface OllamaGenerateOptions {
  temperature?: number;
  numPredict?: number;   // max tokens
  topP?: number;
  jsonMode?: boolean;    // pass format:"json" to Ollama — forces valid JSON output
  timeoutMs?: number;   // per-call timeout override (default: 300_000 = 5 min)
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

// Core generate call — non-streaming
export async function ollamaGenerate(
  model: string,
  prompt: string,
  system?: string,
  opts: OllamaGenerateOptions = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    system,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.4,
      num_predict: opts.numPredict ?? 2048,
      top_p: opts.topP ?? 0.9,
    },
  };
  if (opts.jsonMode) body['format'] = 'json';

  const res = await fetch(`${config.ollama.url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000), // default 5 min
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama generate failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  return data.response.trim();
}

// Convenience wrappers

/** Fast tier — Phi-4-mini. Use for bulk summarisation/extraction. */
export function fast(prompt: string, system?: string, opts?: OllamaGenerateOptions): Promise<string> {
  return ollamaGenerate(config.ollama.fastModel, prompt, system, opts);
}

/** Quality tier — Mistral 7B (or configured model). Use for proposals & ranking. */
export function quality(prompt: string, system?: string, opts?: OllamaGenerateOptions): Promise<string> {
  return ollamaGenerate(config.ollama.qualityModel, prompt, system, opts);
}

/** Check whether Ollama is reachable and a given model is available. */
export async function checkOllama(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const models = data.models.map((m) => m.name);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: String(e) };
  }
}

/**
 * Repair common LLM JSON mistakes in one character pass:
 *   - Literal \n / \r / \t inside quoted strings  (gpt-5.5 does this in long summaries)
 *   - Trailing commas before } or ]
 */
function repairJSON(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)                { esc = false; out += c; continue; }
    if (c === '\\' && inStr){ esc = true;  out += c; continue; }
    if (c === '"')          { inStr = !inStr; out += c; continue; }
    if (inStr) {
      if      (c === '\n') { out += '\\n'; continue; }
      else if (c === '\r') { out += '\\r'; continue; }
      else if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Robustly extract a JSON object or array from an LLM response.
 * Handles: raw JSON, ```json fences, prose-wrapped JSON,
 *          literal control chars in strings, trailing commas.
 */
export function extractJSON<T>(text: string): T | null {
  const candidates: string[] = [];

  // 1. Fence match — ONLY if the fence wraps the whole response (not embedded
  //    code blocks inside JSON patch strings, which would produce false matches).
  //    Require the opening fence to appear within the first 20 non-whitespace chars.
  const fenceMatch = text.match(/^\s*```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const content = fenceMatch[1].trim();
    if (content.startsWith('{') || content.startsWith('[')) {
      candidates.push(content);
    }
  }

  // 2. Brace-match: try [ before { so arrays are preferred over single objects.
  //    (A model might return [{...}] and the { match would grab just the first
  //    object, succeeding but returning the wrong type.)
  for (const startChar of ['[', '{'] as const) {
    const endChar = startChar === '[' ? ']' : '}';
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (esc)                 { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true;  continue; }
      if (c === '"')           { inStr = !inStr; continue; }
      if (inStr)               continue;
      if (c === startChar)     { if (depth++ === 0) start = i; }
      else if (c === endChar && depth > 0 && --depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1)); break;
      }
    }
  }
  candidates.push(text.trim());

  // 3. Try each candidate: direct → repaired (control-char + trailing-comma fix)
  for (const raw of candidates) {
    if (!raw) continue;
    try { return JSON.parse(raw) as T; } catch { /* fall through */ }
    try { return JSON.parse(repairJSON(raw)) as T; } catch { /* next candidate */ }
  }
  return null;
}
