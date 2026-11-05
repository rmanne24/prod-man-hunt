import React, { useState, useEffect, useCallback } from 'react';
import LeftSidebar from './components/LeftSidebar.jsx';
import EvidenceWorkspace from './components/EvidenceWorkspace.jsx';
import CopilotSidebar from './components/CopilotSidebar.jsx';
import DeliveryArtifacts from './components/DeliveryArtifacts.jsx';
import OverviewView from './components/OverviewView.jsx';
import ProjectsView from './components/ProjectsView.jsx';
import EvidenceView from './components/EvidenceView.jsx';
import IntegrationsView from './components/IntegrationsView.jsx';
import CaptureSourceModal from './components/CaptureSourceModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import OmniBar from './components/OmniBar.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { Loader2, Sparkles, LogOut } from 'lucide-react';

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

function PMPilotWorkspace() {
  const { user, token, isAuthenticated, isDemoMode, isLoading, logout, exitDemoMode } = useAuth();
  const [activeNav, setActiveNav] = useState('decisions');
  const [session, setSession] = useState(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGeneratingJob, setIsGeneratingJob] = useState(false);
  const [jobProgress, setJobProgress] = useState(null);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Derive authorization headers based on real authenticated session vs judge demo mode
  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (isDemoMode) {
      headers['X-PMPilot-Demo'] = 'true';
    }
    return headers;
  }, [token, isDemoMode]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4000/api/session', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          return;
        }
      }
    } catch (err) {
      // Resilient fallback for local demo
    }
    setSession(fallbackSession);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isAuthenticated || isDemoMode) {
      fetchSession();
    }
  }, [fetchSession, isAuthenticated, isDemoMode]);

  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="animate-spin" size={32} color="#0f172a" style={{ margin: '0 auto 12px auto' }} />
          <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            Verifying PMPilot session...
          </div>
        </div>
      </div>
    );
  }

  // Enforce authentication gate: User must be signed in or explicitly in Judge Demo mode
  if (!isAuthenticated && !isDemoMode) {
    return <AuthScreen />;
  }

  const activeSession = session || fallbackSession;

  const handleResolveConflict = async (conflictId, choice) => {
    try {
      const res = await fetch('http://localhost:4000/api/session/session_moonshot_checkout/action', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'resolve_conflict',
          payload: {
            conflictId,
            resolution: choice,
            expectedVersion: activeSession.version,
            decidedBy: user?.name || 'Human PM [Demo UI]'
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
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'reopen_decision',
          payload: { decidedBy: user?.name || 'Human PM [Demo UI]' }
        })
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
    const callerName = user?.name ? `${user.name} (${user.email})` : 'Human PM [Demo UI]';

    try {
      const res = await fetch(`http://localhost:4000/api/decisions/${sessionId}/approval`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action,
          decisionVersion: Number(activeSession.version || 1),
          rationale: rationale || `Human PM action: ${action}`,
          conditions: conditions || [],
          decidedBy: callerName
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
      if (action === 'APPROVE') {
        setSession(prev => ({
          ...prev,
          status: 'APPROVED',
          approvalRecord: {
            status: 'APPROVED',
            approvedDecisionVersion: prev.version || 1,
            decidedBy: callerName,
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
        headers: getAuthHeaders(),
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

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: '#f8fafc'
    }}>
      {/* 1. Left Sidebar Navigation */}
      <LeftSidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        sources={activeSession.capturedSources || []}
        decisionCount={1}
        onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Main Workspace Layout */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}>
        {/* Global Top App Bar */}
        <header style={{
          height: '52px',
          minHeight: '52px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          zIndex: 20
        }}>
          {/* Breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Moonshot Studio</span>
            <span>/</span>
            <span style={{ fontWeight: 500, color: '#334155' }}>AI CHECKOUT [SYNTHETIC DEMO]</span>
            <span>/</span>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#f1f5f9',
              color: '#334155'
            }}>
              Decision Engine v{activeSession.version || 1}
            </span>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setIsCopilotOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: isCopilotOpen ? '#0f172a' : '#ffffff',
                color: isCopilotOpen ? '#ffffff' : '#334155',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Sparkles size={13} color={isCopilotOpen ? '#ffffff' : '#0f172a'} />
              <span>{isCopilotOpen ? 'Hide Copilot' : 'Associate PM'}</span>
            </button>

            {/* Account / Session Identity Pill */}
            {isAuthenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '11.5px',
                  fontWeight: 600
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                  <span>{user.name}</span>
                </div>
                <button
                  onClick={logout}
                  title="Sign out of account"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <LogOut size={12} />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: '#f8fafc',
                  color: '#64748b',
                  border: '1px solid #e2e8f0'
                }}>
                  UNVERIFIED_DEMO_CLIENT [Judge Demo]
                </span>
                <button
                  onClick={exitDemoMode}
                  title="Switch to authenticated user account"
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: '#0f172a',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Viewport & Copilot Drawer */}
        <div style={{
          flex: 1,
          display: 'flex',
          height: 'calc(100% - 52px)',
          overflow: 'hidden'
        }}>
          <main style={{
            flex: 1,
            height: '100%',
            overflowY: 'auto'
          }}>
            {activeNav === 'overview' && (
              <OverviewView
                session={activeSession}
                onNavigateToDecision={(dest) => setActiveNav(dest)}
              />
            )}

            {activeNav === 'projects' && (
              <ProjectsView
                session={activeSession}
                onNavigateToDecision={(dest) => setActiveNav(dest)}
              />
            )}

            {activeNav === 'decisions' && (
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

            {activeNav === 'evidence' && (
              <EvidenceView
                session={activeSession}
                onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
                onNavigateToDecision={(dest) => setActiveNav(dest)}
              />
            )}

            {activeNav === 'integrations' && (
              <IntegrationsView />
            )}

            {activeNav === 'artifacts' && (
              <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
                <DeliveryArtifacts
                  session={activeSession}
                  onReopenDecision={handleReopenDecision}
                />
              </div>
            )}
          </main>

          {/* Toggleable Copilot Drawer */}
          {isCopilotOpen && (
            <CopilotSidebar
              decisionMemory={activeSession.decisionMemory || []}
              onAction={async (type) => {
                if (type === 'shrink_to_mvp') {
                  await fetchSession();
                }
              }}
              onReopenDecision={handleReopenDecision}
              onClose={() => setIsCopilotOpen(false)}
            />
          )}
        </div>
      </div>

      {/* 3. Floating OmniBar */}
      <OmniBar
        onPromptSubmit={(query) => {
          if (query.toLowerCase().includes("prd") || query.toLowerCase().includes("generate")) {
            handleGenerateDecisionPack();
          } else {
            alert(`Context prompt submitted: "${query}". Evaluation pinned to active decision.`);
          }
        }}
      />

      {/* 4. Modals */}
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
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            width: '420px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#ecfdf5',
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <Loader2 size={22} className="animate-spin" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Trigger.dev Async Pipeline
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              {jobProgress?.step || "Processing multimodal PM context..."}
            </p>

            <div style={{
              width: '100%',
              height: '6px',
              background: '#f1f5f9',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${jobProgress?.percent || 20}%`,
                height: '100%',
                background: '#0f172a',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PMPilotWorkspace />
    </AuthProvider>
  );
}
