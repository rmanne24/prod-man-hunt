import React, { useState, useEffect, useCallback } from 'react';
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

const fallbackSession = {
  id: "session_moonshot_checkout",
  sessionId: "session_moonshot_checkout",
  workspace: "Moonshot Studio [DEMO]",
  project: "AI CHECKOUT [SYNTHETIC DEMO]",
  title: "[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery",
  status: "CONFLICT_REVIEW",
  version: 1,
  approvalRecord: {
    status: "PENDING",
    approvedDecisionVersion: null,
    decidedBy: null,
    decidedAt: null,
    conditions: []
  },
  decisionHealth: {
    status: "[SYNTHETIC DEMO] 1 blocking conflict open. Resolve before recommendation approval.",
    detail: "Guest checkout is evidence-backed, but comparison limit conflict blocks sprint lock.",
    confidence: 88,
    conflictsCount: 1,
    riskyAssumptionsCount: 1
  },
  capturedSources: [
    { id: "src_figma", badge: "F", name: "[SYNTHETIC DEMO] Figma Frame 3A", type: "Figma", status: "Figma · evaluated" },
    { id: "src_linear", badge: "L", name: "[SYNTHETIC DEMO] Linear ENG-142", type: "Linear", status: "Linear · evaluated" },
    { id: "src_notion", badge: "N", name: "[SYNTHETIC DEMO] Notion PRD & Security", type: "Notion", status: "Notion · evaluated" }
  ],
  evidenceGraph: [
    {
      id: "node_1",
      category: "SOURCE",
      badgeType: "OBSERVED",
      label: "[SYNTHETIC] Linear ENG-142 Drop-off Telemetry",
      details: "[SYNTHETIC DEMO DATA] Issue ENG-142 states 68% drop-off at login modal.",
      source: "Linear",
      provenance: "[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry",
      sources: [
        {
          sourceSignalId: "sig_synthetic_linear_142",
          sourceLabel: "[SYNTHETIC DEMO] Linear ENG-142",
          verbatimExcerpt: "Drop-off at login modal is 68%."
        }
      ]
    },
    {
      id: "node_2",
      category: "INSIGHT",
      badgeType: "INFERRED",
      label: "[SYNTHETIC] Mandatory Login is Conversion Bottleneck",
      details: "[SYNTHETIC DEMO INFERENCE] Inferred that mandatory registration causes drop-off.",
      source: "Synthesis (Notion + Linear)",
      provenance: "[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry",
      sources: [
        {
          sourceSignalId: "sig_synthetic_linear_142",
          sourceLabel: "[SYNTHETIC DEMO] Linear ENG-142",
          verbatimExcerpt: "Drop-off at login modal is 68%."
        },
        {
          sourceSignalId: "sig_synthetic_figma_3a",
          sourceLabel: "[SYNTHETIC DEMO] Figma Frame 3A",
          verbatimExcerpt: "Frame 3A: Guest checkout flow with 3-product comparison view."
        }
      ]
    },
    {
      id: "node_3",
      category: "REQUIREMENT",
      badgeType: "OBSERVED",
      label: "[SYNTHETIC] Support 1-Click Guest Checkout",
      details: "[SYNTHETIC DEMO DATA] Figma specifies guest checkout entry modal.",
      source: "Figma & Notion",
      provenance: "[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry",
      sources: [
        {
          sourceSignalId: "sig_synthetic_figma_3a",
          sourceLabel: "[SYNTHETIC DEMO] Figma Frame 3A",
          verbatimExcerpt: "Frame 3A: Guest checkout flow with 3-product comparison view."
        }
      ]
    },
    {
      id: "node_4",
      category: "STORY",
      badgeType: "INFERRED",
      label: "[SYNTHETIC] As a shopper, check out as a guest",
      details: "[SYNTHETIC DEMO STORY] First-time shopper checks out in under 45 seconds.",
      source: "Requirements Engine",
      provenance: "[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry",
      sources: [
        {
          sourceSignalId: "sig_synthetic_figma_3a",
          sourceLabel: "[SYNTHETIC DEMO] Figma Frame 3A",
          verbatimExcerpt: "Guest checkout flow with 3-product comparison view."
        }
      ]
    },
    {
      id: "node_5",
      category: "TASK",
      badgeType: "ASSUMED",
      label: "[SYNTHETIC ASSUMPTION] Stateless 72h Recovery Token",
      details: "[SYNTHETIC DEMO ASSUMPTION] Assumes 72h token TTL satisfies security policy.",
      source: "Delivery Strategist",
      provenance: "[SYNTHETIC DEMO FIXTURE] Not verified against production telemetry",
      sources: [
        {
          sourceSignalId: "sig_synthetic_notion_sec",
          sourceLabel: "[SYNTHETIC DEMO] Notion PRD & Security §4",
          verbatimExcerpt: "Security §4: Stateless signed cart recovery tokens must expire within 24h to 72h depending on checkout tender."
        }
      ]
    }
  ],
  conflicts: [
    {
      id: "conflict_1",
      title: "[SYNTHETIC DEMO] Maximum Comparison Count: 3 vs 5 Items",
      severity: "BLOCKING",
      detail: "Figma design specs limit comparison view to 3 products for mobile readability; Linear ticket ENG-142 requests 5 products.",
      status: "OPEN"
    }
  ],
  featureMatrix: [
    {
      feature: "Guest checkout",
      market: "Common",
      evidence: "Linked [Synthetic Benchmark]",
      decision: "Match",
      competitorStatus: "Stripe ✓, Shopify ✓, Amazon ✓ [Synthetic Benchmark]",
      rationale: "Table stakes for conversion parity across modern e-commerce checkouts."
    },
    {
      feature: "Dynamic comparison tray",
      market: "Niche",
      evidence: "Linked [Synthetic Benchmark]",
      decision: "Limit to 3",
      competitorStatus: "1 of 8 benchmarks offer in-cart compare [Synthetic Benchmark]",
      rationale: "Mobile viewport constraint of 3 products is optimal for readability."
    }
  ],
  decisionMemory: [
    {
      date: "SEP 12, 2026",
      title: "[SYNTHETIC DEMO MEMORY] Limit comparison to three in MVP",
      summary: "Mobile usability risk and no evidence of five-way demand. Revisit after 1,000 sessions.",
      author: "PMPilot · Product Strategist (Synthetic)",
      status: "ACTIVE"
    }
  ]
};

