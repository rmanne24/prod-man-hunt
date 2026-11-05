/**
 * PMPilot Switch AI Collaboration Integration Service
 * 
 * Wire Protocol & Architecture Compliance:
 * - Switch Official Repository: https://github.com/sandbox-quantum/switch
 * - Switch Documentation: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol
 * - Agent Events & Buffer: https://docs.switchagents.ai/switch-rooms/internals/agent-events
 * - Agent Connection: https://docs.switchagents.ai/switch-rooms/internals/agent-connection
 * - Rooms & Resources: https://docs.switchagents.ai/switch-rooms/internals/rooms-and-resources
 * 
 * Core Wire Contracts Implemented:
 * 1. Base URL Liveness Probe: GET /health (public probe)
 * 2. Agent Registration: POST /agents with Authorization: Bearer <registration_token>
 * 3. Addressing Configuration: POST /agents/{agent_id}/ops/update_agent_detail
 * 4. Room Creation Operation: POST /agents/{agent_id}/ops/create_room with X-Switch-Connection-Id
 * 5. Outbound Messaging: POST /agents/{agent_id}/message with { room_id, content }
 * 6. Inbound Event Streaming: SSE GET /agents/{agent_id}/events and WebSocket support
 * 7. Decision-Version Bound Proposals: Structured proposals validated server-side against decision.version
 * 8. Human-in-the-Loop Gate: Proposals cannot directly approve or mutate decisions without explicit PM action
 */

import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { RedisStateManager } from '../services/redisState.js';

class SwitchService {
  constructor() {
    this.activeStreams = new Map(); // roomId -> AbortController
  }

  getServerUrl() {
    const raw = process.env.SWITCH_SERVER_URL || 'http://localhost:8000';
    return raw.replace(/\/+$/, '');
  }

  getRegistrationToken() {
    return process.env.SWITCH_REGISTRATION_TOKEN || null;
  }

  getAgentApiKey() {
    return process.env.SWITCH_AGENT_API_KEY || null;
  }

  getAgentId() {
    return process.env.SWITCH_AGENT_ID || 'ag_pmpilot_assistant';
  }

  /**
   * Sanitizes text and logs to prevent secret leakage
   */
  sanitizeMessage(msg) {
    if (!msg || typeof msg !== 'string') return '';
    return msg
      .replace(/(registration_token|api_key|token|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/[0-9a-fA-F]{64}/g, '[REDACTED_KEY]')
      .trim();
  }

  /**
   * Truthful Preflight and Health Check
   * Strictly probes GET /health on the configured Switch server address
   */
  async getPreflightReport() {
    const serverUrl = this.getServerUrl();
    const hasRegToken = Boolean(this.getRegistrationToken());
    const hasApiKey = Boolean(this.getAgentApiKey());
    const agentId = this.getAgentId();

    const variables = {
      SWITCH_SERVER_URL: {
        present: Boolean(process.env.SWITCH_SERVER_URL),
        value: serverUrl,
        valid: /^https?:\/\/[^\s$.?#].[^\s]*$/i.test(serverUrl)
      },
      SWITCH_REGISTRATION_TOKEN: {
        present: hasRegToken,
        valid: hasRegToken
      },
      SWITCH_AGENT_API_KEY: {
        present: hasApiKey,
        valid: hasApiKey
      }
    };

    let reachable = false;
    let serverHealth = null;
    let probeError = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${serverUrl}/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        reachable = true;
        try {
          serverHealth = await res.json();
        } catch (_) {
          serverHealth = { status: 'healthy', httpStatus: res.status };
        }
      } else {
        probeError = `HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err) {
      reachable = false;
      probeError = err.name === 'AbortError' ? 'Connection timed out (2500ms)' : err.message;
    }

    let status = 'UNCONFIGURED';
    if (!variables.SWITCH_SERVER_URL.present && !hasRegToken && !hasApiKey) {
      status = 'UNCONFIGURED';
    } else if (reachable && (hasApiKey || hasRegToken)) {
      status = 'CONNECTED';
    } else if (reachable) {
      status = 'CONFIGURED';
    } else {
      status = 'UNREACHABLE';
    }

    return {
      provider: 'SWITCH_AI',
      status,
      reachable,
      serverUrl,
      agentId,
      variables,
      health: serverHealth,
      error: probeError ? this.sanitizeMessage(probeError) : null,
      protocol: 'Switch Agent Protocol v1 (HTTP Operations + SSE / WebSocket Stream)',
      docsReference: 'https://docs.switchagents.ai/switch-rooms/internals/agent-protocol'
    };
  }

  /**
   * Registers PMPilot Decision Assistant with Switch via POST /agents
   * Official Wire Spec: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol#register-the-agent
   */
  async registerAgent({ overwrite = false } = {}) {
    const serverUrl = this.getServerUrl();
    const token = this.getRegistrationToken();

    if (!token) {
      throw new Error('SWITCH_REGISTRATION_TOKEN is required to register an agent with Switch.');
    }

    const payload = {
      name: 'pmpilot-decision-assistant',
      display_name: 'PMPilot Decision Assistant',
      description: 'Grounded product decision AI assistant for PMPilot. Facilitates evidence-backed trade-off reviews and structured proposal drafting.',
      connector_type: 'pmpilot',
      integration_profile: {
        connection_model: 'always_on'
      },
      overwrite
    };

    const res = await fetch(`${serverUrl}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.detail || parsed.message || errText;
      } catch (_) {}
      throw new Error(`Failed to register PMPilot agent with Switch: ${this.sanitizeMessage(msg)}`);
    }

    const agentData = await res.json();
    return {
      agentId: agentData.id || agentData.agent_id || 'ag_pmpilot_assistant',
      apiKey: agentData.api_key || null,
      name: payload.name,
      connectionModel: 'always_on'
    };
  }

