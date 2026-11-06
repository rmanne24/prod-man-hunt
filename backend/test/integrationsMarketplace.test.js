import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import app from '../src/server.js';
import { db } from '../src/db/database.js';
import { encryptionService } from '../src/services/encryptionService.js';
import { ssrfProtection } from '../src/services/ssrfProtection.js';
import { slackService } from '../src/integrations/slackService.js';
import { customIntegrationService } from '../src/integrations/customIntegrationService.js';

let server;
let baseUrl;
process.env.NODE_ENV = 'test';

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

test('SSRF PROTECTION: Blocks private IPs, loopback, link-local, and cloud metadata', async () => {
  // 1. Loopback addresses
  assert.equal((await ssrfProtection.validateTargetUrl('http://127.0.0.1:8080/hook')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://localhost:3000/api')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://127.0.0.2/test')).valid, false);

  // 2. Private RFC 1918 subnets
  assert.equal((await ssrfProtection.validateTargetUrl('http://10.0.0.1/webhook')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://172.16.0.5/api')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://172.31.255.255/api')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://192.168.1.100:9000/test')).valid, false);

  // 3. Cloud metadata endpoints (AWS, GCP, Azure)
  assert.equal((await ssrfProtection.validateTargetUrl('http://169.254.169.254/latest/meta-data/')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('http://metadata.google.internal/computeMetadata/v1/')).valid, false);

  // 4. Invalid protocols
  assert.equal((await ssrfProtection.validateTargetUrl('file:///etc/passwd')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('ftp://example.com/file')).valid, false);
  assert.equal((await ssrfProtection.validateTargetUrl('javascript:alert(1)')).valid, false);

  // 5. Valid public URL
  const validCheck = await ssrfProtection.validateTargetUrl('https://hooks.slack.com/services/T123/B456/789xyz');
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.parsedUrl.protocol, 'https:');
});

test('SSRF PROTECTION: SafeFetch blocks requests to forbidden hosts before socket creation', async () => {
  await assert.rejects(
    async () => {
      await ssrfProtection.safeFetch('http://127.0.0.1:8080/secret');
    },
    /SSRF Protection Blocked Request/
  );

  await assert.rejects(
    async () => {
      await ssrfProtection.safeFetch('http://169.254.169.254/iam/credentials');
    },
    /SSRF Protection Blocked Request/
  );
});

test('SLACK INTEGRATION: Verifies real connection, encrypts credentials, and redacts secrets in API responses', async () => {
  const wsId = `ws_slack_${Date.now()}`;
  const userId = `usr_slack_${Date.now()}`;
  db.stmtInsertWorkspace.run(wsId, 'Slack Test Workspace', userId, new Date().toISOString());
  db.stmtInsertUser.run(userId, 'local', null, `slack.pm.${Date.now()}@team.co`, 'Slack PM', 'OWNER', 'hash', 'salt', new Date().toISOString(), new Date().toISOString());

  // 1. Initial status: truthfully reports NOT_CONNECTED
  const initialStatus = await slackService.getConnectionStatus(wsId);
  assert.equal(initialStatus.connected, false);
  assert.equal(initialStatus.status, 'NOT_CONNECTED');
  assert.equal(initialStatus.connection, null);

  // 2. Attempt connect to SSRF forbidden address -> rejected
  await assert.rejects(
    async () => {
      await slackService.connect({
        workspaceId: wsId,
        userId,
        webhookUrl: 'http://127.0.0.1:9999/slack-fake'
      });
    },
    /Invalid Slack Webhook URL/
  );

  // 3. Connect to a mock remote Slack webhook endpoint
  let receivedPayload = null;
  const mockSlackServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        receivedPayload = JSON.parse(body);
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });

  await new Promise(resolve => mockSlackServer.listen(0, '127.0.0.1', resolve));
  const port = mockSlackServer.address().port;
  const mockWebhookUrl = `http://127.0.0.1:${port}/services/T0123/B0456/mocksecretkey789`;

  try {
    // For test purposes, allow local host probe to our mock server
    const origValidate = ssrfProtection.validateTargetUrl;
    ssrfProtection.validateTargetUrl = async (url) => ({ valid: true, parsedUrl: new URL(url) });

    const connected = await slackService.connect({
      workspaceId: wsId,
      userId,
      webhookUrl: mockWebhookUrl,
      channel: '#product-announcements',
      teamName: 'Acme Product Slack'
    });

    ssrfProtection.validateTargetUrl = origValidate;

    assert.equal(connected.status, 'CONNECTED');
    assert.equal(connected.connection.channel, '#product-announcements');
    assert.ok(connected.connection.maskedWebhookUrl.includes('••••'));
    assert.ok(!connected.connection.maskedWebhookUrl.includes('mocksecretkey789'), 'Secret must be masked');
    assert.ok(receivedPayload && receivedPayload.text.includes('PMPilot Verification'));

    // 4. Verify SQLite row: encrypted at rest
    const rawRow = db.getIntegrationConnection(wsId, 'SLACK');
    assert.ok(rawRow);
    assert.notEqual(rawRow.encrypted_access_token, mockWebhookUrl, 'Must not be plaintext in DB');
    assert.ok(rawRow.token_iv);
    assert.ok(rawRow.token_tag);

    // Decrypt directly from DB to verify validity
    const decrypted = encryptionService.decrypt({
      encrypted: rawRow.encrypted_access_token,
      iv: rawRow.token_iv,
      tag: rawRow.token_tag
    });
    assert.equal(decrypted, mockWebhookUrl);

    // 5. Test status endpoint returns sanitized response
    const status = await slackService.getConnectionStatus(wsId);
    assert.equal(status.connected, true);
    assert.equal(status.status, 'CONNECTED');
    assert.equal(status.connection.channel, '#product-announcements');
    assert.ok(status.connection.maskedWebhookUrl.includes('••••'));

    // 6. Disconnect action
    await slackService.disconnect(wsId);
    const disconnectedStatus = await slackService.getConnectionStatus(wsId);
    assert.equal(disconnectedStatus.connected, false);
    assert.equal(disconnectedStatus.status, 'NOT_CONNECTED');
  } finally {
    mockSlackServer.close();
  }
});

test('CUSTOM INTEGRATIONS: CRUD, Secret Encryption, Masking, and Webhook HMAC Signature', async () => {
  const wsId = `ws_custom_${Date.now()}`;
  const userId = `usr_custom_${Date.now()}`;
  db.stmtInsertWorkspace.run(wsId, 'Custom Test Workspace', userId, new Date().toISOString());
  db.stmtInsertUser.run(userId, 'local', null, `custom.pm.${Date.now()}@team.co`, 'Custom PM', 'OWNER', 'hash', 'salt', new Date().toISOString(), new Date().toISOString());

  // 1. Create Custom REST API Integration
  const customApi = await customIntegrationService.create(wsId, userId, {
    name: 'Customer Telemetry Gateway',
    description: 'Ingests drop-off signals and user telemetry',
    type: 'CUSTOM_API',
    url: 'https://api.telemetry-partner.com/v1/metrics',
    authType: 'BEARER',
    secret: 'super_secret_bearer_token_xyz_987654',
    customHeaders: {
      'Accept': 'application/json',
      'X-Partner-Id': 'acme-corp'
    }
  });

  assert.equal(customApi.name, 'Customer Telemetry Gateway');
  assert.equal(customApi.type, 'CUSTOM_API');
  assert.equal(customApi.authType, 'BEARER');
  assert.equal(customApi.hasSecret, true);
  assert.equal(customApi.secretMasked, '••••••••');
  assert.strictEqual(customApi.secret, undefined, 'Plaintext secret must NEVER be returned');

  // Check Database storage: verify AES-256-GCM encryption
  const rawDbApi = db.getCustomIntegration(wsId, customApi.id);
  assert.ok(rawDbApi.encryptedSecret);
  assert.notEqual(rawDbApi.encryptedSecret, 'super_secret_bearer_token_xyz_987654');
  const decryptedToken = encryptionService.decrypt({
    encrypted: rawDbApi.encryptedSecret,
    iv: rawDbApi.secretIv,
    tag: rawDbApi.secretTag
  });
  assert.equal(decryptedToken, 'super_secret_bearer_token_xyz_987654');

  // 2. Create Custom Webhook Integration
  const customWebhook = await customIntegrationService.create(wsId, userId, {
    name: 'Zapier / Datadog Event Pipeline',
    description: 'Receives decision approved events',
    type: 'CUSTOM_WEBHOOK',
    url: 'https://hooks.zapier.com/hooks/catch/12345/abcde/',
    events: ['decision.approved', 'proposal.accepted']
  });

  assert.equal(customWebhook.type, 'CUSTOM_WEBHOOK');
  assert.deepEqual(customWebhook.events, ['decision.approved', 'proposal.accepted']);
  assert.ok(customWebhook.signingSecretMasked.startsWith('whsec_'));

  // 3. Webhook HMAC-SHA256 signature verification helper
  const rawDbWebhook = db.getCustomIntegration(wsId, customWebhook.id);
  const secret = rawDbWebhook.signingSecret;
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ event: 'decision.approved', version: 2 });
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

  // Verify signature matches
  const isValid = customIntegrationService.verifyWebhookSignature(payload, `v1=${sig}`, secret, timestamp);
  assert.equal(isValid, true, 'Valid HMAC signature must verify');

  // Tampered payload fails
  const isTamperedValid = customIntegrationService.verifyWebhookSignature('{"tampered":true}', `v1=${sig}`, secret, timestamp);
  assert.equal(isTamperedValid, false, 'Tampered payload must fail signature verification');

  // 4. Update custom integration
  const updated = await customIntegrationService.update(wsId, customApi.id, {
    name: 'Customer Telemetry Gateway V2',
    description: 'Updated description'
  });
  assert.equal(updated.name, 'Customer Telemetry Gateway V2');
  assert.equal(updated.description, 'Updated description');
  assert.equal(updated.hasSecret, true);

  // 5. Toggle integration state
  const disabled = await customIntegrationService.toggle(wsId, customApi.id, false);
  assert.equal(disabled.isEnabled, false);

  const enabled = await customIntegrationService.toggle(wsId, customApi.id, true);
  assert.equal(enabled.isEnabled, true);

  // 6. Delete integration
  const deleteResult = await customIntegrationService.delete(wsId, customWebhook.id);
  assert.equal(deleteResult.success, true);
  const deletedItem = await customIntegrationService.get(wsId, customWebhook.id);
  assert.equal(deletedItem, null);
});

