import React, { useState } from 'react';
import { 
  Plus, 
  FileText, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Tag, 
  Quote, 
  ShieldCheck,
  Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function EvidenceView({ session, onCaptureSourceClick, onNavigateToDecision }) {
  const { isDemoMode } = useAuth();
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const evidenceGraph = session?.evidenceGraph || [];
  const capturedSources = session?.capturedSources || [];

  const demoSources = [
    {
      id: 'sig_linear_142',
      type: 'Linear',
      badge: 'L',
      name: '[SYNTHETIC DEMO] Linear ENG-142 Drop-off Telemetry',
      timestamp: 'Sep 12, 2026',
      verbatimExcerpt: 'Issue ENG-142 Drop-off at login modal is 68%. Engineering requests 5-product comparison tray on desktop.',
      provenance: '[SYNTHETIC DEMO FIXTURE] Synthesized issue payload for drop-off telemetry.',
      epistemicBadge: 'OBSERVED',
      linkedDecision: '[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery',
      status: 'EVALUATED',
      isSyntheticDemo: true
    },
    {
      id: 'sig_figma_3a',
      type: 'Figma',
      badge: 'F',
      name: '[SYNTHETIC DEMO] Figma Frame 3A (Checkout Modal)',
      timestamp: 'Sep 12, 2026',
      verbatimExcerpt: 'Frame 3A: Guest checkout flow with 3-product comparison view. Mobile viewport constraint prevents >3 items.',
      provenance: '[SYNTHETIC DEMO FIXTURE] Synthesized vector canvas metadata.',
      epistemicBadge: 'OBSERVED',
      linkedDecision: '[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery',
      status: 'EVALUATED',
      isSyntheticDemo: true
    },
    {
      id: 'sig_notion_sec',
      type: 'Notion',
      badge: 'N',
      name: '[SYNTHETIC DEMO] Notion PRD & Security §4',
      timestamp: 'Sep 12, 2026',
      verbatimExcerpt: 'Security §4: Stateless signed cart recovery tokens must expire within 24h to 72h depending on checkout tender.',
      provenance: '[SYNTHETIC DEMO FIXTURE] Synthesized documentation page.',
      epistemicBadge: 'OBSERVED',
      linkedDecision: '[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery',
      status: 'EVALUATED',
      isSyntheticDemo: true
    },
    {
      id: 'sig_exa_bench',
      type: 'Exa Benchmark',
      badge: 'E',
      name: '[SYNTHETIC BENCHMARK] Competitive Checkout Analysis',
      timestamp: 'Sep 12, 2026',
      verbatimExcerpt: 'Stripe Link and Shopify provide 1-click checkout. Only 1 of 8 competitors support in-cart comparison.',
      provenance: '[SYNTHETIC BENCHMARK] Synthesized market intelligence fixture.',
      epistemicBadge: 'INFERRED',
      linkedDecision: '[SYNTHETIC DEMO] One-Click Guest Checkout & Cart Recovery',
      status: 'EVALUATED',
      isSyntheticDemo: true
    }
  ];

  // Map real signals from active session if present
  const realSignals = (session?.signals || []).map((sig) => {
    const linkedNode = evidenceGraph.find(n => n.sources?.some(s => s.sourceSignalId === sig.id));
    return {
      id: sig.id,
      type: sig.sourceType || 'Customer Feedback',
      badge: (sig.source || 'S').replace(/^\[.*?\]\s*/, '')[0]?.toUpperCase() || 'S',
      name: sig.source || 'Captured Signal',
      timestamp: sig.capturedAt ? new Date(sig.capturedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
      verbatimExcerpt: sig.sanitizedText || sig.rawText || '',
      provenance: sig.url || 'Direct signal capture',
      epistemicBadge: sig.epistemicType || linkedNode?.badgeType || 'OBSERVED',
      linkedDecision: session?.title || 'Active Decision',
      status: sig.processingStatus || 'EVALUATED',
      isSyntheticDemo: Boolean(sig.isSyntheticDemo)
    };
  });

  const fallbackSources = capturedSources.map(cs => ({
    id: cs.id,
    type: cs.type || 'Source',
    badge: cs.badge || 'S',
    name: cs.name || 'Captured Source',
    timestamp: cs.timestamp || 'Captured',
    verbatimExcerpt: cs.extractedContent || '',
    provenance: cs.url || 'External capture',
    epistemicBadge: 'OBSERVED',
    linkedDecision: session?.title || 'Active Decision',
    status: cs.status || 'EVALUATED',
    isSyntheticDemo: Boolean(cs.isSyntheticDemo)
  }));

  const sourceItems = realSignals.length > 0 
    ? realSignals 
    : (fallbackSources.length > 0 ? fallbackSources : (isDemoMode ? demoSources : []));

  const filteredSources = sourceItems.filter(item => {
    if (filterType !== 'ALL' && item.type.toLowerCase() !== filterType.toLowerCase()) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.verbatimExcerpt.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Evidence Grounding Hub
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Captured Sources & Provenance Repository
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Verbatim customer telemetry, design frames, and requirements ground all downstream decisions and PRDs.
          </p>
        </div>

        <button
          onClick={onCaptureSourceClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 16px',
            borderRadius: '8px',
            background: '#0f172a',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={16} />
          <span>Capture Signal</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['ALL', 'Figma', 'Linear', 'Notion', 'Exa Benchmark'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: filterType === t ? 700 : 500,
                background: filterType === t ? '#0f172a' : '#ffffff',
                color: filterType === t ? '#ffffff' : '#475569',
                border: filterType === t ? '1px solid #0f172a' : '1px solid #e2e8f0',
                cursor: 'pointer'
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '6px 12px',
          width: '260px',
          gap: '8px'
        }}>
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search signals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              width: '100%',
              background: 'transparent'
            }}
          />
        </div>
      </div>

      {/* Sources Grid */}
      {filteredSources.length === 0 ? (
        <div style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px dashed #cbd5e1',
          padding: '64px 32px',
          textAlign: 'center',
          marginBottom: '28px'
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
            {session ? 'No Evidence Signals Captured Yet' : 'No Active Decision Selected'}
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
            {session 
              ? 'Capture raw customer feedback, Zendesk tickets, or research notes to ground this decision record.'
              : 'Select or create a product decision in this workspace to view and capture evidence signals.'}
          </p>
          {session && onCaptureSourceClick && (
            <button
              onClick={onCaptureSourceClick}
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
              <span>Capture First Signal</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
          {filteredSources.map((source) => (
            <div
              key={source.id}
              style={{
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700
                }}>
                  {source.badge}
                </span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    {source.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                    Captured {source.timestamp} · Source: {source.type}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: source.epistemicBadge === 'OBSERVED' ? '#ecfdf5' : '#f0f9ff',
                  color: source.epistemicBadge === 'OBSERVED' ? '#047857' : '#0369a1',
                  border: `1px solid ${source.epistemicBadge === 'OBSERVED' ? '#a7f3d0' : '#bae6fd'}`
                }}>
                  {source.epistemicBadge}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #e2e8f0'
                }}>
                  {source.status}
                </span>
              </div>
            </div>

            {/* Verbatim Excerpt Callout */}
            <div style={{
              background: '#f8fafc',
              borderLeft: '3px solid #0f172a',
              borderRadius: '0 6px 6px 0',
              padding: '12px 16px',
              marginBottom: '14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                Verbatim Source Excerpt
              </div>
              <div style={{ fontSize: '13.5px', color: '#1e293b', fontStyle: 'italic', lineHeight: 1.5 }}>
                "{source.verbatimExcerpt}"
              </div>
            </div>

            {/* Grounding & Provenance Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#64748b',
              paddingTop: '12px',
              borderTop: '1px solid #f1f5f9'
            }}>
              <div>
                <strong>Provenance:</strong> {source.provenance}
              </div>
              <button
                onClick={() => onNavigateToDecision && onNavigateToDecision('decisions')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <span>View Linked Decision</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Grounding Guarantee Notice */}
      <div style={{
        padding: '14px 18px',
        borderRadius: '8px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <ShieldCheck size={20} color="#059669" />
        <div style={{ fontSize: '13px', color: '#334155' }}>
          <strong>Grounding Guarantee:</strong> Every insight, user story, and PRD acceptance criterion references one or more immutable verbatim source records. Unsubstantiated claims are rejected by the decision state machine.
        </div>
      </div>
    </div>
  );
}

