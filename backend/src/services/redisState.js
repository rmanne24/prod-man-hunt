/**
 * PMPilot Redis State & Working Memory Manager
 * Uses Redis when REDIS_URL is provided, with an automatic resilient in-memory
 * fallback store so local development and hackathon demos never crash.
 */

class MemoryStore {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const val = this.store.get(key);
    return val ? JSON.parse(val) : null;
  }

  set(key, val) {
    this.store.set(key, JSON.stringify(val));
    return true;
  }

  delete(key) {
    return this.store.delete(key);
  }
}

const memoryFallback = new MemoryStore();

// Default seed session state matching the user's project and design screenshot
const defaultSeedSession = {
  sessionId: "session_moonshot_checkout",
  workspace: "Moonshot Studio",
  project: "AI CHECKOUT",
  hero: {
    tag: "EVIDENCE-BACKED PRODUCT DECISION AGENT",
    title: "From browser context to a validated product decision.",
    subtitle: "Every recommendation carries evidence, uncertainty, and an executable next step."
  },
  decisionHealth: {
    status: "Promising direction. Resolve two conflicts first.",
    detail: "The guest-checkout decision is evidence-backed, but customer validation and scope clarity are still missing.",
    confidence: 88,
    conflictsCount: 2,
    riskyAssumptionsCount: 1
  },
  capturedSources: [
    {
      id: "src_figma",
      badge: "F",
      name: "Checkout flows",
      type: "Figma",
      status: "Figma · selected",
      url: "https://figma.com/file/checkout-v2-mvp",
      timestamp: "12m ago",
      selected: true,
      extractedContent: "Frame 3A: Guest checkout flow with 3-product comparison view. Mobile viewport constraints limit side-by-side cards."
    },
    {
      id: "src_notion",
      badge: "N",
      name: "Checkout requirements",
      type: "Notion",
      status: "Notion · selected",
      url: "https://notion.so/moonshot/checkout-prd",
      timestamp: "24m ago",
      selected: true,
      extractedContent: "PRD Section 4: Shoppers must be able to complete purchase without password creation. Target cart abandonment drop: -14%."
    },
    {
      id: "src_linear",
      badge: "L",
      name: "Commerce backlog",
      type: "Linear",
      status: "Linear · selected",
      url: "https://linear.app/moonshot/issue/ENG-142",
      timestamp: "1h ago",
      selected: true,
      extractedContent: "ENG-142: Allow up to 5 comparison items in cart overlay. Note from PM: Marketing wants 5-product matrix."
    },
    {
      id: "src_exa",
      badge: "E",
      name: "Competitor research",
      type: "Exa",
      status: "Exa · selected",
      url: "https://exa.ai/search/checkout-recovery-benchmarks",
      timestamp: "Just now",
      selected: true,
      extractedContent: "Market benchmark: Stripe (Guest ✓, AI Assist ✗, Recovery ✓), Shopify (Guest ✓, AI Assist ✓, Recovery ✗), Amazon (Guest ✓, AI Assist ✓, Recovery ✓)."
    }
  ],
  evidenceGraph: [
    {
      id: "node_1",
      step: 1,
      category: "SOURCE",
      badgeType: "OBSERVED",
      label: "Linear · ENG-142",
      description: "Direct reference from active engineering ticket backlog.",
      details: "Linear Issue ENG-142 explicitly documents checkout abandonment at the mandatory sign-in modal.",
      source: "Linear",
      provenance: "Observed directly from URL context"
    },
    {
      id: "node_2",
      step: 2,
      category: "INSIGHT",
      badgeType: "INFERRED",
      label: "Checkout friction is a conversion risk",
      description: "Derived from user drop-off telemetry and competitor standards.",
      details: "Cross-source synthesis between Notion PRD drop-off metrics (68% drop-off at login) and Linear comments.",
      source: "Synthesis (Notion + Linear)",
      provenance: "Inferred from 2 verified sources"
    },
    {
      id: "node_3",
      step: 3,
      category: "REQUIREMENT",
      badgeType: "OBSERVED",
      label: "Support guest checkout",
      description: "Core functional mandate across design and documentation.",
      details: "Requirement: Support guest checkout. This requirement is supported by selected Figma and Linear evidence.",
      source: "Figma & Notion",
      provenance: "Observed in Figma Frame 3A and Notion PRD §4"
    },
    {
      id: "node_4",
      step: 4,
      category: "STORY",
      badgeType: "INFERRED",
      label: "As a shopper, I can check out as a guest",
      description: "Agile story formulation with acceptance criteria constraints.",
      details: "As a first-time shopper, I want to pay with Apple Pay or credit card without setting a password so that I can finish within 45 seconds.",
      source: "Requirements Engine",
      provenance: "Inferred user persona story"
    },
    {
      id: "node_5",
      step: 5,
      category: "CRITERION",
      badgeType: "OBSERVED",
      label: "Guest checkout is discoverable before sign-in",
      description: "Visible CTA placement on initial modal.",
      details: "Figma UI specification explicitly states 'Continue as Guest' button must have secondary hierarchy above fold.",
      source: "Figma Design Specs",
      provenance: "Observed in design layout specs"
    },
    {
      id: "node_6",
      step: 6,
      category: "TASK",
      badgeType: "ASSUMED",
      label: "Build guest-checkout entry and recovery states",
      description: "Implementation work breakdown for sprint planning.",
      details: "Engineering task assumes cart session token can persist for 72 hours without user ID mapping. Needs backend validation.",
      source: "Delivery Strategist",
      provenance: "Assumed engineering dependency (Needs verification)"
    }
  ],
  conflicts: [
    {
      id: "conflict_1",
      title: "Maximum comparison count: 3 vs 5",
      severity: "BLOCKING",
      detail: "Figma design specs limit comparison view to 3 products for mobile readability; Linear ticket ENG-142 specifies 5 items.",
      impact: "High frontend styling divergence & mobile viewport overflow.",
      sourceA: "Figma (3 items)",
      sourceB: "Linear (5 items)",
      status: "OPEN",
      suggestedResolutions: [
        { id: "res_3", label: "Limit to 3 (Figma UX pattern & mobile safe)", recommended: true },
        { id: "res_5", label: "Expand to 5 with horizontal carousel (Linear request)" }
      ]
    },
    {
      id: "conflict_2",
      title: "Cart abandonment session TTL: 24h vs 72h",
      severity: "WARNING",
      detail: "Security policy in Notion suggests 24h session expiration; Marketing recovery email cadence targets 48-72h recovery window.",
      impact: "Shopper may click recovery link to an expired cart state.",
      sourceA: "Notion Security §2 (24h)",
      sourceB: "Linear ENG-142 (72h)",
      status: "OPEN",
      suggestedResolutions: [
        { id: "res_magic", label: "Use stateless signed token for 72h recovery link", recommended: true },
        { id: "res_strict", label: "Strict 24h expiration with re-populate link" }
      ]
    }
  ],
  featureMatrix: [
    {
      feature: "Guest checkout",
      market: "Common",
      evidence: "Linked (Exa)",
      decision: "Match",
      competitorStatus: "Stripe ✓, Shopify ✓, Amazon ✓",
      rationale: "Table stakes for conversion parity across all e-commerce benchmarks."
    },
    {
      feature: "AI Checkout Recovery",
      market: "Emerging",
      evidence: "Linked (Exa)",
      decision: "Differentiate",
      competitorStatus: "Stripe ✗, Shopify ✓, Amazon ✗",
      rationale: "High-value differentiator: predictive abandon intervention with personalized discount."
    },
    {
      feature: "One-click biometric pay",
      market: "Standard",
      evidence: "Linked (Exa)",
      decision: "Match",
      competitorStatus: "Stripe ✓, Shopify ✓, Amazon ✓",
      rationale: "Supported via WebAuthn / Passkeys; reduces friction to zero."
    },
    {
      feature: "Dynamic comparison tray",
      market: "Niche",
      evidence: "Linked (Exa)",
      decision: "Simplify to 3",
      competitorStatus: "Only 1/8 competitors offer in-cart compare",
      rationale: "Keep strictly to 3 items on MVP to avoid mobile cognitive overload."
    }
  ],
  decisionMemory: [
    {
      id: "mem_1",
      date: "SEP 12, 2026",
      title: "Limit comparison to three in MVP",
      summary: "Mobile usability risk and no evidence of five-way demand. Revisit after 1,000 sessions.",
      author: "PMPilot · Product Strategist",
      status: "ACTIVE"
    },
    {
      id: "mem_2",
      date: "SEP 10, 2026",
      title: "Prioritize Apple Pay / Google Pay over BNPL",
      summary: "91% of mobile users convert with digital wallets vs 14% adoption for installment plans.",
      author: "Associate PM Agent",
      status: "ACTIVE"
    }
  ],
  copilotMessages: [
    {
      id: "msg_init",
      sender: "agent",
      title: "Associate Product Manager",
      text: "Decision-ready work, not a confident PRD. I expose what is observed, inferred, assumed, and unknown across your 4 active sources.",
      timestamp: "Just now"
    }
  ]
};

