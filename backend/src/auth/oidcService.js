/**
 * PMPilot Auth0 & OIDC Identity Service
 * 
 * Implements:
 * - Genuine OIDC Authorization Code Flow with PKCE
 * - Strict RS256 JWT verification (JWKS signature, issuer, audience, expiry, algorithm)
 * - Safe credential separation (Client secret strictly server-side, never exposed to frontend)
 * - Transparent unconfigured state reporting with clear configuration guidance
 */

import crypto from 'node:crypto';
import { db } from '../db/database.js';

class OidcService {
  constructor() {
    this.jwksCache = new Map();
    this.jwksCacheExpiresAt = 0;
  }

  getDomain() {
    return process.env.AUTH0_DOMAIN || null;
  }

  getClientId() {
    return process.env.AUTH0_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.AUTH0_CLIENT_SECRET || null;
  }

  getAudience() {
    return process.env.AUTH0_AUDIENCE || null;
  }

  getCallbackUrl() {
    return process.env.AUTH0_CALLBACK_URL || 'http://127.0.0.1:5173/';
  }

  isConfigured() {
    const domain = this.getDomain();
    const clientId = this.getClientId();
    return Boolean(domain && clientId);
  }

  /**
   * Safe public configuration sent to frontend (NEVER exposes client secret)
   */
  getPublicConfig() {
    const domain = this.getDomain();
    const clientId = this.getClientId();
    const audience = this.getAudience();
    const callbackUrl = this.getCallbackUrl();
    const isConfigured = this.isConfigured();

    const missingVariables = [
      !process.env.AUTH0_DOMAIN && 'AUTH0_DOMAIN',
      !process.env.AUTH0_CLIENT_ID && 'AUTH0_CLIENT_ID',
      !process.env.AUTH0_CLIENT_SECRET && 'AUTH0_CLIENT_SECRET'
    ].filter(Boolean);

    return {
      provider: isConfigured ? 'AUTH0_OIDC' : 'LOCAL_CRYPTOGRAPHIC',
      auth0: {
        isConfigured,
        domain: isConfigured ? domain : null,
        clientId: isConfigured ? clientId : null,
        audience: isConfigured ? audience : null,
        callbackUrl: isConfigured ? callbackUrl : null,
        missingVariables
      },
      notice: isConfigured
        ? 'Auth0 OIDC provider configured and active.'
        : 'Auth0 credentials are not configured in environment variables. Local persistent cryptographic authentication (PBKDF2 + HMAC-SHA256) is active.'
    };
  }

  /**
   * Builds the standard OAuth2 / OIDC authorization URL for PKCE flow
   */
  buildAuthorizeUrl({ redirectUri, state, codeChallenge, scope }) {
    if (!this.isConfigured()) {
      throw new Error('Auth0 is not configured in environment variables.');
    }

    const domain = this.getDomain().replace(/\/$/, '');
    const clientId = this.getClientId();
    const audience = this.getAudience();

    const params = new URLSearchParams({
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      client_id: clientId,
      redirect_uri: redirectUri || this.getCallbackUrl(),
      scope: scope || 'openid profile email',
      state: state || crypto.randomBytes(16).toString('hex')
    });

    if (audience) {
      params.set('audience', audience);
    }

    return `https://${domain}/authorize?${params.toString()}`;
  }

  /**
   * Exchanges authorization code and code_verifier for tokens using server-side credentials
   */
  async exchangeCodeForTokens({ code, codeVerifier, redirectUri }) {
    if (!this.isConfigured()) {
      throw new Error('Auth0 is not configured in environment variables.');
    }

    const domain = this.getDomain().replace(/\/$/, '');
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();
    const targetRedirectUri = redirectUri || this.getCallbackUrl();

    const bodyParams = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: targetRedirectUri
    };

    if (clientSecret) {
      bodyParams.client_secret = clientSecret;
    }

