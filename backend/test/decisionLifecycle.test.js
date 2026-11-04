import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDecisionRecord,
  createSignal,
  createEvidenceNode,
  createContradiction,
  createSyntheticDemoDecision,
  DECISION_STATES,
  EPISTEMIC_TYPES,
  APPROVAL_ACTIONS
} from '../src/domain/decisionModel.js';

import {
  resolveConflict,
  submitHumanApproval,
  guardArtifactGeneration,
  markArtifactsGenerated,
  ingestSignal,
  applyMaterialMutation,
  reopenDecision,
  hasOpenBlockingConflicts,
  recalculateDecisionHealth,
  StateTransitionError
} from '../src/domain/stateMachine.js';

import { RedisStateManager } from '../src/services/redisState.js';

test('1. Synthetic demo fixtures are explicitly tagged as synthetic demo data', () => {
  const demoDecision = createSyntheticDemoDecision();

  assert.strictEqual(demoDecision.signals[0].isSyntheticDemo, true);
  assert.strictEqual(demoDecision.signals[0].verificationStatus, 'SYNTHETIC_FIXTURE');
  assert.match(demoDecision.signals[0].source, /\[SYNTHETIC DEMO\]/);

  assert.strictEqual(demoDecision.evidenceGraph[0].isSyntheticDemo, true);
  assert.strictEqual(demoDecision.evidenceGraph[0].verificationStatus, 'SYNTHETIC_FIXTURE');
  assert.match(demoDecision.evidenceGraph[0].provenance, /\[SYNTHETIC DEMO FIXTURE\]/);

  assert.strictEqual(demoDecision.conflicts[0].isSyntheticDemo, true);
  assert.match(demoDecision.conflicts[0].title, /\[SYNTHETIC DEMO\]/);
});

test('2. Multi-source evidence stores separate verbatim excerpts per source without fabricating quotes', () => {
  const multiSourceEvidence = createEvidenceNode({
    id: 'ev_multisource_test',
    label: 'Checkout friction bottleneck',
    epistemicType: EPISTEMIC_TYPES.INFERRED,
    confidenceRating: 82,
    sources: [
      {
        sourceSignalId: 'sig_1',
        sourceLabel: 'Linear Ticket ENG-142',
        verbatimExcerpt: 'Drop-off at login modal is 68%.'
      },
      {
        sourceSignalId: 'sig_2',
        sourceLabel: 'Notion PRD Section 4',
        verbatimExcerpt: 'Shoppers must be able to complete purchase without password creation.'
      }
    ]
  });

  assert.strictEqual(multiSourceEvidence.sources.length, 2);
  assert.strictEqual(multiSourceEvidence.sources[0].verbatimExcerpt, 'Drop-off at login modal is 68%.');
  assert.strictEqual(multiSourceEvidence.sources[1].verbatimExcerpt, 'Shoppers must be able to complete purchase without password creation.');
  assert.notStrictEqual(multiSourceEvidence.sources[0].verbatimExcerpt, multiSourceEvidence.sources[1].verbatimExcerpt);
});

test('3. Epistemic classification is decoupled from confidence rating', () => {
  const nodeA = createEvidenceNode({
    label: 'Observed with low sample size',
    epistemicType: EPISTEMIC_TYPES.OBSERVED,
    confidenceRating: 40
  });

  const nodeB = createEvidenceNode({
    label: 'Inferred with multi-source verified data',
    epistemicType: EPISTEMIC_TYPES.INFERRED,
    confidenceRating: 92
  });

  assert.strictEqual(nodeA.epistemicType, 'OBSERVED');
  assert.strictEqual(nodeA.confidenceRating, 40);

  assert.strictEqual(nodeB.epistemicType, 'INFERRED');
  assert.strictEqual(nodeB.confidenceRating, 92);
});

