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

test('AUTH: GET /api/auth/config returns provider status and setup guidance', async () => {
  const res = await fetch(`${baseUrl}/api/auth/config`);
  assert.strictEqual(res.status, 200);

  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(typeof data.provider, 'string');
  assert.strictEqual(typeof data.auth0.isConfigured, 'boolean');
  assert.strictEqual(Array.isArray(data.auth0.missingVariables), true);
  assert.strictEqual(typeof data.notice, 'string');
});

test('AUTH: POST /api/auth/register creates user account and returns signed Bearer token', async () => {
  const uniqueEmail = `sarah.pm.${Date.now()}@productteam.co`;
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: uniqueEmail,
      password: 'StrongPassword123!',
      name: 'Sarah Connor'
    })
  });

  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(typeof data.token, 'string');
  assert.strictEqual(data.token.split('.').length, 3);
  assert.strictEqual(data.user.email, uniqueEmail);
  assert.strictEqual(data.user.name, 'Sarah Connor');
});

test('AUTH: POST /api/auth/register validates email format and password strength', async () => {
  // Invalid email
  const resBadEmail = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'not-an-email',
      password: 'StrongPassword123!',
      name: 'Tester'
    })
  });
  assert.strictEqual(resBadEmail.status, 400);
  const errBadEmail = await resBadEmail.json();
  assert.match(errBadEmail.error, /valid email/i);

  // Short password
  const resShortPass = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `short.${Date.now()}@team.co`,
      password: 'short',
      name: 'Tester'
    })
  });
  assert.strictEqual(resShortPass.status, 400);
  const errShortPass = await resShortPass.json();
  assert.match(errShortPass.error, /at least 8 characters/i);
});

test('AUTH: POST /api/auth/register prevents duplicate email registrations', async () => {
  const email = `dupe.${Date.now()}@team.co`;
  const firstRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'StrongPassword123!',
      name: 'First User'
    })
  });
  assert.strictEqual(firstRes.status, 201);

  const dupeRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'AnotherPassword456!',
      name: 'Second User'
    })
  });
  assert.strictEqual(dupeRes.status, 400);
  const dupeData = await dupeRes.json();
  assert.match(dupeData.error, /already exists/i);
});

test('AUTH: POST /api/auth/login authenticates registered user and rejects bad passwords', async () => {
  const email = `login.test.${Date.now()}@team.co`;
  const password = 'CorrectPassword999!';

  // Register first
  await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Login Tester' })
  });

  // Successful login
  const okRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.strictEqual(okRes.status, 200);
  const okData = await okRes.json();
  assert.strictEqual(okData.success, true);
  assert.strictEqual(typeof okData.token, 'string');
  assert.strictEqual(okData.user.email, email);

  // Wrong password
  const badRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'WrongPassword123!' })
  });
  assert.strictEqual(badRes.status, 401);
  const badData = await badRes.json();
  assert.match(badData.error, /invalid email or password/i);

  // Unknown email
  const unknownRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent@team.co', password: 'SomePassword123!' })
  });
  assert.strictEqual(unknownRes.status, 401);
});

test('AUTH: GET /api/auth/me enforces backend token verification and rejects unauthenticated requests', async () => {
  // Unauthenticated request
  const noTokenRes = await fetch(`${baseUrl}/api/auth/me`);
  assert.strictEqual(noTokenRes.status, 401);

  // Forged / tampered token
  const fakeTokenRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': 'Bearer fake.invalid.token' }
  });
  assert.strictEqual(fakeTokenRes.status, 401);

  // Valid token
  const email = `me.test.${Date.now()}@team.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ValidPassword123!', name: 'Identity Tester' })
  });
  const { token } = await regRes.json();

  const validRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(validRes.status, 200);
  const validData = await validRes.json();
  assert.strictEqual(validData.success, true);
  assert.strictEqual(validData.user.email, email);
  assert.strictEqual(validData.user.name, 'Identity Tester');
  assert.strictEqual(validData.authMode, 'AUTHENTICATED');
});

test('AUTH: POST /api/auth/logout revokes session token immediately', async () => {
  const email = `logout.test.${Date.now()}@team.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ValidPassword123!', name: 'Logout Tester' })
  });
  const { token } = await regRes.json();

  // Verify token works before logout
  const beforeRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(beforeRes.status, 200);

  // Call logout
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(logoutRes.status, 200);

  // Subsequent request must be rejected with 401
  const afterRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(afterRes.status, 401);
  const afterData = await afterRes.json();
  assert.match(afterData.error, /revoked/i);
});

test('AUTH: GET /api/auth/protected-test strictly rejects demo mode and anonymous clients', async () => {
  // 1. Anonymous request -> 401
  const anonRes = await fetch(`${baseUrl}/api/auth/protected-test`);
  assert.strictEqual(anonRes.status, 401);

  // 2. Demo client header -> 401 (Real user account required)
  const demoRes = await fetch(`${baseUrl}/api/auth/protected-test`, {
    headers: { 'X-PMPilot-Demo': 'true' }
  });
  assert.strictEqual(demoRes.status, 401);

  // 3. Real authenticated user -> 200
  const email = `strict.test.${Date.now()}@team.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ValidPassword123!', name: 'Strict User' })
  });
  const { token } = await regRes.json();

  const realRes = await fetch(`${baseUrl}/api/auth/protected-test`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(realRes.status, 200);
  const realData = await realRes.json();
  assert.strictEqual(realData.success, true);
  assert.strictEqual(realData.user.email, email);
});

test('AUTH: Authenticated approval binds verified token identity instead of client-supplied spoofed name', async () => {
  // 1. Register a real user
  const email = `pm.approver.${Date.now()}@team.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ValidPassword123!', name: 'Verified PM Alice' })
  });
  const { token } = await regRes.json();

  // 2. Resolve conflict first
  await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/conflicts/conflict_1/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      resolutionChoiceId: 'res_3',
      resolutionNotes: 'Standardized to 3 items'
    })
  });

  // 3. Submit approval with Bearer token, but pass a spoofed decidedBy in the body
  const approveRes = await fetch(`${baseUrl}/api/decisions/session_moonshot_checkout/approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'APPROVE',
      decisionVersion: 2,
      decidedBy: 'Spoofed Fake Name In Body',
      rationale: 'Approved for production'
    })
  });

  assert.strictEqual(approveRes.status, 200);
  const approveData = await approveRes.json();
  assert.strictEqual(approveData.success, true);

  // Verified identity from cryptographic token must be bound!
  assert.strictEqual(approveData.decision.approvalRecord.decidedBy, `Verified PM Alice (${email})`);
});

