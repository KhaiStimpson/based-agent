import { checkOllama } from './llm/ollama.js';
import { checkPiModel } from './llm/pi-client.js';
import { mainLoop } from './loop/scheduler.js';
import { startServer } from './api/server.js';
import { config, PIPELINE_DESCRIPTIONS } from './config.js';

const MODE_ICONS: Record<string, string> = {
  local:  '⚙️ ',
  hybrid: '⚗️ ',
  cloud:  '✨',
};

async function main(): Promise<void> {
  console.log('');
  console.log('  ██████╗  █████╗ ██╗     ██████╗ ██╗  ██╗');
  console.log('  ██╔══██╗██╔══██╗██║     ██╔══██╗██║  ██║');
  console.log('  ██████╔╝███████║██║     ██████╔╝███████║');
  console.log('  ██╔══██╗██╔══██║██║     ██╔═══╝ ██╔══██║');
  console.log('  ██║  ██║██║  ██║███████╗██║     ██║  ██║');
  console.log('  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝');
  console.log('  Research · Analyze · Learn · Propose · Human-approve\n');

  const mode = config.pipeline.mode;
  console.log(`${MODE_ICONS[mode] ?? '🔹'} Pipeline: ${mode.toUpperCase()}`);
  console.log(`   ${PIPELINE_DESCRIPTIONS[mode]}\n`);

  // Ollama (always needed — even cloud mode uses phi4-mini for pre-filter)
  const ollamaCheck = await checkOllama();
  if (!ollamaCheck.ok) {
    console.error(`❌ Ollama is not reachable at ${config.ollama.url}`);
    console.error(`   Error: ${ollamaCheck.error}`);
    console.error(`   Make sure Ollama is running: https://ollama.com`);
    process.exit(1);
  }

  // In cloud mode, only phi4-mini is strictly required (quality model is skipped)
  const requiredModels = mode === 'cloud'
    ? [config.ollama.fastModel]
    : [config.ollama.fastModel, config.ollama.qualityModel];

  const missingModels = requiredModels.filter(
    (m) => !ollamaCheck.models.some((installed) => installed.startsWith(m)),
  );
  if (missingModels.length > 0) {
    console.warn(`⚠️  Ollama models missing: ${missingModels.join(', ')}`);
    console.warn(`   Run: ${missingModels.map((m) => `ollama pull ${m}`).join(' && ')}`);
  } else {
    const modelList = mode === 'cloud'
      ? `pre-filter: ${config.ollama.fastModel}`
      : `fast: ${config.ollama.fastModel}, quality: ${config.ollama.qualityModel}`;
    console.log(`✅ Ollama OK — ${modelList}`);
  }

  // Cloud model (needed for hybrid and cloud modes)
  if (mode !== 'local') {
    const piCheck = await checkPiModel();
    if (!piCheck.ok) {
      console.warn(`⚠️  Cloud model (${config.cloud.model}): ${piCheck.error}`);
      if (piCheck.available?.length) {
        console.warn(`   Available: ${piCheck.available.slice(0, 5).join(', ')}`);
      }
      if (mode === 'cloud') {
        console.warn('   ⚠️  Cloud mode requires cloud model — falling back will skip distil/synthesis.');
      } else {
        console.warn('   Hybrid synthesis will be skipped this session.');
      }
    } else {
      console.log(`✨ Cloud model: ${piCheck.model}`);
    }
  } else {
    console.log(`⚙️  Cloud model: disabled (local mode)`);
  }

  console.log(`\n📦 Based-agent:   ${config.paths.basedAgent}`);
  console.log(`📊 Data dir:      ${config.paths.data}`);
  console.log(`🔁 Cycle:         ~${config.loop.cycleMinutes} min (±20%)`);
  console.log(`⏰  Checkpoint:    every ${config.loop.checkpointHours}h`);
  console.log(`🌐 Approval UI:   http://localhost:${config.server.port}`);
  console.log('');

  startServer();
  await mainLoop();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
