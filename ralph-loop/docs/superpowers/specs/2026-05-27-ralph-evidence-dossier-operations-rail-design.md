# RALPH Evidence Dossier With Operations Rail

**Date:** 2026-05-27
**Status:** Approved direction pending implementation plan
**Target:** `ralph-loop/public/index.html`

## Goal

Refresh the RALPH approval UI so human decisions are grounded in evidence, patch
contents, and risk, while live research-loop health remains easy to monitor
without leaving the active proposal.

The approved direction is **Evidence Dossier with Operations Rail**: the selected
proposal is the primary reading surface, and a persistent right-hand rail
provides checkpoint state, SSE connection state, current activity, key metrics,
and recent events.

## Design Direction

The interface should feel like a calm technical review room rather than a
generic dashboard: dark near-black surfaces, crisp borders, an editorial title
treatment, restrained lime and cyan status accents, and amber reserved for
checkpoint attention. Density is intentional, but evidence hierarchy must make
the screen easy to scan.

The memorable feature is a central proposal dossier flanked by an always-visible
operations rail. Approval should never require choosing between reading the
proposal and monitoring the loop.

## Existing Functionality To Preserve

- Status filtering for pending, approved, applied, rejected, failed, and all
  proposals.
- Proposal score, summary, source, target-file, patch, rationale, evidence, and
  score-history display.
- Approve/apply and reject actions.
- Cloud pre-review view and batch application actions.
- Search seeds view.
- Checkpoint banner and `Continue Research` action.
- SSE live activity connection and replayed event history.
- Desktop and small-screen usability.

No API or storage change is required for this refresh. The existing
`/api/proposals`, `/api/state`, `/api/seeds`, `/api/pre-review`, and
`/api/events` data supports the approved screen.

## Desktop Layout

### Masthead

A compact masthead establishes identity and persistent global signals:

- RALPH wordmark and pipeline mode.
- Live/SSE connection indicator.
- Current cycle and pending proposal count.

### Checkpoint Callout

When the state is `checkpoint`, show a full-width amber attention band below the
masthead. It explains that review is required before resuming and retains the
existing `Continue Research` action.

### Review Queue

The left column contains navigation and proposal selection:

- Status filters and counts.
- Pre-review and seed navigation.
- A compact queue of proposals ordered by score.
- Strong selected-state treatment without hiding lower-priority proposals.
- Clicking a proposal selects it for the central dossier; display one active
  dossier at a time rather than expanding multiple inline cards.

### Proposal Dossier

The center column is the principal decision surface:

- Score, title, concise summary, source, and target file in the heading.
- Structured evidence, risk, patch, score-history, and rationale regions.
- Evidence and patch/risk visible early in the reading flow.
- Approve/apply and reject actions anchored to the dossier.

Expanded proposal content should read as one continuous document instead of a
stack of loosely related cards.

### Operations Rail

The right column remains visible on desktop and contains:

- Loop status and SSE connection health.
- Current activity message.
- Compact vitals: last cycle duration, research item count, proposal count, and
  checkpoint/running condition.
- Recent activity feed using the current event stream and level colors.
- Control to expand the feed when monitoring needs more attention.

The rail must remain useful when the user is reading a long patch or rationale.

## Secondary Views

Cloud pre-review and search seeds should inherit the new shell, typography, and
operations rail rather than look like unrelated pages. Their existing actions
and data remain unchanged.

## Responsive Behavior

- At wide desktop sizes, render the three-column review queue, dossier, and
  operations rail layout.
- Below the three-column breakpoint, collapse the operations rail into a
  monitor drawer opened by a persistent `Live Status` control in the shell.
- On phone widths, stack the checkpoint state, selected proposal content, and
  monitoring trigger; open the monitor drawer as a full-width panel, and keep
  approval actions reachable without horizontal scrolling.
- No functional action may disappear solely because of viewport size.

## Interaction And Accessibility

- Use semantic buttons and readable focus-visible states for filters, tabs,
  actions, and monitoring controls.
- Preserve keyboard access to proposal selection and all existing actions.
- Communicate state with text and color, not color alone.
- Keep patch text legible and horizontally scrollable where necessary.
- Prefer restrained transitions for selection, dossier expansion, and live-state
  indication; honor reduced-motion preferences.

## Implementation Boundaries

- Primary implementation is a scoped rewrite/refinement of
  `ralph-loop/public/index.html`, which contains the vanilla HTML, CSS, and
  client-side rendering functions.
- Do not modify the existing in-progress backend change in
  `ralph-loop/src/proposals/pre-reviewer.ts`.
- Do not introduce a frontend build pipeline or new runtime dependency.
- Do not change backend contracts unless implementation reveals an essential
  missing datum; that would require a follow-up design decision.

## Verification

Implementation is complete only after:

1. `npm --prefix ralph-loop run typecheck` passes from the repository root.
2. The UI is opened in the browser against the local Ralph server or a
   controlled static/mock-data view.
3. Desktop layout visually confirms the dossier and persistent operations rail.
4. A narrow viewport verifies monitor access and approval actions remain
   reachable.
5. Existing proposal filtering, detail viewing, approve/reject controls,
   pre-review, seeds navigation, checkpoint action, and activity stream have no
   apparent regression.

## Out Of Scope

- New API endpoints or new persisted health telemetry.
- Changes to proposal generation, ranking, pre-review logic, or patch
  application.
- Reworking the based-agent repository itself.
