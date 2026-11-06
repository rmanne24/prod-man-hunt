-- ====================================================================
-- PMPilot PostgreSQL Production Schema
-- Compatible with PostgreSQL 13+, Supabase, Neon, AWS RDS, and Render
-- ====================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'LOCAL',
  provider_sub TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PRODUCT_MANAGER',
  password_hash TEXT,
  password_salt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider_sub ON users(provider_sub);

-- 2. Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- 4. Revoked Session Tokens Table
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(expires_at);

-- 5. Canonical Product Decisions Table
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_workspace ON decisions(workspace_id);

-- 6. Encrypted Integration Connections Table
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
  expires_at BIGINT,
  last_synced_at TIMESTAMPTZ,
  selected_resources JSONB,
  sync_cursor TEXT,
  error_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_ws ON integration_connections(workspace_id);

-- 7. Switch Collaboration Rooms Table
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
  shared_context JSONB,
  shared_at_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, decision_id)
);

CREATE INDEX IF NOT EXISTS idx_switch_rooms_decision ON switch_rooms(workspace_id, decision_id);

-- 8. Switch Discussion Proposals Table
CREATE TABLE IF NOT EXISTS switch_proposals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,
  decision_version INTEGER NOT NULL,
  merged_decision_version INTEGER,
  room_id TEXT NOT NULL,
  proposal_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  open_questions JSONB,
  proposed_changes JSONB,
  risks_tradeoffs JSONB,
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  proposed_by TEXT NOT NULL DEFAULT 'pmpilot-decision-assistant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_switch_proposals_decision ON switch_proposals(workspace_id, decision_id, decision_version);

-- 9. Switch Collaboration Room Messages Table
CREATE TABLE IF NOT EXISTS switch_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  is_simulated INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_switch_messages_room ON switch_messages(workspace_id, decision_id);

-- 10. Custom REST API & Webhook Integrations Table
CREATE TABLE IF NOT EXISTS custom_integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'NONE',
  auth_header_name TEXT,
  encrypted_secret TEXT,
  secret_iv TEXT,
  secret_tag TEXT,
  custom_headers JSONB,
  events JSONB,
  signing_secret TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_integrations_ws ON custom_integrations(workspace_id);

-- 11. Imported Evidence Records Table
CREATE TABLE IF NOT EXISTS imported_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL,
  author TEXT,
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_state TEXT NOT NULL DEFAULT 'IMPORTED',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_imported_records_ws_prov ON imported_records(workspace_id, provider);
CREATE INDEX IF NOT EXISTS idx_imported_records_ext ON imported_records(workspace_id, provider, external_id);

-- 12. Default Demo Workspace (Idempotent seed)
INSERT INTO workspaces (id, name, created_by, created_at)
VALUES ('ws_moonshot', 'Moonshot Commerce Workspace', 'system', '2026-01-01T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
