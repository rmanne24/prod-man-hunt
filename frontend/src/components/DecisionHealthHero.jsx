import React from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function DecisionHealthHero({
  health,
  status: decisionStatus = 'CONFLICT_REVIEW',
  version = 1,
  approvalRecord
}) {
  const {
    status = "Initial decision exploration. Awaiting signals and evidence.",
    detail = "Recommendations require evidence grounding, uncertainty estimation, and explicit human sign-off.",
    confidence = 50,
    conflictsCount = 0,
    riskyAssumptionsCount = 0,
    epistemicBreakdown
  } = health || {};

  const isApproved = (decisionStatus === 'APPROVED' || decisionStatus === 'ARTIFACT_GENERATED') && approvalRecord?.status === 'APPROVED';
  const isRevision = decisionStatus === 'NEEDS_REVISION';

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      padding: '22px 26px',
      marginBottom: '20px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '20px'
    }}>
      {/* Left Column: Context & Summary */}
      <div style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.6px',
            color: '#64748b',
            textTransform: 'uppercase'
          }}>
            DECISION HEALTH & READINESS
          </div>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: '9999px',
            background: isApproved ? '#ecfdf5' : isRevision ? '#faf5ff' : '#fffbeb',
            color: isApproved ? '#065f46' : isRevision ? '#6b21a8' : '#92400e',
            border: `1px solid ${isApproved ? '#a7f3d0' : isRevision ? '#e9d5ff' : '#fde68a'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {isApproved ? <ShieldCheck size={12} /> : isRevision ? <AlertTriangle size={12} /> : <AlertCircle size={12} />}
            <span>
              {isApproved ? `✓ APPROVED (v${version})` : isRevision ? `⚠️ REVISION REQ (v${version})` : `🔒 AWAITING APPROVAL (v${version})`}
            </span>
          </span>
        </div>

        <h2 style={{
          fontSize: '19px',
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: '1.3',
          marginBottom: '6px'
        }}>
          {status}
        </h2>
        <p style={{
          fontSize: '13px',
          color: '#475569',
          lineHeight: '1.5'
        }}>
          {detail}
        </p>

        {epistemicBreakdown && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              {epistemicBreakdown.observed} Observed
            </span>
            <span style={{ fontSize: '11px', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              {epistemicBreakdown.inferred} Inferred
            </span>
            <span style={{ fontSize: '11px', background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              {epistemicBreakdown.assumed} Assumed
            </span>
          </div>
        )}
      </div>

      {/* Right Column: Clean Metrics Grid */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '14px 20px'
      }}>
        {/* Metric 1 */}
        <div style={{ textAlign: 'center', minWidth: '90px' }}>
          <div style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: '1'
          }}>
            {confidence}%
          </div>
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginTop: '5px',
            fontWeight: 500
          }}>
            Evidence score
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />

        {/* Metric 2 */}
        <div style={{ textAlign: 'center', minWidth: '90px' }}>
          <div style={{
            fontSize: '26px',
            fontWeight: 800,
            color: conflictsCount > 0 ? '#dc2626' : '#059669',
            lineHeight: '1'
          }}>
            {conflictsCount}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginTop: '5px',
            fontWeight: 500
          }}>
            {conflictsCount === 1 ? 'Contradiction' : 'Contradictions'}
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', background: '#e2e8f0' }} />

        {/* Metric 3 */}
        <div style={{ textAlign: 'center', minWidth: '90px' }}>
          <div style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#6366f1',
            lineHeight: '1'
          }}>
            {riskyAssumptionsCount}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginTop: '5px',
            fontWeight: 500
          }}>
            Assumptions
          </div>
        </div>
      </div>
    </div>
  );
}