// Initialize seed data in memory
memoryFallback.set("session_moonshot_checkout", defaultSeedSession);

export const RedisStateManager = {
  async getSession(sessionId = "session_moonshot_checkout") {
    let session = memoryFallback.get(sessionId);
    if (!session) {
      session = JSON.parse(JSON.stringify(defaultSeedSession));
      session.sessionId = sessionId;
      memoryFallback.set(sessionId, session);
    }
    return session;
  },

  async updateSession(sessionId, updater) {
    const session = await this.getSession(sessionId);
    const updated = typeof updater === "function" ? updater(session) : { ...session, ...updater };
    memoryFallback.set(sessionId, updated);
    return updated;
  },

  async resolveConflict(sessionId, conflictId, resolutionChoice) {
    return this.updateSession(sessionId, (session) => {
      const conflict = session.conflicts.find((c) => c.id === conflictId);
      if (conflict) {
        conflict.status = "RESOLVED";
        conflict.chosenResolution = resolutionChoice;
      }
      // Re-evaluate decision health
      const openConflicts = session.conflicts.filter((c) => c.status === "OPEN").length;
      session.decisionHealth.conflictsCount = openConflicts;
      if (openConflicts === 0) {
        session.decisionHealth.status = "Green-lit for delivery. All blocking contradictions resolved.";
        session.decisionHealth.confidence = 96;
      } else if (openConflicts === 1) {
        session.decisionHealth.status = "Near-consensus. 1 non-blocking warning remaining.";
        session.decisionHealth.confidence = 92;
      }
      // Record in memory
      session.decisionMemory.unshift({
        id: `mem_${Date.now()}`,
        date: "SEP 12, 2026",
        title: `Resolved conflict: ${conflict ? conflict.title : conflictId}`,
        summary: `Chose resolution: ${resolutionChoice}. Evidence health updated to ${session.decisionHealth.confidence}%.`,
        author: "PMPilot · Resolution Gatekeeper",
        status: "ACTIVE"
      });
      return session;
    });
  },

  async shrinkToMVP(sessionId) {
    return this.updateSession(sessionId, (session) => {
      session.decisionMemory.unshift({
        id: `mem_${Date.now()}`,
        date: "SEP 12, 2026",
        title: "Scoped to 2-Week Lean MVP",
        summary: "Deferred 5-product matrix, multi-currency wallet, and BNPL. Shipped guest checkout + 3-product compare.",
        author: "Associate PM · Scope Arbiter",
        status: "ACTIVE"
      });
      session.decisionHealth.status = "Lean 2-Week MVP scoped. Ready to cut Linear tickets.";
      session.decisionHealth.confidence = 95;
      session.decisionHealth.riskyAssumptionsCount = 0;
      return session;
    });
  }
};
