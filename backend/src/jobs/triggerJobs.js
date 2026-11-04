/**
 * PMPilot Trigger.dev Asynchronous Job Pipeline
 * Orchestrates heavy, non-blocking workflows:
 * - Full PRD Generation
 * - Sprint Plan & Linear Ticket Breakdown
 * - Deep Market Exa Ingestion
 */

import { RedisStateManager } from "../services/redisState.js";

export class TriggerJobRunner {
  static activeJobs = new Map();

  /**
   * Starts an asynchronous PRD generation job
   */
  static async startPrdJob(sessionId, options = {}) {
    const jobId = `trig_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const currentDecision = await RedisStateManager.getRawDecision(sessionId);
    const targetDecisionVersion = options.targetDecisionVersion !== undefined
      ? Number(options.targetDecisionVersion)
      : currentDecision?.version || null;

    const initialJob = {
      jobId,
      sessionId,
      targetDecisionVersion,
      type: "PRD_GENERATION",
      status: "queued",
      progress: 0,
      currentStep: "Queued in Trigger.dev pipeline",
      startedAt: new Date().toISOString(),
      steps: [
        { name: "Context analysis", status: "pending" },
        { name: "Requirement extraction", status: "pending" },
        { name: "Competitor research (Exa)", status: "pending" },
        { name: "Gap & contradiction analysis", status: "pending" },
        { name: "PRD document synthesis", status: "pending" },
        { name: "Sprint breakdown & Linear tickets", status: "pending" }
      ],
      result: null
    };

    this.activeJobs.set(jobId, initialJob);

    // Run async steps simulation/worker
    this.runJobPipeline(jobId, sessionId, options, targetDecisionVersion);

    return initialJob;
  }

  static getJobStatus(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  static async runJobPipeline(jobId, sessionId, options, targetDecisionVersion) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    try {
      // Step 1: Context analysis
      job.status = "running";
      job.progress = 15;
      job.currentStep = "Analyzing workspace & 4 browser sources...";
      job.steps[0].status = "in_progress";
      await sleep(1000);
      job.steps[0].status = "completed";

      // Step 2: Requirement extraction
      job.progress = 35;
      job.currentStep = "Extracting observed vs inferred requirements...";
      job.steps[1].status = "in_progress";
      await sleep(1200);
      job.steps[1].status = "completed";

      // Step 3: Competitor research
      job.progress = 55;
      job.currentStep = "Exa query: Benchmarking Stripe, Shopify, Amazon checkout recovery...";
      job.steps[2].status = "in_progress";
      await sleep(1200);
      job.steps[2].status = "completed";

      // Step 4: Gap & contradiction analysis
      job.progress = 75;
      job.currentStep = "Contradiction gate: validating comparison limit and session TTL...";
      job.steps[3].status = "in_progress";
      await sleep(1000);
      job.steps[3].status = "completed";

      // Step 5: PRD synthesis
      job.progress = 90;
      job.currentStep = "Synthesizing full evidence-backed PRD...";
      job.steps[4].status = "in_progress";
      await sleep(1000);
      job.steps[4].status = "completed";

      // Step 6: Sprint breakdown
      job.progress = 100;
      job.currentStep = "Finalizing sprint plan & Linear ticket ready exports...";
      job.steps[5].status = "in_progress";
      await sleep(800);
      job.steps[5].status = "completed";

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = {
        title: "[SYNTHETIC DEMO PRD] AI-Assisted Guest Checkout & Cart Recovery",
        version: "1.0.0-MVP",
        confidence: 96,
        summary: "Evidence-backed product spec synthesized from Figma, Notion, Linear, and Exa market research.",
        userStoriesCount: 6,
        linearTicketsCount: 8,
        sprintDuration: "2 Weeks",
        isSyntheticDemo: true,
        verificationStatus: "SYNTHETIC_DEMO",
        approvedDecisionVersion: targetDecisionVersion
      };

      try {
        const current = await RedisStateManager.getRawDecision(sessionId);
        if (targetDecisionVersion !== null && current && current.version !== targetDecisionVersion) {
          job.status = "superseded";
          job.error = `Decision version advanced from v${targetDecisionVersion} to v${current.version} before job completion. Artifacts discarded.`;
        } else {
          await RedisStateManager.markArtifactsGenerated(sessionId, { prd: job.result }, targetDecisionVersion);
        }
      } catch (markErr) {
        job.status = "failed";
        job.error = markErr.message;
      }
    } catch (err) {
      job.status = "failed";
      job.error = err.message;
    }
  }
}