test('4. Artifact generation is BLOCKED on unapproved decisions (server-side guard)', () => {
  const decision = createSyntheticDemoDecision();
  assert.strictEqual(decision.status, DECISION_STATES.CONFLICT_REVIEW);

  assert.throws(
    () => guardArtifactGeneration(decision),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 403);
      assert.match(err.message, /Artifact generation blocked/);
      return true;
    }
  );
});

test('5. Approval is BLOCKED while blocking conflicts remain OPEN', () => {
  const decision = createSyntheticDemoDecision();
  assert.strictEqual(hasOpenBlockingConflicts(decision), true);

  assert.throws(
    () => submitHumanApproval(decision, {
      action: APPROVAL_ACTIONS.APPROVE,
      decisionVersion: decision.version,
      callerIdentity: 'Lead PM'
    }),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /blocking contradictions remain OPEN/);
      return true;
    }
  );
});

test('6. Resolving blocking conflict unblocks approval', () => {
  const decision = createSyntheticDemoDecision();
  assert.strictEqual(decision.version, 1);

  // Resolve conflict
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM', 'Mobile-safe pattern agreed.');
  assert.strictEqual(decision.version, 2);
  assert.strictEqual(hasOpenBlockingConflicts(decision), false);
  assert.strictEqual(decision.status, DECISION_STATES.RECOMMENDATION_READY);

  // Now approval should succeed at current version
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 2,
    callerIdentity: 'Lead PM',
    rationale: 'Approved for 2-week MVP.'
  });

  assert.strictEqual(decision.status, DECISION_STATES.APPROVED);
  assert.strictEqual(decision.approvalRecord.status, 'APPROVED');
  assert.strictEqual(decision.approvalRecord.approvedDecisionVersion, 2);

  // Artifact generation is now permitted
  assert.doesNotThrow(() => guardArtifactGeneration(decision));
  markArtifactsGenerated(decision, {
    prd: { title: 'PRD v1.0', version: '1.0.0' }
  });
  assert.strictEqual(decision.status, DECISION_STATES.ARTIFACT_GENERATED);
});

test('7. Stale approval invalidation: mutating approved decision invalidates approval and blocks artifacts', () => {
  const decision = createSyntheticDemoDecision();

  // 1. Resolve conflict & approve version 2
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 2,
    callerIdentity: 'Lead PM'
  });
  assert.strictEqual(decision.status, DECISION_STATES.APPROVED);

  // 2. Material mutation: New signal is ingested (e.g. from browser extension)
  const newSignal = createSignal({
    source: 'Competitor Benchmark',
    sourceType: 'COMPETITOR_WEB',
    rawText: 'Competitor launched new checkout feature.'
  });
  ingestSignal(decision, newSignal);

  // Version must increment to 3
  assert.strictEqual(decision.version, 3);

  // Approval must be invalidated!
  assert.strictEqual(decision.status, DECISION_STATES.NEEDS_REVISION);
  assert.strictEqual(decision.approvalRecord.status, 'PENDING');
  assert.strictEqual(decision.approvalRecord.approvedDecisionVersion, null);
  assert.match(decision.approvalRecord.invalidationReason, /Approval invalidated: material change/);

  // Artifact generation MUST be blocked again!
  assert.throws(
    () => guardArtifactGeneration(decision),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 403);
      assert.match(err.message, /Artifact generation blocked/);
      return true;
    }
  );

  // 3. Re-approving version 3 restores valid approval
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 3,
    callerIdentity: 'Lead PM'
  });
  assert.strictEqual(decision.status, DECISION_STATES.APPROVED);
  assert.strictEqual(decision.approvalRecord.approvedDecisionVersion, 3);
  assert.doesNotThrow(() => guardArtifactGeneration(decision));
});

test('8. Version mismatch rejection: approving outdated version throws 409', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  assert.strictEqual(decision.version, 2);

  // Try to approve version 1 (outdated)
  assert.throws(
    () => submitHumanApproval(decision, {
      action: APPROVAL_ACTIONS.APPROVE,
      decisionVersion: 1, // Stale!
      callerIdentity: 'Lead PM'
    }),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /Stale version approval rejected/);
      return true;
    }
  );
});

