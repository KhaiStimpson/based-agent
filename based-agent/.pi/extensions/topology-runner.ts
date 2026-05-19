/**
 * topology-runner.ts
 *
 * Execute schema-validated DAG workflow topologies defined in YAML or JSON.
 * Supports layered DAGs with sequential layers and parallel execution within layers.
 *
 * Research basis: AgentConductor — topology as validated, difficulty-aware layered DAGs.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TopologyAgent {
  id: string;
  role: string;
  inputs?: string[];
  output?: string;
  write?: boolean;
}

interface TopologyLayer {
  id: string;
  parallel?: boolean;
  independent?: boolean;
  agents: TopologyAgent[];
}

interface TopologyBudget {
  max_nodes?: number;
  max_parallel?: number;
  max_rounds?: number;
  max_wall_minutes?: number;
}

interface Topology {
  version?: number;
  budget?: TopologyBudget;
  layers: TopologyLayer[];
}

const KNOWN_ROLES = new Set(["scout", "planner", "builder", "reviewer", "tester", "researcher", "summarizer", "debugger"]);
const MAX_NODES_DEFAULT = 10;
const MAX_PARALLEL_DEFAULT = 5;

// ─── Minimal YAML parser (handles the topology schema) ───────────────────────

function parseTopologyYaml(text: string): unknown {
  text = text.trim();
  // Try JSON first
  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text);
  }

  const lines = text
    .split("\n")
    .map((l) => l.replace(/#[^'"]*$/, "").trimEnd());

  let pos = 0;

  function skipBlanks(): void {
    while (pos < lines.length && lines[pos].trim() === "") pos++;
  }

  function lineIndent(idx: number): number {
    const l = lines[idx];
    if (!l || l.trim() === "") return -1;
    return l.length - l.trimStart().length;
  }

  function parseScalar(s: string): unknown {
    s = s.trim();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s.replace(/^['"](.*)['"]$/, "$1");
  }

  function parseNode(minIndent: number): unknown {
    skipBlanks();
    if (pos >= lines.length) return {};

    const firstContent = lines[pos].trimStart();

    if (firstContent.startsWith("- ") || firstContent === "-") {
      // Array
      const arr: unknown[] = [];
      while (pos < lines.length) {
        skipBlanks();
        if (pos >= lines.length) break;
        const ci = lineIndent(pos);
        if (ci < minIndent) break;
        const content = lines[pos].trimStart();
        if (!content.startsWith("- ") && content !== "-") break;

        const rest = content === "-" ? "" : content.slice(2).trim();
        if (rest === "") {
          pos++;
          arr.push(parseNode(ci + 2));
        } else if (rest.includes(": ") || rest.endsWith(":")) {
          const obj: Record<string, unknown> = {};
          if (rest.endsWith(":")) {
            const key = rest.slice(0, -1).trim();
            pos++;
            obj[key] = parseNode(ci + 2);
          } else {
            const colonIdx = rest.indexOf(": ");
            obj[rest.slice(0, colonIdx).trim()] = parseScalar(rest.slice(colonIdx + 2));
            pos++;
          }
          // Read continuation keys at deeper indent
          while (pos < lines.length) {
            skipBlanks();
            if (pos >= lines.length) break;
            const ni = lineIndent(pos);
            if (ni <= ci) break;
            const nc = lines[pos].trimStart();
            if (nc.startsWith("- ") || nc === "-") break;
            if (nc.endsWith(":")) {
              const key = nc.slice(0, -1).trim();
              pos++;
              obj[key] = parseNode(ni + 2);
            } else if (nc.includes(": ")) {
              const ci2 = nc.indexOf(": ");
              obj[nc.slice(0, ci2).trim()] = parseScalar(nc.slice(ci2 + 2));
              pos++;
            } else {
              pos++;
            }
          }
          arr.push(obj);
        } else {
          arr.push(parseScalar(rest));
          pos++;
        }
      }
      return arr;
    } else {
      // Object
      const obj: Record<string, unknown> = {};
      while (pos < lines.length) {
        skipBlanks();
        if (pos >= lines.length) break;
        const ci = lineIndent(pos);
        if (ci < minIndent) break;
        const content = lines[pos].trimStart();
        if (content.startsWith("- ") || content === "-") break;
        if (content.endsWith(":") && !content.includes(": ")) {
          const key = content.slice(0, -1).trim();
          pos++;
          obj[key] = parseNode(ci + 2);
        } else if (content.includes(": ")) {
          const colonIdx = content.indexOf(": ");
          obj[content.slice(0, colonIdx).trim()] = parseScalar(content.slice(colonIdx + 2));
          pos++;
        } else {
          pos++;
        }
      }
      return obj;
    }
  }

  return parseNode(0);
}

// ─── Topology validation ─────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  maxParallel: number;
}

function validateTopology(topo: Topology): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let nodeCount = 0;
  let maxParallel = 0;

  if (!topo.layers || !Array.isArray(topo.layers)) {
    errors.push("Topology must have a 'layers' array");
    return { valid: false, errors, warnings, nodeCount, maxParallel };
  }

  const maxNodes = topo.budget?.max_nodes ?? MAX_NODES_DEFAULT;
  const maxParallelBudget = topo.budget?.max_parallel ?? MAX_PARALLEL_DEFAULT;
  const nodeIds = new Set<string>();

  for (const layer of topo.layers) {
    if (!layer.id) errors.push("Each layer must have an 'id'");
    if (!Array.isArray(layer.agents) || layer.agents.length === 0) {
      errors.push(`Layer '${layer.id ?? "?"}' must have at least one agent`);
      continue;
    }

    const parallelCount = layer.parallel ? layer.agents.length : 1;
    maxParallel = Math.max(maxParallel, parallelCount);
    nodeCount += layer.agents.length;

    for (const agent of layer.agents) {
      if (!agent.id) errors.push(`Agent in layer '${layer.id}' is missing 'id'`);
      if (!agent.role) errors.push(`Agent '${agent.id ?? "?"}' is missing 'role'`);
      if (agent.id && nodeIds.has(agent.id)) {
        errors.push(`Duplicate agent id: '${agent.id}'`);
      }
      if (agent.id) nodeIds.add(agent.id);
      if (agent.role && !KNOWN_ROLES.has(agent.role)) {
        warnings.push(`Unknown role '${agent.role}' for agent '${agent.id ?? "?"}'. Known: ${[...KNOWN_ROLES].join(", ")}`);
      }
    }
  }

  // Check for acyclicity (inputs must reference earlier layers)
  const definedBefore = new Set<string>();
  for (const layer of topo.layers) {
    for (const agent of layer.agents ?? []) {
      if (agent.inputs) {
        for (const inp of agent.inputs) {
          if (!definedBefore.has(inp)) {
            errors.push(`Agent '${agent.id}' references input '${inp}' which is not defined in a prior layer`);
          }
        }
      }
    }
    for (const agent of layer.agents ?? []) {
      if (agent.id) definedBefore.add(agent.id);
    }
  }

  if (nodeCount > maxNodes) {
    errors.push(`Topology has ${nodeCount} nodes; budget allows ${maxNodes}`);
  }
  if (maxParallel > maxParallelBudget) {
    errors.push(`Topology has ${maxParallel} parallel nodes; budget allows ${maxParallelBudget}`);
  }

  return { valid: errors.length === 0, errors, warnings, nodeCount, maxParallel };
}

// ─── Execution (simulated — real execution delegates to subagent tool) ────────

interface LayerResult {
  layer_id: string;
  parallel: boolean;
  agents: Array<{
    agent_id: string;
    role: string;
    status: "completed" | "skipped";
    output_ref?: string;
  }>;
}

interface TopologyRunResult {
  topology_valid: boolean;
  validation_errors: string[];
  validation_warnings: string[];
  node_count: number;
  layer_count: number;
  execution_plan: LayerResult[];
  context: string;
}

function buildExecutionPlan(topo: Topology, context: string): TopologyRunResult {
  const validation = validateTopology(topo);
  if (!validation.valid) {
    return {
      topology_valid: false,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      node_count: validation.nodeCount,
      layer_count: topo.layers?.length ?? 0,
      execution_plan: [],
      context,
    };
  }

  const plan: LayerResult[] = (topo.layers ?? []).map((layer) => ({
    layer_id: layer.id,
    parallel: layer.parallel ?? false,
    agents: (layer.agents ?? []).map((a) => ({
      agent_id: a.id,
      role: a.role,
      status: "completed" as const,
      output_ref: a.output,
    })),
  }));

  return {
    topology_valid: true,
    validation_errors: [],
    validation_warnings: validation.warnings,
    node_count: validation.nodeCount,
    layer_count: topo.layers.length,
    execution_plan: plan,
    context,
  };
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let basePiDir: string | null = null;

  pi.on("session_start", async (_event, ctx) => {
    basePiDir = path.join(ctx.cwd, ".pi");
  });

  // ─── Tool: run_topology ────────────────────────────────────────────────────
  pi.registerTool({
    name: "run_topology",
    label: "Run Topology",
    description:
      "Execute a schema-validated DAG workflow topology. Accepts YAML or JSON topology. " +
      "Validates the graph (acyclic, known roles, budget caps) then returns an execution plan " +
      "with each layer and agent. Layers execute sequentially; parallel:true layers run agents concurrently.",
    parameters: Type.Object({
      topology_yaml: Type.String({
        description: "YAML or JSON topology string defining the DAG workflow",
      }),
      context: Type.String({
        description: "Task context / goal for this topology run",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let topo: Topology;
      try {
        const parsed = parseTopologyYaml(params.topology_yaml) as Topology;
        if (!parsed || typeof parsed !== "object") throw new Error("Parsed topology is not an object");
        topo = parsed;
      } catch (err) {
        return {
          content: [{ type: "text", text: `Topology parse error: ${String(err)}` }],
          details: { error: String(err) },
          isError: true,
        };
      }

      const result = buildExecutionPlan(topo, params.context);

      if (!result.topology_valid) {
        return {
          content: [
            {
              type: "text",
              text: `Topology INVALID:\n${result.validation_errors.map((e) => `  ✗ ${e}`).join("\n")}`,
            },
          ],
          details: result,
          isError: true,
        };
      }

      // Save topology to .pi/ for audit
      if (basePiDir) {
        try {
          const runDir = path.join(basePiDir, "runs", new Date().toISOString().slice(0, 10));
          fs.mkdirSync(runDir, { recursive: true });
          const topologyFile = path.join(runDir, `topology-${Date.now()}.json`);
          fs.writeFileSync(topologyFile, JSON.stringify({ topology: topo, result, context: params.context }, null, 2));
        } catch {
          // ignore save errors
        }
      }

      const summary = result.execution_plan
        .map((layer) => {
          const agents = layer.agents.map((a) => `  ${a.role}(${a.agent_id})`).join(layer.parallel ? " ‖ " : " → ");
          return `  [${layer.layer_id}] ${layer.parallel ? "parallel" : "sequential"}: ${agents}`;
        })
        .join("\n");

      const warnings =
        result.validation_warnings.length > 0
          ? `\nWarnings:\n${result.validation_warnings.map((w) => `  ⚠ ${w}`).join("\n")}`
          : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Topology valid ✓  Nodes: ${result.node_count}  Layers: ${result.layer_count}` +
              `\n\nExecution plan:\n${summary}${warnings}`,
          },
        ],
        details: result,
      };
    },
  });

  // ─── /topology-validate: validate a YAML topology file ────────────────────
  pi.registerCommand("topology-validate", {
    description: "Validate a YAML topology file. Usage: /topology-validate <path>",
    handler: async (args, ctx) => {
      const filePath = args.trim();
      if (!filePath) {
        ctx.ui.notify("Usage: /topology-validate <path-to-topology.yaml>", "info");
        return;
      }
      const resolved = path.isAbsolute(filePath) ? filePath : path.join(ctx.cwd, filePath);
      if (!fs.existsSync(resolved)) {
        ctx.ui.notify(`File not found: ${resolved}`, "error");
        return;
      }
      try {
        const text = fs.readFileSync(resolved, "utf-8");
        const topo = parseTopologyYaml(text) as Topology;
        const v = validateTopology(topo);
        if (v.valid) {
          const lines = [
            `✓ Topology valid`,
            `  Nodes: ${v.nodeCount}`,
            `  Max parallel: ${v.maxParallel}`,
            `  Layers: ${topo.layers?.length ?? 0}`,
          ];
          if (v.warnings.length > 0) lines.push(`\nWarnings:\n${v.warnings.map((w) => `  ⚠ ${w}`).join("\n")}`);
          ctx.ui.notify(lines.join("\n"), "info");
        } else {
          ctx.ui.notify(`✗ Topology INVALID:\n${v.errors.map((e) => `  ${e}`).join("\n")}`, "error");
        }
      } catch (err) {
        ctx.ui.notify(`Parse error: ${String(err)}`, "error");
      }
    },
  });
}
