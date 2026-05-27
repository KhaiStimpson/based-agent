# RALPH — Research · Analyze · Learn · Propose · Human-approve

A continuous deep-research loop that crawls **arxiv.org** and **GitHub**, distills insights with local Ollama models, and generates ranked improvement proposals for the **based-agent** MAS — then waits every 24 hours for your review.

```
Research → Analyze → Learn → Propose → Human-approve → repeat
    ↑                                         |
    └─────────────── 24h checkpoint ──────────┘
```

---

## How It Works

| Phase | What happens |
|---|---|
| **Crawl** | Fetches arxiv papers and GitHub repos matching 16 rotating seed queries (MAS, RAG, tool use, reasoning, eval, safety…) |
| **Distil** | Phi-4-mini scores each item for relevance (0–10) and extracts 1-3 key insights. Items below threshold are dropped. |
| **Propose** | Mistral 7B reads the top insights + your based-agent source files and writes a concrete improvement proposal (rationale, evidence, target file, patch). |
| **Re-rank** | Every cycle, **all** pending proposals are re-scored against the new research batch. Superseded proposals drop. |
| **Checkpoint** | After 24 hours, loop pauses and opens `localhost:3741` for review. |
| **Human** | You approve (auto-apply patch) or reject proposals in the UI, then click "Continue Research". |

---

## Quick Start

### Prerequisites

1. **Node.js 18+**
2. **Ollama** running locally — [install here](https://ollama.com)
3. Pull the required models:
   ```bash
   ollama pull phi4-mini
   ollama pull mistral
   ```

### Setup

```bash
cd ralph-loop
npm install

# Copy and configure
cp .env.example .env
# Edit .env — set GITHUB_TOKEN for better GitHub rate limits
```

### Run

```bash
npm start
```

Open **http://localhost:3741** for the approval UI.

---

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `RALPH_FAST_MODEL` | `phi4-mini` | Bulk summarisation model |
| `RALPH_QUALITY_MODEL` | `mistral` | Proposal generation & re-ranking |
| `GITHUB_TOKEN` | *(empty)* | PAT for 5,000 req/h vs 60 unauthenticated |
| `CYCLE_MINUTES` | `75` | Avg cycle length (±20% jitter) |
| `CHECKPOINT_HOURS` | `24` | Hours between human review pauses |
| `ARXIV_RESULTS_PER_QUERY` | `8` | arxiv results per seed per cycle |
| `GITHUB_RESULTS_PER_QUERY` | `5` | GitHub repos per seed per cycle |
| `MIN_RELEVANCE` | `6` | Min score (0–10) to keep a distilled item |
| `BASED_AGENT_PATH` | `../based-agent` | Path to the MAS to improve |
| `PORT` | `3741` | Approval UI port |

---

## Data Layout

```
data/
├── research/
│   └── items.jsonl          # Every distilled research item
├── proposals/
│   └── proposals.json       # All proposals with status
└── state.json               # Loop state, cycle history
```

All data is plain JSON/JSONL — fully inspectable and portable.

---

## Proposal Scoring

Each proposal is scored **0–100** across four dimensions (25 pts each):

| Dimension | What it measures |
|---|---|
| **Novelty** | Is this a new insight not already in the codebase? |
| **Impact** | How much would this improve agent quality or efficiency? |
| **Feasibility** | How easy/safe is this to apply? |
| **Evidence Quality** | How strong and direct is the supporting research? |

Scores are **updated every cycle** as new research comes in. A proposal that gets superseded by a better technique will drop in score automatically.

---

## Approval UI

The minimal web UI at `localhost:3741` shows:

- **Score ring** (green ≥70, orange ≥45, red <45)
- **Status chip** (pending / approved / applied / rejected / apply-failed)
- **Score breakdown bars** per dimension
- **Score history sparkline** across cycles
- **Evidence list** with source links
- **Diff preview** (syntax-highlighted unified diff)
- **Approve** (auto-applies patch) / **Reject** buttons
- **24h checkpoint banner** with "Continue Research" button

---

## Research Seeds

16 topic seeds rotate across cycles. Each seed fires one arxiv query and one GitHub query per cycle. 3 seeds are crawled per cycle.

Topics: MAS coordination · self-evolving agents · topology/orchestration · dynamic spawning · LLM-as-judge · benchmarks · agent memory · RAG · chain-of-thought · test-time compute · tool use · coding agents · prompt optimization · system prompt design · agent safety · hallucination reduction

---

## Architecture

```
src/
├── index.ts               Entry point — checks Ollama, starts server + loop
├── config.ts              .env loader
├── types.ts               ResearchItem, Proposal, LoopState interfaces
├── llm/
│   └── ollama.ts          fast() / quality() wrappers + JSON extractor
├── research/
│   ├── seeds.ts           16 topic seeds with round-robin rotation
│   ├── crawler.ts         arxiv XML + GitHub REST fetchers, seen-set dedup
│   └── distiller.ts       Phi-4-mini summarisation + relevance scoring
├── proposals/
│   ├── generator.ts       Mistral 7B proposal generation from insights
│   ├── ranker.ts          Batch re-scoring of pending proposals
│   └── patcher.ts         patch(1) apply + dry-run validation
├── storage/
│   ├── research.ts        JSONL read/write for research items
│   └── proposals.ts       JSON read/write for proposals + loop state
└── api/
    └── server.ts          Express: /api/proposals, /api/state, approve, reject, resume
public/
└── index.html             Approval UI (vanilla JS, no build step)
```
