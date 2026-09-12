import React, { useState } from 'react';
import { Smartphone, Bell, Check, X, Send, Sparkles, Clock, ShieldCheck } from 'lucide-react';

export default function PocketCompanion({ onResolveConflict }) {
  const [activeTab, setActiveTab] = useState('notifications');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hey Sairishita! 🚨 Found a contradiction between Figma Frame 3A (3 items) and Linear ENG-142 (5 items). Would you like to approve the 3-item MVP on the go?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [resolvedQuickAction, setResolvedQuickAction] = useState(false);

  const handle1TapApprove = async (choice) => {
    setResolvedQuickAction(true);
    setChatMessages(prev => [
      ...prev,
      { sender: 'user', text: `Approved: ${choice}` },
      { sender: 'bot', text: `✓ Synchronized with desktop workspace in 120ms! Decision confidence increased to 96%. All 3 team members notified.` }
    ]);
    if (onResolveConflict) {
      onResolveConflict('conflict_1', choice);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text }]);
    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: `Associate PM (Pocket): Context saved. Your PRD is 96% complete and ready for sprint lock.` }
      ]);
    }, 500);
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e8e1',
      padding: '28px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #edf1eb',
        paddingBottom: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.8px',
            color: '#6d28d9',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            IN YOUR POCKET · MOBILE COMPANION
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#111915' }}>
            Mobile Notifications & Short Asynchronous Moments
          </h2>
          <p style={{ fontSize: '13px', color: '#55695e', marginTop: '4px' }}>
            Manage product decisions in short 30-second moments with 1-tap mobile approvals, Telegram/SMS agent sync, and push notifications.
          </p>
        </div>
      </div>

      {/* Interactive Mobile Device View */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px 0'
      }}>
        <div style={{
          width: '320px',
          height: '560px',
          background: '#0c1410',
          borderRadius: '40px',
          border: '10px solid #1a2720',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          color: '#e5ece8'
        }}>
          {/* Phone Speaker & Dynamic Island */}
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80px',
            height: '18px',
            background: '#000000',
            borderRadius: '9999px',
            zIndex: 10
          }} />

          {/* Phone Top Bar */}
          <div style={{
            padding: '16px 20px 8px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            fontWeight: 700,
            color: '#9ca3af'
          }}>
            <span>9:41</span>
            <span>5G 100%</span>
          </div>

          {/* Sub Switcher */}
          <div style={{
            display: 'flex',
            margin: '8px 16px',
            background: '#15241b',
            borderRadius: '8px',
            padding: '2px'
          }}>
            <button
              onClick={() => setActiveTab('notifications')}
              style={{
                flex: 1,
                background: activeTab === 'notifications' ? '#244533' : 'transparent',
                color: activeTab === 'notifications' ? '#5eead4' : '#86968d',
                border: 'none',
                padding: '6px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Push Alerts
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                flex: 1,
                background: activeTab === 'chat' ? '#244533' : 'transparent',
                color: activeTab === 'chat' ? '#5eead4' : '#86968d',
                border: 'none',
                padding: '6px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              SMS / Telegram
            </button>
          </div>

          {/* Phone Content */}
          {activeTab === 'notifications' && (
            <div style={{
              flex: 1,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              overflowY: 'auto'
            }}>
              {/* Notification 1: 1-Tap Short Asynchronous Moment */}
              <div style={{
                background: '#16281e',
                border: '1px solid #234231',
                borderRadius: '16px',
                padding: '14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                    BLOCKING CONFLICT
                  </span>
                  <span style={{ fontSize: '10px', color: '#7e9688' }}>3m ago</span>
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#f0fdf4', marginBottom: '4px' }}>
                  Maximum comparison count: 3 vs 5
                </div>
                <p style={{ fontSize: '11px', color: '#9fb5a8', lineHeight: '1.4', marginBottom: '12px' }}>
                  Figma UX constraint allows 3 items. Linear ENG-142 asks for 5. Tap below to resolve asynchronously.
                </p>

                {!resolvedQuickAction ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handle1TapApprove('Limit to 3 (Figma UX pattern)')}
                      style={{
                        flex: 1,
                        background: '#047857',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      1-Tap: Approve 3
                    </button>
                    <button
                      onClick={() => handle1TapApprove('Expand to 5 (Linear)')}
                      style={{
                        flex: 1,
                        background: '#1d3326',
                        color: '#a7f3d0',
                        border: '1px solid #294d38',
                        borderRadius: '8px',
                        padding: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Keep 5
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#6ee7b7',
                    fontWeight: 700
                  }}>
                    <Check size={14} />
                    <span>Resolved & synced to desktop workspace!</span>
                  </div>
                )}
              </div>

              {/* Notification 2: PRD Ready */}
              <div style={{
                background: '#16281e',
                border: '1px solid #234231',
                borderRadius: '16px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                    PRD DELIVERED
                  </span>
                  <span style={{ fontSize: '10px', color: '#7e9688' }}>14m ago</span>
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#f0fdf4', marginBottom: '4px' }}>
                  AI Checkout PRD v1.0 Ready
                </div>
                <p style={{ fontSize: '11px', color: '#9fb5a8', lineHeight: '1.4' }}>
                  Trigger.dev finished background synthesis. 96% evidence confidence.
                </p>
              </div>
            </div>
          )}

          {/* SMS / Telegram Chat */}
          {activeTab === 'chat' && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 14px',
              gap: '10px',
              overflowY: 'auto'
            }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '11.5px',
                      lineHeight: '1.4',
                      padding: '8px 12px',
                      borderRadius: '12px',
                      background: msg.sender === 'user' ? '#047857' : '#1a2e22',
                      color: msg.sender === 'user' ? '#ffffff' : '#e1ece5',
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%'
                    }}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Reply to Associate PM..."
                  style={{
                    flex: 1,
                    background: '#16281e',
                    border: '1px solid #244231',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '11px',
                    color: '#ffffff',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#047857',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer'
                  }}
                >
                  <Send size={12} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
