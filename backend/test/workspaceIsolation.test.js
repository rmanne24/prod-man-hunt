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

test('MULTI-TENANCY: Cross-tenant exports, mutations, and header spoofing are rejected (403)', async () => {
  // 1. Tenant A setup
  const regA = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `tenant.a.${Date.now()}@corp.com`, password: 'TenantAPassword123!', name: 'Tenant A' })
  });
  const dataA = await regA.json();

  const createDecA = await fetch(`${baseUrl}/api/workspaces/${dataA.workspace.id}/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dataA.token}` },
    body: JSON.stringify({ title: 'Tenant A Proprietary Roadmapping' })
  });
  const { decision: decA } = await createDecA.json();

  // 2. Tenant B setup
  const regB = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `tenant.b.${Date.now()}@corp.com`, password: 'TenantBPassword123!', name: 'Tenant B' })
  });
  const dataB = await regB.json();

  // 3. Tenant B attempts Linear Export on Tenant A's decision -> 403
  const linExport = await fetch(`${baseUrl}/api/export/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dataB.token}` },
    body: JSON.stringify({ decisionId: decA.id, tickets: [] })
  });
  assert.strictEqual(linExport.status, 403);

  // 4. Tenant B attempts Slack Export on Tenant A's decision -> 403
  const slackExport = await fetch(`${baseUrl}/api/export/slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dataB.token}` },
    body: JSON.stringify({ decisionId: decA.id, channel: '#general', message: 'Unauthorized leak' })
  });
  assert.strictEqual(slackExport.status, 403);

  // 5. Tenant B attempts PRD job trigger on Tenant A's decision -> 403
  const prdJob = await fetch(`${baseUrl}/api/jobs/prd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dataB.token}` },
    body: JSON.stringify({ sessionId: decA.id })
  });
  assert.strictEqual(prdJob.status, 403);

  // 6. Tenant B attempts approval submission on Tenant A's decision -> 403
  const approvalRes = await fetch(`${baseUrl}/api/decisions/${decA.id}/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dataB.token}` },
    body: JSON.stringify({ action: 'APPROVE', decisionVersion: 1 })
  });
  assert.strictEqual(approvalRes.status, 403);

  // 7. Header spoofing: Tenant B passes X-Workspace-Id of Tenant B while targeting Decision A -> 403
  const spoofRes = await fetch(`${baseUrl}/api/decisions/${decA.id}`, {
    headers: {
      'Authorization': `Bearer ${dataB.token}`,
      'X-Workspace-Id': dataB.workspace.id
    }
  });
  assert.strictEqual(spoofRes.status, 403);
});

test('AUTH SECURITY: Password validation and OWASP-compliant PBKDF2 hashing', async () => {
  // Reject short password
  const shortRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `valid.${Date.now()}@domain.com`, password: 'short' })
  });
  assert.strictEqual(shortRes.status, 400);

  // Reject excessively long password (> 128 chars) to mitigate DoS
  const longPass = 'A'.repeat(129);
  const longRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `valid2.${Date.now()}@domain.com`, password: longPass })
  });
  assert.strictEqual(longRes.status, 400);

  // Reject invalid email format
  const badEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'ValidPassword123!' })
  });
  assert.strictEqual(badEmailRes.status, 400);

  // Successful registration stores 210,000 PBKDF2 iterations
  const email = `crypto.${Date.now()}@domain.com`;
  const okRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'SecureMasterPassword2026!' })
  });
  assert.strictEqual(okRes.status, 201);
  const user = db.getUserByEmail(email);
  assert.ok(user);
  assert.ok(user.password_hash.startsWith('pbkdf2$210000$'), 'Password hash must be tagged with 210,000 iterations');
});

