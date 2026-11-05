import React, { useState } from 'react';
import DecisionHealthHero from './DecisionHealthHero.jsx';
import EvidenceGraph from './EvidenceGraph.jsx';
import ContradictionGate from './ContradictionGate.jsx';
import FeatureMatrix from './FeatureMatrix.jsx';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Lock,
  AlertTriangle,
  FileText,
  Layers,
  Scale,
  Plus,
  RefreshCw,
  Clock
} from 'lucide-react';

export default function EvidenceWorkspace({
  session,
  onResolveConflict,
  onCaptureSourceClick,
  onGenerateDecisionPack,
  onApprovalAction,
  onReopenDecision,
  isSubmittingApproval = false,
  onNewDecisionClick
}) {
  const [activeTab, setActiveTab] = useState('evidence');

  if (!session) {
    return (
      <div style={{
        flex: 1,
        padding: '80px 32px',
        maxWidth: '720px',
        margin: '0 auto',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: '#f1f5f9',
          color: '#64748b',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px'
        }}>
          <FileText size={28} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
          No Active Decision Selected
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          Create a new product decision record or select one from the directory to examine evidence, resolve contradictions, and request human approval.
        </p>
        {onNewDecisionClick && (
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
            <span>Create New Decision</span>
          </button>
        )}
      </div>
    );
  }

  const {
    id = 'dec_active',
    title = 'Untitled Product Decision',
    status = 'DRAFT',
    version = 1,
    problemStatement = {},
    candidateOptions = [],
    approvalRecord,
    decisionHealth,
    evidenceGraph = [],
    conflicts = [],
    featureMatrix = [],
    decisionMemory = [],
    activityLog = []
  } = session;

  const isApproved = (status === 'APPROVED' || status === 'ARTIFACT_GENERATED') && approvalRecord?.status === 'APPROVED';
  const hasBlockingConflicts = conflicts.some(c => c.status === 'OPEN' && c.severity === 'BLOCKING');
  const isRevisionRequired = status === 'NEEDS_REVISION';

  return (
    <div style={{
      flex: 1,
      padding: '24px 32px 60px 32px',
      overflowY: 'auto',
      maxWidth: '1200px',
      margin: '0 auto',
      width: '100%'
    }}>
      {/* Breadcrumb & Top Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#64748b',
          fontWeight: 500
        }}>
          <span>Projects</span>
          <span>/</span>
          <span style={{ color: '#0f172a', fontWeight: 600 }}>AI CHECKOUT [SYNTHETIC DEMO]</span>
          <span>/</span>
          <span style={{ color: '#0f172a' }}>Decisions</span>
          <span>/</span>
          <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{id}</span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onCaptureSourceClick}
            className="btn-base btn-secondary"
            title="Capture new source signal"
          >
            <Plus size={14} />
            <span>Capture source</span>
          </button>

          <button
            onClick={isApproved ? onGenerateDecisionPack : undefined}
            disabled={!isApproved}
            title={!isApproved ? `Locked: Awaiting human PM approval on version ${version} before generating delivery artifacts.` : "Generate complete PRD & Linear tickets"}
            className={`btn-base ${isApproved ? 'btn-primary' : 'btn-disabled'}`}
            style={{
              background: isApproved ? '#0f172a' : '#e2e8f0',
              color: isApproved ? '#ffffff' : '#94a3b8',
              cursor: isApproved ? 'pointer' : 'not-allowed'
            }}
          >
            {!isApproved && <Lock size={13} />}
            <span>{isApproved ? 'Generate decision pack' : 'Artifacts Locked (Unapproved)'}</span>
            {isApproved && <ArrowRight size={14} />}
          </button>
        </div>
      </div>

      {/* Decision Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '4px',
            background: isApproved ? '#ecfdf5' : hasBlockingConflicts ? '#fef2f2' : isRevisionRequired ? '#faf5ff' : '#fffbeb',
            color: isApproved ? '#065f46' : hasBlockingConflicts ? '#991b1b' : isRevisionRequired ? '#6b21a8' : '#92400e',
            border: `1px solid ${isApproved ? '#a7f3d0' : hasBlockingConflicts ? '#fecaca' : isRevisionRequired ? '#e9d5ff' : '#fde68a'}`,
            letterSpacing: '0.3px',
            textTransform: 'uppercase'
          }}>
            {isApproved ? `Approved (v${version})` : hasBlockingConflicts ? `Blocked (v${version})` : isRevisionRequired ? `Revision Req (v${version})` : `In Review (v${version})`}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
            Session ID: {id} · Synthetic Demo Scenario
          </span>
        </div>

        <h1 style={{
          fontSize: '24px',
          fontWeight: 800,
          color: '#0f172a',
          letterSpacing: '-0.5px',
          lineHeight: '1.25',
          marginBottom: '6px'
        }}>
          {title}
        </h1>

        <p style={{
          fontSize: '13.5px',
          color: '#475569',
          lineHeight: '1.5'
        }}>
          {problemStatement?.underlyingProblem || 'Evidence-backed decision grounding recommendations in verified customer signals and transparent trade-offs.'}
        </p>
      </div>

      {/* Decision Health Card */}
      <DecisionHealthHero
        health={decisionHealth}
        status={status}
        version={version}
        approvalRecord={approvalRecord}
      />

      {/* Human Approval Gate Card */}
      <div style={{
        background: isApproved ? '#f0fdf4' : isRevisionRequired ? '#faf5ff' : '#fffbeb',
        border: `1px solid ${isApproved ? '#bbf7d0' : isRevisionRequired ? '#e9d5ff' : '#fde68a'}`,
        borderRadius: '10px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ maxWidth: '720px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13.5px',
            fontWeight: 700,
            color: isApproved ? '#166534' : isRevisionRequired ? '#6b21a8' : '#92400e'
          }}>
            {isApproved ? <ShieldCheck size={16} /> : isRevisionRequired ? <AlertTriangle size={16} /> : <Lock size={16} />}
            <span>
              {isApproved
                ? `Decision Approved (v${approvalRecord?.approvedDecisionVersion || version})`
                : isRevisionRequired
                ? `Re-approval Required (v${version})`
                : hasBlockingConflicts
                ? `Contradiction Gate Pending (v${version})`
                : `Awaiting Human PM Approval (v${version})`}
            </span>
          </div>

          <p style={{
            fontSize: '12.5px',
            color: isApproved ? '#15803d' : isRevisionRequired ? '#6b21a8' : '#78350f',
            marginTop: '4px',
            lineHeight: '1.4'
          }}>
            {isApproved
              ? `Green-lit by ${approvalRecord?.decidedBy || 'Human PM [Demo UI]'} at ${approvalRecord?.decidedAt ? new Date(approvalRecord.decidedAt).toLocaleTimeString() : 'Recent'}. Delivery generation is unlocked. [Notice: Demo environment identity]`
              : isRevisionRequired
              ? (approvalRecord?.invalidationReason || `Scope was modified to version ${version} after prior approval. Re-approval required before artifact generation.`)
              : hasBlockingConflicts
              ? '1 blocking contradiction remains open. Resolve the contradiction below to unlock decision approval.'
              : 'Recommendation formulated. Explicit human PM approval is required before delivery artifacts can be generated.'}
          </p>

          {isApproved && approvalRecord?.conditions?.length > 0 && (
            <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '6px' }}>
              <strong>Approval Conditions:</strong> {approvalRecord.conditions.join(', ')}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isApproved && !hasBlockingConflicts && (
            <>
              <button
                onClick={() => onApprovalAction && onApprovalAction('APPROVE', 'Verified for 2-week MVP.')}
                disabled={isSubmittingApproval}
                style={{
                  background: isSubmittingApproval ? '#64748b' : '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isSubmittingApproval ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckCircle2 size={14} />
                <span>{isSubmittingApproval ? 'Submitting...' : 'Approve Decision'}</span>
              </button>

              <button
                onClick={() => onApprovalAction && onApprovalAction('REQUEST_REVISION', 'Scope revision requested.')}
                disabled={isSubmittingApproval}
                style={{
                  background: 'transparent',
                  color: '#92400e',
                  border: '1px solid #d97706',
                  borderRadius: '6px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isSubmittingApproval ? 'not-allowed' : 'pointer'
                }}
              >
                Request Revision
              </button>
            </>
          )}

          {isApproved && (
            <button
              onClick={() => {
                if (onReopenDecision) {
                  onReopenDecision();
                } else if (onApprovalAction) {
                  onApprovalAction('REQUEST_REVISION', 'Reopening decision for revision.');
                }
              }}
              disabled={isSubmittingApproval}
              style={{
                background: 'transparent',
                color: '#166534',
                border: '1px solid #86efac',
                borderRadius: '6px',
                padding: '7px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isSubmittingApproval ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={13} />
              <span>{isSubmittingApproval ? 'Submitting...' : 'Reopen Decision for Revision'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Sub-Navigation Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '20px',
        gap: '24px'
      }}>
        {[
          { id: 'evidence', label: 'Evidence & Provenance', icon: Layers, badge: evidenceGraph.length },
          { id: 'conflicts', label: 'Conflicts & Assumptions', icon: AlertTriangle, badge: conflicts.filter(c => c.status === 'OPEN').length },
          { id: 'options', label: 'Problem & Candidate Options', icon: Scale, badge: candidateOptions.length },
          { id: 'matrix', label: 'Competitive Benchmarks', icon: FileText, badge: featureMatrix.length },
          { id: 'memory', label: 'Decision Audit Memory', icon: Clock, badge: activityLog.length || decisionMemory.length }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid #0f172a' : '2px solid transparent',
                padding: '10px 2px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'all 0.12s ease'
              }}
            >
              <Icon size={14} color={isActive ? '#0f172a' : '#94a3b8'} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  background: isActive ? '#0f172a' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#64748b',
                  padding: '1px 5px',
                  borderRadius: '4px'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Evidence & Provenance (Default Walkthrough View) */}
      {activeTab === 'evidence' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <EvidenceGraph nodes={evidenceGraph} />
          
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Active Contradiction Review
            </div>
            <ContradictionGate
              conflicts={conflicts}
              onResolveConflict={onResolveConflict}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Conflicts & Assumptions Dedicated View */}
      {activeTab === 'conflicts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <ContradictionGate
            conflicts={conflicts}
            onResolveConflict={onResolveConflict}
          />

          {/* Assumptions Table */}
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              Unverified Working Assumptions
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
              Assumed claims carry technical or operational uncertainty. Must be validated before production deployment.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {evidenceGraph.filter(e => e.epistemicType === 'ASSUMED').map(node => (
                <div key={node.id} style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{node.label}</div>
                    <span style={{ fontSize: '10px', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      ASSUMED · {node.confidenceRating}% CONFIDENCE
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>{node.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Problem & Candidate Options */}
      {activeTab === 'options' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Problem Statement Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '22px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
              Problem Formulation & Customer Need
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Surface Request</div>
                <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 500 }}>{problemStatement?.surfaceRequest || 'N/A'}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Underlying Customer Problem</div>
                <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 500 }}>{problemStatement?.underlyingProblem || 'N/A'}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Target Persona</div>
                <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 500 }}>{problemStatement?.targetPersona || 'N/A'}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Estimated Business Impact</div>
                <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: 500 }}>{problemStatement?.businessImpact || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Candidate Options Comparison */}
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '22px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
              Evaluated Candidate Options
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {candidateOptions.map(opt => (
                <div key={opt.id} style={{
                  border: opt.id === 'opt_guest_3item' ? '2px solid #0f172a' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  background: opt.id === 'opt_guest_3item' ? '#f8fafc' : '#ffffff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{opt.title}</div>
                    <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {opt.estimatedStoryPoints} SP
                    </span>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', marginBottom: '4px' }}>Pros</div>
                    {opt.pros?.map((p, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#334155', marginLeft: '6px' }}>• {p}</div>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Cons / Trade-offs</div>
                    {opt.cons?.map((c, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>• {c}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Competitive Benchmarks */}
      {activeTab === 'matrix' && (
        <FeatureMatrix featureMatrix={featureMatrix} />
      )}

      {/* Tab 5: Decision Audit Memory */}
      {activeTab === 'memory' && (
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '22px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
            Decision Memory & Audit Trail
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
            Immutable record of resolved contradictions, scope cuts, version transitions, and human approvals.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {decisionMemory.map(mem => (
              <div key={mem.id} style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px',
                background: '#f8fafc'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{mem.title}</div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{mem.date}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: '1.4' }}>{mem.summary}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Author: {mem.author}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
