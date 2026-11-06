import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  ExternalLink,
  CheckCircle,
  Plus,
  Filter,
  ShieldAlert,
  Database,
  ArrowRight
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function EvidenceReviewModal({
  workspaceId,
  token,
  isDemoMode,
  activeDecisionId,
  onClose,
  onPromoted
}) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionAlert, setActionAlert] = useState(null);

  // Promotion Form
  const [targetCategory, setTargetCategory] = useState('FEATURE_REQUEST');
  const [underlyingProblem, setUnderlyingProblem] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (isDemoMode) headers['X-PMPilot-Demo'] = 'true';
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
    return headers;
  };

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      let url = `${API_BASE_URL}/api/workspaces/${workspaceId}/evidence/records?limit=100`;
      if (selectedProvider !== 'ALL') {
        url += `&provider=${selectedProvider}`;
      }
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.warn('Could not fetch evidence records:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [selectedProvider, workspaceId]);

  const handlePromote = async (record) => {
    setIsPromoting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}/evidence/records/${record.id}/promote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          decisionId: activeDecisionId || 'session_moonshot_checkout',
          category: targetCategory,
          underlyingCustomerProblem: underlyingProblem || null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `Successfully attached "${record.title}" as an unverified signal to decision.`
        });
        setSelectedRecord(null);
        fetchRecords();
        if (onPromoted) onPromoted(data.decision);
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Failed to attach evidence.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsPromoting(false);
    }
  };

  const filteredRecords = records.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.title && r.title.toLowerCase().includes(q)) ||
           (r.content && r.content.toLowerCase().includes(q)) ||
           (r.author && r.author.toLowerCase().includes(q));
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '840px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Imported Evidence Repository ({total})
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Review customer transcripts, PRDs, issues, and design feedback before attaching to decision graphs.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
            {['ALL', 'GITHUB', 'GOOGLE_DRIVE', 'NOTION', 'JIRA', 'FIGMA', 'PRODUCTBOARD'].map(prov => (
              <button
                key={prov}
                onClick={() => setSelectedProvider(prov)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '16px',
                  border: selectedProvider === prov ? '1px solid #0f172a' : '1px solid #e2e8f0',
                  background: selectedProvider === prov ? '#0f172a' : '#ffffff',
                  color: selectedProvider === prov ? '#ffffff' : '#64748b',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {prov}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search evidence records..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px'
              }}
            />
          </div>
        </div>

        {actionAlert && (
          <div style={{
            margin: '12px 24px 0 24px',
            padding: '10px 14px',
            borderRadius: '6px',
            background: actionAlert.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${actionAlert.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: actionAlert.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: '12.5px'
          }}>
            {actionAlert.text}
          </div>
        )}

        {/* Content Area */}
        <div style={{ padding: '20px 24px', flex: 1, display: 'flex', gap: '20px' }}>
          {/* Records List */}
          <div style={{ flex: 1, maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '13px' }}>
                No imported records found. Connect an integration in the marketplace to start ingesting evidence.
              </div>
            ) : (
              filteredRecords.map(rec => {
                const isSelected = selectedRecord?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecord(rec)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                      background: isSelected ? '#f8fafc' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'border 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{rec.title}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {rec.provider} · {rec.content_type}
                      </span>
                    </div>

                    <p style={{
                      margin: 0,
                      fontSize: '12px',
                      color: '#64748b',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {rec.content}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                      <span>Author: {rec.author || 'Unknown'} · {new Date(rec.imported_at).toLocaleDateString()}</span>
                      <span style={{ color: rec.sync_state === 'LINKED_TO_DECISION' ? '#059669' : '#64748b', fontWeight: 600 }}>
                        {rec.sync_state === 'LINKED_TO_DECISION' ? '✓ Linked to Decision' : 'Ready to Review'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Promotion / Inspector Panel */}
          {selectedRecord && (
            <div style={{
              width: '320px',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px',
              background: '#fafbfc',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Inspect Evidence
                </div>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  {selectedRecord.title}
                </h4>

                <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4, maxHeight: '120px', overflowY: 'auto', marginBottom: '14px', background: '#ffffff', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  {selectedRecord.content}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Signal Category
                    </label>
                    <select
                      value={targetCategory}
                      onChange={e => setTargetCategory(e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    >
                      <option value="FEATURE_REQUEST">Feature Request</option>
                      <option value="CUSTOMER_FEEDBACK">Customer Feedback</option>
                      <option value="DESIGN_SPEC">Design Constraint</option>
                      <option value="TECHNICAL_SPIKE">Technical Spike</option>
                      <option value="REGRESSION_RISK">Regression Risk</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Underlying Customer Problem
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mobile checkout registration friction"
                      value={underlyingProblem}
                      onChange={e => setUnderlyingProblem(e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={() => handlePromote(selectedRecord)}
                  disabled={isPromoting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={14} />
                  <span>Attach as Unverified Signal</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
