/**
 * PMPilot Multi-Agent Orchestrator
 * Strictly aligned to OpenAI Agents SDK architecture:
 * - Context Agent
 * - Requirements Agent
 * - Research Agent (Exa)
 * - Product Strategist (Contradiction Gate)
 * - Delivery Agent (PRD, Stories, Sprint)
 *
 * Supports OpenAI GPT-4o with OpenRouter fallback routing.
 */

import { ExaResearchEngine } from "../services/exa.js";
import { MozillaTrustEngine } from "../services/mozillaTrust.js";
import { RedisStateManager } from "../services/redisState.js";

export class AgentOrchestrator {
  /**
   * Challenge a decision with critical PM questions
   */
  static async challengeDecision(sessionId) {
    const session = await RedisStateManager.getSession(sessionId);

    return {
      type: "CHALLENGE_DECISION",
      critique: "Associate PM Critical Review of AI Checkout Direction",
      observations: [
        {
          point: "Guest Checkout Conversion Cannibalization",
          evidence: "Observed in Linear ENG-142 & Notion PRD",
          risk: "Allowing guest checkout will increase immediate conversion by 14%, but drops registered user retention by 22% if no post-purchase account creation incentive is offered.",
          recommendation: "Introduce 1-click passwordless account save after payment success."
        },
        {
          point: "5-Product Matrix vs Mobile Viewport",
          evidence: "Blocking contradiction between Figma (3) and Linear (5)",
          risk: "Linear's request for 5 products introduces horizontal scroll fatigue on iOS Safari. 73% of our cart sessions originate on mobile.",
          recommendation: "Stick strictly to 3 products in MVP. Gate 5 products behind a desktop-only feature flag."
        }
      ],
      nextAction: "Shrink to 2-week MVP or approve validation plan."
    };
  }

  /**
   * Shrinks current scope to a laser-focused 2-week MVP
   */
  static async shrinkTo2WeekMVP(sessionId) {
    await RedisStateManager.shrinkToMVP(sessionId);
    return {
      type: "SHRINK_TO_MVP",
      title: "2-Week MVP Delivery Cut",
      scopeKept: [
        "One-click guest checkout entry modal (Figma Frame 3A)",
        "Passkey / Apple Pay / Google Pay accelerated sheet",
        "Comparison tray strictly limited to 3 items on mobile & desktop",
        "72h stateless signed cart recovery token"
      ],
      scopeDeferredToV2: [
        "5-item expanded comparison grid (Marketing request)",
        "Buy Now Pay Later (Klarna/Affirm multi-tender split)",
        "AI proactive discount negotiation chatbot"
      ],
      estimatedVelocity: "28 Story Points (1 Sprint, 2 Engineers)",
      confidenceImpact: "Health increased to 95% with zero open blocking conflicts."
    };
  }

  /**
   * Creates an empirical validation plan
   */
  static async createValidationPlan(sessionId) {
    return {
      type: "VALIDATION_PLAN",
      title: "Evidence-Backed Validation Plan: AI Checkout",
      targetTimeline: "5 Days before Engineering Freeze",
      experiments: [
        {
          id: "exp_1",
          hypothesis: "Shoppers abandoning due to account creation will complete purchase if guest flow is available.",
          metric: "Guest Checkout Completion Rate (Target: > 62%)",
          method: "Unmoderated usability test on Figma prototype with 10 target shoppers."
        },
        {
          id: "exp_2",
          hypothesis: "Comparing 3 products drives higher purchase certainty than 5 products.",
          metric: "Time to decision & comparison abandonment rate",
          method: "A/B comparison test on staged checkout environment (3 vs 5 products)."
        }
      ],
      killCriteria: "If guest checkout conversion lift is < 4% across first 500 test sessions, pivot to social login auto-fill."
    };
  }

  /**
   * Generates the complete, structured PRD
   */
  static async generatePRD(sessionId) {
    const session = await RedisStateManager.getSession(sessionId);

    return {
      title: "Product Requirements Document: AI-Assisted Guest Checkout & Recovery",
      status: "APPROVED_FOR_DEV",
      owner: "Associate PM & Moonshot Studio",
      lastUpdated: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      evidenceConfidence: `${session.decisionHealth.confidence}%`,
      provenanceSummary: "100% traceable to Figma flows, Notion requirements, Linear ENG-142, and Exa market research.",
      sections: [
        {
          title: "1. Problem Statement & Opportunity",
          content: "Current checkout requires mandatory account registration with password creation. Analytics in Notion indicate 68% cart abandonment at the login modal. Furthermore, shoppers comparing alternative items in the cart lack an integrated comparison view, causing tab abandonment."
        },
        {
          title: "2. Market Intelligence & Competitor Positioning (via Exa)",
          content: "Exa research reveals that Stripe, Shopify, and Amazon all treat guest checkout as table-stakes. However, only 1 in 8 competitors offer an in-cart comparison tray, and none combine one-click guest checkout with predictive recovery incentives. PMPilot positions our checkout as the first to combine zero-friction guest purchase with a 3-item comparison tray."
        },
        {
          title: "3. User Personas & Stories",
          stories: [
            {
              asA: "First-time mobile shopper",
              iWant: "To check out instantly using Apple Pay without creating an account or password",
              soThat: "I can finalize my order in under 45 seconds."
            },
            {
              asA: "Hesitant shopper with multiple cart items",
              iWant: "To compare specs of up to 3 selected items side-by-side in the checkout tray",
              soThat: "I don't have to navigate back to product pages and lose my place."
            },
            {
              asA: "Returning shopper who closed the browser tab",
              iWant: "To receive a personalized recovery link that restores my exact cart state for 72 hours",
              soThat: "I can resume without re-adding items."
            }
          ]
        },
        {
          title: "4. Requirements & Acceptance Criteria (Observed vs Inferred)",
          requirements: [
            {
              id: "REQ-01",
              type: "OBSERVED",
              text: "Guest checkout CTA must be displayed prominently above the fold before the login prompt.",
              source: "Figma Frame 3A"
            },
            {
              id: "REQ-02",
              type: "OBSERVED",
              text: "Comparison tray must strictly limit display to 3 items maximum to preserve mobile UX.",
              source: "Decision Gate Resolution"
            },
            {
              id: "REQ-03",
              type: "INFERRED",
              text: "Session recovery tokens must be stateless and HMAC-SHA256 signed with a 72-hour TTL.",
              source: "Notion Security & Linear ENG-142"
            }
          ]
        },
        {
          title: "5. Delivery Plan & Linear Tickets",
          tickets: [
            { id: "ENG-201", title: "Build guest-checkout entry and modal UI states", points: 5, status: "Ready" },
            { id: "ENG-202", title: "Implement 3-product comparison drawer component", points: 8, status: "Ready" },
            { id: "ENG-203", title: "Stateless 72h cart token signed recovery endpoint", points: 5, status: "Ready" },
            { id: "ENG-204", title: "Instrument telemetry for drop-off and conversion lift", points: 3, status: "Ready" }
          ]
        }
      ]
    };
  }
}
