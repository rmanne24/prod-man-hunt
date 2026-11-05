import React from 'react';
import { FolderGit2, ArrowRight, Layers, FileText, CheckCircle2, AlertTriangle, ShieldCheck, Plus, Clock } from 'lucide-react';

export default function ProjectsView({
  decisions = [],
  session,
  onSelectDecision,
  onNewDecisionClick,
  activeWorkspace,
  isLoading = false
}) {
  const wsName = activeWorkspace?.name || 'Workspace';

  // If decisions list passed from server, use it. Otherwise fallback to current session if present
  const items = decisions.length > 0 ? decisions : (session ? [{
    id: session.id || session.sessionId,
    title: session.title,
    productArea: session.project || 'Core Product',
    version: session.version || 1,
    status: session.status || 'DRAFT',
    signalsCount: session.signals?.length || session.capturedSources?.length || 0,
    conflictsCount: session.conflicts?.filter(c => c.status === 'OPEN')?.length || 0,
    approvalStatus: session.approvalRecord?.status || 'PENDING',
    updatedAt: session.updatedAt || new Date().toISOString()
  }] : []);

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Workspace: {wsName}
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Decisions & Projects Directory
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Canonical decision records, evidence signals, and version-bound approval gates in this workspace.
          </p>
        </div>

        <button
          onClick={onNewDecisionClick}
          style={{
            padding: '9px 16px',
            borderRadius: '8px',
            background: '#0f172a',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
        >
          <Plus size={15} />
          <span>New Decision</span>
        </button>
      </div>

      {/* Empty State */}
      {items.length === 0 && !isLoading && (
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px dashed #cbd5e1',
          padding: '64px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#f1f5f9',
            color: '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <FileText size={24} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
            No Product Decisions Yet
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
            Establish your first canonical decision record to start capturing user signals, mapping contradictions, and preparing recommendations for human approval.
          </p>
          <button
            onClick={onNewDecisionClick}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#0f172a',
              border: 'none',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={16} />
            <span>Create Your First Decision</span>
          </button>
        </div>
      )}

      {/* Decisions Table */}
      {items.length > 0 && (
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          marginBottom: '24px'
        }}>
          <div style={{
            padding: '14px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'grid',
            gridTemplateColumns: '2fr 1.2fr 1fr 1fr auto',
            gap: '16px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            <div>Decision Record</div>
            <div>Stage & Version</div>
            <div>Signals Grounded</div>
            <div>Approval Status</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>

          {items.map((item) => {
            const isApproved = item.status === 'APPROVED' || item.approvalStatus === 'APPROVED';
            const hasConflicts = item.conflictsCount > 0;

            return (
              <div
                key={item.id}
                style={{
                  padding: '18px 24px',
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 1fr 1fr auto',
                  gap: '16px',
                  alignItems: 'center',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background 0.1s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: isApproved ? '#ecfdf5' : (hasConflicts ? '#fef2f2' : '#f1f5f9'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isApproved ? '#059669' : (hasConflicts ? '#dc2626' : '#0f172a'),
                      flexShrink: 0
                    }}>
                      <FolderGit2 size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        {item.productArea || 'Core Product'}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: isApproved ? '#ecfdf5' : (hasConflicts ? '#fef2f2' : '#f8fafc'),
                      color: isApproved ? '#065f46' : (hasConflicts ? '#991b1b' : '#334155'),
                      border: `1px solid ${isApproved ? '#a7f3d0' : (hasConflicts ? '#fecaca' : '#e2e8f0')}`
                    }}>
                      {item.status}
                    </span>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>
                      v{item.version}
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
                    <Layers size={14} color="#64748b" />
                    <span>{item.signalsCount} {item.signalsCount === 1 ? 'Signal' : 'Signals'}</span>
                  </div>
                  {hasConflicts && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#b91c1c', marginTop: '2px' }}>
                      <AlertTriangle size={12} />
                      <span>{item.conflictsCount} open conflict</span>
                    </div>
                  )}
                </div>

                <div>
                  {isApproved ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '12.5px', fontWeight: 600 }}>
                      <ShieldCheck size={16} />
                      <span>Approved</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12.5px', fontWeight: 500 }}>
                      <Clock size={15} color="#94a3b8" />
                      <span>{item.approvalStatus || 'Pending'}</span>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => onSelectDecision(item.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>Open</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