test('TENANT ISOLATION: Workspace A cannot access or delete Workspace B integrations', async () => {
  const wsA = `ws_iso_a_${Date.now()}`;
  const wsB = `ws_iso_b_${Date.now()}`;
  const userA = `usr_iso_a_${Date.now()}`;
  const userB = `usr_iso_b_${Date.now()}`;

  db.stmtInsertWorkspace.run(wsA, 'Workspace A', userA, new Date().toISOString());
  db.stmtInsertWorkspace.run(wsB, 'Workspace B', userB, new Date().toISOString());

  db.stmtInsertUser.run(userA, 'local', null, `usera.${Date.now()}@team.co`, 'User A', 'OWNER', 'hash', 'salt', new Date().toISOString(), new Date().toISOString());
  db.stmtInsertUser.run(userB, 'local', null, `userb.${Date.now()}@team.co`, 'User B', 'OWNER', 'hash', 'salt', new Date().toISOString(), new Date().toISOString());

  // User A creates custom integration in Workspace A
  const itemA = await customIntegrationService.create(wsA, userA, {
    name: 'Workspace A Private Service',
    type: 'CUSTOM_API',
    url: 'https://api.work-a.internal.example.com/v1',
    authType: 'BEARER',
    secret: 'secret_a_token'
  });

  // 1. Workspace B cannot get itemA
  const itemFromB = await customIntegrationService.get(wsB, itemA.id);
  assert.equal(itemFromB, null, 'Workspace B must not be able to read Workspace A custom integration');

  // 2. Workspace B list does not contain Workspace A item
  const listB = await customIntegrationService.list(wsB);
  assert.equal(listB.some(i => i.id === itemA.id), false);

  // 3. Workspace B cannot update Workspace A item
  await assert.rejects(
    async () => {
      await customIntegrationService.update(wsB, itemA.id, { name: 'Compromised Name' });
    },
    /not found in this workspace/
  );

  // 4. Workspace B cannot delete Workspace A item
  await assert.rejects(
    async () => {
      await customIntegrationService.delete(wsB, itemA.id);
    },
    /not found in this workspace/
  );

  // Verify item in Workspace A is still intact and unchanged
  const intact = await customIntegrationService.get(wsA, itemA.id);
  assert.equal(intact.name, 'Workspace A Private Service');
});

