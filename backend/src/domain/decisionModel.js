/**
 * PMPilot Canonical Decision Domain Model
 * 
 * Provides domain schemas, validation, and factory helpers.
 * All seeded sample data is explicitly tagged as synthetic demo fixtures.
 */

/**
 * Valid lifecycle states for a decision
 * @typedef {'DRAFT' | 'TRIAGE' | 'EVIDENCE_REVIEW' | 'CONFLICT_REVIEW' | 'RECOMMENDATION_READY' | 'AWAITING_HUMAN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'ARTIFACT_GENERATED'} DecisionLifecycleStatus
 */

/**
 * Valid epistemic classifications (epistemic type, independent of confidence)
 * @typedef {'OBSERVED' | 'INFERRED' | 'ASSUMED' | 'UNKNOWN'} EpistemicType
 */

/**
 * Standard approval actions
 * @typedef {'APPROVE' | 'REJECT' | 'REQUEST_REVISION'} ApprovalAction
 */

export const DECISION_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  TRIAGE: 'TRIAGE',
  EVIDENCE_REVIEW: 'EVIDENCE_REVIEW',
  CONFLICT_REVIEW: 'CONFLICT_REVIEW',
  RECOMMENDATION_READY: 'RECOMMENDATION_READY',
  AWAITING_HUMAN_APPROVAL: 'AWAITING_HUMAN_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
  ARTIFACT_GENERATED: 'ARTIFACT_GENERATED'
});

export const EPISTEMIC_TYPES = Object.freeze({
  OBSERVED: 'OBSERVED',
  INFERRED: 'INFERRED',
  ASSUMED: 'ASSUMED',
  UNKNOWN: 'UNKNOWN'
});

export const APPROVAL_ACTIONS = Object.freeze({
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  REQUEST_REVISION: 'REQUEST_REVISION'
});

/**
 * Creates a new canonical DecisionRecord instance
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.workspace
 * @param {string} params.project
 * @param {string} params.title
 * @param {string} params.productArea
 * @param {Object} [params.problemStatement]
 * @returns {Object} Canonical DecisionRecord
 */
