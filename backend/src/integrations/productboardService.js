/**
 * PMPilot Productboard Integration Service
 * 
 * Implements:
 * - Productboard Public API v1 Authentication (Bearer API Token)
 * - Customer Feedback Notes & Insights ingestion into Evidence Ingestion Pipeline
 * - Feature and Opportunity references retrieval
 * - Customer quote and company attribution preservation
 * - Explicit documentation of supported vs restricted capabilities:
 *   - SUPPORTED: Read notes, customer insights, tags, features, status
 *   - UNAVAILABLE: Bi-directional sync or automatic push of unapproved roadmap changes
 * - Secure token encryption (AES-256-GCM) & sanitized reporting
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class ProductboardService extends IntegrationBaseService {
  constructor() {
    super('PRODUCTBOARD');
  }

  getApiToken() {
    return process.env.PRODUCTBOARD_API_TOKEN || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   */
  getPreflightReport() {
    const rawToken = process.env.PRODUCTBOARD_API_TOKEN;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const tokenPresent = Boolean(rawToken && typeof rawToken === 'string' && rawToken.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      PRODUCTBOARD_API_TOKEN: {
        present: tokenPresent,
        valid: tokenPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.PRODUCTBOARD_API_TOKEN.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'PRODUCTBOARD',
      status: isFullyConfigured ? 'READY' : 'UNCONFIGURED',
      isFullyConfigured,
      capabilities: {
        supported: [
          'Customer feedback notes ingestion',
          'Feature opportunity hierarchy & prioritization matrix reference',
          'Company and user attribution for verbatim quotes',
          'Tag-based filtering (e.g. checkout, payment-dropoff)'
        ],
        unsupported: [
          'Automatic bi-directional roadmap editing (requires human PM governance)',
          'Automated customer note deletion'
        ]
      },
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
   * Connects workspace to Productboard using an API Token
   */
  async connectWithToken({ workspaceId, userId, token, spaceName = 'Productboard Space' }) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Valid Productboard API Token is required.');
    }

    const cleanToken = token.trim();

    // Verify token with Productboard API
    const testRes = await fetch('https://api.productboard.com/notes?pageLimit=1', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'X-Version': '1',
        'Accept': 'application/json'
      }
    });

    if (!testRes.ok) {
      const err = await testRes.text();
      throw new Error(`Failed to authenticate with Productboard: ${this.sanitizeErrorMessage(err)}`);
    }

    const encrypted = this.encryptTokens(cleanToken);

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'PRODUCTBOARD',
      connectedByUserId: userId,
      providerOrganizationName: spaceName,
      scopes: 'notes:read,features:read',
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    return this.sanitizeConnection(connection);
  }

  async getValidApiToken(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'PRODUCTBOARD');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('Productboard is not connected for this workspace.');
    }
    const { accessToken } = this.decryptTokens(conn);
    return accessToken;
  }

  /**
   * Synchronizes Customer Feedback Notes into Evidence Ingestion Pipeline
   */
  async syncFeedbackNotes({ workspaceId, limit = 50 }) {
    const token = await this.getValidApiToken(workspaceId);

    const res = await fetch(`https://api.productboard.com/notes?pageLimit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Version': '1',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch Productboard notes: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    const importedResults = [];

    for (const note of data.data || []) {
      const content = note.content || note.display_url || '(Empty customer note content)';
      const customerEmail = note.user?.email || note.company?.name || 'Customer';

      const record = ingestionService.ingestRecord({
        workspaceId,
        provider: 'PRODUCTBOARD',
        externalId: note.id,
        sourceUrl: note.display_url || `https://app.productboard.com/notes/${note.id}`,
        title: `[Productboard Feedback] ${note.title || 'Customer Quote'}`,
        content,
        contentType: 'FEEDBACK_NOTE',
        author: customerEmail,
        originalCreatedAt: note.created_at,
        originalUpdatedAt: note.updated_at,
        metadata: {
          noteId: note.id,
          tags: note.tags || [],
          customer: customerEmail,
          company: note.company?.name || null
        }
      });

      importedResults.push(record);
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'PRODUCTBOARD', {
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
   * Synchronizes Product Features & Opportunities for decision alignment
   */
  async syncFeatures({ workspaceId, limit = 50 }) {
    const token = await this.getValidApiToken(workspaceId);

    const res = await fetch(`https://api.productboard.com/features?pageLimit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Version': '1',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch Productboard features: ${this.sanitizeErrorMessage(err)}`);
    }

    const data = await res.json();
    const importedResults = [];

    for (const feat of data.data || []) {
      const record = ingestionService.ingestRecord({
        workspaceId,
        provider: 'PRODUCTBOARD',
        externalId: `feat_${feat.id}`,
        sourceUrl: `https://app.productboard.com/features/${feat.id}`,
        title: `[Productboard Feature] ${feat.name}`,
        content: feat.description || feat.name,
        contentType: 'FEATURE',
        author: 'Productboard Matrix',
        originalCreatedAt: feat.created_at,
        originalUpdatedAt: feat.updated_at,
        metadata: {
          featureId: feat.id,
          status: feat.status?.name,
          timeframe: feat.timeframe?.name
        }
      });

      importedResults.push(record);
    }

    return {
      success: true,
      importedCount: importedResults.length,
      records: importedResults
    };
  }

  /**
   * Disconnects Productboard and clears stored credentials
   */
  disconnect(workspaceId) {
    const updated = db.disconnectIntegrationConnection(workspaceId, 'PRODUCTBOARD');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'PRODUCTBOARD');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'PRODUCTBOARD');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'PRODUCTBOARD',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'PRODUCTBOARD',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const productboardService = new ProductboardService();
