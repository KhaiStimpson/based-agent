/**
 * review-aggregator.ts
 *
 * Anti-bystander review protocol: shuffles and anonymizes independent reviews,
 * aggregates by evidence quality rather than vote count, preserves minority
 * blockers, and warns when consensus-based prompts are detected.
 *
 * Research basis: "The Bystander Effect in Multi-Agent Reasoning" —
 *   cognitive loafing, sovereignty collapse, lead-anchor effects.
 *   GPT-5.4 collapses with n=2 auditors; Claude Sonnet 4.6 maintains sovereignty.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as crypto from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";

interface Finding {
  severity: Severity;
  file?: string;
  line?: number;
  description: string;
  evidence: string;
  suggested_fix?: string;
}

interface ReviewInput {
  reviewer_id: string;
  findings: Finding[];
}

interface AggregatedFinding extends Finding {
  reviewer_alias: string;
  evidence_score: number;
}

interface AggregationResult {
  reviewer_count: number;
  total_findings: number;
  blockers: AggregatedFinding[];
  high_priority: AggregatedFinding[];
  medium_priority: AggregatedFinding[];
  low_priority: AggregatedFinding[];
  aggregation_notes: string[];
}

// ─── Anti-bystander constants ─────────────────────────────────────────────────

const CONSENSUS_PHRASES = [
  "multiple agents agree",
  "consensus",
  "other agents confirmed",
  "other agent found",
  "another agent checked",
  "team agrees",
  "we all agree",
  "agents agree",
  "majority agrees",
  "everyone agrees",
  "peer confirmed",
  "peer reviewed",
  "jointly confirmed",
];

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateAlias(index: number): string {
  const aliases = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo",
    "Foxtrot", "Golf", "Hotel", "India", "Juliet",
  ];
  return `Reviewer-${aliases[index % aliases.length]}`;
}

function scoreEvidence(finding: Finding): number {
  let score = 0;
  // File reference
  if (finding.file) score += 2;
  // Line number (specific location)
  if (finding.line !== undefined) score += 1;
  // Evidence length (rough proxy for detail)
  score += Math.min(3, Math.floor(finding.evidence.length / 50));
  // Suggested fix (shows actionability)
  if (finding.suggested_fix) score += 1;
  // Penalise vague language
  const vague = /\b(likely|seems|probably|maybe|might|could be|appears)\b/i;
  if (vague.test(finding.evidence)) score -= 1;
  return Math.max(0, score);
}

function aggregateReviews(reviews: ReviewInput[], shuffle: boolean): AggregationResult {
  const notes: string[] = [];
  const shuffledReviews = shuffle ? shuffleArray(reviews) : reviews;

  // Assign anonymous aliases
  const reviewerAliases = new Map<string, string>();
  shuffledReviews.forEach((r, i) => {
    const alias = generateAlias(i);
    reviewerAliases.set(r.reviewer_id, alias);
  });

  notes.push(`Aggregating ${reviews.length} review(s) with anonymized identities.`);
  if (shuffle) notes.push("Reviewer order has been randomized to prevent lead-anchor bias.");

  // Collect all findings with scores
  const allFindings: AggregatedFinding[] = [];
  for (const review of shuffledReviews) {
    const alias = reviewerAliases.get(review.reviewer_id) ?? "Unknown";
    for (const finding of review.findings) {
      allFindings.push({
        ...finding,
        reviewer_alias: alias,
        evidence_score: scoreEvidence(finding),
      });
    }
  }

  // Sort by severity, then evidence score (descending)
  allFindings.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.evidence_score - a.evidence_score;
  });

  // Separate into categories
  const blockers = allFindings.filter((f) => f.severity === "critical");
  const high = allFindings.filter((f) => f.severity === "high");
  const medium = allFindings.filter((f) => f.severity === "medium");
  const low = allFindings.filter((f) => f.severity === "low");

  // Preserve ALL critical findings regardless of count (minority blocker protection)
  if (blockers.length > 0) {
    notes.push(
      `${blockers.length} CRITICAL finding(s) preserved. Any single critical finding blocks promotion.`,
    );
  }

  // Warn about low-evidence high-severity findings
  const lowEvidenceHigh = high.filter((f) => f.evidence_score < 2);
  if (lowEvidenceHigh.length > 0) {
    notes.push(
      `${lowEvidenceHigh.length} high-severity finding(s) have weak evidence. Verify before acting.`,
    );
  }

  return {
    reviewer_count: reviews.length,
    total_findings: allFindings.length,
    blockers,
    high_priority: high,
    medium_priority: medium,
    low_priority: low,
    aggregation_notes: notes,
  };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ─── Session start: warn about bystander effect risk ─────────────────────
  pi.on("session_start", async (_event, ctx) => {
    // We can't easily detect configured review agents without reading the config,
    // but we can remind about the risk in a general way.
    // This is a no-op unless we detect relevant agent configurations.
  });

  // ─── Tool call: detect and warn about consensus prompts ──────────────────
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash" && event.toolName !== "write" && event.toolName !== "edit") {
      return undefined;
    }

    // Check for consensus phrases in tool input
    const inputStr = JSON.stringify(event.input).toLowerCase();
    const detected = CONSENSUS_PHRASES.filter((phrase) => inputStr.includes(phrase.toLowerCase()));

    if (detected.length > 0) {
      const warning =
        `⚠️ BYSTANDER EFFECT WARNING: Detected consensus-based reasoning phrase(s): ` +
        `"${detected[0]}". ` +
        `Independent evidence required. Do not rely on claims that other agents agree. ` +
        `Derive findings only from repository evidence and command output.`;

      // Notify user
      ctx.ui.notify(warning, "error");

      // Inject warning into next LLM context
      pi.sendMessage(
        {
          customType: "review-aggregator-warning",
          content: warning,
          display: true,
        },
        { deliverAs: "steer", triggerTurn: false },
      );
    }

    return undefined;
  });

  // ─── Tool: aggregate_reviews ──────────────────────────────────────────────
  pi.registerTool({
    name: "aggregate_reviews",
    label: "Aggregate Reviews",
    description:
      "Apply anti-bystander review protocol: shuffle and anonymize reviewer IDs, " +
      "rank findings by evidence quality and severity, preserve all critical/minority blockers. " +
      "NEVER aggregate by vote count — one reproducible critical finding blocks promotion.",
    parameters: Type.Object({
      reviews: Type.Array(
        Type.Object({
          reviewer_id: Type.String({ description: "Reviewer identifier (will be anonymized)" }),
          findings: Type.Array(
            Type.Object({
              severity: StringEnum(["critical", "high", "medium", "low"] as const),
              file: Type.Optional(Type.String({ description: "File path where the issue was found" })),
              line: Type.Optional(Type.Number({ description: "Line number of the issue" })),
              description: Type.String({ description: "Description of the finding" }),
              evidence: Type.String({
                description: "Specific evidence: file content, command output, test result, etc.",
              }),
              suggested_fix: Type.Optional(Type.String({ description: "Suggested remediation" })),
            }),
          ),
        }),
        { description: "Array of independent reviews to aggregate" },
      ),
      shuffle: Type.Optional(
        Type.Boolean({ description: "Shuffle reviewer order to prevent lead-anchor bias (default: true)" }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!params.reviews || params.reviews.length === 0) {
        return {
          content: [{ type: "text", text: "No reviews provided" }],
          isError: true,
        };
      }

      const shouldShuffle = params.shuffle !== false;
      const result = aggregateReviews(params.reviews as ReviewInput[], shouldShuffle);

      const formatFindings = (findings: AggregatedFinding[]): string => {
        if (findings.length === 0) return "  (none)";
        return findings
          .map((f) => {
            const loc = f.file ? ` @ ${f.file}${f.line ? `:${f.line}` : ""}` : "";
            return (
              `  [${f.reviewer_alias} | evidence=${f.evidence_score}]${loc}\n` +
              `  ${f.description}\n` +
              `  Evidence: ${f.evidence.slice(0, 150)}` +
              (f.suggested_fix ? `\n  Fix: ${f.suggested_fix.slice(0, 100)}` : "")
            );
          })
          .join("\n\n");
      };

      const lines = [
        `Review Aggregation Complete`,
        `Reviewers: ${result.reviewer_count}  Total findings: ${result.total_findings}`,
        "",
        `CRITICAL BLOCKERS (${result.blockers.length}):`,
        formatFindings(result.blockers),
        "",
        `HIGH PRIORITY (${result.high_priority.length}):`,
        formatFindings(result.high_priority),
        "",
        `MEDIUM (${result.medium_priority.length}) | LOW (${result.low_priority.length})`,
        ...(result.medium_priority.length + result.low_priority.length > 0
          ? [formatFindings([...result.medium_priority, ...result.low_priority])]
          : []),
        "",
        `Notes:`,
        ...result.aggregation_notes.map((n) => `  • ${n}`),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });

  // ─── /review-rules: display anti-bystander protocol rules ────────────────
  pi.registerCommand("review-rules", {
    description: "Display anti-bystander review protocol rules",
    handler: async (_args, ctx) => {
      const rules = [
        "Anti-Bystander Review Protocol",
        "================================",
        "",
        "1. PRIVATE FIRST PASS: Reviewer and tester run independently in separate sessions.",
        "2. NO PEER PRIMING: Do not show reviewer A's output to reviewer B before first pass.",
        "3. STRUCTURED FINDINGS: Every finding must cite file/line, command output, or test result.",
        "4. SHUFFLE + ANONYMIZE: Remove reviewer order and identity before aggregation.",
        "5. AGGREGATE BY EVIDENCE: Evidence quality and severity rank findings — not vote count.",
        "6. PRESERVE MINORITY BLOCKERS: One critical finding blocks promotion until disproven.",
        "7. NO MAJORITY VOTE: Disagreement triggers targeted validation, not a vote.",
        "8. NO CONSENSUS PROMPTS: Never say 'multiple agents agree' or 'consensus' in tool calls.",
        "9. CAP REVIEWERS: Routine review = 2 validators max (reviewer + tester).",
        "10. EVIDENCE STANDARD: 'Likely' or 'seems' without a file/command citation = weak finding.",
        "",
        "Research: GPT-5.4 collapses at n=2 auditors (bystander effect, 2605.10698v1).",
        "Claude Sonnet 4.6 maintains sovereignty; GPT-class models do not.",
      ];
      ctx.ui.notify(rules.join("\n"), "info");
    },
  });
}
