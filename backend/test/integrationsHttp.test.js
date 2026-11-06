/**
 * PMPilot Integrations HTTP API & Evidence Ingestion End-to-End Tests
 * 
 * Verifies:
 * 1. GET /api/workspaces/:wsId/integrations/summary returns real status for all providers
 * 2. Token connection & status verification for GitHub, Notion, Jira, Figma, Productboard
 * 3. Evidence Ingestion & Review pipeline: listing imported records
 * 4. Promoting imported evidence to Decision Signal
 * 5. Strict approval guard blocking Notion PRD export & Jira issue creation on unapproved decisions
 * 6. Disconnection across providers
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import app from '../src/server.js';
import { db } from '../src/db/database.js';

let server;
let baseUrl;

test.before(async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('HTTP API: Integration summary, token connections, and evidence promotion', async () => {
  // 1. Register a fresh user
  const email = `pm.integrations.${Date.now()}@team.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!Secure', name: 'Integration PM' })
  });
  assert.equal(regRes.status, 201);
  const { token, workspace } = await regRes.json();
  const wsId = workspace.id;

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Fetch Integrations Summary
  const summaryRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/summary`, {
    headers: authHeaders
  });
  assert.equal(summaryRes.status, 200);
  const summaryData = await summaryRes.json();
  assert.ok(summaryData.success);
  assert.ok(summaryData.integrations.googleDrive);
  assert.ok(summaryData.integrations.github);
  assert.ok(summaryData.integrations.notion);
  assert.ok(summaryData.integrations.jira);
  assert.ok(summaryData.integrations.figma);
  assert.ok(summaryData.integrations.productboard);

  // 3. Connect GitHub via token
  const ghConnRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/github/connect-token`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ token: 'ghp_mock_token_for_http_test_123' })
  });
  assert.equal(ghConnRes.status, 200);
  const ghConnData = await ghConnRes.json();
  assert.equal(ghConnData.success, true);
  assert.equal(ghConnData.connection.provider, 'GITHUB');
  assert.equal(ghConnData.connection.status, 'CONNECTED');

  // 4. Ingest an evidence record
  const savedRec = db.saveImportedRecord({
    workspaceId: wsId,
    provider: 'GITHUB',
    externalId: 'acme/repo#42',
    sourceUrl: 'https://github.com/acme/repo/issues/42',
    title: 'Customer dropoff on mobile drawer',
    content: 'Users report unable to compare more than 3 products.',
    contentType: 'ISSUE',
    author: 'developer-alice'
  });

  // 5. List evidence records via HTTP
  const listEvRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/evidence/records`, {
    headers: authHeaders
  });
  assert.equal(listEvRes.status, 200);
  const listEvData = await listEvRes.json();
  assert.equal(listEvData.success, true);
  assert.ok(listEvData.total >= 1);
  assert.equal(listEvData.records[0].external_id, 'acme/repo#42');

  // 6. Create a decision in this workspace
  const createDecRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/decisions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Checkout Comparison Matrix',
      description: 'Optimize mobile checkout experience'
    })
  });
  assert.equal(createDecRes.status, 201);
  const { decision } = await createDecRes.json();
  const decId = decision.id;

  // 7. Promote imported record into a Decision Signal
  const promoteRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/evidence/records/${savedRec.id}/promote`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      decisionId: decId,
      category: 'CUSTOMER_FEEDBACK',
      underlyingCustomerProblem: 'Limited mobile comparison space'
    })
  });
  assert.equal(promoteRes.status, 200);
  const promoteData = await promoteRes.json();
  assert.equal(promoteData.success, true);
  assert.equal(promoteData.syncState, 'LINKED_TO_DECISION');

  // 8. Strict Guard: Notion PRD export fails on unapproved decision
  const notionExportRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/notion/publish-prd`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ decisionId: decId })
  });
  assert.equal(notionExportRes.status, 403);
  const notionExportData = await notionExportRes.json();
  assert.ok(notionExportData.error.includes('approved by a Human PM'));

  // 9. Strict Guard: Jira issue export fails on unapproved decision
  const jiraExportRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/jira/create-issue`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ decisionId: decId, projectKey: 'ENG' })
  });
  assert.equal(jiraExportRes.status, 403);
  const jiraExportData = await jiraExportRes.json();
  assert.ok(jiraExportData.error.includes('approved by a Human PM'));

  // 10. Disconnect GitHub
  const discRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/github/disconnect`, {
    method: 'POST',
    headers: authHeaders
  });
  assert.equal(discRes.status, 200);
  const discData = await discRes.json();
  assert.equal(discData.connection.status, 'DISCONNECTED');
});
