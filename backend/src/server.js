/**
 * PMPilot Agent Server
 * 
 * Exposes canonical decision lifecycle endpoints and backward-compatible session routes.
 * Enforces strict human approval checks before delivery artifact generation.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { RedisStateManager } from "./services/redisState.js";
import { ExaResearchEngine } from "./services/exa.js";
import { MozillaTrustEngine } from "./services/mozillaTrust.js";
import { TriggerJobRunner } from "./jobs/triggerJobs.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentOrchestrator } from "./agents/orchestrator.js";
import { CrossSurfaceHub } from "./services/crossSurfaceHub.js";
import { StateTransitionError } from "./domain/stateMachine.js";
import { authService } from "./auth/authService.js";
import { oidcService } from "./auth/oidcService.js";
import { db } from "./db/database.js";
import { authenticateToken, requireAuth, requireRealUser, requireWorkspaceMember } from "./auth/authMiddleware.js";
import { linearService } from "./integrations/linearService.js";

const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__serverDir, "../.env") });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "15mb" }));
app.use(authenticateToken);

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
app.post("/api/auth/register", (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = authService.registerUser({ email, password, name });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Sign in with credentials
app.post("/api/auth/login", (req, res) => {
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
  const workspaces = db.getUserWorkspaces(req.user.id);
  res.json({ success: true, workspaces });
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
    const updatedDecision = await RedisStateManager.markArtifactsGenerated(req.params.id, {
      prd: {
        title: "[SYNTHETIC DEMO PRD] AI-Assisted Guest Checkout & Cart Recovery",
        version: "1.0.0",
        approvedAt: new Date().toISOString(),
        isSyntheticDemo: true,
        verificationStatus: "SYNTHETIC_DEMO",
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
    const sessionId = req.params.sessionId || "session_moonshot_checkout";
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

// Guarded PRD async job trigger
app.post("/api/jobs/prd", async (req, res) => {
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

/* ------------------- DELIVERY EXPORT ROUTES (GUARDED) ------------------- */

// Guarded Linear sprint backlog export
app.post("/api/export/linear", async (req, res) => {
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

// Guarded Slack product release broadcast
app.post("/api/export/slack", async (req, res) => {
  try {
    const { decisionId, channel, message } = req.body;
    const targetId = decisionId || "session_moonshot_checkout";

    // Strictly guard downstream export: Decision must have valid human approval
    await RedisStateManager.guardArtifactGeneration(targetId);

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

export function runStartupPreflight() {
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