test('9. Approval action standardization: REJECT and REQUEST_REVISION work deterministically', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  assert.strictEqual(decision.version, 2);

  // Test REQUEST_REVISION
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.REQUEST_REVISION,
    decisionVersion: 2,
    callerIdentity: 'Lead PM',
    rationale: 'Scope too broad. Cut Klarna BNPL.'
  });
  assert.strictEqual(decision.status, DECISION_STATES.NEEDS_REVISION);
  assert.strictEqual(decision.approvalRecord.status, 'REVISION_REQUESTED');

  // Test REJECT
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.REJECT,
    decisionVersion: 2,
    callerIdentity: 'Executive Sponsor',
    rationale: 'Project cancelled in favor of enterprise SSO.'
  });
  assert.strictEqual(decision.status, DECISION_STATES.REJECTED);
  assert.strictEqual(decision.approvalRecord.status, 'REJECTED');
});

test('10. Idempotency: duplicate conflict resolution returns unchanged decision', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  assert.strictEqual(decision.version, 2);

  // Repeat same resolution with same choice
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  // Version must not increment
  assert.strictEqual(decision.version, 2);
});

test('11. RedisStateManager compatibility adapter preserves legacy UI fields', async () => {
  RedisStateManager.resetToSeed();
  const session = await RedisStateManager.getSession('session_moonshot_checkout');

  assert.strictEqual(session.sessionId, 'session_moonshot_checkout');
  assert.ok(Array.isArray(session.capturedSources));
  assert.strictEqual(session.capturedSources.length, 3);
  assert.ok(Array.isArray(session.evidenceGraph));
  assert.ok(Array.isArray(session.conflicts));
  assert.ok(session.decisionHealth);
  assert.strictEqual(typeof session.decisionHealth.confidence, 'number');
  assert.ok(session.hero);
});

test('12. Regression: Duplicate REJECT and REQUEST_REVISION are safe and idempotent', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  assert.strictEqual(decision.version, 2);

  // Call REJECT once
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.REJECT,
    decisionVersion: 2,
    callerIdentity: 'Exec'
  });
  assert.strictEqual(decision.status, DECISION_STATES.REJECTED);

  // Call REJECT again with same version - must not throw and must return cleanly
  assert.doesNotThrow(() => {
    submitHumanApproval(decision, {
      action: APPROVAL_ACTIONS.REJECT,
      decisionVersion: 2,
      callerIdentity: 'Exec'
    });
  });
  assert.strictEqual(decision.status, DECISION_STATES.REJECTED);
});

test('13. Regression: Artifact generation is idempotent when already in ARTIFACT_GENERATED', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 2,
    callerIdentity: 'Lead PM'
  });

  markArtifactsGenerated(decision, { prd: { title: 'PRD v1' } });
  assert.strictEqual(decision.status, DECISION_STATES.ARTIFACT_GENERATED);

  // Re-checking or re-generating artifacts on the same approved version must not throw 403
  assert.doesNotThrow(() => guardArtifactGeneration(decision));
});

test('14. Regression: Conflict resolution rejects stale expectedVersion with 409', () => {
  const decision = createSyntheticDemoDecision();
  assert.strictEqual(decision.version, 1);

  // Client attempts to resolve conflict expecting version 99
  assert.throws(
    () => resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM', null, 99),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /Stale conflict resolution rejected/);
      return true;
    }
  );
});

test('15. Regression: reopenDecision increments version and invalidates prior approval', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 2,
    callerIdentity: 'Lead PM'
  });
  assert.strictEqual(decision.status, DECISION_STATES.APPROVED);
  assert.strictEqual(decision.version, 2);

  // Now reopen decision
  reopenDecision(decision, 'Feedback from pilot cohort requires re-evaluation', 'PM');
  assert.strictEqual(decision.version, 3);
  assert.strictEqual(decision.status, DECISION_STATES.NEEDS_REVISION);
  assert.strictEqual(decision.approvalRecord.status, 'PENDING');
  assert.strictEqual(decision.approvalRecord.approvedDecisionVersion, null);
  // Artifact generation must be blocked
  assert.throws(() => guardArtifactGeneration(decision));
});

