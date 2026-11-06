import React, { useState } from 'react';
import { X, Globe, Plus, FileText, Check } from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function CaptureSourceModal({ isOpen, onClose, onSourceAdded, decisionId = 'session_moonshot_checkout', getAuthHeaders }) {
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('Figma');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sourceName.trim()) return;

    setIsSaving(true);
    const headers = getAuthHeaders ? getAuthHeaders() : { 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`${API_BASE_URL}/api/decisions/${decisionId}/signals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: sourceName.trim(),
          sourceType,
          rawText: content.trim() || sourceName.trim(),
          url: url || 'https://browser.tab/context',
          capturedBy: 'PM Team'
        })
      });
      const data = await res.json();
      if (onSourceAdded) onSourceAdded(data.decision?.signals || data.session?.capturedSources);
      onClose();
    } catch (err) {
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '460px',
        padding: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#111915' }}>
            Capture Browser Evidence
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#687a70' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#4a5d52', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Source Name
            </label>
            <input
              type="text"
              required
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. Figma Mobile Sheet v3, Notion Checkout PRD"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #d4dbd4',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#4a5d52', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Source Category
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d4dbd4',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#ffffff'
                }}
              >
                <option value="Figma">Figma Frame</option>
                <option value="Notion">Notion Document</option>
                <option value="Linear">Linear Issue</option>
                <option value="Competitor">Competitor Website</option>
                <option value="Web">Web Research</option>
              </select>
            </div>

            <div style={{ flex: 1.5 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#4a5d52', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d4dbd4',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#4a5d52', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Extracted Text / Requirements
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste context or requirements text here (Mozilla.ai sanitizes and extracts)..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #d4dbd4',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #d4dbd4',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                color: '#44564c',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: '#0e261d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {isSaving ? 'Extracting...' : 'Add to Evidence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
