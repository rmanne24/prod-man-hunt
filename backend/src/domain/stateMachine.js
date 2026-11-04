/**
 * PMPilot State Machine & Centralized Transition Layer
 * 
 * Enforces strict transition guards, optimistic version-locking,
 * version-bound approvals, and stale approval invalidation.
 */

import { DECISION_STATES, APPROVAL_ACTIONS } from './decisionModel.js';

/**
 * Custom Error for State Machine Violations
 */
export class StateTransitionError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.name = 'StateTransitionError';
    this.statusCode = statusCode;
  }
}

/**
 * Extracts actor identity from request or payload.
 * [DEMO-ONLY AUTH LIMITATION]
 * No external identity provider is currently implemented in this repository.
 * User-supplied identities are explicitly treated as untrusted demo labels.
 */
export function extractCallerIdentity(caller = {}) {
  const actorName = typeof caller === 'string' ? caller : caller?.name || caller?.decidedBy || 'Demo PM User';
  const role = caller?.role || 'Product Manager';

  return {
    id: caller?.id || `usr_demo_${actorName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    name: actorName,
    role,
    authMethod: 'UNVERIFIED_DEMO_CLIENT',
    isUntrustedDemoIdentity: true
  };
}

/**
 * Recalculates Decision Health metrics based on current evidence and conflicts
 */
export function recalculateDecisionHealth(decision) {
  const nodes = decision.evidenceGraph || [];
  const conflicts = decision.conflicts || [];

  const observedCount = nodes.filter((n) => n.epistemicType === 'OBSERVED').length;
  const inferredCount = nodes.filter((n) => n.epistemicType === 'INFERRED').length;
  const assumedCount = nodes.filter((n) => n.epistemicType === 'ASSUMED').length;
  const unknownCount = nodes.filter((n) => n.epistemicType === 'UNKNOWN').length;

  const openBlockingConflicts = conflicts.filter((c) => c.status === 'OPEN' && c.severity === 'BLOCKING').length;
  const openWarningConflicts = conflicts.filter((c) => c.status === 'OPEN' && c.severity === 'WARNING').length;
  const totalOpenConflicts = openBlockingConflicts + openWarningConflicts;

  let confidenceScore = 50;
  if (nodes.length > 0) {
    // Calculated from verified evidence nodes and penalizing open conflicts & assumptions
    const verifiedRatio = (observedCount * 1.0 + inferredCount * 0.75) / nodes.length;
    confidenceScore = Math.round(verifiedRatio * 100);
    if (totalOpenConflicts > 0) {
      confidenceScore = Math.max(40, confidenceScore - totalOpenConflicts * 10);
    }
    if (assumedCount > 0) {
      confidenceScore = Math.max(30, confidenceScore - assumedCount * 5);
    }
  }

  let statusText = 'Initial draft';
  if (openBlockingConflicts > 0) {
    statusText = `Blocked: ${openBlockingConflicts} blocking contradiction(s) require human resolution.`;
  } else if (decision.status === DECISION_STATES.APPROVED) {
    statusText = 'Approved: Decision green-lit by human PM. Ready for delivery generation.';
  } else if (decision.status === DECISION_STATES.AWAITING_HUMAN_APPROVAL) {
    statusText = 'Awaiting explicit human PM approval before sprint lock.';
  } else if (decision.status === DECISION_STATES.RECOMMENDATION_READY) {
    statusText = 'Recommendation formulated. Ready for dispatch to review.';
  } else if (totalOpenConflicts === 0 && nodes.length > 0) {
    statusText = 'All blocking contradictions resolved. Evidence trajectory clear.';
  }

  decision.decisionHealth = {
    confidence: Math.min(99, Math.max(10, confidenceScore)),
    conflictsCount: totalOpenConflicts,
    riskyAssumptionsCount: assumedCount,
    status: statusText,
    detail: decision.problemStatement.underlyingProblem || 'Grounded in active signals and evidence graph.',
    epistemicBreakdown: {
      observed: observedCount,
      inferred: inferredCount,
      assumed: assumedCount,
      unknown: unknownCount
    }
  };

  return decision;
}

/**
 * Checks if the decision has open blocking conflicts
 */
export function hasOpenBlockingConflicts(decision) {
  return (decision.conflicts || []).some(
    (c) => c.status === 'OPEN' && c.severity === 'BLOCKING'
  );
}

/**
 * Invalidation guard: If a decision was previously approved, any material change
 * invalidates the approval and blocks artifact generation until re-approval.
 */
function invalidateApprovalIfMaterialChange(decision, mutationReason) {
  if (
    decision.status === DECISION_STATES.APPROVED ||
    decision.approvalRecord.status === 'APPROVED'
  ) {
    const priorApprovedVersion = decision.approvalRecord.approvedDecisionVersion;
    decision.status = DECISION_STATES.NEEDS_REVISION;
    decision.approvalRecord.status = 'PENDING';
    decision.approvalRecord.approvedDecisionVersion = null;
    decision.approvalRecord.invalidationReason = `Approval invalidated: material change (${mutationReason}) occurred at version ${decision.version}. Prior approval was for version ${priorApprovedVersion}. Re-approval required.`;

    decision.activityLog.unshift({
      id: `act_${Date.now()}_invalidation`,
      timestamp: new Date().toISOString(),
      actor: 'SYSTEM',
      role: 'State Gatekeeper',
      action: 'APPROVAL_INVALIDATED',
      summary: decision.approvalRecord.invalidationReason
    });
  }
}

/**
 * Applies a material mutation to the decision, incrementing its version
 * and invalidating any prior approval.
 */
export function applyMaterialMutation(decision, mutationReason, mutationFn) {
  decision.version += 1;
  decision.updatedAt = new Date().toISOString();

  if (typeof mutationFn === 'function') {
    mutationFn(decision);
  }

  invalidateApprovalIfMaterialChange(decision, mutationReason);
  recalculateDecisionHealth(decision);

  return decision;
}

/**
 * Ingests a new Signal into the decision
 */
export function ingestSignal(decision, signal) {
  return applyMaterialMutation(decision, `Ingested signal '${signal.source}'`, (d) => {
    d.signals.push(signal);
    if (d.status === DECISION_STATES.DRAFT) {
      d.status = DECISION_STATES.TRIAGE;
    }
    d.activityLog.unshift({
      id: `act_${Date.now()}_sig`,
      timestamp: new Date().toISOString(),
      actor: signal.capturedBy || 'Extension User',
      role: 'Signal Collector',
      action: 'SIGNAL_INGESTED',
      summary: `Captured signal from ${signal.source} (Version ${d.version}).`
    });
  });
}

/**
 * Resolves a Contradiction (Human action)
 */
export function resolveConflict(decision, conflictId, resolutionChoiceId, callerIdentity, resolutionNotes = null, expectedVersion = null) {
  // Optimistic concurrency check
  if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== decision.version) {
    throw new StateTransitionError(
      `Stale conflict resolution rejected. Attempted to resolve against version ${expectedVersion}, but current decision version is ${decision.version}. Re-review the latest revision.`,
      409
    );
  }

  const conflict = (decision.conflicts || []).find((c) => c.id === conflictId);
  if (!conflict) {
    throw new StateTransitionError(`Contradiction '${conflictId}' not found on decision.`, 404);
  }

  // Idempotency check: if already resolved with the same resolutionChoiceId, return unchanged
  if (
    conflict.status === 'RESOLVED' &&
    conflict.chosenResolution?.resolutionChoiceId === resolutionChoiceId
  ) {
    return decision;
  }

  const choice = conflict.suggestedResolutions?.find((r) => r.id === resolutionChoiceId);
  const choiceLabel = choice ? choice.label : resolutionChoiceId;

  const actor = extractCallerIdentity(callerIdentity);

  return applyMaterialMutation(decision, `Resolved conflict '${conflict.title}' with '${choiceLabel}'`, (d) => {
    const targetConflict = d.conflicts.find((c) => c.id === conflictId);
    targetConflict.status = 'RESOLVED';
    targetConflict.chosenResolution = {
      resolutionChoiceId,
      choiceLabel,
      resolvedBy: actor.name,
      resolvedVia: actor.authMethod === 'UNVERIFIED_DEMO_CLIENT' ? 'DEMO_UI' : 'AUTHENTICATED_GATE',
      resolvedAt: new Date().toISOString(),
      resolvedAtVersion: d.version,
      resolutionNotes
    };

    // Log to decision memory
    d.decisionMemory.unshift({
      id: `mem_${Date.now()}`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      title: `Resolved Conflict: ${targetConflict.title}`,
      summary: `Resolution choice: ${choiceLabel} (v${d.version}). Rationale: ${resolutionNotes || 'Aligned on mobile-safe constraint.'}`,
      author: `${actor.name} (${actor.role})`,
      status: 'ACTIVE'
    });

    // Check if all blocking conflicts are cleared
    if (!hasOpenBlockingConflicts(d) && d.status === DECISION_STATES.CONFLICT_REVIEW) {
      d.status = DECISION_STATES.RECOMMENDATION_READY;
    }
  });
}

/**
 * Submits Human Decision Approval, Rejection, or Revision Request
 * Strictly version-bound: requires matching decisionVersion.
 */
export function submitHumanApproval(decision, {
  action,
  decisionVersion,
  callerIdentity,
  rationale = null,
  conditions = []
}) {
  // 1. Validate action enum
  if (!Object.values(APPROVAL_ACTIONS).includes(action)) {
    throw new StateTransitionError(
      `Invalid approval action '${action}'. Must be one of: ${Object.values(APPROVAL_ACTIONS).join(', ')}.`,
      400
    );
  }

  // 2. Validate version-lock (Optimistic concurrency control)
  if (decisionVersion !== decision.version) {
    throw new StateTransitionError(
      `Stale version approval rejected. Attempted to ${action} version ${decisionVersion}, but current decision version is ${decision.version}. Re-review the latest revision before deciding.`,
      409
    );
  }

  // 3. Guard against unresolved blocking conflicts
  if (action === APPROVAL_ACTIONS.APPROVE && hasOpenBlockingConflicts(decision)) {
    throw new StateTransitionError(
      'Cannot APPROVE decision while blocking contradictions remain OPEN. Resolve all blocking conflicts first.',
      409
    );
  }

  // 4. Validate lifecycle precondition: Can only approve if recommendation is ready or awaiting approval
  const approvableStates = [
    DECISION_STATES.RECOMMENDATION_READY,
    DECISION_STATES.AWAITING_HUMAN_APPROVAL,
    DECISION_STATES.NEEDS_REVISION
  ];

  // Idempotency check: if already in target state at this version with identical action, return cleanly
  if (
    action === APPROVAL_ACTIONS.APPROVE &&
    decision.status === DECISION_STATES.APPROVED &&
    decision.approvalRecord.status === 'APPROVED' &&
    decision.approvalRecord.approvedDecisionVersion === decision.version
  ) {
    return decision;
  }
  if (
    action === APPROVAL_ACTIONS.REJECT &&
    decision.status === DECISION_STATES.REJECTED &&
    decision.approvalRecord.status === 'REJECTED'
  ) {
    return decision;
  }
  if (
    action === APPROVAL_ACTIONS.REQUEST_REVISION &&
    decision.status === DECISION_STATES.NEEDS_REVISION &&
    decision.approvalRecord.status === 'REVISION_REQUESTED'
  ) {
    return decision;
  }

  if (
    !approvableStates.includes(decision.status) &&
    decision.status !== DECISION_STATES.APPROVED &&
    decision.status !== DECISION_STATES.ARTIFACT_GENERATED
  ) {
    throw new StateTransitionError(
      `Cannot ${action} decision in state '${decision.status}'. Decision must be in RECOMMENDATION_READY, AWAITING_HUMAN_APPROVAL, or NEEDS_REVISION.`,
      409
    );
  }

  const actor = extractCallerIdentity(callerIdentity);
  const now = new Date().toISOString();

  // Apply state transition
  if (action === APPROVAL_ACTIONS.APPROVE) {
    decision.status = DECISION_STATES.APPROVED;
    decision.approvalRecord = {
      status: 'APPROVED',
      approvedDecisionVersion: decision.version,
      decidedBy: actor.name,
      decidedVia: 'HUMAN_APPROVAL_GATE',
      decidedAt: now,
      authMethod: actor.authMethod,
      isUntrustedDemoIdentity: actor.isUntrustedDemoIdentity,
      rationale: rationale || 'Recommendation verified and approved by PM.',
      conditions: Array.isArray(conditions) ? conditions : [],
      invalidationReason: null
    };

    decision.activityLog.unshift({
      id: `act_${Date.now()}_approve`,
      timestamp: now,
      actor: actor.name,
      role: actor.role,
      action: 'DECISION_APPROVED',
      summary: `Approved decision version ${decision.version}. Delivery generation unlocked.`
    });
  } else if (action === APPROVAL_ACTIONS.REJECT) {
    decision.status = DECISION_STATES.REJECTED;
    decision.approvalRecord = {
      status: 'REJECTED',
      approvedDecisionVersion: null,
      decidedBy: actor.name,
      decidedVia: 'HUMAN_APPROVAL_GATE',
      decidedAt: now,
      authMethod: actor.authMethod,
      isUntrustedDemoIdentity: actor.isUntrustedDemoIdentity,
      rationale: rationale || 'Decision rejected by PM.',
      conditions: [],
      invalidationReason: null
    };

    decision.activityLog.unshift({
      id: `act_${Date.now()}_reject`,
      timestamp: now,
      actor: actor.name,
      role: actor.role,
      action: 'DECISION_REJECTED',
      summary: `Rejected decision version ${decision.version}. Rationale: ${rationale || 'None provided'}.`
    });
  } else if (action === APPROVAL_ACTIONS.REQUEST_REVISION) {
    decision.status = DECISION_STATES.NEEDS_REVISION;
    decision.approvalRecord = {
      status: 'REVISION_REQUESTED',
      approvedDecisionVersion: null,
      decidedBy: actor.name,
      decidedVia: 'HUMAN_APPROVAL_GATE',
      decidedAt: now,
      authMethod: actor.authMethod,
      isUntrustedDemoIdentity: actor.isUntrustedDemoIdentity,
      rationale: rationale || 'PM requested scope revision.',
      conditions: Array.isArray(conditions) ? conditions : [],
      invalidationReason: null
    };

    decision.activityLog.unshift({
      id: `act_${Date.now()}_revision`,
      timestamp: now,
      actor: actor.name,
      role: actor.role,
      action: 'REVISION_REQUESTED',
      summary: `Revisions requested on version ${decision.version}. Notes: ${rationale || 'None provided'}.`
    });
  }

  decision.updatedAt = now;
  recalculateDecisionHealth(decision);

  return decision;
}

/**
 * Reopens a Decision for collaborative review (Human or PM Action)
 * Material mutation: increments version and invalidates prior approval.
 */
export function reopenDecision(decision, reason, callerIdentity) {
  const actor = extractCallerIdentity(callerIdentity);
  const reopenReason = reason || 'Reopened decision for collaborative review';

  return applyMaterialMutation(decision, reopenReason, (d) => {
    d.status = DECISION_STATES.NEEDS_REVISION;
    d.decisionMemory.unshift({
      id: `mem_${Date.now()}`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      title: 'Reopened Decision for Review',
      summary: reopenReason,
      author: `${actor.name} (${actor.role})`,
      status: 'REOPENED'
    });
  });
}

/**
 * Guard for Generating Delivery Artifacts
 * Enforces the strict rule: ARTIFACT GENERATION IS REJECTED UNLESS APPROVED.
 * Safe and idempotent: allows re-generating or querying artifacts if already in ARTIFACT_GENERATED.
 */
export function guardArtifactGeneration(decision) {
  const allowedStates = [DECISION_STATES.APPROVED, DECISION_STATES.ARTIFACT_GENERATED];
  if (!allowedStates.includes(decision.status)) {
    throw new StateTransitionError(
      `Artifact generation blocked: Decision is in '${decision.status}' state. Only decisions in 'APPROVED' state with valid human sign-off can generate delivery artifacts.`,
      403
    );
  }

  if (
    decision.approvalRecord.status !== 'APPROVED' ||
    decision.approvalRecord.approvedDecisionVersion !== decision.version
  ) {
    throw new StateTransitionError(
      `Artifact generation blocked: Approval is stale or missing. Current version is ${decision.version}, but approved version is ${decision.approvalRecord.approvedDecisionVersion}. Re-approval required before artifact generation.`,
      403
    );
  }

  return true;
}

/**
 * Transitions the decision to ARTIFACT_GENERATED state
 */
export function markArtifactsGenerated(decision, artifactsPayload, expectedVersion = null) {
  if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== decision.version) {
    throw new StateTransitionError(
      `Artifact generation rejected: decision has advanced to version ${decision.version}, but artifacts were generated for version ${expectedVersion}.`,
      409
    );
  }
  guardArtifactGeneration(decision);

  decision.status = DECISION_STATES.ARTIFACT_GENERATED;
  decision.artifacts = {
    prd: artifactsPayload.prd || decision.artifacts.prd,
    userStories: artifactsPayload.userStories || decision.artifacts.userStories,
    linearTickets: artifactsPayload.linearTickets || decision.artifacts.linearTickets,
    validationPlan: artifactsPayload.validationPlan || decision.artifacts.validationPlan
  };

  decision.activityLog.unshift({
    id: `act_${Date.now()}_artifacts`,
    timestamp: new Date().toISOString(),
    actor: 'SYSTEM',
    role: 'Delivery Agent',
    action: 'ARTIFACTS_GENERATED',
    summary: `Synthesized delivery artifacts for approved decision version ${decision.version}.`
  });

  decision.updatedAt = new Date().toISOString();
  return decision;
}