test('16. Evidence integrity: Resolving conflict preserves claimA & claimB and records resolvedAtVersion', () => {
  const decision = createSyntheticDemoDecision();
  const originalClaimA = { ...decision.conflicts[0].claimA };
  const originalClaimB = { ...decision.conflicts[0].claimB };

  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM', 'Mobile UX safety');

  const resolvedConflict = decision.conflicts[0];
  assert.strictEqual(resolvedConflict.status, 'RESOLVED');
  // Conflicting claims must NOT be deleted or mutated
  assert.deepStrictEqual(resolvedConflict.claimA, originalClaimA);
  assert.deepStrictEqual(resolvedConflict.claimB, originalClaimB);
  // Resolution record preserves chosen option, version, and resolver
  assert.strictEqual(resolvedConflict.chosenResolution.resolutionChoiceId, 'res_3');
  assert.strictEqual(resolvedConflict.chosenResolution.resolvedAtVersion, 2);
  assert.strictEqual(resolvedConflict.chosenResolution.resolvedBy, 'Lead PM');
  assert.strictEqual(resolvedConflict.chosenResolution.resolutionNotes, 'Mobile UX safety');
});

test('17. Concurrency: Two concurrent conflict resolutions with stale expectedVersion reject second client', async () => {
  RedisStateManager.resetToSeed();

  // Client A resolves conflict expecting v1 -> succeeds and bumps to v2
  await RedisStateManager.resolveConflict('session_moonshot_checkout', 'conflict_1', 'res_3', { name: 'PM A' }, null, 1);

  // Client B attempts to resolve with stale v1 -> must throw 409
  await assert.rejects(
    async () => {
      await RedisStateManager.resolveConflict('session_moonshot_checkout', 'conflict_1', 'res_5', { name: 'PM B' }, null, 1);
    },
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /Stale conflict resolution rejected/);
      return true;
    }
  );
});

test('18. Concurrency: Submitting approval while a material mutation increments version throws 409', async () => {
  RedisStateManager.resetToSeed();
  // Clear conflict to reach RECOMMENDATION_READY at v2
  await RedisStateManager.resolveConflict('session_moonshot_checkout', 'conflict_1', 'res_3', { name: 'PM A' });

  // A concurrent mutation (e.g. signal ingest or scope shrink) advances version to v3
  await RedisStateManager.shrinkToMVP('session_moonshot_checkout');

  // Client attempts to submit approval for v2 (stale!) -> must be rejected with 409
  await assert.rejects(
    async () => {
      await RedisStateManager.submitApproval('session_moonshot_checkout', {
        action: APPROVAL_ACTIONS.APPROVE,
        decisionVersion: 2,
        callerIdentity: { name: 'PM' }
      });
    },
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /Stale version approval rejected/);
      return true;
    }
  );
});

test('19. Concurrency: Async artifact generation rejects if decision version advanced beyond target version', () => {
  const decision = createSyntheticDemoDecision();
  resolveConflict(decision, 'conflict_1', 'res_3', 'Lead PM');
  submitHumanApproval(decision, {
    action: APPROVAL_ACTIONS.APPROVE,
    decisionVersion: 2,
    callerIdentity: 'Lead PM'
  });
  assert.strictEqual(decision.version, 2);

  // Decision mutates to v3
  applyMaterialMutation(decision, 'New stakeholder input', () => {});
  assert.strictEqual(decision.version, 3);

  // Attempt to mark artifacts generated for v2 must be rejected with 409
  assert.throws(
    () => markArtifactsGenerated(decision, { prd: { title: 'PRD for v2' } }, 2),
    (err) => {
      assert(err instanceof StateTransitionError);
      assert.strictEqual(err.statusCode, 409);
      assert.match(err.message, /decision has advanced to version 3, but artifacts were generated for version 2/);
      return true;
    }
  );
});

