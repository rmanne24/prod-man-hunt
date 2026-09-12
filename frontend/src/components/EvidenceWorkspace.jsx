import React, { useState } from 'react';
import DecisionHealthHero from './DecisionHealthHero.jsx';
import EvidenceGraph from './EvidenceGraph.jsx';
import ContradictionGate from './ContradictionGate.jsx';
import FeatureMatrix from './FeatureMatrix.jsx';
import { ArrowRight, Sparkles, Filter, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function EvidenceWorkspace({
  session,
  onResolveConflict,
  onCaptureSourceClick,
  onGenerateDecisionPack
}) {
  const [activeSubTab, setActiveSubTab] = useState('graph');

  const {
    decisionHealth,
    evidenceGraph = [],
    conflicts = [],
    featureMatrix = []
  } = session || {};

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
            onClick={onGenerateDecisionPack}
            style={{
              background: '#0e261d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              padding: '8px 18px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(14, 38, 29, 0.2)'
            }}
          >
            <span>Generate decision pack</span>
            <ArrowRight size={14} />
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
      <DecisionHealthHero health={decisionHealth} />

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
