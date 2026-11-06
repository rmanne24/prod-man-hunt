/**
 * PMPilot Notion Integration Service
 * 
 * Implements:
 * - Notion OAuth 2.0 & Internal Integration Token support
 * - Search & selection of pages and databases
 * - Block content extraction for PRDs and product documentation
 * - Evidence Ingestion Pipeline import with provenance
 * - Export / Publish approved PMPilot PRD documents to Notion
 * - Strict Human PM approval guard before publishing to Notion
 * - Secure credential encryption (AES-256-GCM) & sanitized reporting
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class NotionService extends IntegrationBaseService {
  constructor() {
    super('NOTION');
  }

  getClientId() {
    return process.env.NOTION_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.NOTION_CLIENT_SECRET || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   */
  getPreflightReport() {
    const rawClientId = process.env.NOTION_CLIENT_ID;
    const rawClientSecret = process.env.NOTION_CLIENT_SECRET;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const clientIdPresent = Boolean(rawClientId && typeof rawClientId === 'string' && rawClientId.trim().length > 0);
    const clientSecretPresent = Boolean(rawClientSecret && typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      NOTION_CLIENT_ID: {
        present: clientIdPresent,
        valid: clientIdPresent
      },
      NOTION_CLIENT_SECRET: {
        present: clientSecretPresent,
        valid: clientSecretPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.NOTION_CLIENT_ID.valid &&
      variables.NOTION_CLIENT_SECRET.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'NOTION',
      status: isFullyConfigured ? 'READY' : 'UNCONFIGURED',
      isFullyConfigured,
      variables
    };
  }

  isConfigured() {
    return this.getPreflightReport().isFullyConfigured;
  }

  getMissingVariables() {
    const preflight = this.getPreflightReport();
    return Object.entries(preflight.variables)
      .filter(([_, check]) => !check.valid)
      .map(([name, check]) => (!check.present ? name : `${name} (invalid)`));
  }

  /**
   * Builds official Notion OAuth authorization URL
   */
  buildAuthorizeUrl({ workspaceId, userId, redirectUri }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to initiate Notion OAuth.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Notion integration is not fully configured. Missing: ${missing}.`);
    }

    const clientId = this.getClientId();
    const { state } = this.createOAuthState({ workspaceId, userId, redirectUri });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: redirectUri,
      state
    });

    return {
      url: `https://api.notion.com/v1/oauth/authorize?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /**
   * Exchanges authorization code for Notion access token using HTTP Basic Auth
   */
  async exchangeCodeAndConnect({ code, state, redirectUri, workspaceId, userId }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to exchange Notion authorization code.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Notion integration is not fully configured. Missing: ${missing}.`);
    }

    this.verifyOAuthState(state, workspaceId, userId, redirectUri);
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Notion token exchange failed: ${this.sanitizeErrorMessage(err)}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const notionWsName = tokenData.workspace_name || 'Notion Workspace';
    const notionWsId = tokenData.workspace_id || null;
    const botId = tokenData.bot_id || null;

    return await this.saveConnectionWithToken({
      workspaceId,
      userId,
      accessToken,
      orgId: notionWsId,
      orgName: notionWsName,
      botId,
      scopes: 'pages:read,pages:write,databases:read'
    });
  }

  /**
   * Allows direct connection with an Internal Integration Token (secret_...)
   */
  async connectWithToken({ workspaceId, userId, token, workspaceName = 'Notion Workspace' }) {
    if (!token || typeof token !== 'string' || !token.startsWith('secret_')) {
      throw new Error("Valid Notion Integration Secret is required (starts with 'secret_').");
    }

    // Verify token with Notion API
    let botId = null;
    let verifiedName = workspaceName;

    try {
      const meRes = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Notion-Version': '2022-06-28'
        }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        botId = me.id;
        verifiedName = me.name ? `${me.name} (${workspaceName})` : workspaceName;
      }
    } catch (_) {}

    return await this.saveConnectionWithToken({
      workspaceId,
      userId,
      accessToken: token.trim(),
      orgId: botId,
      orgName: verifiedName,
      botId,
      scopes: 'internal_integration:read_write'
    });
  }

  async saveConnectionWithToken({ workspaceId, userId, accessToken, orgId, orgName, botId, scopes }) {
    const encrypted = this.encryptTokens(accessToken);

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'NOTION',
      connectedByUserId: userId,
      providerOrganizationId: orgId,
      providerOrganizationName: orgName,
      providerUserId: botId,
      scopes: scopes || 'pages:read,pages:write',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    return this.sanitizeConnection(connection);
  }

  async getValidAccessToken(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'NOTION');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Notion is not connected for this workspace.');
    }
    const { accessToken } = this.decryptTokens(conn);
    return accessToken;
  }

  /**
   * Searches pages and databases shared with the Notion integration
   */
  async searchPages(workspaceId, query = '') {
    const token = await this.getValidAccessToken(workspaceId);

    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        query,
        page_size: 50,
        sort: { direction: 'descending', timestamp: 'last_edited_time' }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to search Notion pages: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    return (data.results || []).map(item => {
      let title = 'Untitled';
      if (item.properties?.title?.title?.[0]?.plain_text) {
        title = item.properties.title.title[0].plain_text;
      } else if (item.properties?.Name?.title?.[0]?.plain_text) {
        title = item.properties.Name.title[0].plain_text;
      } else if (item.title?.[0]?.plain_text) {
        title = item.title[0].plain_text;
      }

      return {
        id: item.id,
        title,
        objectType: item.object, // 'page' | 'database'
        url: item.url,
        lastEditedTime: item.last_edited_time,
        createdTime: item.created_time
      };
    });
  }

  /**
   * Synchronizes selected Notion pages into the Evidence Ingestion Pipeline
   */
  async syncSelectedPages({ workspaceId, selectedPages = [] }) {
    const token = await this.getValidAccessToken(workspaceId);
    const importedResults = [];

    // Save selected resources
    db.updateIntegrationMetadata(workspaceId, 'NOTION', {
      selectedResources: selectedPages,
      status: 'CONNECTED'
    });

    for (const page of selectedPages) {
      try {
        // Fetch blocks for page
        const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': '2022-06-28'
          }
        });

        let textContent = '';
        if (blocksRes.ok) {
          const blocks = await blocksRes.json();
          const lines = [];
          for (const block of blocks.results || []) {
            const blockType = block.type;
            const textObj = block[blockType]?.rich_text;
            if (Array.isArray(textObj)) {
              const line = textObj.map(t => t.plain_text).join('');
              if (line.trim()) lines.push(line);
            }
          }
          textContent = lines.join('\n\n');
        }

        const lowerTitle = (page.title || '').toLowerCase();
        let contentType = 'PRODUCT_DOC';
        if (lowerTitle.includes('prd') || lowerTitle.includes('requirement')) {
          contentType = 'PRD';
        } else if (lowerTitle.includes('interview') || lowerTitle.includes('feedback')) {
          contentType = 'INTERVIEW_TRANSCRIPT';
        }

        const record = ingestionService.ingestRecord({
          workspaceId,
          provider: 'NOTION',
          externalId: page.id,
          sourceUrl: page.url,
          title: page.title || 'Notion Page',
          content: textContent || '(Empty or restricted page content)',
          contentType,
          author: 'Notion Workspace',
          originalCreatedAt: page.createdTime,
          originalUpdatedAt: page.lastEditedTime,
          metadata: {
            pageId: page.id,
            objectType: page.objectType || 'page'
          }
        });

        importedResults.push(record);
      } catch (err) {
        console.error(`[NotionService] Error syncing page ${page.id}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'NOTION', {
      lastSyncedAt: nowIso,
      syncCursor: nowIso,
      errorState: null
    });

    return {
      success: true,
      importedCount: importedResults.length,
      records: importedResults
    };
  }

  /**
   * Publishes an approved PMPilot PRD to Notion under an approved parent page
   * STRICT GUARD: Fails if decision is not human-approved!
   */
  async publishApprovedPrd({ workspaceId, decision, parentPageId, titlePrefix = 'PRD:' }) {
    // 1. Strict approval guard
    const decisionState = decision.state || 'INITIAL';
    const isApproved = decisionState === 'APPROVED' || decisionState === 'ARTIFACT_GENERATED';
    if (!isApproved) {
      throw new Error(`Cannot publish to Notion: Decision v${decision.version} has not been approved by a Human PM.`);
    }

    const token = await this.getValidAccessToken(workspaceId);
    const pageTitle = `${titlePrefix} ${decision.name || 'Decision Specification'} (v${decision.version})`;

    const blocks = [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: pageTitle } }] }
      },
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{
            type: 'text',
            text: {
              content: `Human PM Approved · Canonical Decision Version v${decision.version} · Exported from PMPilot on ${new Date().toLocaleDateString()}`
            }
          }]
        }
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Executive Recommendation' } }] }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: decision.summary || decision.description || 'Approved decision specification.' } }] }
      }
    ];

    const body = {
      parent: parentPageId ? { page_id: parentPageId } : { workspace: true },
      properties: {
        title: { title: [{ type: 'text', text: { content: pageTitle } }] }
      },
      children: blocks
    };

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to publish PRD to Notion: ${this.sanitizeErrorMessage(err)}`);
    }

    const createdPage = await res.json();
    return {
      success: true,
      pageId: createdPage.id,
      url: createdPage.url,
      decisionVersion: decision.version
    };
  }

  /**
   * Disconnects Notion and clears stored credentials
   */
  disconnect(workspaceId) {
    const updated = db.disconnectIntegrationConnection(workspaceId, 'NOTION');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'NOTION');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'NOTION');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'NOTION',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'NOTION',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const notionService = new NotionService();
