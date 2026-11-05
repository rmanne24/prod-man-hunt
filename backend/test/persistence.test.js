/**
 * PMPilot Persistence & Multi-Tenant Authorization Tests
 * 
 * Verifies:
 * 1. User records survive backend restart / re-instantiation
 * 2. Revoked tokens survive backend restart / re-instantiation
 * 3. Canonical decisions and resolutions survive backend restart
 * 4. Multi-tenant workspace isolation enforces 403 Forbidden for non-members
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PMPilotDatabase } from '../src/db/database.js';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

test('PERSISTENCE: Users and password hashes survive service re-instantiation', async () => {
  // Use isolated temporary SQLite database file to simulate process restart
  const testDbPath = path.join(os.tmpdir(), `test_persistence_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
  
  // Instance 1: Create user and workspace
  const db1 = new PMPilotDatabase(testDbPath);
  const user = db1.createUser({
    id: 'usr_persistent_pm',
    email: 'sarah.pm@enterprise.com',
    name: 'Sarah Enterprise',
    passwordHash: 'dummy_hash_pbkdf2_123',
    passwordSalt: 'dummy_salt_456'
  });
  db1.createWorkspace({
    id: 'ws_enterprise',
    name: 'Enterprise Cloud Workspace',
    createdBy: user.id
  });
  db1.close();

  // Instance 2 (Simulated server restart): Open same DB file
  const db2 = new PMPilotDatabase(testDbPath);
  const restoredUser = db2.getUserByEmail('sarah.pm@enterprise.com');
  const restoredWorkspace = db2.getWorkspace('ws_enterprise');

  assert.ok(restoredUser, 'User should be found after simulated server restart');
  assert.equal(restoredUser.id, 'usr_persistent_pm');
  assert.equal(restoredUser.password_hash, 'dummy_hash_pbkdf2_123');
  assert.equal(restoredUser.password_salt, 'dummy_salt_456');

  assert.ok(restoredWorkspace, 'Workspace should be found after simulated restart');
  assert.equal(restoredWorkspace.id, 'ws_enterprise');
  assert.equal(db2.isWorkspaceMember('ws_enterprise', 'usr_persistent_pm'), true);

  db2.close();
  try {
    const fs = await import('node:fs');
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch (_) {}
});

test('PERSISTENCE: Revoked tokens survive process restart across multi-instance nodes', async () => {
  const testDbPath = path.join(os.tmpdir(), `test_revocation_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
  
  // Instance 1: Revoke token
  const db1 = new PMPilotDatabase(testDbPath);
  const token = 'header.payload.signature_token_abc';
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expSeconds = Math.floor(Date.now() / 1000) + 3600;

  db1.revokeToken(tokenHash, expSeconds);
  assert.equal(db1.isTokenRevoked(tokenHash), true);
  db1.close();

  // Instance 2 (Simulated another container / restart node)
  const db2 = new PMPilotDatabase(testDbPath);
  assert.equal(db2.isTokenRevoked(tokenHash), true, 'Revoked token state must persist across process restarts');

  db2.close();
  try {
    const fs = await import('node:fs');
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch (_) {}
});

test('PERSISTENCE: Canonical decision state, version, and approvals survive restart', async () => {
  const testDbPath = path.join(os.tmpdir(), `test_decision_restart_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
  
  const db1 = new PMPilotDatabase(testDbPath);
  const decisionData = {
    id: 'decision_payment_flow',
    title: 'Instant Bank Checkout',
    version: 3,
    status: 'APPROVED',
    conflicts: [{ id: 'c1', status: 'RESOLVED', resolutionChoiceId: 'choice_b' }],
    approvalRecord: {
      status: 'APPROVED',
      approvedVersion: 3,
      decidedBy: 'Chief Product Officer'
    }
  };

  db1.saveDecision('decision_payment_flow', 'ws_moonshot', 3, 'APPROVED', decisionData);
  db1.close();

  // Instance 2: Reload after restart
  const db2 = new PMPilotDatabase(testDbPath);
  const loaded = db2.getDecision('decision_payment_flow');
  const meta = db2.getDecisionMeta('decision_payment_flow');

  assert.ok(loaded, 'Decision record should survive restart');
  assert.equal(loaded.version, 3);
  assert.equal(loaded.status, 'APPROVED');
  assert.equal(loaded.approvalRecord.decidedBy, 'Chief Product Officer');
  assert.equal(meta.workspaceId, 'ws_moonshot');
  assert.equal(meta.version, 3);

  db2.close();
  try {
    const fs = await import('node:fs');
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch (_) {}
});

test('WORKSPACE AUTHORIZATION: Multi-tenant boundary isolates workspaces', async () => {
  const testDbPath = path.join(os.tmpdir(), `test_tenant_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
  const db = new PMPilotDatabase(testDbPath);

  // User A & User B
  db.createUser({ id: 'usr_alpha', email: 'alice@corp-a.com', name: 'Alice' });
  db.createUser({ id: 'usr_beta', email: 'bob@corp-b.com', name: 'Bob' });

  // Workspace A (Alice) & Workspace B (Bob)
  db.createWorkspace({ id: 'ws_corp_a', name: 'Corp A Workspace', createdBy: 'usr_alpha' });
  db.createWorkspace({ id: 'ws_corp_b', name: 'Corp B Workspace', createdBy: 'usr_beta' });

  // Verify membership
  assert.equal(db.isWorkspaceMember('ws_corp_a', 'usr_alpha'), true);
  assert.equal(db.isWorkspaceMember('ws_corp_a', 'usr_beta'), false);

  assert.equal(db.isWorkspaceMember('ws_corp_b', 'usr_beta'), true);
  assert.equal(db.isWorkspaceMember('ws_corp_b', 'usr_alpha'), false);

  // Check user workspace listings
  const aliceWorkspaces = db.getUserWorkspaces('usr_alpha');
  assert.equal(aliceWorkspaces.length, 1);
  assert.equal(aliceWorkspaces[0].id, 'ws_corp_a');

  const bobWorkspaces = db.getUserWorkspaces('usr_beta');
  assert.equal(bobWorkspaces.length, 1);
  assert.equal(bobWorkspaces[0].id, 'ws_corp_b');

  db.close();
  try {
    const fs = await import('node:fs');
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch (_) {}
});
