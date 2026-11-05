/**
 * PMPilot Authentication & Identity Service
 * 
 * Provides:
 * - Persistent identity storage in SQLite (survives backend restarts)
 * - NIST-compliant password hashing via PBKDF2 (100,000 rounds, SHA-512)
 * - Cryptographically signed Bearer tokens (HMAC-SHA256) with constant-time verification
 * - Persistent token revocation across restarts and multiple backend instances
 * - Auth0 OIDC provider configuration detection and setup guidance
 */

import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { oidcService } from './oidcService.js';

// Secret key for HMAC token signing (falls back to random ephemeral secret in development if unset)
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET && !process.env.AUTH0_CLIENT_SECRET) {
  console.warn('[SECURITY WARNING] SESSION_SECRET is not configured in production environment! Using ephemeral secret: tokens will invalidate upon restart.');
}

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH0_CLIENT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PBKDF2_ITERATIONS = 210000; // OWASP recommendation for PBKDF2-HMAC-SHA512

class AuthService {
  constructor() {
    this.seedDefaultWorkspaceAndUser();
  }

  seedDefaultWorkspaceAndUser() {
    const shouldSeed = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO_SEED === 'true';
    if (!shouldSeed) {
      return;
    }

    const email = 'pm@pmpilot.ai';
    const password = 'PMPilotDemo2026!';
    const name = 'Lead Product Manager';
    const role = 'PRODUCT_MANAGER';
    const userId = 'usr_pm_lead';
    const workspaceId = 'ws_moonshot';

    // 1. Ensure default PM user exists in persistent database
    let user = db.getUserByEmail(email);
    if (!user) {
      const { salt, hash } = this.hashPassword(password);
      user = db.createUser({
        id: userId,
        provider: 'LOCAL',
        email,
        name,
        role,
        passwordHash: hash,
        passwordSalt: salt
      });
    }

    // 2. Ensure default workspace exists
    let workspace = db.getWorkspace(workspaceId);
    if (!workspace) {
      workspace = db.createWorkspace({
        id: workspaceId,
        name: 'Moonshot Commerce Workspace',
        createdBy: user.id
      });
    }

    // 3. Ensure membership
    if (!db.isWorkspaceMember(workspaceId, user.id)) {
      db.addWorkspaceMember(workspaceId, user.id, 'OWNER');
    }
  }

  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
    return { salt, hash: `pbkdf2$${PBKDF2_ITERATIONS}$${hash}` };
  }

  verifyPassword(password, storedHash, salt) {
    if (!storedHash || !salt) return false;
    let iterations = 100000; // legacy default
    let targetHash = storedHash;
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
      targetHash = parts[2];
    }
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(targetHash, 'utf8'));
    } catch {
      return false;
    }
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateToken(user, expiresInMs = TOKEN_TTL_MS, targetWorkspaceId = null) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Date.now();
    const exp = now + expiresInMs;
    const wsId = targetWorkspaceId || user.workspaceId || null;
    const payload = {
      jti: crypto.randomBytes(16).toString('hex'),
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'PRODUCT_MANAGER',
      provider: user.provider || 'LOCAL',
      workspaceId: wsId,
      iat: Math.floor(now / 1000),
      exp: Math.floor(exp / 1000)
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Session token is required.');
    }

    // Check persistent token revocation in SQLite
    const tokenHash = this.hashToken(token);
    if (db.isTokenRevoked(tokenHash)) {
      throw new Error('Session token has been revoked. Please sign in again.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed session token format.');
    }

    const [headerB64, bodyB64, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${headerB64}.${bodyB64}`).digest('base64url');

    try {
      const match = crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'));
      if (!match) throw new Error();
    } catch {
      throw new Error('Invalid session token signature.');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Corrupted token payload.');
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Session token has expired. Please sign in again.');
    }

    // Verify user exists in persistent database
    const user = db.getUserById(payload.sub);
    if (!user) {
      throw new Error('User associated with session no longer exists.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      provider: user.provider,
      workspaceId: payload.workspaceId || null
    };
  }

  registerUser({ email, password, name, workspaceName }) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('A valid email address is required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.length > 254) {
      throw new Error('Email address exceeds maximum length of 254 characters.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('A valid email address is required.');
    }

    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    if (password.length > 128) {
      throw new Error('Password exceeds maximum allowed length of 128 characters.');
    }

    const rawName = (name || cleanEmail.split('@')[0]).trim();
    const cleanName = rawName.slice(0, 100);
    const { salt, hash } = this.hashPassword(password);
    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;

    // Persist new user in SQLite
    const newUser = db.createUser({
      id: userId,
      provider: 'LOCAL',
      email: cleanEmail,
      name: cleanName,
      role: 'PRODUCT_MANAGER',
      passwordHash: hash,
      passwordSalt: salt
    });

    // Provision dedicated personal workspace for new tenant
    const rawWsName = (workspaceName || `${cleanName}'s Workspace`).trim();
    const cleanWsName = rawWsName.slice(0, 100);
    const wsId = `ws_${crypto.randomBytes(6).toString('hex')}`;
    db.createWorkspace({
      id: wsId,
      name: cleanWsName,
      createdBy: newUser.id
    });

    const userWorkspaces = db.getUserWorkspaces(newUser.id);
    const token = this.generateToken(newUser, TOKEN_TTL_MS, wsId);

    return {
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        provider: newUser.provider,
        workspaceId: wsId
      },
      workspace: {
        id: wsId,
        name: cleanWsName,
        member_role: 'OWNER'
      },
      workspaces: userWorkspaces
    };
  }

  loginUser({ email, password }) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.getUserByEmail(cleanEmail);

    if (!user) {
      throw new Error('Invalid email or password.');
    }

    if (user.provider === 'AUTH0' && !user.password_hash) {
      throw new Error('This account is registered via Auth0 SSO. Please use Single Sign-On.');
    }

    const isValid = this.verifyPassword(password, user.password_hash, user.password_salt);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    let userWorkspaces = db.getUserWorkspaces(user.id);
    let activeWorkspace = userWorkspaces[0];

    // If user has no workspace, provision one
    if (!activeWorkspace) {
      const wsId = `ws_${crypto.randomBytes(6).toString('hex')}`;
      const wsName = `${user.name}'s Workspace`;
      db.createWorkspace({ id: wsId, name: wsName, createdBy: user.id });
      userWorkspaces = db.getUserWorkspaces(user.id);
      activeWorkspace = userWorkspaces[0];
    }

    const token = this.generateToken(user, TOKEN_TTL_MS, activeWorkspace.id);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        provider: user.provider,
        workspaceId: activeWorkspace.id
      },
      workspace: activeWorkspace,
      workspaces: userWorkspaces
    };
  }

  revokeToken(token) {
    if (token) {
      const tokenHash = this.hashToken(token);
      let exp = Math.floor(Date.now() / 1000) + 86400; // default 24h
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.exp) exp = payload.exp;
        }
      } catch (_) {}
      db.revokeToken(tokenHash, exp);
    }
  }

  getProviderStatus() {
    return oidcService.getPublicConfig();
  }
}

export const authService = new AuthService();
