import React, { useState } from 'react';
import { Sparkles, Mic } from 'lucide-react';

export default function OmniBar({ onPromptSubmit }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (onPromptSubmit) onPromptSubmit(query);
    setQuery('');
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '18px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9990,
      width: '460px',
      maxWidth: '90%'
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#151d18',
          border: '1px solid #233429',
          borderRadius: '9999px',
          padding: '6px 10px 6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: '#1e3327',
          color: '#5eead4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Sparkles size={13} />
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Do anything..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f0fdf4',
            fontSize: '13.5px',
            fontFamily: 'inherit'
          }}
        />

        <button
          type="button"
          onClick={() => {
            setQuery("Audit competitor checkout pricing on Stripe vs Shopify");
          }}
          title="Voice or preset query"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#83988c',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 6px'
          }}
        >
          <Mic size={15} />
        </button>
      </form>
    </div>
  );
}
