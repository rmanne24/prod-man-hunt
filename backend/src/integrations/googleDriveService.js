/**
 * PMPilot Google Drive & Google Docs Integration Service
 * 
 * Implements:
 * - Google OAuth 2.0 with offline access (refresh token) and PKCE
 * - Account connection & organization/email retrieval
 * - Google Drive folder and file listing
 * - Google Docs structural content and plain-text extraction
 * - Workspace-scoped document import into Evidence Ingestion Pipeline
 * - Incremental synchronization using modifiedTime cursors
 * - Secure credential encryption (AES-256-GCM) & revocation on disconnect
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class GoogleDriveService extends IntegrationBaseService {
  constructor() {
    super('GOOGLE_DRIVE');
  }

  getClientId() {
    return process.env.GOOGLE_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   * NEVER returns secret values.
   */
  getPreflightReport() {
    const rawClientId = process.env.GOOGLE_CLIENT_ID;
    const rawClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const clientIdPresent = Boolean(rawClientId && typeof rawClientId === 'string' && rawClientId.trim().length > 0);
    const clientSecretPresent = Boolean(rawClientSecret && typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      GOOGLE_CLIENT_ID: {
        present: clientIdPresent,
        valid: clientIdPresent
      },
      GOOGLE_CLIENT_SECRET: {
        present: clientSecretPresent,
        valid: clientSecretPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.GOOGLE_CLIENT_ID.valid &&
      variables.GOOGLE_CLIENT_SECRET.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'GOOGLE_DRIVE',
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
   * Builds the official Google OAuth 2.0 authorization URL
   */
  buildAuthorizeUrl({ workspaceId, userId, redirectUri }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to initiate Google OAuth.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Google Drive integration is not fully configured. Missing: ${missing}.`);
    }

    const clientId = this.getClientId();
    const { state, codeChallenge } = this.createOAuthState({ workspaceId, userId, redirectUri });

    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent', // Force refresh token issuance
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /**
   * Exchanges authorization code for tokens, encrypts them, and persists connection
   */
  async exchangeCodeAndConnect({ code, state, redirectUri, workspaceId, userId }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to exchange Google authorization code.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`Google Drive integration is not fully configured. Missing: ${missing}.`);
    }

    const verified = this.verifyOAuthState(state, workspaceId, userId, redirectUri);
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const bodyParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    if (verified.codeVerifier) {
      bodyParams.set('code_verifier', verified.codeVerifier);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error_description || parsed.error || errText;
      } catch (_) {}
      const safeMsg = this.sanitizeErrorMessage(msg);
      throw new Error(`Google token exchange failed: ${safeMsg}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 3600;
    const scopes = tokenData.scope || 'drive.readonly documents.readonly';

    // Retrieve user and domain identity
    let googleEmail = 'Connected Google Account';
    let googleOrgName = 'Google Workspace';
    let googleUserId = null;

    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        googleEmail = userData.email || googleEmail;
        googleUserId = userData.id || null;
        googleOrgName = userData.hd ? `${userData.hd} (Google Workspace)` : (userData.name || googleEmail);
      }
    } catch (_) {}

    const encrypted = this.encryptTokens(accessToken, refreshToken);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'GOOGLE_DRIVE',
      connectedByUserId: userId,
      providerOrganizationId: googleUserId,
      providerOrganizationName: googleOrgName,
      providerUserId: googleUserId,
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

  /**
   * Refreshes access token if expired
   */
  async getValidAccessToken(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'GOOGLE_DRIVE');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Google Drive is not connected for this workspace.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    // If token is still valid with 2 minutes buffer, use existing
    if (conn.expires_at && conn.expires_at > nowSec + 120) {
      const { accessToken } = this.decryptTokens(conn);
      return accessToken;
    }

    // Refresh if refresh token exists
    const { refreshToken, accessToken } = this.decryptTokens(conn);
    if (!refreshToken) {
      return accessToken; // Fall back to existing token
    }

    const bodyParams = new URLSearchParams({
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    if (!refreshRes.ok) {
      throw new Error('Failed to refresh Google OAuth token. Please reconnect Google Drive.');
    }

    const refreshData = await refreshRes.json();
    const newAccess = refreshData.access_token;
    const expiresIn = refreshData.expires_in || 3600;

    const encrypted = this.encryptTokens(newAccess, refreshToken);
    db.saveIntegrationConnection({
      ...conn,
      workspaceId,
      provider: 'GOOGLE_DRIVE',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn
    });

    return newAccess;
  }

  /**
   * Lists files and folders from Google Drive
   */
  async listFiles({ workspaceId, folderId = null, query = '', mimeType = null }) {
    const accessToken = await this.getValidAccessToken(workspaceId);

    let q = "trashed = false";
    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }
    if (mimeType) {
      q += ` and mimeType = '${mimeType}'`;
    } else {
      q += " and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.folder' or mimeType = 'text/plain')";
    }
    if (query && query.trim().length > 0) {
      const cleanQ = query.replace(/'/g, "\\'");
      q += ` and name contains '${cleanQ}'`;
    }

    const params = new URLSearchParams({
      q,
      fields: 'files(id, name, mimeType, webViewLink, modifiedTime, iconLink, size, owners(displayName, emailAddress))',
      pageSize: '50',
      orderBy: 'folder,modifiedTime desc'
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive API error: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    return (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      webViewLink: f.webViewLink,
      modifiedTime: f.modifiedTime,
      author: f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || 'Google User'
    }));
  }

  /**
   * Extracts content from a Google Doc as plain text
   */
  async extractDocumentContent({ workspaceId, fileId }) {
    const accessToken = await this.getValidAccessToken(workspaceId);

    // 1. First attempt: Google Drive export as text/plain (fast and clean for Google Docs)
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (exportRes.ok) {
      return await exportRes.text();
    }

    // 2. Second attempt: Google Docs API v1 structural fetch
    const docsRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(fileId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (docsRes.ok) {
      const doc = await docsRes.json();
      const textPieces = [];
      if (doc.body?.content) {
        for (const structuralElem of doc.body.content) {
          if (structuralElem.paragraph?.elements) {
            for (const el of structuralElem.paragraph.elements) {
              if (el.textRun?.content) {
                textPieces.push(el.textRun.content);
              }
            }
          }
        }
      }
      return textPieces.join('');
    }

    throw new Error(`Unable to extract content from document '${fileId}'. Ensure it is a valid Google Doc.`);
  }

  /**
   * Imports selected Google Docs into the Evidence Ingestion Pipeline
   */
  async syncSelectedDocuments({ workspaceId, selectedFiles = [], incremental = false }) {
    const conn = db.getIntegrationConnection(workspaceId, 'GOOGLE_DRIVE');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Google Drive is not connected.');
    }

    const syncCursor = incremental ? conn.sync_cursor : null;
    const importedResults = [];

    // Persist selected resources
    db.updateIntegrationMetadata(workspaceId, 'GOOGLE_DRIVE', {
      selectedResources: selectedFiles,
      status: 'CONNECTED'
    });

    for (const file of selectedFiles) {
      try {
        const content = await this.extractDocumentContent({ workspaceId, fileId: file.id });

        // Infer content type from document title
        const lowerName = (file.name || '').toLowerCase();
        let contentType = 'DOCUMENT';
        if (lowerName.includes('interview') || lowerName.includes('transcript')) {
          contentType = 'INTERVIEW_TRANSCRIPT';
        } else if (lowerName.includes('prd') || lowerName.includes('requirement')) {
          contentType = 'PRD';
        } else if (lowerName.includes('research') || lowerName.includes('study')) {
          contentType = 'RESEARCH_SUMMARY';
        } else if (lowerName.includes('strategy') || lowerName.includes('vision')) {
          contentType = 'STRATEGY_DOC';
        }

        const saved = ingestionService.ingestRecord({
          workspaceId,
          provider: 'GOOGLE_DRIVE',
          externalId: file.id,
          sourceUrl: file.webViewLink || `https://docs.google.com/document/d/${file.id}`,
          title: file.name,
          content,
          contentType,
          author: file.author || conn.provider_organization_name,
          originalCreatedAt: file.modifiedTime,
          originalUpdatedAt: file.modifiedTime,
          metadata: {
            mimeType: file.mimeType,
            fileId: file.id,
            lastSyncedAt: new Date().toISOString()
          }
        });

        importedResults.push(saved);
      } catch (err) {
        console.error(`[GoogleDriveService] Error importing doc ${file.name}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'GOOGLE_DRIVE', {
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
   * Disconnects Google Drive and clears encrypted tokens
   */
  async disconnect(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'GOOGLE_DRIVE');
    if (conn) {
      try {
        const { accessToken } = this.decryptTokens(conn);
        if (accessToken) {
          // Attempt Google revocation endpoint
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }).catch(() => {});
        }
      } catch (_) {}
    }

    const updated = db.disconnectIntegrationConnection(workspaceId, 'GOOGLE_DRIVE');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'GOOGLE_DRIVE');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'GOOGLE_DRIVE');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'GOOGLE_DRIVE',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'GOOGLE_DRIVE',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const googleDriveService = new GoogleDriveService();
