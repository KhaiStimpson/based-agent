/**
 * revisitable-memory-router.ts
 *
 * Maintains a compact, revisitable evidence-card memory for long-horizon agent
 * work. Converts attempt summaries into queryable cards and surfaces only the
 * most relevant/recheck-worthy cards at session start.
 *
 * Research basis: Revisitable Memory, MemAgent, LSTM-MAS, MemoryCD.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// ─── Locate the package .pi directory ──────────────────────────────────────
// Walk up from process.cwd() to find the nearest AGENTS.md (package root).
// Falls back to cwd if not found. This is robust across pi launch directories
// and jiti ESM/CJS compilation modes.
function findPackagePiDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md'))) return path.join(dir, '.pi');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also check based-agent as a subdirectory (common when pi is run from parent)
  const sub = path.join(process.cwd(), 'based-agent');
  if (fs.existsSync(path.join(sub, 'AGENTS.md'))) return path.join(sub, '.pi');
  return path.join(process.cwd(), '.pi');
}
const PACKAGE_PI_DIR = findPackagePiDir();



interface EvidenceCard {
  id: string;
  kind: "repo_fact" | "user_preference" | "failure_pattern" | "solution_pattern" | "risk";
  claim: string;
  files: string[];
  keywords: string[];
  source: string;
  confidence: number;
  revisit_reason: string;
  invalidated_by?: string;
  created_at: string;
  last_seen_at: string;
}

interface AttemptSummaryLike {
  attempt_id?: string;
  hypothesis?: string;
  files_inspected?: string[];
  files_changed?: string[];
  progress_made?: string[];
  failure_modes?: string[];
  remaining_risks?: string[];
  reusable_insights?: string[];
  verdict?: string;
  saved_at?: string;
}

let basePiDir: string | null = null;

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function memoryDir(piDir: string): string {
  const d = path.join(piDir, "memory");
  ensureDir(d);
  return d;
}

function cardsPath(piDir: string): string {
  return path.join(memoryDir(piDir), "evidence-cards.jsonl");
}

function hash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_./-]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3)
        .slice(0, 80),
    ),
  );
}

function readCards(piDir: string): EvidenceCard[] {
  const fp = cardsPath(piDir);
  if (!fs.existsSync(fp)) return [];
  return fs
    .readFileSync(fp, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as EvidenceCard;
      } catch {
        return null;
      }
    })
    .filter((x): x is EvidenceCard => x !== null);
}

function appendCards(piDir: string, cards: EvidenceCard[]): void {
  if (cards.length === 0) return;
  const existing = new Set(readCards(piDir).map((c) => c.id));
  const novel = cards.filter((c) => !existing.has(c.id));
  if (novel.length === 0) return;
  fs.appendFileSync(cardsPath(piDir), novel.map((c) => JSON.stringify(c)).join("\n") + "\n");
}

function recentSummaryFiles(piDir: string, limit = 20): string[] {
  const runsDir = path.join(piDir, "runs");
  if (!fs.existsSync(runsDir)) return [];
  const out: string[] = [];
  for (const dateDir of fs.readdirSync(runsDir).sort().reverse()) {
    const full = path.join(runsDir, dateDir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full).filter((x) => x.endsWith("-summary.json")).sort().reverse()) {
      out.push(path.join(full, f));
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function cardsFromSummary(fp: string): EvidenceCard[] {
  let s: AttemptSummaryLike;
  try {
    s = JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return [];
  }
  const files = Array.from(new Set([...(s.files_inspected ?? []), ...(s.files_changed ?? [])]));
  const created = s.saved_at ?? new Date().toISOString();
  const source = path.normalize(fp);
  const baseText = [s.hypothesis, ...files].filter(Boolean).join(" ");
  const mk = (kind: EvidenceCard["kind"], claim: string, confidence: number, revisit_reason: string): EvidenceCard => ({
    id: hash(`${kind}|${claim}|${source}`),
    kind,
    claim,
    files,
    keywords: tokenize(`${baseText} ${claim}`),
    source,
    confidence,
    revisit_reason,
    created_at: created,
    last_seen_at: created,
  });

  const cards: EvidenceCard[] = [];
  for (const insight of s.reusable_insights ?? []) cards.push(mk("solution_pattern", insight, 0.78, "May transfer to similar files/tasks"));
  for (const risk of s.remaining_risks ?? []) cards.push(mk("risk", risk, 0.65, "Prior unresolved risk should be rechecked"));
  for (const failure of s.failure_modes ?? []) cards.push(mk("failure_pattern", failure, 0.72, "Avoid repeating known failure mode"));
  for (const progress of s.progress_made ?? []) cards.push(mk("repo_fact", progress, s.verdict === "candidate" ? 0.75 : 0.55, "Prior observed repo behavior"));
  return cards;
}

function scoreCard(card: EvidenceCard, queryTokens: Set<string>, queryText: string): number {
  if (card.invalidated_by) return -1;
  const overlap = card.keywords.filter((k) => queryTokens.has(k)).length;
  const fileHit = card.files.some((f) => queryText.includes(f.toLowerCase())) ? 2 : 0;
  const riskBoost = card.kind === "risk" || card.kind === "failure_pattern" ? 0.8 : 0;
  const ageMs = Date.now() - Date.parse(card.last_seen_at || card.created_at);
  const recency = Number.isFinite(ageMs) ? Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30)) : 0;
  return overlap + fileHit + riskBoost + recency + card.confidence;
}

function retrieve(piDir: string, query: string, limit = 8): EvidenceCard[] {
  const q = query.toLowerCase();
  const tokens = new Set(tokenize(q));
  return readCards(piDir)
    .map((card) => ({ card, score: scoreCard(card, tokens, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.card);
}

function writePacket(piDir: string, cards: EvidenceCard[], query: string): void {
  const packet = {
    generated_at: new Date().toISOString(),
    query_fingerprint: hash(query),
    instruction: "Revisit these memory cards as hypotheses, not truth. Verify stale or risky claims before relying on them.",
    cards: cards.map(({ id, kind, claim, files, confidence, revisit_reason, source }) => ({ id, kind, claim, files, confidence, revisit_reason, source })),
  };
  fs.writeFileSync(path.join(memoryDir(piDir), "session-memory-packet.json"), JSON.stringify(packet, null, 2));
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    for (const fp of recentSummaryFiles(basePiDir)) appendCards(basePiDir, cardsFromSummary(fp));
    const query = JSON.stringify(event ?? {}) + " " + process.argv.join(" ");
    writePacket(basePiDir, retrieve(basePiDir, query), query);
  });

  pi.on("session_end", async () => {
    if (!basePiDir) return;
    for (const fp of recentSummaryFiles(basePiDir, 5)) appendCards(basePiDir, cardsFromSummary(fp));
  });
}
