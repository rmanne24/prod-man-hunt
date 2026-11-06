import React, { useState, useEffect, useCallback } from 'react';
import LeftSidebar from './components/LeftSidebar.jsx';
import EvidenceWorkspace from './components/EvidenceWorkspace.jsx';
import CopilotSidebar from './components/CopilotSidebar.jsx';
import DeliveryArtifacts from './components/DeliveryArtifacts.jsx';
import OverviewView from './components/OverviewView.jsx';
import ProjectsView from './components/ProjectsView.jsx';
import EvidenceView from './components/EvidenceView.jsx';
import IntegrationsView from './components/IntegrationsView.jsx';
import SwitchCollaborationView from './components/SwitchCollaborationView.jsx';
import CaptureSourceModal from './components/CaptureSourceModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import OmniBar from './components/OmniBar.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import NewDecisionModal from './components/NewDecisionModal.jsx';
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
  const { user, token, isAuthenticated, isDemoMode, isLoading, activeWorkspace, logout, exitDemoMode } = useAuth();
  const [activeNav, setActiveNav] = useState('overview');
  const [session, setSession] = useState(null);
  const [workspaceDecisions, setWorkspaceDecisions] = useState([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState(null);
  const [isLoadingDecisions, setIsLoadingDecisions] = useState(false);
  const [isNewDecisionModalOpen, setIsNewDecisionModalOpen] = useState(false);
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
    if (activeWorkspace?.id) {
      headers['X-Workspace-Id'] = activeWorkspace.id;
    }
    return headers;
  }, [token, isDemoMode, activeWorkspace?.id]);

  // Load decisions list for current active workspace
  const fetchWorkspaceDecisions = useCallback(async () => {
    if (isDemoMode) {
      setWorkspaceDecisions([{
        id: 'session_moonshot_checkout',
        title: 'One-Click Guest Checkout & Cart Recovery',
        productArea: 'Core E-commerce',
        version: 1,
        status: 'CONFLICT_REVIEW',
        signalsCount: 3,
        conflictsCount: 1,
        approvalStatus: 'PENDING'
      }]);
      return;
    }

    if (!activeWorkspace?.id || !token) return;

    setIsLoadingDecisions(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${activeWorkspace.id}/decisions`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.decisions) {
          setWorkspaceDecisions(data.decisions);
          return data.decisions;
        }
      }
    } catch (err) {
      console.warn('Could not load workspace decisions:', err.message);
    } finally {
      setIsLoadingDecisions(false);
    }
    return [];
  }, [activeWorkspace?.id, token, isDemoMode, getAuthHeaders]);

  // Fetch full details of target decision
  const fetchDecisionDetail = useCallback(async (targetId) => {
    if (!targetId) {
      setSession(null);
      return;
    }
    try {
      const res = await fetch(`http://localhost:4000/api/decisions/${targetId}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.decision) {
          setSession(data.decision);
          return;
        }
      }
    } catch (err) {
      console.warn('Error fetching decision detail:', err.message);
    }

    if (isDemoMode) {
      setSession(fallbackSession);
    }
  }, [getAuthHeaders, isDemoMode]);

  // Sync workspace and decisions on activeWorkspace / auth changes
  useEffect(() => {
    if (!isAuthenticated && !isDemoMode) return;

    if (isDemoMode) {
      fetchDecisionDetail('session_moonshot_checkout');
      return;
    }

    if (activeWorkspace?.id) {
      fetchWorkspaceDecisions().then((decs) => {
        if (decs && decs.length > 0) {
          setSelectedDecisionId((prevId) => {
            const nextId = prevId && decs.some(d => d.id === prevId) ? prevId : decs[0].id;
            fetchDecisionDetail(nextId);
            return nextId;
          });
        } else {
          setSelectedDecisionId(null);
          setSession(null);
        }
      });
    }
  }, [isAuthenticated, isDemoMode, activeWorkspace?.id, fetchWorkspaceDecisions, fetchDecisionDetail]);

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

  const handleSelectDecision = (decisionId) => {
    setSelectedDecisionId(decisionId);
    fetchDecisionDetail(decisionId);
    setActiveNav('decisions');
  };

  const handleResolveConflict = async (conflictId, choice) => {
    const targetDecisionId = session?.id || 'session_moonshot_checkout';
    try {
      const res = await fetch(`http://localhost:4000/api/decisions/${targetDecisionId}/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          resolutionChoiceId: choice,
          resolutionNotes: `Standardized to ${choice}`,
          expectedVersion: session?.version,
          decidedBy: user?.name ? `${user.name} (${user.email})` : 'Human PM [Demo UI]'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.decision) {
          setSession(data.decision);
          fetchWorkspaceDecisions();
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Conflict resolution rejected by server: ${errData.error || res.statusText}`);
        await fetchDecisionDetail(targetDecisionId);
        return;
      }
    } catch (err) {
      console.error('Conflict resolution network error:', err);
    }
  };

  const handleReopenDecision = async () => {
    const targetDecisionId = session?.id || 'session_moonshot_checkout';
    try {
      await fetch(`http://localhost:4000/api/session/${targetDecisionId}/action`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'reopen_decision',
          payload: { decidedBy: user?.name ? `${user.name} (${user.email})` : 'Human PM [Demo UI]' }
        })
      });
      await fetchDecisionDetail(targetDecisionId);
      fetchWorkspaceDecisions();
    } catch (err) {
      console.error('Error reopening decision:', err);
    }
  };

  const handleApprovalAction = async (action, rationale = '', conditions = []) => {
    if (isSubmittingApproval) return;
    setIsSubmittingApproval(true);
    const targetDecisionId = session?.id || 'session_moonshot_checkout';
    const callerName = user?.name ? `${user.name} (${user.email})` : 'Human PM [Demo UI]';

    try {
      const res = await fetch(`http://localhost:4000/api/decisions/${targetDecisionId}/approval`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action,
          decisionVersion: Number(session?.version || 1),
          rationale: rationale || `Human PM action: ${action}`,
          conditions: conditions || [],
          decidedBy: callerName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchDecisionDetail(targetDecisionId);
        fetchWorkspaceDecisions();
      } else {
        alert(`Approval action rejected: ${data.error || res.statusText}`);
        await fetchDecisionDetail(targetDecisionId);
      }
    } catch (err) {
      console.error('Error submitting approval action:', err);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleGenerateDecisionPack = async () => {
    const targetDecisionId = session?.id || 'session_moonshot_checkout';
    setIsGeneratingJob(true);
    setJobProgress({ step: "Trigger.dev: Queued async job...", percent: 20 });

    try {
      const res = await fetch('http://localhost:4000/api/jobs/prd', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sessionId: targetDecisionId,
          targetDecisionVersion: session?.version || 1
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
            fetchDecisionDetail(targetDecisionId);
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

  const currentWsName = activeWorkspace?.name || (isDemoMode ? 'Moonshot Commerce [DEMO]' : 'Workspace');

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
        sources={session?.signals || session?.capturedSources || []}
        decisionCount={workspaceDecisions.length}
        onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewDecisionClick={() => setIsNewDecisionModalOpen(true)}
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
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{currentWsName}</span>
            <span>/</span>
            <span style={{ fontWeight: 500, color: '#334155' }}>
              {session?.title || (workspaceDecisions.length === 0 ? 'Getting Started' : 'Decisions Directory')}
            </span>
            {session && (
              <>
                <span>/</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: '#f1f5f9',
                  color: '#334155'
                }}>
                  v{session.version || 1}
                </span>
              </>
            )}
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
                  <span>{user?.name || user?.email || 'PM User'}</span>
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
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a'
                }}>
                  DEMO EVALUATION MODE
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
                session={session}
                onNavigateToDecision={(dest) => setActiveNav(dest)}
                onNewDecisionClick={() => setIsNewDecisionModalOpen(true)}
                activeWorkspace={activeWorkspace}
              />
            )}

            {activeNav === 'projects' && (
              <ProjectsView
                decisions={workspaceDecisions}
                session={session}
                onSelectDecision={handleSelectDecision}
                onNewDecisionClick={() => setIsNewDecisionModalOpen(true)}
                activeWorkspace={activeWorkspace}
                isLoading={isLoadingDecisions}
              />
            )}

            {activeNav === 'decisions' && (
              <EvidenceWorkspace
                session={session}
                onResolveConflict={handleResolveConflict}
                onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
                onGenerateDecisionPack={handleGenerateDecisionPack}
                onApprovalAction={handleApprovalAction}
                onReopenDecision={handleReopenDecision}
                isSubmittingApproval={isSubmittingApproval}
                onNewDecisionClick={() => setIsNewDecisionModalOpen(true)}
              />
            )}

            {activeNav === 'evidence' && (
              <EvidenceView
                session={session}
                onCaptureSourceClick={() => setIsCaptureModalOpen(true)}
                onNavigateToDecision={(dest) => setActiveNav(dest)}
              />
            )}

            {activeNav === 'integrations' && (
              <IntegrationsView onNavigateTo={(dest) => setActiveNav(dest)} />
            )}

            {activeNav === 'switch' && (
              <SwitchCollaborationView
                session={session || (isDemoMode ? fallbackSession : null)}
                onRefreshSession={() => selectedDecisionId && fetchDecisionDetail(selectedDecisionId)}
                onNavigateTo={(dest) => setActiveNav(dest)}
              />
            )}

            {activeNav === 'artifacts' && (
              <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
                <DeliveryArtifacts
                  session={session}
                  onReopenDecision={handleReopenDecision}
                />
              </div>
            )}
          </main>

          {/* Toggleable Copilot Drawer */}
          {isCopilotOpen && (
            <CopilotSidebar
              decisionMemory={session?.decisionMemory || []}
              onAction={async (type) => {
                if (type === 'shrink_to_mvp') {
                  if (selectedDecisionId) await fetchDecisionDetail(selectedDecisionId);
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
        decisionId={session?.id || 'session_moonshot_checkout'}
        getAuthHeaders={getAuthHeaders}
        onSourceAdded={async () => {
          if (session?.id) await fetchDecisionDetail(session.id);
          fetchWorkspaceDecisions();
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <NewDecisionModal
        isOpen={isNewDecisionModalOpen}
        onClose={() => setIsNewDecisionModalOpen(false)}
        workspaceId={activeWorkspace?.id || 'ws_moonshot'}
        getAuthHeaders={getAuthHeaders}
        onCreated={(newDecision) => {
          setWorkspaceDecisions(prev => [newDecision, ...prev]);
          setSelectedDecisionId(newDecision.id);
          setSession(newDecision);
          setActiveNav('decisions');
        }}
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