    const tokenEndpoint = `https://${domain}/oauth/token`;
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyParams)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        parsedErr = JSON.parse(errText).error_description || JSON.parse(errText).error || errText;
      } catch (_) {}
      throw new Error(`Token exchange failed: ${parsedErr}`);
    }

    const tokenData = await response.json();
    const idToken = tokenData.id_token;
    const accessToken = tokenData.access_token;

    // Verify token received from provider
    const tokenToVerify = idToken || accessToken;
    if (!tokenToVerify) {
      throw new Error('No valid token returned from identity provider.');
    }

    const verifiedClaims = await this.verifyAuth0Jwt(tokenToVerify);

    // Upsert OIDC user record into SQLite
    const user = db.upsertOidcUser({
      sub: verifiedClaims.sub,
      email: verifiedClaims.email || `${verifiedClaims.sub}@auth0.user`,
      name: verifiedClaims.name || verifiedClaims.nickname || verifiedClaims.email || 'Auth0 PM'
    });

    // Ensure private personal workspace exists for OIDC user
    let userWorkspaces = db.getUserWorkspaces(user.id);
    if (userWorkspaces.length === 0) {
      const wsId = `ws_${crypto.randomBytes(6).toString('hex')}`;
      const wsName = `${user.name || 'Personal'}'s Workspace`;
      db.createWorkspace({ id: wsId, name: wsName, createdBy: user.id });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        provider: 'AUTH0',
        sub: verifiedClaims.sub
      },
      tokenData: {
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        expiresIn: tokenData.expires_in
      }
    };
  }

  /**
   * Fetches JWKS from Auth0 with caching
   */
  async getJwks(jwksUri) {
    const uri = jwksUri || `https://${this.getDomain().replace(/\/$/, '')}/.well-known/jwks.json`;
    const now = Date.now();

    if (this.jwksCache.size > 0 && this.jwksCacheExpiresAt > now) {
      return this.jwksCache;
    }

    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`Failed to fetch JWKS from ${uri}: HTTP ${res.status}`);
    }

    const data = await res.json();
    const newCache = new Map();
    for (const key of data.keys || []) {
      if (key.kid) {
        newCache.set(key.kid, key);
      }
    }

    this.jwksCache = newCache;
    this.jwksCacheExpiresAt = now + 60 * 60 * 1000; // 1 hour TTL
    return newCache;
  }

  /**
   * Converts JWK or x5c certificate into a crypto PublicKey object
   */
  jwkToPublicKey(jwk) {
    if (jwk.x5c && jwk.x5c[0]) {
      const cert = `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0].match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
      return crypto.createPublicKey(cert);
    }

    if (jwk.kty === 'RSA' && jwk.n && jwk.e) {
      return crypto.createPublicKey({
        key: {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e
        },
        format: 'jwk'
      });
    }

    throw new Error('Unsupported JWK format for public key reconstruction.');
  }

  /**
   * Cryptographic validation of RS256 Auth0 JWT
   * 
   * Verifies:
   * 1. Algorithm is strictly RS256 (rejects none, HS256, etc.)
   * 2. Signature validates against matching public key from JWKS
   * 3. Issuer matches https://${domain}/
   * 4. Audience matches configured client ID or API audience
   * 5. Expiration (exp) has not elapsed
   */
  async verifyAuth0Jwt(jwtString, options = {}) {
    if (!jwtString || typeof jwtString !== 'string') {
      throw new Error('JWT token string is required.');
    }

    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed JWT structure: expected 3 dot-separated parts.');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    let header;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Corrupted JWT header.');
    }

    // 1. Enforce allowed algorithm
    if (header.alg !== 'RS256') {
      throw new Error(`Disallowed JWT algorithm '${header.alg}'. Strictly 'RS256' is required.`);
    }

    if (!header.kid && !options.mockKey) {
      throw new Error("JWT header missing 'kid' (key identifier).");
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Corrupted JWT payload.');
    }

    // 2. Signature verification
    let publicKey;
    if (options.mockKey) {
      publicKey = options.mockKey;
    } else {
      let jwks = await this.getJwks(options.jwksUri);
      let jwk = jwks.get(header.kid);

      if (!jwk) {
        // Refresh cache in case of recent key rotation
        this.jwksCacheExpiresAt = 0;
        jwks = await this.getJwks(options.jwksUri);
        jwk = jwks.get(header.kid);
      }

      if (!jwk) {
        throw new Error(`Signing key '${header.kid}' not found in provider JWKS.`);
      }

      publicKey = this.jwkToPublicKey(jwk);
    }

    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, 'base64url');
    const isValidSig = crypto.verify('RSA-SHA256', data, publicKey, signature);

    if (!isValidSig) {
      throw new Error('Invalid JWT signature.');
    }

    // 3. Issuer verification
    const expectedDomain = options.domain || this.getDomain();
    if (expectedDomain) {
      const cleanDomain = expectedDomain.replace(/\/$/, '');
      const validIssuers = [`https://${cleanDomain}/`, `https://${cleanDomain}`];
      if (!validIssuers.includes(payload.iss)) {
        throw new Error(`Invalid token issuer '${payload.iss}'. Expected 'https://${cleanDomain}/'.`);
      }
    }

    // 4. Audience verification
    const expectedAudience = options.audience || this.getAudience() || this.getClientId();
    if (expectedAudience) {
      const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!tokenAud.includes(expectedAudience)) {
        throw new Error(`Invalid token audience '${payload.aud}'. Expected '${expectedAudience}'.`);
      }
    }

    // 5. Expiration verification
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) {
      throw new Error(`Token has expired at ${new Date(payload.exp * 1000).toISOString()}.`);
    }

    // 6. Not-before verification
    if (payload.nbf && payload.nbf > nowSeconds) {
      throw new Error(`Token is not valid until ${new Date(payload.nbf * 1000).toISOString()}.`);
    }

    return payload;
  }
}

export const oidcService = new OidcService();

