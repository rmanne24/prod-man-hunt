/**
 * PMPilot Agent Server
 * 
 * Exposes canonical decision lifecycle endpoints and backward-compatible session routes.
 * Enforces strict human approval checks before delivery artifact generation.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { RedisStateManager } from "./services/redisState.js";
import { ExaResearchEngine } from "./services/exa.js";
import { MozillaTrustEngine } from "./services/mozillaTrust.js";
import { TriggerJobRunner } from "./jobs/triggerJobs.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { AgentOrchestrator } from "./agents/orchestrator.js";
import { CrossSurfaceHub } from "./services/crossSurfaceHub.js";
import { StateTransitionError } from "./domain/stateMachine.js";
import { authService } from "./auth/authService.js";
import { oidcService } from "./auth/oidcService.js";
import { db } from "./db/database.js";
import { authenticateToken, requireAuth, requireRealUser, requireWorkspaceMember } from "./auth/authMiddleware.js";
import { createRateLimiter } from "./auth/rateLimiter.js";
import { linearService } from "./integrations/linearService.js";
import { switchService } from "./integrations/switchService.js";
import { slackService } from "./integrations/slackService.js";
import { customIntegrationService } from "./integrations/customIntegrationService.js";
import { googleDriveService } from "./integrations/googleDriveService.js";
import { githubService } from "./integrations/githubService.js";
import { notionService } from "./integrations/notionService.js";
import { jiraService } from "./integrations/jiraService.js";
import { figmaService } from "./integrations/figmaService.js";
import { productboardService } from "./integrations/productboardService.js";
import { ingestionService } from "./services/ingestionService.js";

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__serverDir, "../.env") });

const app = express();
const PORT = process.env.PORT || 4000;

// Enable reverse proxy trust for accurate client IP in rate limiting & logs
app.set('trust proxy', 1);

// Standard HTTP Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000', 'http://127.0.0.1:4000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS error: Origin ${origin} not allowed.`));
  },
  credentials: true
}));
app.use(express.json({ limit: "15mb" }));
app.use(authenticateToken);

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many authentication attempts. Please try again after 60 seconds."
});

// Health check
app.get("/api/health", (req, res) => {
  const providerStatus = authService.getProviderStatus();
  res.json({
    status: "healthy",
    name: "PMPilot (Associate PM) Agent Engine",
    version: "2.1.0-deterministic-core",
    authNotice: providerStatus.notice,
    authProvider: providerStatus.provider,
    auth0Configured: providerStatus.auth0.isConfigured,
    timestamp: new Date().toISOString()
  });
});

/* ------------------- AUTHENTICATION & IDENTITY ROUTES ------------------- */

// Provider status and setup requirements
app.get("/api/auth/config", (req, res) => {
  res.json({ success: true, ...authService.getProviderStatus() });
});

// Create new user account
app.post("/api/auth/register", authLimiter, (req, res) => {
  try {
    const { email, password, name, workspaceName } = req.body;
    const result = authService.registerUser({ email, password, name, workspaceName });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Sign in with credentials
app.post("/api/auth/login", authLimiter, (req, res) => {
  try {
    const { email, password } = req.body;
    const result = authService.loginUser({ email, password });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Get current verified identity (Protected by token verification)
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    authMode: req.authMode
  });
});

// Invalidate session / token revocation
app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (token) {
    authService.revokeToken(token);
  }
  res.json({ success: true, message: "Signed out successfully." });
});

// Strict backend protection verification endpoint (Rejects unauthenticated and demo clients)
app.get("/api/auth/protected-test", requireRealUser, (req, res) => {
  res.json({
    success: true,
    message: "Access granted to verified authenticated user.",
    user: req.user
  });
});