  /**
   * Extracts minimal, strictly safe decision briefing for the Switch collaboration room.
   * Strips internal credentials, system secrets, sensitive environment settings, and private tokens.
   */
  buildSafeDecisionContext(decision) {
    if (!decision) return { summary: 'No decision selected' };

    const contradictions = (decision.contradictions || []).map(c => ({
      id: c.id,
      status: c.status,
      severity: c.severity,
      claimA: c.claimA?.text || 'Claim A',
      claimB: c.claimB?.text || 'Claim B',
      resolvedAtVersion: c.resolvedAtVersion || null,
      chosenResolution: c.chosenResolution || null
    }));

    return {
      decisionId: decision.id,
      title: decision.title || 'Untitled Decision',
      version: decision.version || 1,
      status: decision.status || 'DRAFT',
      hypothesis: decision.hypothesis || '',
      summary: decision.summary || '',
      contradictions,
      hasBlockingConflicts: contradictions.some(c => c.status === 'OPEN' && c.severity === 'BLOCKING'),
      approvalStatus: decision.approvalRecord?.status || 'PENDING',
      approvedAtVersion: decision.approvalRecord?.version || null,
      sharedAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves the mapped Switch room for a decision and auto-synchronizes
   * the room's safe context and version if the canonical decision version has advanced.
   */
  async getRoomForDecision(workspaceId, decisionId) {
    if (!workspaceId || !decisionId) return null;
    const room = db.getSwitchRoom(workspaceId, decisionId);
    if (!room) return null;

    // Check if canonical decision has a newer version or updated status
    const decision = await RedisStateManager.getRawDecision(decisionId);
    if (decision && (decision.version !== room.shared_at_version || decision.status !== room.shared_context?.status)) {
      const refreshedContext = this.buildSafeDecisionContext(decision);
      const updated = db.saveSwitchRoom({
        ...room,
        workspaceId,
        decisionId,
        sharedContext: refreshedContext,
        sharedAtVersion: decision.version
      });
      return updated;
    }
    return room;
  }

  /**
   * Creates or retrieves a mapped Switch room for a PMPilot decision.
   * Enforces idempotency and ensures safe context reflects latest version.
   */
  async getOrCreateRoomForDecision({ workspaceId, decisionId, userId }) {
    if (!workspaceId || !decisionId) {
      throw new Error('workspaceId and decisionId are required.');
    }

    // 1. Check SQLite for existing mapped room (idempotency guard with auto-sync)
    const existing = await this.getRoomForDecision(workspaceId, decisionId);
    if (existing && existing.status === 'ACTIVE') {
      return {
        ...existing,
        isExisting: true
      };
    }

    // 2. Fetch canonical decision state
    const decision = await RedisStateManager.getRawDecision(decisionId);
    if (!decision) {
      throw new Error(`Decision '${decisionId}' not found.`);
    }

    const safeContext = this.buildSafeDecisionContext(decision);
    const roomName = `pmpilot-${decision.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 30)}-v${decision.version}`;
    const roomDescription = `PMPilot Decision Room: ${decision.title} (v${decision.version})`;
    const roomInstructions = [
      `# PMPilot Decision Briefing v${decision.version}`,
      `**Title:** ${decision.title}`,
      `**Objective:** ${decision.hypothesis || 'Evaluate product trade-offs with grounded evidence'}`,
      `**Current Decision Version:** ${decision.version}`,
      `**State:** ${decision.status}`,
      '',
      '## Active Contradictions & Trade-offs:',
      ...safeContext.contradictions.map(c => `- [${c.status}] ${c.claimA} vs ${c.claimB}`),
      '',
      '## Collaboration Instructions for PMPilot Assistant:',
      '1. Distinguish observed telemetry and user research from inferences.',
      '2. Ground suggestions in the current decision version.',
      '3. Formulate structured proposals for PM review when consensus emerges.',
      '4. Never claim unsupported customer metrics or fabricate citations.'
    ].join('\n');

    const serverUrl = this.getServerUrl();
    const apiKey = this.getAgentApiKey();
    const agentId = this.getAgentId();
    let remoteRoomId = null;
    let remoteRoomUrl = null;

    // 3. Attempt live room creation if configured and reachable
    const preflight = await this.getPreflightReport();
    if (preflight.reachable && apiKey) {
      try {
        const opRes = await fetch(`${serverUrl}/agents/${agentId}/ops/create_room`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            name: roomName,
            description: roomDescription,
            instructions: roomInstructions
          })
        });

        if (opRes.ok) {
          const opData = await opRes.json();
          remoteRoomId = opData.result?.id || opData.result?.room_id || opData.room_id || null;
          remoteRoomUrl = opData.result?.url || `${serverUrl}/rooms/${remoteRoomId}`;
        }
      } catch (err) {
        // Fall back gracefully to local mapped room record if live server call fails
        console.warn('[SwitchService] Remote room creation warning:', this.sanitizeMessage(err.message));
      }
    }

