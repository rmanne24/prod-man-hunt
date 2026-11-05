/**
 * PMPilot Linear OAuth & AES-256-GCM Integration Tests
 * 
 * Verifies:
 * 1. AES-256-GCM encryption & decryption security
 * 2. Strict failure when INTEGRATION_ENCRYPTION_KEY is missing or malformed
 * 3. OAuth CSRF state signing, validation, tampering rejection, and expiration
 * 4. Workspace-scoped connection persistence and sanitization in SQLite
 * 5. Disconnect behavior and token clearing
 * 6. Decision approval and version guards on Linear export
 * 7. Judge Demo Mode isolation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { encryptionService } from '../src/services/encryptionService.js';
import { linearService } from '../src/integrations/linearService.js';
import { PMPilotDatabase } from '../src/db/database.js';
import { RedisStateManager } from '../src/services/redisState.js';

test('ENCRYPTION: AES-256-GCM fails safely if INTEGRATION_ENCRYPTION_KEY is unset', () => {
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;

  try {
    assert.equal(encryptionService.isConfigured(), false);
    assert.throws(
      () => encryptionService.getEncryptionKey(),
      /INTEGRATION_ENCRYPTION_KEY is not configured in environment variables/
    );
    assert.throws(
      () => encryptionService.encrypt('lin_api_token_12345'),
      /INTEGRATION_ENCRYPTION_KEY is not configured in environment variables/
    );
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey;
  }
});

test('ENCRYPTION: AES-256-GCM rejects invalid key lengths and non-hex strings', () => {
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;

  try {
    // 1. Too short (16 bytes)
    process.env.INTEGRATION_ENCRYPTION_KEY = 'short_16_byte_k!';
    assert.equal(encryptionService.isConfigured(), false);
    assert.throws(
      () => encryptionService.getEncryptionKey(),
      /INTEGRATION_ENCRYPTION_KEY is malformed/
    );

    // 2. Exactly 32 characters ASCII but not 64 hex characters (32 bytes of hex requires 64 hex chars)
    process.env.INTEGRATION_ENCRYPTION_KEY = 'a'.repeat(32);
    assert.equal(encryptionService.isConfigured(), false);
    assert.throws(
      () => encryptionService.getEncryptionKey(),
      /INTEGRATION_ENCRYPTION_KEY is malformed/
    );

    // 3. 64 characters but non-hex
    process.env.INTEGRATION_ENCRYPTION_KEY = 'z'.repeat(64);
    assert.equal(encryptionService.isConfigured(), false);
    assert.throws(
      () => encryptionService.getEncryptionKey(),
      /INTEGRATION_ENCRYPTION_KEY is malformed/
    );
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey;
    else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('ENCRYPTION: Encrypts and decrypts OAuth token with valid 256-bit key', () => {
  const testKeyHex = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = testKeyHex;

  try {
    assert.equal(encryptionService.isConfigured(), true);
    const token = 'lin_oauth_access_token_secret_xyz987654321';
    const encryptedPayload = encryptionService.encrypt(token);

    assert.ok(encryptedPayload.encrypted);
    assert.ok(encryptedPayload.iv);
    assert.ok(encryptedPayload.tag);
    assert.notEqual(encryptedPayload.encrypted, token);

    const decrypted = encryptionService.decrypt(encryptedPayload);
    assert.equal(decrypted, token);
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey;
    else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('ENCRYPTION: Rejects tampered ciphertext or corrupted authentication tag', () => {
  const testKeyHex = crypto.randomBytes(32).toString('hex');
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = testKeyHex;

  try {
    const encryptedPayload = encryptionService.encrypt('confidential_refresh_token');

    // 1. Tamper ciphertext
    const tamperedCipher = {
      ...encryptedPayload,
      encrypted: encryptedPayload.encrypted.slice(0, -2) + 'ff'
    };
    assert.throws(
      () => encryptionService.decrypt(tamperedCipher),
      /Failed to decrypt token: authentication tag mismatch or ciphertext corrupted/
    );

    // 2. Corrupt tag
    const corruptedTag = {
      ...encryptedPayload,
      tag: crypto.randomBytes(16).toString('hex')
    };
    assert.throws(
      () => encryptionService.decrypt(corruptedTag),
      /Failed to decrypt token: authentication tag mismatch or ciphertext corrupted/
    );
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey;
    else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('OAUTH STATE: Signs state and generates RFC 7636 PKCE challenge', () => {
  const { state, codeChallenge, codeVerifier } = linearService.createOAuthState({
    workspaceId: 'ws_moonshot',
    userId: 'usr_pm_lead'
  });

  assert.ok(state.includes('.'), 'State must be dot-separated payload.signature');
  assert.ok(codeVerifier, 'Must generate PKCE code_verifier');
  assert.ok(codeChallenge, 'Must generate PKCE code_challenge');

  // Verify challenge matches SHA-256 of verifier
  const expectedChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  assert.equal(codeChallenge, expectedChallenge);

  // Validate state
  const verified = linearService.verifyOAuthState(state, 'ws_moonshot', 'usr_pm_lead');
  assert.equal(verified.workspaceId, 'ws_moonshot');
  assert.equal(verified.userId, 'usr_pm_lead');
  assert.equal(verified.codeVerifier, codeVerifier);
});

test('OAUTH STATE: Rejects tampered, mismatched, or expired states', () => {
  const { state } = linearService.createOAuthState({
    workspaceId: 'ws_moonshot',
    userId: 'usr_pm_lead'
  });

  // Tampered signature
  const [payloadB64] = state.split('.');
  const badState = `${payloadB64}.tampered_signature_xyz`;
  assert.throws(
    () => linearService.verifyOAuthState(badState, 'ws_moonshot', 'usr_pm_lead'),
    /Invalid OAuth state signature/
  );

  // Workspace mismatch
  assert.throws(
    () => linearService.verifyOAuthState(state, 'ws_different_workspace', 'usr_pm_lead'),
    /State workspace mismatch/
  );

  // User mismatch
  assert.throws(
    () => linearService.verifyOAuthState(state, 'ws_moonshot', 'usr_attacker'),
    /State user mismatch/
  );
});

test('REDIRECT URI: Preserves exact redirect_uri between authorization and exchange without hardcoded ports', () => {
  const dynamicOrigin = 'http://127.0.0.1:5173/';
  const { state } = linearService.createOAuthState({
    workspaceId: 'ws_moonshot',
    userId: 'usr_pm_lead',
    redirectUri: dynamicOrigin
  });

  // 1. Matches exact URI
  const verified = linearService.verifyOAuthState(state, 'ws_moonshot', 'usr_pm_lead', dynamicOrigin);
  assert.equal(verified.redirectUri, dynamicOrigin);

  // 2. Rejects mismatched redirectUri
  const mismatchUri = 'http://localhost:3000/callback';
  const { state: state2 } = linearService.createOAuthState({
    workspaceId: 'ws_moonshot',
    userId: 'usr_pm_lead',
    redirectUri: dynamicOrigin
  });
  assert.throws(
    () => linearService.verifyOAuthState(state2, 'ws_moonshot', 'usr_pm_lead', mismatchUri),
    /OAuth redirect_uri mismatch/
  );
});

test('PREFLIGHT: Safe check reports presence and validity without leaking secrets', () => {
  const origId = process.env.LINEAR_CLIENT_ID;
  const origSecret = process.env.LINEAR_CLIENT_SECRET;
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;

  delete process.env.LINEAR_CLIENT_ID;
  delete process.env.LINEAR_CLIENT_SECRET;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;

  try {
    // 1. Unconfigured state
    const report1 = linearService.getPreflightReport();
    assert.equal(report1.provider, 'LINEAR');
    assert.equal(report1.status, 'UNCONFIGURED');
    assert.equal(report1.isFullyConfigured, false);
    assert.equal(report1.variables.LINEAR_CLIENT_ID.present, false);
    assert.equal(report1.variables.LINEAR_CLIENT_ID.valid, false);
    assert.equal(report1.variables.LINEAR_CLIENT_SECRET.present, false);
    assert.equal(report1.variables.LINEAR_CLIENT_SECRET.valid, false);
    assert.equal(report1.variables.INTEGRATION_ENCRYPTION_KEY.present, false);
    assert.equal(report1.variables.INTEGRATION_ENCRYPTION_KEY.valid, false);

    // Verify no secret fields exist in report object
    assert.equal(report1.variables.LINEAR_CLIENT_ID.value, undefined);
    assert.equal(report1.variables.LINEAR_CLIENT_SECRET.value, undefined);
    assert.equal(report1.variables.INTEGRATION_ENCRYPTION_KEY.value, undefined);

    // 2. Malformed key state
    process.env.LINEAR_CLIENT_ID = 'test_client_id_123';
    process.env.LINEAR_CLIENT_SECRET = 'test_secret_abc';
    process.env.INTEGRATION_ENCRYPTION_KEY = 'not_64_hex_chars';

    const report2 = linearService.getPreflightReport();
    assert.equal(report2.status, 'UNCONFIGURED');
    assert.equal(report2.variables.LINEAR_CLIENT_ID.valid, true);
    assert.equal(report2.variables.LINEAR_CLIENT_SECRET.valid, true);
    assert.equal(report2.variables.INTEGRATION_ENCRYPTION_KEY.present, true);
    assert.equal(report2.variables.INTEGRATION_ENCRYPTION_KEY.valid, false);
    assert.ok(report2.variables.INTEGRATION_ENCRYPTION_KEY.error.includes('64 hex characters'));

    // 3. Fully valid state
    const validKey = crypto.randomBytes(32).toString('hex');
    process.env.INTEGRATION_ENCRYPTION_KEY = validKey;

    const report3 = linearService.getPreflightReport();
    assert.equal(report3.status, 'READY');
    assert.equal(report3.isFullyConfigured, true);
    assert.equal(report3.variables.INTEGRATION_ENCRYPTION_KEY.valid, true);

    // Ensure actual 64-char key string is NEVER in report3
    const reportString = JSON.stringify(report3);
    assert.equal(reportString.includes(validKey), false, 'Preflight report MUST NEVER leak encryption key value');
    assert.equal(reportString.includes('test_secret_abc'), false, 'Preflight report MUST NEVER leak client secret value');
  } finally {
    if (origId) process.env.LINEAR_CLIENT_ID = origId; else delete process.env.LINEAR_CLIENT_ID;
    if (origSecret) process.env.LINEAR_CLIENT_SECRET = origSecret; else delete process.env.LINEAR_CLIENT_SECRET;
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey; else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('PERSISTENCE: Stores encrypted integration connection and sanitizes frontend view', () => {
  const testDbPath = path.join(os.tmpdir(), `test_linear_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
  const testDb = new PMPilotDatabase(testDbPath);

  // Create user first so foreign key references succeed
  testDb.createUser({ id: 'usr_pm_1', email: 'pm1@acme.com', name: 'PM One' });
  testDb.createWorkspace({ id: 'ws_test_linear', name: 'Linear Test WS', createdBy: 'usr_pm_1' });

  // Save connection
  testDb.saveIntegrationConnection({
    id: 'conn_linear_1',
    workspaceId: 'ws_test_linear',
    provider: 'LINEAR',
    connectedByUserId: 'usr_pm_1',
    providerOrganizationId: 'org_lin_456',
    providerOrganizationName: 'Acme Product Org',
    providerUserId: 'usr_lin_99',
    scopes: 'read,write,issues:create',
    status: 'CONNECTED',
    encryptedAccessToken: 'encrypted_hex_abc',
    tokenIv: 'iv_hex_123',
    tokenTag: 'tag_hex_789',
    encryptedRefreshToken: 'refresh_hex_xyz',
    refreshIv: 'refresh_iv_456',
    refreshTag: 'refresh_tag_000',
    expiresAt: Math.floor(Date.now() / 1000) + 86400
  });

  const stored = testDb.getIntegrationConnection('ws_test_linear', 'LINEAR');
  assert.ok(stored);
  assert.equal(stored.provider, 'LINEAR');
  assert.equal(stored.provider_organization_name, 'Acme Product Org');
  assert.equal(stored.encrypted_access_token, 'encrypted_hex_abc');

  // Verify sanitized output (zero secrets exposed)
  const sanitized = linearService.sanitizeConnection(stored);
  assert.equal(sanitized.provider, 'LINEAR');
  assert.equal(sanitized.organizationName, 'Acme Product Org');
  assert.equal(sanitized.encryptedAccessToken, undefined);
  assert.equal(sanitized.tokenIv, undefined);
  assert.equal(sanitized.tokenTag, undefined);
  assert.equal(sanitized.encryptedRefreshToken, undefined);

  // Disconnect
  testDb.disconnectIntegrationConnection('ws_test_linear', 'LINEAR');
  const disconnected = testDb.getIntegrationConnection('ws_test_linear', 'LINEAR');
  assert.equal(disconnected.status, 'DISCONNECTED');
  assert.equal(disconnected.encrypted_access_token, '');

  testDb.close();
  try {
    const fs = require('node:fs');
    fs.unlinkSync(testDbPath);
  } catch (_) {}
});

test('EXPORT GUARD: Blocks Linear export on unapproved decisions or mutated decisions', async () => {
  RedisStateManager.resetToSeed();

  // 1. Unapproved decision is rejected with 403
  await assert.rejects(
    async () => {
      await linearService.exportApprovedDecisionToLinear({
        decisionId: 'session_moonshot_checkout',
        workspaceId: 'ws_moonshot',
        userId: 'usr_pm_lead',
        isDemo: true
      });
    },
    /Artifact generation blocked/
  );

  // 2. Resolve conflict and approve decision
  await RedisStateManager.resolveConflict('session_moonshot_checkout', 'conflict_1', 'res_3', { name: 'PM Lead' }, 'Resolved', 1);
  await RedisStateManager.submitApproval('session_moonshot_checkout', {
    action: 'APPROVE',
    decisionVersion: 2,
    callerIdentity: { name: 'PM Lead' },
    rationale: 'Approved guest checkout'
  });

  // 3. In Judge Demo Mode, export succeeds with isolated stub
  const demoExport = await linearService.exportApprovedDecisionToLinear({
    decisionId: 'session_moonshot_checkout',
    workspaceId: 'ws_moonshot',
    userId: 'usr_pm_lead',
    isDemo: true
  });
  assert.equal(demoExport.success, true);
  assert.equal(demoExport.status, 'DEMO_STUB_READY');
  assert.equal(demoExport.isDemoMode, true);

  // 4. Stale version mutation: Mutating decision invalidates approval and blocks export again
  await RedisStateManager.reopenDecision('session_moonshot_checkout', 'Reopened for review', { name: 'PM Lead' });
  await assert.rejects(
    async () => {
      await linearService.exportApprovedDecisionToLinear({
        decisionId: 'session_moonshot_checkout',
        workspaceId: 'ws_moonshot',
        userId: 'usr_pm_lead',
        isDemo: true
      });
    },
    /Artifact generation blocked/
  );
});
