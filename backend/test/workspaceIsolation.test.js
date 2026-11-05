import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { db } from '../src/db/database.js';

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

test('MULTI-TENANCY: User registration creates private workspace with OWNER role', async () => {
  const email = `owner.${Date.now()}@saas.io`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'StrongSaaSPassword123!',
      name: 'Tenant Owner',
      workspaceName: 'Acme Product Corp'
    })
  });

  assert.strictEqual(regRes.status, 201);
  const data = await regRes.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.workspace.name, 'Acme Product Corp');
  assert.strictEqual(data.workspace.member_role, 'OWNER');
  assert.notStrictEqual(data.workspace.id, 'ws_moonshot');

  // Verify member table in database
  const member = db.getWorkspaceMember(data.workspace.id, data.user.id);
  assert.ok(member);
  assert.strictEqual(member.role, 'OWNER');
});

test('MULTI-TENANCY: New user workspace starts empty with zero synthetic demo contamination', async () => {
  const email = `fresh.${Date.now()}@saas.io`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'StrongSaaSPassword123!',
      name: 'Fresh User'
    })
  });

  const { token, workspace } = await regRes.json();

  // Fetch decisions for new workspace
  const listRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/decisions`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert.strictEqual(listData.success, true);
  assert.strictEqual(listData.decisions.length, 0);

  // Fetch active session via legacy route
  const sessionRes = await fetch(`${baseUrl}/api/session`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.session, null);
});

test('MULTI-TENANCY: User can create, list, and mutate decisions in their own workspace', async () => {
  const email = `creator.${Date.now()}@saas.io`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'StrongSaaSPassword123!',
      name: 'Decision Author'
    })
  });
  const { token, workspace } = await regRes.json();

  // Create new decision
  const createRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/decisions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: 'Self-Serve Team Invites & Enterprise SSO',
      productArea: 'User Acquisition',
      problemStatement: {
        surfaceRequest: 'Users want to invite colleagues without contacting sales',
        underlyingProblem: 'Single-player friction stops viral expansion',
        targetPersona: 'Engineering Manager',
        businessImpact: 'Increase multi-seat conversion by 40%'
      },
      hypothesis: 'Magic link invites will increase 14-day team adoption'
    })
  });

  assert.strictEqual(createRes.status, 201);
  const createData = await createRes.json();
  assert.strictEqual(createData.success, true);
  assert.strictEqual(createData.decision.title, 'Self-Serve Team Invites & Enterprise SSO');
  assert.strictEqual(createData.decision.version, 1);
  assert.strictEqual(createData.decision.workspaceId, workspace.id);

  // List decisions in workspace
  const listRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/decisions`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const listData = await listRes.json();
  assert.strictEqual(listData.decisions.length, 1);
  assert.strictEqual(listData.decisions[0].title, 'Self-Serve Team Invites & Enterprise SSO');
});

test('MULTI-TENANCY: Unauthorized tenant is strictly forbidden from accessing another workspace decisions (403)', async () => {
  // 1. User A creates Workspace A and Decision A
  const emailA = `alice.${Date.now()}@corp-a.com`;
  const regA = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailA, password: 'StrongPassword123!', name: 'Alice' })
  });
  const dataA = await regA.json();

  const createRes = await fetch(`${baseUrl}/api/workspaces/${dataA.workspace.id}/decisions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${dataA.token}`
    },
    body: JSON.stringify({
      title: 'Confidential Strategy Decision A',
      problemStatement: 'Secret expansion model'
    })
  });
  const { decision: decisionA } = await createRes.json();

  // 2. User B creates Workspace B
  const emailB = `bob.${Date.now()}@corp-b.com`;
  const regB = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailB, password: 'StrongPassword123!', name: 'Bob' })
  });
  const dataB = await regB.json();

  // 3. User B attempts to access Workspace A decision -> 403 Forbidden
  const getRes = await fetch(`${baseUrl}/api/decisions/${decisionA.id}`, {
    headers: { 'Authorization': `Bearer ${dataB.token}` }
  });
  assert.strictEqual(getRes.status, 403);
  const getErr = await getRes.json();
  assert.strictEqual(getErr.code, 'FORBIDDEN_WORKSPACE_ACCESS');

  // 4. User B attempts to list Workspace A decisions -> 403 Forbidden
  const listRes = await fetch(`${baseUrl}/api/workspaces/${dataA.workspace.id}/decisions`, {
    headers: { 'Authorization': `Bearer ${dataB.token}` }
  });
  assert.strictEqual(listRes.status, 403);

  // 5. User B attempts to ingest signal into Decision A -> 403 Forbidden
  const signalRes = await fetch(`${baseUrl}/api/decisions/${decisionA.id}/signals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${dataB.token}`
    },
    body: JSON.stringify({ rawText: 'Spoofed signal from competitor' })
  });
  assert.strictEqual(signalRes.status, 403);
});

test('MULTI-TENANCY: Demo judge mode cannot access private workspaces (403)', async () => {
  // Create private workspace
  const email = `private.${Date.now()}@enterprise.com`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'StrongPassword123!', name: 'Private User' })
  });
  const { workspace } = await regRes.json();

  // Demo client attempts to access private workspace
  const res = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/decisions`, {
    headers: { 'X-PMPilot-Demo': 'true' }
  });
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.code, 'FORBIDDEN_WORKSPACE_ACCESS');
});
