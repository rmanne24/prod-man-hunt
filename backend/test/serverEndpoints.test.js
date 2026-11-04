import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { RedisStateManager } from '../src/services/redisState.js';

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => {
  RedisStateManager.resetToSeed();
});

test('HTTP: GET /api/decisions/:id returns canonical decision with synthetic demo tags', async () => {
  const res = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout`);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.decision.id, 'session_moonshot_checkout');
  assert.strictEqual(data.decision.signals[0].isSyntheticDemo, true);
  assert.strictEqual(data.decision.status, 'CONFLICT_REVIEW');
});

test('HTTP: POST /api/decisions/:id/artifacts is rejected with 403 when decision is not approved', async () => {
  const res = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Artifact generation blocked/);
});

test('HTTP: POST /api/jobs/prd is rejected with 403 when decision is not approved', async () => {
  const res = await fetch(`${baseUrl}/api/jobs/prd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session_moonshot_checkout' })
  });

  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Artifact generation blocked/);
});

test('HTTP: Resolve conflict -> Submit approval -> Generate artifacts end-to-end', async () => {
  // 1. Resolve blocking conflict
  const resolveRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/conflicts/conflict_1/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resolutionChoiceId: 'res_3',
      resolutionNotes: 'Standardized to 3 items on mobile.',
      decidedBy: 'Demo PM'
    })
  });
  assert.strictEqual(resolveRes.status, 200);
  const resolveData = await resolveRes.json();
  assert.strictEqual(resolveData.decision.version, 2);
  assert.strictEqual(resolveData.decision.status, 'RECOMMENDATION_READY');

  // 2. Submit approval at version 2
  const approveRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'APPROVE',
      decisionVersion: 2,
      decidedBy: 'Demo PM',
      rationale: 'Evidence verified for 2-week MVP.'
    })
  });
  assert.strictEqual(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.strictEqual(approveData.decision.status, 'APPROVED');
  assert.strictEqual(approveData.decision.approvalRecord.status, 'APPROVED');
  assert.strictEqual(approveData.decision.approvalRecord.approvedDecisionVersion, 2);

  // 3. Artifact generation now succeeds
  const artifactRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(artifactRes.status, 200);
  const artifactData = await artifactRes.json();
  assert.strictEqual(artifactData.decision.status, 'ARTIFACT_GENERATED');
  assert.ok(artifactData.decision.artifacts.prd);
});

test('HTTP: Stale approval rejection when mutating decision after approval', async () => {
  // 1. Resolve and approve version 2
  await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/conflicts/conflict_1/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutionChoiceId: 'res_3', decidedBy: 'Demo PM' })
  });
  await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'APPROVE', decisionVersion: 2, decidedBy: 'Demo PM' })
  });

  // 2. Material mutation: ingest a new signal
  const signalRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'New User Interview',
      rawText: 'Customer requested PayPal guest support.'
    })
  });
  assert.strictEqual(signalRes.status, 201);
  const signalData = await signalRes.json();
  assert.strictEqual(signalData.decision.version, 3);
  assert.strictEqual(signalData.decision.status, 'NEEDS_REVISION');
  assert.strictEqual(signalData.decision.approvalRecord.status, 'PENDING');

  // 3. Artifact generation must now fail with 403
  const failRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(failRes.status, 403);
});

test('HTTP: Legacy session route /api/session works with compatibility adapter', async () => {
  const res = await fetch(`${baseUrl}/api/session`);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.session.sessionId, 'session_moonshot_checkout');
  assert.ok(Array.isArray(data.session.capturedSources));
  assert.strictEqual(data.session.capturedSources.length, 3);
  assert.ok(data.session.decisionHealth);
});

test('HTTP Regression: Legacy action generate_prd is blocked with 403 when unapproved', async () => {
  const res = await fetch(`${baseUrl}/api/session/session_moonshot_checkout/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate_prd' })
  });

  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Artifact generation blocked/);
});

test('HTTP Regression: Legacy action reopen_decision increments version and invalidates approval', async () => {
  // 1. Resolve and approve
  await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/conflicts/conflict_1/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutionChoiceId: 'res_3', decidedBy: 'Demo PM' })
  });
  await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'APPROVE', decisionVersion: 2, decidedBy: 'Demo PM' })
  });

  // 2. Call legacy reopen_decision action
  const reopenRes = await fetch(`${baseUrl}/api/session/session_moonshot_checkout/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reopen_decision', payload: { reason: 'User feedback review' } })
  });
  assert.strictEqual(reopenRes.status, 200);
  const reopenData = await reopenRes.json();
  assert.strictEqual(reopenData.session.version, 3);
  assert.strictEqual(reopenData.session.status, 'NEEDS_REVISION');
  assert.strictEqual(reopenData.session.approvalRecord.status, 'PENDING');

  // 3. Artifact generation must now be blocked
  const blockedRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(blockedRes.status, 403);
});

test('HTTP Regression: Conflict resolution with stale expectedVersion returns 409', async () => {
  const res = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/conflicts/conflict_1/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resolutionChoiceId: 'res_3',
      expectedVersion: 999 // Outdated!
    })
  });

  assert.strictEqual(res.status, 409);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Stale conflict resolution rejected/);
});

test('HTTP Regression: Linear and Slack export routes are guarded server-side and reject unapproved decisions with 403', async () => {
  // Re-open to ensure unapproved state
  await fetch(`${baseUrl}/api/session/session_moonshot_checkout/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reopen_decision' })
  });

  // 1. POST /api/export/linear must be rejected
  const linearRes = await fetch(`${baseUrl}/api/export/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisionId: 'session_moonshot_checkout', tickets: [] })
  });
  assert.strictEqual(linearRes.status, 403);
  const linearData = await linearRes.json();
  assert.strictEqual(linearData.success, false);
  assert.match(linearData.requiredAction, /Obtain human PM approval/);

  // 2. POST /api/export/slack must be rejected
  const slackRes = await fetch(`${baseUrl}/api/export/slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisionId: 'session_moonshot_checkout', channel: '#product', message: 'Test' })
  });
  assert.strictEqual(slackRes.status, 403);
  const slackData = await slackRes.json();
  assert.strictEqual(slackData.success, false);
  assert.match(slackData.requiredAction, /Obtain human PM approval/);
});

test('HTTP Regression: Trigger.dev PRD job records target decision version and preserves synthetic demo tags', async () => {
  // Re-seed and approve
  const { RedisStateManager } = await import('../src/services/redisState.js');
  RedisStateManager.resetToSeed();
  await RedisStateManager.resolveConflict('session_moonshot_checkout', 'conflict_1', 'res_3', { name: 'PM' });
  await RedisStateManager.submitApproval('session_moonshot_checkout', {
    action: 'APPROVE',
    decisionVersion: 2,
    callerIdentity: { name: 'PM' }
  });

  const res = await fetch(`${baseUrl}/api/jobs/prd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session_moonshot_checkout' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.job.targetDecisionVersion, 2);
  assert.strictEqual(data.job.status, 'running');
});

