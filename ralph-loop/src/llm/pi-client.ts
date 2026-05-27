import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { config } from '../config.js';
import { emit } from '../events/bus.js';

// ─── Cached registry (one auth load per process) ─────────────────────────────

let _auth: AuthStorage | null = null;
let _registry: ModelRegistry | null = null;

function getRegistry(): { auth: AuthStorage; registry: ModelRegistry } {
  if (!_auth) {
    _auth = AuthStorage.create();
    _registry = ModelRegistry.create(_auth);
  }
  return { auth: _auth, registry: _registry! };
}

// ─── Single-shot completion via pi subscription ───────────────────────────────

/**
 * Send a prompt to a strong cloud model through the user's pi subscription.
 * Creates a fresh in-memory session with no tools — pure reasoning only.
 * Returns the full text response.
 */
export async function piComplete(
  prompt: string,
  systemPrompt: string,
  timeoutMs = 300_000,
): Promise<string> {
  const { auth, registry } = getRegistry();

  const [provider, ...parts] = config.cloud.model.split('/');
  const modelId = parts.join('/');
  const model = registry.find(provider, modelId);

  if (!model) {
    throw new Error(
      `pi model "${config.cloud.model}" not found. ` +
      `Run the startup check to see available models.`,
    );
  }

  // Override the system prompt; skip loading project extensions/skills
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    noTools: 'all',         // Pure LLM — no file access, no tool calls
    sessionManager: SessionManager.inMemory(),
    resourceLoader: loader,
    authStorage: auth,
    modelRegistry: registry,
  });

  const chunks: string[] = [];
  const unsub = session.subscribe((event) => {
    if (
      event.type === 'message_update' &&
      event.assistantMessageEvent.type === 'text_delta'
    ) {
      chunks.push(event.assistantMessageEvent.delta);
    }
  });

  const timer = setTimeout(() => {
    session.abort().catch(() => {});
  }, timeoutMs);

  try {
    await session.prompt(prompt);
  } finally {
    clearTimeout(timer);
    unsub();
    session.dispose();
  }

  return chunks.join('');
}

// ─── Startup check ────────────────────────────────────────────────────────────

export interface PiModelCheck {
  ok: boolean;
  model: string;
  provider: string;
  available?: string[];
  error?: string;
}

export async function checkPiModel(): Promise<PiModelCheck> {
  if (!config.cloud.enabled) {
    return { ok: false, model: config.cloud.model, provider: '', error: 'Cloud synthesis disabled (CLOUD_ENABLED=false)' };
  }
  try {
    const { registry } = getRegistry();
    const [provider, ...parts] = config.cloud.model.split('/');
    const modelId = parts.join('/');

    const available = await registry.getAvailable();
    const availableIds = available.map((m) => `${m.provider}/${m.id}`);

    const found = availableIds.includes(config.cloud.model);
    if (!found) {
      return {
        ok: false,
        model: config.cloud.model,
        provider,
        available: availableIds.slice(0, 10),
        error: `Model not found in available list`,
      };
    }
    return { ok: true, model: config.cloud.model, provider };
  } catch (e) {
    return { ok: false, model: config.cloud.model, provider: '', error: String(e) };
  }
}
