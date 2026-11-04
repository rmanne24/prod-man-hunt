import React from 'react';
import { ShieldCheck, AlertTriangle, HelpCircle } from 'lucide-react';

export default function DecisionHealthHero({
  health,
  status: decisionStatus = 'CONFLICT_REVIEW',
  version = 1,
  approvalRecord
}) {
  const {
    status = "Promising direction. Resolve two conflicts first.",
    detail = "The guest-checkout decision is evidence-backed, but customer validation and scope clarity are still missing.",
    confidence = 88,
    conflictsCount = 2,
    riskyAssumptionsCount = 1
  } = health || {};

  const isApproved = (decisionStatus === 'APPROVED' || decisionStatus === 'ARTIFACT_GENERATED') && approvalRecord?.status === 'APPROVED';
  const isRevision = decisionStatus === 'NEEDS_REVISION';

  return (
    <div style={{
      background: '#0d251c',
      backgroundImage: 'radial-gradient(ellipse at 85% 20%, rgba(52, 211, 153, 0.12) 0%, transparent 60%)',
      borderRadius: '16px',
      border: '1px solid #1a3c2e',
      padding: '28px 32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      color: '#f0fdf4',
      boxShadow: '0 8px 30px rgba(7, 24, 18, 0.25)',
      flexWrap: 'wrap',
      gap: '24px'
    }}>
      {/* Left Column */}
      <div style={{ maxWidth: '580px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '1px',
            color: '#34d399',
            textTransform: 'uppercase'
          }}>
            DECISION HEALTH
          </div>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '9999px',
            background: isApproved ? '#064e3b' : isRevision ? '#3b0764' : '#451a03',
            color: isApproved ? '#6ee7b7' : isRevision ? '#e9d5ff' : '#fde68a',
            border: `1px solid ${isApproved ? '#047857' : isRevision ? '#7e22ce' : '#b45309'}`
          }}>
            {isApproved ? `✓ APPROVED (v${version})` : isRevision ? `⚠️ REVISION REQ (v${version})` : `🔒 AWAITING APPROVAL (v${version})`}
          </span>
        </div>
        <h2 style={{
          fontSize: '22px',
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: '1.25',
          marginBottom: '8px'
        }}>
          {status}
        </h2>
        <p style={{
          fontSize: '13.5px',
          color: '#a3c7b7',
          lineHeight: '1.45'
        }}>
          {detail}
        </p>
      </div>

      {/* Right Column Metrics */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '32px'
      }}>
        {/* Metric 1 */}
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            color: '#6ee7b7',
            letterSpacing: '-0.5px',
            lineHeight: '1'
          }}>
            {confidence}%
          </div>
          <div style={{
            fontSize: '11.5px',
            color: '#93b6a5',
            marginTop: '4px',
            fontWeight: 500
          }}>
            Evidence confidence
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '40px', background: '#1d3e30' }} />

        {/* Metric 2 */}
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            color: conflictsCount > 0 ? '#fca5a5' : '#6ee7b7',
            letterSpacing: '-0.5px',
            lineHeight: '1'
          }}>
            {conflictsCount}
          </div>
          <div style={{
            fontSize: '11.5px',
            color: '#93b6a5',
            marginTop: '4px',
            fontWeight: 500
          }}>
            Conflicts
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '40px', background: '#1d3e30' }} />

        {/* Metric 3 */}
        <div style={{ textAlign: 'left' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            color: '#d8b4fe',
            letterSpacing: '-0.5px',
            lineHeight: '1'
          }}>
            {riskyAssumptionsCount}
          </div>
          <div style={{
            fontSize: '11.5px',
            color: '#93b6a5',
            marginTop: '4px',
            fontWeight: 500
          }}>
            Risky assumption
          </div>
        </div>
      </div>
    </div>
  );
}
