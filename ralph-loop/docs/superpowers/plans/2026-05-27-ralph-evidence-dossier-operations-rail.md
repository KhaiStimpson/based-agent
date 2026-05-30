# RALPH Evidence Dossier Operations Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the proposal card dashboard with an evidence-first dossier and a persistent live-operations rail while preserving Ralph's existing actions and data contracts.

**Architecture:** Keep the existing dependency-free `public/index.html` application and its API calls. Refactor its rendering state from many expanding cards to one selected proposal dossier, retain secondary views in the shared shell, and promote the existing SSE activity panel into a visible desktop rail and responsive drawer.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Express static serving, Node built-in test runner, TypeScript typecheck for server sources.

---

### Task 1: Lock The New UI Contract

**Files:**
- Create: `ralph-loop/tests/ui-shell.test.mjs`

- [ ] **Step 1: Write the failing contract test**

```js
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('renders the evidence dossier and persistent operations rail shell', () => {
  assert.match(html, /id="proposal-queue"/);
  assert.match(html, /id="proposal-dossier"/);
  assert.match(html, /id="operations-rail"/);
  assert.match(html, /Live Status/);
});

test('uses one selected dossier and a responsive monitor drawer', () => {
  assert.match(html, /let selectedProposalId/);
  assert.match(html, /function selectProposal/);
  assert.match(html, /@media \(max-width: 1120px\)/);
  assert.match(html, /\.operations-rail\.open/);
});

test('preserves existing approval and supporting view actions', () => {
  for (const functionName of ['approveProposal', 'rejectProposal', 'resumeLoop', 'showPreReviewTab', 'showSeedsTab', 'connectSSE']) {
    assert.match(html, new RegExp(`function ${functionName}|async function ${functionName}`));
  }
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --test tests/ui-shell.test.mjs`  
Expected: FAIL because `proposal-queue`, `proposal-dossier`, `operations-rail`, and selected-dossier code are not present in the existing UI.

### Task 2: Build The Evidence Dossier Shell

**Files:**
- Modify: `ralph-loop/public/index.html`

- [ ] **Step 1: Replace the visual shell and styling**

Build an editorial dark interface with:

```html
<div class="workbench">
  <nav class="proposal-queue" id="proposal-queue"></nav>
  <main class="proposal-dossier" id="proposal-dossier"></main>
  <aside class="operations-rail" id="operations-rail"></aside>
</div>
```

The stylesheet defines distinctive typography and color tokens, a full-width checkpoint callout, a three-column desktop workbench, fixed-height readable patch panes, focus-visible controls, and `@media (max-width: 1120px)` monitor-drawer behavior.

- [ ] **Step 2: Render one selected proposal into the dossier**

Replace multi-card expansion state with:

```js
let selectedProposalId = null;

function selectProposal(id) {
  selectedProposalId = id;
  renderWorkspace();
}

function selectedProposal(filtered) {
  if (!filtered.some((proposal) => proposal.id === selectedProposalId)) {
    selectedProposalId = filtered[0]?.id ?? null;
  }
  return filtered.find((proposal) => proposal.id === selectedProposalId) ?? null;
}
```

The queue renders proposal selection buttons. The dossier renders the selected
proposal's score, evidence list, risk notice, patch preview, rationale,
suggested change, score bars, history, and approve/reject controls.

- [ ] **Step 3: Run test to verify GREEN**

Run: `node --test tests/ui-shell.test.mjs`  
Expected: PASS with all three shell/action checks passing.

### Task 3: Promote Live Activity Into The Operations Rail

**Files:**
- Modify: `ralph-loop/public/index.html`
- Test: `ralph-loop/tests/ui-shell.test.mjs`

- [ ] **Step 1: Keep state and SSE data visible beside the dossier**

Use the already-loaded `/api/state` response to populate loop status, cycle
metrics, last-cycle duration, total research items, and proposal totals. Keep
the existing `/api/events` stream, rendering recent events in the rail and
updating its current-step block.

- [ ] **Step 2: Make monitoring available at narrow widths**

```js
function toggleActivity() {
  activityVisible = !activityVisible;
  document.getElementById('operations-rail').classList.toggle('open', activityVisible);
}
```

On desktop the operations rail is always visible. At tablet and phone
breakpoints it becomes a drawer opened by the visible `Live Status` control.

- [ ] **Step 3: Verify functional contracts**

Run: `node --test tests/ui-shell.test.mjs`  
Expected: PASS.

Run: `npm run typecheck` from `ralph-loop/`  
Expected: TypeScript exits with code 0.

### Task 4: Visual And Regression Verification

**Files:**
- Verify: `ralph-loop/public/index.html`

- [ ] **Step 1: Load the UI against real local API data**

Run the existing Ralph server if it is not already available and open
`http://localhost:3741`. Confirm the checkpoint state renders an evidence
dossier for the top pending proposal and a live operations rail.

- [ ] **Step 2: Verify desktop and narrow presentation**

Use browser viewport checks at a desktop width and a phone-width view. Confirm
the desktop rail is persistent and the narrow `Live Status` button opens the
monitor drawer while proposal decision actions remain accessible.

- [ ] **Step 3: Verify preserved views and interactions without mutating proposals**

Navigate filters, pre-review, seeds, and the live status control. Do not invoke
approve, reject, batch application, or resume during visual verification
because those mutate the current dataset or loop state.