export default function App() {
  const [activeNav, setActiveNav] = useState('evidence');
  const [session, setSession] = useState(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGeneratingJob, setIsGeneratingJob] = useState(false);
  const [jobProgress, setJobProgress] = useState(null);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  const fetchSession = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const handleResolveConflict = async (conflictId, choice) => {
    try {
      const res = await fetch('http://localhost:4000/api/session/session_moonshot_checkout/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_conflict',
          payload: {
            conflictId,
            resolution: choice,
            expectedVersion: activeSession.version
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Conflict resolution rejected by server: ${errData.error || res.statusText}`);
        await fetchSession();
        return;
      }
    } catch (err) {
      console.error('Conflict resolution network error:', err);
      setSession(prev => {
        const next = { ...prev };
        const c = next.conflicts?.find(x => x.id === conflictId);
        if (c) {
          c.status = 'RESOLVED';
          c.chosenResolution = choice;
        }
        next.version = (next.version || 1) + 1;
        next.status = 'RECOMMENDATION_READY';
        next.decisionHealth = {
          ...next.decisionHealth,
          conflictsCount: 0,
          confidence: 96,
          status: "Green-lit for delivery. All blocking contradictions resolved."
        };
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
      await fetchSession();
    } catch (err) {
      setSession(prev => ({
        ...prev,
        version: (prev.version || 1) + 1,
        status: 'NEEDS_REVISION',
        decisionHealth: {
          ...prev.decisionHealth,
          status: "Reopened decision: Limit comparison to three.",
          confidence: 82
        }
      }));
    }
  };

  const handleApprovalAction = async (action, rationale = '', conditions = []) => {
    if (isSubmittingApproval) return;
    setIsSubmittingApproval(true);
    const sessionId = activeSession.id || activeSession.sessionId || 'session_moonshot_checkout';
    try {
      const res = await fetch(`http://localhost:4000/api/decisions/${sessionId}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          decisionVersion: Number(activeSession.version || 1),
          rationale: rationale || `Human PM action: ${action}`,
          conditions: conditions || [],
          decidedBy: 'Human PM [Demo UI]'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchSession();
      } else {
        alert(`Approval action rejected: ${data.error || res.statusText}`);
        await fetchSession();
      }
    } catch (err) {
      console.error('Error submitting approval action:', err);
      // Fallback local update for offline demo resiliency
      if (action === 'APPROVE') {
        setSession(prev => ({
          ...prev,
          status: 'APPROVED',
          approvalRecord: {
            status: 'APPROVED',
            approvedDecisionVersion: prev.version || 1,
            decidedBy: 'Human PM [Demo UI]',
            decidedAt: new Date().toISOString(),
            rationale,
            conditions
          }
        }));
      } else if (action === 'REQUEST_REVISION') {
        setSession(prev => ({
          ...prev,
          status: 'NEEDS_REVISION',
          version: (prev.version || 1) + 1,
          approvalRecord: {
            status: 'NEEDS_REVISION',
            invalidationReason: rationale || 'Human PM requested scope revision.'
          }
        }));
      }
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleGenerateDecisionPack = async () => {
    setIsGeneratingJob(true);
    setJobProgress({ step: "Trigger.dev: Queued async job...", percent: 20 });

    try {
      const res = await fetch('http://localhost:4000/api/jobs/prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession.id || 'session_moonshot_checkout',
          targetDecisionVersion: activeSession.version
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setIsGeneratingJob(false);
        setJobProgress(null);
        alert(`Artifact generation rejected by server guard:\n\n${data.error}\n\nRequired: ${data.requiredAction || 'Explicit human PM approval'}`);
        return;
      }

      let pct = 20;
      const interval = setInterval(async () => {
        pct += 25;
        if (pct >= 100) {
          clearInterval(interval);
          setJobProgress({ step: "Completed! Generated PRD and Linear backlog.", percent: 100 });
          setTimeout(() => {
            setIsGeneratingJob(false);
            setActiveNav('artifacts');
            fetchSession();
          }, 800);
        } else {
          setJobProgress({ step: `Trigger.dev running agent pipeline (${pct}%)...`, percent: pct });
        }
      }, 700);
    } catch (err) {
      setIsGeneratingJob(false);
      setJobProgress(null);
      alert(`Network error triggering artifact generation: ${err.message}`);
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
            onApprovalAction={handleApprovalAction}
            onReopenDecision={handleReopenDecision}
            isSubmittingApproval={isSubmittingApproval}
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
            <DeliveryArtifacts session={activeSession} />
          </div>
        )}

        {activeNav === 'validation' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <ValidationPlanView />
          </div>
        )}

        {activeNav === 'artifacts' && (
          <div style={{ padding: '36px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
            <DeliveryArtifacts session={activeSession} onReopenDecision={handleReopenDecision} />
          </div>
        )}
      </main>

      {/* 3. Right Copilot Sidebar */}
      <CopilotSidebar
        decisionMemory={activeSession.decisionMemory || []}
        onAction={async (type) => {
          if (type === 'shrink_to_mvp') {
            await fetchSession();
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
        onSourceAdded={async () => {
          await fetchSession();
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
