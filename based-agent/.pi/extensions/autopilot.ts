/**
 * autopilot.ts
 *
 * Autonomous supervisor layer for based-agent. It turns skills, memory,
 * validation, review, reload, and learning into default behavior so the user
 * can simply ask Pi to build or fix something.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

type AutopilotMode = "autonomous" | "assistive" | "observe";
type DurableMemoryMode = "automatic" | "proposal_first" | "off";
type WorkingKind = "constraint" | "failure" | "decision" | "observation" | "skill_candidate" | "validation";
type WorkingSource =
  | "autopilot"
  | "file_read"
  | "file_write"
  | "validation_failure"
  | "validation_success"
  | "user_correction"
  | "safety_warning"
  | "agent_tool";

interface AutopilotConfig {
  enabled: boolean;
  mode: AutopilotMode;
  retry_limit: number;
  visibility: {
    announce_workflow: boolean;
    announce_skills: boolean;
    announce_memory: boolean;
    announce_retries: boolean;
    announce_reload: boolean;
  };
  working_memory: {
    enabled: boolean;
    promote_on_completion: boolean;
    failed_attempts_start_session_local: boolean;
  };
  working_skills: {
    enabled: boolean;
    proposal_first: boolean;
  };
  reload: {
    enabled: boolean;
    after_meaningful_working_write: boolean;
    strategy: "immediate" | "checkpointed" | "off";
  };
  durable_memory: {
    write_mode: DurableMemoryMode;
    allowed_modes: DurableMemoryMode[];
  };
  evolution: {
    protected_change_mode: "proposal_first" | "block";
    auto_create_proposals: boolean;
    auto_apply_proposals: boolean;
  };
  review: {
    auto_review: "always" | "risk_based" | "off";
  };
  external_research?: {
    ralph_proposals_path?: string;
    use_applied_proposals?: boolean;
    use_high_score_pending_as_inspiration?: boolean;
    max_items?: number;
  };
}

interface TaskProfile {
  kinds: string[];
  risk_flags: string[];
  spawn_inputs: { If: number; Cc: number; Fc: number; Oc: number; Uc: number };
  spawn_score: number;
  should_spawn: boolean;
  topology: "single_agent" | "scout_plan_build" | "parallel_review" | "evolution_pipeline";
}

interface CapabilityPlanItem {
  name: string;
  when: "startup" | "planning" | "during" | "review" | "completion";
  automatic: boolean;
  reason: string;
}

interface WorkingItem {
  id: string;
  kind: WorkingKind;
  status: "working";
  source: WorkingSource;
  content: string;
  evidence?: {
    file?: string;
    command?: string;
    exit_code?: number | null;
    tool?: string;
    output_summary?: string;
  };
  promote_at_completion: boolean;
  created_at: string;
}

interface DurableMemoryItem {
  id: string;
  type: "fact" | "decision" | "skill" | "heuristic" | "episode" | "reminder" | "negative_lesson";
  scope: "repo" | "project" | "user" | "global";
  status: "provisional" | "validated" | "deprecated" | "contradicted";
  source: string;
  salience: "novel" | "constraint" | "future-critical" | "failure-linked" | "preference" | "validation-linked";
  content: string;
  confidence: "low" | "medium" | "high";
  created_at: string;
  last_validated_at: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CONFIG: AutopilotConfig = {
  enabled: true,
  mode: "autonomous",
  retry_limit: 2,
  visibility: {
    announce_workflow: true,
    announce_skills: true,
    announce_memory: true,
    announce_retries: true,
    announce_reload: true,
  },
  working_memory: {
    enabled: true,
    promote_on_completion: true,
    failed_attempts_start_session_local: true,
  },
  working_skills: {
    enabled: true,
    proposal_first: true,
  },
  reload: {
    enabled: true,
    after_meaningful_working_write: true,
    strategy: "checkpointed",
  },
  durable_memory: {
    write_mode: "automatic",
    allowed_modes: ["automatic", "proposal_first", "off"],
  },
  evolution: {
    protected_change_mode: "proposal_first",
    auto_create_proposals: true,
    auto_apply_proposals: false,
  },
  review: {
    auto_review: "risk_based",
  },
  external_research: {
    ralph_proposals_path: "../ralph-loop/data/proposals/proposals.json",
    use_applied_proposals: true,
    use_high_score_pending_as_inspiration: true,
    max_items: 5,
  },
};

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write", "edit", "create"]);
const SHELL_TOOLS = new Set(["bash", "shell", "terminal"]);
const VALIDATION_RE = /\b(test|check|lint|tsc|validate|doctor|status)\b|npm run (test|check|lint|validate|doctor|status)/i;
const PROTECTED_RE = /(^|\/)(AGENTS\.md|\.pi\/extensions|\.pi\/skills|\.pi\/memory|\.pi\/evals\/judge-corpus)(\/|$)/i;

let packagePiDir = "";
let packageRoot = "";
let config: AutopilotConfig = DEFAULT_CONFIG;
let runId = "";
let activePrompt = "";
let selectedWorkflow = "Workflow A";
let selectedSkills: string[] = [];
let selectedMemory: string[] = [];
let selectedResearch: string[] = [];
let taskProfile: TaskProfile = {
  kinds: [],
  risk_flags: [],
  spawn_inputs: { If: 0, Cc: 0, Fc: 0, Oc: 0, Uc: 0 },
  spawn_score: 0,
  should_spawn: false,
  topology: "single_agent",
};
let capabilityPlan: CapabilityPlanItem[] = [];
let workingItems: WorkingItem[] = [];
let commandsSeen: Array<{ command: string; exit_code?: number | null; output_summary?: string }> = [];
let changedFiles = new Set<string>();
let inspectedFiles = new Set<string>();
let failuresThisRun = 0;
let refreshQueuedReason: string | null = null;
let promotedIds = new Set<string>();

function findPackagePiDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "AGENTS.md"))) return path.join(dir, ".pi");
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const sub = path.join(process.cwd(), "based-agent");
  if (fs.existsSync(path.join(sub, "AGENTS.md"))) return path.join(sub, ".pi");
  return path.join(process.cwd(), ".pi");
}

function id(prefix = "wm"): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function readJson<T>(fp: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(fp, "utf-8")) };
  } catch {
    return fallback;
  }
}

function loadConfig(): AutopilotConfig {
  const fp = path.join(packagePiDir, "autopilot.json");
  const loaded = readJson<Partial<AutopilotConfig>>(fp, DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG,
    ...loaded,
    visibility: { ...DEFAULT_CONFIG.visibility, ...(loaded.visibility ?? {}) },
    working_memory: { ...DEFAULT_CONFIG.working_memory, ...(loaded.working_memory ?? {}) },
    working_skills: { ...DEFAULT_CONFIG.working_skills, ...(loaded.working_skills ?? {}) },
    reload: { ...DEFAULT_CONFIG.reload, ...(loaded.reload ?? {}) },
    durable_memory: { ...DEFAULT_CONFIG.durable_memory, ...(loaded.durable_memory ?? {}) },
    evolution: { ...DEFAULT_CONFIG.evolution, ...(loaded.evolution ?? {}) },
    review: { ...DEFAULT_CONFIG.review, ...(loaded.review ?? {}) },
    external_research: { ...DEFAULT_CONFIG.external_research, ...(loaded.external_research ?? {}) },
  };
}

function todayRunsDir(): string {
  const dir = path.join(packagePiDir, "runs", new Date().toISOString().slice(0, 10), runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function workingMemoryPath(): string {
  return path.join(todayRunsDir(), "working-memory.jsonl");
}

function workingSkillsPath(): string {
  return path.join(todayRunsDir(), "working-skills.jsonl");
}

function appendJsonl(fp: string, item: unknown): void {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.appendFileSync(fp, `${JSON.stringify(item)}\n`, "utf-8");
}

function redact(value: string): string {
  return value.replace(/([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)[^\s"']+/gi, "$1[REDACTED]");
}

function compact(value: unknown, max = 240): string {
  if (typeof value === "string") return redact(value).slice(0, max);
  try {
    return redact(JSON.stringify(value)).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function extractPath(input: Record<string, unknown>): string | undefined {
  const value = input.path ?? input.file_path ?? input.file ?? input.filename;
  return typeof value === "string" ? value.replace(/\\/g, "/") : undefined;
}

function extractCommand(input: Record<string, unknown>): string | undefined {
  const value = input.command ?? input.cmd;
  return typeof value === "string" ? redact(value).slice(0, 400) : undefined;
}

function classifyWorkflow(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/agent|prompt|skill|extension|memory|evolution|judge|topology/.test(text)) return "Workflow E/F";
  if (/debug|fix|failing|error|regression|broken/.test(text)) return "Workflow D";
  if (/build|implement|add|create|refactor|feature|ui|app/.test(text)) return "Workflow B";
  return "Workflow A";
}

function spawnScore(inputs: TaskProfile["spawn_inputs"]): number {
  return Math.round((0.3 * inputs.If + 0.2 * inputs.Cc + 0.25 * inputs.Fc + 0.15 * inputs.Oc + 0.1 * inputs.Uc) * 1000) / 1000;
}

function classifyTaskProfile(prompt: string): TaskProfile {
  const text = prompt.toLowerCase();
  const kinds = new Set<string>();
  const risk = new Set<string>();

  if (/build|implement|add|create|refactor|feature|app|ui|api/.test(text)) kinds.add("coding");
  if (/debug|fix|failing|error|regression|broken/.test(text)) kinds.add("debugging");
  if (/review|audit|risk|verify|validate/.test(text)) kinds.add("review");
  if (/research|paper|proposal|evidence|benchmark/.test(text)) kinds.add("research");
  if (/memory|remember|context|curat|learn/.test(text)) kinds.add("memory");
  if (/skill|playbook|command|extension/.test(text)) kinds.add("skill");
  if (/topology|spawn|multi-agent|parallel|workflow|orchestrat/.test(text)) kinds.add("topology");
  if (/judge|eval|compare|preference|bias|verdict/.test(text)) kinds.add("judge");
  if (/curriculum|frontier|holdout|challenge|regression/.test(text)) kinds.add("curriculum");
  if (/evolution|self-improv|prompt|routing|protected|policy|governance/.test(text)) kinds.add("evolution");
  if (kinds.size === 0) kinds.add("general");

  if (/agents\.md|\.pi[\\/](extensions|skills|memory|evals)|prompt|routing|topology|governance|policy/.test(text)) {
    risk.add("protected_or_governed_change");
  }
  if (/multi-file|multiple files|cross-file|refactor|architecture|system|extension|workflow/.test(text)) risk.add("multi_file_or_cross_module");
  if (/test|lint|validate|doctor|ci|regression|done|ship|fix/.test(text)) risk.add("validation_required");
  if (/review|audit|risk|protected|security|safety|governance|policy/.test(text)) risk.add("review_required");
  if (/spawn|parallel|multi-agent|research|large|complex|system|architecture|topology/.test(text)) risk.add("spawn_score_required");
  if (/topology|workflow|multi-agent|orchestrat|parallel/.test(text)) risk.add("topology_required");
  if (/evolution|self-improv|prompt|extension|skill|routing|protected/.test(text)) risk.add("evolution_proposal_required");
  if (/fail|debug|regression|lesson|reusable|frontier|curriculum/.test(text)) risk.add("curriculum_seed_candidate");

  const inputs = {
    If: risk.has("multi_file_or_cross_module") ? 0.75 : /file|module|repo/.test(text) ? 0.45 : 0.2,
    Cc: /complex|architecture|refactor|algorithm|workflow/.test(text) ? 0.65 : 0.25,
    Fc: /fail|failing|regression|broken|ci/.test(text) ? 0.8 : 0.1,
    Oc: /large|all|entire|research|proposal|context/.test(text) ? 0.65 : 0.25,
    Uc: /unknown|unclear|maybe|explore|research|proposal|audit/.test(text) ? 0.65 : 0.25,
  };
  const score = spawnScore(inputs);
  const topology =
    risk.has("evolution_proposal_required") ? "evolution_pipeline" :
    score >= 0.7 ? "parallel_review" :
    score >= 0.45 ? "scout_plan_build" :
    "single_agent";

  return {
    kinds: [...kinds],
    risk_flags: [...risk],
    spawn_inputs: inputs,
    spawn_score: score,
    should_spawn: score >= 0.7,
    topology,
  };
}

function skillMatches(prompt: string): string[] {
  const text = prompt.toLowerCase();
  const profile = classifyTaskProfile(prompt);
  const skills: string[] = ["repo-validation", "rollout-summary"];
  if (/debug|fix|failing|error|regression|broken/.test(text)) skills.push("failure-attribution");
  if (/review|risk|change|protected|security|safety|policy/.test(text) || profile.risk_flags.includes("review_required")) skills.push("anti-bystander-review");
  if (/memory|remember|learn|context|curat/.test(text) || profile.kinds.includes("memory")) skills.push("lifelong-memory");
  if (/skill|playbook|workflow|extension|command/.test(text) || profile.kinds.includes("skill")) skills.push("skill-lifecycle");
  if (/build|implement|add|create|refactor|feature|ui|frontend|screen|page|component|dashboard|api/.test(text)) skills.push("feature-spec");
  if (/large|context|many files|all files|compress|prun|spawn/.test(text) || profile.spawn_score >= 0.45) skills.push("context-pruning");
  if (/topology|spawn|multi-agent|parallel|workflow|orchestrat/.test(text) || profile.risk_flags.includes("topology_required")) skills.push("topology-authoring");
  if (/todo|follow-up|later|defer|blocked|pending|deadline/.test(text)) skills.push("prospective-agenda");
  if (/curriculum|frontier|holdout|challenge|regression|repeated failure/.test(text) || profile.risk_flags.includes("curriculum_seed_candidate")) {
    skills.push("curriculum-generation");
  }
  if (/judge|eval|compare|preference|bias|verdict|pairwise/.test(text) || profile.kinds.includes("judge")) skills.push("eval-planning");
  if (/evolution|self-improv|prompt|routing|protected|policy|governance/.test(text) || profile.risk_flags.includes("evolution_proposal_required")) {
    skills.push("evolution-proposal");
  }
  return Array.from(new Set(skills));
}

function buildCapabilityPlan(profile: TaskProfile): CapabilityPlanItem[] {
  const items: CapabilityPlanItem[] = [
    { name: "config-linter", when: "startup", automatic: true, reason: "validate AGENTS.md/settings/schema drift at session start" },
    { name: "memory-hygiene-gate", when: "startup", automatic: true, reason: "prefer clean selected memory and quarantine unstable items" },
    { name: "revisitable-memory-router", when: "startup", automatic: true, reason: "surface evidence cards from prior attempt summaries" },
    { name: "trace-ledger", when: "during", automatic: true, reason: "record tool calls/results for attribution and summaries" },
    { name: "safety-gate", when: "during", automatic: true, reason: "block destructive or protected operations" },
    { name: "validation-gate", when: "completion", automatic: true, reason: "enforce done means available checks pass" },
    { name: "attempt-summarizer", when: "completion", automatic: true, reason: "emit compact attempt summary for memory/curriculum/evolution" },
    { name: "trajectory-auditor", when: "completion", automatic: true, reason: "detect command/extension/validation lessons from traces" },
    { name: "context-memory-curator", when: "completion", automatic: true, reason: "keep low-latency typed context memory fresh" },
  ];

  if (profile.spawn_score >= 0.45) {
    items.push(
      { name: "context-pack-builder", when: "planning", automatic: true, reason: "build role-aware compressed context pack for complex tasks" },
      { name: "memory-slicer", when: "planning", automatic: true, reason: "retrieve scoped typed memory instead of raw transcript context" },
      { name: "spawn-controller", when: "planning", automatic: true, reason: `computed spawn score ${profile.spawn_score.toFixed(3)}` },
    );
  }
  if (profile.risk_flags.includes("topology_required") || profile.spawn_score >= 0.7) {
    items.push({ name: "topology-runner", when: "planning", automatic: true, reason: "schema-check difficulty-aware workflow before parallel work" });
  }
  if (profile.risk_flags.includes("review_required") || config.review.auto_review === "always") {
    items.push({ name: "review-aggregator", when: "review", automatic: true, reason: "run independent evidence-first review/test aggregation" });
  }
  if (profile.kinds.includes("judge")) {
    items.push({ name: "judge-evolution", when: "review", automatic: true, reason: "use pairwise plan-execute-verdict and bias guards" });
  }
  if (profile.kinds.includes("skill") || profile.kinds.includes("memory")) {
    items.push(
      { name: "skill-ecosystem-auditor", when: "startup", automatic: true, reason: "find skill registry gaps and stale skills" },
      { name: "skill-internalizer", when: "completion", automatic: true, reason: "turn repeated lessons into governed skill candidates" },
      { name: "skill-memory-curator", when: "completion", automatic: true, reason: "promote reusable skill outcomes into skill memory candidates" },
    );
  }
  if (profile.risk_flags.includes("curriculum_seed_candidate") || profile.kinds.includes("curriculum")) {
    items.push({ name: "curriculum-generator", when: "completion", automatic: true, reason: "seed frontier tasks from failures and reusable insights" });
  }
  if (profile.risk_flags.includes("evolution_proposal_required") || profile.kinds.includes("evolution")) {
    items.push(
      { name: "evolution-scanner", when: "completion", automatic: true, reason: "convert observed improvement opportunities into proposals" },
      { name: "evolution-governor", when: "completion", automatic: true, reason: "keep protected changes in approval/promote/rollback lifecycle" },
    );
  }
  if (/todo|follow-up|later|defer|blocked|pending/.test(activePrompt.toLowerCase())) {
    items.push({ name: "prospective-agenda", when: "completion", automatic: true, reason: "record future obligations with trigger and success criteria" });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name}:${item.when}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadRelevantMemory(prompt: string): string[] {
  const memoryRoot = path.join(packagePiDir, "memory");
  if (!fs.existsSync(memoryRoot)) return [];
  const words = prompt.toLowerCase().split(/[^a-z0-9_.-]+/).filter((w) => w.length >= 5);
  const hits: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fp);
      else if (entry.name.endsWith(".json")) {
        try {
          const text = fs.readFileSync(fp, "utf-8");
          const haystack = text.toLowerCase();
          if (words.some((w) => haystack.includes(w))) {
            const parsed = JSON.parse(text) as { content?: string; salience?: string; confidence?: string };
            const rel = path.relative(packageRoot, fp).replace(/\\/g, "/");
            hits.push(`${rel}: ${String(parsed.content ?? "").slice(0, 180)} (${parsed.salience ?? "novel"}/${parsed.confidence ?? "medium"})`);
          }
        } catch {
          // Ignore malformed memory.
        }
      }
    }
  }
  walk(memoryRoot);
  try {
    const hygiene = JSON.parse(fs.readFileSync(path.join(memoryRoot, "hygiene-report.json"), "utf-8")) as {
      selected_context?: Array<{ file?: string; text?: string; risk?: string[] }>;
      guidance?: string[];
    };
    for (const item of hygiene.selected_context ?? []) {
      const haystack = `${item.file ?? ""} ${item.text ?? ""}`.toLowerCase();
      if (words.length === 0 || words.some((w) => haystack.includes(w))) {
        hits.push(`.pi/memory/hygiene-report.json:${item.file ?? "selected"}: ${String(item.text ?? "").slice(0, 180)} (hygiene-selected)`);
      }
    }
    for (const guidance of hygiene.guidance ?? []) hits.push(`.pi/memory/hygiene-report.json: ${guidance} (hygiene-guidance)`);
  } catch {
    // Hygiene report is optional and generated by memory-hygiene-gate.
  }
  try {
    const packet = JSON.parse(fs.readFileSync(path.join(memoryRoot, "session-memory-packet.json"), "utf-8")) as {
      cards?: Array<{ kind?: string; claim?: string; confidence?: number; source?: string }>;
    };
    for (const card of packet.cards ?? []) {
      hits.push(`.pi/memory/session-memory-packet.json: [${card.kind ?? "memory"}] ${String(card.claim ?? "").slice(0, 180)} (${card.confidence ?? "?"})`);
    }
  } catch {
    // Packet is optional and generated by revisitable-memory-router.
  }
  return hits.slice(0, 10);
}

function resolveFromPackageRoot(relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(packageRoot, relOrAbs);
}

function loadResearchInspirations(prompt: string): string[] {
  const research = config.external_research;
  if (!research?.ralph_proposals_path) return [];
  const fp = resolveFromPackageRoot(research.ralph_proposals_path);
  if (!fs.existsSync(fp)) return [];
  const text = prompt.toLowerCase();
  const words = text.split(/[^a-z0-9_.-]+/).filter((w) => w.length >= 5);
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8")) as unknown;
    const proposals = Array.isArray(raw) ? raw : (raw as { proposals?: unknown[] }).proposals ?? [];
    return proposals
      .filter((p): p is Record<string, unknown> => p !== null && typeof p === "object")
      .filter((p) => {
        const status = String(p.status ?? "").toLowerCase();
        const haystack = JSON.stringify(p).toLowerCase();
        const statusOk =
          (research.use_applied_proposals && status === "applied") ||
          (research.use_high_score_pending_as_inspiration && /pending|approved|proposed/.test(status));
        return statusOk && (words.length === 0 || words.some((w) => haystack.includes(w)));
      })
      .sort((a, b) => Number(b.score ?? b.priority ?? 0) - Number(a.score ?? a.priority ?? 0))
      .slice(0, research.max_items ?? 5)
      .map((p) => {
        const title = String(p.title ?? p.name ?? p.id ?? "proposal");
        const status = String(p.status ?? "unknown");
        const target = String(p.target_file ?? p.artifact ?? p.extension ?? "");
        const summary = String(p.summary ?? p.rationale ?? p.description ?? "").replace(/\s+/g, " ").slice(0, 180);
        return `${title} [${status}]${target ? ` -> ${target}` : ""}: ${summary}`;
      });
  } catch {
    return [];
  }
}

function writeWorkingItem(item: Omit<WorkingItem, "id" | "status" | "created_at">): WorkingItem {
  const full: WorkingItem = {
    id: id(item.kind === "skill_candidate" ? "wsk" : "wm"),
    status: "working",
    created_at: new Date().toISOString(),
    ...item,
  };
  workingItems.push(full);
  appendJsonl(item.kind === "skill_candidate" ? workingSkillsPath() : workingMemoryPath(), full);
  return full;
}

function queueReload(reason: string): void {
  if (!config.reload.enabled || !config.reload.after_meaningful_working_write || config.reload.strategy === "off") return;
  refreshQueuedReason = reason;
}

function maybeRefreshWorkingContext(pi: ExtensionAPI, ctx: { ui?: { notify: (message: string, level?: "info" | "warning" | "error") => void } }): void {
  if (!refreshQueuedReason) return;
  const reason = refreshQueuedReason;
  refreshQueuedReason = null;
  const latest = workingItems.slice(-5).map((item) => `- [${item.kind}] ${item.content.slice(0, 220)}`).join("\n");
  pi.sendMessage(
    {
      customType: "autopilot-working-context-refresh",
      content: [
        `Autopilot refreshed session-local working context (${reason}).`,
        "",
        latest || "No working memory items recorded yet.",
        "",
        "Use this updated working context immediately in the current task. A full Pi resource reload is only needed after durable skill, prompt, or extension resource changes.",
      ].join("\n"),
      display: true,
    },
    { deliverAs: "steer", triggerTurn: false },
  );
  if (config.visibility.announce_reload) ctx.ui?.notify(`Autopilot injected refreshed working context (${reason}).`, "info");
}

function durableTypeFor(item: WorkingItem): DurableMemoryItem["type"] {
  if (item.kind === "failure") return "negative_lesson";
  if (item.kind === "decision") return "decision";
  if (item.kind === "skill_candidate") return "skill";
  if (item.kind === "constraint") return "fact";
  return "heuristic";
}

function durableSalienceFor(item: WorkingItem): DurableMemoryItem["salience"] {
  if (item.kind === "failure") return "failure-linked";
  if (item.kind === "validation") return "validation-linked";
  if (item.kind === "constraint") return "constraint";
  if (item.kind === "decision") return "future-critical";
  return "novel";
}

function memoryFilePath(type: DurableMemoryItem["type"], idValue: string): string {
  const dir = path.join(packagePiDir, "memory", type);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${idValue}.json`);
}

function proposalFilePath(idValue: string): string {
  const dir = path.join(packagePiDir, "memory-proposals");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${idValue}.json`);
}

function promoteWorkingMemory(): { promoted: number; proposed: number; skipped: number } {
  if (!config.working_memory.promote_on_completion) return { promoted: 0, proposed: 0, skipped: workingItems.length };
  if (config.durable_memory.write_mode === "off") return { promoted: 0, proposed: 0, skipped: workingItems.length };

  let promoted = 0;
  let proposed = 0;
  let skipped = 0;
  for (const item of workingItems) {
    if (!item.promote_at_completion || promotedIds.has(item.id)) {
      skipped += 1;
      continue;
    }
    if (item.kind === "skill_candidate" && config.working_skills.proposal_first) {
      appendJsonl(path.join(packagePiDir, "evals", "skills", "working-candidates.jsonl"), item);
      promotedIds.add(item.id);
      proposed += 1;
      continue;
    }

    const durableId = id("mem");
    const durable: DurableMemoryItem = {
      id: durableId,
      type: durableTypeFor(item),
      scope: "repo",
      status: item.kind === "validation" || item.source === "validation_success" ? "validated" : "provisional",
      source: `${item.source}:${item.id}`,
      salience: durableSalienceFor(item),
      content: item.content,
      confidence: item.source === "user_correction" || item.source === "validation_success" ? "high" : "medium",
      created_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
      metadata: {
        working_memory_id: item.id,
        evidence: item.evidence,
        run_id: runId,
      },
    };

    if (config.durable_memory.write_mode === "proposal_first") {
      fs.writeFileSync(proposalFilePath(durableId), JSON.stringify(durable, null, 2), "utf-8");
      proposed += 1;
    } else {
      fs.writeFileSync(memoryFilePath(durable.type, durableId), JSON.stringify(durable, null, 2), "utf-8");
      promoted += 1;
    }
    promotedIds.add(item.id);
  }
  return { promoted, proposed, skipped };
}

function writeAutopilotContextPack(): string | null {
  if (!capabilityPlan.some((item) => item.name === "context-pack-builder")) return null;
  const fp = path.join(todayRunsDir(), "context-pack-autopilot.md");
  const lines = [
    "# Autopilot Context Pack",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Task Profile",
    `- kinds: ${taskProfile.kinds.join(", ") || "general"}`,
    `- risk_flags: ${taskProfile.risk_flags.join(", ") || "none"}`,
    `- topology: ${taskProfile.topology}`,
    `- spawn_score: ${taskProfile.spawn_score.toFixed(3)}`,
    "",
    "## Selected Skills",
    ...selectedSkills.map((skill) => `- ${skill}`),
    "",
    "## Capability Plan",
    ...capabilityPlan.map((item) => `- [${item.when}] ${item.name}: ${item.reason}`),
    "",
    "## Selected Memory",
    ...(selectedMemory.length ? selectedMemory.map((m) => `- ${m}`) : ["- No selected memory."]),
    "",
    "## Research/Proposal Inspiration",
    ...(selectedResearch.length ? selectedResearch.map((r) => `- ${r}`) : ["- No related proposal inspiration found."]),
  ];
  fs.writeFileSync(fp, lines.join("\n"), "utf-8");
  return path.relative(packageRoot, fp).replace(/\\/g, "/");
}

function writeRuntimeReport(result?: { promoted: number; proposed: number; skipped: number }): void {
  const report = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    workflow: selectedWorkflow,
    task_profile: taskProfile,
    skills: selectedSkills,
    memory_hits: selectedMemory.length,
    research_hits: selectedResearch.length,
    capability_plan: capabilityPlan,
    commands_seen: commandsSeen,
    changed_files: [...changedFiles],
    inspected_files: [...inspectedFiles],
    failures_this_run: failuresThisRun,
    working_items: workingItems.length,
    completion_promotion: result,
  };
  fs.writeFileSync(path.join(todayRunsDir(), "autopilot-runtime.json"), JSON.stringify(report, null, 2), "utf-8");
}

function autopilotPromptBlock(): string {
  const memoryBlock = selectedMemory.length
    ? selectedMemory.map((m) => `- ${m}`).join("\n")
    : "- No durable memory matched this prompt. Use working memory as you learn.";
  const researchBlock = selectedResearch.length
    ? selectedResearch.map((m) => `- ${m}`).join("\n")
    : "- No related RALPH proposals matched, or proposal import is unavailable.";
  const capabilityBlock = capabilityPlan.length
    ? capabilityPlan.map((item) => `- [${item.when}] ${item.name}: ${item.reason}`).join("\n")
    : "- Core validation, safety, trace, and summary extensions remain active.";
  return [
    "",
    "## Based-Agent Autopilot",
    "",
    `Mode: ${config.mode}. The user should not need to call skills, extensions, or diagnostic commands manually.`,
    `Selected workflow: ${selectedWorkflow}. Retry limit: ${config.retry_limit}.`,
    `Selected skills: ${selectedSkills.join(", ") || "repo-validation"}.`,
    `Task profile: ${taskProfile.kinds.join(", ") || "general"}; topology: ${taskProfile.topology}; spawn score: ${taskProfile.spawn_score.toFixed(3)}.`,
    `Risk flags: ${taskProfile.risk_flags.join(", ") || "none"}.`,
    "",
    "Autonomous operating rules:",
    "1. Announce the workflow, selected skills, selected memory, and retry count briefly.",
    "2. Use the selected skills as internal procedure, even when the user did not name them.",
    "3. Write session-local discoveries with `working_memory_add` while developing.",
    "4. On validation failure, record a working negative lesson before retrying.",
    "5. Retry validation failures up to the configured limit, unless safety or approval blocks progress.",
    "6. Protected changes must become evolution proposals; do not apply them directly.",
    "7. Before final success, run validation and record `validation_complete`.",
    "8. At completion, autopilot will promote working memory according to config.",
    "",
    "Extension capability plan:",
    capabilityBlock,
    "",
    "Relevant durable memory:",
    memoryBlock,
    "",
    "Relevant RALPH proposal/research inspiration:",
    researchBlock,
    "",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    packagePiDir = findPackagePiDir();
    packageRoot = path.dirname(packagePiDir);
    config = loadConfig();
    runId = ctx.sessionManager.getSessionFile?.()
      ? path.basename(ctx.sessionManager.getSessionFile()!, path.extname(ctx.sessionManager.getSessionFile()!))
      : `run-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    activePrompt = "";
    selectedWorkflow = "Workflow A";
    selectedSkills = [];
    selectedMemory = [];
    selectedResearch = [];
    taskProfile = {
      kinds: [],
      risk_flags: [],
      spawn_inputs: { If: 0, Cc: 0, Fc: 0, Oc: 0, Uc: 0 },
      spawn_score: 0,
      should_spawn: false,
      topology: "single_agent",
    };
    capabilityPlan = [];
    workingItems = [];
    commandsSeen = [];
    changedFiles = new Set();
    inspectedFiles = new Set();
    failuresThisRun = 0;
    refreshQueuedReason = null;
    promotedIds = new Set();

    if (config.enabled && event.reason !== "reload" && config.visibility.announce_workflow) {
      ctx.ui.notify(`Autopilot active: ${config.mode} mode, retry limit ${config.retry_limit}.`, "info");
    }
  });

  pi.on("input", async (event) => {
    if (!config.enabled || event.source === "extension") return { action: "continue" };
    activePrompt = event.text;
    selectedWorkflow = classifyWorkflow(event.text);
    taskProfile = classifyTaskProfile(event.text);
    selectedSkills = skillMatches(event.text);
    selectedMemory = loadRelevantMemory(event.text);
    selectedResearch = loadResearchInspirations(event.text);
    capabilityPlan = buildCapabilityPlan(taskProfile);
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event) => {
    if (!config.enabled) return undefined;
    if (!activePrompt) {
      activePrompt = event.prompt;
      selectedWorkflow = classifyWorkflow(event.prompt);
      taskProfile = classifyTaskProfile(event.prompt);
      selectedSkills = skillMatches(event.prompt);
      selectedMemory = loadRelevantMemory(event.prompt);
      selectedResearch = loadResearchInspirations(event.prompt);
      capabilityPlan = buildCapabilityPlan(taskProfile);
    }
    const contextPack = writeAutopilotContextPack();
    if (contextPack && config.visibility.announce_memory) {
      pi.sendMessage(
        {
          customType: "autopilot-context-pack",
          content: `Autopilot wrote a role-aware context pack for this task: ${contextPack}. Use it as the compact planning substrate.`,
          display: true,
        },
        { deliverAs: "steer", triggerTurn: false },
      );
    }
    return {
      systemPrompt: event.systemPrompt + autopilotPromptBlock(),
    };
  });

  pi.on("tool_call", async (event) => {
    if (!config.enabled) return undefined;
    const input = event.input as Record<string, unknown>;
    const filePath = extractPath(input);
    const command = extractCommand(input);
    if (filePath && READ_TOOLS.has(event.toolName)) inspectedFiles.add(filePath);
    if (filePath && WRITE_TOOLS.has(event.toolName)) {
      changedFiles.add(filePath);
      writeWorkingItem({
        kind: PROTECTED_RE.test(filePath) ? "decision" : "observation",
        source: "file_write",
        content: PROTECTED_RE.test(filePath)
          ? `Protected-path change attempted or proposed: ${filePath}. Route through evolution proposal workflow.`
          : `Changed file during current task: ${filePath}.`,
        evidence: { file: filePath, tool: event.toolName },
        promote_at_completion: PROTECTED_RE.test(filePath),
      });
      if (PROTECTED_RE.test(filePath)) queueReload("protected-path working decision");
    }
    if (command && SHELL_TOOLS.has(event.toolName)) {
      commandsSeen.push({ command, exit_code: null });
    }
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!config.enabled) return undefined;
    const text = event.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join(" ").slice(0, 500);
    const command = extractCommand(event.input as Record<string, unknown>);
    if (command) {
      const last = [...commandsSeen].reverse().find((c) => c.command === command && c.exit_code === null);
      if (last) {
        last.exit_code = event.isError ? 1 : 0;
        last.output_summary = redact(text).slice(0, 240);
      }
    }

    if (command && VALIDATION_RE.test(command)) {
      if (event.isError) {
        failuresThisRun += 1;
        writeWorkingItem({
          kind: "failure",
          source: "validation_failure",
          content: `Validation failed during task: ${command}. Use this session-local lesson before retry ${Math.min(failuresThisRun + 1, config.retry_limit + 1)}.`,
          evidence: { command, exit_code: 1, output_summary: redact(text).slice(0, 240), tool: event.toolName },
          promote_at_completion: true,
        });
        queueReload("validation failure");
        if (failuresThisRun <= config.retry_limit) {
          pi.sendMessage(
            {
              customType: "autopilot-retry",
              content: `Autopilot recorded the failed validation and refreshed working context. Retry ${failuresThisRun}/${config.retry_limit} is available; use debugger/failure-attribution before trying again.`,
              display: true,
            },
            { deliverAs: "steer", triggerTurn: false },
          );
        }
      } else {
        writeWorkingItem({
          kind: "validation",
          source: "validation_success",
          content: `Validation passed during task: ${command}.`,
          evidence: { command, exit_code: 0, output_summary: redact(text).slice(0, 240), tool: event.toolName },
          promote_at_completion: true,
        });
        queueReload("validation success");
      }
    }

    if (/safety|blocked|warning/i.test(text)) {
      writeWorkingItem({
        kind: "constraint",
        source: "safety_warning",
        content: `Safety signal observed during task: ${redact(text).slice(0, 240)}`,
        evidence: { tool: event.toolName, output_summary: redact(text).slice(0, 240) },
        promote_at_completion: true,
      });
      queueReload("safety signal");
    }

    if (refreshQueuedReason && config.reload.strategy === "immediate") maybeRefreshWorkingContext(pi, ctx);
    return undefined;
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!config.enabled) return;
    if (config.reload.strategy === "checkpointed") maybeRefreshWorkingContext(pi, ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!config.enabled) return;
    const result = promoteWorkingMemory();
    writeRuntimeReport(result);
    const statusPath = path.relative(packageRoot, todayRunsDir()).replace(/\\/g, "/");
    ctx.ui.notify(
      [
        "Autopilot completion pass",
        `- workflow: ${selectedWorkflow}`,
        `- profile: ${taskProfile.kinds.join(", ") || "general"} (${taskProfile.topology}, spawn ${taskProfile.spawn_score.toFixed(3)})`,
        `- skills: ${selectedSkills.join(", ") || "repo-validation"}`,
        `- capability plan: ${capabilityPlan.length} automatic item(s)`,
        `- working items: ${workingItems.length}`,
        `- durable promoted: ${result.promoted}`,
        `- proposals/candidates: ${result.proposed}`,
        `- run artifacts: ${statusPath}`,
      ].join("\n"),
      "info",
    );
    if (result.promoted > 0 || result.proposed > 0) {
      queueReload("completion promotion");
      maybeRefreshWorkingContext(pi, ctx);
    }
  });

  pi.registerTool({
    name: "working_memory_add",
    label: "Working Memory Add",
    description:
      "Record a session-local fact, failure, decision, constraint, observation, or skill candidate discovered during the current task. Autopilot can promote it at completion.",
    parameters: Type.Object({
      kind: StringEnum(["constraint", "failure", "decision", "observation", "skill_candidate", "validation"] as const),
      content: Type.String({ description: "The reusable session-local lesson or observation." }),
      source: StringEnum(
        ["autopilot", "file_read", "file_write", "validation_failure", "validation_success", "user_correction", "safety_warning", "agent_tool"] as const,
      ),
      promote_at_completion: Type.Optional(Type.Boolean({ description: "Whether this item should be considered for durable promotion." })),
      evidence_file: Type.Optional(Type.String({ description: "Relevant file path, if any." })),
      evidence_command: Type.Optional(Type.String({ description: "Relevant command, if any." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!config.enabled || !config.working_memory.enabled) {
        return { content: [{ type: "text", text: "Autopilot working memory is disabled." }], details: null, isError: true };
      }
      const item = writeWorkingItem({
        kind: params.kind,
        source: params.source,
        content: params.content,
        evidence: { file: params.evidence_file, command: params.evidence_command, tool: "working_memory_add" },
        promote_at_completion: params.promote_at_completion ?? params.kind !== "observation",
      });
      queueReload(`${params.kind} working memory`);
      return {
        content: [{ type: "text", text: `Working memory recorded: ${item.id}. Autopilot will refresh context at the next checkpoint.` }],
        details: item,
      };
    },
  });

  pi.registerCommand("autopilot", {
    description: "Show based-agent autopilot status and current session learning state.",
    handler: async (args, ctx) => {
      const sub = args.trim().split(/\s+/)[0] || "status";
      if (sub === "reload") {
        ctx.ui.notify("Autopilot reload requested.", "info");
        await ctx.reload();
        return;
      }
      if (sub === "promote") {
        const result = promoteWorkingMemory();
        ctx.ui.notify(`Autopilot promotion complete: ${result.promoted} promoted, ${result.proposed} proposed, ${result.skipped} skipped.`, "info");
        return;
      }
      const lines = [
        `Autopilot: ${config.enabled ? "enabled" : "disabled"} (${config.mode})`,
        `Workflow: ${selectedWorkflow}`,
        `Retry limit: ${config.retry_limit}; failures this run: ${failuresThisRun}`,
        `Profile: ${taskProfile.kinds.join(", ") || "general"}; topology: ${taskProfile.topology}; spawn score: ${taskProfile.spawn_score.toFixed(3)}`,
        `Risk flags: ${taskProfile.risk_flags.join(", ") || "none"}`,
        `Skills: ${selectedSkills.join(", ") || "(not selected yet)"}`,
        `Relevant memory: ${selectedMemory.length}`,
        `Research/proposal inspirations: ${selectedResearch.length}`,
        `Automatic capabilities: ${capabilityPlan.map((item) => item.name).join(", ") || "(not selected yet)"}`,
        `Working items: ${workingItems.length}`,
        `Changed files: ${changedFiles.size}`,
        `Inspected files: ${inspectedFiles.size}`,
        `Artifacts: ${path.relative(packageRoot, todayRunsDir()).replace(/\\/g, "/")}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
