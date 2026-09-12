import React, { useState } from 'react';
import { ExternalLink, Check, Sparkles, X } from 'lucide-react';

export default function FeatureMatrix({ matrix = [] }) {
  const [activeModalFeature, setActiveModalFeature] = useState(null);

  const defaultRows = [
    {
      feature: "Guest checkout",
      market: "Common",
      evidence: "Linked",
      decision: "Match",
      competitorStatus: "Stripe ✓, Shopify ✓, Amazon ✓, Bolt ✓",
      rationale: "Absolute baseline for conversion parity. Eliminates mandatory account registration drop-off."
    },
    {
      feature: "AI Checkout Recovery",
      market: "Emerging",
      evidence: "Linked",
      decision: "Differentiate",
      competitorStatus: "Stripe ✗, Shopify ✓, Amazon ✗, Bolt ✗",
      rationale: "High-value differentiator: predictive abandon intervention with personalized incentive."
    },
    {
      feature: "Dynamic comparison tray",
      market: "Niche",
      evidence: "Linked",
      decision: "Limit to 3",
      competitorStatus: "Only 1/8 competitor benchmarks offer comparison in-cart",
      rationale: "Figma UX constraint of 3 products is optimal for mobile readability. Defer 5 products to V2."
    }
  ];

  const items = matrix.length > 0 ? matrix : defaultRows;

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '22px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: 700,
          color: '#131916'
        }}>
          Feature decision matrix
        </h3>
        <span style={{
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.6px',
          color: '#657a6e',
          textTransform: 'uppercase'
        }}>
          EXA EVIDENCE
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12.5px',
          textAlign: 'left'
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #edf1eb', color: '#7a8c82', fontSize: '11px', fontWeight: 600 }}>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Feature</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Market</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Evidence</th>
              <th style={{ padding: '8px 4px', fontWeight: 600 }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f3f6f1' }}>
                <td style={{ padding: '10px 4px', fontWeight: 600, color: '#131916' }}>
                  {row.feature}
                </td>
                <td style={{ padding: '10px 4px', color: '#55695e' }}>
                  {row.market}
                </td>
                <td style={{ padding: '10px 4px' }}>
                  <button
                    onClick={() => setActiveModalFeature(row)}
                    style={{
                      background: '#dcfce7',
                      color: '#166534',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Linked
                  </button>
                </td>
                <td style={{ padding: '10px 4px', fontWeight: 600, color: row.decision === 'Differentiate' ? '#047857' : '#1e293b' }}>
                  {row.decision}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exa Competitor Modal */}
      {activeModalFeature && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '90%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  EXA RESEARCH CITATION
                </span>
              </div>
              <button
                onClick={() => setActiveModalFeature(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              {activeModalFeature.feature}
            </h4>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Market Commonality: <strong>{activeModalFeature.market}</strong> · Strategic Decision: <strong>{activeModalFeature.decision}</strong>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                Competitor Presence (Exa Search):
              </div>
              <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 500 }}>
                {activeModalFeature.competitorStatus}
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: '#334155', lineHeight: '1.45', marginBottom: '18px' }}>
              <strong>Strategist Rationale:</strong> {activeModalFeature.rationale}
            </div>

            <button
              onClick={() => setActiveModalFeature(null)}
              style={{
                width: '100%',
                background: '#0e261d',
                color: '#ffffff',
                border: 'none',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close Citation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