export function createDecisionRecord({
  id,
  workspace,
  project,
  title,
  productArea,
  problemStatement = {}
}) {
  const now = new Date().toISOString();
  const decisionId = id || `dec_${Date.now()}`;

  return {
    id: decisionId,
    get sessionId() { return this.id; }, // Compatibility alias for existing UI
    version: 1,
    workspace: workspace || 'Default Workspace',
    project: project || 'Default Project',
    title: title || 'Untitled Decision',
    productArea: productArea || 'Core Product',
    
    status: DECISION_STATES.DRAFT,

    problemStatement: {
      surfaceRequest: problemStatement.surfaceRequest || '',
      underlyingProblem: problemStatement.underlyingProblem || '',
      targetPersona: problemStatement.targetPersona || '',
      businessImpact: problemStatement.businessImpact || ''
    },

    signals: [],
    evidenceGraph: [],
    conflicts: [],
    candidateOptions: [],
    featureMatrix: [],

    recommendation: null,

    decisionHealth: {
      confidence: 50,
      conflictsCount: 0,
      riskyAssumptionsCount: 0,
      status: 'Initial draft. Awaiting signals and evidence.',
      detail: 'No signals have been triaged yet.',
      epistemicBreakdown: {
        observed: 0,
        inferred: 0,
        assumed: 0,
        unknown: 0
      }
    },

    approvalRecord: {
      status: 'PENDING',
      approvedDecisionVersion: null,
      decidedBy: null,
      decidedVia: null,
      decidedAt: null,
      rationale: null,
      conditions: [],
      invalidationReason: null
    },

    artifacts: {
      prd: null,
      userStories: [],
      linearTickets: [],
      validationPlan: []
    },

    decisionMemory: [],
    activityLog: [
      {
        id: `act_${Date.now()}_init`,
        timestamp: now,
        actor: 'SYSTEM',
        role: 'Orchestrator',
        action: 'INIT_DECISION',
        summary: `Initialized decision record '${title}' at version 1.`
      }
    ],

    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates a Signal object with explicit synthetic demo labeling if applicable
 */
export function createSignal({
  id,
  source,
  sourceType,
  url = null,
  rawText,
  capturedBy = 'Unknown User',
  category = 'FEATURE_REQUEST',
  underlyingCustomerProblem = null,
  relatedSignalIds = [],
  isSyntheticDemo = false
}) {
  return {
    id: id || `sig_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    source: source || 'Unknown Source',
    sourceType: sourceType || 'OTHER',
    url: url || null,
    capturedAt: new Date().toISOString(),
    capturedBy,
    rawText: rawText || '',
    sanitizedText: rawText || '',
    category,
    underlyingCustomerProblem,
    relatedSignalIds,
    processingStatus: 'RAW',
    isSyntheticDemo: Boolean(isSyntheticDemo),
    verificationStatus: isSyntheticDemo ? 'SYNTHETIC_FIXTURE' : 'UNVERIFIED'
  };
}

/**
 * Creates an EvidenceNode with separate multi-source provenance and separated confidence rating
 */
export function createEvidenceNode({
  id,
  step = 1,
  category = 'SOURCE',
  epistemicType = EPISTEMIC_TYPES.OBSERVED,
  confidenceRating = null,
  label,
  description = '',
  details = '',
  sources = [],
  relatedOptionId = null,
  isSyntheticDemo = false
}) {
  // Validate epistemic type
  const validEpistemic = Object.values(EPISTEMIC_TYPES).includes(epistemicType)
    ? epistemicType
    : EPISTEMIC_TYPES.UNKNOWN;

  // Validate sources array structure: must be an array of { sourceSignalId, sourceLabel, verbatimExcerpt }
  const validatedSources = Array.isArray(sources)
    ? sources.map((s) => ({
        sourceSignalId: s.sourceSignalId || 'unknown_signal',
        sourceLabel: s.sourceLabel || 'Unknown Source',
        verbatimExcerpt: s.verbatimExcerpt || ''
      }))
    : [];

  return {
    id: id || `ev_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    step,
    category,
    epistemicType: validEpistemic,
    badgeType: validEpistemic, // Compatibility alias for existing EvidenceGraph.jsx UI
    confidenceRating: typeof confidenceRating === 'number' ? Math.max(0, Math.min(100, confidenceRating)) : null,
    label: label || 'Untitled Evidence',
    description,
    details,
    sources: validatedSources,
    // Compatibility fields for existing EvidenceGraph.jsx UI
    get source() {
      return validatedSources.length > 0 ? validatedSources.map((s) => s.sourceLabel).join(' + ') : 'Verified';
    },
    get provenance() {
      if (isSyntheticDemo) return '[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry';
      return validatedSources.length > 0
        ? `Grounded in ${validatedSources.map((s) => s.sourceLabel).join(', ')}`
        : 'Unverified source claim';
    },
    relatedOptionId,
    isSyntheticDemo: Boolean(isSyntheticDemo),
    verificationStatus: isSyntheticDemo ? 'SYNTHETIC_FIXTURE' : 'UNVERIFIED'
  };
}

/**
 * Creates a Contradiction object
 */
export function createContradiction({
  id,
  title,
  severity = 'BLOCKING',
  claimA,
  claimB,
  conflictDetail = '',
  impact = '',
  suggestedResolutions = [],
  isSyntheticDemo = false
}) {
  return {
    id: id || `conflict_${Date.now()}`,
    title: title || 'Untitled Contradiction',
    severity: severity === 'WARNING' ? 'WARNING' : 'BLOCKING',
    status: 'OPEN',
    claimA: {
      statement: claimA?.statement || '',
      sourceSignalId: claimA?.sourceSignalId || null,
      sourceLabel: claimA?.sourceLabel || '',
      excerpt: claimA?.excerpt || ''
    },
    claimB: {
      statement: claimB?.statement || '',
      sourceSignalId: claimB?.sourceSignalId || null,
      sourceLabel: claimB?.sourceLabel || '',
      excerpt: claimB?.excerpt || ''
    },
    conflictDetail,
    impact,
    suggestedResolutions: Array.isArray(suggestedResolutions) ? suggestedResolutions : [],
    chosenResolution: null,
    isSyntheticDemo: Boolean(isSyntheticDemo)
  };
}

/**
 * Returns the synthetic seed decision record for hackathon demos.
 * All sample signals, metrics, URLs, and claims are explicitly labeled as synthetic demo fixtures.
 */
export function createSyntheticDemoDecision() {
  const now = new Date().toISOString();

  const decision = createDecisionRecord({
    id: 'session_moonshot_checkout',
    workspace: 'Moonshot Studio [DEMO]',
    project: 'AI CHECKOUT [SYNTHETIC DEMO]',
    title: '[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery',
    productArea: 'E-Commerce Checkout & Payments',
    problemStatement: {
      surfaceRequest: '[SYNTHETIC DEMO] Add 5-product comparison tray and guest checkout modal.',
      underlyingProblem: '[SYNTHETIC DEMO] Simulated telemetry: 68% cart abandonment at mandatory account creation modal.',
      targetPersona: 'First-time mobile shopper (Synthetic Persona)',
      businessImpact: 'Simulated potential +14% lift on first-time checkout conversion.'
    }
  });

  decision.status = DECISION_STATES.CONFLICT_REVIEW;
  decision.version = 1;
  decision.isSyntheticDemo = true;
  decision.verificationStatus = 'SYNTHETIC_FIXTURE';

  // 1. Synthetic Signals
  const sigFigma = createSignal({
    id: 'sig_synthetic_figma_3a',
    source: '[SYNTHETIC DEMO] Figma Frame 3A (Checkout v2)',
    sourceType: 'FIGMA',
    url: 'https://figma.example.internal/synthetic/checkout-v2',
    capturedBy: 'Alex Chen [Synthetic Demo User]',
    rawText: 'Frame 3A: Guest checkout flow with 3-product comparison view. Mobile viewport constraints limit side-by-side cards.',
    category: 'DESIGN_SPEC',
    underlyingCustomerProblem: 'Mobile screen real estate cannot accommodate more than 3 side-by-side cards without horizontal scrolling.',
    isSyntheticDemo: true
  });
  sigFigma.processingStatus = 'EVALUATED';

  const sigLinear = createSignal({
    id: 'sig_synthetic_linear_142',
    source: '[SYNTHETIC DEMO] Linear ENG-142',
    sourceType: 'LINEAR',
    url: 'https://linear.example.internal/synthetic/issue/ENG-142',
    capturedBy: 'Marcus Brody [Synthetic Demo User]',
    rawText: 'ENG-142: Allow up to 5 comparison items in cart overlay. Drop-off at login modal is 68%. Marketing request: 5-product matrix.',
    category: 'FEATURE_REQUEST',
    underlyingCustomerProblem: 'First-time buyers abandon carts when forced to register passwords.',
    isSyntheticDemo: true
  });
  sigLinear.processingStatus = 'EVALUATED';

  const sigNotion = createSignal({
    id: 'sig_synthetic_notion_sec',
    source: '[SYNTHETIC DEMO] Notion PRD & Security §4',
    sourceType: 'NOTION',
    url: 'https://notion.example.internal/synthetic/prd-security',
    capturedBy: 'Security Team [Synthetic Demo]',
    rawText: 'Security §4: Stateless signed cart recovery tokens must expire within 24h to 72h depending on checkout tender.',
    category: 'DESIGN_SPEC',
    underlyingCustomerProblem: 'Balancing session recovery convenience against checkout token expiration.',
    isSyntheticDemo: true
  });
  sigNotion.processingStatus = 'EVALUATED';

  decision.signals = [sigFigma, sigLinear, sigNotion];

  // 2. Synthetic Evidence Nodes (Multi-source, separate verbatim quotes, explicit confidence)
  decision.evidenceGraph = [
    createEvidenceNode({
      id: 'node_1',
      step: 1,
      category: 'SOURCE',
      epistemicType: EPISTEMIC_TYPES.OBSERVED,
      confidenceRating: 98,
      label: '[SYNTHETIC] Linear ENG-142 Drop-off Telemetry',
      description: 'Engineering ticket documents 68% cart abandonment at mandatory login modal.',
      details: '[SYNTHETIC DEMO DATA] Issue ENG-142 states 68% drop-off at login modal.',
      sources: [
        {
          sourceSignalId: 'sig_synthetic_linear_142',
          sourceLabel: '[SYNTHETIC DEMO] Linear ENG-142',
          verbatimExcerpt: 'Drop-off at login modal is 68%.'
        }
      ],
      isSyntheticDemo: true
    }),
    createEvidenceNode({
      id: 'node_2',
      step: 2,
      category: 'INSIGHT',
      epistemicType: EPISTEMIC_TYPES.INFERRED,
      confidenceRating: 85,
      label: '[SYNTHETIC] Mandatory Login is Conversion Bottleneck',
      description: 'Synthesized from drop-off telemetry and specification requirements.',
      details: '[SYNTHETIC DEMO INFERENCE] Inferred that mandatory registration causes drop-off.',
      sources: [
        {
          sourceSignalId: 'sig_synthetic_linear_142',
          sourceLabel: '[SYNTHETIC DEMO] Linear ENG-142',
          verbatimExcerpt: 'Drop-off at login modal is 68%.'
        },
        {
          sourceSignalId: 'sig_synthetic_figma_3a',
          sourceLabel: '[SYNTHETIC DEMO] Figma Frame 3A',
          verbatimExcerpt: 'Frame 3A: Guest checkout flow with 3-product comparison view.'
        }
      ],
      isSyntheticDemo: true
    }),
    createEvidenceNode({
      id: 'node_3',
      step: 3,
      category: 'REQUIREMENT',
      epistemicType: EPISTEMIC_TYPES.OBSERVED,
      confidenceRating: 95,
      label: '[SYNTHETIC] Support 1-Click Guest Checkout',
      description: 'Design spec provides guest checkout above fold before login prompt.',
      details: '[SYNTHETIC DEMO DATA] Figma specifies guest checkout entry modal.',
      sources: [
        {
          sourceSignalId: 'sig_synthetic_figma_3a',
          sourceLabel: '[SYNTHETIC DEMO] Figma Frame 3A',
          verbatimExcerpt: 'Frame 3A: Guest checkout flow with 3-product comparison view.'
        }
      ],
      isSyntheticDemo: true
    }),
    createEvidenceNode({
      id: 'node_4',
      step: 4,
      category: 'STORY',
      epistemicType: EPISTEMIC_TYPES.INFERRED,
      confidenceRating: 80,
      label: '[SYNTHETIC] As a shopper, check out as a guest',
      description: 'User story derived for first-time mobile shoppers.',
      details: '[SYNTHETIC DEMO STORY] First-time shopper checks out in under 45 seconds.',
      sources: [
        {
          sourceSignalId: 'sig_synthetic_figma_3a',
          sourceLabel: '[SYNTHETIC DEMO] Figma Frame 3A',
          verbatimExcerpt: 'Guest checkout flow with 3-product comparison view.'
        }
      ],
      isSyntheticDemo: true
    }),
    createEvidenceNode({
      id: 'node_5',
      step: 5,
      category: 'TASK',
      epistemicType: EPISTEMIC_TYPES.ASSUMED,
      confidenceRating: 60,
      label: '[SYNTHETIC ASSUMPTION] Stateless 72h Recovery Token',
      description: 'Hypothesis: recovery links can persist for 72h without server session storage.',
      details: '[SYNTHETIC DEMO ASSUMPTION] Assumes 72h token TTL satisfies security policy.',
      sources: [
        {
          sourceSignalId: 'sig_synthetic_notion_sec',
          sourceLabel: '[SYNTHETIC DEMO] Notion PRD & Security §4',
          verbatimExcerpt: 'Security §4: Stateless signed cart recovery tokens must expire within 24h to 72h depending on checkout tender.'
        }
      ],
      isSyntheticDemo: true
    })
  ];

  // 3. Synthetic Contradiction
  decision.conflicts = [
    createContradiction({
      id: 'conflict_1',
      title: '[SYNTHETIC DEMO] Maximum Comparison Count: 3 vs 5 Items',
      severity: 'BLOCKING',
      claimA: {
        statement: 'Limit comparison tray to 3 products for mobile readability',
        sourceSignalId: 'sig_synthetic_figma_3a',
        sourceLabel: '[SYNTHETIC DEMO] Figma Frame 3A',
        excerpt: 'Mobile viewport constraints limit side-by-side cards.'
      },
      claimB: {
        statement: 'Allow up to 5 comparison items in cart overlay',
        sourceSignalId: 'sig_synthetic_linear_142',
        sourceLabel: '[SYNTHETIC DEMO] Linear ENG-142',
        excerpt: 'Marketing request: 5-product matrix.'
      },
      conflictDetail: 'Figma design specs limit comparison view to 3 products for mobile readability; Linear ticket ENG-142 requests 5 products.',
      impact: 'Blocking sprint lock: divergence between design system and backlog tickets.',
      suggestedResolutions: [
        {
          id: 'res_3',
          label: 'Limit to 3 items in MVP (Figma mobile-safe pattern)',
          rationale: 'Protects mobile viewport from horizontal scroll fatigue.',
          tradeOff: 'Defers 5-product grid request to V2 backlog.',
          recommended: true
        },
        {
          id: 'res_5',
          label: 'Expand to 5 items with horizontal carousel (Marketing request)',
          rationale: 'Satisfies stakeholder request for wider comparison.',
          tradeOff: 'Higher cognitive load and potential overflow on mobile.',
          recommended: false
        }
      ],
      isSyntheticDemo: true
    })
  ];

  // 4. Synthetic Candidate Options
  decision.candidateOptions = [
    {
      id: 'opt_guest_3item',
      title: 'Option A: 3-Item Tray + 1-Click Guest Checkout (Recommended)',
      pros: ['Zero mobile layout distortion', 'Immediate conversion lift on first-time checkouts', 'Fits in 2-week sprint'],
      cons: ['Defers marketing 5-item comparison to V2'],
      estimatedStoryPoints: 21
    },
    {
      id: 'opt_full_5item',
      title: 'Option B: 5-Item Carousel + Mandatory Account Creation',
      pros: ['Delivers full marketing feature matrix upfront'],
      cons: ['Retains 68% drop-off barrier at login', 'Requires 5-week build'],
      estimatedStoryPoints: 42
    }
  ];

  decision.featureMatrix = [
    {
      feature: 'Guest checkout',
      market: 'Common',
      evidence: 'Linked [Synthetic Benchmark]',
      decision: 'Match',
      competitorStatus: 'Stripe ✓, Shopify ✓, Amazon ✓ [Synthetic Benchmark]',
      rationale: 'Table stakes for conversion parity across modern e-commerce checkouts.'
    },
    {
      feature: 'Dynamic comparison tray',
      market: 'Niche',
      evidence: 'Linked [Synthetic Benchmark]',
      decision: 'Limit to 3',
      competitorStatus: '1 of 8 benchmarks offer in-cart compare [Synthetic Benchmark]',
      rationale: 'Mobile viewport constraint of 3 products is optimal for readability.'
    }
  ];

  decision.recommendation = {
    selectedOptionId: 'opt_guest_3item',
    title: '[SYNTHETIC RECOMMENDATION] Ship 3-Item Tray + Guest Checkout in 2-Week MVP',
    rationale: 'Prioritizes verified mobile usability constraints over unverified 5-product marketing request.',
    tradeOffs: ['Defers 5-product comparison grid to V2 release'],
    unknowns: ['72h token TTL requires security team sign-off before production release'],
    evidenceConfidence: 88
  };

  decision.decisionHealth = {
    confidence: 88,
    conflictsCount: 1,
    riskyAssumptionsCount: 1,
    status: '[SYNTHETIC DEMO] 1 blocking conflict open. Resolve before recommendation approval.',
    detail: 'Guest checkout is evidence-backed, but comparison limit conflict blocks sprint lock.',
    epistemicBreakdown: {
      observed: 2,
      inferred: 2,
      assumed: 1,
      unknown: 0
    }
  };

  decision.decisionMemory = [
    {
      id: 'mem_seed_1',
      date: 'SEP 12, 2026',
      title: '[SYNTHETIC DEMO MEMORY] Limit comparison to three in MVP',
      summary: 'Mobile usability risk and no evidence of five-way demand. Revisit after 1,000 sessions.',
      author: 'PMPilot · Product Strategist (Synthetic)',
      status: 'ACTIVE'
    }
  ];

  return decision;
}

