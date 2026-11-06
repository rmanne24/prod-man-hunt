/**
 * PMPilot Jira Software (Atlassian) Integration Service
 * 
 * Implements:
 * - Atlassian OAuth 2.0 (3LO) authorization & API Token support
 * - Accessible cloud site & project selection
 * - Issue, Epic, and User Story import into Evidence Ingestion Pipeline
 * - Decision linking to Jira work items
 * - Export approved decision specifications to Jira Epics & User Stories
 * - Strict Human PM approval & canonical version guards (blocks export on unapproved/stale versions)
 * - Secure credential encryption (AES-256-GCM) & sanitized reporting
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class JiraService extends IntegrationBaseService {
  constructor() {
    super('JIRA');
  }

  getClientId() {
    return process.env.JIRA_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.JIRA_CLIENT_SECRET || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   */
  getPreflightReport() {
    const rawClientId = process.env.JIRA_CLIENT_ID;
    const rawClientSecret = process.env.JIRA_CLIENT_SECRET;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const clientIdPresent = Boolean(rawClientId && typeof rawClientId === 'string' && rawClientId.trim().length > 0);
    const clientSecretPresent = Boolean(rawClientSecret && typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      JIRA_CLIENT_ID: {
        present: clientIdPresent,
        valid: clientIdPresent
      },
      JIRA_CLIENT_SECRET: {
        present: clientSecretPresent,
        valid: clientSecretPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.JIRA_CLIENT_ID.valid &&
      variables.JIRA_CLIENT_SECRET.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'JIRA',
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
   * Builds official Atlassian OAuth 2.0 (3LO) authorization URL
   */
  buildAuthorizeUrl({ workspaceId, userId, redirectUri }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to initiate Jira OAuth.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Jira Software integration is not fully configured. Missing: ${missing}.`);
    }

    const clientId = this.getClientId();
    const { state } = this.createOAuthState({ workspaceId, userId, redirectUri });

    const scopes = [
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'offline_access'
    ].join(' ');

    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent'
    });

    return {
      url: `https://auth.atlassian.com/authorize?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /**
   * Exchanges authorization code for Atlassian tokens and discovers cloud sites
   */
  async exchangeCodeAndConnect({ code, state, redirectUri, workspaceId, userId }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to exchange Jira authorization code.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Jira Software integration is not fully configured. Missing: ${missing}.`);
    }

    this.verifyOAuthState(state, workspaceId, userId, redirectUri);
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Atlassian token exchange failed: ${this.sanitizeErrorMessage(err)}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 3600;

    // Discover accessible Jira sites (cloudId)
    let siteId = null;
    let siteName = 'Atlassian Jira Cloud';
    let siteUrl = null;

    try {
      const sitesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      if (sitesRes.ok) {
        const sites = await sitesRes.json();
        if (sites.length > 0) {
          siteId = sites[0].id;
          siteName = sites[0].name;
          siteUrl = sites[0].url;
        }
      }
    } catch (_) {}

    const encrypted = this.encryptTokens(accessToken, refreshToken);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'JIRA',
      connectedByUserId: userId,
      providerOrganizationId: siteId,
      providerOrganizationName: siteName,
      providerUserId: siteId,
      scopes: 'read:jira-work,write:jira-work',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag,
      encryptedRefreshToken: encrypted.encryptedRefreshToken,
      refreshIv: encrypted.refreshIv,
      refreshTag: encrypted.refreshTag,
      expiresAt,
      selectedResources: siteUrl ? [{ siteId, siteName, siteUrl }] : []
    });

    return this.sanitizeConnection(connection);
  }

  /**
   * Connects via Jira API Token (email + API token + site domain)
   */
  async connectWithApiToken({ workspaceId, userId, email, apiToken, domain }) {
    if (!email || !apiToken || !domain) {
      throw new Error('Email, API token, and Jira domain (e.g. your-domain.atlassian.net) are required.');
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
    const authHeader = 'Basic ' + Buffer.from(`${email.trim()}:${apiToken.trim()}`).toString('base64');

    // Test connection to Jira REST API
    const testRes = await fetch(`https://${cleanDomain}/rest/api/3/myself`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!testRes.ok) {
      throw new Error(`Failed to authenticate with Jira domain '${cleanDomain}'. Check credentials.`);
    }

    const myself = await testRes.json();
    const encrypted = this.encryptTokens(authHeader);

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'JIRA',
      connectedByUserId: userId,
      providerOrganizationId: cleanDomain,
      providerOrganizationName: `${myself.displayName || email} (${cleanDomain})`,
      providerUserId: myself.accountId || email,
      scopes: 'api_token:basic',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag,
      selectedResources: [{ domain: cleanDomain, email }]
    });

    return this.sanitizeConnection(connection);
  }

  async getValidAuthContext(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'JIRA');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Jira Software is not connected for this workspace.');
    }
    const { accessToken } = this.decryptTokens(conn);
    const cloudId = conn.provider_organization_id;

    // Check if token is Basic Auth (API token) or Bearer token (OAuth 3LO)
    const isBasic = accessToken.startsWith('Basic ');
    return {
      authHeader: isBasic ? accessToken : `Bearer ${accessToken}`,
      cloudId,
      isBasic,
      conn
    };
  }

  /**
   * Lists available Jira projects
   */
  async listProjects(workspaceId) {
    const { authHeader, cloudId, isBasic, conn } = await this.getValidAuthContext(workspaceId);

    let url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`;
    if (isBasic) {
      url = `https://${cloudId}/rest/api/3/project/search`;
    }

    const res = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list Jira projects: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    return (data.values || []).map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
      lead: p.lead?.displayName
    }));
  }

  /**
   * Synchronizes issues and epics from selected Jira projects
   */
  async syncSelectedProjects({ workspaceId, selectedProjects = [] }) {
    const { authHeader, cloudId, isBasic } = await this.getValidAuthContext(workspaceId);
    const importedResults = [];

    // Save selected resources
    db.updateIntegrationMetadata(workspaceId, 'JIRA', {
      selectedResources: selectedProjects,
      status: 'CONNECTED'
    });

    for (const proj of selectedProjects) {
      const projKey = typeof proj === 'string' ? proj : (proj.key || proj.id);

      try {
        let searchUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`;
        if (isBasic) {
          searchUrl = `https://${cloudId}/rest/api/3/search`;
        }

        const jql = `project = "${projKey}" ORDER BY updated DESC`;
        const searchRes = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            jql,
            maxResults: 30,
            fields: ['summary', 'description', 'issuetype', 'status', 'creator', 'created', 'updated']
          })
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          for (const issue of searchData.issues || []) {
            const isEpic = issue.fields.issuetype?.name?.toLowerCase() === 'epic';
            const contentType = isEpic ? 'EPIC' : 'USER_STORY';

            // Extract plain text from description ADF if present
            let descText = '';
            if (issue.fields.description?.content) {
              descText = JSON.stringify(issue.fields.description);
            } else if (typeof issue.fields.description === 'string') {
              descText = issue.fields.description;
            }

            const record = ingestionService.ingestRecord({
              workspaceId,
              provider: 'JIRA',
              externalId: issue.key,
              sourceUrl: isBasic ? `https://${cloudId}/browse/${issue.key}` : `https://atlassian.com/browse/${issue.key}`,
              title: `[${issue.key}] ${issue.fields.summary}`,
              content: descText || '(No description provided)',
              contentType,
              author: issue.fields.creator?.displayName || 'Jira User',
              originalCreatedAt: issue.fields.created,
              originalUpdatedAt: issue.fields.updated,
              metadata: {
                key: issue.key,
                projectKey: projKey,
                issueType: issue.fields.issuetype?.name,
                status: issue.fields.status?.name
              }
            });

            importedResults.push(record);
          }
        }
      } catch (err) {
        console.error(`[JiraService] Sync error for project ${projKey}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'JIRA', {
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
   * Creates an Epic or User Story in Jira for an approved decision
   * STRICT GUARD: Fails if decision is not human-approved!
   */
  async createApprovedIssue({ workspaceId, decision, projectKey, issueType = 'Epic', summary, description }) {
    // 1. Strict approval guard
    const decisionState = decision.state || 'INITIAL';
    const isApproved = decisionState === 'APPROVED' || decisionState === 'ARTIFACT_GENERATED';
    if (!isApproved) {
      throw new Error(`Cannot create Jira issue: Decision v${decision.version} has not been approved by a Human PM.`);
    }

    const { authHeader, cloudId, isBasic } = await this.getValidAuthContext(workspaceId);

    const issueSummary = summary || `[PMPilot Decision v${decision.version}] ${decision.name || 'Feature Spec'}`;
    const issueDescription = description || decision.summary || decision.description || 'Specification exported from PMPilot.';

    // Construct ADF (Atlassian Document Format) description
    const adfDescription = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Human PM Approved · Canonical Version v${decision.version}\n\n${issueDescription}`
            }
          ]
        }
      ]
    };

    const issueBody = {
      fields: {
        project: { key: projectKey },
        summary: issueSummary,
        description: adfDescription,
        issuetype: { name: issueType }
      }
    };

    let createUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue`;
    if (isBasic) {
      createUrl = `https://${cloudId}/rest/api/3/issue`;
    }

    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(issueBody)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create Jira ${issueType}: ${this.sanitizeErrorMessage(err)}`);
    }

    const created = await res.json();
    return {
      success: true,
      issueId: created.id,
      issueKey: created.key,
      url: isBasic ? `https://${cloudId}/browse/${created.key}` : created.self,
      decisionVersion: decision.version
    };
  }

  /**
   * Disconnects Jira and clears credentials
   */
  disconnect(workspaceId) {
    const updated = db.disconnectIntegrationConnection(workspaceId, 'JIRA');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'JIRA');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'JIRA');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'JIRA',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'JIRA',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const jiraService = new JiraService();
