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
  assert.match(html, /let activeDossierTab = 'evidence'/);
  assert.match(html, /function showDossierTab/);
  assert.match(html, /onclick="showDossierTab\('\$\{tab\}'\)"/);
  assert.match(html, /const selected = currentView === 'proposals' \? ensureSelectedProposal\(proposals\) : null;\s+renderQueue\(proposals\)/);
  assert.match(html, /\.monitor-button\s*\{[^}]*display:\s*none/);
  assert.match(html, /@media \(max-width: 1120px\)[\s\S]*?\.monitor-button\s*\{\s*display:\s*inline-flex/);
  assert.match(html, /@media \(max-width: 1120px\)/);
  assert.match(html, /\.operations-rail\.open/);
});

test('preserves existing approval and supporting view actions', () => {
  for (const functionName of ['approveProposal', 'rejectProposal', 'resumeLoop', 'showPreReviewTab', 'showSeedsTab', 'connectSSE']) {
    assert.match(html, new RegExp(`function ${functionName}|async function ${functionName}`));
  }
  assert.match(html, /preReview\.conflicts/);
  assert.match(html, /batch\.expectedBenefit/);
  assert.match(html, /function proposalTitle/);
  assert.match(html, /function selectProposal\(id\)\s*\{[\s\S]*?setActiveNavigation\(currentFilter\)/);
  assert.match(html, /Proposals included/);
  assert.match(html, /function openProposalFromPreReview/);
  assert.match(html, /onclick="openProposalFromPreReview\('/);
});
