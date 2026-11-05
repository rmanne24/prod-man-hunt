import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Scale, ArrowRight } from 'lucide-react';

export default function ContradictionGate({ conflicts = [], onResolveConflict }) {
  const [resolvingId, setResolvingId] = useState(null);

  const activeConflict = conflicts[0] || {
    id: "conflict_1",
    title: "Maximum comparison count: 3 vs 5",
    severity: "BLOCKING",
    detail: "Figma says three products; Linear says five. Block sprint lock until UX and backlog align.",
    status: "OPEN"
  };

  const isResolved = activeConflict.status === "RESOLVED";

  const handleResolve = async (choice) => {
    setResolvingId(activeConflict.id);
    if (onResolveConflict) {
      await onResolveConflict(activeConflict.id, choice);
    }
    setResolvingId(null);
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Scale size={16} color={isResolved ? '#059669' : '#dc2626'} />
          <h3 style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#0f172a'
          }}>
            Contradiction gate
          </h3>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.4px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: isResolved ? '#ecfdf5' : '#fef2f2',
          color: isResolved ? '#065f46' : '#991b1b',
          border: `1px solid ${isResolved ? '#a7f3d0' : '#fecaca'}`,
          textTransform: 'uppercase'
        }}>
          {isResolved ? 'RESOLVED' : activeConflict.severity || 'BLOCKING'}
        </span>
      </div>

      {/* Body */}
      <div>
        <div style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '6px'
        }}>
          {activeConflict.title}
        </div>
        <p style={{
          fontSize: '12.5px',
          color: '#475569',
          lineHeight: '1.5',
          marginBottom: '16px'
        }}>
          {isResolved
            ? `Resolved with: ${typeof activeConflict.chosenResolution === 'object' ? (activeConflict.chosenResolution?.choiceLabel || activeConflict.chosenResolution?.resolutionChoiceId) : (activeConflict.chosenResolution || 'Limit to 3 (Figma UX pattern)')}${activeConflict.chosenResolution?.resolvedAtVersion ? ` (v${activeConflict.chosenResolution.resolvedAtVersion})` : ''}. Provenance logged to decision memory.`
            : activeConflict.detail}
        </p>
      </div>

      {/* Action Buttons */}
      {!isResolved ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activeConflict.suggestedResolutions && activeConflict.suggestedResolutions.length > 0 ? (
            activeConflict.suggestedResolutions.map((resOption) => (
              <button
                key={resOption.id}
                onClick={() => handleResolve(resOption.id)}
                disabled={resolvingId !== null}
                style={{
                  background: resOption.recommended ? '#0f172a' : '#ffffff',
                  color: resOption.recommended ? '#ffffff' : '#334155',
                  border: resOption.recommended ? '1px solid #0f172a' : '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '7px 13px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: resolvingId !== null ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.12s ease'
                }}
              >
                <span>{resOption.recommended ? `★ ${resOption.label}` : resOption.label}</span>
              </button>
            ))
          ) : (
            <>
              <button
                onClick={() => handleResolve("res_3")}
                disabled={resolvingId !== null}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: '1px solid #0f172a',
                  borderRadius: '6px',
                  padding: '7px 13px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: resolvingId !== null ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Resolve with 3 (Figma)</span>
              </button>
              <button
                onClick={() => handleResolve("res_5")}
                disabled={resolvingId !== null}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '7px 13px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: resolvingId !== null ? 'not-allowed' : 'pointer'
                }}
              >
                <span>Resolve with 5 (Linear)</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#059669',
          fontSize: '12px',
          fontWeight: 600,
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          padding: '8px 12px',
          borderRadius: '6px'
        }}>
          <CheckCircle size={15} color="#059669" />
          <span>Contradiction cleared. Decision health unblocked for human PM approval.</span>
        </div>
      )}
    </div>
  );
}
