/**
 * skill-registry.ts
 *
 * Tracks skill lifecycle states: provisional → validated → deprecated/project-policy.
 * Each skill has triggers, contraindications, examples, success rates, and an owner.
 * Enforces the promotion ladder from ELL: raw trace → lesson → provisional →
 * validated → project policy.
 *
 * Research basis: ELL/StuLife — procedural memory and skill lifecycle;
 *   "85.5% of skills contain no executable scripts" — skills are documented workflows.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
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



// ─── Types ────────────────────────────────────────────────────────────────────

type SkillStatus = "raw_lesson" | "provisional" | "validated" | "deprecated" | "project_policy";

interface SkillRecord {
  id: string;
  name: string;
  description: string;
  trigger: string;
  contraindications: string[];
  steps: string[];
  examples: string[];
  success_rate?: number;
  attempt_count: number;
  pass_count: number;
  status: SkillStatus;
  source: string;
  owner?: string;
  created_at: string;
  last_used_at?: string;
  last_validated_at?: string;
  promoted_at?: string;
  deprecated_reason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(6).toString("hex");
}

function skillsDir(piDir: string): string {
  const d = path.join(piDir, "evals", "skills");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function skillFilePath(piDir: string, id: string): string {
  return path.join(skillsDir(piDir), `${id}.json`);
}

function readSkill(piDir: string, id: string): SkillRecord | null {
  const fp = skillFilePath(piDir, id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as SkillRecord;
  } catch {
    return null;
  }
}

function writeSkill(piDir: string, skill: SkillRecord): void {
  fs.writeFileSync(skillFilePath(piDir, skill.id), JSON.stringify(skill, null, 2), "utf-8");
}

function listSkills(piDir: string): SkillRecord[] {
  const dir = skillsDir(piDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as SkillRecord;
      } catch {
        return null;
      }
    })
    .filter((s): s is SkillRecord => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Compute success rate
function updateSuccessRate(skill: SkillRecord): SkillRecord {
  if (skill.attempt_count > 0) {
    skill.success_rate = Math.round((skill.pass_count / skill.attempt_count) * 100) / 100;
  }
  return skill;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    basePiDir = PACKAGE_PI_DIR;
    fs.mkdirSync(basePiDir, { recursive: true });
  });

  // ─── Tool: skill_register ─────────────────────────────────────────────────
  pi.registerTool({
    name: "skill_register",
    label: "Skill Register",
    description:
      "Register a new skill in the skill registry. Skills start as 'provisional' and must " +
      "be validated on multiple tasks before promotion. " +
      "Follows ELL skill lifecycle: raw_lesson → provisional → validated → project_policy.",
    parameters: Type.Object({
      name: Type.String({ description: "Unique skill name, e.g. 'feature-spec' or 'anti-bystander-review'" }),
      description: Type.String({ description: "What this skill teaches or enables" }),
      trigger: Type.String({
        description: "When to use this skill: the condition or task type that should trigger it",
      }),
      contraindications: Type.Array(Type.String(), {
        description: "When NOT to use this skill: conditions that make it harmful or inapplicable",
      }),
      steps: Type.Array(Type.String(), {
        description: "Ordered steps of the skill workflow",
      }),
      examples: Type.Array(Type.String(), {
        description: "Concrete examples of applying this skill",
      }),
      source: Type.String({
        description: "Where this skill came from: trace ID, failure postmortem, expert observation, etc.",
      }),
      initial_status: Type.Optional(
        StringEnum(["raw_lesson", "provisional"] as const, {
          description: "Starting status (default: provisional)",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Skill registry not initialized" }], isError: true };
      }

      // Check for duplicate name
      const existing = listSkills(basePiDir).find(
        (s) => s.name === params.name && s.status !== "deprecated",
      );
      if (existing) {
        return {
          content: [
            {
              type: "text",
              text: `Skill '${params.name}' already exists (id=${existing.id}, status=${existing.status}). Use skill_promote to update.`,
            },
          ],
          details: { duplicate_id: existing.id },
        };
      }

      const id = `sk-${Date.now()}-${generateId()}`;
      const skill: SkillRecord = {
        id,
        name: params.name,
        description: params.description,
        trigger: params.trigger,
        contraindications: params.contraindications,
        steps: params.steps,
        examples: params.examples,
        source: params.source,
        status: params.initial_status ?? "provisional",
        attempt_count: 0,
        pass_count: 0,
        created_at: new Date().toISOString(),
      };
      writeSkill(basePiDir, skill);

      return {
        content: [
          {
            type: "text",
            text:
              `Skill registered: ${id}\n  Name: ${params.name}\n  Status: ${skill.status}\n` +
              `  Steps: ${params.steps.length}\n  Trigger: ${params.trigger}`,
          },
        ],
        details: skill,
      };
    },
  });

  // ─── Tool: skill_promote ──────────────────────────────────────────────────
  pi.registerTool({
    name: "skill_promote",
    label: "Skill Promote",
    description:
      "Promote a skill to the next lifecycle stage or record an attempt outcome. " +
      "Promotion ladder: raw_lesson → provisional → validated → project_policy.",
    parameters: Type.Object({
      skill_id: Type.String({ description: "Skill ID to act on" }),
      action: StringEnum(["record_pass", "record_fail", "promote", "validate"] as const, {
        description:
          "record_pass/record_fail: update outcome stats; promote: advance to next stage; validate: mark as validated",
      }),
      evidence: Type.Optional(
        Type.String({
          description: "Evidence for the action (required for promote and validate)",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Skill registry not initialized" }], isError: true };
      }

      const skill = readSkill(basePiDir, params.skill_id);
      if (!skill) {
        return { content: [{ type: "text", text: `Skill not found: ${params.skill_id}` }], isError: true };
      }

      let updated = { ...skill };
      const now = new Date().toISOString();

      switch (params.action) {
        case "record_pass":
          updated.attempt_count++;
          updated.pass_count++;
          updated.last_used_at = now;
          break;
        case "record_fail":
          updated.attempt_count++;
          updated.last_used_at = now;
          break;
        case "promote": {
          const next: Record<SkillStatus, SkillStatus | null> = {
            raw_lesson: "provisional",
            provisional: "validated",
            validated: "project_policy",
            project_policy: null,
            deprecated: null,
          };
          const nextStatus = next[skill.status];
          if (!nextStatus) {
            return {
              content: [{ type: "text", text: `Cannot promote from status '${skill.status}'` }],
              isError: true,
            };
          }
          if (!params.evidence) {
            return {
              content: [{ type: "text", text: "Evidence required for promotion. Attach test results or trace refs." }],
              isError: true,
            };
          }
          updated.status = nextStatus;
          updated.promoted_at = now;
          updated.last_validated_at = now;
          break;
        }
        case "validate":
          if (!params.evidence) {
            return {
              content: [{ type: "text", text: "Evidence required for validation." }],
              isError: true,
            };
          }
          updated.last_validated_at = now;
          if (updated.status === "provisional") updated.status = "validated";
          break;
      }

      updated = updateSuccessRate(updated);
      writeSkill(basePiDir, updated);

      return {
        content: [
          {
            type: "text",
            text:
              `Skill ${params.skill_id} updated (${params.action}):\n` +
              `  Status: ${updated.status}\n` +
              `  Success rate: ${updated.success_rate !== undefined ? (updated.success_rate * 100).toFixed(0) + "%" : "n/a"} (${updated.pass_count}/${updated.attempt_count})`,
          },
        ],
        details: updated,
      };
    },
  });

  // ─── Tool: skill_deprecate ────────────────────────────────────────────────
  pi.registerTool({
    name: "skill_deprecate",
    label: "Skill Deprecate",
    description: "Deprecate a skill that is no longer valid, harmful, or superseded.",
    parameters: Type.Object({
      skill_id: Type.String({ description: "Skill ID to deprecate" }),
      reason: Type.String({ description: "Why this skill is being deprecated" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Skill registry not initialized" }], isError: true };
      }
      const skill = readSkill(basePiDir, params.skill_id);
      if (!skill) {
        return { content: [{ type: "text", text: `Skill not found: ${params.skill_id}` }], isError: true };
      }
      const updated: SkillRecord = {
        ...skill,
        status: "deprecated",
        deprecated_reason: params.reason,
        last_validated_at: new Date().toISOString(),
      };
      writeSkill(basePiDir, updated);
      return {
        content: [{ type: "text", text: `Skill ${params.skill_id} deprecated: ${params.reason}` }],
        details: updated,
      };
    },
  });

  // ─── Tool: skill_query ────────────────────────────────────────────────────
  pi.registerTool({
    name: "skill_query",
    label: "Skill Query",
    description: "Search skills by name or trigger keyword.",
    parameters: Type.Object({
      query: Type.String({ description: "Search term" }),
      status: Type.Optional(Type.String({ description: "Filter by status" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!basePiDir) {
        return { content: [{ type: "text", text: "Skill registry not initialized" }], isError: true };
      }
      const q = params.query.toLowerCase();
      let skills = listSkills(basePiDir).filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.trigger.toLowerCase().includes(q),
      );
      if (params.status) skills = skills.filter((s) => s.status === params.status);
      if (skills.length === 0) {
        return { content: [{ type: "text", text: `No skills match '${params.query}'` }] };
      }
      const lines = skills.slice(0, 10).map((s) => {
        const rate = s.success_rate !== undefined ? ` (${(s.success_rate * 100).toFixed(0)}% pass)` : "";
        return `${s.id} [${s.status}]${rate}\n  ${s.name}: ${s.description.slice(0, 80)}\n  Trigger: ${s.trigger.slice(0, 80)}`;
      });
      return {
        content: [{ type: "text", text: `${skills.length} match(es):\n\n${lines.join("\n\n")}` }],
        details: { skills: skills.slice(0, 10) },
      };
    },
  });

  // ─── /skills: show skill lifecycle summary ────────────────────────────────
  pi.registerCommand("skills", {
    description: "Show skill registry with lifecycle status summary",
    handler: async (_args, ctx) => {
      if (!basePiDir) {
        ctx.ui.notify("Skill registry not initialized", "error");
        return;
      }
      const skills = listSkills(basePiDir);
      if (skills.length === 0) {
        ctx.ui.notify("No skills registered. Use skill_register to add skills.", "info");
        return;
      }
      const counts: Record<SkillStatus, number> = {
        raw_lesson: 0, provisional: 0, validated: 0, project_policy: 0, deprecated: 0,
      };
      for (const s of skills) counts[s.status]++;
      const lines = [
        `Skill Registry (${skills.length} total):`,
        `  raw_lesson: ${counts.raw_lesson}  provisional: ${counts.provisional}  validated: ${counts.validated}  project_policy: ${counts.project_policy}  deprecated: ${counts.deprecated}`,
        "",
        "Active skills (provisional+validated+project_policy):",
        ...skills
          .filter((s) => s.status !== "deprecated" && s.status !== "raw_lesson")
          .slice(0, 10)
          .map((s) => {
            const rate = s.success_rate !== undefined ? ` ${(s.success_rate * 100).toFixed(0)}%` : "";
            return `  [${s.status}${rate}] ${s.name}`;
          }),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
