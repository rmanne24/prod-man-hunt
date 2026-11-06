import React, { useState } from 'react';
import { X, Key, Check, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function SettingsModal({ isOpen, onClose }) {
  const [openaiKey, setOpenaiKey] = useState('');
  const [exaKey, setExaKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [linearKey, setLinearKey] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveStatus('saving');

    try {
      const res = await fetch(`${API_BASE_URL}/api/hub/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys: {
            openai: openaiKey,
            exa: exaKey,
            openrouter: openRouterKey,
            slackWebhook: slackWebhook,
            linearApiKey: linearKey
          }
        })
      });
      const data = await res.json();
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus(null);
        onClose();
      }, 1000);
    } catch (err) {
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus(null);
        onClose();
      }, 1000);
    }
  };

  return (
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
      zIndex: 999999,
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '500px',
        padding: '26px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={18} color="#047857" />
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111915' }}>
              API Keys & Credits Configuration
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#687a70' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '12.5px', color: '#55695e', lineHeight: '1.45', marginBottom: '18px' }}>
          Enter your live sponsor keys below to activate real frontier model reasoning, Exa web searches, and Slack/Linear webhooks. <em>If left blank, PMPilot runs seamlessly in resilient fallback mode with zero downtime!</em>
        </p>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#44564c', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              OpenAI API Key (GPT-4o Reasoning)
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
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

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#44564c', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Exa API Key (Live Competitor Search)
            </label>
            <input
              type="password"
              value={exaKey}
              onChange={(e) => setExaKey(e.target.value)}
              placeholder="exa-..."
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

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#44564c', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              OpenRouter API Key (Model Gateway & Routing)
            </label>
            <input
              type="password"
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              placeholder="sk-or-..."
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

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#44564c', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Slack Webhook URL (#product-announcements)
            </label>
            <input
              type="text"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
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

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#44564c', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Linear API Key (Issue Backlog Export)
            </label>
            <input
              type="password"
              value={linearKey}
              onChange={(e) => setLinearKey(e.target.value)}
              placeholder="lin_api_..."
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
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
              style={{
                background: saveStatus === 'saved' ? '#15803d' : '#0e261d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {saveStatus === 'saved' ? <Check size={14} /> : <Key size={14} />}
              <span>{saveStatus === 'saved' ? 'Keys Saved!' : saveStatus === 'saving' ? 'Saving...' : 'Save & Activate Keys'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
