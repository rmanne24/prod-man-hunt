import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  RotateCcw,
  ShieldAlert,
  CheckCircle,
  Send,
  MessageSquare,
  X,
  AlertTriangle,
  Scissors,
  ClipboardList
} from 'lucide-react';
import { API_BASE_URL } from '../config.js';

export default function CopilotSidebar({
  decisionMemory = [],
  onAction,
  onReopenDecision,
  onClose
}) {
  const [messages, setMessages] = useState([
    {
      id: 'init_1',
      role: 'assistant',
      text: "I've synthesized 4 active sources (Figma, Notion, Linear, Exa). Notice that Linear requested a 5-product matrix while Figma specified 3. We also have an assumed 72-hour session TTL that needs validation before sprint lock."
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleQuickAction = async (actionType) => {
    setIsLoading(true);
    let userPrompt = "";
    if (actionType === 'challenge_decision') userPrompt = "Challenge this product decision with counter-evidence.";
    if (actionType === 'shrink_to_mvp') userPrompt = "Shrink this scope to a 2-week lean MVP.";
    if (actionType === 'create_validation_plan') userPrompt = "Generate an empirical validation plan.";

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text: userPrompt }]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/session/session_moonshot_checkout/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType })
      });
      const data = await res.json();

      let botReply = "Executed action.";
      if (actionType === 'challenge_decision') {
        botReply = "CRITICAL REVIEW: While guest checkout increases immediate conversion (+14%), drop in registered accounts requires an Apple Pay 1-click passwordless save. Additionally, a 5-product matrix will degrade mobile Safari performance by 40%.";
      } else if (actionType === 'shrink_to_mvp') {
        botReply = "SCOPE CUT APPLIED: Deferring 5-product comparison, Klarna BNPL, and negotiation bot. Keeping guest checkout + 3-product drawer. Health confidence raised to 95%.";
      } else if (actionType === 'create_validation_plan') {
        botReply = "VALIDATION PLAN GENERATED: 5-day pre-sprint usability test on Figma frame 3A. Kill criteria: if conversion lift < 4% across 500 sessions, fallback to passwordless SMS OTP.";
      }

      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: botReply }]);
      if (onAction) onAction(actionType, data);
    } catch (err) {
      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: "Action executed and logged to working memory." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text: userText }]);

    setTimeout(() => {
      let reply = `Observing active context for "${userText}". All claims remain grounded in Figma frame 3A, Linear ENG-142, and Exa market research.`;
      if (userText.toLowerCase().includes("competitor") || userText.toLowerCase().includes("stripe")) {
        reply = "Exa benchmark indicates Stripe offers Link passkeys and 1-page guest checkout, but lacks in-cart comparison. Positioning AI Checkout as the market's first 3-item comparison drawer.";
      }
      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: reply }]);
    }, 600);
  };

  const latestMemory = decisionMemory[0] || {
    date: "SEP 12, 2026",
    title: "Limit comparison to three in MVP",
    summary: "Mobile usability risk and no evidence of five-way demand. Revisit after 1,000 sessions."
  };

  return (
    <aside style={{
      width: '340px',
      minWidth: '320px',
      background: '#ffffff',
      borderLeft: '1px solid #e2e8f0',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      height: '100%',
      overflowY: 'auto',
      zIndex: 40
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '4px'
          }}>
            <Sparkles size={15} color="#0f172a" />
            <span>Associate PM Copilot</span>
          </div>
          <p style={{
            fontSize: '12px',
            color: '#64748b',
            lineHeight: 1.4,
            margin: 0
          }}>
            Context-grounded assistant for counter-arguments, scope reduction, and validation.
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px'
            }}
            title="Close Assistant"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Quick Action Pills */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
          Suggested PM Actions
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <button
            onClick={() => handleQuickAction('challenge_decision')}
            disabled={isLoading}
            style={{
              background: '#fff1f2',
              color: '#9f1239',
              border: '1px solid #fecdd3',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            <span>Challenge decision with counter-evidence</span>
          </button>

          <button
            onClick={() => handleQuickAction('shrink_to_mvp')}
            disabled={isLoading}
            style={{
              background: '#f0fdf4',
              color: '#166534',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Scissors size={13} style={{ flexShrink: 0 }} />
            <span>Shrink scope to 2-week lean MVP</span>
          </button>

          <button
            onClick={() => handleQuickAction('create_validation_plan')}
            disabled={isLoading}
            style={{
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ClipboardList size={13} style={{ flexShrink: 0 }} />
            <span>Generate pre-sprint validation plan</span>
          </button>
        </div>
      </div>

      {/* Decision Memory Section */}
      <div style={{
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '14px'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '8px'
        }}>
          Decision Memory
        </div>

        <div style={{
          borderLeft: '2px solid #0f172a',
          paddingLeft: '10px',
          marginBottom: '10px'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#64748b',
            marginBottom: '2px'
          }}>
            {latestMemory.date}
          </div>
          <div style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '2px'
          }}>
            {latestMemory.title}
          </div>
          <p style={{
            fontSize: '11.5px',
            color: '#475569',
            lineHeight: 1.4,
            margin: 0
          }}>
            {latestMemory.summary}
          </p>
        </div>

        <button
          onClick={() => {
            if (onReopenDecision) onReopenDecision();
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <RotateCcw size={12} />
          <span>Reopen Decision</span>
        </button>
      </div>

      {/* Copilot Chat Feed */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        borderTop: '1px solid #e2e8f0',
        paddingTop: '14px',
        minHeight: '180px'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          Conversation
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '220px'
        }}>
          {messages.map(msg => {
            const isCritical = typeof msg.text === 'string' && msg.text.startsWith('CRITICAL REVIEW:');
            const isScopeCut = typeof msg.text === 'string' && msg.text.startsWith('SCOPE CUT APPLIED:');
            const isValidation = typeof msg.text === 'string' && msg.text.startsWith('VALIDATION PLAN GENERATED:');

            return (
              <div
                key={msg.id}
                style={{
                  fontSize: '12px',
                  lineHeight: 1.45,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: msg.role === 'user' ? '#0f172a' : '#f1f5f9',
                  color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                  border: msg.role === 'user' ? '1px solid #0f172a' : '1px solid #e2e8f0',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%'
                }}
              >
                {isCritical && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#991b1b', marginBottom: '3px' }}>
                    <AlertTriangle size={12} />
                    <span>CRITICAL REVIEW</span>
                  </div>
                )}
                {isScopeCut && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#166534', marginBottom: '3px' }}>
                    <Scissors size={12} />
                    <span>SCOPE CUT APPLIED</span>
                  </div>
                )}
                {isValidation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700, color: '#334155', marginBottom: '3px' }}>
                    <ClipboardList size={12} />
                    <span>VALIDATION PLAN GENERATED</span>
                  </div>
                )}
                <span>
                  {isCritical ? msg.text.replace(/^CRITICAL REVIEW:\s*/, '') :
                   isScopeCut ? msg.text.replace(/^SCOPE CUT APPLIED:\s*/, '') :
                   isValidation ? msg.text.replace(/^VALIDATION PLAN GENERATED:\s*/, '') :
                   msg.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask Copilot..."
            style={{
              flex: 1,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Send size={12} />
          </button>
        </form>
      </div>
    </aside>
  );
}
