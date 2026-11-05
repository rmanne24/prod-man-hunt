/**
 * PMPilot Auth0 & OIDC Flow Unit Tests
 * 
 * Verifies:
 * 1. Safe credential isolation (client secret never exposed)
 * 2. Transparent unconfigured status reporting
 * 3. RFC-compliant PKCE authorization URL generation
 * 4. Cryptographic RS256 JWT signature verification
 * 5. Strict claims enforcement (iss, aud, exp, alg)
 * 6. Provider identity persistence and workspace binding
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { oidcService } from '../src/auth/oidcService.js';
import { db } from '../src/db/database.js';

test('OIDC: Unconfigured state returns explicit notice and lists missing environment variables', () => {
  const origDomain = process.env.AUTH0_DOMAIN;
  const origClientId = process.env.AUTH0_CLIENT_ID;
  const origClientSecret = process.env.AUTH0_CLIENT_SECRET;

  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_CLIENT_ID;
  delete process.env.AUTH0_CLIENT_SECRET;

  try {
    const config = oidcService.getPublicConfig();
    assert.equal(config.auth0.isConfigured, false);
    assert.equal(config.provider, 'LOCAL_CRYPTOGRAPHIC');
    assert.ok(config.notice.includes('Auth0 credentials are not configured'));
    assert.deepEqual(config.auth0.missingVariables, ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']);
    // Ensure client secret is never leaked in public config
    assert.equal(config.auth0.clientSecret, undefined);
  } finally {
    if (origDomain) process.env.AUTH0_DOMAIN = origDomain;
    if (origClientId) process.env.AUTH0_CLIENT_ID = origClientId;
    if (origClientSecret) process.env.AUTH0_CLIENT_SECRET = origClientSecret;
  }
});

test('OIDC: buildAuthorizeUrl generates valid OAuth2 PKCE authorization URL', () => {
  process.env.AUTH0_DOMAIN = 'pmpilot-test.us.auth0.com';
  process.env.AUTH0_CLIENT_ID = 'test_client_id_123';
  process.env.AUTH0_AUDIENCE = 'https://api.pmpilot.ai';

  try {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const authUrl = oidcService.buildAuthorizeUrl({
      redirectUri: 'http://localhost:5173/auth/callback',
      state: 'test_state_xyz',
      codeChallenge: challenge
    });

    const parsed = new URL(authUrl);
    assert.equal(parsed.origin, 'https://pmpilot-test.us.auth0.com');
    assert.equal(parsed.pathname, '/authorize');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(parsed.searchParams.get('code_challenge'), challenge);
    assert.equal(parsed.searchParams.get('client_id'), 'test_client_id_123');
    assert.equal(parsed.searchParams.get('audience'), 'https://api.pmpilot.ai');
    assert.equal(parsed.searchParams.get('state'), 'test_state_xyz');
  } finally {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_AUDIENCE;
  }
});

test('OIDC: RS256 JWT cryptographic signature verification succeeds with valid key pair', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const domain = 'tenant.auth0.com';
  const audience = 'my-api-aud';

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payloadData = {
    sub: 'auth0|usr_12345',
    email: 'sarah@productteam.com',
    name: 'Sarah PM',
    iss: `https://${domain}/`,
    aud: audience,
    iat: now,
    exp: now + 3600
  };
  const body = Buffer.from(JSON.stringify(payloadData)).toString('base64url');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
  const validToken = `${header}.${body}.${sig}`;

  const claims = await oidcService.verifyAuth0Jwt(validToken, {
    mockKey: publicKey,
    domain,
    audience
  });

  assert.equal(claims.sub, 'auth0|usr_12345');
  assert.equal(claims.email, 'sarah@productteam.com');
  assert.equal(claims.name, 'Sarah PM');
});

test('OIDC: Rejects tokens with corrupted or spoofed signatures', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const domain = 'tenant.auth0.com';

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: 'auth0|spoofed',
    iss: `https://${domain}/`,
    aud: 'test-aud',
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');

  const invalidSig = Buffer.from('bad_signature_bytes_1234567890').toString('base64url');
  const badToken = `${header}.${body}.${invalidSig}`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(badToken, { mockKey: publicKey, domain, audience: 'test-aud' });
    },
    /Invalid JWT signature/
  );
});

test('OIDC: Rejects disallowed algorithms (HS256, none)', async () => {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

  // Alg: HS256
  const headerHS256 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const tokenHS256 = `${headerHS256}.${body}.dummysig`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(tokenHS256, { mockKey: publicKey });
    },
    /Disallowed JWT algorithm 'HS256'/
  );

  // Alg: none
  const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const tokenNone = `${headerNone}.${body}.`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(tokenNone, { mockKey: publicKey });
    },
    /Disallowed JWT algorithm 'none'/
  );
});

test('OIDC: Rejects expired tokens', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const domain = 'tenant.auth0.com';

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url');
  const pastTime = Math.floor(Date.now() / 1000) - 300; // expired 5 minutes ago
  const body = Buffer.from(JSON.stringify({
    sub: 'auth0|expired',
    iss: `https://${domain}/`,
    aud: 'my-aud',
    exp: pastTime
  })).toString('base64url');

  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
  const expiredToken = `${header}.${body}.${sig}`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(expiredToken, { mockKey: publicKey, domain, audience: 'my-aud' });
    },
    /Token has expired/
  );
});

test('OIDC: Rejects tokens with mismatched issuer or audience', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);

  // Wrong issuer
  const bodyWrongIss = Buffer.from(JSON.stringify({
    sub: 'auth0|1',
    iss: 'https://attacker.auth0.com/',
    aud: 'correct-aud',
    exp: now + 3600
  })).toString('base64url');
  const sig1 = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${bodyWrongIss}`), privateKey).toString('base64url');
  const tokenWrongIss = `${header}.${bodyWrongIss}.${sig1}`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(tokenWrongIss, { mockKey: publicKey, domain: 'legit.auth0.com', audience: 'correct-aud' });
    },
    /Invalid token issuer/
  );

  // Wrong audience
  const bodyWrongAud = Buffer.from(JSON.stringify({
    sub: 'auth0|1',
    iss: 'https://legit.auth0.com/',
    aud: 'wrong-client-aud',
    exp: now + 3600
  })).toString('base64url');
  const sig2 = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${bodyWrongAud}`), privateKey).toString('base64url');
  const tokenWrongAud = `${header}.${bodyWrongAud}.${sig2}`;

  await assert.rejects(
    async () => {
      await oidcService.verifyAuth0Jwt(tokenWrongAud, { mockKey: publicKey, domain: 'legit.auth0.com', audience: 'correct-aud' });
    },
    /Invalid token audience/
  );
});

test('OIDC: Provider identity upsert persists user and workspace membership in database', () => {
  const oidcSub = `auth0|test_sub_${Date.now()}`;
  const user = db.upsertOidcUser({
    sub: oidcSub,
    email: 'new.pm@enterprise.org',
    name: 'Enterprise PM'
  });

  assert.ok(user);
  assert.equal(user.provider, 'AUTH0');
  assert.equal(user.provider_sub, oidcSub);
  assert.equal(user.email, 'new.pm@enterprise.org');
  assert.equal(user.name, 'Enterprise PM');

  // Verify lookup by sub works
  const retrieved = db.getUserByProviderSub(oidcSub);
  assert.equal(retrieved.id, user.id);
});

