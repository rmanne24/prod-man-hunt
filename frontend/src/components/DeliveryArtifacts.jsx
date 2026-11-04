import React, { useState, useEffect } from 'react';
import { CheckCircle, ExternalLink, Send, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function DeliveryArtifacts({ prd, session, onReopenDecision }) {
  const [activeTab, setActiveTab] = useState('prd');
  const [exportLinearStatus, setExportLinearStatus] = useState(null);
  const [exportSlackStatus, setExportSlackStatus] = useState(null);

  const {
    id: sessionId = 'session_moonshot_checkout',
    status = 'CONFLICT_REVIEW',
    version = 1,
    approvalRecord
  } = session || {};

  const isApproved = (status === 'APPROVED' || status === 'ARTIFACT_GENERATED') && approvalRecord?.status === 'APPROVED';
  const isRevisionRequired = status === 'NEEDS_REVISION';

  // Reset export confirmation when approval is invalidated or relocked
  useEffect(() => {
    if (!isApproved) {
      setExportLinearStatus(null);
      setExportSlackStatus(null);
    }
  }, [isApproved]);

  const handleExportLinear = async () => {
    if (!isApproved) {
      alert("Delivery export is locked. Human PM approval is required before syncing to Linear.");
      return;
    }
    setExportLinearStatus('syncing');
    try {
      const res = await fetch('http://localhost:4000/api/export/linear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId: sessionId,
          tickets: prd?.sections?.find(s => s.tickets)?.tickets
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setExportLinearStatus('success');
      } else {
        setExportLinearStatus('error');
        alert(`Linear export rejected: ${data.error || 'Server rejected export'}`);
      }
    } catch (err) {
      setExportLinearStatus('error');
      alert(`Linear export network error: ${err.message}`);
    }
  };

  const handleExportSlack = async () => {
    if (!isApproved) {
      alert("Delivery export is locked. Human PM approval is required before sharing to Slack.");
      return;
    }
    setExportSlackStatus('syncing');
    try {
      const res = await fetch('http://localhost:4000/api/export/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId: sessionId,
          channel: '#product-announcements',
          message: `Associate PM PRD v${version} green-lit. Delivery artifacts ready for sprint review.`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setExportSlackStatus('success');
      } else {
        setExportSlackStatus('error');
        alert(`Slack export rejected: ${data.error || 'Server rejected export'}`);
      }
    } catch (err) {
      setExportSlackStatus('error');
      alert(`Slack export network error: ${err.message}`);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '28px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #edf1eb',
        paddingBottom: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.8px',
            color: '#047857',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            DELIVERY SUITE · TRIGGER.DEV PIPELINE
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#111915' }}>
            Product Requirements & Sprint Breakdown
          </h2>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            data-export-btn="linear"
            onClick={handleExportLinear}
            disabled={!isApproved}
            title={!isApproved ? "Locked: Awaiting human approval" : "Push tickets to Linear (Demo Mode)"}
            style={{
              background: !isApproved ? '#e5e8e1' : exportLinearStatus === 'success' ? '#dcfce7' : exportLinearStatus === 'error' ? '#fee2e2' : '#12261e',
              color: !isApproved ? '#718379' : exportLinearStatus === 'success' ? '#15803d' : exportLinearStatus === 'error' ? '#991b1b' : '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: !isApproved ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: !isApproved ? 0.75 : 1
            }}
          >
            {!isApproved ? <Lock size={14} /> : exportLinearStatus === 'success' ? <CheckCircle size={14} /> : <ExternalLink size={14} />}
            <span>{exportLinearStatus === 'success' ? 'Validated for Linear (Demo)' : exportLinearStatus === 'error' ? 'Linear Export Failed' : 'Push to Linear (Demo)'}</span>
          </button>

          <button
            data-export-btn="slack"
            onClick={handleExportSlack}
            disabled={!isApproved}
            title={!isApproved ? "Locked: Awaiting human approval" : "Share announcement to Slack (Demo Mode)"}
            style={{
              background: !isApproved ? '#e5e8e1' : exportSlackStatus === 'success' ? '#dcfce7' : exportSlackStatus === 'error' ? '#fee2e2' : '#4a154b',
              color: !isApproved ? '#718379' : exportSlackStatus === 'success' ? '#15803d' : exportSlackStatus === 'error' ? '#991b1b' : '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: !isApproved ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: !isApproved ? 0.75 : 1
            }}
          >
            {!isApproved ? <Lock size={14} /> : exportSlackStatus === 'success' ? <CheckCircle size={14} /> : <Send size={14} />}
            <span>{exportSlackStatus === 'success' ? 'Notified #product (Demo)' : exportSlackStatus === 'error' ? 'Slack Failed' : 'Share to Slack (Demo)'}</span>
          </button>
        </div>
      </div>

      {/* Approval Status Banner */}
      <div style={{
        background: isApproved ? '#f0fdf4' : isRevisionRequired ? '#fdf4ff' : '#fffbeb',
        border: `1px solid ${isApproved ? '#bbf7d0' : isRevisionRequired ? '#f5d0fe' : '#fde68a'}`,
        borderRadius: '10px',
        padding: '14px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isApproved ? (
            <ShieldCheck size={20} color="#166534" />
          ) : isRevisionRequired ? (
            <AlertTriangle size={20} color="#86198f" />
          ) : (
            <Lock size={20} color="#92400e" />
          )}
          <div>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              color: isApproved ? '#166534' : isRevisionRequired ? '#86198f' : '#92400e'
            }}>
              {isApproved
                ? `Delivery Unlocked · Approved for Version ${approvalRecord?.approvedDecisionVersion || version}`
                : isRevisionRequired
                ? `Re-approval Required · Decision Version ${version}`
                : `Delivery Pipeline Locked · Awaiting Human Approval (v${version})`}
            </div>
            <div style={{
              fontSize: '12px',
              color: isApproved ? '#15803d' : isRevisionRequired ? '#701a75' : '#78350f',
              marginTop: '2px'
            }}>
              {isApproved ? (
                <>
                  Approved by <strong>{approvalRecord?.decidedBy || 'Human PM'}</strong> [Demo Identity] at {approvalRecord?.decidedAt ? new Date(approvalRecord.decidedAt).toLocaleTimeString() : 'Recent'}.
                  {approvalRecord?.conditions?.length > 0 && ` Conditions: ${approvalRecord.conditions.join(', ')}`}
                </>
              ) : isRevisionRequired ? (
                approvalRecord?.invalidationReason || `A decision mutation invalidated the prior approval. Re-approval on version ${version} is required before exporting artifacts.`
              ) : (
                `Downstream ticket export and production PRD release require an explicit human PM approval record bound to decision version ${version}.`
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            background: isApproved ? '#dcfce7' : isRevisionRequired ? '#fae8ff' : '#fef3c7',
            color: isApproved ? '#166534' : isRevisionRequired ? '#86198f' : '#92400e',
            padding: '4px 10px',
            borderRadius: '9999px',
            letterSpacing: '0.4px',
            textTransform: 'uppercase'
          }}>
            {isApproved ? '✓ AUDIT RECORD VALID' : isRevisionRequired ? 'REVISION PENDING' : 'APPROVAL PENDING'}
          </div>
          {isApproved && onReopenDecision && (
            <button
              onClick={onReopenDecision}
              title="Make material change: increments version and returns approval locks"
              style={{
                background: 'transparent',
                color: '#166534',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reopen Decision
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('prd')}
          style={{
            background: activeTab === 'prd' ? '#e3edd7' : 'transparent',
            color: activeTab === 'prd' ? '#143825' : '#57675e',
            fontWeight: activeTab === 'prd' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          PRD Spec
        </button>
        <button
          onClick={() => setActiveTab('stories')}
          style={{
            background: activeTab === 'stories' ? '#e3edd7' : 'transparent',
            color: activeTab === 'stories' ? '#143825' : '#57675e',
            fontWeight: activeTab === 'stories' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          User Stories & Criteria
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          style={{
            background: activeTab === 'tickets' ? '#e3edd7' : 'transparent',
            color: activeTab === 'tickets' ? '#143825' : '#57675e',
            fontWeight: activeTab === 'tickets' ? 700 : 500,
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Linear Sprint Plan
        </button>
      </div>

      {/* Tab 1: PRD Spec */}
      {activeTab === 'prd' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{
            background: '#fafbf9',
            padding: '16px 20px',
            borderRadius: '10px',
            border: '1px solid #e5e8e1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#131916' }}>
                [SYNTHETIC DEMO] AI-Assisted Guest Checkout & Recovery
              </div>
              <div style={{ fontSize: '12px', color: '#687a70', marginTop: '2px' }}>
                Status: <strong>READY FOR SPRINT LOCK</strong> · Confidence: <strong>96%</strong> · [Synthetic Fixture]
              </div>
            </div>
            <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '9999px', fontWeight: 700, border: '1px solid #fde68a' }}>
              SYNTHETIC DEMO SPEC
            </span>
          </div>

          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915', marginBottom: '8px' }}>
              1. Executive Summary & Problem Framing
            </h4>
            <p style={{ fontSize: '13px', color: '#44564c', lineHeight: '1.5' }}>
              Mandatory account creation creates a 68% drop-off barrier at the checkout step. By synthesizing Figma Frame 3A and Linear backlog ENG-142 with Exa competitor benchmarks from Stripe and Shopify, PMPilot provides a validated guest checkout experience with biometric 1-click payment and an in-cart comparison tray constrained strictly to 3 products to avoid mobile viewport degradation.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111915', marginBottom: '8px' }}>
              2. Market Positioning & Differentiator (via Exa)
            </h4>
            <p style={{ fontSize: '13px', color: '#44564c', lineHeight: '1.5' }}>
              Stripe and Amazon have saturated standard guest checkout. The defensible differentiator identified by Exa is <em>predictive hesitation intervention</em>: offering automated bundling incentives within a 72-hour signed stateless cart token link.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: User Stories */}
      {activeTab === 'stories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            {
              id: 'STORY-01',
              persona: 'First-time mobile shopper',
              want: 'Check out instantly with Apple Pay or credit card without creating a password',
              benefit: 'Complete purchase in under 45 seconds without form fatigue',
              evidence: 'Observed (Figma 3A & Notion PRD)'
            },
            {
              id: 'STORY-02',
              persona: 'Hesitant comparison shopper',
              want: 'Inspect up to 3 selected items side-by-side in the checkout tray',
              benefit: 'Confirm specs without losing cart state',
              evidence: 'Resolved Contradiction (Figma vs Linear)'
            },
            {
              id: 'STORY-03',
              persona: 'Returning shopper',
              want: 'Click recovery email link and restore cart seamlessly for 72 hours',
              benefit: 'Resume checkout from any device without password login',
              evidence: 'Inferred (Linear ENG-142)'
            }
          ].map((story) => (
            <div
              key={story.id}
              style={{
                background: '#fafbf9',
                border: '1px solid #e5e8e1',
                borderRadius: '10px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#047857' }}>{story.id}</span>
                <span style={{ fontSize: '11px', color: '#66786e' }}>{story.evidence}</span>
              </div>
              <div style={{ fontSize: '13px', color: '#131916', lineHeight: '1.45' }}>
                <strong>As a</strong> {story.persona}, <strong>I want to</strong> {story.want}, <strong>so that</strong> {story.benefit}.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Tickets */}
      {activeTab === 'tickets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { id: 'ENG-201', title: 'Build guest-checkout entry and modal UI states', points: '5 pts', status: 'Ready for Dev' },
            { id: 'ENG-202', title: 'Implement 3-product comparison drawer component', points: '8 pts', status: 'Ready for Dev' },
            { id: 'ENG-203', title: 'Stateless 72h cart token signed recovery endpoint', points: '5 pts', status: 'Ready for Dev' },
            { id: 'ENG-204', title: 'Telemetry instrumentation for checkout drop-off', points: '3 pts', status: 'Ready for Dev' }
          ].map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#fafbf9',
                border: '1px solid #e5e8e1',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5' }}>{t.id}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111915' }}>{t.title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#687a70' }}>{t.points}</span>
                <span style={{ fontSize: '10.5px', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
                  {t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
