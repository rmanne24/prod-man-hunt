import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, HelpCircle, FileText } from 'lucide-react';

export default function EvidenceGraph({ nodes = [], onNodeClick }) {
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[2]?.id || 'node_3');

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];

  const getBadgeStyles = (badgeType) => {
    switch (badgeType) {
      case 'OBSERVED':
        return {
          bg: '#e6f7ec',
          text: '#047857',
          border: '#a7f3d0',
          dot: '#10b981',
          label: 'OBSERVED'
        };
      case 'INFERRED':
        return {
          bg: '#fef3c7',
          text: '#b45309',
          border: '#fde68a',
          dot: '#f59e0b',
          label: 'INFERRED'
        };
      case 'ASSUMED':
        return {
          bg: '#f3effe',
          text: '#6d28d9',
          border: '#ddd6fe',
          dot: '#8b5cf6',
          label: 'ASSUMED'
        };
      case 'UNKNOWN_VALIDATE':
        return {
          bg: '#fde8eb',
          text: '#be123c',
          border: '#fecdd3',
          dot: '#f43f5e',
          label: 'UNKNOWN / VALIDATE'
        };
      default:
        return {
          bg: '#f3f4f6',
          text: '#374151',
          border: '#e5e7eb',
          dot: '#9ca3af',
          label: badgeType
        };
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '24px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      {/* Header Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#131916',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          Evidence graph
        </h3>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#738378',
          letterSpacing: '0.8px',
          textTransform: 'uppercase'
        }}>
          CLICK A NODE TO INSPECT ITS PROOF
        </span>
      </div>

      {/* Horizontal Flow Nodes */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '16px',
        marginBottom: '16px'
      }}>
        {nodes.map((node, index) => {
          const isSelected = node.id === selectedNodeId;
          const badge = getBadgeStyles(node.badgeType);

          return (
            <React.Fragment key={node.id}>
              <div
                onClick={() => {
                  setSelectedNodeId(node.id);
                  if (onNodeClick) onNodeClick(node);
                }}
                style={{
                  minWidth: '155px',
                  maxWidth: '170px',
                  height: '110px',
                  background: isSelected ? '#ffffff' : '#fafbf9',
                  border: isSelected ? '2px solid #0e261d' : '1px solid #e5e8e1',
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isSelected ? '0 4px 14px rgba(14, 38, 29, 0.08)' : 'none',
                  transition: 'all 0.18s ease'
                }}
              >
                {/* Node Tag */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: badge.text,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase'
                }}>
                  <span>{node.category}</span>
                  <span style={{ color: '#9ca3af' }}>·</span>
                  <span>{badge.label}</span>
                </div>

                {/* Node Text Label */}
                <div style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#131916',
                  lineHeight: '1.3',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {node.label}
                </div>

                {/* Bottom Source Citation Tag */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px',
                  color: '#718076'
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: badge.dot
                  }} />
                  <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {node.source || 'Verified'}
                  </span>
                </div>
              </div>

              {index < nodes.length - 1 && (
                <div style={{
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 2px'
                }}>
                  <ArrowRight size={15} strokeWidth={2.2} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Proof Callout Box matching screenshot */}
      {selectedNode && (
        <div style={{
          background: '#f2f6f2',
          border: '1px solid #d8e5dc',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#10261b',
            marginBottom: '4px'
          }}>
            {selectedNode.category}: {selectedNode.label}
          </div>
          <div style={{
            fontSize: '13px',
            color: '#495d52',
            lineHeight: '1.4'
          }}>
            {selectedNode.details}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '8px',
            fontSize: '11px',
            color: '#657a6e'
          }}>
            <span><strong>Source:</strong> {selectedNode.source}</span>
            <span>·</span>
            <span><strong>Provenance:</strong> {selectedNode.provenance}</span>
          </div>
        </div>
      )}

      {/* Legend Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        fontSize: '11.5px',
        color: '#55665c',
        paddingTop: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
          <span>Observed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
          <span>Inferred</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} />
          <span>Assumed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e' }} />
          <span>Unknown / validate</span>
        </div>
      </div>
    </div>
  );
}
