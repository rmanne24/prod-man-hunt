import React, { useState, useEffect } from 'react';
import LeftSidebar from './components/LeftSidebar.jsx';
import EvidenceWorkspace from './components/EvidenceWorkspace.jsx';
import CopilotSidebar from './components/CopilotSidebar.jsx';
import DeliveryArtifacts from './components/DeliveryArtifacts.jsx';
import ValidationPlanView from './components/ValidationPlanView.jsx';
import CaptureSourceModal from './components/CaptureSourceModal.jsx';
import AtWorkHub from './components/AtWorkHub.jsx';
import PocketCompanion from './components/PocketCompanion.jsx';
import WebAutomationAgent from './components/WebAutomationAgent.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import OmniBar from './components/OmniBar.jsx';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [activeNav, setActiveNav] = useState('evidence');
  const [session, setSession] = useState(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGeneratingJob, setIsGeneratingJob] = useState(false);
  const [jobProgress, setJobProgress] = useState(null);

  const fallbackSession = {
    sessionId: "session_moonshot_checkout",
    workspace: "Moonshot Studio",
    project: "AI CHECKOUT",
    decisionHealth: {
      status: "Promising direction. Resolve two conflicts first.",
      detail: "The guest-checkout decision is evidence-backed, but customer validation and scope clarity are still missing.",
      confidence: 88,
      conflictsCount: 2,
      riskyAssumptionsCount: 1
    },
    capturedSources: [
      { id: "src_figma", badge: "F", name: "Checkout flows", type: "Figma", status: "Figma · selected" },
      { id: "src_notion", badge: "N", name: "Checkout requirements", type: "Notion", status: "Notion · selected" },
      { id: "src_linear", badge: "L", name: "Commerce backlog", type: "Linear", status: "Linear · selected" },
      { id: "src_exa", badge: "E", name: "Competitor research", type: "Exa", status: "Exa · selected" }
    ],
    evidenceGraph: [
      {
        id: "node_1",
        category: "SOURCE",
        badgeType: "OBSERVED",
        label: "Linear · ENG-142",
        details: "Direct reference from active engineering ticket backlog. Documents drop-off at login.",
        source: "Linear",
        provenance: "Observed directly from URL context"
      },
      {
        id: "node_2",
        category: "INSIGHT",
        badgeType: "INFERRED",
        label: "Checkout friction is a conversion risk",
        details: "Cross-source synthesis between Notion PRD drop-off metrics (68% drop-off) and Linear comments.",
        source: "Synthesis (Notion + Linear)",
        provenance: "Inferred from 2 verified sources"
      },
      {
        id: "node_3",
        category: "REQUIREMENT",
        badgeType: "OBSERVED",
        label: "Support guest checkout",
        details: "Requirement: Support guest checkout. This requirement is supported by selected Figma and Linear evidence.",
        source: "Figma & Notion",
        provenance: "Observed in Figma Frame 3A and Notion PRD §4"
      },
      {
        id: "node_4",
        category: "STORY",
        badgeType: "INFERRED",
        label: "As a shopper, I can check out as a guest",
        details: "As a first-time shopper, I want to pay with Apple Pay without setting a password so that I can finish within 45 seconds.",
        source: "Requirements Engine",
        provenance: "Inferred user persona story"
      },
      {
        id: "node_5",
        category: "CRITERION",
        badgeType: "OBSERVED",
        label: "Guest checkout is discoverable before sign-in",
        details: "Figma UI specification explicitly states 'Continue as Guest' button must have secondary hierarchy above fold.",
        source: "Figma Design Specs",
        provenance: "Observed in design layout specs"
      },
      {
        id: "node_6",
        category: "TASK",
        badgeType: "ASSUMED",
        label: "Build guest-checkout entry and recovery states",
        details: "Engineering task assumes cart session token can persist for 72 hours without user ID mapping.",
        source: "Delivery Strategist",
        provenance: "Assumed engineering dependency (Needs verification)"
      }
    ],
    conflicts: [
      {
        id: "conflict_1",
        title: "Maximum comparison count: 3 vs 5",
        severity: "BLOCKING",
        detail: "Figma says three products; Linear says five. Block sprint lock until UX and backlog align.",
        status: "OPEN"
      }
    ],
    featureMatrix: [
      {
        feature: "Guest checkout",
        market: "Common",
        evidence: "Linked",
        decision: "Match",
        competitorStatus: "Stripe ✓, Shopify ✓, Amazon ✓, Bolt ✓",
        rationale: "Absolute baseline for conversion parity across all e-commerce benchmarks."
      },
      {
        feature: "AI Checkout Recovery",
        market: "Emerging",
        evidence: "Linked",
        decision: "Differentiate",
        competitorStatus: "Stripe ✗, Shopify ✓, Amazon ✗, Bolt ✗",
        rationale: "High-value differentiator: predictive abandon intervention with personalized incentive."
      },
      {
        feature: "Dynamic comparison tray",
        market: "Niche",
        evidence: "Linked",
        decision: "Limit to 3",
        competitorStatus: "Only 1/8 competitor benchmarks offer comparison in-cart",
        rationale: "Figma UX constraint of 3 products is optimal for mobile readability. Defer 5 products to V2."
      }
    ],
    decisionMemory: [
      {
        date: "SEP 12, 2026",
        title: "Limit comparison to three in MVP",
        summary: "Mobile usability risk and no evidence of five-way demand. Revisit after 1,000 sessions."
      }
    ]
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/session');
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          return;
        }
      }
    } catch (err) {
      // Fallback
    }
    setSession(fallbackSession);
  };

  const handleResolveConflict = async (conflictId, choice) => {
    try {
      const res = await fetch('http://localhost:4000/api/session/session_moonshot_checkout/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_conflict',
          payload: { conflictId, resolution: choice }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          return;
        }
      }
    } catch (err) {
      setSession(prev => {
        const next = { ...prev };
        const c = next.conflicts.find(x => x.id === conflictId);
        if (c) {
          c.status = 'RESOLVED';
          c.chosenResolution = choice;
        }
        next.decisionHealth.conflictsCount = 0;
        next.decisionHealth.confidence = 96;
        next.decisionHealth.status = "Green-lit for delivery. All blocking contradictions resolved.";
        return next;
      });
    }
  };

  const handleReopenDecision = async () => {
    try {
      await fetch('http://localhost:4000/api/session/session_moonshot_checkout/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen_decision' })
      });
      fetchSession();
    } catch (err) {
      setSession(prev => ({
        ...prev,
        decisionHealth: {
          ...prev.decisionHealth,
          status: "Reopened decision: Limit comparison to three.",
          confidence: 82
        }
      }));
    }
  };

  const handleGenerateDecisionPack = async () => {
    setIsGeneratingJob(true);
    setJobProgress({ step: "Trigger.dev: Queued async job...", percent: 20 });

    try {
      const res = await fetch('http://localhost:4000/api/jobs/prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session_moonshot_checkout' })
      });
      const data = await res.json();

      let pct = 20;
      const interval = setInterval(async () => {
        pct += 25;
        if (pct >= 100) {
          clearInterval(interval);
          setJobProgress({ step: "Completed! Generated PRD and Linear backlog.", percent: 100 });
          setTimeout(() => {
            setIsGeneratingJob(false);
            setActiveNav('artifacts');
          }, 800);
        } else {
          setJobProgress({ step: `Trigger.dev running agent pipeline (${pct}%)...`, percent: pct });
        }
      }, 700);
    } catch (err) {
      setTimeout(() => {
        setIsGeneratingJob(false);
        setActiveNav('artifacts');
      }, 1200);
    }
  };

  const activeSession = session || fallbackSession;

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: '#f7f8f4'
    }}>
      {/* 1. Left Sidebar */}
      <LeftSidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        sources={activeSession.capturedSources || []}
        onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Main Workspace Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto'
      }}>
        {activeNav === 'evidence' && (
          <EvidenceWorkspace
            session={activeSession}
            onResolveConflict={handleResolveConflict}
            onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
            onGenerateDecisionPack={handleGenerateDecisionPack}
          />
        )}

        {activeNav === 'atwork' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <AtWorkHub />
          </div>
        )}

        {activeNav === 'pocket' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <PocketCompanion onResolveConflict={handleResolveConflict} />
          </div>
        )}

        {activeNav === 'web' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <WebAutomationAgent />
          </div>
        )}

        {activeNav === 'decisions' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <DeliveryArtifacts />
          </div>
        )}

        {activeNav === 'validation' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <ValidationPlanView />
          </div>
        )}

        {activeNav === 'artifacts' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <DeliveryArtifacts />
          </div>
        )}
      </main>

      {/* 3. Right Copilot Sidebar */}
      <CopilotSidebar
        decisionMemory={activeSession.decisionMemory || []}
        onAction={(type) => {
          if (type === 'shrink_to_mvp') {
            setSession(prev => ({
              ...prev,
              decisionHealth: {
                ...prev.decisionHealth,
                status: "Lean 2-Week MVP scoped. Ready to cut Linear tickets.",
                confidence: 95,
                riskyAssumptionsCount: 0
              }
            }));
          }
        }}
        onReopenDecision={handleReopenDecision}
      />

      {/* 4. Floating OmniBar */}
      <OmniBar
        onPromptSubmit={(query) => {
          if (query.toLowerCase().includes("prd") || query.toLowerCase().includes("generate")) {
            handleGenerateDecisionPack();
          } else {
            alert(`Associate PM processing: "${query}". Context pinned to active evidence.`);
          }
        }}
      />

      {/* 5. Modals */}
      <CaptureSourceModal
        isOpen={isCaptureModalOpen}
        onClose={() => setIsCaptureModalOpen(false)}
        onSourceAdded={(newSources) => {
          if (newSources) {
            setSession(prev => ({ ...prev, capturedSources: newSources }));
          }
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Trigger.dev Async Job Modal */}
      {isGeneratingJob && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '32px',
            width: '420px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#e6f7ec',
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111915', marginBottom: '8px' }}>
              Trigger.dev Async Pipeline
            </h3>
            <p style={{ fontSize: '13px', color: '#55695e', marginBottom: '20px' }}>
              {jobProgress?.step || "Processing multimodal PM context..."}
            </p>

            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e8e1',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${jobProgress?.percent || 20}%`,
                height: '100%',
                background: '#047857',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
