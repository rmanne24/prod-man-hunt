/**
 * PMPilot Shared Integration Base Service
 * 
 * Reusable architecture for all workspace-scoped integrations:
 * - RFC 7636 PKCE code_challenge / code_verifier generation
 * - Signed CSRF OAuth state generation & timing-safe verification
 * - AES-256-GCM token encryption / decryption
 * - Error message sanitization (redacts secrets, tokens, and keys)
 * - Safe connection serialization for frontend inspection (zero secrets returned)
 */

import crypto from 'node:crypto';
import { encryptionService } from '../services/encryptionService.js';

let fallbackSecret = null;
function getStateSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32).toString('hex');
  return fallbackSecret;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class IntegrationBaseService {
  constructor(providerName) {
    this.provider = providerName;
    this.pkceCache = new Map(); // state -> { codeVerifier, workspaceId, userId, redirectUri, timestamp }
    this.consumedStates = new Set();
  }

  /**
   * Sanitizes error messages to protect sensitive authorization codes, client secrets, and keys
   */
  sanitizeErrorMessage(msg) {
    if (!msg || typeof msg !== 'string') return `An error occurred during ${this.provider} integration processing.`;
    return msg
      .replace(/(client_secret|client_id|access_token|refresh_token|code|key|state|api_key|token)=([^&\s]+)/gi, '$1=[REDACTED]')
      .replace(/[0-9a-fA-F]{64}/g, '[REDACTED_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .trim();
  }

  /**
   * Generates a signed CSRF state token and PKCE code_challenge with tenant & redirect URI binding
   */
  createOAuthState({ workspaceId, userId, redirectUri }) {
    if (!workspaceId || !userId) {
      throw new Error(`Workspace ID and User ID are required to generate ${this.provider} OAuth state.`);
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const payload = {
      provider: this.provider,
      workspaceId,
      userId,
      redirectUri: redirectUri || null,
      nonce,
      timestamp
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', getStateSecret()).update(payloadB64).digest('base64url');
    const state = `${payloadB64}.${sig}`;

    // RFC 7636 PKCE
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    this.pkceCache.set(state, {
      codeVerifier,
      workspaceId,
      userId,
      redirectUri: redirectUri || null,
      timestamp
    });

    // Prune stale states older than 10 minutes
    const now = Date.now();
    for (const [key, val] of this.pkceCache.entries()) {
      if (now - val.timestamp > STATE_TTL_MS) {
        this.pkceCache.delete(key);
      }
    }

    return { state, codeVerifier, codeChallenge };
  }

  /**
   * Cryptographically validates state signature, expiration, tenant binding, and redirect URI
   */
  verifyOAuthState(state, expectedWorkspaceId, expectedUserId, expectedRedirectUri) {
    if (!state || typeof state !== 'string') {
      throw new Error('Missing or invalid OAuth state parameter.');
    }

    const parts = state.split('.');
    if (parts.length !== 2) {
      throw new Error('Malformed OAuth state format.');
    }

    const [payloadB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getStateSecret()).update(payloadB64).digest('base64url');

    try {
      const match = crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
      if (!match) throw new Error();
    } catch {
      throw new Error('Invalid OAuth state signature. Possible CSRF attack detected.');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Corrupted OAuth state payload.');
    }

    if (payload.provider && payload.provider !== this.provider) {
      throw new Error(`State provider mismatch (expected '${this.provider}', got '${payload.provider}').`);
    }

    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      throw new Error('OAuth state token has expired. Please restart authorization.');
    }

    if (expectedWorkspaceId && payload.workspaceId !== expectedWorkspaceId) {
      throw new Error(`State workspace mismatch (expected '${expectedWorkspaceId}', got '${payload.workspaceId}').`);
    }

    if (expectedUserId && payload.userId !== expectedUserId) {
      throw new Error(`State user mismatch (expected '${expectedUserId}', got '${payload.userId}').`);
    }

    if (expectedRedirectUri && payload.redirectUri && payload.redirectUri !== expectedRedirectUri) {
      throw new Error(
        `OAuth redirect_uri mismatch: authorization used '${payload.redirectUri}', but callback requested '${expectedRedirectUri}'.`
      );
    }

    if (this.consumedStates.has(state)) {
      throw new Error('OAuth state has already been consumed. Replay attack prevented.');
    }
    this.consumedStates.add(state);

    const cached = this.pkceCache.get(state);
    this.pkceCache.delete(state);

    return {
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      redirectUri: payload.redirectUri,
      codeVerifier: cached?.codeVerifier || null
    };
  }

  /**
   * Encrypts token pair using AES-256-GCM
   */
  encryptTokens(accessToken, refreshToken = null) {
    if (!accessToken) throw new Error('Access token is required for encryption.');
    const encryptedAccess = encryptionService.encrypt(accessToken);
    let encryptedRefresh = null;
    if (refreshToken) {
      encryptedRefresh = encryptionService.encrypt(refreshToken);
    }
    return {
      encryptedAccessToken: encryptedAccess.encrypted,
      tokenIv: encryptedAccess.iv,
      tokenTag: encryptedAccess.tag,
      encryptedRefreshToken: encryptedRefresh ? encryptedRefresh.encrypted : null,
      refreshIv: encryptedRefresh ? encryptedRefresh.iv : null,
      refreshTag: encryptedRefresh ? encryptedRefresh.tag : null
    };
  }

  /**
   * Decrypts tokens safely for internal backend calls only. Never send to frontend.
   */
  decryptTokens(connection) {
    if (!connection) throw new Error('No connection record provided.');
    if (!connection.encrypted_access_token || !connection.token_iv || !connection.token_tag) {
      throw new Error(`Connection for ${this.provider} does not contain valid encrypted access credentials.`);
    }

    const accessToken = encryptionService.decrypt({
      encrypted: connection.encrypted_access_token,
      iv: connection.token_iv,
      tag: connection.token_tag
    });

    let refreshToken = null;
    if (connection.encrypted_refresh_token && connection.refresh_iv && connection.refresh_tag) {
      try {
        refreshToken = encryptionService.decrypt({
          encrypted: connection.encrypted_refresh_token,
          iv: connection.refresh_iv,
          tag: connection.refresh_tag
        });
      } catch (_) {}
    }

    return { accessToken, refreshToken };
  }

  /**
   * Sanitizes connection record for frontend inspection (zero secrets, zero keys, zero tokens)
   */
  sanitizeConnection(conn, extra = {}) {
    if (!conn) return null;
    let parsedResources = [];
    if (conn.selected_resources) {
      try {
        parsedResources = typeof conn.selected_resources === 'string'
          ? JSON.parse(conn.selected_resources)
          : conn.selected_resources;
      } catch (_) {
        parsedResources = [];
      }
    }

    return {
      provider: conn.provider,
      status: conn.status,
      organizationId: conn.provider_organization_id,
      organizationName: conn.provider_organization_name,
      userId: conn.provider_user_id,
      scopes: conn.scopes ? conn.scopes.split(',') : [],
      connectedByUserId: conn.connected_by_user_id,
      expiresAt: conn.expires_at,
      lastSyncedAt: conn.last_synced_at,
      selectedResources: parsedResources,
      errorState: conn.error_state || null,
      createdAt: conn.created_at,
      updatedAt: conn.updated_at,
      ...extra
    };
  }
}
