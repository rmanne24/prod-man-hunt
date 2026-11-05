import React from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  Layers, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  Activity, 
  GitCommit, 
  Lock,
  ExternalLink
} from 'lucide-react';

export default function OverviewView({ session, onNavigateToDecision }) {
  const {
    title = "[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery",
    version = 1,
    status = "CONFLICT_REVIEW",
    decisionHealth = {},
    conflicts = [],
    capturedSources = [],
    approvalRecord = {}
  } = session || {};

  const openConflicts = conflicts.filter(c => c.status === 'OPEN').length;
  const isApproved = status === 'APPROVED' || approvalRecord?.status === 'APPROVED';

  const pipelineStages = [
    { name: '1. Ingestion', status: 'COMPLETED', label: `${capturedSources.length || 3} Sources Evaluated` },
    { name: '2. Contradictions', status: openConflicts > 0 ? 'ACTIVE' : 'COMPLETED', label: openConflicts > 0 ? '1 Blocking Conflict' : 'Resolved' },
    { name: '3. Recommendation', status: openConflicts > 0 ? 'WAITING' : 'COMPLETED', label: 'Trade-off Formulated' },
    { name: '4. Human Approval', status: isApproved ? 'COMPLETED' : 'PENDING', label: isApproved ? `Approved v${version}` : `Gate v${version} Pending` },
    { name: '5. Release & PRD', status: isApproved ? 'READY' : 'LOCKED', label: isApproved ? 'Linear Sync Ready' : 'Server-Guarded' },
  ];

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Portfolio Dashboard · Moonshot Studio
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Decision Health & Pipeline Overview
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Executive tracking of evidence-grounded product decisions, unresolved contradictions, and human approval gates.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '9999px',
            background: '#f1f5f9',
            color: '#475569',
            border: '1px solid #e2e8f0'
          }}>
            Workspace: Moonshot Studio [DEMO]
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '9999px',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0'
          }}>
            Engine: Deterministic State Machine Active
          </span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Active Decisions</span>
            <Layers size={18} color="#64748b" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>1</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
            1 decision under active review
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Health Confidence</span>
            <Activity size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#059669', lineHeight: 1 }}>
            {decisionHealth.confidence || 88}%
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
            Grounded in verbatim signals
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Open Contradictions</span>
            {openConflicts > 0 ? <AlertCircle size={18} color="#d97706" /> : <CheckCircle2 size={18} color="#059669" />}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: openConflicts > 0 ? '#b45309' : '#059669', lineHeight: 1 }}>
            {openConflicts}
          </div>
          <div style={{ fontSize: '12px', color: openConflicts > 0 ? '#b45309' : '#64748b', marginTop: '8px' }}>
            {openConflicts > 0 ? '1 blocking conflict unresolved' : 'All contradictions resolved'}
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Approval Gate</span>
            {isApproved ? <ShieldCheck size={18} color="#059669" /> : <Lock size={18} color="#64748b" />}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: isApproved ? '#059669' : '#0f172a', lineHeight: 1.4 }}>
            {isApproved ? 'Approved' : 'Awaiting PM'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Version bound (v{version})
          </div>
        </div>
      </div>

      {/* Decision Pipeline Progress */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        marginBottom: '28px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>
          Decision Pipeline Lifecycle Stage
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          {pipelineStages.map((stage, i) => {
            const isDone = stage.status === 'COMPLETED';
            const isActive = stage.status === 'ACTIVE' || stage.status === 'PENDING';
            const isReady = stage.status === 'READY';
            return (
              <div key={i} style={{
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isDone ? '#bbf7d0' : isActive ? '#fed7aa' : isReady ? '#bae6fd' : '#e2e8f0',
                background: isDone ? '#f0fdf4' : isActive ? '#fff7ed' : isReady ? '#f0f9ff' : '#f8fafc'
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isDone ? '#166534' : isActive ? '#c2410c' : isReady ? '#0369a1' : '#64748b',
                  marginBottom: '4px',
                  textTransform: 'uppercase'
                }}>
                  {stage.name}
                </div>
                <div style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: isDone ? '#15803d' : isActive ? '#9a3412' : isReady ? '#0284c7' : '#475569'
                }}>
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Decision Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        marginBottom: '28px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: isApproved ? '#ecfdf5' : '#fffbeb',
                color: isApproved ? '#047857' : '#b45309',
                border: `1px solid ${isApproved ? '#a7f3d0' : '#fde68a'}`
              }}>
                {status.replace(/_/g, ' ')}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '2px 8px',
                borderRadius: '6px'
              }}>
                Version {version}
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
              {title}
            </h3>
            <p style={{ fontSize: '13.5px', color: '#475569', margin: 0, maxWidth: '800px', lineHeight: 1.5 }}>
              Resolve drop-off at login by introducing a 1-click guest checkout with stateful recovery tokens, while balancing mobile viewport product comparison constraints.
            </p>
          </div>

          <button
            onClick={() => onNavigateToDecision && onNavigateToDecision('decisions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <span>Open Decision Detail</span>
            <ArrowRight size={15} />
          </button>
        </div>

        {/* Breakdown bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #f1f5f9',
          marginTop: '16px'
        }}>
          <div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Primary Trade-off:</span>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
              3 vs 5 Product Comparison Tray
            </div>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Evidence Integrity:</span>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
              3 Verbatim Signals Grounded
            </div>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Downstream Sync:</span>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
              Linear (ENG-142) & Slack Ready
            </div>
          </div>
        </div>
      </div>

      {/* Synthetic Demo Disclaimer */}
      <div style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        fontSize: '12px',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <strong>Synthetic Demo Context:</strong> All customer metrics, Linear IDs, and Figma frame references are synthetic fixtures for demonstration purposes.
        </div>
        <div style={{ fontWeight: 600, color: '#475569' }}>
          Identity: UNVERIFIED_DEMO_CLIENT
        </div>
      </div>
    </div>
  );
}

