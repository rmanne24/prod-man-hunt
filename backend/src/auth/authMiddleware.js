/**
 * Authentication & Authorization Middleware for PMPilot
 * 
 * Provides:
 * - Dual token verification: local cryptographic tokens (HS256) and Auth0 OIDC JWTs (RS256)
 * - Strict workspace authorization checks (multi-tenant isolation)
 * - Clear distinction between authenticated identities and explicit judge demo mode
 */

import { authService } from './authService.js';
import { oidcService } from './oidcService.js';
import { db } from '../db/database.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    // Check if token header claims to be RS256 (Auth0 OIDC JWT)
    let isRs256 = false;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (header.alg === 'RS256') {
          isRs256 = true;
        }
      }
    } catch (_) {}

    if (isRs256) {
      try {
        const claims = await oidcService.verifyAuth0Jwt(token);
        // Persist / sync OIDC user in database
        const user = db.upsertOidcUser({
          sub: claims.sub,
          email: claims.email || `${claims.sub}@auth0.user`,
          name: claims.name || claims.nickname || claims.email || 'Auth0 PM'
        });
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          provider: 'AUTH0',
          sub: claims.sub,
          isDemo: false
        };
        req.authMode = 'AUTH0_OIDC';
        return next();
      } catch (err) {
        return res.status(401).json({
          success: false,
          error: `Auth0 token verification failed: ${err.message}`,
          code: 'AUTH_OIDC_TOKEN_INVALID'
        });
      }
    }

    // Otherwise verify local cryptographic Bearer token
    try {
      const user = authService.verifyToken(token);
      req.user = { ...user, isDemo: false };
      req.authMode = 'AUTHENTICATED';
      return next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: err.message || 'Invalid or expired session token.',
        code: 'AUTH_TOKEN_INVALID'
      });
    }
  }

  // Check if request is explicitly operating in Judge Demo Mode
  const isDemoHeader = req.headers['x-pmpilot-demo'] === 'true' || req.headers['x-pmpilot-demo'] === '1';
  if (isDemoHeader) {
    req.user = {
      id: 'usr_demo_judge',
      email: 'demo@pmpilot.ai',
      name: 'Human PM [Demo UI]',
      role: 'DEMO',
      isDemo: true
    };
    req.authMode = 'DEMO';
    return next();
  }

  req.user = null;
  req.authMode = 'ANONYMOUS';
  return next();
}

/**
 * Strict route guard: Requires either a valid authenticated token OR explicit demo mode.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in or provide a valid Bearer token.',
      code: 'UNAUTHORIZED'
    });
  }
  next();
}

/**
 * Strict route guard: Requires a genuine authenticated user account (disallows demo mode).
 */
export function requireRealUser(req, res, next) {
  if (!req.user || req.user.isDemo) {
    return res.status(401).json({
      success: false,
      error: 'A verified user account is required. Please sign in.',
      code: 'AUTHENTICATION_REQUIRED'
    });
  }
  next();
}

/**
 * Workspace authorization guard: Enforces multi-tenant data isolation.
 * Verifies that the authenticated caller (or demo user) has permission
 * to read or mutate the target workspace's decisions.
 */
export function requireWorkspaceMember(req, res, next) {
  // Determine target workspace ID
  let targetWorkspaceId = req.params.workspaceId || req.headers['x-workspace-id'] || req.query.workspaceId;

  // If a decision or session ID is in the route parameter, body, or query, check its workspace
  const decisionParam = req.params.decisionId || req.params.id || req.params.sessionId || req.body?.decisionId || req.body?.sessionId;
  if (decisionParam) {
    const meta = db.getDecisionMeta(decisionParam);
    if (meta) {
      targetWorkspaceId = meta.workspaceId;
    } else if (decisionParam === 'session_moonshot_checkout') {
      targetWorkspaceId = 'ws_moonshot';
    }
  }

  // If not explicitly provided, fall back to user's assigned workspace from token
  if (!targetWorkspaceId && req.user && req.user.workspaceId) {
    targetWorkspaceId = req.user.workspaceId;
  }

  // If still not set, default to 'ws_moonshot' (public demo workspace)
  if (!targetWorkspaceId) {
    targetWorkspaceId = 'ws_moonshot';
  }

  // For the public evaluation demo workspace ('ws_moonshot'), allow demo walkthroughs
  if (targetWorkspaceId === 'ws_moonshot') {
    req.workspaceId = targetWorkspaceId;
    return next();
  }

  // Demo users are strictly confined to 'ws_moonshot'
  if (req.user && req.user.isDemo) {
    return res.status(403).json({
      success: false,
      error: `Demo mode is restricted to 'ws_moonshot'. Access to workspace '${targetWorkspaceId}' requires a verified account.`,
      code: 'FORBIDDEN_WORKSPACE_ACCESS'
    });
  }

  // Unauthenticated requests to private workspaces are rejected
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required to access workspace data.',
      code: 'UNAUTHORIZED'
    });
  }

  // If still no targetWorkspaceId, error
  if (!targetWorkspaceId) {
    return res.status(400).json({
      success: false,
      error: 'Workspace ID could not be determined.',
      code: 'MISSING_WORKSPACE_ID'
    });
  }

  // Authenticated user: check membership in SQLite database
  const isMember = db.isWorkspaceMember(targetWorkspaceId, req.user.id);
  if (!isMember) {
    return res.status(403).json({
      success: false,
      error: `Workspace access denied. You are not an authorized member of workspace '${targetWorkspaceId}'.`,
      code: 'FORBIDDEN_WORKSPACE_ACCESS'
    });
  }

  req.workspaceId = targetWorkspaceId;
  next();
}