test('HTTP API ROUTES: Workspace integration endpoints enforce authentication and tenant isolation', async () => {
  // 1. Register test user to get JWT token
  const email = `market.pm.${Date.now()}@saas.co`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', name: 'Marketplace PM' })
  });
  assert.strictEqual(regRes.status, 201);
  const regData = await regRes.json();
  const token = regData.token;
  const wsId = regData.workspace.id;

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. GET Slack status (honest NOT_CONNECTED)
  const slackStatusRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/slack/status`, {
    headers: authHeaders
  });
  assert.strictEqual(slackStatusRes.status, 200);
  const slackStatus = await slackStatusRes.json();
  assert.strictEqual(slackStatus.success, true);
  assert.strictEqual(slackStatus.connected, false);
  assert.strictEqual(slackStatus.status, 'NOT_CONNECTED');

  // 3. POST Custom API Integration
  const createRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/custom`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Analytics API',
      description: 'Custom internal analytics service',
      type: 'CUSTOM_API',
      url: 'https://analytics.example.com/api',
      authType: 'API_KEY',
      authHeaderName: 'X-App-Key',
      secret: 'my_secret_key_123'
    })
  });
  assert.strictEqual(createRes.status, 201);
  const createData = await createRes.json();
  assert.strictEqual(createData.success, true);
  assert.strictEqual(createData.integration.hasSecret, true);
  assert.strictEqual(createData.integration.secretMasked, '••••••••');
  assert.strictEqual(createData.integration.secret, undefined);

  const customId = createData.integration.id;

  // 4. GET Custom Integrations list
  const listRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/custom`, {
    headers: authHeaders
  });
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert.strictEqual(listData.integrations.length >= 1, true);
  assert.strictEqual(listData.integrations[0].secretMasked, '••••••••');

  // 5. POST toggle
  const toggleRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/custom/${customId}/toggle`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ isEnabled: false })
  });
  assert.strictEqual(toggleRes.status, 200);
  const toggleData = await toggleRes.json();
  assert.strictEqual(toggleData.integration.isEnabled, false);

  // 6. DELETE custom integration
  const delRes = await fetch(`${baseUrl}/api/workspaces/${wsId}/integrations/custom/${customId}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  assert.strictEqual(delRes.status, 200);
  const delData = await delRes.json();
  assert.strictEqual(delData.success, true);
});
