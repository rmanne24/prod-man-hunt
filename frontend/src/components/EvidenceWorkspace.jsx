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
  AlertTriangle
} from 'lucide-react';

export default function EvidenceWorkspace({
  session,
  onResolveConflict,
  onCaptureSourceClick,
  onGenerateDecisionPack,
  onApprovalAction,
  onReopenDecision,
  isSubmittingApproval = false
}) {
  const [activeSubTab, setActiveSubTab] = useState('graph');

  const {
    status = 'CONFLICT_REVIEW',
    version = 1,
    approvalRecord,
    decisionHealth,
    evidenceGraph = [],
    conflicts = [],
    featureMatrix = []
  } = session || {};

  const isApproved = (status === 'APPROVED' || status === 'ARTIFACT_GENERATED') && approvalRecord?.status === 'APPROVED';
  const hasBlockingConflicts = conflicts.some(c => c.status === 'OPEN' && c.severity === 'BLOCKING');
  const isRevisionRequired = status === 'NEEDS_REVISION';

  return (
    <div style={{
      flex: 1,
      padding: '24px 36px 80px 36px',
      overflowY: 'auto',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Top Header & Breadcrumb */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px'
      }}>
        <div style={{
          fontSize: '11.5px',
          fontWeight: 800,
          letterSpacing: '0.8px',
          color: '#657a6e',
          textTransform: 'uppercase'
        }}>
          PROJECTS &nbsp;/&nbsp; <span style={{ color: '#131916' }}>AI CHECKOUT</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCaptureSourceClick}
            style={{
              background: '#ffffff',
              color: '#131916',
              border: '1px solid #d8ded8',
              borderRadius: '9999px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            Capture source
          </button>

          <button
            onClick={isApproved ? onGenerateDecisionPack : undefined}
            disabled={!isApproved}
            title={!isApproved ? `Locked: Awaiting human PM approval on version ${version} before generating delivery artifacts.` : "Generate complete PRD & Linear tickets"}
            style={{
              background: isApproved ? '#0e261d' : '#88998f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              padding: '8px 18px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: isApproved ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isApproved ? 1 : 0.8,
              boxShadow: isApproved ? '0 2px 6px rgba(14, 38, 29, 0.2)' : 'none'
            }}
          >
            {!isApproved && <Lock size={13} />}
            <span>{isApproved ? 'Generate decision pack' : 'Artifacts Locked (Unapproved)'}</span>
            {isApproved && <ArrowRight size={14} />}
          </button>
        </div>
      </div>

      {/* Main Title Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '1px',
          color: '#687e72',
          textTransform: 'uppercase',
          marginBottom: '8px'
        }}>
          EVIDENCE-BACKED PRODUCT DECISION AGENT
        </div>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 800,
          color: '#111915',
          letterSpacing: '-0.7px',
          lineHeight: '1.2',
          marginBottom: '8px'
        }}>
          From browser context to a<br />validated product decision.
        </h1>
        <p style={{
          fontSize: '14.5px',
          color: '#55695e',
          lineHeight: '1.45'
        }}>
          Every recommendation carries evidence, uncertainty, and an executable next step.
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
        background: isApproved ? '#f0fdf4' : isRevisionRequired ? '#fdf4ff' : '#fffbeb',
        border: `1px solid ${isApproved ? '#bbf7d0' : isRevisionRequired ? '#f5d0fe' : '#fde68a'}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ maxWidth: '720px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13.5px',
            fontWeight: 700,
            color: isApproved ? '#166534' : isRevisionRequired ? '#86198f' : '#92400e'
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
            color: isApproved ? '#15803d' : isRevisionRequired ? '#701a75' : '#78350f',
            marginTop: '4px',
            lineHeight: '1.4'
          }}>
            {isApproved
              ? `Green-lit by ${approvalRecord?.decidedBy || 'Human PM [Demo Identity]'} at ${approvalRecord?.decidedAt ? new Date(approvalRecord.decidedAt).toLocaleTimeString() : 'Recent'}. Delivery generation is unlocked. [Notice: Switch bridge and PM identity in demo mode]`
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
                  background: isSubmittingApproval ? '#6b7280' : '#047857',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSubmittingApproval ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isSubmittingApproval ? 0.7 : 1
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
                  color: '#78350f',
                  border: '1px solid #d97706',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isSubmittingApproval ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingApproval ? 0.7 : 1
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
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: isSubmittingApproval ? 'not-allowed' : 'pointer',
                opacity: isSubmittingApproval ? 0.7 : 1
              }}
            >
              {isSubmittingApproval ? 'Submitting...' : 'Reopen Decision for Revision'}
            </button>
          )}
        </div>
      </div>

      {/* Sub Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => setActiveSubTab('graph')}
          style={{
            background: activeSubTab === 'graph' ? '#e2eed5' : 'transparent',
            color: activeSubTab === 'graph' ? '#143825' : '#586a60',
            fontWeight: activeSubTab === 'graph' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '7px 16px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Evidence graph
        </button>

        <button
          onClick={() => setActiveSubTab('assumptions')}
          style={{
            background: activeSubTab === 'assumptions' ? '#e2eed5' : 'transparent',
            color: activeSubTab === 'assumptions' ? '#143825' : '#586a60',
            fontWeight: activeSubTab === 'assumptions' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '7px 16px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Evidence / assumptions
        </button>

        <button
          onClick={() => setActiveSubTab('trace')}
          style={{
            background: activeSubTab === 'trace' ? '#e2eed5' : 'transparent',
            color: activeSubTab === 'trace' ? '#143825' : '#586a60',
            fontWeight: activeSubTab === 'trace' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '7px 16px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Delivery trace
        </button>
      </div>

      {/* Content depending on subtab */}
      {activeSubTab === 'graph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Evidence Graph */}
          <EvidenceGraph nodes={evidenceGraph} />

          {/* 2. Bottom Grid: Contradiction Gate + Feature Decision Matrix */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px'
          }}>
            <ContradictionGate
              conflicts={conflicts}
              onResolveConflict={onResolveConflict}
            />
            <FeatureMatrix matrix={featureMatrix} />
          </div>
        </div>
      )}

      {activeSubTab === 'assumptions' && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e8e1',
          padding: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111915', marginBottom: '14px' }}>
            Evidence Provenance & Epistemic Audit Table
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {evidenceGraph.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#fafbf9',
                  borderRadius: '8px',
                  border: '1px solid #eef2eb'
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#047857', marginRight: '8px' }}>
                    [{item.badgeType}]
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#131916' }}>
                    {item.label}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#6a7d72' }}>
                  {item.provenance}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'trace' && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e8e1',
          padding: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111915', marginBottom: '14px' }}>
            Traceability Chain (Source → Requirement → Sprint Task)
          </h3>
          <p style={{ fontSize: '13px', color: '#55695e', marginBottom: '16px' }}>
            Every Linear engineering ticket is linked back to customer telemetry and verified design frames.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f6f9f6', padding: '14px', borderRadius: '8px', border: '1px solid #d9e6dc' }}>
              <strong>Linear ENG-142 & Figma 3A</strong> → <strong>REQ-01 (Support Guest Checkout)</strong> → <strong>Ticket ENG-201</strong> (Ready for Dev)
            </div>
            <div style={{ background: '#f6f9f6', padding: '14px', borderRadius: '8px', border: '1px solid #d9e6dc' }}>
              <strong>Exa Competitor Benchmark</strong> → <strong>REQ-02 (Limit Comparison to 3)</strong> → <strong>Ticket ENG-202</strong> (Ready for Dev)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
