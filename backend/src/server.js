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
import { AgentOrchestrator } from "./agents/orchestrator.js";
import { CrossSurfaceHub } from "./services/crossSurfaceHub.js";
import { StateTransitionError } from "./domain/stateMachine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "15mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    name: "PMPilot (Associate PM) Agent Engine",
    version: "2.1.0-deterministic-core",
    authNotice: "No external identity provider configured. User identities are treated as unverified demo metadata.",
    timestamp: new Date().toISOString()
  });
});

/* ------------------- CANONICAL DECISION ROUTES ------------------- */

// Get canonical decision record
app.get("/api/decisions/:id", async (req, res) => {
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

// Ingest a signal into decision
app.post("/api/decisions/:id/signals", async (req, res) => {
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

// Resolve a contradiction (Human Action)
app.post("/api/decisions/:id/conflicts/:conflictId/resolve", async (req, res) => {
  try {
    const { resolutionChoiceId, resolutionNotes, decidedBy, expectedVersion } = req.body;
    if (!resolutionChoiceId) {
      return res.status(400).json({ success: false, error: "'resolutionChoiceId' is required." });
    }

    const updatedDecision = await RedisStateManager.resolveConflict(
      req.params.id,
      req.params.conflictId,
      resolutionChoiceId,
      { name: decidedBy },
      resolutionNotes,
      expectedVersion !== undefined && expectedVersion !== null ? Number(expectedVersion) : null
    );

    res.json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Submit version-bound human approval action (APPROVE, REJECT, REQUEST_REVISION)
app.post("/api/decisions/:id/approval", async (req, res) => {
  try {
    const { action, decisionVersion, rationale, conditions, decidedBy } = req.body;
    if (!action || decisionVersion === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: 'action' (APPROVE|REJECT|REQUEST_REVISION) and 'decisionVersion' (number)."
      });
    }

    const updatedDecision = await RedisStateManager.submitApproval(req.params.id, {
      action,
      decisionVersion: Number(decisionVersion),
      callerIdentity: { name: decidedBy },
      rationale,
      conditions
    });

    res.json({ success: true, decision: updatedDecision });
  } catch (err) {
    const status = err instanceof StateTransitionError ? err.statusCode : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Generate delivery artifacts (Hard-guarded by human approval)
app.post("/api/decisions/:id/artifacts", async (req, res) => {
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

// Legacy session fetch
app.get("/api/session/:sessionId?", async (req, res) => {
  try {
    const sessionId = req.params.sessionId || "session_moonshot_checkout";
    const session = await RedisStateManager.getSession(sessionId);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy action dispatcher with state-machine routing
app.post("/api/session/:sessionId/action", async (req, res) => {
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

/* ------------------- DELIVERY EXPORT ROUTES (GUARDED) ------------------- */

// Guarded Linear sprint backlog export
app.post("/api/export/linear", async (req, res) => {
  try {
    const { decisionId, tickets } = req.body;
    const targetId = decisionId || "session_moonshot_checkout";

    // Strictly guard downstream export: Decision must have valid human approval
    await RedisStateManager.guardArtifactGeneration(targetId);

    res.json({
      success: true,
      service: "Linear",
      status: "DEMO_STUB_READY",
      message: "Delivery export authorized. LINEAR_API_KEY is unconfigured in demo environment.",
      ticketCount: Array.isArray(tickets) ? tickets.length : 4,
      isDemoMode: true
    });
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

export default app;

const isMainModule = process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server"));
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`[PMPilot Agent Server] Running on http://localhost:${PORT}`);
    console.log(`[Canonical Lifecycle Engine] Active on http://localhost:${PORT}/api/decisions/:id`);
  });
}
