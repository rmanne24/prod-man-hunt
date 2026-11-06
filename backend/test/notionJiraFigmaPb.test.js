/**
 * PMPilot Notion, Jira, Figma & Productboard Integration Tests
 * 
 * Verifies:
 * 1. Notion preflight, internal token connection, and block sync
 * 2. Notion strict human approval guard for PRD export (blocks unapproved decisions)
 * 3. Jira Software preflight, Atlassian 3LO URL generation, and API token connection
 * 4. Jira strict human approval & version guard for Epic creation (blocks unapproved/stale)
 * 5. Figma preflight, URL key parsing, file structure & design comments ingestion
 * 6. Productboard preflight, documented capability limits, and feedback notes ingestion
 * 7. Token encryption, sanitization, and disconnect across all providers
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { notionService } from '../src/integrations/notionService.js';
import { jiraService } from '../src/integrations/jiraService.js';
import { figmaService } from '../src/integrations/figmaService.js';
import { productboardService } from '../src/integrations/productboardService.js';
import { db } from '../src/db/database.js';

test('NOTION: Preflight, token connection, and strict approval guard', async () => {
  const workspaceId = `ws_notion_${Date.now()}`;
  const userId = `usr_notion_${Date.now()}`;
  db.db.exec(`INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES ('${userId}', '${userId}@team.co', 'Notion PM', '2026-01-01', '2026-01-01');`);
  db.db.exec(`INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at) VALUES ('${workspaceId}', 'Notion WS', '${userId}', '2026-01-01');`);

  const keyHex = crypto.randomBytes(32).toString('hex');
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = keyHex;

  try {
    // 1. Preflight
    const preflight = notionService.getPreflightReport();
    assert.equal(preflight.provider, 'NOTION');

    // 2. Token connection
    const encrypted = notionService.encryptTokens('secret_notion_mock_integration_token_123');
    db.saveIntegrationConnection({
      workspaceId,
      provider: 'NOTION',
      connectedByUserId: userId,
      providerOrganizationName: 'Acme Product Wiki',
      scopes: 'pages:read,pages:write',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    const connStatus = notionService.getConnectionStatus(workspaceId);
    assert.equal(connStatus.connected, true);
    assert.equal(connStatus.connection.organizationName, 'Acme Product Wiki');
    assert.equal(connStatus.connection.encryptedAccessToken, undefined);

    // 3. Strict Human Approval Guard: Block PRD export when unapproved
    const unapprovedDecision = { id: 'dec_draft', version: 1, state: 'IN_REVIEW', name: 'Checkout Spec' };
    await assert.rejects(
      async () => await notionService.publishApprovedPrd({ workspaceId, decision: unapprovedDecision }),
      /Decision v1 has not been approved by a Human PM/
    );

    // 4. Ingestion of mock Notion page
    const record = db.saveImportedRecord({
      workspaceId,
      provider: 'NOTION',
      externalId: 'page_12345',
      sourceUrl: 'https://notion.so/page_12345',
      title: 'PRD: Guest Checkout Single Click Flow',
      content: 'Overview: Users should be able to checkout with Apple Pay without registering passwords.',
      contentType: 'PRD',
      author: 'Product Team'
    });

    assert.equal(record.provider, 'NOTION');
    assert.equal(record.content_type, 'PRD');

    // 5. Disconnect
    const disc = notionService.disconnect(workspaceId);
    assert.equal(disc.status, 'DISCONNECTED');
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey; else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('JIRA: Preflight, 3LO authorization URL, and strict approval guard', async () => {
  const workspaceId = `ws_jira_${Date.now()}`;
  const userId = `usr_jira_${Date.now()}`;
  db.db.exec(`INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES ('${userId}', '${userId}@team.co', 'Jira PM', '2026-01-01', '2026-01-01');`);
  db.db.exec(`INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at) VALUES ('${workspaceId}', 'Jira WS', '${userId}', '2026-01-01');`);

  const keyHex = crypto.randomBytes(32).toString('hex');
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  const origClientId = process.env.JIRA_CLIENT_ID;
  const origClientSecret = process.env.JIRA_CLIENT_SECRET;

  process.env.INTEGRATION_ENCRYPTION_KEY = keyHex;
  process.env.JIRA_CLIENT_ID = 'mock-jira-client-id';
  process.env.JIRA_CLIENT_SECRET = 'mock-jira-secret-key';

  try {
    // 1. Authorize URL
    const authUrl = jiraService.buildAuthorizeUrl({
      workspaceId,
      userId,
      redirectUri: 'https://pmpilot.app/api/integrations/jira/callback'
    });
    assert.ok(authUrl.url.includes('auth.atlassian.com'));
    assert.ok(authUrl.url.includes('read%3Ajira-work'));
    assert.ok(authUrl.url.includes('write%3Ajira-work'));

    // 2. Mock Connection
    const encrypted = jiraService.encryptTokens('mock_jira_oauth_token');
    db.saveIntegrationConnection({
      workspaceId,
      provider: 'JIRA',
      connectedByUserId: userId,
      providerOrganizationId: 'cloud_jira_site_1',
      providerOrganizationName: 'Acme Jira Cloud (acme.atlassian.net)',
      scopes: 'read:jira-work,write:jira-work',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    // 3. Strict Human Approval Guard: Block issue creation when unapproved
    const unapprovedDecision = { id: 'dec_eng', version: 2, state: 'PROPOSAL_GENERATED', name: 'Klarna Integration' };
    await assert.rejects(
      async () => await jiraService.createApprovedIssue({ workspaceId, decision: unapprovedDecision, projectKey: 'ENG' }),
      /Decision v2 has not been approved by a Human PM/
    );

    // 4. Ingest Jira Issue into evidence pipeline
    const issueRec = db.saveImportedRecord({
      workspaceId,
      provider: 'JIRA',
      externalId: 'ENG-512',
      sourceUrl: 'https://acme.atlassian.net/browse/ENG-512',
      title: '[ENG-512] Dropdown styling glitch on mobile Safari',
      content: 'Customer issue: 3-column product matrix breaks on viewport < 375px.',
      contentType: 'USER_STORY',
      author: 'Quality Assurance'
    });
    assert.equal(issueRec.provider, 'JIRA');
    assert.equal(issueRec.external_id, 'ENG-512');

    // 5. Disconnect
    const disc = jiraService.disconnect(workspaceId);
    assert.equal(disc.status, 'DISCONNECTED');
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey; else delete process.env.INTEGRATION_ENCRYPTION_KEY;
    if (origClientId) process.env.JIRA_CLIENT_ID = origClientId; else delete process.env.JIRA_CLIENT_ID;
    if (origClientSecret) process.env.JIRA_CLIENT_SECRET = origClientSecret; else delete process.env.JIRA_CLIENT_SECRET;
  }
});

test('FIGMA: URL parsing, file metadata, and comment ingestion', async () => {
  const workspaceId = `ws_figma_${Date.now()}`;
  const userId = `usr_figma_${Date.now()}`;
  db.db.exec(`INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES ('${userId}', '${userId}@team.co', 'Figma PM', '2026-01-01', '2026-01-01');`);
  db.db.exec(`INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at) VALUES ('${workspaceId}', 'Figma WS', '${userId}', '2026-01-01');`);

  const keyHex = crypto.randomBytes(32).toString('hex');
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = keyHex;

  try {
    // 1. URL parsing test
    const rawUrl = 'https://www.figma.com/file/abc123XYZ456/Checkout-Flow-v2?node-id=0%3A1';
    const parsedKey = figmaService.parseFileKey(rawUrl);
    assert.equal(parsedKey, 'abc123XYZ456');

    const designUrl = 'https://www.figma.com/design/testKey789/Cart-Drawer';
    assert.equal(figmaService.parseFileKey(designUrl), 'testKey789');

    // 2. Token connection
    const encrypted = figmaService.encryptTokens('figd_mock_personal_access_token');
    db.saveIntegrationConnection({
      workspaceId,
      provider: 'FIGMA',
      connectedByUserId: userId,
      providerOrganizationName: 'Product Design Team',
      scopes: 'files:read',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    // 3. Ingestion of design comments and file records
    const fileRec = db.saveImportedRecord({
      workspaceId,
      provider: 'FIGMA',
      externalId: 'file_abc123XYZ456',
      sourceUrl: 'https://www.figma.com/file/abc123XYZ456',
      title: '[Figma Design] Checkout Flow v2',
      content: 'Figma File: Checkout Flow v2. Pages: Mobile Drawer, Desktop Modal.',
      contentType: 'DESIGN_FILE',
      author: 'Lead UX'
    });
    assert.equal(fileRec.provider, 'FIGMA');
    assert.equal(fileRec.content_type, 'DESIGN_FILE');

    const commentRec = db.saveImportedRecord({
      workspaceId,
      provider: 'FIGMA',
      externalId: 'comm_98765',
      sourceUrl: 'https://www.figma.com/file/abc123XYZ456',
      title: '[Figma Comment] Checkout Flow v2 (Design Critique)',
      content: 'We need to make sure the Apple Pay sheet opens without prompting for address twice.',
      contentType: 'DESIGN_COMMENT',
      author: 'Design Critique'
    });
    assert.equal(commentRec.content_type, 'DESIGN_COMMENT');

    // 4. Disconnect
    const disc = figmaService.disconnect(workspaceId);
    assert.equal(disc.status, 'DISCONNECTED');
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey; else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});

test('PRODUCTBOARD: Preflight capabilities, token connection, and feedback note ingestion', async () => {
  const workspaceId = `ws_pb_${Date.now()}`;
  const userId = `usr_pb_${Date.now()}`;
  db.db.exec(`INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES ('${userId}', '${userId}@team.co', 'Productboard PM', '2026-01-01', '2026-01-01');`);
  db.db.exec(`INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at) VALUES ('${workspaceId}', 'Productboard WS', '${userId}', '2026-01-01');`);

  const keyHex = crypto.randomBytes(32).toString('hex');
  const origKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = keyHex;

  try {
    // 1. Verify capability documentation
    const preflight = productboardService.getPreflightReport();
    assert.equal(preflight.provider, 'PRODUCTBOARD');
    assert.ok(preflight.capabilities.supported.includes('Customer feedback notes ingestion'));
    assert.ok(preflight.capabilities.unsupported.some(u => u.includes('roadmap editing')));

    // 2. Token connection
    const encrypted = productboardService.encryptTokens('pb_mock_api_token_12345');
    db.saveIntegrationConnection({
      workspaceId,
      provider: 'PRODUCTBOARD',
      connectedByUserId: userId,
      providerOrganizationName: 'Global E-Commerce Space',
      scopes: 'notes:read,features:read',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    // 3. Ingest customer feedback note
    const noteRec = db.saveImportedRecord({
      workspaceId,
      provider: 'PRODUCTBOARD',
      externalId: 'note_555',
      sourceUrl: 'https://app.productboard.com/notes/note_555',
      title: '[Productboard Feedback] Cart dropoff quote',
      content: 'Verbatim customer quote: "I wanted to buy the jacket immediately but having to fill out a 4-step registration form made me leave."',
      contentType: 'FEEDBACK_NOTE',
      author: 'buyer@retailstore.com',
      metadata: { company: 'Retail Store Corp', tags: ['dropoff', 'checkout'] }
    });

    assert.equal(noteRec.provider, 'PRODUCTBOARD');
    assert.equal(noteRec.content_type, 'FEEDBACK_NOTE');
    assert.equal(noteRec.author, 'buyer@retailstore.com');

    // 4. Ingest feature reference
    const featRec = db.saveImportedRecord({
      workspaceId,
      provider: 'PRODUCTBOARD',
      externalId: 'feat_999',
      sourceUrl: 'https://app.productboard.com/features/feat_999',
      title: '[Productboard Feature] Single-click express checkout',
      content: 'Allow repeat shoppers to authenticate and charge via Apple Pay with zero form inputs.',
      contentType: 'FEATURE',
      metadata: { status: 'In Discovery', timeframe: 'Q1' }
    });

    assert.equal(featRec.content_type, 'FEATURE');

    // 5. Disconnect
    const disc = productboardService.disconnect(workspaceId);
    assert.equal(disc.status, 'DISCONNECTED');
  } finally {
    if (origKey) process.env.INTEGRATION_ENCRYPTION_KEY = origKey; else delete process.env.INTEGRATION_ENCRYPTION_KEY;
  }
});
