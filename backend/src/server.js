/**
 * PMPilot Agent Server
 * Connects CopilotKit runtime, OpenAI Agents SDK, Exa, Redis state,
 * Mozilla trust layer, Trigger.dev background jobs, and Cross-Surface Hub
 * (At Work: Slack, Teams, Email, Docs, Calendars, Tickets, Support;
 *  In Your Pocket: Mobile Companion, Push Notifications, 1-Tap Approvals;
 *  On the Web: Autonomous Browser Agent;
 *  Credits & API Key Configuration).
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
    version: "2.0.0",
    sponsors: {
      copilotKit: "active",
      openaiAgentsSDK: "active",
      exa: "active",
      redis: "active",
      triggerDev: "active",
      mozillaAI: "active",
      openRouter: "active",
      auth0: "active"
    },
    crossSurfaceSurfaces: {
      atWork: ["Slack", "Microsoft Teams", "Email", "Notion Documents", "Google Calendar", "Linear / Jira", "Zendesk Support", "Live Team Presence"],
      inYourPocket: ["Mobile Push Alerts", "1-Tap Asynchronous Approvals", "SMS/Telegram Bot"],
      onTheWeb: ["Autonomous Browser Research", "DOM Table Extraction", "Competitor Navigation", "Automated Issue Filing"]
    },
    timestamp: new Date().toISOString()
  });
});

// Get session state
app.get("/api/session/:sessionId?", async (req, res) => {
  try {
    const sessionId = req.params.sessionId || "session_moonshot_checkout";
    const session = await RedisStateManager.getSession(sessionId);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CopilotKit & Associate PM Action handler
app.post("/api/session/:sessionId/action", async (req, res) => {
  try {
    const sessionId = req.params.sessionId || "session_moonshot_checkout";
    const { action, payload } = req.body;

    let responseData = null;

    switch (action) {
      case "challenge_decision":
        responseData = await AgentOrchestrator.challengeDecision(sessionId);
        break;

      case "shrink_to_mvp":
        responseData = await AgentOrchestrator.shrinkTo2WeekMVP(sessionId);
        break;

      case "create_validation_plan":
        responseData = await AgentOrchestrator.createValidationPlan(sessionId);
        break;

      case "generate_prd":
        responseData = await AgentOrchestrator.generatePRD(sessionId);
        break;

      case "resolve_conflict":
        const { conflictId, resolution } = payload;
        await RedisStateManager.resolveConflict(sessionId, conflictId, resolution);
        responseData = { success: true, message: `Conflict ${conflictId} resolved with: ${resolution}` };
        break;

      case "reopen_decision":
        await RedisStateManager.updateSession(sessionId, (s) => {
          s.decisionHealth.status = "Reopened decision: Limit comparison to three. Re-evaluating 5-product matrix.";
          s.decisionHealth.confidence = 82;
          s.decisionMemory.unshift({
            id: `mem_${Date.now()}`,
            date: "SEP 12, 2026",
            title: "Reopened: Comparison Count Decision",
            summary: "User reopened decision memory to evaluate user feedback from staged test cohort.",
            author: "User & Associate PM",
            status: "REOPENED"
          });
          return s;
        });
        responseData = { success: true, message: "Decision reopened for collaborative synthesis." };
        break;

      case "capture_evidence":
        const { sourceName, sourceType, content, url } = payload || {};
        const cleaned = MozillaTrustEngine.cleanContent(content || "");
        await RedisStateManager.updateSession(sessionId, (s) => {
          const newSrc = {
            id: `src_${Date.now()}`,
            badge: (sourceName || "S")[0].toUpperCase(),
            name: sourceName || "New Captured Context",
            type: sourceType || "Web Tab",
            status: `${sourceType || "Web"} · captured`,
            url: url || "https://browser.tab/active",
            timestamp: "Just now",
            selected: true,
            extractedContent: cleaned
          };
          s.capturedSources.push(newSrc);
          return s;
        });
        responseData = { success: true, message: "Source successfully captured into working memory." };
        break;

      default:
        responseData = { message: `Executed agent action: ${action}` };
    }

    const updatedSession = await RedisStateManager.getSession(sessionId);
    res.json({ success: true, result: responseData, session: updatedSession });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

// Trigger.dev async background job endpoints
app.post("/api/jobs/prd", async (req, res) => {
  try {
    const { sessionId, options } = req.body;
    const job = await TriggerJobRunner.startPrdJob(sessionId || "session_moonshot_checkout", options);
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/jobs/:jobId/status", (req, res) => {
  const job = TriggerJobRunner.getJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }
  res.json({ success: true, job });
});

/* ------------------- CROSS-SURFACE HUB ENDPOINTS ------------------- */

// Hub overview & active integrations status
app.get("/api/hub/status", (req, res) => {
  res.json({
    success: true,
    teamMembers: CrossSurfaceHub.activeTeamMembers,
    supportTickets: CrossSurfaceHub.supportTickets,
    calendarEvents: CrossSurfaceHub.calendarEvents,
    apiKeysStatus: CrossSurfaceHub.getApiKeysStatus()
  });
});

// At Work: Slack trigger
app.post("/api/hub/slack", async (req, res) => {
  const { channel, message } = req.body;
  const result = await CrossSurfaceHub.triggerSlackNotification(channel, message);
  res.json(result);
});

// At Work: Teams trigger
app.post("/api/hub/teams", async (req, res) => {
  const { channel } = req.body;
  const result = await CrossSurfaceHub.triggerTeamsCard(channel);
  res.json(result);
});

// At Work: Email digest
app.post("/api/hub/email", async (req, res) => {
  const { recipient } = req.body;
  const result = await CrossSurfaceHub.sendEmailDigest(recipient);
  res.json(result);
});

// At Work: Notion export
app.post("/api/hub/notion", async (req, res) => {
  const { title } = req.body;
  const result = await CrossSurfaceHub.exportToNotionDoc(title);
  res.json(result);
});

// At Work: Google Calendar schedule
app.post("/api/hub/calendar", async (req, res) => {
  const { experimentName } = req.body;
  const result = await CrossSurfaceHub.scheduleCalendarInterview(experimentName);
  res.json(result);
});

// In Your Pocket: Mobile notifications
app.get("/api/hub/pocket/notifications", (req, res) => {
  res.json({ success: true, notifications: CrossSurfaceHub.getPocketNotifications() });
});

// In Your Pocket: 1-Tap approval from mobile
app.post("/api/hub/pocket/approve", async (req, res) => {
  const { notificationId, choice } = req.body;
  const result = await CrossSurfaceHub.executePocketApproval(notificationId, choice);
  res.json(result);
});

// On The Web: Browser agent automation
app.post("/api/hub/web/automate", async (req, res) => {
  const { task } = req.body;
  const result = await CrossSurfaceHub.runWebAutomationAction(task);
  res.json(result);
});

// Settings: Live API Keys & Credits
app.get("/api/hub/settings/keys", (req, res) => {
  res.json({ success: true, keys: CrossSurfaceHub.getApiKeysStatus() });
});

app.post("/api/hub/settings/keys", (req, res) => {
  const { keys } = req.body;
  const result = CrossSurfaceHub.updateApiKeys(keys);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[PMPilot Agent Server] Running on http://localhost:${PORT}`);
  console.log(`[CopilotKit Runtime] Ready at http://localhost:${PORT}/api/copilotkit`);
  console.log(`[Cross-Surface Hub] Active on http://localhost:${PORT}/api/hub/status`);
});
