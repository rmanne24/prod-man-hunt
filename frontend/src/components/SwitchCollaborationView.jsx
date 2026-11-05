import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Users,
  GitMerge,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  Shield,
  RefreshCw,
  Send,
  Sparkles,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function SwitchCollaborationView({ session, onRefreshSession, _onNavigateTo }) {
  const { token } = useAuth();
  const decisionId = session?.id || session?.sessionId || 'session_moonshot_checkout';
  const workspaceId = session?.workspaceId || 'ws_moonshot';
  const currentVersion = session?.version || 1;

  // Preflight state
  const [preflight, setPreflight] = useState(null);
  const [isPreflightLoading, setIsPreflightLoading] = useState(false);

  // Switch Room state
  const [room, setRoom] = useState(null);

  // Proposals state
  const [proposals, setProposals] = useState([]);
  const [isProposalsLoading, setIsProposalsLoading] = useState(false);

  // Message chat stream state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Action status message
  const [actionAlert, setActionAlert] = useState(null);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [showSafeContextModal, setShowSafeContextModal] = useState(false);

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);

  // 1. Fetch Switch Preflight Health
  const fetchPreflight = useCallback(async () => {
    setIsPreflightLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/integrations/switch/preflight');
      if (res.ok) {
        const data = await res.json();
        setPreflight(data.preflight);
      }
    } catch (err) {
      console.warn('Switch preflight fetch error:', err.message);
    } finally {
      setIsPreflightLoading(false);
    }
  }, []);

  // 2. Fetch Room mapped to current decision
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/room`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setRoom(data.room);
      }
    } catch (err) {
      console.warn('Fetch room error:', err.message);
    }
  }, [workspaceId, decisionId, getHeaders]);

  // 3. Fetch proposals for current decision
  const fetchProposals = useCallback(async () => {
    setIsProposalsLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/proposals`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (err) {
      console.warn('Fetch proposals error:', err.message);
    } finally {
      setIsProposalsLoading(false);
    }
  }, [workspaceId, decisionId, getHeaders]);

  // 4. Fetch persistent messages from backend SQLite store
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/messages`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          setMessages(data.messages);
        }
      }
    } catch (err) {
      console.warn('Fetch messages error:', err.message);
    }
  }, [workspaceId, decisionId, getHeaders]);

  useEffect(() => {
    fetchPreflight();
    fetchRoom();
    fetchProposals();
    fetchMessages();
  }, [fetchPreflight, fetchRoom, fetchProposals, fetchMessages]);

  // Action: Force synchronize Room Briefing to current Decision Version
  const handleSyncRoom = async () => {
    setIsActionInProgress(true);
    setActionAlert(null);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/room/sync`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRoom(data.room);
        setActionAlert({
          type: 'success',
          text: `Room briefing context successfully synchronized to Decision v${data.room.shared_at_version}.`
        });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Sync room error: ${err.message}` });
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Action: Create / Associate Room
  const handleCreateRoom = async () => {
    setIsActionInProgress(true);
    setActionAlert(null);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/room`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRoom(data.room);
        setActionAlert({
          type: 'success',
          text: data.room.isExisting
            ? `Retrieved existing Switch room: ${data.room.room_name} (Idempotent)`
            : `Created and mapped Switch room: ${data.room.room_name}`
        });
        fetchRoom();
        fetchMessages();
      } else {
        setActionAlert({
          type: 'error',
          text: `Failed to create Switch room: ${data.error || 'Server error'}`
        });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Room creation error: ${err.message}` });
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Action: Post message to room
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !room?.room_id) return;

    const messageText = inputMessage.trim();
    setInputMessage('');
    setIsSendingMessage(true);

    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/message`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          roomId: room.room_id,
          content: messageText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchMessages();
        if (data.isSimulated && data.reason) {
          setActionAlert({
            type: 'info',
            text: `Note: Message recorded in local evaluator thread. (${data.reason})`
          });
        }
      }
    } catch (err) {
      console.warn('Post message error:', err.message);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Action: Simulate Teammate Consensus & Draft Structured Proposal (Evaluator Convenience)
  const handleSimulateDraftProposal = async () => {
    setIsActionInProgress(true);
    setActionAlert(null);
    try {
      const proposalPayload = {
        roomId: room?.room_id || `sw_room_${Date.now()}`,
        proposalType: 'REQUIREMENT_CHANGE',
        summary: 'Enforce 3-item limit on guest comparisons to safeguard mobile performance & add fraud checks for orders >$150.',
        proposedChanges: {
          title: '[SYNTHETIC DEMO] One-Click Guest Checkout with Fraud-Safe Comparison Caps',
          hypothesis: 'One-click checkout with a 3-item guest comparison cap will increase conversion without exceeding mobile bandwidth budgets.',
          notes: 'Team reached consensus in Switch collaboration room on mobile payload ceiling and risk tiering.'
        },
        openQuestions: [
          'Will users with 4+ items in comparison cart abandon if prompted to log in?',
          'What is the estimated fraud chargeback delta under the $150 threshold?'
        ],
        risksTradeoffs: [
          'Limiting comparisons to 3 items may cause minor friction for power shoppers.',
          'Stricter fraud check adds ~800ms latency to high-value transactions.'
        ],
        recommendedAction: 'Merge revised guest checkout limits into Decision specification and re-request stakeholder approval.',
        proposedBy: 'Security Lead & Data Analyst (via Switch)'
      };

      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/proposals`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(proposalPayload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `Drafted proposal bound to Decision v${data.proposal.decision_version}. Awaiting human PM review.`
        });
        // Add chat feedback
        setMessages(prev => [
          ...prev,
          {
            id: `prop_msg_${Date.now()}`,
            sender: 'PMPilot Decision Assistant',
            role: 'AGENT',
            text: `Formulated structured change proposal [Proposal #${data.proposal.id.slice(0, 8)}] bound to Decision v${data.proposal.decision_version}. PM must review and explicitly merge.`,
            timestamp: 'Just now'
          }
        ]);
        fetchProposals();
      } else {
        setActionAlert({
          type: 'error',
          text: `Failed to draft proposal: ${data.error || 'Server error'}`
        });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Proposal error: ${err.message}` });
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Action: PM Accepts & Merges Proposal (Enforces Human Gate & Invalidation)
  const handleApplyProposal = async (proposalId) => {
    setIsActionInProgress(true);
    setActionAlert(null);
    try {
      const res = await fetch(
        `http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/proposals/${proposalId}/apply`,
        {
          method: 'POST',
          headers: getHeaders()
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `${data.message} Decision advanced to v${data.newDecisionVersion}. Human approval relocked for review.`
        });
        if (onRefreshSession) await onRefreshSession();
        fetchProposals();
        fetchRoom();
      } else {
        setActionAlert({
          type: 'error',
          text: `Failed to apply proposal: ${data.error || 'Server rejected proposal application'}`
        });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Apply proposal error: ${err.message}` });
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Action: PM Rejects Proposal
  const handleRejectProposal = async (proposalId) => {
    setIsActionInProgress(true);
    try {
      const res = await fetch(
        `http://localhost:4000/api/workspaces/${workspaceId}/decisions/${decisionId}/switch/proposals/${proposalId}/reject`,
        {
          method: 'POST',
          headers: getHeaders()
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: 'info',
          text: 'Proposal rejected by PM.'
        });
        fetchProposals();
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Reject error: ${err.message}` });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const getStatusBadge = () => {
    if (!preflight) return { text: 'CHECKING PREFLIGHT...', bg: '#f1f5f9', color: '#64748b' };
    switch (preflight.status) {
      case 'CONNECTED':
        return { text: 'CONNECTED & REACHABLE', bg: '#ecfdf5', color: '#047857' };
      case 'CONFIGURED':
        return { text: 'CONFIGURED (ONLINE)', bg: '#f0f9ff', color: '#0284c7' };
      case 'UNREACHABLE':
        return { text: 'SWITCH SERVER UNREACHABLE', bg: '#fef2f2', color: '#b91c1c' };
      default:
        return { text: 'UNCONFIGURED (LOCAL DEV)', bg: '#fef3c7', color: '#b45309' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* 1. Header & Sponsor Branding */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#4338ca',
              background: '#e0e7ff',
              padding: '2px 8px',
              borderRadius: '4px',
              letterSpacing: '0.04em'
            }}>
              SWITCH AGENT PROTOCOL V1
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#047857',
              background: '#ecfdf5',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              OFFICIAL HACKATHON SPONSOR
            </span>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Switch AI Collaboration Fabric
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Connect PM decisions to team chat rooms, synchronize evidence-backed safe context, and draft structured proposals with strict human sign-off gates.
          </p>
        </div>

        {/* Live Preflight Health Indicator */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '6px',
            background: statusBadge.bg,
            border: `1px solid ${statusBadge.color}33`,
            fontSize: '12px',
            fontWeight: 700,
            color: statusBadge.color
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusBadge.color
            }} />
            <span>{statusBadge.text}</span>
            <button
              onClick={fetchPreflight}
              title="Re-probe Switch Health"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
            >
              <RefreshCw size={12} className={isPreflightLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Server Address: <code>{preflight?.serverUrl || 'http://localhost:8000'}</code>
          </span>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionAlert && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: actionAlert.type === 'success' ? '#ecfdf5' : actionAlert.type === 'info' ? '#f0f9ff' : '#fef2f2',
          border: `1px solid ${actionAlert.type === 'success' ? '#a7f3d0' : actionAlert.type === 'info' ? '#bae6fd' : '#fecaca'}`,
          color: actionAlert.type === 'success' ? '#065f46' : actionAlert.type === 'info' ? '#0369a1' : '#991b1b',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actionAlert.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{actionAlert.text}</span>
          </div>
          <button
            onClick={() => setActionAlert(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Top Summary Grid: Active Decision v Canonical vs Switch Fabric */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Left: Decision Canonical State Box */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CANONICAL DECISION RECORD
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              background: '#0f172a',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              ACTIVE VERSION: v{currentVersion}
            </span>
          </div>

          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
            {session?.title || 'Decision'}
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px 0' }}>
            {session?.problemStatement?.underlyingProblem || session?.hypothesis || 'Evaluate product trade-offs with grounded evidence'}
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '12px',
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #f1f5f9'
          }}>
            <div>
              <span style={{ color: '#94a3b8' }}>Lifecycle State: </span>
              <strong style={{ color: '#0f172a' }}>{session?.status || 'DRAFT'}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Human Approval: </span>
              <strong style={{
                color: session?.approvalRecord?.status === 'APPROVED' ? '#047857' : '#b45309'
              }}>
                {session?.approvalRecord?.status || 'PENDING'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8' }}>Linear Export: </span>
              <strong style={{
                color: session?.approvalRecord?.status === 'APPROVED' ? '#047857' : '#64748b'
              }}>
                {session?.approvalRecord?.status === 'APPROVED' ? 'UNLOCKED' : 'LOCKED'}
              </strong>
            </div>
          </div>
        </div>

        {/* Right: Switch Room Association Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                SWITCH COLLABORATION ROOM
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: room ? '#ecfdf5' : '#f8fafc',
                color: room ? '#047857' : '#64748b',
                padding: '2px 8px',
                borderRadius: '4px',
                border: `1px solid ${room ? '#a7f3d0' : '#e2e8f0'}`
              }}>
                {room ? 'ACTIVE ROOM MAPPED' : 'UNMAPPED'}
              </span>
            </div>

            {room ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  {room.room_name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                  Room ID: <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>{room.room_id}</code>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Synchronized at Decision Version <strong>v{room.shared_at_version || 1}</strong> · Agent: <code>{room.agent_id}</code>
                </div>
                {room.shared_at_version !== currentVersion && (
                  <div style={{
                    marginTop: '8px',
                    padding: '6px 10px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    <span>Briefing is on v{room.shared_at_version}, canonical decision is on v{currentVersion}.</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px 0' }}>
                  No Switch room is currently mapped to this decision. Associate a room to let team members and autonomous agents collaborate.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCreateRoom}
              disabled={isActionInProgress}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: isActionInProgress ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Users size={14} />
              <span>{room ? 'Rebind Room' : 'Associate Switch Room (Idempotent)'}</span>
            </button>

            {room && room.shared_at_version !== currentVersion && (
              <button
                onClick={handleSyncRoom}
                disabled={isActionInProgress}
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isActionInProgress ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} />
                <span>Sync Briefing to v{currentVersion}</span>
              </button>
            )}

            <button
              onClick={() => setShowSafeContextModal(true)}
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Shield size={14} color="#059669" />
              <span>View Safe Context</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Grid: Live Discussion on Left, Structured Proposals on Right */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        gap: '20px',
        alignItems: 'start'
      }}>
        {/* Left Column: Live Switch Discussion Thread */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          height: '620px'
        }}>
          {/* Discussion Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={16} color="#4338ca" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                Collaboration Thread
              </span>
              <span style={{
                fontSize: '11px',
                color: '#64748b',
                background: '#f1f5f9',
                padding: '1px 6px',
                borderRadius: '4px'
              }}>
                {messages.length} events
              </span>
            </div>

            <button
              onClick={handleSimulateDraftProposal}
              disabled={isActionInProgress}
              title="Simulates team chat feedback and drafts a structured proposal"
              style={{
                background: '#f5f3ff',
                color: '#6d28d9',
                border: '1px solid #ddd6fe',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Sparkles size={13} />
              <span>Draft Consensus Proposal</span>
            </button>
          </div>

          {/* Honest Live Stream vs Simulation Mode Banner */}
          <div style={{
            padding: '8px 14px',
            background: preflight?.reachable ? '#ecfdf5' : '#fffbeb',
            borderBottom: `1px solid ${preflight?.reachable ? '#a7f3d0' : '#fde68a'}`,
            fontSize: '11px',
            color: preflight?.reachable ? '#065f46' : '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {preflight?.reachable ? (
              <>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                <span><strong>Live Switch Fabric:</strong> Connected to Switch server via Agent Protocol v1. Inbound events delivered via SSE/WS.</span>
              </>
            ) : (
              <>
                <AlertTriangle size={13} color="#b45309" style={{ flexShrink: 0 }} />
                <span><strong>Evaluator Simulation Mode:</strong> Switch server (<code>http://localhost:8000</code>) is offline / unconfigured. Room thread below runs in local evaluator simulation mode.</span>
              </>
            )}
          </div>

          {/* Messages Scroll Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#fafafa'
          }}>
            {messages.map((m) => {
              const isAgent = m.role === 'AGENT';
              const isSystem = m.role === 'SYSTEM';
              const isSimulated = Boolean(m.is_simulated === 1 || m.is_simulated === true || m.is_simulated === '1');
              const text = m.content || m.text || '';
              const timeDisplay = m.created_at
                ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : (m.timestamp || 'Just now');

              return (
                <div
                  key={m.id}
                  style={{
                    background: isSystem ? '#f1f5f9' : isAgent ? '#eef2ff' : '#ffffff',
                    border: `1px solid ${isSystem ? '#e2e8f0' : isAgent ? '#c7d2fe' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontWeight: 700,
                        color: isAgent ? '#3730a3' : isSystem ? '#475569' : '#0f172a',
                        fontSize: '12px'
                      }}>
                        {m.sender}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: isSimulated ? '#fef3c7' : '#ecfdf5',
                        color: isSimulated ? '#b45309' : '#047857'
                      }}>
                        {isSimulated ? 'SIMULATED DEMO' : 'LIVE SWITCH EVENT'}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {timeDisplay}
                    </span>
                  </div>
                  <div style={{ color: '#334155', lineHeight: 1.4 }}>
                    {text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message Input Footer */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: '12px 14px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '8px',
              background: '#ffffff',
              borderBottomLeftRadius: '10px',
              borderBottomRightRadius: '10px'
            }}
          >
            <input
              type="text"
              placeholder={room ? "Send message to Switch room..." : "Associate a room first..."}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={!room || isSendingMessage}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!room || !inputMessage.trim() || isSendingMessage}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0 14px',
                cursor: !room || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                opacity: !room || !inputMessage.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Send size={14} />
            </button>
          </form>
        </div>

        {/* Right Column: Structured Proposals & Human-in-the-Loop Review Gate */}
        <div style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          height: '620px'
        }}>
          {/* Proposals Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitPullRequest size={16} color="#059669" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                Structured Change Proposals
              </span>
              <span style={{
                fontSize: '11px',
                color: '#047857',
                background: '#ecfdf5',
                padding: '1px 6px',
                borderRadius: '4px',
                fontWeight: 700
              }}>
                {proposals.length}
              </span>
            </div>

            <button
              onClick={fetchProposals}
              title="Refresh proposals"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}
            >
              <RefreshCw size={14} className={isProposalsLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Proposals List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {proposals.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b'
              }}>
                <GitMerge size={32} color="#cbd5e1" style={{ margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: '0 0 6px 0' }}>
                  No proposals submitted yet
                </h4>
                <p style={{ fontSize: '12px', margin: 0, maxWidth: '280px', marginInline: 'auto' }}>
                  When team consensus emerges in Switch discussions, the PMPilot agent formulates version-bound proposals for review here.
                </p>
                <button
                  onClick={handleSimulateDraftProposal}
                  style={{
                    marginTop: '16px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Generate Test Proposal
                </button>
              </div>
            ) : (
              proposals.map((prop) => {
                const isStale = prop.status === 'STALE' || (prop.status === 'PENDING' && prop.decision_version !== currentVersion);
                const isAccepted = prop.status === 'ACCEPTED';
                const isRejected = prop.status === 'REJECTED';
                const isPending = prop.status === 'PENDING' && !isStale;

                return (
                  <div
                    key={prop.id}
                    style={{
                      border: `1px solid ${isStale ? '#fde68a' : isAccepted ? '#a7f3d0' : isRejected ? '#fecaca' : '#cbd5e1'}`,
                      borderRadius: '8px',
                      background: isStale ? '#fffbeb' : isAccepted ? '#f0fdf4' : isRejected ? '#fef2f2' : '#ffffff',
                      padding: '14px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Status & Version Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: isStale ? '#fef3c7' : isAccepted ? '#dcfce7' : isRejected ? '#fee2e2' : '#e0e7ff',
                          color: isStale ? '#b45309' : isAccepted ? '#15803d' : isRejected ? '#b91c1c' : '#3730a3'
                        }}>
                          {isStale ? 'STALE VERSION' : prop.status}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#475569'
                        }}>
                          BOUND TO v{prop.decision_version}
                        </span>
                      </div>

                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        by {prop.proposed_by}
                      </span>
                    </div>

                    {/* Proposal Summary */}
                    <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                      {prop.summary}
                    </h5>

                    {/* Stale Warning Banner */}
                    {isStale && (
                      <div style={{
                        padding: '8px 10px',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#92400e',
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertTriangle size={14} />
                        <span>
                          <strong>Stale Proposal:</strong> Created against Decision v{prop.decision_version}, but current active decision is v{currentVersion}. Re-evaluation required.
                        </span>
                      </div>
                    )}

                    {/* Open Questions & Tradeoffs */}
                    {prop.open_questions && prop.open_questions.length > 0 && (
                      <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                        <span style={{ fontWeight: 600, color: '#475569' }}>Open Questions:</span>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#64748b' }}>
                          {prop.open_questions.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Proposed Changes Preview */}
                    {prop.proposed_changes && (
                      <div style={{
                        background: '#f8fafc',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#334155',
                        marginBottom: '12px'
                      }}>
                        {prop.proposed_changes.title && (
                          <div>+ Title: {prop.proposed_changes.title}</div>
                        )}
                        {prop.proposed_changes.hypothesis && (
                          <div>+ Hypothesis: {prop.proposed_changes.hypothesis}</div>
                        )}
                      </div>
                    )}

                    {/* Human Sign-off Action Bar */}
                    {isPending && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <button
                          onClick={() => handleRejectProposal(prop.id)}
                          disabled={isActionInProgress}
                          style={{
                            background: '#ffffff',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Reject
                        </button>

                        <button
                          onClick={() => handleApplyProposal(prop.id)}
                          disabled={isActionInProgress}
                          style={{
                            background: '#047857',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <GitMerge size={12} />
                          <span>Accept & Merge Proposal</span>
                        </button>
                      </div>
                    )}

                    {isAccepted && (
                      <div style={{
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <CheckCircle2 size={13} color={session?.approvalRecord?.status === 'APPROVED' ? '#15803d' : '#b45309'} />
                        {session?.approvalRecord?.status === 'APPROVED' && session?.approvalRecord?.approvedDecisionVersion === currentVersion ? (
                          <span style={{ color: '#15803d', fontWeight: 600 }}>
                            Merged into v{prop.decision_version + 1} · Decision v{currentVersion} is Approved by Human PM
                          </span>
                        ) : (
                          <span style={{ color: '#b45309', fontWeight: 600 }}>
                            Merged into v{prop.decision_version + 1} · Awaiting Human PM Approval at v{currentVersion} (Linear Export Locked)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Safe Context Modal */}
      {showSafeContextModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            width: '600px',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} color="#059669" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Safe Decision Briefing (Switch Context)
                </h3>
              </div>
              <button
                onClick={() => setShowSafeContextModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              PMPilot strips all internal credentials, API keys, and private tokens before synchronizing with Switch rooms:
            </p>

            <pre style={{
              background: '#0f172a',
              color: '#38bdf8',
              padding: '14px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {JSON.stringify(
                room?.shared_context || {
                  decisionId,
                  title: session?.title,
                  version: currentVersion,
                  status: session?.status,
                  hypothesis: session?.hypothesis || 'One-click guest checkout',
                  contradictions: (session?.conflicts || []).map(c => ({
                    id: c.id,
                    status: c.status,
                    severity: c.severity,
                    title: c.title
                  })),
                  redactedFields: [
                    'SWITCH_REGISTRATION_TOKEN',
                    'LINEAR_CLIENT_SECRET',
                    'INTEGRATION_ENCRYPTION_KEY',
                    'AUTH0_CLIENT_SECRET'
                  ]
                },
                null,
                2
              )}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setShowSafeContextModal(false)}
                style={{
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
