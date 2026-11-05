import React, { useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

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
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9990,
      width: '500px',
      maxWidth: '92%'
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '9999px',
          padding: '8px 12px 8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <Search size={15} color="#94a3b8" />

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Command PM context (e.g. 'generate PRD', 'challenge decision')..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontSize: '13px',
            fontFamily: 'inherit'
          }}
        />

        <button
          type="submit"
          title="Submit command"
          style={{
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '9999px',
            color: '#cbd5e1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            gap: '3px'
          }}
        >
          <span>Return</span>
          <CornerDownLeft size={11} />
        </button>
      </form>
    </div>
  );
}
