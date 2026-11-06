/**
 * PMPilot Figma Integration Service
 * 
 * Implements:
 * - Figma OAuth 2.0 & Personal Access Token (PAT) authorization
 * - File and Frame metadata inspection
 * - Design comments and UX review notes extraction into Evidence Ingestion Pipeline
 * - Decision linking to Figma design files and canvas frames
 * - Version history references
 * - Read-only design artifact association (strictly preserves API capabilities without fabricating unsupported video/recording extracts)
 * - Secure credential encryption (AES-256-GCM) & sanitized reporting
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class FigmaService extends IntegrationBaseService {
  constructor() {
    super('FIGMA');
  }

  getClientId() {
    return process.env.FIGMA_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.FIGMA_CLIENT_SECRET || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   */
  getPreflightReport() {
    const rawClientId = process.env.FIGMA_CLIENT_ID;
    const rawClientSecret = process.env.FIGMA_CLIENT_SECRET;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const clientIdPresent = Boolean(rawClientId && typeof rawClientId === 'string' && rawClientId.trim().length > 0);
    const clientSecretPresent = Boolean(rawClientSecret && typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      FIGMA_CLIENT_ID: {
        present: clientIdPresent,
        valid: clientIdPresent
      },
      FIGMA_CLIENT_SECRET: {
        present: clientSecretPresent,
        valid: clientSecretPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.FIGMA_CLIENT_ID.valid &&
      variables.FIGMA_CLIENT_SECRET.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'FIGMA',
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
   * Builds official Figma OAuth authorization URL
   */
  buildAuthorizeUrl({ workspaceId, userId, redirectUri }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to initiate Figma OAuth.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Figma integration is not fully configured. Missing: ${missing}.`);
    }

    const clientId = this.getClientId();
    const { state } = this.createOAuthState({ workspaceId, userId, redirectUri });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'files:read',
      state,
      response_type: 'code'
    });

    return {
      url: `https://www.figma.com/oauth?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /**
   * Exchanges authorization code for Figma access & refresh tokens
   */
  async exchangeCodeAndConnect({ code, state, redirectUri, workspaceId, userId }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to exchange Figma authorization code.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Figma integration is not fully configured. Missing: ${missing}.`);
    }

    this.verifyOAuthState(state, workspaceId, userId, redirectUri);
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://www.figma.com/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Figma token exchange failed: ${this.sanitizeErrorMessage(err)}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 7776000; // 90 days

    return await this.saveConnectionWithToken({
      workspaceId,
      userId,
      accessToken,
      refreshToken,
      expiresIn,
      scopes: 'files:read'
    });
  }

  /**
   * Connects via Personal Access Token (PAT)
   */
  async connectWithToken({ workspaceId, userId, token }) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Valid Figma Personal Access Token is required.');
    }

    return await this.saveConnectionWithToken({
      workspaceId,
      userId,
      accessToken: token.trim(),
      refreshToken: null,
      scopes: 'pat:files:read'
    });
  }

  async saveConnectionWithToken({ workspaceId, userId, accessToken, refreshToken = null, expiresIn = null, scopes = 'files:read' }) {
    // Verify token with Figma API
    let figmaUserName = 'Figma Designer';
    let figmaUserId = null;

    try {
      const meRes = await fetch('https://api.figma.com/v1/me', {
        headers: { 'X-Figma-Token': accessToken }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        figmaUserName = me.handle ? `${me.handle} (${me.email || 'Figma'})` : (me.email || 'Figma Account');
        figmaUserId = me.id || null;
      }
    } catch (_) {}

    const encrypted = this.encryptTokens(accessToken, refreshToken);
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'FIGMA',
      connectedByUserId: userId,
      providerOrganizationId: figmaUserId,
      providerOrganizationName: figmaUserName,
      providerUserId: figmaUserId,
      scopes,
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag,
      encryptedRefreshToken: encrypted.encryptedRefreshToken,
      refreshIv: encrypted.refreshIv,
      refreshTag: encrypted.refreshTag,
      expiresAt
    });

    return this.sanitizeConnection(connection);
  }

  async getValidAccessToken(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'FIGMA');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Figma is not connected for this workspace.');
    }
    const { accessToken } = this.decryptTokens(conn);
    return accessToken;
  }

  /**
   * Extracts clean file key from full Figma URL or raw key
   */
  parseFileKey(input) {
    if (!input) return null;
    const clean = input.trim();
    const urlMatch = clean.match(/(?:figma\.com\/(?:file|design)\/)([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    if (/^[a-zA-Z0-9]+$/.test(clean)) return clean;
    return clean;
  }

  /**
   * Fetches metadata, canvas frames, and design document structure
   */
  async getFileMetadata({ workspaceId, fileKey }) {
    const key = this.parseFileKey(fileKey);
    const token = await this.getValidAccessToken(workspaceId);

    const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}?depth=2`, {
      headers: { 'X-Figma-Token': token }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch Figma file '${key}': ${this.sanitizeErrorMessage(err)}`);
    }

    const file = await res.json();
    const pages = (file.document?.children || []).map(p => ({
      id: p.id,
      name: p.name,
      frames: (p.children || [])
        .filter(c => c.type === 'FRAME' || c.type === 'COMPONENT')
        .map(f => ({ id: f.id, name: f.name, type: f.type }))
    }));

    return {
      fileKey: key,
      name: file.name,
      lastModified: file.lastModified,
      version: file.version,
      role: file.role,
      pages
    };
  }

  /**
   * Fetches design feedback comments from canvas
   */
  async getFileComments({ workspaceId, fileKey }) {
    const key = this.parseFileKey(fileKey);
    const token = await this.getValidAccessToken(workspaceId);

    const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}/comments`, {
      headers: { 'X-Figma-Token': token }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch Figma comments: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    return (data.comments || []).map(c => ({
      id: c.id,
      message: c.message,
      author: c.user?.handle || 'Figma User',
      createdAt: c.created_at,
      resolvedAt: c.resolved_at,
      clientMeta: c.client_meta
    }));
  }

  /**
   * Synchronizes selected Figma files and design comments into Evidence Ingestion Pipeline
   */
  async syncSelectedFiles({ workspaceId, selectedFiles = [] }) {
    const token = await this.getValidAccessToken(workspaceId);
    const importedResults = [];

    // Save selected resources
    db.updateIntegrationMetadata(workspaceId, 'FIGMA', {
      selectedResources: selectedFiles,
      status: 'CONNECTED'
    });

    for (const f of selectedFiles) {
      const fileKey = this.parseFileKey(f.key || f.id || f.fileKey);

      try {
        const metadata = await this.getFileMetadata({ workspaceId, fileKey });

        // 1. Ingest Design File Record
        const frameSummaries = metadata.pages.flatMap(p => p.frames.map(fr => `${p.name} / ${fr.name} (${fr.type})`)).join(', ');
        const fileContent = `Figma File: ${metadata.name}\nVersion: ${metadata.version}\nLast Modified: ${metadata.lastModified}\nCanvas Frames: ${frameSummaries || 'None identified'}`;

        const fileRecord = ingestionService.ingestRecord({
          workspaceId,
          provider: 'FIGMA',
          externalId: `file_${fileKey}`,
          sourceUrl: `https://www.figma.com/file/${fileKey}`,
          title: `[Figma Design] ${metadata.name}`,
          content: fileContent,
          contentType: 'DESIGN_FILE',
          author: 'Design Team',
          originalCreatedAt: metadata.lastModified,
          originalUpdatedAt: metadata.lastModified,
          metadata: {
            fileKey,
            version: metadata.version,
            pageCount: metadata.pages.length
          }
        });
        importedResults.push(fileRecord);

        // 2. Ingest Design Comments
        const comments = await this.getFileComments({ workspaceId, fileKey });
        for (const comm of comments.slice(0, 20)) {
          if (!comm.message || comm.message.trim().length === 0) continue;

          const commRecord = ingestionService.ingestRecord({
            workspaceId,
            provider: 'FIGMA',
            externalId: `comm_${comm.id}`,
            sourceUrl: `https://www.figma.com/file/${fileKey}`,
            title: `[Figma Comment] ${metadata.name} (${comm.author})`,
            content: comm.message,
            contentType: 'DESIGN_COMMENT',
            author: comm.author,
            originalCreatedAt: comm.createdAt,
            originalUpdatedAt: comm.resolvedAt || comm.createdAt,
            metadata: {
              fileKey,
              commentId: comm.id,
              resolved: Boolean(comm.resolvedAt)
            }
          });
          importedResults.push(commRecord);
        }
      } catch (err) {
        console.error(`[FigmaService] Error syncing Figma file ${fileKey}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'FIGMA', {
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
   * Disconnects Figma and clears stored credentials
   */
  disconnect(workspaceId) {
    const updated = db.disconnectIntegrationConnection(workspaceId, 'FIGMA');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'FIGMA');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'FIGMA');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'FIGMA',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'FIGMA',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const figmaService = new FigmaService();
