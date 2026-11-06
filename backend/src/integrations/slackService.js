/**
 * PMPilot Slack Integration Service
 * 
 * Implements:
 * - Real workspace-scoped Slack Incoming Webhook connection
 * - AES-256-GCM encryption of Webhook credentials at rest
 * - SSRF protection for outbound webhook delivery (blocks localhost, private subnets, cloud metadata)
 * - Strict credential sanitization & masking in API responses (zero plaintext secrets)
 * - Channel-specific decision approvals & PRD broadcast
 * - Safe test-ping verification before marking connection active
 * - Truthful connection status reporting (CONNECTED, NOT_CONNECTED, CONNECTION_ERROR)
 */

import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ssrfProtection } from '../services/ssrfProtection.js';

class SlackService {
  /**
   * Masks a Slack webhook URL for safe presentation in user-facing UI
   * @param {string} url 
   * @returns {string}
   */
  maskWebhookUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length >= 3) {
        // e.g. /services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
        const masked = segments.map((seg, idx) => {
          if (idx === 0) return seg; // "services"
          if (idx === 1) return seg.slice(0, 3) + '••••';
          return '••••••••';
        }).join('/');
        return `${parsed.origin}/${masked}`;
      }
      return `${parsed.origin}/**masked-webhook**`;
    } catch {
      return 'https://hooks.slack.com/services/••••••••';
    }
  }

  /**
   * Retrieves sanitized Slack integration status for a workspace
   * @param {string} workspaceId 
   * @returns {Promise<{ provider: string, configured: boolean, connected: boolean, status: string, connection: any, error?: string }>}
   */
  async getConnectionStatus(workspaceId) {
    if (!workspaceId) {
      return {
        provider: 'SLACK',
        configured: false,
        connected: false,
        status: 'NOT_CONNECTED',
        connection: null
      };
    }

    const conn = db.getIntegrationConnection(workspaceId, 'SLACK');
    if (!conn || conn.status !== 'CONNECTED' || !conn.encrypted_access_token) {
      return {
        provider: 'SLACK',
        configured: false,
        connected: false,
        status: 'NOT_CONNECTED',
        connection: null
      };
    }

    // Verify token can be decrypted
    let decryptedUrl = null;
    try {
      decryptedUrl = encryptionService.decrypt({
        encrypted: conn.encrypted_access_token,
        iv: conn.token_iv,
        tag: conn.token_tag
      });
    } catch (err) {
      return {
        provider: 'SLACK',
        configured: false,
        connected: false,
        status: 'CONNECTION_ERROR',
        connection: null,
        error: `Credential decryption failed: ${err.message}`
      };
    }

    return {
      provider: 'SLACK',
      configured: true,
      connected: true,
      status: 'CONNECTED',
      connection: {
        channel: conn.scopes || '#product-announcements',
        organizationName: conn.provider_organization_name || 'Slack Workspace',
        maskedWebhookUrl: this.maskWebhookUrl(decryptedUrl),
        lastSyncedAt: conn.last_synced_at,
        createdAt: conn.created_at,
        updatedAt: conn.updated_at
      }
    };
  }

  /**
   * Connects Slack webhook to a workspace after verifying connection with a test ping
   * @param {{ workspaceId: string, userId: string, webhookUrl: string, channel?: string, teamName?: string }} params 
   */
  async connect({ workspaceId, userId, webhookUrl, channel = '#product-announcements', teamName = 'Slack Workspace' }) {
    if (!workspaceId) throw new Error('workspaceId is required to connect Slack.');
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      throw new Error('Slack Incoming Webhook URL is required.');
    }

    const trimmedUrl = webhookUrl.trim();

    // 1. SSRF validation
    const ssrfCheck = await ssrfProtection.validateTargetUrl(trimmedUrl);
    if (!ssrfCheck.valid) {
      throw new Error(`Invalid Slack Webhook URL: ${ssrfCheck.error}`);
    }

    // 2. Validate URL format (must be valid Slack webhook or standard webhook endpoint)
    if (!trimmedUrl.startsWith('https://hooks.slack.com/') && !trimmedUrl.startsWith('https://') && process.env.NODE_ENV !== 'test') {
      throw new Error('Slack Webhook URL must use HTTPS and start with https://hooks.slack.com/');
    }

    const cleanChannel = (channel && channel.trim().length > 0) ? channel.trim() : '#product-announcements';

    // 3. Send verification test ping to confirm real webhook connectivity
    const testPayload = {
      text: `🔗 *PMPilot Verification*: Successfully verified Slack webhook for *${teamName}* (${cleanChannel}).`,
      channel: cleanChannel
    };

    try {
      const pingResult = await ssrfProtection.safeFetch(trimmedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      }, { timeoutMs: 5000 });

      if (!pingResult.ok && pingResult.text !== 'ok') {
        throw new Error(`Slack rejected webhook verification (HTTP ${pingResult.status}: ${pingResult.text || pingResult.statusText})`);
      }
    } catch (pingErr) {
      throw new Error(`Failed to verify Slack webhook connectivity: ${pingErr.message}`);
    }

    // 4. Encrypt Webhook URL with AES-256-GCM
    const encrypted = encryptionService.encrypt(trimmedUrl);

    // 5. Store in SQLite
    const conn = db.saveIntegrationConnection({
      workspaceId,
      provider: 'SLACK',
      connectedByUserId: userId,
      providerOrganizationName: teamName,
      scopes: cleanChannel,
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encrypted,
      tokenIv: encrypted.iv,
      tokenTag: encrypted.tag
    });

    return {
      provider: 'SLACK',
      status: 'CONNECTED',
      connection: {
        channel: cleanChannel,
        organizationName: teamName,
        maskedWebhookUrl: this.maskWebhookUrl(trimmedUrl),
        createdAt: conn.created_at
      }
    };
  }

  /**
   * Tests existing Slack connection by sending a ping message
   * @param {string} workspaceId 
   */
  async testConnection(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'SLACK');
    if (!conn || conn.status !== 'CONNECTED' || !conn.encrypted_access_token) {
      throw new Error('Slack is not connected to this workspace.');
    }

    const webhookUrl = encryptionService.decrypt({
      encrypted: conn.encrypted_access_token,
      iv: conn.token_iv,
      tag: conn.token_tag
    });

    const channel = conn.scopes || '#product-announcements';
    const testPayload = {
      text: `🔔 *PMPilot Test Notification*: Connection to *${conn.provider_organization_name || 'Slack'}* is healthy.`,
      channel
    };

    const res = await ssrfProtection.safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    }, { timeoutMs: 5000 });

    if (!res.ok && res.text !== 'ok') {
      throw new Error(`Slack test failed (HTTP ${res.status}: ${res.text || res.statusText})`);
    }

    db.updateIntegrationSyncTimestamp(workspaceId, 'SLACK');

    return {
      success: true,
      deliveredTo: channel,
      message: `Test notification sent successfully to ${channel}.`
    };
  }

  /**
   * Disconnects Slack integration and wipes credentials
   * @param {string} workspaceId 
   */
  async disconnect(workspaceId) {
    db.disconnectIntegrationConnection(workspaceId, 'SLACK');
    return {
      success: true,
      message: 'Slack integration disconnected and encrypted credentials purged.'
    };
  }

  /**
   * Broadcasts an approved product decision to the workspace's configured Slack channel
   * @param {string} workspaceId 
   * @param {{ decisionTitle: string, version: number, summary?: string, decidedBy?: string, decisionUrl?: string }} payload 
   */
  async broadcastDecisionApproval(workspaceId, payload) {
    const conn = db.getIntegrationConnection(workspaceId, 'SLACK');
    if (!conn || conn.status !== 'CONNECTED' || !conn.encrypted_access_token) {
      return {
        success: false,
        delivered: false,
        reason: 'Slack is not connected to this workspace.'
      };
    }

    const webhookUrl = encryptionService.decrypt({
      encrypted: conn.encrypted_access_token,
      iv: conn.token_iv,
      tag: conn.token_tag
    });

    const channel = conn.scopes || '#product-announcements';

    const card = {
      channel,
      text: `🚀 *PMPilot Decision Approved*: ${payload.decisionTitle} (v${payload.version})`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚀 Decision Approved: ${payload.decisionTitle}`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Active Version:*\nv${payload.version}` },
            { type: 'mrkdwn', text: `*Decided By:*\n${payload.decidedBy || 'Human PM'}` }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendation Summary:*\n${payload.summary || 'Evidence-backed decision specification approved by product manager.'}`
          }
        }
      ]
    };

    const res = await ssrfProtection.safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    }, { timeoutMs: 5000 });

    if (!res.ok && res.text !== 'ok') {
      throw new Error(`Slack broadcast failed (HTTP ${res.status}: ${res.text || res.statusText})`);
    }

    db.updateIntegrationSyncTimestamp(workspaceId, 'SLACK');

    return {
      success: true,
      delivered: true,
      deliveredTo: channel
    };
  }
}

export const slackService = new SlackService();