// Build Auth0 Authorization Code URL with PKCE
app.get("/api/auth/oidc/login-url", (req, res) => {
  try {
    const { redirectUri, state, codeChallenge, scope } = req.query;
    if (!oidcService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: "Auth0 identity provider is not configured. Missing AUTH0_DOMAIN and/or AUTH0_CLIENT_ID in backend environment.",
        code: "OIDC_NOT_CONFIGURED"
      });
    }
    const url = oidcService.buildAuthorizeUrl({ redirectUri, state, codeChallenge, scope });
    res.json({ success: true, url });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Exchange Authorization Code with PKCE for Tokens (Server-side exchange keeps client secret secure)
app.post("/api/auth/oidc/exchange", async (req, res) => {
  try {
    const { code, codeVerifier, redirectUri } = req.body;
    if (!code || !codeVerifier) {
      return res.status(400).json({
        success: false,
        error: "Both 'code' and 'codeVerifier' are required for PKCE authorization code exchange."
      });
    }
    const result = await oidcService.exchangeCodeForTokens({ code, codeVerifier, redirectUri });
    const sessionToken = authService.generateToken(result.user);
    res.json({
      success: true,
      token: sessionToken,
      user: result.user,
      tokenData: result.tokenData
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get Workspaces for user
app.get("/api/workspaces", requireAuth, (req, res) => {
  if (req.user.isDemo) {
    return res.json({
      success: true,
      workspaces: [{ id: 'ws_moonshot', name: 'Moonshot Commerce Workspace', member_role: 'VIEWER' }]
    });
  }
  let workspaces = db.getUserWorkspaces(req.user.id);
  if (workspaces.length === 0) {
    const wsId = `ws_${crypto.randomBytes(6).toString('hex')}`;
    const wsName = `${req.user.name || 'Personal'}'s Workspace`;
    db.createWorkspace({ id: wsId, name: wsName, createdBy: req.user.id });
    workspaces = db.getUserWorkspaces(req.user.id);
  }
  res.json({ success: true, workspaces });
});

// Create a new workspace (Protected by requireRealUser)
app.post("/api/workspaces", requireRealUser, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Workspace name is required." });
    }
    const cleanName = name.trim();
    const wsId = `ws_${crypto.randomBytes(6).toString('hex')}`;
    const workspace = db.createWorkspace({
      id: wsId,
      name: cleanName,
      createdBy: req.user.id
    });
    res.status(201).json({ success: true, workspace: { ...workspace, member_role: 'OWNER' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List decisions for a workspace (Guarded by workspace authorization)
app.get("/api/workspaces/:workspaceId/decisions", requireWorkspaceMember, async (req, res) => {
  try {
    const decisions = await RedisStateManager.listDecisions(req.params.workspaceId);
    res.json({ success: true, decisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new decision in workspace (Guarded by workspace authorization)
app.post("/api/workspaces/:workspaceId/decisions", requireWorkspaceMember, async (req, res) => {
  try {
    const { title, productArea, problemStatement, hypothesis } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Decision title is required." });
    }

    const decision = await RedisStateManager.createDecision({
      workspaceId: req.params.workspaceId,
      title: title.trim(),
      productArea: productArea || 'Core Product',
      problemStatement,
      hypothesis,
      createdBy: req.user && !req.user.isDemo ? req.user.name : 'Human PM'
    });

    res.status(201).json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a decision in workspace (Guarded by workspace authorization)
app.delete("/api/workspaces/:workspaceId/decisions/:decisionId", requireWorkspaceMember, async (req, res) => {
  try {
    const deleted = await RedisStateManager.deleteDecision(req.params.decisionId, req.params.workspaceId);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- CANONICAL DECISION ROUTES ------------------- */

// Get canonical decision record (Guarded by workspace authorization)
app.get("/api/decisions/:id", requireWorkspaceMember, async (req, res) => {
  try {
    const decision = await RedisStateManager.getSession(req.params.id);
    if (!decision) {
      return res.status(404).json({ success: false, error: `Decision '${req.params.id}' not found.` });
    }
    res.json({ success: true, decision });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingest a signal into decision (Guarded by workspace authorization)
app.post("/api/decisions/:id/signals", requireWorkspaceMember, async (req, res) => {
  try {
    const { source, sourceType, rawText, url, capturedBy, category, underlyingCustomerProblem } = req.body;
    if (!rawText) {
      return res.status(400).json({ success: false, error: "Signal requires 'rawText' content." });
    }

    const cleaned = MozillaTrustEngine.cleanContent(rawText);
    const updatedDecision = await RedisStateManager.ingestSignal(req.params.id, {
      source: source || "Captured Web Signal",
      sourceType: sourceType || "WEB_PAGE",
      rawText: cleaned,
      url: url || null,
      capturedBy: capturedBy || "Extension User",
      category: category || "FEATURE_REQUEST",
      underlyingCustomerProblem: underlyingCustomerProblem || null
    });

    res.status(201).json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Resolve a contradiction (Human Action, guarded by workspace authorization)
app.post("/api/decisions/:id/conflicts/:conflictId/resolve", requireWorkspaceMember, async (req, res) => {
  try {
    const { resolutionChoiceId, resolutionNotes, decidedBy, expectedVersion } = req.body;
    if (!resolutionChoiceId) {
      return res.status(400).json({ success: false, error: "'resolutionChoiceId' is required." });
    }

    const verifiedActor = req.user && !req.user.isDemo
      ? `${req.user.name} (${req.user.email})`
      : (decidedBy || "Human PM [Demo UI]");

    const updatedDecision = await RedisStateManager.resolveConflict(
      req.params.id,
      req.params.conflictId,
      resolutionChoiceId,
      { name: verifiedActor, isVerifiedUser: Boolean(req.user && !req.user.isDemo) },
      resolutionNotes,
      expectedVersion !== undefined && expectedVersion !== null ? Number(expectedVersion) : null
    );

    res.json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Submit version-bound human approval action (APPROVE, REJECT, REQUEST_REVISION, guarded by workspace authorization)
app.post("/api/decisions/:id/approval", requireWorkspaceMember, async (req, res) => {
  try {
    const { action, decisionVersion, rationale, conditions, decidedBy } = req.body;
    if (!action || decisionVersion === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: 'action' (APPROVE|REJECT|REQUEST_REVISION) and 'decisionVersion' (number)."
      });
    }

    const verifiedActor = req.user && !req.user.isDemo
      ? `${req.user.name} (${req.user.email})`
      : (decidedBy || "Human PM [Demo UI]");

    const updatedDecision = await RedisStateManager.submitApproval(req.params.id, {
      action,
      decisionVersion: Number(decisionVersion),
      callerIdentity: { name: verifiedActor, isVerifiedUser: Boolean(req.user && !req.user.isDemo) },
      rationale,
      conditions
    });

    res.json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Generate delivery artifacts (Hard-guarded by human approval & workspace authorization)
app.post("/api/decisions/:id/artifacts", requireWorkspaceMember, async (req, res) => {
  try {
    // 1. Guard check: Must have valid human approval at current version
    await RedisStateManager.guardArtifactGeneration(req.params.id);

    // 2. Mark artifacts generated
    const current = await RedisStateManager.getRawDecision(req.params.id);
    const isSynthetic = Boolean(current?.isSyntheticDemo || current?.id === 'session_moonshot_checkout');
    const updatedDecision = await RedisStateManager.markArtifactsGenerated(req.params.id, {
      prd: {
        title: isSynthetic ? "[SYNTHETIC DEMO PRD] AI-Assisted Guest Checkout & Cart Recovery" : `PRD: ${current?.title || 'Product Decision'}`,
        version: "1.0.0",
        approvedAt: new Date().toISOString(),
        isSyntheticDemo: isSynthetic,
        verificationStatus: isSynthetic ? "SYNTHETIC_DEMO" : "CANONICAL_SPEC",
        approvedDecisionVersion: current?.version || null
      }
    }, current?.version || null);

    res.json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/* ------------------- LEGACY UI COMPATIBILITY ROUTES ------------------- */

// Legacy session fetch (Guarded by workspace authorization)
app.get("/api/session/:sessionId?", requireWorkspaceMember, async (req, res) => {
  try {
    let sessionId = req.params.sessionId;
    if (!sessionId) {
      if (req.user?.isDemo) {
        sessionId = "session_moonshot_checkout";
      } else if (req.workspaceId) {
        const wsDecisions = await RedisStateManager.listDecisions(req.workspaceId);
        if (wsDecisions && wsDecisions.length > 0) {
          sessionId = wsDecisions[0].id;
        } else {
          return res.json({ success: true, session: null });
        }
      } else {
        sessionId = "session_moonshot_checkout";
      }
    }
    const session = await RedisStateManager.getSession(sessionId);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy action dispatcher with state-machine routing (Guarded by workspace authorization)
app.post("/api/session/:sessionId/action", requireWorkspaceMember, async (req, res) => {
  try {
    const sessionId = req.params.sessionId || "session_moonshot_checkout";
    const { action, payload = {} } = req.body;

    let responseData = null;

    switch (action) {
      case "challenge_decision":
        responseData = await AgentOrchestrator.challengeDecision(sessionId);
        break;

      case "shrink_to_mvp":
        await RedisStateManager.shrinkToMVP(sessionId);
        responseData = { success: true, message: "Scoped to lean 2-week MVP." };
        break;

      case "create_validation_plan":
        responseData = await AgentOrchestrator.createValidationPlan(sessionId);
        break;

      case "generate_prd":
        await RedisStateManager.guardArtifactGeneration(sessionId);
        responseData = await AgentOrchestrator.generatePRD(sessionId);
        await RedisStateManager.markArtifactsGenerated(sessionId, { prd: responseData });
        break;

      case "resolve_conflict":
        const conflictId = payload.conflictId;
        const resolutionChoiceId = payload.resolutionChoiceId || payload.resolution;
        await RedisStateManager.resolveConflict(
          sessionId,
          conflictId,
          resolutionChoiceId,
          { name: payload.decidedBy },
          payload.resolutionNotes,
          payload.expectedVersion !== undefined && payload.expectedVersion !== null ? Number(payload.expectedVersion) : null
        );
        responseData = { success: true, message: `Conflict ${conflictId} resolved with: ${resolutionChoiceId}` };
        break;

      case "approve_decision":
        await RedisStateManager.submitApproval(sessionId, {
          action: payload.action || "APPROVE",
          decisionVersion: Number(payload.decisionVersion),
          callerIdentity: { name: payload.decidedBy },
          rationale: payload.rationale,
          conditions: payload.conditions
        });
        responseData = { success: true, message: "Decision approved by human PM." };
        break;

      case "reopen_decision":
        await RedisStateManager.reopenDecision(sessionId, payload.reason, { name: payload.decidedBy });
        responseData = { success: true, message: "Decision reopened for collaborative synthesis." };
        break;

      case "capture_evidence":
        const { sourceName, sourceType, content, url } = payload;
        const cleaned = MozillaTrustEngine.cleanContent(content || "");
        await RedisStateManager.ingestSignal(sessionId, {
          source: sourceName || "Web Tab",
          sourceType: sourceType || "WEB_PAGE",
          rawText: cleaned,
          url: url || "https://browser.tab/active"
        });
        responseData = { success: true, message: "Source successfully captured into working memory." };
        break;

      default:
        responseData = { message: `Executed agent action: ${action}` };
    }

    const updatedSession = await RedisStateManager.getSession(sessionId);
    res.json({ success: true, result: responseData, session: updatedSession });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Guarded PRD async job trigger (Guarded by workspace authorization)
app.post("/api/jobs/prd", requireWorkspaceMember, async (req, res) => {
  try {
    const sessionId = req.body.sessionId || "session_moonshot_checkout";

    // Strictly guard artifact generation: Must have valid human approval at current version!
    await RedisStateManager.guardArtifactGeneration(sessionId);

    const options = {
      ...(req.body.options || {}),
      targetDecisionVersion: req.body.targetDecisionVersion || req.body.options?.decisionVersion
    };
    const job = await TriggerJobRunner.startPrdJob(sessionId, options);
    res.json({ success: true, job });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 403;
    res.status(status).json({
      success: false,
      error: err.message,
      requiredAction: "Obtain human PM approval at the latest decision version before generating PRD artifacts."
    });
  }
});

app.get("/api/jobs/:jobId/status", (req, res) => {
  const job = TriggerJobRunner.getJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }
  res.json({ success: true, job });
});

// Exa search endpoint
app.post("/api/research/competitors", async (req, res) => {
  try {
    const { query } = req.body;
    const research = await ExaResearchEngine.searchCompetitorFeatures(query);
    res.json({ success: true, research });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- LINEAR OAUTH INTEGRATION ROUTES ------------------- */

// Safe Linear OAuth preflight report (presence and validity boolean flags only - zero secret leakage)
app.get("/api/integrations/linear/preflight", (req, res) => {
  try {
    const preflight = linearService.getPreflightReport();
    res.json({ success: true, preflight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Linear connection status for workspace
app.get("/api/workspaces/:workspaceId/integrations/linear/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = linearService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Build Linear OAuth authorization URL (requires verified real user & workspace member)
app.get("/api/workspaces/:workspaceId/integrations/linear/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/linear/callback`;
    const result = linearService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: linearService.sanitizeErrorMessage(err.message) });
  }
});

// Linear OAuth callback and token exchange
app.post("/api/workspaces/:workspaceId/integrations/linear/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    if (!code || !state) {
      return res.status(400).json({ success: false, error: "Both 'code' and 'state' are required." });
    }
    const result = await linearService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/linear/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: linearService.sanitizeErrorMessage(err.message) });
  }
});

// Disconnect Linear integration
app.post("/api/workspaces/:workspaceId/integrations/linear/disconnect", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const result = await linearService.disconnect(req.params.workspaceId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- SLACK INTEGRATION ROUTES ------------------- */

// Get Slack connection status for workspace
app.get("/api/workspaces/:workspaceId/integrations/slack/status", requireWorkspaceMember, async (req, res) => {
  try {
    const status = await slackService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Connect Slack webhook to workspace (verifies connectivity before saving)
app.post("/api/workspaces/:workspaceId/integrations/slack/connect", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { webhookUrl, channel, teamName } = req.body;
    const result = await slackService.connect({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      webhookUrl,
      channel,
      teamName
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Send test ping to Slack
app.post("/api/workspaces/:workspaceId/integrations/slack/test", requireWorkspaceMember, async (req, res) => {
  try {
    const result = await slackService.testConnection(req.params.workspaceId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Disconnect Slack
app.post("/api/workspaces/:workspaceId/integrations/slack/disconnect", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const result = await slackService.disconnect(req.params.workspaceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- CUSTOM INTEGRATIONS ROUTES (REST APIs & Webhooks) ------------------- */

// List custom integrations for workspace
app.get("/api/workspaces/:workspaceId/integrations/custom", requireWorkspaceMember, async (req, res) => {
  try {
    const items = await customIntegrationService.list(req.params.workspaceId);
    res.json({ success: true, integrations: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create custom integration in workspace
app.post("/api/workspaces/:workspaceId/integrations/custom", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const item = await customIntegrationService.create(req.params.workspaceId, req.user.id, req.body);
    res.status(201).json({ success: true, integration: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get single custom integration
app.get("/api/workspaces/:workspaceId/integrations/custom/:id", requireWorkspaceMember, async (req, res) => {
  try {
    const item = await customIntegrationService.get(req.params.workspaceId, req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Custom integration not found." });
    }
    res.json({ success: true, integration: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update custom integration
app.put("/api/workspaces/:workspaceId/integrations/custom/:id", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const item = await customIntegrationService.update(req.params.workspaceId, req.params.id, req.body);
    res.json({ success: true, integration: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete custom integration
app.delete("/api/workspaces/:workspaceId/integrations/custom/:id", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const result = await customIntegrationService.delete(req.params.workspaceId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Toggle enabled status
app.post("/api/workspaces/:workspaceId/integrations/custom/:id/toggle", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { isEnabled } = req.body;
    const item = await customIntegrationService.toggle(req.params.workspaceId, req.params.id, Boolean(isEnabled));
    res.json({ success: true, integration: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Test custom integration (safe outbound HTTP/webhook request)
app.post("/api/workspaces/:workspaceId/integrations/custom/:id/test", requireWorkspaceMember, async (req, res) => {
  try {
    const result = await customIntegrationService.test(req.params.workspaceId, req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ------------------- SWITCH AI COLLABORATION ROUTES ------------------- */

// Safe Switch preflight report (health check probe to GET /health, status, config presence, zero secrets)
app.get("/api/integrations/switch/preflight", async (req, res) => {
  try {
    const preflight = await switchService.getPreflightReport();
    res.json({ success: true, preflight });
  } catch (err) {
    res.status(500).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// Register or update PMPilot Decision Assistant with Switch
app.post("/api/integrations/switch/register", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { overwrite } = req.body || {};
    const result = await switchService.registerAgent({ overwrite: Boolean(overwrite) });
    res.json({ success: true, registration: result });
  } catch (err) {
    res.status(400).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// Get Switch Room mapped to decision (auto-syncs to current canonical decision version)
app.get("/api/workspaces/:workspaceId/decisions/:decisionId/switch/room", requireWorkspaceMember, async (req, res) => {
  try {
    const room = await switchService.getRoomForDecision(req.params.workspaceId, req.params.decisionId);
    res.json({ success: true, room: room || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Force sync Switch Room context to latest canonical decision version
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/room/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const room = await switchService.getRoomForDecision(req.params.workspaceId, req.params.decisionId);
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create or associate Switch Room for a decision (Idempotent)
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/room", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, decisionId } = req.params;
    const room = await switchService.getOrCreateRoomForDecision({
      workspaceId,
      decisionId,
      userId: req.user?.id
    });
    res.status(room.isExisting ? 200 : 201).json({ success: true, room });
  } catch (err) {
    res.status(400).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// Get room messages (returns persistent SQLite messages with honest simulation tags)
app.get("/api/workspaces/:workspaceId/decisions/:decisionId/switch/messages", requireWorkspaceMember, (req, res) => {
  try {
    const { workspaceId, decisionId } = req.params;
    const { roomId } = req.query;
    const messages = switchService.getMessagesForDecision({ workspaceId, decisionId, roomId });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Post a message / briefing update to the Switch room
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/message", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, decisionId } = req.params;
    const { roomId, content } = req.body;
    if (!roomId || !content) {
      return res.status(400).json({ success: false, error: "Both 'roomId' and 'content' are required." });
    }
    const sender = req.user && !req.user.isDemo ? req.user.name : (req.body.sender || 'Human PM [Demo UI]');
    const result = await switchService.postMessageToRoom({
      workspaceId,
      decisionId,
      roomId,
      content,
      sender,
      role: 'USER'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// List structured proposals for a decision
app.get("/api/workspaces/:workspaceId/decisions/:decisionId/switch/proposals", requireWorkspaceMember, (req, res) => {
  try {
    const proposals = switchService.getProposalsForDecision(req.params.workspaceId, req.params.decisionId);
    res.json({ success: true, proposals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Submit a structured proposal from Switch collaboration into PMPilot
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/proposals", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, decisionId } = req.params;
    const {
      roomId,
      proposalType,
      summary,
      openQuestions,
      proposedChanges,
      risksTradeoffs,
      recommendedAction,
      proposedBy
    } = req.body;

    const proposal = await switchService.createStructuredProposal({
      workspaceId,
      decisionId,
      roomId,
      proposalType,
      summary,
      openQuestions,
      proposedChanges,
      risksTradeoffs,
      recommendedAction,
      proposedBy: proposedBy || (req.user?.name ? `${req.user.name} (via Switch)` : 'pmpilot-decision-assistant')
    });

    res.status(201).json({ success: true, proposal });
  } catch (err) {
    res.status(400).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// Human PM merges / applies a Switch proposal to the decision
// Strict Human Approval Guard: advances decision version, resets approval, marks stale older proposals
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/proposals/:proposalId/apply", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, proposalId } = req.params;
    const result = await switchService.applyProposalToDecision({
      workspaceId,
      proposalId,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

// Reject a Switch proposal
app.post("/api/workspaces/:workspaceId/decisions/:decisionId/switch/proposals/:proposalId/reject", requireWorkspaceMember, (req, res) => {
  try {
    const { proposalId } = req.params;
    const result = switchService.rejectProposal(proposalId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: switchService.sanitizeMessage(err.message) });
  }
});

/* ------------------- UNIFIED INTEGRATIONS STATUS & EVIDENCE INGESTION ------------------- */

// Comprehensive integrations status across all providers for workspace
app.get("/api/workspaces/:workspaceId/integrations/summary", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const [linear, gdrive, github, notion, jira, figma, pb, slack] = await Promise.all([
      Promise.resolve(linearService.getConnectionStatus(workspaceId)),
      Promise.resolve(googleDriveService.getConnectionStatus(workspaceId)),
      Promise.resolve(githubService.getConnectionStatus(workspaceId)),
      Promise.resolve(notionService.getConnectionStatus(workspaceId)),
      Promise.resolve(jiraService.getConnectionStatus(workspaceId)),
      Promise.resolve(figmaService.getConnectionStatus(workspaceId)),
      Promise.resolve(productboardService.getConnectionStatus(workspaceId)),
      slackService.getConnectionStatus(workspaceId)
    ]);

    res.json({
      success: true,
      integrations: {
        linear,
        googleDrive: gdrive,
        github,
        notion,
        jira,
        figma,
        productboard: pb,
        slack
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List imported evidence records across integrations
app.get("/api/workspaces/:workspaceId/evidence/records", requireWorkspaceMember, (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { provider, limit = 50, offset = 0 } = req.query;
    const result = ingestionService.listRecords({
      workspaceId,
      provider: provider || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Promote imported record into a Decision Signal
app.post("/api/workspaces/:workspaceId/evidence/records/:recordId/promote", requireWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId, recordId } = req.params;
    const { decisionId, category, underlyingCustomerProblem } = req.body;
    if (!decisionId) {
      return res.status(400).json({ success: false, error: "'decisionId' is required to attach evidence." });
    }

    const reviewedBy = req.user && !req.user.isDemo ? req.user.name : (req.body.reviewedBy || 'Human PM');
    const result = await ingestionService.promoteRecordToDecisionSignal({
      workspaceId,
      recordId,
      decisionId,
      category,
      underlyingCustomerProblem,
      reviewedBy
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ------------------- GOOGLE DRIVE & DOCS INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/google-drive/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = googleDriveService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/google-drive/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/google-drive/callback`;
    const result = googleDriveService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: googleDriveService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/google-drive/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    if (!code || !state) {
      return res.status(400).json({ success: false, error: "Both 'code' and 'state' are required." });
    }
    const result = await googleDriveService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/google-drive/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: googleDriveService.sanitizeErrorMessage(err.message) });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/google-drive/files", requireWorkspaceMember, async (req, res) => {
  try {
    const { folderId, query, mimeType } = req.query;
    const files = await googleDriveService.listFiles({
      workspaceId: req.params.workspaceId,
      folderId: folderId || null,
      query: query || '',
      mimeType: mimeType || null
    });
    res.json({ success: true, files });
  } catch (err) {
    res.status(400).json({ success: false, error: googleDriveService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/google-drive/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const { selectedFiles, incremental } = req.body;
    const result = await googleDriveService.syncSelectedDocuments({
      workspaceId: req.params.workspaceId,
      selectedFiles: selectedFiles || [],
      incremental: Boolean(incremental)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: googleDriveService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/google-drive/disconnect", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const result = await googleDriveService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- GITHUB INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/github/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = githubService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/github/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/github/callback`;
    const result = githubService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: githubService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/github/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    if (!code || !state) {
      return res.status(400).json({ success: false, error: "Both 'code' and 'state' are required." });
    }
    const result = await githubService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/github/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: githubService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/github/connect-token", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { token } = req.body;
    const result = await githubService.connectWithToken({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      token
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: githubService.sanitizeErrorMessage(err.message) });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/github/repositories", requireWorkspaceMember, async (req, res) => {
  try {
    const repos = await githubService.listRepositories(req.params.workspaceId);
    res.json({ success: true, repositories: repos });
  } catch (err) {
    res.status(400).json({ success: false, error: githubService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/github/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const { selectedRepos } = req.body;
    const result = await githubService.syncSelectedRepositories({
      workspaceId: req.params.workspaceId,
      selectedRepos: selectedRepos || []
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: githubService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/github/disconnect", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const result = githubService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- NOTION INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/notion/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = notionService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/notion/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/notion/callback`;
    const result = notionService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/notion/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    const result = await notionService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/notion/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/notion/connect-token", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { token, workspaceName } = req.body;
    const result = await notionService.connectWithToken({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      token,
      workspaceName
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/notion/pages", requireWorkspaceMember, async (req, res) => {
  try {
    const pages = await notionService.searchPages(req.params.workspaceId, req.query.query || '');
    res.json({ success: true, pages });
  } catch (err) {
    res.status(400).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/notion/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const { selectedPages } = req.body;
    const result = await notionService.syncSelectedPages({
      workspaceId: req.params.workspaceId,
      selectedPages: selectedPages || []
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/notion/publish-prd", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { decisionId, parentPageId } = req.body;
    if (!decisionId) {
      return res.status(400).json({ success: false, error: "'decisionId' is required." });
    }
    const decision = await RedisStateManager.getRawDecision(decisionId);
    if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

    const result = await notionService.publishApprovedPrd({
      workspaceId: req.params.workspaceId,
      decision,
      parentPageId: parentPageId || null
    });
    res.json(result);
  } catch (err) {
    res.status(403).json({ success: false, error: notionService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/notion/disconnect", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const result = notionService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- JIRA SOFTWARE INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/jira/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = jiraService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/jira/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/jira/callback`;
    const result = jiraService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/jira/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    const result = await jiraService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/jira/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/jira/connect-token", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { email, apiToken, domain } = req.body;
    const result = await jiraService.connectWithApiToken({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      email,
      apiToken,
      domain
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/jira/projects", requireWorkspaceMember, async (req, res) => {
  try {
    const projects = await jiraService.listProjects(req.params.workspaceId);
    res.json({ success: true, projects });
  } catch (err) {
    res.status(400).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/jira/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const { selectedProjects } = req.body;
    const result = await jiraService.syncSelectedProjects({
      workspaceId: req.params.workspaceId,
      selectedProjects: selectedProjects || []
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/jira/create-issue", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { decisionId, projectKey, issueType, summary, description } = req.body;
    if (!decisionId || !projectKey) {
      return res.status(400).json({ success: false, error: "Both 'decisionId' and 'projectKey' are required." });
    }
    const decision = await RedisStateManager.getRawDecision(decisionId);
    if (!decision) throw new Error(`Decision '${decisionId}' not found.`);

    const result = await jiraService.createApprovedIssue({
      workspaceId: req.params.workspaceId,
      decision,
      projectKey,
      issueType: issueType || 'Epic',
      summary,
      description
    });
    res.json(result);
  } catch (err) {
    res.status(403).json({ success: false, error: jiraService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/jira/disconnect", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const result = jiraService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- FIGMA INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/figma/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = figmaService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/figma/authorize-url", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const redirectUri = req.query.redirectUri || `${req.protocol}://${req.get('host')}/integrations/figma/callback`;
    const result = figmaService.buildAuthorizeUrl({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      redirectUri
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: figmaService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/figma/callback", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { code, state, redirectUri } = req.body;
    const result = await figmaService.exchangeCodeAndConnect({
      code,
      state,
      redirectUri: redirectUri || `${req.protocol}://${req.get('host')}/integrations/figma/callback`,
      workspaceId: req.params.workspaceId,
      userId: req.user.id
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: figmaService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/figma/connect-token", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { token } = req.body;
    const result = await figmaService.connectWithToken({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      token
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: figmaService.sanitizeErrorMessage(err.message) });
  }
});

app.get("/api/workspaces/:workspaceId/integrations/figma/file-inspect", requireWorkspaceMember, async (req, res) => {
  try {
    const { fileKey } = req.query;
    if (!fileKey) {
      return res.status(400).json({ success: false, error: "'fileKey' query parameter is required." });
    }
    const metadata = await figmaService.getFileMetadata({
      workspaceId: req.params.workspaceId,
      fileKey
    });
    res.json({ success: true, file: metadata });
  } catch (err) {
    res.status(400).json({ success: false, error: figmaService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/figma/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const { selectedFiles } = req.body;
    const result = await figmaService.syncSelectedFiles({
      workspaceId: req.params.workspaceId,
      selectedFiles: selectedFiles || []
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: figmaService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/figma/disconnect", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const result = figmaService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- PRODUCTBOARD INTEGRATION ROUTES ------------------- */

app.get("/api/workspaces/:workspaceId/integrations/productboard/status", requireWorkspaceMember, (req, res) => {
  try {
    const status = productboardService.getConnectionStatus(req.params.workspaceId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/productboard/connect-token", requireWorkspaceMember, requireRealUser, async (req, res) => {
  try {
    const { token, spaceName } = req.body;
    const result = await productboardService.connectWithToken({
      workspaceId: req.params.workspaceId,
      userId: req.user.id,
      token,
      spaceName
    });
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(400).json({ success: false, error: productboardService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/productboard/sync", requireWorkspaceMember, async (req, res) => {
  try {
    const [notesRes, featsRes] = await Promise.all([
      productboardService.syncFeedbackNotes({ workspaceId: req.params.workspaceId }),
      productboardService.syncFeatures({ workspaceId: req.params.workspaceId })
    ]);
    res.json({
      success: true,
      importedCount: (notesRes.importedCount || 0) + (featsRes.importedCount || 0),
      notes: notesRes.records,
      features: featsRes.records
    });
  } catch (err) {
    res.status(400).json({ success: false, error: productboardService.sanitizeErrorMessage(err.message) });
  }
});

app.post("/api/workspaces/:workspaceId/integrations/productboard/disconnect", requireWorkspaceMember, requireRealUser, (req, res) => {
  try {
    const result = productboardService.disconnect(req.params.workspaceId);
    res.json({ success: true, connection: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ------------------- DELIVERY EXPORT ROUTES (GUARDED) ------------------- */

// Guarded Linear sprint backlog export (Guarded by workspace authorization)
app.post("/api/export/linear", requireWorkspaceMember, async (req, res) => {
  try {
    const { decisionId, tickets } = req.body;
    const targetId = decisionId || "session_moonshot_checkout";

    // Strictly guard downstream export: Decision must have valid human approval at current version
    await RedisStateManager.guardArtifactGeneration(targetId);

    const isDemo = Boolean(req.user?.isDemo || req.headers['x-pmpilot-demo'] === 'true' || !req.user);
    const workspaceId = req.workspaceId || 'ws_moonshot';
    const userId = req.user?.id || 'usr_pm_lead';

    const result = await linearService.exportApprovedDecisionToLinear({
      decisionId: targetId,
      workspaceId,
      userId,
      isDemo,
      tickets
    });

    res.json(result);
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 403;
    res.status(status).json({
      success: false,
      error: err.message,
      requiredAction: "Obtain human PM approval at current decision version before exporting to Linear."
    });
  }
});

// Guarded Slack product release broadcast (Guarded by workspace authorization)
app.post("/api/export/slack", requireWorkspaceMember, async (req, res) => {
  try {
    const { decisionId, channel, message } = req.body;
    const targetId = decisionId || "session_moonshot_checkout";

    // Strictly guard downstream export: Decision must have valid human approval
    await RedisStateManager.guardArtifactGeneration(targetId);

    // If workspace has real Slack connected, dispatch live Slack notification
    const slackConn = req.workspaceId ? db.getIntegrationConnection(req.workspaceId, 'SLACK') : null;
    if (slackConn && slackConn.status === 'CONNECTED') {
      const decision = await RedisStateManager.getSession(targetId);
      const broadcastRes = await slackService.broadcastDecisionApproval(req.workspaceId, {
        decisionTitle: decision?.title || 'Approved Product Decision',
        version: decision?.version || 1,
        summary: message || decision?.recommendation?.actionSummary,
        decidedBy: req.user?.name || req.user?.email || 'PM'
      });
      return res.json({
        success: true,
        service: 'Slack',
        status: 'NOTIFICATION_SENT',
        deliveredTo: broadcastRes.deliveredTo,
        isLiveConnected: true
      });
    }

    const result = await CrossSurfaceHub.triggerSlackNotification(channel, message);
    res.json({
      ...result,
      status: "SIMULATED_NOTIFICATION_SENT",
      isDemoMode: true
    });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 403;
    res.status(status).json({
      success: false,
      error: err.message,
      requiredAction: "Obtain human PM approval at current decision version before sharing to Slack."
    });
  }
});

/* ------------------- CROSS-SURFACE HUB ENDPOINTS (STUBS) ------------------- */

app.get("/api/hub/status", (req, res) => {
  res.json({
    success: true,
    teamMembers: CrossSurfaceHub.activeTeamMembers,
    supportTickets: CrossSurfaceHub.supportTickets,
    calendarEvents: CrossSurfaceHub.calendarEvents,
    apiKeysStatus: CrossSurfaceHub.getApiKeysStatus()
  });
});

app.post("/api/hub/slack", async (req, res) => {
  const { channel, message } = req.body;
  const result = await CrossSurfaceHub.triggerSlackNotification(channel, message);
  res.json(result);
});

app.post("/api/hub/teams", async (req, res) => {
  const { channel } = req.body;
  const result = await CrossSurfaceHub.triggerTeamsCard(channel);
  res.json(result);
});

app.post("/api/hub/email", async (req, res) => {
  const { recipient } = req.body;
  const result = await CrossSurfaceHub.sendEmailDigest(recipient);
  res.json(result);
});

app.post("/api/hub/notion", async (req, res) => {
  const { title } = req.body;
  const result = await CrossSurfaceHub.exportToNotionDoc(title);
  res.json(result);
});

app.post("/api/hub/calendar", async (req, res) => {
  const { experimentName } = req.body;
  const result = await CrossSurfaceHub.scheduleCalendarInterview(experimentName);
  res.json(result);
});

app.get("/api/hub/pocket/notifications", (req, res) => {
  res.json({ success: true, notifications: CrossSurfaceHub.getPocketNotifications() });
});

app.post("/api/hub/pocket/approve", async (req, res) => {
  const { notificationId, choice } = req.body;
  const result = await CrossSurfaceHub.executePocketApproval(notificationId, choice);
  res.json(result);
});

app.post("/api/hub/web/automate", async (req, res) => {
  const { task } = req.body;
  const result = await CrossSurfaceHub.runWebAutomationAction(task);
  res.json(result);
});

app.get("/api/hub/settings/keys", (req, res) => {
  res.json({ success: true, keys: CrossSurfaceHub.getApiKeysStatus() });
});

app.post("/api/hub/settings/keys", (req, res) => {
  const { keys } = req.body;
  const result = CrossSurfaceHub.updateApiKeys(keys);
  res.json(result);
});

// Production static frontend serving (serves Vite build when available)
const staticDistPath = path.resolve(__serverDir, "../../frontend/dist");
if (fs.existsSync(staticDistPath)) {
  app.use(express.static(staticDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(staticDistPath, "index.html"));
  });
}

export async function runStartupPreflight() {
  const preflight = linearService.getPreflightReport();
  console.log(`[Linear OAuth Preflight] Status: ${preflight.status}`);
  for (const [name, check] of Object.entries(preflight.variables)) {
    const statusText = !check.present 
      ? 'MISSING' 
      : check.valid 
        ? 'VALID' 
        : `INVALID (${check.error || 'malformed'})`;
    console.log(`  - ${name}: ${statusText}`);
  }

  try {
    const switchPreflight = await switchService.getPreflightReport();
    console.log(`[Switch AI Preflight] Status: ${switchPreflight.status} (Reachable: ${switchPreflight.reachable})`);
    for (const [name, check] of Object.entries(switchPreflight.variables)) {
      console.log(`  - ${name}: ${check.present ? (check.valid ? 'PRESENT & VALID' : 'PRESENT BUT INVALID') : 'MISSING'}`);
    }
  } catch (err) {
    console.log(`[Switch AI Preflight] Probe error: ${err.message}`);
  }

  return preflight;
}

export default app;

const isMainModule = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server"));
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`[PMPilot Agent Server] Running on http://localhost:${PORT}`);
    console.log(`[Canonical Lifecycle Engine] Active on http://localhost:${PORT}/api/decisions/:id`);
    runStartupPreflight();
  });
}
