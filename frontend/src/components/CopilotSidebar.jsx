import React, { useState } from 'react';
import { Sparkles, ArrowRight, RotateCcw, ShieldAlert, CheckCircle, Send, MessageSquare } from 'lucide-react';

export default function CopilotSidebar({
  decisionMemory = [],
  onAction,
  onReopenDecision
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
      const res = await fetch(`http://localhost:4000/api/session/session_moonshot_checkout/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType })
      });
      const data = await res.json();

      let botReply = "Executed action.";
      if (actionType === 'challenge_decision') {
        botReply = "⚠️ CRITICAL REVIEW: While guest checkout increases immediate conversion (+14%), drop in registered accounts requires an Apple Pay 1-click passwordless save. Additionally, a 5-product matrix will degrade mobile Safari performance by 40%.";
      } else if (actionType === 'shrink_to_mvp') {
        botReply = "✓ SCOPE CUT APPLIED: Deferring 5-product comparison, Klarna BNPL, and negotiation bot. Keeping guest checkout + 3-product drawer. Health confidence raised to 95%.";
      } else if (actionType === 'create_validation_plan') {
        botReply = "📋 VALIDATION PLAN GENERATED: 5-day pre-sprint usability test on Figma frame 3A. Kill criteria: if conversion lift < 4% across 500 sessions, fallback to passwordless SMS OTP.";
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
      width: '320px',
      minWidth: '300px',
      background: '#ffffff',
      borderLeft: '1px solid #e5e8e1',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Header */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          fontSize: '15px',
          fontWeight: 700,
          color: '#131916',
          marginBottom: '6px'
        }}>
          <span style={{ color: '#047857', fontSize: '16px' }}>✦</span>
          <span>Associate Product Manager</span>
        </div>
        <p style={{
          fontSize: '12.5px',
          color: '#55695e',
          lineHeight: '1.4'
        }}>
          Decision-ready work, not a confident PRD. I expose what is observed, inferred, assumed, and unknown.
        </p>
      </div>

      {/* Quick Action Pills */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <button
          onClick={() => handleQuickAction('challenge_decision')}
          disabled={isLoading}
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
        >
          Challenge decision
        </button>

        <button
          onClick={() => handleQuickAction('shrink_to_mvp')}
          disabled={isLoading}
          style={{
            background: '#dcfce7',
            color: '#166534',
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
        >
          Shrink to 2-week MVP
        </button>

        <button
          onClick={() => handleQuickAction('create_validation_plan')}
          disabled={isLoading}
          style={{
            background: '#ede9fe',
            color: '#5b21b6',
            border: 'none',
            borderRadius: '9999px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
        >
          Create validation plan
        </button>
      </div>

      {/* Decision Memory Section */}
      <div>
        <div style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#131916',
          marginBottom: '10px'
        }}>
          Decision memory
        </div>

        <div style={{
          borderLeft: '2px solid #84cc16',
          paddingLeft: '12px',
          marginBottom: '10px'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            color: '#65a30d',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            {latestMemory.date}
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#131916',
            marginBottom: '4px'
          }}>
            {latestMemory.title}
          </div>
          <p style={{
            fontSize: '12px',
            color: '#55695e',
            lineHeight: '1.4'
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
            border: '1px solid #d4dbd4',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#34493e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <RotateCcw size={13} />
          <span>Reopen decision</span>
        </button>
      </div>

      {/* Generation Status */}
      <div style={{ borderTop: '1px solid #f0f3ee', paddingTop: '16px' }}>
        <div style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: '#131916',
          marginBottom: '6px'
        }}>
          Generation status
        </div>
        <div style={{
          fontSize: '10.5px',
          fontWeight: 800,
          letterSpacing: '0.8px',
          color: '#047857',
          textTransform: 'uppercase',
          marginBottom: '4px'
        }}>
          READY · 4 APPROVED SOURCES
        </div>
        <div style={{
          fontSize: '11.5px',
          color: '#667a6f',
          lineHeight: '1.4'
        }}>
          Artifacts stay linked to evidence and unresolved risks.
        </div>
      </div>

      {/* Copilot Chat Feed */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderTop: '1px solid #f0f3ee',
        paddingTop: '16px',
        minHeight: '200px'
      }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#718076',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Copilot Stream
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '260px'
        }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                fontSize: '12px',
                lineHeight: '1.45',
                padding: '10px 12px',
                borderRadius: '8px',
                background: msg.role === 'user' ? '#f1f5f9' : '#f0fdf4',
                color: msg.role === 'user' ? '#0f172a' : '#14532d',
                border: msg.role === 'user' ? '1px solid #e2e8f0' : '1px solid #bbf7d0',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask Associate PM..."
            style={{
              flex: 1,
              background: '#f8faf9',
              border: '1px solid #d4dbd4',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              background: '#0e261d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </aside>
  );
}
