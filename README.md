# Agentic Coding Research

A research-driven multi-agent system for [pi](https://github.com/earendil-works/pi-coding-agent), synthesizing findings from 18 academic papers into a fully operational MAS with dynamic spawning, typed memory, self-evolution governance, and LLM-as-a-judge evaluation.

---

## What This Is

This repository implements a **research-backed pi agent system** that translates peer-reviewed findings on multi-agent collaboration, self-evolution, and LLM evaluation into concrete extensions, agent definitions, skills, and workflow prompts.

The core insight across all 18 papers: effective multi-agent systems are **bounded, evidence-driven orchestration systems**, not "more agents talking more." Success is measured in *resolved outcomes per cost*, not agent count, prompt length, or apparent consensus.

---

## Repository Structure

```
.
├── based-agent/            # Pi package: extensions, agents, skills, prompts
│   ├── AGENTS.md           # Cross-tool operating contract (canonical authority)
│   ├── EVALUATION.md       # End-to-end evaluation against all 18 papers
│   └── package.json
└── research/
    ├── eval-research/          # LLM-as-a-judge papers (5 PDFs)
    ├── evolution-research/     # Self-evolving agent papers (4 PDFs)
    ├── multi-agent-systems/    # MAS collaboration papers (9 PDFs)
    └── multiagent-systems-best-practices-report.md
```

---

## Research Corpus (18 Papers)

### Multi-Agent Systems
| Paper | Key Contribution |
|---|---|
| `2601.09822` — SE Survey | Role specialization, tool feedback, cost controls |
| `2602.07072` — AgentSpawn | Runtime spawn scoring; memory slice transfer |
| `2602.10975` — FeatureBench | Feature-level coding benchmark; executable validation |
| `2602.14690` — Configuring Agentic Tools | 2,853-repo empirical study; `AGENTS.md` convention |
| `2602.17100` — AgentConductor | Difficulty-aware DAG topology; 14.6 pp gain, 68% fewer tokens |
| `2603.23875` — SEMA | Structural-entropy pruning; 70% token reduction |
| `2604.16529` — Test-Time Compute | RTV selection + PDR refinement over structured summaries |
| `2605.10698` — Bystander Effect | GPT-5.4 collapses at n=2 auditors; 22,500 trajectories |
| `2605.14892` — LIFE Framework | Attribution before evolution; failure taxonomy |

### Self-Evolution
| Paper | Key Contribution |
|---|---|
| `2508.07407` — Survey | Endure → Excel → Evolve governance hierarchy |
| `2508.19005v6` — ELL/StuLife | GPT-5 scores 17.9/100 without typed memory; naive RAG degrades |
| `2511.16043` — Agent0 | Curriculum co-evolution; frontier uncertainty ≈ 0.5 filter |

### LLM-as-a-Judge Evaluation
| Paper | Key Contribution |
|---|---|
| Survey on LLM-as-a-Judge | Five bias families; position swap mandatory |
| LLM Evaluators Recognize Their Own | GPT-4: 73.5% self-recognition; cross-model judging required |
| Self-Taught Evaluators (Meta FAIR) | 75.4 → 88.7% RewardBench with zero human labels |
| EvalPlanner (Meta FAIR) | Plan → Execute → Verdict; 93.9% RewardBench, 22K pairs |
| Con-J (ICLR 2025) | Contrastive pairwise judgment; verbal rationale |

---

## Architecture — 10 Core Principles

1. **Deterministic Supervisor** — pi owns routing, budgets, safety gates, and adjudication
2. **Role-Specialized Agents** — 13 agents with concrete I/O contracts, not social roles
3. **AGENTS.md as Shared Config Core** — canonical cross-tool truth source
4. **Dynamic Spawning** — spawn only when `sspawn ≥ 0.7` (AgentSpawn formula)
5. **Topology as Data** — schema-validated DAGs, difficulty-adapted, density-capped
6. **Context Pruning** — typed memory slices, not raw conversation history (SEMA)
7. **Test-Time Scaling** — structured summaries → RTV selection → PDR refinement
8. **Anti-Bystander Review** — independent sessions, cap at 2, evidence rank over vote count
9. **LIFE Self-Evolution** — trace → attribution → proposal → gate → promote/rollback
10. **Cross-Model Judge** — different model family required; plan→execute→verdict

---

## Key Design Decisions

| Decision | Evidence |
|---|---|
| Cap reviewers at 2, run independently | Bystander effect: GPT-5.4 collapses at n=2 auditors |
| Never use same model as judge and generator | 73.5% self-recognition rate (NeurIPS 2024) |
| Attribute before evolving | LIFE framework; unattributed evolution is unsafe |
| No raw transcript RAG | Naive RAG fell below no-memory baseline in StuLife |
| Topology score beats model scale | 3B AgentConductor outperformed larger models by 14.6 pp |

---

## The `based-agent` Package

See [`based-agent/AGENTS.md`](based-agent/AGENTS.md) for the complete operating contract, including:
- Spawn score formula and thresholds
- Judge protocol and anti-bias guards
- 7-type typed memory schema
- 12-category failure taxonomy
- Endure → Excel → Evolve gate enforcement
- Difficulty routing table (Workflows A–G)
- Escalation conditions

See [`based-agent/EVALUATION.md`](based-agent/EVALUATION.md) for the end-to-end coverage matrix mapping each of the 18 papers to implementing components and verification methods.

---

## License

MIT
