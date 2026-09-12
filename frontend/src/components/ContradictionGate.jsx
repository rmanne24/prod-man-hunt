import React, { useState } from 'react';
import { AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';

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
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '22px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '14px'
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: 700,
          color: '#131916'
        }}>
          Contradiction gate
        </h3>
        <span style={{
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.6px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: isResolved ? '#dcfce7' : '#fee2e2',
          color: isResolved ? '#166534' : '#b91c1c',
          textTransform: 'uppercase'
        }}>
          {isResolved ? 'RESOLVED' : activeConflict.severity || 'BLOCKING'}
        </span>
      </div>

      {/* Body */}
      <div>
        <div style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#10261b',
          marginBottom: '6px'
        }}>
          {activeConflict.title}
        </div>
        <p style={{
          fontSize: '12.5px',
          color: '#55695e',
          lineHeight: '1.45',
          marginBottom: '16px'
        }}>
          {isResolved
            ? `Resolved with: ${activeConflict.chosenResolution || 'Limit to 3 (Figma UX pattern)'}. Provenance logged to decision memory.`
            : activeConflict.detail}
        </p>
      </div>

      {/* Action Buttons */}
      {!isResolved ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleResolve("Limit to 3 (Figma UX pattern)")}
            disabled={resolvingId !== null}
            style={{
              background: '#0e261d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Resolve with 3 (Figma)</span>
          </button>
          <button
            onClick={() => handleResolve("Expand to 5 (Linear request)")}
            disabled={resolvingId !== null}
            style={{
              background: 'transparent',
              color: '#34493e',
              border: '1px solid #d1dbd4',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <span>Resolve with 5 (Linear)</span>
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#15803d',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <CheckCircle size={15} />
          <span>Contradiction cleared. Decision health increased to 96%.</span>
        </div>
      )}
    </div>
  );
}
