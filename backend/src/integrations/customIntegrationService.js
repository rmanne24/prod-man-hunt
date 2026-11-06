/**
 * PMPilot Custom Integration Service
 * 
 * Implements:
 * - Workspace-scoped Custom REST APIs and Custom Webhooks
 * - AES-256-GCM encryption for API tokens, keys, and webhook signing secrets
 * - SSRF protection: blocks private IPs, loopback, link-local, and cloud metadata
 * - Cryptographic HMAC-SHA256 signature generation for webhook deliveries
 * - Safe test-connection and test-event verification with timeouts and size limits
 * - Strict credential redaction in all API responses
 * - Complete workspace isolation
 */

import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ssrfProtection } from '../services/ssrfProtection.js';

const DISALLOWED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'set-cookie',
  'authorization'
]);

export class CustomIntegrationService {
  /**
   * Sanitizes custom headers to prevent protocol manipulation or header injection
   * @param {Record<string, string>} headers 
   * @returns {Record<string, string>}
   */
  sanitizeCustomHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const sanitized = {};
    for (const [rawKey, rawVal] of Object.entries(headers)) {
      if (typeof rawKey !== 'string' || typeof rawVal !== 'string') continue;
      const key = rawKey.trim().toLowerCase();
      if (!key || DISALLOWED_HEADERS.has(key)) continue;
      // Header names must be alphanumeric with hyphens
      if (!/^[a-zA-Z0-9\-_]+$/.test(key)) continue;
      // Strip newlines to prevent header injection
      const val = rawVal.replace(/[\r\n]+/g, ' ').trim();
      sanitized[key] = val;
    }
    return sanitized;
  }

  /**
   * Redacts sensitive secret material from a custom integration record before sending to UI
   * @param {any} item 
   * @returns {any}
   */
  sanitizeRecord(item) {
    if (!item) return null;
    const { encryptedSecret, secretIv, secretTag, signingSecret, ...safe } = item;
    return {
      ...safe,
      hasSecret: Boolean(encryptedSecret),
      secretMasked: encryptedSecret ? '••••••••' : null,
      signingSecretMasked: signingSecret
        ? (signingSecret.startsWith('whsec_') ? 'whsec_••••••••' : '••••••••')
        : null,
      signingSecretPreview: signingSecret ? `${signingSecret.slice(0, 10)}••••` : null
    };
  }

  /**
   * Creates a new custom integration in the workspace
   * @param {string} workspaceId 
   * @param {string} userId 
   * @param {any} data 
   */
  async create(workspaceId, userId, data) {
    if (!workspaceId) throw new Error('workspaceId is required.');
    if (!userId) throw new Error('userId is required.');

    const name = data.name ? data.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      throw new Error('Integration name must be between 2 and 100 characters.');
    }

    const type = data.type ? data.type.toUpperCase() : '';
    if (type !== 'CUSTOM_API' && type !== 'CUSTOM_WEBHOOK') {
      throw new Error("Invalid integration type. Must be 'CUSTOM_API' or 'CUSTOM_WEBHOOK'.");
    }

    const url = data.url ? data.url.trim() : '';
    if (!url) throw new Error('Integration URL / endpoint is required.');

    // SSRF Check
    const ssrfCheck = await ssrfProtection.validateTargetUrl(url);
    if (!ssrfCheck.valid) {
      throw new Error(`Invalid integration URL: ${ssrfCheck.error}`);
    }

    let encryptedSecret = null;
    let secretIv = null;
    let secretTag = null;
    let authType = 'NONE';
    let authHeaderName = null;
    let customHeaders = {};

    if (type === 'CUSTOM_API') {
      authType = ['NONE', 'BEARER', 'API_KEY', 'BASIC'].includes(data.authType) ? data.authType : 'NONE';
      authHeaderName = data.authHeaderName ? data.authHeaderName.trim() : (authType === 'API_KEY' ? 'X-API-Key' : null);

      if (data.secret && typeof data.secret === 'string' && data.secret.trim().length > 0) {
        const enc = encryptionService.encrypt(data.secret.trim());
        encryptedSecret = enc.encrypted;
        secretIv = enc.iv;
        secretTag = enc.tag;
      }

      customHeaders = this.sanitizeCustomHeaders(data.customHeaders);
    }

    let events = [];
    let signingSecret = null;

    if (type === 'CUSTOM_WEBHOOK') {
      const allowedEvents = [
        'decision.created',
        'decision.approved',
        'decision.mutated',
        'proposal.accepted',
        'proposal.created',
        'conflict.detected',
        'conflict.resolved',
        'signal.captured'
      ];

      if (Array.isArray(data.events)) {
        events = data.events.filter(e => allowedEvents.includes(e));
      }
      if (events.length === 0) {
        events = ['decision.approved', 'proposal.accepted'];
      }

      signingSecret = data.signingSecret && typeof data.signingSecret === 'string' && data.signingSecret.trim().length >= 16
        ? data.signingSecret.trim()
        : `whsec_${crypto.randomBytes(24).toString('hex')}`;
    }

    const created = db.createCustomIntegration({
      workspaceId,
      userId,
      name,
      description: data.description ? data.description.trim() : null,
      type,
      url,
      authType,
      authHeaderName,
      encryptedSecret,
      secretIv,
      secretTag,
      customHeaders,
      events,
      signingSecret,
      isEnabled: data.isEnabled !== false,
      status: 'ACTIVE'
    });

    return this.sanitizeRecord(created);
  }

  /**
   * Retrieves a sanitized custom integration for a workspace
   */
  async get(workspaceId, id) {
    const item = db.getCustomIntegration(workspaceId, id);
    if (!item) return null;
    return this.sanitizeRecord(item);
  }

  /**
   * Lists all custom integrations for a workspace (all secrets redacted)
   */
  async list(workspaceId) {
    const items = db.listCustomIntegrations(workspaceId);
    return items.map(item => this.sanitizeRecord(item));
  }

  /**
   * Updates an existing custom integration
   */
  async update(workspaceId, id, data) {
    const existing = db.getCustomIntegration(workspaceId, id);
    if (!existing) {
      throw new Error(`Custom integration '${id}' not found in this workspace.`);
    }

    const updates = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (name.length < 2 || name.length > 100) {
        throw new Error('Integration name must be between 2 and 100 characters.');
      }
      updates.name = name;
    }

    if (data.description !== undefined) {
      updates.description = data.description ? data.description.trim() : null;
    }

    if (data.url !== undefined) {
      const url = data.url.trim();
      const ssrfCheck = await ssrfProtection.validateTargetUrl(url);
      if (!ssrfCheck.valid) {
        throw new Error(`Invalid integration URL: ${ssrfCheck.error}`);
      }
      updates.url = url;
    }

    if (existing.type === 'CUSTOM_API') {
      if (data.authType !== undefined) {
        updates.authType = ['NONE', 'BEARER', 'API_KEY', 'BASIC'].includes(data.authType) ? data.authType : existing.authType;
      }
      if (data.authHeaderName !== undefined) {
        updates.authHeaderName = data.authHeaderName ? data.authHeaderName.trim() : null;
      }
      if (data.secret && typeof data.secret === 'string' && data.secret.trim().length > 0 && data.secret !== '••••••••') {
        const enc = encryptionService.encrypt(data.secret.trim());
        updates.encryptedSecret = enc.encrypted;
        updates.secretIv = enc.iv;
        updates.secretTag = enc.tag;
      }
      if (data.customHeaders !== undefined) {
        updates.customHeaders = this.sanitizeCustomHeaders(data.customHeaders);
      }
    }

    if (existing.type === 'CUSTOM_WEBHOOK') {
      if (Array.isArray(data.events)) {
        updates.events = data.events;
      }
      if (data.signingSecret && typeof data.signingSecret === 'string' && data.signingSecret.trim().length >= 16) {
        updates.signingSecret = data.signingSecret.trim();
      }
    }

    if (data.isEnabled !== undefined) {
      updates.isEnabled = Boolean(data.isEnabled);
    }

    const updated = db.updateCustomIntegration(workspaceId, id, updates);
    return this.sanitizeRecord(updated);
  }

  /**
   * Deletes a custom integration
   */
  async delete(workspaceId, id) {
    const existing = db.getCustomIntegration(workspaceId, id);
    if (!existing) {
      throw new Error(`Custom integration '${id}' not found in this workspace.`);
    }
    const success = db.deleteCustomIntegration(workspaceId, id);
    return { success, id, message: 'Custom integration deleted.' };
  }

  /**
   * Toggles enabled/disabled state
   */
  async toggle(workspaceId, id, isEnabled) {
    const updated = db.toggleCustomIntegration(workspaceId, id, isEnabled);
    if (!updated) {
      throw new Error(`Custom integration '${id}' not found in this workspace.`);
    }
    return this.sanitizeRecord(updated);
  }

  /**
   * Tests a custom integration connection or webhook delivery
   */
  async test(workspaceId, id) {
    const item = db.getCustomIntegration(workspaceId, id);
    if (!item) {
      throw new Error(`Custom integration '${id}' not found in this workspace.`);
    }

    const startTime = Date.now();

    if (item.type === 'CUSTOM_API') {
      const headers = { ...item.customHeaders };

      // Inject authentication credentials if configured
      if (item.encryptedSecret) {
        try {
          const decryptedSecret = encryptionService.decrypt({
            encrypted: item.encryptedSecret,
            iv: item.secretIv,
            tag: item.secretTag
          });

          if (item.authType === 'BEARER') {
            headers['Authorization'] = `Bearer ${decryptedSecret}`;
          } else if (item.authType === 'API_KEY') {
            const headerName = item.authHeaderName || 'X-API-Key';
            headers[headerName] = decryptedSecret;
          } else if (item.authType === 'BASIC') {
            const b64 = Buffer.from(decryptedSecret).toString('base64');
            headers['Authorization'] = `Basic ${b64}`;
          }
        } catch (decErr) {
          db.recordCustomIntegrationTest(workspaceId, id, {
            status: 'ERROR',
            testStatus: 'FAILED',
            lastErrorMessage: `Credential decryption failed: ${decErr.message}`
          });
          throw new Error(`Decryption failed: ${decErr.message}`);
        }
      }

      try {
        const result = await ssrfProtection.safeFetch(item.url, {
          method: 'GET',
          headers
        }, { timeoutMs: 5000 });

        const durationMs = Date.now() - startTime;
        const isOk = result.status >= 200 && result.status < 400;

        db.recordCustomIntegrationTest(workspaceId, id, {
          status: isOk ? 'ACTIVE' : 'ERROR',
          testStatus: isOk ? 'SUCCESS' : 'FAILED',
          lastErrorMessage: isOk ? null : `Target returned HTTP ${result.status} ${result.statusText}`
        });

        return {
          success: isOk,
          httpStatus: result.status,
          statusText: result.statusText,
          durationMs,
          responsePreview: result.text ? result.text.slice(0, 300) : ''
        };
      } catch (reqErr) {
        const durationMs = Date.now() - startTime;
        db.recordCustomIntegrationTest(workspaceId, id, {
          status: 'ERROR',
          testStatus: 'FAILED',
          lastErrorMessage: reqErr.message
        });

        return {
          success: false,
          error: reqErr.message,
          durationMs
        };
      }
    }

    if (item.type === 'CUSTOM_WEBHOOK') {
      const timestamp = Math.floor(Date.now() / 1000);
      const testPayload = {
        event: 'test.ping',
        workspaceId,
        timestamp: new Date().toISOString(),
        message: 'PMPilot Webhook Integration Verification Ping'
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac('sha256', item.signingSecret || 'whsec_test')
        .update(`${timestamp}.${payloadString}`)
        .digest('hex');

      try {
        const result = await ssrfProtection.safeFetch(item.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-PMPilot-Timestamp': timestamp.toString(),
            'X-PMPilot-Signature': `v1=${signature}`,
            'User-Agent': 'PMPilot-Webhook/1.0'
          },
          body: payloadString
        }, { timeoutMs: 5000 });

        const durationMs = Date.now() - startTime;
        const isOk = result.status >= 200 && result.status < 400;

        db.recordCustomIntegrationTest(workspaceId, id, {
          status: isOk ? 'ACTIVE' : 'ERROR',
          testStatus: isOk ? 'SUCCESS' : 'FAILED',
          lastErrorMessage: isOk ? null : `Endpoint returned HTTP ${result.status} ${result.statusText}`
        });

        return {
          success: isOk,
          httpStatus: result.status,
          statusText: result.statusText,
          durationMs,
          responsePreview: result.text ? result.text.slice(0, 200) : ''
        };
      } catch (reqErr) {
        const durationMs = Date.now() - startTime;
        db.recordCustomIntegrationTest(workspaceId, id, {
          status: 'ERROR',
          testStatus: 'FAILED',
          lastErrorMessage: reqErr.message
        });

        return {
          success: false,
          error: reqErr.message,
          durationMs
        };
      }
    }

    throw new Error(`Unsupported integration type '${item.type}'.`);
  }

  /**
   * Helper to verify an incoming or outgoing webhook signature (HMAC-SHA256)
   * @param {string} payload 
   * @param {string} signatureHeader e.g. "v1=abcdef..."
   * @param {string} secret 
   * @param {number|string} timestamp 
   * @returns {boolean}
   */
  verifyWebhookSignature(payload, signatureHeader, secret, timestamp) {
    if (!payload || !signatureHeader || !secret || !timestamp) return false;
    const cleanSig = signatureHeader.replace(/^v1=/, '');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}

export const customIntegrationService = new CustomIntegrationService();
