/**
 * PMPilot Switch AI Collaboration Integration Tests
 * 
 * Verifies:
 * 1. Truthful Preflight & Health Check (never reports CONNECTED when unconfigured or unreachable)
 * 2. Zero secret leakage in preflight and error messages
 * 3. Safe Decision Context Briefing generation (redacts secrets, extracts contradictions)
 * 4. Idempotent Room Association (SQLite persistence prevents duplicate room creation)
 * 5. Structured Proposals bound to decision.version
 * 6. Strict Human Approval Gate:
 *    - Automated proposals stay PENDING
 *    - Stale proposals (version mismatch) are rejected with clear error
 *    - Applying proposal mutates decision, increments version, and invalidates previous human approval
 * 7. Downstream Delivery Export Protection:
 *    - After proposal application, Linear export is locked until human re-approves at new version
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { switchService } from '../src/integrations/switchService.js';
import { PMPilotDatabase, db } from '../src/db/database.js';
import { RedisStateManager } from '../src/services/redisState.js';
import { createDecisionRecord, DECISION_STATES } from '../src/domain/decisionModel.js';
import { StateTransitionError } from '../src/domain/stateMachine.js';

test('PREFLIGHT: Switch preflight truthfully reports UNCONFIGURED or UNREACHABLE without server', async () => {
  const origUrl = process.env.SWITCH_SERVER_URL;
  const origReg = process.env.SWITCH_REGISTRATION_TOKEN;
  const origKey = process.env.SWITCH_AGENT_API_KEY;

  try {
    delete process.env.SWITCH_SERVER_URL;
    delete process.env.SWITCH_REGISTRATION_TOKEN;
    delete process.env.SWITCH_AGENT_API_KEY;

    const report = await switchService.getPreflightReport();
    assert.equal(report.reachable, false);
    assert.notEqual(report.status, 'CONNECTED');
    assert.equal(report.variables.SWITCH_REGISTRATION_TOKEN.present, false);
    assert.equal(report.variables.SWITCH_AGENT_API_KEY.present, false);

    // Verify zero secret leakage in variables object
    assert.equal(typeof report.variables.SWITCH_REGISTRATION_TOKEN.value, 'undefined');
    assert.equal(typeof report.variables.SWITCH_AGENT_API_KEY.value, 'undefined');
  } finally {
    if (origUrl) process.env.SWITCH_SERVER_URL = origUrl;
    if (origReg) process.env.SWITCH_REGISTRATION_TOKEN = origReg;
    if (origKey) process.env.SWITCH_AGENT_API_KEY = origKey;
  }
});

test('PREFLIGHT: Switch preflight reports CONNECTED only when live server health succeeds', async () => {
  // Spin up a mock Switch HTTP server
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0-switch-core' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;

  const origUrl = process.env.SWITCH_SERVER_URL;
  const origReg = process.env.SWITCH_REGISTRATION_TOKEN;

  try {
    process.env.SWITCH_SERVER_URL = `http://127.0.0.1:${port}`;
    process.env.SWITCH_REGISTRATION_TOKEN = 'mock_reg_token_xyz987';

    const report = await switchService.getPreflightReport();
    assert.equal(report.reachable, true);
    assert.equal(report.status, 'CONNECTED');
    assert.equal(report.health?.status, 'ok');
    assert.equal(report.variables.SWITCH_REGISTRATION_TOKEN.present, true);
    assert.equal(typeof report.variables.SWITCH_REGISTRATION_TOKEN.value, 'undefined', 'Secret must never be in preflight');
  } finally {
    mockServer.close();
    if (origUrl) process.env.SWITCH_SERVER_URL = origUrl;
    else delete process.env.SWITCH_SERVER_URL;
    if (origReg) process.env.SWITCH_REGISTRATION_TOKEN = origReg;
    else delete process.env.SWITCH_REGISTRATION_TOKEN;
  }
});

test('SANITIZATION: Redacts sensitive tokens and secrets from messages and logs', () => {
  const dirty = 'Error at registration_token=secret_123456789 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and key aabbccddee0011223344556677889900aabbccddee0011223344556677889900';
  const clean = switchService.sanitizeMessage(dirty);
  assert.equal(clean.includes('secret_123456789'), false);
  assert.equal(clean.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
  assert.equal(clean.includes('aabbccddee0011223344556677889900aabbccddee0011223344556677889900'), false);
  assert.match(clean, /registration_token=\[REDACTED\]/);
  assert.match(clean, /Bearer \[REDACTED\]/);
  assert.match(clean, /\[REDACTED_KEY\]/);
});

test('SAFE CONTEXT: Builds sanitized decision context without leaking sensitive fields', () => {
  const rawDecision = {
    id: 'dec_checkout_split',
    title: 'One-Click Checkout Split Testing',
    version: 3,
    status: 'IN_REVIEW',
    hypothesis: 'Reducing checkout steps will increase conversions by 14%',
    internalApiSecret: 'do_not_share_internal_token_999',
    contradictions: [
      {
        id: 'c1',
        status: 'OPEN',
        severity: 'BLOCKING',
        claimA: { text: 'Higher conversion on single page' },
        claimB: { text: 'Higher fraud chargebacks on single page' }
      }
    ],
    approvalRecord: {
      status: 'PENDING',
      version: 2
    }
  };

  const safeContext = switchService.buildSafeDecisionContext(rawDecision);
  assert.equal(safeContext.decisionId, 'dec_checkout_split');
  assert.equal(safeContext.title, 'One-Click Checkout Split Testing');
  assert.equal(safeContext.version, 3);
  assert.equal(safeContext.hasBlockingConflicts, true);
  assert.equal(safeContext.contradictions.length, 1);
  assert.equal(safeContext.contradictions[0].claimA, 'Higher conversion on single page');
  assert.equal(typeof safeContext.internalApiSecret, 'undefined', 'Internal secrets must be excluded');
});

test('PERSISTENCE & IDEMPOTENCY: Switch room association is idempotent', () => {
  const tmpDbPath = path.join(os.tmpdir(), `test_switch_room_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  const testDb = new PMPilotDatabase(tmpDbPath);

  try {
    const workspaceId = 'ws_test_switch';
    const decisionId = 'dec_room_test_1';

    // Satisfy foreign key constraints
    testDb.createUser({ id: 'usr_switch_test', email: 'pm@switch.test', name: 'Switch Tester' });
    testDb.createWorkspace({ id: workspaceId, name: 'Switch Test Workspace', createdBy: 'usr_switch_test' });

    // 1. Initially no room
    const initial = testDb.getSwitchRoom(workspaceId, decisionId);
    assert.equal(initial, null);

    // 2. Save room
    const saved = testDb.saveSwitchRoom({
      workspaceId,
      decisionId,
      roomId: 'room_switch_abc123',
      roomName: 'pmpilot-room-1',
      roomUrl: 'https://app.switchagents.ai/rooms/room_switch_abc123',
      agentId: 'ag_pmpilot_assistant',
      connectionId: 'conn_uuid_1',
      status: 'ACTIVE',
      sharedContext: { summary: 'Safe briefing v1' },
      sharedAtVersion: 1
    });

    assert.equal(saved.room_id, 'room_switch_abc123');
    assert.equal(saved.decision_id, decisionId);
    assert.equal(saved.status, 'ACTIVE');

    // 3. Query again (idempotent retrieval)
    const fetched = testDb.getSwitchRoom(workspaceId, decisionId);
    assert.equal(fetched.room_id, 'room_switch_abc123');
    assert.equal(fetched.room_name, 'pmpilot-room-1');
    assert.equal(fetched.shared_at_version, 1);
    assert.deepEqual(fetched.shared_context, { summary: 'Safe briefing v1' });
  } finally {
    testDb.close();
  }
});

test('LIFECYCLE & VERSION GUARD: Applying Switch proposal mutates decision, increments version, and invalidates approval', async () => {
  // Use a fresh decision in RedisStateManager
  const decisionId = `test_dec_switch_${Date.now()}`;
  const record = createDecisionRecord({
    id: decisionId,
    title: 'Switch Integration Decision',
    workspace: 'ws_moonshot'
  });
  record.workspaceId = 'ws_moonshot';
  record.status = DECISION_STATES.RECOMMENDATION_READY;
  await RedisStateManager.saveDecision(record);

  // Approve decision at version 1
  const approvedDecision = await RedisStateManager.submitApproval(decisionId, {
    action: 'APPROVE',
    decisionVersion: 1,
    callerIdentity: { name: 'Lead PM' },
    rationale: 'Approved initial baseline'
  });
  assert.equal(approvedDecision.version, 1);
  assert.equal(approvedDecision.approvalRecord?.status, 'APPROVED');

  // Verify that downstream export is initially unlocked because decision is approved
  await assert.doesNotReject(async () => {
    await RedisStateManager.guardArtifactGeneration(decisionId);
  });

  const workspaceId = 'ws_moonshot';

  // Create a structured proposal against version 1
  const proposal = await switchService.createStructuredProposal({
    workspaceId,
    decisionId,
    roomId: 'room_test_lifecycle',
    proposalType: 'REQUIREMENT_CHANGE',
    summary: 'Adjust fraud threshold based on team Slack/Switch consensus',
    proposedChanges: {
      title: 'Switch Integration Decision [Refined]',
      hypothesis: 'Updated hypothesis with stricter fraud threshold',
      notes: 'Consensus reached in Switch collaboration room'
    },
    openQuestions: ['What is the expected chargeback rate?'],
    risksTradeoffs: ['Slightly lower instant checkout speed'],
    recommendedAction: 'Merge revised fraud threshold requirement',
    proposedBy: 'Security Lead (via Switch)'
  });

  assert.equal(proposal.decision_version, 1);
  assert.equal(proposal.status, 'PENDING');

  // Human PM merges/applies the proposal
  const applyResult = await switchService.applyProposalToDecision({
    workspaceId,
    proposalId: proposal.id,
    user: { name: 'Lead PM', email: 'pm@pmpilot.ai' }
  });

  assert.equal(applyResult.success, true);
  assert.equal(applyResult.status, 'ACCEPTED');
  assert.equal(applyResult.newDecisionVersion, 2, 'Version must increment to 2');
  assert.equal(applyResult.mergedDecisionVersion, 2, 'Merged decision version must be explicitly recorded');
  assert.equal(applyResult.approvalInvalidated, true);

  // Check persisted proposal in SQLite
  const persistedProp = db.getSwitchProposalById(proposal.id);
  assert.equal(persistedProp.status, 'ACCEPTED');
  assert.equal(persistedProp.decision_version, 1, 'Proposal source version remains 1');
  assert.equal(persistedProp.merged_decision_version, 2, 'Proposal merged_decision_version in SQLite is 2');

  // Check mutated decision in state manager
  const updatedDecision = await RedisStateManager.getSession(decisionId);
  assert.equal(updatedDecision.version, 2);
  assert.equal(updatedDecision.approvalRecord?.status, 'PENDING', 'Approval must be reset to PENDING');

  // Strict Downstream Delivery Export Protection:
  // Downstream Linear export must now be LOCKED because human approval was reset
  await assert.rejects(
    async () => {
      await RedisStateManager.guardArtifactGeneration(decisionId);
    },
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /valid human sign-off|explicit human approval/i);
      return true;
    }
  );
});

test('VERSION GUARD: Stale proposals are rejected when decision version has advanced', async () => {
  const decisionId = `test_dec_stale_${Date.now()}`;
  const record = createDecisionRecord({
    id: decisionId,
    title: 'Stale Guard Decision',
    workspace: 'ws_moonshot'
  });
  record.workspaceId = 'ws_moonshot';
  record.status = DECISION_STATES.RECOMMENDATION_READY;
  await RedisStateManager.saveDecision(record);

  const workspaceId = 'ws_moonshot';

  // Proposal created at v1
  const proposalV1 = await switchService.createStructuredProposal({
    workspaceId,
    decisionId,
    roomId: 'room_test_stale',
    summary: 'Proposal based on v1 context',
    proposedBy: 'Analyst (via Switch)'
  });
  assert.equal(proposalV1.decision_version, 1);

  // Meanwhile, the decision is modified/reopened by another PM, bumping version to v2
  await RedisStateManager.reopenDecision(decisionId, 'Another PM');
  const advancedDecision = await RedisStateManager.getSession(decisionId);
  assert.equal(advancedDecision.version, 2);

  // Attempting to apply proposalV1 now MUST fail as STALE
  await assert.rejects(
    async () => {
      await switchService.applyProposalToDecision({
        workspaceId,
        proposalId: proposalV1.id,
        user: { name: 'Lead PM' }
      });
    },
    (err) => {
      assert.match(err.message, /Proposal is stale: created against decision version v1, but current active version is v2/);
      return true;
    }
  );

  // Verify status was updated to STALE
  const proposals = switchService.getProposalsForDecision(workspaceId, decisionId);
  const updatedProposal = proposals.find(p => p.id === proposalV1.id);
  assert.equal(updatedProposal.status, 'STALE');
});

test('ROOM VERSION SYNC: Room context auto-synchronizes to current canonical decision version', async () => {
  const decisionId = `test_dec_sync_${Date.now()}`;
  const workspaceId = 'ws_moonshot';

  const record = createDecisionRecord({
    id: decisionId,
    title: 'Version Sync Decision',
    workspace: workspaceId
  });
  record.workspaceId = workspaceId;
  record.status = DECISION_STATES.RECOMMENDATION_READY;
  await RedisStateManager.saveDecision(record);

  // 1. Create room for v1
  const initialRoom = await switchService.getOrCreateRoomForDecision({
    workspaceId,
    decisionId,
    userId: 'usr_pm'
  });
  assert.equal(initialRoom.shared_at_version, 1);

  // 2. Canonical decision is mutated to version 2
  await RedisStateManager.reopenDecision(decisionId, 'PM Team Revision');
  const mutated = await RedisStateManager.getRawDecision(decisionId);
  assert.equal(mutated.version, 2);

  // 3. getRoomForDecision detects version advance and updates room record in SQLite
  const syncedRoom = await switchService.getRoomForDecision(workspaceId, decisionId);
  assert.equal(syncedRoom.shared_at_version, 2);
  assert.equal(syncedRoom.shared_context.version, 2);
});

test('MESSAGES: Room messages persist in SQLite and truthfully record simulation flag', async () => {
  const decisionId = `test_dec_msg_${Date.now()}`;
  const workspaceId = 'ws_moonshot';

  // 1. Initial message retrieval seeds simulation thread with honest flags
  const initialMessages = switchService.getMessagesForDecision({
    workspaceId,
    decisionId,
    roomId: 'sw_room_test_msg'
  });
  assert.ok(initialMessages.length >= 3);
  assert.equal(initialMessages[0].is_simulated, true, 'Seeded messages must be flagged as simulated');

  // 2. Post a message while unconfigured: must be persisted in SQLite with is_simulated: true
  const postResult = await switchService.postMessageToRoom({
    workspaceId,
    decisionId,
    roomId: 'sw_room_test_msg',
    content: 'Evaluating checkout friction',
    sender: 'Lead PM',
    role: 'USER'
  });

  assert.equal(postResult.success, true);
  assert.equal(postResult.isSimulated, true);
  assert.equal(postResult.delivered, false);
  assert.ok(postResult.reason.includes('SWITCH_AGENT_API_KEY is not configured'));

  // 3. Confirm both user message and assistant reply are recorded in SQLite
  const updatedMessages = switchService.getMessagesForDecision({
    workspaceId,
    decisionId,
    roomId: 'sw_room_test_msg'
  });
  const userMsg = updatedMessages.find(m => m.content === 'Evaluating checkout friction');
  assert.ok(userMsg);
  assert.equal(userMsg.is_simulated, true);
  assert.equal(userMsg.sender, 'Lead PM');
});

test('PROPOSAL VERSION TRACKING: Explicitly distinguishes proposal source version, merged version, and active version', async () => {
  const decisionId = `test_dec_ver_tracking_${Date.now()}`;
  const workspaceId = 'ws_moonshot';

  const record = createDecisionRecord({
    id: decisionId,
    title: 'Version Distinction Test Decision',
    workspace: workspaceId
  });
  record.workspaceId = workspaceId;
  record.status = DECISION_STATES.RECOMMENDATION_READY;
  await RedisStateManager.saveDecision(record);

  // 1. Initial State: Decision is at version 1
  const initial = await RedisStateManager.getSession(decisionId);
  assert.equal(initial.version, 1);

  // 2. Draft Proposal A against version 1 (Source: v1)
  const propA = await switchService.createStructuredProposal({
    workspaceId,
    decisionId,
    roomId: 'sw_room_ver_test',
    proposalType: 'REQUIREMENT_CHANGE',
    summary: 'Proposal A authored against v1',
    proposedChanges: { title: 'Version Distinction Test Decision (v2)' },
    proposedBy: 'Data PM'
  });
  assert.equal(propA.decision_version, 1, 'Proposal A source version must be 1');
  assert.equal(propA.status, 'PENDING');

  // 3. Apply Proposal A: bumps canonical decision to version 2, invalidates approval, sets merged_decision_version = 2
  const applyA = await switchService.applyProposalToDecision({
    workspaceId,
    proposalId: propA.id,
    user: { name: 'Lead PM' }
  });
  assert.equal(applyA.success, true);
  assert.equal(applyA.status, 'ACCEPTED');
  assert.equal(applyA.newDecisionVersion, 2);
  assert.equal(applyA.mergedDecisionVersion, 2);

  const storedA = db.getSwitchProposalById(propA.id);
  assert.equal(storedA.status, 'ACCEPTED');
  assert.equal(storedA.decision_version, 1, 'Source version stays 1');
  assert.equal(storedA.merged_decision_version, 2, 'Merged version is recorded as 2');

  // 4. Human PM reviews and approves decision at version 2 -> Linear export unlocked
  const approvedV2 = await RedisStateManager.submitApproval(decisionId, {
    action: 'APPROVE',
    decisionVersion: 2,
    callerIdentity: { name: 'Lead PM' },
    rationale: 'Approved v2 with Proposal A integrated'
  });
  assert.equal(approvedV2.version, 2);
  assert.equal(approvedV2.approvalRecord?.status, 'APPROVED');
  assert.equal(approvedV2.approvalRecord?.approvedDecisionVersion, 2);

  // 5. Draft Proposal B against version 2 (Source: v2)
  const propB = await switchService.createStructuredProposal({
    workspaceId,
    decisionId,
    roomId: 'sw_room_ver_test',
    proposalType: 'REQUIREMENT_CHANGE',
    summary: 'Proposal B authored against v2',
    proposedChanges: { title: 'Version Distinction Test Decision (v3)' },
    proposedBy: 'Security Lead'
  });
  assert.equal(propB.decision_version, 2, 'Proposal B source version must be 2');

  // 6. An external change (e.g. contradiction resolution or scope revision) advances decision to version 3
  await RedisStateManager.reopenDecision(decisionId, 'External PM team revision');
  const sessionV3 = await RedisStateManager.getSession(decisionId);
  assert.equal(sessionV3.version, 3);
  assert.equal(sessionV3.approvalRecord?.status, 'PENDING', 'Approval must be invalidated at v3');

  // 7. Applying Proposal B now MUST be rejected as STALE
  await assert.rejects(
    async () => {
      await switchService.applyProposalToDecision({
        workspaceId,
        proposalId: propB.id,
        user: { name: 'Lead PM' }
      });
    },
    (err) => {
      assert.match(err.message, /Proposal is stale: created against decision version v2, but current active version is v3/);
      return true;
    }
  );

  // 8. Confirm Proposal B is marked STALE in SQLite
  const storedB = db.getSwitchProposalById(propB.id);
  assert.equal(storedB.status, 'STALE');
  assert.equal(storedB.decision_version, 2, 'Source version stays 2');
  assert.equal(storedB.merged_decision_version, null, 'Never merged');

  // 9. Confirm Proposal A in the same workspace preserves its distinct source (1) and merged (2) versions
  // even while active decision version is now 3 (Historical merge case)
  const refreshedA = db.getSwitchProposalById(propA.id);
  assert.equal(refreshedA.decision_version, 1);
  assert.equal(refreshedA.merged_decision_version, 2);
  assert.equal(sessionV3.version, 3);
});