test('ACCEPTANCE: Complete 10-step fresh user end-to-end lifecycle', async () => {
  const ts = Date.now();
  const testEmail = `freshpm.${ts}@testcorp.io`;
  const testPassword = 'ProductionReady2026!';
  const testName = 'Fresh Product Manager';
  const testWsName = 'Fresh Corp Workspace';

  // Step 1 & 2: Register fresh user and obtain Bearer token
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: testName,
      workspaceName: testWsName
    })
  });
  assert.strictEqual(regRes.status, 201);
  const regData = await regRes.json();
  const freshToken = regData.token;
  const freshWsId = regData.workspace.id;
  assert.ok(freshToken);
  assert.strictEqual(regData.workspace.name, testWsName);

  // Step 3: Verify dedicated private workspace starts with ZERO decisions (no demo contamination)
  const listEmptyRes = await fetch(`${baseUrl}/api/workspaces/${freshWsId}/decisions`, {
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  assert.strictEqual(listEmptyRes.status, 200);
  const emptyDecisions = await listEmptyRes.json();
  assert.strictEqual(emptyDecisions.decisions.length, 0);

  // Step 4: Create a new product decision
  const createDecRes = await fetch(`${baseUrl}/api/workspaces/${freshWsId}/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
    body: JSON.stringify({
      title: 'Global Payment Gateway Modernization',
      productArea: 'Billing & Checkout',
      problemStatement: {
        surfaceRequest: 'Payment failure rates spiked in EMEA',
        underlyingProblem: 'Legacy payment provider lacks 3DS2 support'
      },
      hypothesis: 'Migrating to multi-acquirer smart routing will reduce checkout drop-off by 18%'
    })
  });
  assert.strictEqual(createDecRes.status, 201);
  const decData = await createDecRes.json();
  const freshDecId = decData.decision.id;
  assert.strictEqual(decData.decision.version, 1);
  assert.strictEqual(decData.decision.status, 'DRAFT');

  // Step 5: Ingest real customer signal into the new decision
  const signalRes = await fetch(`${baseUrl}/api/decisions/${freshDecId}/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
    body: JSON.stringify({
      source: 'Zendesk Ticket #49281',
      sourceType: 'CUSTOMER_FEEDBACK',
      rawText: 'German customers unable to complete payment using Giropay. Card decline rate at 22%.',
      category: 'PAYMENT_FAILURE'
    })
  });
  assert.strictEqual(signalRes.status, 201);
  const sigData = await signalRes.json();
  assert.strictEqual(sigData.decision.signals.length, 1);

  // Step 6: Verify decision state, pending approval, and locked export
  const getDecRes = await fetch(`${baseUrl}/api/decisions/${freshDecId}`, {
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  assert.strictEqual(getDecRes.status, 200);
  const freshDec = await getDecRes.json();
  assert.strictEqual(freshDec.decision.approvalRecord.status, 'PENDING');

  // Linear export attempt without approval fails (403 Forbidden)
  const linLockedRes = await fetch(`${baseUrl}/api/export/linear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
    body: JSON.stringify({ decisionId: freshDecId, tickets: [{ title: 'Fix 3DS2' }] })
  });
  assert.strictEqual(linLockedRes.status, 403); // Export blocked: requires approval

  // Step 7: PM submits explicit human approval on current version (v2 after signal mutation)
  const approveRes = await fetch(`${baseUrl}/api/decisions/${freshDecId}/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
    body: JSON.stringify({
      action: 'APPROVE',
      decisionVersion: freshDec.decision.version,
      rationale: 'Approved based on EMEA payment failure analysis.'
    })
  });
  assert.strictEqual(approveRes.status, 200);
  const approvedData = await approveRes.json();
  assert.strictEqual(approvedData.decision.approvalRecord.status, 'APPROVED');

  // Step 8: Log out user -> Token is persistently revoked
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  assert.strictEqual(logoutRes.status, 200);

  // Step 9: Verify revoked token is rejected with 401 on protected route
  const revokedAccessRes = await fetch(`${baseUrl}/api/workspaces/${freshWsId}/decisions`, {
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  assert.strictEqual(revokedAccessRes.status, 401);

  // Step 10: Re-login user with credentials -> fresh token -> confirm full data persistence
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  const reauthFreshToken = loginData.token;
  assert.ok(reauthFreshToken);

  // Verify decisions persist in SQLite for this user
  const reauthListRes = await fetch(`${baseUrl}/api/workspaces/${freshWsId}/decisions`, {
    headers: { 'Authorization': `Bearer ${reauthFreshToken}` }
  });
  assert.strictEqual(reauthListRes.status, 200);
  const persistedDecisions = await reauthListRes.json();
  assert.strictEqual(persistedDecisions.decisions.length, 1);
  assert.strictEqual(persistedDecisions.decisions[0].title, 'Global Payment Gateway Modernization');
  assert.strictEqual(persistedDecisions.decisions[0].signalsCount, 1);
  assert.strictEqual(persistedDecisions.decisions[0].approvalStatus, 'APPROVED');
});

