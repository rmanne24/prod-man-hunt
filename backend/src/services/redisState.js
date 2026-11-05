/**
 * PMPilot Decision State & Working Memory Manager
 * 
 * Implements persistent SQLite storage + fast in-memory caching for canonical DecisionRecords.
 * Provides a backward-compatible adapter ensuring existing UI components
 * (LeftSidebar, EvidenceWorkspace, EvidenceGraph, ContradictionGate) continue working.
 */

import {
  createDecisionRecord,
  createSyntheticDemoDecision,
  createSignal
} from '../domain/decisionModel.js';

import {
  resolveConflict as smResolveConflict,
  submitHumanApproval as smSubmitHumanApproval,
  ingestSignal as smIngestSignal,
  guardArtifactGeneration as smGuardArtifactGeneration,
  markArtifactsGenerated as smMarkArtifactsGenerated,
  reopenDecision as smReopenDecision,
  applyMaterialMutation,
  StateTransitionError
} from '../domain/stateMachine.js';

import { db } from '../db/database.js';

class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const val = this.store.get(key);
    return val ? JSON.parse(val) : null;
  }

  set(key, val) {
    this.store.set(key, JSON.stringify(val));
    return true;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

const memoryStore = new MemoryStore();

// Sequential lock queue per decision to prevent concurrent mutation race conditions
const decisionLocks = new Map();

async function acquireDecisionLock(decisionId) {
  while (decisionLocks.has(decisionId)) {
    try {
      await decisionLocks.get(decisionId);
    } catch (_) {
      // Continue loop
    }
  }
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  decisionLocks.set(decisionId, promise);
  return () => {
    decisionLocks.delete(decisionId);
    release();
  };
}

/**
 * Compatibility adapter: formats a canonical DecisionRecord so that existing
 * UI components expecting legacy session properties (e.g. capturedSources) receive them seamlessly.
 */
export function adaptDecisionToSession(decision) {
  if (!decision) return null;

  // Build capturedSources from canonical signals for UI compatibility
  const capturedSources = (decision.signals || []).map((sig) => ({
    id: sig.id,
    badge: (sig.source || 'S').replace(/^\[.*?\]\s*/, '')[0].toUpperCase(),
    name: sig.source,
    type: sig.sourceType,
    status: `${sig.sourceType} · ${sig.processingStatus.toLowerCase()}`,
    url: sig.url || 'https://browser.tab/active',
    timestamp: 'Captured',
    selected: true,
    extractedContent: sig.sanitizedText || sig.rawText,
    isSyntheticDemo: sig.isSyntheticDemo
  }));

  return {
    ...decision,
    sessionId: decision.id,
    workspaceId: decision.workspaceId || 'ws_moonshot',
    capturedSources,
    // Ensure hero banner exists for UI
    hero: {
      tag: 'EVIDENCE-BACKED PRODUCT DECISION AGENT',
      title: decision.title,
      subtitle: decision.problemStatement?.underlyingProblem || 'Every recommendation carries evidence, uncertainty, and an executable next step.'
    },
    copilotMessages: [
      {
        id: 'msg_status',
        sender: 'agent',
        title: 'Associate Product Manager',
        text: `Active decision state: ${decision.status} (Version ${decision.version}). Approval status: ${decision.approvalRecord?.status || 'PENDING'}.`,
        timestamp: 'Just now'
      }
    ]
  };
}

// Initialize seed synthetic demo decision
function initializeSeed() {
  const shouldSeed = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_SEED === 'true';
  if (!shouldSeed) {
    return;
  }
  const existing = db.getDecision('session_moonshot_checkout');
  if (existing) {
    memoryStore.set('session_moonshot_checkout', existing);
  } else {
    const seed = createSyntheticDemoDecision();
    seed.workspaceId = 'ws_moonshot';
    db.saveDecision(seed.id, 'ws_moonshot', seed.version, seed.status, seed);
    memoryStore.set(seed.id, seed);
  }
}
initializeSeed();

export const RedisStateManager = {
  /**
   * Resets memory to default synthetic seed (useful for testing)
   */
  resetToSeed() {
    memoryStore.clear();
    const seed = createSyntheticDemoDecision();
    seed.workspaceId = 'ws_moonshot';
    db.saveDecision(seed.id, 'ws_moonshot', seed.version, seed.status, seed);
    memoryStore.set(seed.id, seed);
  },

  /**
   * Dynamically creates a new decision for a workspace
   */
  async createDecision({ workspaceId, title, productArea, problemStatement, hypothesis, createdBy }) {
    const decision = createDecisionRecord({
      workspace: workspaceId,
      title: title || 'Untitled Decision',
      productArea: productArea || 'Core Product',
      problemStatement: typeof problemStatement === 'string'
        ? { underlyingProblem: problemStatement }
        : (problemStatement || {})
    });
    if (hypothesis) {
      decision.hypothesis = hypothesis;
    }
    decision.workspaceId = workspaceId;
    decision.createdBy = createdBy || 'User';

    memoryStore.set(decision.id, decision);
    db.saveDecision(decision.id, workspaceId, decision.version, decision.status, decision);

    return adaptDecisionToSession(decision);
  },

  /**
   * Lists decision summaries for a given workspace
   */
  async listDecisions(workspaceId) {
    if (!workspaceId) return [];
    const rows = db.listDecisionsForWorkspace(workspaceId);
    return rows.map(row => {
      let data = {};
      try {
        data = JSON.parse(row.data);
      } catch (_) {}

      return {
        id: row.id,
        workspaceId: row.workspace_id,
        version: row.version,
        status: row.state,
        title: data.title || row.id,
        productArea: data.productArea || 'Core Product',
        problemStatement: data.problemStatement?.underlyingProblem || data.problemStatement?.surfaceRequest || '',
        signalsCount: data.signals?.length || 0,
        conflictsCount: data.conflicts?.filter(c => c.status === 'OPEN')?.length || 0,
        approvalStatus: data.approvalRecord?.status || 'PENDING',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  },

  /**
   * Deletes a decision
   */
  async deleteDecision(decisionId, workspaceId) {
    memoryStore.delete(decisionId);
    return db.deleteDecision(decisionId, workspaceId);
  },

  /**
   * Retrieves a decision record by ID, formatted with compatibility adapter
   */
  async getSession(decisionId = 'session_moonshot_checkout') {
    let decision = memoryStore.get(decisionId);
    if (!decision) {
      decision = db.getDecision(decisionId);
      if (decision) {
        memoryStore.set(decisionId, decision);
      } else if (decisionId === 'session_moonshot_checkout') {
        const seed = createSyntheticDemoDecision();
        seed.workspaceId = 'ws_moonshot';
        db.saveDecision(seed.id, 'ws_moonshot', seed.version, seed.status, seed);
        memoryStore.set(decisionId, seed);
        decision = seed;
      } else {
        return null;
      }
    }
    return adaptDecisionToSession(decision);
  },

  /**
   * Retrieves raw canonical decision record
   */
  async getRawDecision(decisionId = 'session_moonshot_checkout') {
    let decision = memoryStore.get(decisionId);
    if (!decision) {
      decision = db.getDecision(decisionId);
      if (decision) {
        memoryStore.set(decisionId, decision);
      } else if (decisionId === 'session_moonshot_checkout') {
        decision = createSyntheticDemoDecision();
        decision.workspaceId = 'ws_moonshot';
        db.saveDecision(decision.id, 'ws_moonshot', decision.version, decision.status, decision);
        memoryStore.set(decisionId, decision);
      }
    }
    return decision;
  },

  /**
   * Saves a canonical decision record with optional optimistic CAS version checking
   */
  async saveDecision(decision, expectedPriorVersion = null) {
    if (expectedPriorVersion !== null && expectedPriorVersion !== undefined) {
      const current = memoryStore.get(decision.id) || db.getDecision(decision.id);
      if (current && current.version !== expectedPriorVersion) {
        throw new StateTransitionError(
          `Concurrency conflict: Decision was modified by another operation (current v${current.version}, expected v${expectedPriorVersion}).`,
          409
        );
      }
    }
    decision.updatedAt = new Date().toISOString();
    if (!decision.workspaceId) decision.workspaceId = 'ws_moonshot';

    memoryStore.set(decision.id, decision);
    db.saveDecision(decision.id, decision.workspaceId, decision.version, decision.status, decision);
    return adaptDecisionToSession(decision);
  },

  /**
   * Generic mutation updater wrapped with decision lock
   */
  async updateSession(decisionId, updater) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      const updated = typeof updater === 'function' ? updater(decision) : { ...decision, ...updater };
      await this.saveDecision(updated);
      return adaptDecisionToSession(updated);
    } finally {
      release();
    }
  },

  /**
   * Ingests a new Signal through the state transition layer
   */
  async ingestSignal(decisionId, signalData) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      const signal = createSignal(signalData);
      smIngestSignal(decision, signal);

      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  },

  /**
   * Resolves a contradiction through the centralized state machine
   */
  async resolveConflict(decisionId, conflictId, resolutionChoiceId, callerIdentity, resolutionNotes, expectedVersion = null) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      smResolveConflict(decision, conflictId, resolutionChoiceId, callerIdentity, resolutionNotes, expectedVersion);

      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  },

  /**
   * Reopens a decision for review through the state machine (increments version and resets approval)
   */
  async reopenDecision(decisionId, reason, callerIdentity) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      smReopenDecision(decision, reason, callerIdentity);

      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  },

  /**
   * Submits a version-bound human approval action (APPROVE, REJECT, REQUEST_REVISION)
   */
  async submitApproval(decisionId, { action, decisionVersion, callerIdentity, rationale, conditions }) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      smSubmitHumanApproval(decision, {
        action,
        decisionVersion,
        callerIdentity,
        rationale,
        conditions
      });

      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  },

  /**
   * Checks if artifacts can be generated for this decision
   */
  async guardArtifactGeneration(decisionId) {
    const decision = await this.getRawDecision(decisionId);
    if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

    return smGuardArtifactGeneration(decision);
  },

  /**
   * Marks artifacts generated after validation
   */
  async markArtifactsGenerated(decisionId, artifacts, expectedVersion = null) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      smMarkArtifactsGenerated(decision, artifacts, expectedVersion);
      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  },

  /**
   * Legacy UI action: shrink to MVP (mutates scope and updates version)
   */
  async shrinkToMVP(decisionId) {
    const release = await acquireDecisionLock(decisionId);
    try {
      const decision = await this.getRawDecision(decisionId);
      if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

      applyMaterialMutation(decision, 'Shrunk scope to 2-week lean MVP', (d) => {
        d.decisionMemory.unshift({
          id: `mem_${Date.now()}`,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          title: 'Scoped to 2-Week Lean MVP',
          summary: 'Deferred 5-product matrix and BNPL. Shipped guest checkout + 3-product tray.',
          author: 'Associate PM · Scope Arbiter',
          status: 'ACTIVE'
        });
        d.problemStatement.surfaceRequest = 'Scoped to 2-week MVP: 3-product tray only.';
      });

      await this.saveDecision(decision);
      return adaptDecisionToSession(decision);
    } finally {
      release();
    }
  }
};
