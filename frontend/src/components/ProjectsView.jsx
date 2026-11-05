import React from 'react';
import { FolderGit2, ArrowRight, Layers, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ProjectsView({ session, onNavigateToDecision }) {
  const {
    project = "AI CHECKOUT [SYNTHETIC DEMO]",
    title = "[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery",
    version = 1,
    status = "CONFLICT_REVIEW",
    conflicts = [],
    capturedSources = [],
    approvalRecord = {}
  } = session || {};

  const openConflicts = conflicts.filter(c => c.status === 'OPEN').length;
  const isApproved = status === 'APPROVED' || approvalRecord?.status === 'APPROVED';

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Workspace: Moonshot Studio [DEMO]
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Projects Directory
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Managed product workstreams with pinned evidence signals, decision records, and delivery specs.
          </p>
        </div>

        <button
          onClick={() => alert("Demo Mode: Project creation is locked to the synthetic checkout workstream.")}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#475569',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + New Project (Demo Locked)
        </button>
      </div>

      {/* Projects Table / Card List */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        marginBottom: '24px'
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr 1fr auto',
          gap: '16px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          <div>Project Name</div>
          <div>Active Decision</div>
          <div>Signals Grounded</div>
          <div>Health Status</div>
          <div style={{ textAlign: 'right' }}>Action</div>
        </div>

        {/* Project Row */}
        <div style={{
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr 1fr auto',
          gap: '16px',
          alignItems: 'center',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0f172a'
              }}>
                <FolderGit2 size={16} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  {project}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Moonshot Studio · Core E-commerce
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              {title}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Version {version} · {isApproved ? 'Approved by PM' : 'Awaiting Approval'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              {capturedSources.length || 3} Sources
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Figma, Linear, Notion
            </div>
          </div>

          <div>
            {openConflicts > 0 ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#b45309',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '3px 8px',
                borderRadius: '6px'
              }}>
                <AlertTriangle size={12} />
                Conflict Review
              </span>
            ) : isApproved ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#047857',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                padding: '3px 8px',
                borderRadius: '6px'
              }}>
                <ShieldCheck size={12} />
                Approved
              </span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#0369a1',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                padding: '3px 8px',
                borderRadius: '6px'
              }}>
                <CheckCircle2 size={12} />
                Ready for Review
              </span>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <button
              onClick={() => onNavigateToDecision && onNavigateToDecision('decisions')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>View Decisions</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div style={{
        padding: '16px 20px',
        borderRadius: '8px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        fontSize: '13px',
        color: '#475569',
        lineHeight: 1.5
      }}>
        <strong>Workspace Architecture:</strong> Each project acts as an isolated evidence namespace. Decisions created inside a project inherit captured customer signals, contradiction detections, and version-locked delivery PRDs.
      </div>
    </div>
  );
}

