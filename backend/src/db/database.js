/**
 * PMPilot Persistent Database Layer
 * 
 * Implements persistent storage using Node.js native SQLite (node:sqlite DatabaseSync).
 * Provides atomic migrations, indexing, and repository methods for:
 * - Users & Identities (Local + Auth0 OIDC)
 * - Workspaces & Multi-tenant membership roles
 * - Revoked Bearer tokens (survives process restarts and multi-instance deployments)
 * - Canonical DecisionRecords (survives backend restarts)
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PMPilotDatabase {
  constructor(dbPath) {
    if (!dbPath) {
      const defaultDataDir = path.resolve(__dirname, '../../data');
      if (!fs.existsSync(defaultDataDir)) {
        fs.mkdirSync(defaultDataDir, { recursive: true });
      }
      this.dbPath = process.env.PMPILOT_DB_PATH || path.join(defaultDataDir, 'pmpilot.db');
    } else {
      this.dbPath = dbPath;
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initPragmas();
    this.runMigrations();
    this.prepareStatements();
  }

  initPragmas() {
    // Enable WAL mode for high concurrency read/write if file-based
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'LOCAL',
        provider_sub TEXT UNIQUE,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'PRODUCT_MANAGER',
        password_hash TEXT,
        password_salt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_provider_sub ON users(provider_sub);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'MEMBER',
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash TEXT PRIMARY KEY,
        revoked_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(expires_at);

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_workspace ON decisions(workspace_id);

      CREATE TABLE IF NOT EXISTS integration_connections (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        connected_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_organization_id TEXT,
        provider_organization_name TEXT,
        provider_user_id TEXT,
        scopes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONNECTED',
        encrypted_access_token TEXT NOT NULL,
        token_iv TEXT NOT NULL,
        token_tag TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        refresh_iv TEXT,
        refresh_tag TEXT,
        expires_at INTEGER,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, provider)
      );

      CREATE INDEX IF NOT EXISTS idx_integration_connections_ws ON integration_connections(workspace_id);

      -- Switch AI Rooms and Decision Mappings
      CREATE TABLE IF NOT EXISTS switch_rooms (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        decision_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        room_name TEXT NOT NULL,
        room_url TEXT,
        agent_id TEXT,
        connection_id TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        shared_context TEXT,
        shared_at_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, decision_id)
      );

      CREATE INDEX IF NOT EXISTS idx_switch_rooms_decision ON switch_rooms(workspace_id, decision_id);

      -- Switch Discussion Proposals (Grounded PM Proposals)
      CREATE TABLE IF NOT EXISTS switch_proposals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        decision_id TEXT NOT NULL,
        decision_version INTEGER NOT NULL,
        room_id TEXT NOT NULL,
        proposal_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        open_questions TEXT,
        proposed_changes TEXT,
        risks_tradeoffs TEXT,
        recommended_action TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        proposed_by TEXT NOT NULL DEFAULT 'pmpilot-decision-assistant',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_switch_proposals_decision ON switch_proposals(workspace_id, decision_id, decision_version);

      -- Switch Collaboration Room Messages (Live & Simulated)
      CREATE TABLE IF NOT EXISTS switch_messages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        decision_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_switch_messages_room ON switch_messages(workspace_id, decision_id);

      -- Ensure default demo workspace exists for synthetic demo decisions
      INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at)
      VALUES ('ws_moonshot', 'Moonshot Commerce Workspace', 'system', '2026-01-01T00:00:00.000Z');
    `);
  }

  prepareStatements() {
    // Users
    this.stmtGetUserByEmail = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
    this.stmtGetUserById = this.db.prepare('SELECT * FROM users WHERE id = ?');
    this.stmtGetUserBySub = this.db.prepare('SELECT * FROM users WHERE provider_sub = ?');
    this.stmtInsertUser = this.db.prepare(`
      INSERT INTO users (id, provider, provider_sub, email, name, role, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtUpdateUserOidc = this.db.prepare(`
      UPDATE users SET name = ?, updated_at = ? WHERE id = ?
    `);

    // Workspaces & Membership
    this.stmtGetWorkspace = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    this.stmtInsertWorkspace = this.db.prepare(`
      INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at)
      VALUES (?, ?, ?, ?)
    `);
    this.stmtGetWorkspaceMember = this.db.prepare(`
      SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `);
    this.stmtInsertWorkspaceMember = this.db.prepare(`
      INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `);
    this.stmtGetUserWorkspaces = this.db.prepare(`
      SELECT w.*, wm.role as member_role
      FROM workspaces w
      JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ?
    `);

    // Token Revocation
    this.stmtIsTokenRevoked = this.db.prepare('SELECT 1 FROM revoked_tokens WHERE token_hash = ?');
    this.stmtRevokeToken = this.db.prepare(`
      INSERT OR REPLACE INTO revoked_tokens (token_hash, revoked_at, expires_at)
      VALUES (?, ?, ?)
    `);
    this.stmtPruneTokens = this.db.prepare('DELETE FROM revoked_tokens WHERE expires_at < ?');

    // Decisions
    this.stmtGetDecision = this.db.prepare('SELECT * FROM decisions WHERE id = ?');
    this.stmtUpsertDecision = this.db.prepare(`
      INSERT INTO decisions (id, workspace_id, version, state, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        version = excluded.version,
        state = excluded.state,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    this.stmtListDecisionsForWorkspace = this.db.prepare(`
      SELECT id, workspace_id, version, state, created_at, updated_at FROM decisions WHERE workspace_id = ?
    `);

    // Integration Connections
    this.stmtGetIntegrationConnection = this.db.prepare(
      'SELECT * FROM integration_connections WHERE workspace_id = ? AND provider = ?'
    );
    this.stmtUpsertIntegrationConnection = this.db.prepare(`
      INSERT INTO integration_connections (
        id, workspace_id, provider, connected_by_user_id,
        provider_organization_id, provider_organization_name, provider_user_id,
        scopes, status, encrypted_access_token, token_iv, token_tag,
        encrypted_refresh_token, refresh_iv, refresh_tag,
        expires_at, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, provider) DO UPDATE SET
        connected_by_user_id = excluded.connected_by_user_id,
        provider_organization_id = excluded.provider_organization_id,
        provider_organization_name = excluded.provider_organization_name,
        provider_user_id = excluded.provider_user_id,
        scopes = excluded.scopes,
        status = excluded.status,
        encrypted_access_token = excluded.encrypted_access_token,
        token_iv = excluded.token_iv,
        token_tag = excluded.token_tag,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        refresh_iv = excluded.refresh_iv,
        refresh_tag = excluded.refresh_tag,
        expires_at = excluded.expires_at,
        last_synced_at = excluded.last_synced_at,
        updated_at = excluded.updated_at
    `);
    this.stmtDisconnectIntegrationConnection = this.db.prepare(`
      UPDATE integration_connections SET
        status = 'DISCONNECTED',
        encrypted_access_token = '',
        token_iv = '',
        token_tag = '',
        encrypted_refresh_token = NULL,
        refresh_iv = NULL,
        refresh_tag = NULL,
        updated_at = ?
      WHERE workspace_id = ? AND provider = ?
    `);
    this.stmtUpdateSyncTimestamp = this.db.prepare(`
      UPDATE integration_connections SET last_synced_at = ?, updated_at = ? WHERE workspace_id = ? AND provider = ?
    `);
    this.stmtListIntegrationConnections = this.db.prepare(
      'SELECT id, workspace_id, provider, connected_by_user_id, provider_organization_id, provider_organization_name, scopes, status, expires_at, last_synced_at, created_at, updated_at FROM integration_connections WHERE workspace_id = ?'
    );

    // Switch Rooms
    this.stmtGetSwitchRoom = this.db.prepare(`
      SELECT * FROM switch_rooms WHERE workspace_id = ? AND decision_id = ?
    `);
    this.stmtUpsertSwitchRoom = this.db.prepare(`
      INSERT INTO switch_rooms (
        id, workspace_id, decision_id, room_id, room_name, room_url, agent_id,
        connection_id, status, shared_context, shared_at_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, decision_id) DO UPDATE SET
        room_id = excluded.room_id,
        room_name = excluded.room_name,
        room_url = excluded.room_url,
        agent_id = excluded.agent_id,
        connection_id = excluded.connection_id,
        status = excluded.status,
        shared_context = excluded.shared_context,
        shared_at_version = excluded.shared_at_version,
        updated_at = excluded.updated_at
    `);
    this.stmtDeleteSwitchRoom = this.db.prepare(`
      DELETE FROM switch_rooms WHERE workspace_id = ? AND decision_id = ?
    `);

    // Switch Proposals
    this.stmtInsertSwitchProposal = this.db.prepare(`
      INSERT INTO switch_proposals (
        id, workspace_id, decision_id, decision_version, room_id, proposal_type,
        summary, open_questions, proposed_changes, risks_tradeoffs, recommended_action,
        status, proposed_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtGetSwitchProposals = this.db.prepare(`
      SELECT * FROM switch_proposals WHERE workspace_id = ? AND decision_id = ? ORDER BY created_at DESC
    `);
    this.stmtGetSwitchProposalById = this.db.prepare(`
      SELECT * FROM switch_proposals WHERE id = ?
    `);
    this.stmtUpdateSwitchProposalStatus = this.db.prepare(`
      UPDATE switch_proposals SET status = ?, updated_at = ? WHERE id = ?
    `);
    this.stmtMarkStaleSwitchProposals = this.db.prepare(`
      UPDATE switch_proposals SET status = 'STALE', updated_at = ?
      WHERE workspace_id = ? AND decision_id = ? AND decision_version < ? AND status = 'PENDING'
    `);

    // Switch Messages
    this.stmtInsertSwitchMessage = this.db.prepare(`
      INSERT INTO switch_messages (
        id, workspace_id, decision_id, room_id, sender, role, content, is_simulated, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtGetSwitchMessages = this.db.prepare(`
      SELECT * FROM switch_messages WHERE workspace_id = ? AND decision_id = ? ORDER BY created_at ASC
    `);
  }

  // --- User Repository Methods ---

  getUserByEmail(email) {
    if (!email) return null;
    return this.stmtGetUserByEmail.get(email.trim().toLowerCase()) || null;
  }

  getUserById(id) {
    if (!id) return null;
    return this.stmtGetUserById.get(id) || null;
  }

  getUserByProviderSub(sub) {
    if (!sub) return null;
    return this.stmtGetUserBySub.get(sub) || null;
  }

  createUser({ id, provider = 'LOCAL', providerSub = null, email, name, role = 'PRODUCT_MANAGER', passwordHash = null, passwordSalt = null }) {
    const now = new Date().toISOString();
    const cleanEmail = email.trim().toLowerCase();
    this.stmtInsertUser.run(
      id,
      provider,
      providerSub,
      cleanEmail,
      name.trim(),
      role,
      passwordHash,
      passwordSalt,
      now,
      now
    );
    return this.getUserById(id);
  }

  upsertOidcUser({ sub, email, name }) {
    const existingBySub = this.getUserByProviderSub(sub);
    const now = new Date().toISOString();
    if (existingBySub) {
      if (name && name !== existingBySub.name) {
        this.stmtUpdateUserOidc.run(name, now, existingBySub.id);
      }
      return this.getUserById(existingBySub.id);
    }

    const existingByEmail = this.getUserByEmail(email);
    if (existingByEmail) {
      // Bind Auth0 provider to existing user record
      this.db.prepare('UPDATE users SET provider = ?, provider_sub = ?, updated_at = ? WHERE id = ?')
        .run('AUTH0', sub, now, existingByEmail.id);
      return this.getUserById(existingByEmail.id);
    }

    // New OIDC user
    const id = `usr_oidc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.createUser({
      id,
      provider: 'AUTH0',
      providerSub: sub,
      email,
      name: name || email.split('@')[0],
      role: 'PRODUCT_MANAGER',
      passwordHash: null,
      passwordSalt: null
    });

    return this.getUserById(id);
  }

  // --- Workspace & Membership Repository Methods ---

  createWorkspace({ id, name, createdBy }) {
    const now = new Date().toISOString();
    this.stmtInsertWorkspace.run(id, name, createdBy, now);
    // Add creator as OWNER
    this.addWorkspaceMember(id, createdBy, 'OWNER');
    return this.getWorkspace(id);
  }

  getWorkspace(id) {
    if (!id) return null;
    return this.stmtGetWorkspace.get(id) || null;
  }

  addWorkspaceMember(workspaceId, userId, role = 'MEMBER') {
    const now = new Date().toISOString();
    this.stmtInsertWorkspaceMember.run(workspaceId, userId, role, now);
  }

  getWorkspaceMember(workspaceId, userId) {
    if (!workspaceId || !userId) return null;
    return this.stmtGetWorkspaceMember.get(workspaceId, userId) || null;
  }

  isWorkspaceMember(workspaceId, userId) {
    return Boolean(this.getWorkspaceMember(workspaceId, userId));
  }

  getUserWorkspaces(userId) {
    if (!userId) return [];
    return this.stmtGetUserWorkspaces.all(userId) || [];
  }

  // --- Token Revocation Methods ---

  revokeToken(tokenHash, expiresAt) {
    const now = new Date().toISOString();
    this.stmtRevokeToken.run(tokenHash, now, expiresAt || Math.floor(Date.now() / 1000) + 86400);
  }

  isTokenRevoked(tokenHash) {
    return Boolean(this.stmtIsTokenRevoked.get(tokenHash));
  }

  pruneExpiredTokens() {
    const nowSeconds = Math.floor(Date.now() / 1000);
    this.stmtPruneTokens.run(nowSeconds);
  }

  // --- Canonical Decision Persistence Methods ---

  getDecision(id) {
    if (!id) return null;
    const row = this.stmtGetDecision.get(id);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  getDecisionMeta(id) {
    if (!id) return null;
    const row = this.stmtGetDecision.get(id);
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      version: row.version,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  saveDecision(id, workspaceId, version, state, data) {
    const now = new Date().toISOString();
    const targetWs = workspaceId || 'ws_moonshot';
    this.stmtInsertWorkspace.run(targetWs, targetWs, 'system', now);
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    this.stmtUpsertDecision.run(
      id,
      targetWs,
      version || 1,
      state || 'INITIAL',
      jsonString,
      now,
      now
    );
  }

  listDecisionsForWorkspace(workspaceId) {
    return this.stmtListDecisionsForWorkspace.all(workspaceId) || [];
  }

  // --- Integration Connections Repository Methods ---

  getIntegrationConnection(workspaceId, provider = 'LINEAR') {
    if (!workspaceId) return null;
    return this.stmtGetIntegrationConnection.get(workspaceId, provider) || null;
  }

  saveIntegrationConnection({
    id,
    workspaceId,
    provider = 'LINEAR',
    connectedByUserId,
    providerOrganizationId = null,
    providerOrganizationName = null,
    providerUserId = null,
    scopes = 'read,write,issues:create',
    status = 'CONNECTED',
    encryptedAccessToken,
    tokenIv,
    tokenTag,
    encryptedRefreshToken = null,
    refreshIv = null,
    refreshTag = null,
    expiresAt = null
  }) {
    const now = new Date().toISOString();
    const connId = id || `conn_${provider.toLowerCase()}_${Date.now()}`;
    this.stmtUpsertIntegrationConnection.run(
      connId,
      workspaceId,
      provider,
      connectedByUserId,
      providerOrganizationId,
      providerOrganizationName,
      providerUserId,
      scopes,
      status,
      encryptedAccessToken,
      tokenIv,
      tokenTag,
      encryptedRefreshToken,
      refreshIv,
      refreshTag,
      expiresAt,
      now,
      now,
      now
    );
    return this.getIntegrationConnection(workspaceId, provider);
  }

  disconnectIntegrationConnection(workspaceId, provider = 'LINEAR') {
    const now = new Date().toISOString();
    this.stmtDisconnectIntegrationConnection.run(now, workspaceId, provider);
    return this.getIntegrationConnection(workspaceId, provider);
  }

  updateIntegrationSyncTimestamp(workspaceId, provider = 'LINEAR') {
    const now = new Date().toISOString();
    this.stmtUpdateSyncTimestamp.run(now, now, workspaceId, provider);
  }

  listIntegrationConnections(workspaceId) {
    if (!workspaceId) return [];
    return this.stmtListIntegrationConnections.all(workspaceId) || [];
  }

  // --- Switch AI Collaboration Repository Methods ---

  saveSwitchRoom(data = {}) {
    const workspaceId = data.workspaceId || data.workspace_id;
    const decisionId = data.decisionId || data.decision_id;
    const roomId = data.roomId || data.room_id;
    const roomName = data.roomName || data.room_name;
    const roomUrl = data.roomUrl || data.room_url || null;
    const agentId = data.agentId || data.agent_id || null;
    const connectionId = data.connectionId || data.connection_id || null;
    const status = data.status || 'ACTIVE';
    const sharedContext = data.sharedContext || data.shared_context || null;
    const sharedAtVersion = data.sharedAtVersion || data.shared_at_version || 1;

    const now = new Date().toISOString();
    const entryId = data.id || `sw_room_${workspaceId}_${decisionId}`;
    this.stmtUpsertSwitchRoom.run(
      entryId,
      workspaceId,
      decisionId,
      roomId,
      roomName,
      roomUrl,
      agentId,
      connectionId,
      status,
      typeof sharedContext === 'object' ? JSON.stringify(sharedContext) : sharedContext,
      sharedAtVersion,
      now,
      now
    );
    return this.getSwitchRoom(workspaceId, decisionId);
  }

  getSwitchRoom(workspaceId, decisionId) {
    if (!workspaceId || !decisionId) return null;
    const row = this.stmtGetSwitchRoom.get(workspaceId, decisionId);
    if (!row) return null;
    return {
      ...row,
      shared_context: row.shared_context ? JSON.parse(row.shared_context) : null
    };
  }

  deleteSwitchRoom(workspaceId, decisionId) {
    if (!workspaceId || !decisionId) return;
    this.stmtDeleteSwitchRoom.run(workspaceId, decisionId);
  }

  saveSwitchProposal({
    id,
    workspaceId,
    decisionId,
    decisionVersion,
    roomId,
    proposalType = 'REQUIREMENT_CHANGE',
    summary,
    openQuestions = [],
    proposedChanges = {},
    risksTradeoffs = [],
    recommendedAction = '',
    status = 'PENDING',
    proposedBy = 'pmpilot-decision-assistant'
  }) {
    const now = new Date().toISOString();
    const propId = id || `prop_sw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.stmtInsertSwitchProposal.run(
      propId,
      workspaceId,
      decisionId,
      decisionVersion,
      roomId,
      proposalType,
      summary,
      Array.isArray(openQuestions) ? JSON.stringify(openQuestions) : JSON.stringify([]),
      typeof proposedChanges === 'object' ? JSON.stringify(proposedChanges) : '{}',
      Array.isArray(risksTradeoffs) ? JSON.stringify(risksTradeoffs) : JSON.stringify([]),
      recommendedAction,
      status,
      proposedBy,
      now,
      now
    );
    return this.getSwitchProposalById(propId);
  }

  getSwitchProposals(workspaceId, decisionId) {
    if (!workspaceId || !decisionId) return [];
    const rows = this.stmtGetSwitchProposals.all(workspaceId, decisionId) || [];
    return rows.map(r => ({
      ...r,
      open_questions: r.open_questions ? JSON.parse(r.open_questions) : [],
      proposed_changes: r.proposed_changes ? JSON.parse(r.proposed_changes) : {},
      risks_tradeoffs: r.risks_tradeoffs ? JSON.parse(r.risks_tradeoffs) : []
    }));
  }

  getSwitchProposalById(proposalId) {
    if (!proposalId) return null;
    const r = this.stmtGetSwitchProposalById.get(proposalId);
    if (!r) return null;
    return {
      ...r,
      open_questions: r.open_questions ? JSON.parse(r.open_questions) : [],
      proposed_changes: r.proposed_changes ? JSON.parse(r.proposed_changes) : {},
      risks_tradeoffs: r.risks_tradeoffs ? JSON.parse(r.risks_tradeoffs) : []
    };
  }

  updateSwitchProposalStatus(proposalId, status) {
    const now = new Date().toISOString();
    this.stmtUpdateSwitchProposalStatus.run(status, now, proposalId);
    return this.getSwitchProposalById(proposalId);
  }

  markStaleSwitchProposals(workspaceId, decisionId, currentVersion) {
    const now = new Date().toISOString();
    this.stmtMarkStaleSwitchProposals.run(now, workspaceId, decisionId, currentVersion);
    return this.getSwitchProposals(workspaceId, decisionId);
  }

  saveSwitchMessage({
    id,
    workspaceId,
    decisionId,
    roomId,
    sender,
    role = 'USER',
    content,
    isSimulated = 1
  }) {
    const entryId = id || `sw_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    this.stmtInsertSwitchMessage.run(
      entryId,
      workspaceId,
      decisionId,
      roomId,
      sender,
      role,
      content,
      isSimulated ? 1 : 0,
      now
    );
    return {
      id: entryId,
      workspace_id: workspaceId,
      decision_id: decisionId,
      room_id: roomId,
      sender,
      role,
      content,
      is_simulated: isSimulated ? 1 : 0,
      created_at: now
    };
  }

  getSwitchMessages(workspaceId, decisionId) {
    if (!workspaceId || !decisionId) return [];
    const rows = this.stmtGetSwitchMessages.all(workspaceId, decisionId) || [];
    return rows.map(r => ({
      ...r,
      is_simulated: Boolean(r.is_simulated)
    }));
  }

  close() {
    this.db.close();
  }
}

// Global persistent database instance
export const db = new PMPilotDatabase();