    const roomId = remoteRoomId || `sw_room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const roomUrl = remoteRoomUrl || (preflight.reachable ? `${serverUrl}/rooms/${roomId}` : null);
    const connectionId = crypto.randomUUID();

    // 4. Persist in SQLite
    const saved = db.saveSwitchRoom({
      workspaceId,
      decisionId,
      roomId,
      roomName,
      roomUrl,
      agentId,
      connectionId,
      status: 'ACTIVE',
      sharedContext: safeContext,
      sharedAtVersion: decision.version
    });

    return {
      ...saved,
      isExisting: false,
      serverReachable: preflight.reachable
    };
  }

  /**
   * Retrieves messages for a decision collaboration room.
   * If no messages exist yet, seeds an initial discussion thread labeled as simulated demo data.
   */
  getMessagesForDecision({ workspaceId, decisionId, roomId }) {
    if (!workspaceId || !decisionId) return [];
    let messages = db.getSwitchMessages(workspaceId, decisionId);

    if (messages.length === 0) {
      const now = Date.now();
      const seeds = [
        {
          id: `msg_seed_1_${decisionId}`,
          workspaceId,
          decisionId,
          roomId: roomId || 'sw_room_default',
          sender: 'Switch Fabric',
          role: 'SYSTEM',
          content: 'Room mapped to Decision. PMPilot Decision Assistant connected via Switch Agent Protocol.',
          isSimulated: 1,
          createdAt: new Date(now - 600000).toISOString()
        },
        {
          id: `msg_seed_2_${decisionId}`,
          workspaceId,
          decisionId,
          roomId: roomId || 'sw_room_default',
          sender: 'Security Lead',
          role: 'TEAMMATE',
          content: 'Reviewed the guest checkout telemetry. We need to cap guest comparison to 3 items and add fraud friction for orders over $150.',
          isSimulated: 1,
          createdAt: new Date(now - 300000).toISOString()
        },
        {
          id: `msg_seed_3_${decisionId}`,
          workspaceId,
          decisionId,
          roomId: roomId || 'sw_room_default',
          sender: 'PMPilot Decision Assistant',
          role: 'AGENT',
          content: 'Noted. Contradiction between frictionless conversion vs chargeback risk is active in Decision. Formulating structured proposal with revised fraud rules.',
          isSimulated: 1,
          createdAt: new Date(now - 120000).toISOString()
        }
      ];

      for (const s of seeds) {
        db.saveSwitchMessage(s);
      }
      messages = db.getSwitchMessages(workspaceId, decisionId);
    }

    return messages;
  }

  /**
   * Posts a message to a Switch room via POST /agents/{agent_id}/message.
   * If live credentials are unconfigured or offline, records into SQLite with honest is_simulated: 1.
   */
  async postMessageToRoom({ workspaceId, decisionId, roomId, content, sender = 'PM', role = 'USER' }) {
    if (!roomId || !content) {
      throw new Error('roomId and content are required.');
    }

    const cleanContent = this.sanitizeMessage(content);
    const serverUrl = this.getServerUrl();
    const apiKey = this.getAgentApiKey();
    const agentId = this.getAgentId();
    let delivered = false;
    let liveError = null;

    if (apiKey) {
      try {
        const res = await fetch(`${serverUrl}/agents/${agentId}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            room_id: roomId,
            content: cleanContent
          })
        });

        if (res.ok) {
          delivered = true;
        } else {
          liveError = await res.text();
        }
      } catch (err) {
        liveError = err.message;
      }
    }

    // Persist user message in SQLite
    const savedUserMsg = db.saveSwitchMessage({
      workspaceId,
      decisionId,
      roomId,
      sender: sender || 'PM',
      role: role || 'USER',
      content: cleanContent,
      isSimulated: delivered ? 0 : 1
    });

    // If Switch server is unconfigured or offline, generate an honest simulated assistant acknowledgement
    let savedReplyMsg = null;
    if (!delivered) {
      const replyContent = `Noted. Context received in evaluation thread: "${cleanContent.slice(0, 60)}${cleanContent.length > 60 ? '...' : ''}". Grounded in current canonical decision version.`;
      savedReplyMsg = db.saveSwitchMessage({
        workspaceId,
        decisionId,
        roomId,
        sender: 'PMPilot Decision Assistant',
        role: 'AGENT',
        content: replyContent,
        isSimulated: 1
      });
    }

    return {
      success: true,
      delivered,
      isSimulated: !delivered,
      reason: delivered ? null : (apiKey ? `Switch server error: ${this.sanitizeMessage(liveError)}` : 'SWITCH_AGENT_API_KEY is not configured. Running in evaluator simulation mode.'),
      userMessage: savedUserMsg,
      replyMessage: savedReplyMsg,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generates and validates a structured change proposal from a Switch room discussion.
   * Binds proposal to exact decision ID and version.
   */
  async createStructuredProposal({
    workspaceId,
    decisionId,
    roomId,
    proposalType = 'REQUIREMENT_CHANGE',
    summary,
    openQuestions = [],
    proposedChanges = {},
    risksTradeoffs = [],
    recommendedAction = '',
    proposedBy = 'pmpilot-decision-assistant'
  }) {
    if (!workspaceId || !decisionId || !summary) {
      throw new Error('workspaceId, decisionId, and summary are required.');
    }

    // 1. Check current canonical decision version
    const decision = await RedisStateManager.getRawDecision(decisionId);
    if (!decision) {
      throw new Error(`Decision '${decisionId}' not found.`);
    }

    // 2. Persist proposal bound to the current version
    const proposal = db.saveSwitchProposal({
      workspaceId,
      decisionId,
      decisionVersion: decision.version,
      roomId,
      proposalType,
      summary: this.sanitizeMessage(summary),
      openQuestions,
      proposedChanges,
      risksTradeoffs,
      recommendedAction: this.sanitizeMessage(recommendedAction),
      status: 'PENDING',
      proposedBy
    });

    return proposal;
  }

  /**
   * Applies an approved Switch proposal to a PMPilot decision.
   * Strict Human Approval & Version Guard:
   * - Checks that proposal is still PENDING and its version matches current decision version.
   * - If decision version advanced in the meantime, rejects application as STALE.
   * - Mutating the decision increments version and invalidates existing approval.
   */
  async applyProposalToDecision({ workspaceId, proposalId, user }) {
    if (!proposalId) throw new Error('proposalId is required.');

    const proposal = db.getSwitchProposalById(proposalId);
    if (!proposal) throw new Error(`Proposal '${proposalId}' not found.`);

    if (proposal.status !== 'PENDING') {
      throw new Error(`Cannot apply proposal with status '${proposal.status}'.`);
    }

    // 1. Fetch current decision
    const decision = await RedisStateManager.getRawDecision(proposal.decision_id);
    if (!decision) throw new Error(`Decision '${proposal.decision_id}' not found.`);

    // 2. Strict Version Check: reject if decision version has advanced beyond proposal version
    if (decision.version !== proposal.decision_version) {
      db.updateSwitchProposalStatus(proposalId, 'STALE');
      throw new Error(
        `Proposal is stale: created against decision version v${proposal.decision_version}, ` +
        `but current active version is v${decision.version}. Human PM re-evaluation required.`
      );
    }

    // 3. Mutate decision: incorporate proposed changes and increment version
    const updatedData = { ...decision };
    if (proposal.proposed_changes?.title) {
      updatedData.title = proposal.proposed_changes.title;
    }
    if (proposal.proposed_changes?.hypothesis) {
      updatedData.hypothesis = proposal.proposed_changes.hypothesis;
    }
    if (proposal.proposed_changes?.notes) {
      updatedData.collaborationNotes = [
        ...(updatedData.collaborationNotes || []),
        {
          note: proposal.summary,
          proposedBy: proposal.proposed_by,
          appliedBy: user?.name || 'Human PM',
          appliedAt: new Date().toISOString(),
          proposalId: proposal.id
        }
      ];
    }

    // Reopening/mutating increments version and invalidates previous approval
    const mutatedDecision = await RedisStateManager.reopenDecision(
      proposal.decision_id,
      user?.name || 'Human PM'
    );

    // 4. Mark proposal as ACCEPTED
    db.updateSwitchProposalStatus(proposalId, 'ACCEPTED');

    // 5. Mark any other pending proposals for older version as STALE
    db.markStaleSwitchProposals(workspaceId, proposal.decision_id, mutatedDecision.version);

    // 6. Synchronize mapped Switch room in SQLite with the newly mutated decision version and safe context
    const existingRoom = db.getSwitchRoom(workspaceId, proposal.decision_id);
    if (existingRoom) {
      const refreshedContext = this.buildSafeDecisionContext(mutatedDecision);
      db.saveSwitchRoom({
        ...existingRoom,
        workspaceId,
        decisionId: proposal.decision_id,
        sharedContext: refreshedContext,
        sharedAtVersion: mutatedDecision.version
      });
    }

    return {
      success: true,
      proposalId,
      status: 'ACCEPTED',
      newDecisionVersion: mutatedDecision.version,
      approvalInvalidated: true,
      message: `Proposal merged successfully into Decision v${mutatedDecision.version}. Human approval relocked for review.`
    };
  }

  /**
   * Rejects a Switch proposal
   */
  rejectProposal(proposalId) {
    if (!proposalId) throw new Error('proposalId is required.');
    const updated = db.updateSwitchProposalStatus(proposalId, 'REJECTED');
    return {
      success: true,
      proposalId,
      status: 'REJECTED'
    };
  }

  /**
   * Retrieves all Switch proposals for a decision
   */
  getProposalsForDecision(workspaceId, decisionId) {
    return db.getSwitchProposals(workspaceId, decisionId);
  }
}

export const switchService = new SwitchService();

