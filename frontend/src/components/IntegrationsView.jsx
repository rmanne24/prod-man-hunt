import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Info, ExternalLink, Shield, Plug, Unplug, Check, AlertTriangle, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function IntegrationsView({ onNavigateTo }) {
  const { token, isAuthenticated, activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id || 'ws_moonshot';
  const [hubStatus, setHubStatus] = useState(null);
  const [authConfig, setAuthConfig] = useState(null);
  const [linearStatus, setLinearStatus] = useState(null);
  const [switchPreflight, setSwitchPreflight] = useState(null);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchLinearStatus = useCallback(async () => {
    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/status`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLinearStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch Linear status:', err.message);
    }
  }, [token, workspaceId]);

  // Handle incoming Linear OAuth callback
  const handleLinearCallback = useCallback(async (code, state) => {
    setIsProcessing(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const redirectUri = `${window.location.origin}/`;
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/callback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, state, redirectUri })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: 'success',
          text: `Successfully connected Linear to workspace (${data.connection?.organizationName || 'Linear Org'})!`
        });
        fetchLinearStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: `Linear OAuth failed: ${data.error || 'Server rejected exchange'}`
        });
      }
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: `Linear callback network error: ${err.message}`
      });
    } finally {
      setIsProcessing(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token, workspaceId, fetchLinearStatus]);

  useEffect(() => {
    fetch('http://localhost:4000/api/hub/status')
      .then(res => res.json())
      .then(data => { if (data.success) setHubStatus(data); })
      .catch(err => console.warn('Could not fetch hub status:', err.message));

    fetch('http://localhost:4000/api/auth/config')
      .then(res => res.json())
      .then(data => { if (data.success) setAuthConfig(data); })
      .catch(err => console.warn('Could not fetch auth config:', err.message));

    fetch('http://localhost:4000/api/integrations/switch/preflight')
      .then(res => res.json())
      .then(data => { if (data.success) setSwitchPreflight(data.preflight); })
      .catch(err => console.warn('Could not fetch switch preflight:', err.message));

    fetchLinearStatus();

    // Check if returning from Linear OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const hasAuth0Verifier = Boolean(sessionStorage.getItem('pmpilot_pkce_verifier'));

    if (code && state && !hasAuth0Verifier) {
      handleLinearCallback(code, state);
    }
  }, [fetchLinearStatus, handleLinearCallback]);

  const handleConnectLinear = async () => {
    setActionMessage(null);
    if (!linearStatus?.configured) {
      setSelectedIntegration({ id: 'linear_setup' });
      return;
    }

    if (!isAuthenticated) {
      setActionMessage({
        type: 'error',
        text: 'Please sign in with a verified PM account before connecting workspace integrations.'
      });
      return;
    }

    try {
      setIsProcessing(true);
      const redirectUri = `${window.location.origin}/`;
      const res = await fetch(
        `http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      const data = await res.json();
      if (res.ok && data.success && data.url) {
        window.location.href = data.url;
      } else {
        setActionMessage({
          type: 'error',
          text: data.error || 'Could not initiate Linear authorization.'
        });
      }
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: `Network error: ${err.message}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectLinear = async () => {
    if (!confirm('Disconnect Linear integration from this workspace? Stored encrypted tokens will be deleted.')) {
      return;
    }

    try {
      setIsProcessing(true);
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/disconnect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage({
          type: 'success',
          text: 'Linear integration disconnected and tokens purged from database.'
        });
        fetchLinearStatus();
      } else {
        setActionMessage({
          type: 'error',
          text: data.error || 'Failed to disconnect.'
        });
      }
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: `Network error: ${err.message}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const apiKeys = hubStatus?.apiKeysStatus || {};
  const isLinearConnected = Boolean(linearStatus?.connected);

  const integrations = [
    {
      id: 'linear',
      name: 'Linear',
      mode: 'Downstream Delivery',
      status: isLinearConnected ? 'CONNECTED' : linearStatus?.configured ? 'READY_TO_CONNECT' : 'DEMO_ADAPTER',
      statusLabel: isLinearConnected
        ? `Connected (${linearStatus.connection?.organizationName || 'Linear Org'})`
        : linearStatus?.configured
          ? 'Ready to Connect'
          : 'Demo Mode (OAuth Unconfigured)',
      statusColor: isLinearConnected ? '#047857' : linearStatus?.configured ? '#2563eb' : '#0369a1',
      bgColor: isLinearConnected ? '#ecfdf5' : linearStatus?.configured ? '#eff6ff' : '#f0f9ff',
      borderColor: isLinearConnected ? '#a7f3d0' : linearStatus?.configured ? '#bfdbfe' : '#bae6fd',
      iconText: 'L',
      description: 'Downstream sprint ticket generation and epic linking. Exports require version-bound human PM approval.',
      configKey: 'LINEAR_CLIENT_ID & LINEAR_CLIENT_SECRET & INTEGRATION_ENCRYPTION_KEY',
      isLiveConnected: isLinearConnected,
      lastSync: isLinearConnected
        ? `Synced ${linearStatus.connection?.lastSyncedAt ? new Date(linearStatus.connection.lastSyncedAt).toLocaleTimeString() : 'Active'}`
        : 'Guarded mock delivery adapter',
      badge: 'DELIVERY'
    },
    {
      id: 'slack',
      name: 'Slack',
      mode: 'Notifications',
      status: apiKeys.slackWebhook ? 'CONNECTED' : 'DEMO_ADAPTER',
      statusLabel: apiKeys.slackWebhook ? 'Live Webhook' : 'Demo Adapter (Webhook Unconfigured)',
      statusColor: apiKeys.slackWebhook ? '#047857' : '#0369a1',
      bgColor: apiKeys.slackWebhook ? '#ecfdf5' : '#f0f9ff',
      borderColor: apiKeys.slackWebhook ? '#a7f3d0' : '#bae6fd',
      iconText: 'S',
      description: 'Broadcasts green-lit decision records and executive PRD digests to #product-announcements.',
      configKey: 'SLACK_WEBHOOK_URL',
      isLiveConnected: Boolean(apiKeys.slackWebhook),
      lastSync: 'Guarded mock delivery adapter',
      badge: 'NOTIFICATIONS'
    },
    {
      id: 'auth0',
      name: 'Auth0 Identity (OIDC)',
      mode: 'Enterprise SSO',
      status: authConfig?.auth0?.isConfigured ? 'CONNECTED' : 'UNCONFIGURED',
      statusLabel: authConfig?.auth0?.isConfigured ? 'OIDC SSO Active' : 'Unconfigured (Local SQLite Active)',
      statusColor: authConfig?.auth0?.isConfigured ? '#047857' : '#b45309',
      bgColor: authConfig?.auth0?.isConfigured ? '#ecfdf5' : '#fef3c7',
      borderColor: authConfig?.auth0?.isConfigured ? '#a7f3d0' : '#fde68a',
      iconText: 'A0',
      description: 'Authorization Code flow with PKCE and RS256 token validation against Auth0 JWKS endpoint.',
      configKey: 'AUTH0_DOMAIN & AUTH0_CLIENT_ID',
      isLiveConnected: Boolean(authConfig?.auth0?.isConfigured),
      lastSync: authConfig?.auth0?.isConfigured ? 'OIDC Discovery Ready' : 'Local cryptographic persistent store',
      badge: 'AUTHENTICATION'
    },
    {
      id: 'trigger',
      name: 'Trigger.dev',
      mode: 'Async Runner',
      status: 'LOCAL_FALLBACK',
      statusLabel: 'Local In-Memory Runner',
      statusColor: '#475569',
      bgColor: '#f8fafc',
      borderColor: '#e2e8f0',
      iconText: 'T',
      description: 'Background async job dispatcher running the multi-agent PRD generation and validation pipeline.',
      configKey: 'TRIGGER_SECRET_KEY',
      isLiveConnected: false,
      lastSync: 'Deterministic in-memory runner',
      badge: 'BACKGROUND JOBS'
    },
    {
      id: 'exa',
      name: 'Exa AI',
      mode: 'Competitor Search',
      status: apiKeys.exa ? 'CONNECTED' : 'MOCK_ENGINE',
      statusLabel: apiKeys.exa ? 'Live API Active' : 'Evaluator Mock Data',
      statusColor: apiKeys.exa ? '#047857' : '#475569',
      bgColor: apiKeys.exa ? '#ecfdf5' : '#f8fafc',
      borderColor: apiKeys.exa ? '#a7f3d0' : '#e2e8f0',
      iconText: 'E',
      description: 'Neural search engine powering real-time competitor feature matrix benchmarks and market data.',
      configKey: 'EXA_API_KEY',
      isLiveConnected: Boolean(apiKeys.exa),
      lastSync: 'Competitor comparison fixture',
      badge: 'MARKET RESEARCH'
    },
    {
      id: 'switch',
      name: 'Switch AI Collaboration',
      mode: 'Agent Protocol v1',
      status: switchPreflight?.status || 'UNCONFIGURED',
      statusLabel: switchPreflight?.status === 'CONNECTED'
        ? 'Connected & Reachable'
        : switchPreflight?.status === 'CONFIGURED'
          ? 'Reachable (Server Online)'
          : switchPreflight?.status === 'UNREACHABLE'
            ? 'Server Unreachable (Offline)'
            : 'Unconfigured (Local Server)',
      statusColor: switchPreflight?.status === 'CONNECTED' ? '#047857' : switchPreflight?.reachable ? '#0284c7' : switchPreflight?.status === 'UNREACHABLE' ? '#b91c1c' : '#b45309',
      bgColor: switchPreflight?.status === 'CONNECTED' ? '#ecfdf5' : switchPreflight?.reachable ? '#f0f9ff' : switchPreflight?.status === 'UNREACHABLE' ? '#fef2f2' : '#fef3c7',
      borderColor: switchPreflight?.status === 'CONNECTED' ? '#a7f3d0' : switchPreflight?.reachable ? '#bae6fd' : switchPreflight?.status === 'UNREACHABLE' ? '#fecaca' : '#fde68a',
      iconText: 'SW',
      description: 'Official Switch Agent Protocol v1. Connects decisions to live Switch chat rooms, syncs safe decision context, and drafts version-bound proposals for human PM review.',
      configKey: 'SWITCH_SERVER_URL & SWITCH_REGISTRATION_TOKEN',
      isLiveConnected: switchPreflight?.status === 'CONNECTED',
      lastSync: switchPreflight?.reachable ? 'HTTP Operations + SSE / WebSocket Stream' : 'Switch server probe failed or not running',
      badge: 'OFFICIAL SPONSOR'
    }
  ];

  const liveConnectedCount = integrations.filter(i => i.isLiveConnected).length;
  const adapterCount = integrations.filter(i => !i.isLiveConnected && i.status !== 'PLANNED').length;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Integrations & Service Connections
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Connected Tools & APIs
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Inspect connection health, OAuth credentials, and downstream ticket dispatch destinations.
          </p>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '6px',
          background: liveConnectedCount > 0 ? '#ecfdf5' : '#f8fafc',
          border: `1px solid ${liveConnectedCount > 0 ? '#a7f3d0' : '#e2e8f0'}`,
          fontSize: '12px',
          fontWeight: 600,
          color: liveConnectedCount > 0 ? '#047857' : '#475569'
        }}>
          {liveConnectedCount > 0 ? (
            <CheckCircle2 size={14} color="#059669" />
          ) : (
            <Info size={14} color="#64748b" />
          )}
          <span>{liveConnectedCount} External Services Connected · {adapterCount} Evaluator Adapters</span>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: actionMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${actionMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: actionMessage.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Honest Status Callout */}
      <div style={{
        padding: '14px 18px',
        borderRadius: '8px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Shield size={18} color="#0f172a" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
          <strong style={{ color: '#0f172a' }}>Connection Transparency & OAuth Safeguards:</strong>
          <br />
          No external app is displayed as connected unless genuine credentials or OAuth tokens have been verified.
          Linear tokens are encrypted with <strong>AES-256-GCM</strong> using a dedicated encryption key.
          Downstream Linear and Slack exports require explicit human PM approval at the active decision version before any issue creation dispatch.
        </div>
      </div>

      {/* Integrations Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '20px',
        marginBottom: '28px'
      }}>
        {integrations.map((item) => (
          <div
            key={item.id}
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700
                  }}>
                    {item.iconText}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {item.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {item.badge}
                    </div>
                  </div>
                </div>

                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: item.bgColor,
                  color: item.statusColor,
                  border: `1px solid ${item.borderColor}`
                }}>
                  {item.statusLabel}
                </span>
              </div>

              <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginBottom: '16px' }}>
                {item.description}
              </p>
            </div>

            <div>
              {item.id === 'linear' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {isLinearConnected ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        fontSize: '12px',
                        color: '#065f46',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Check size={14} color="#059669" />
                        <span>Connected to {linearStatus.connection?.organizationName}</span>
                      </div>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleDisconnectLinear}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '6px',
                          background: '#ffffff',
                          border: '1px solid #fecaca',
                          color: '#dc2626',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Unplug size={13} />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleConnectLinear}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: linearStatus?.configured ? '#0f172a' : '#f1f5f9',
                          border: `1px solid ${linearStatus?.configured ? '#0f172a' : '#cbd5e1'}`,
                          color: linearStatus?.configured ? '#ffffff' : '#475569',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plug size={13} />
                        <span>{linearStatus?.configured ? 'Connect Linear (OAuth 2.0)' : 'Connect Linear (Setup Required)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIntegration({ id: 'linear_arch' })}
                        title="View Architecture Details"
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          color: '#64748b',
                          cursor: 'pointer'
                        }}
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {item.id === 'switch' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateTo) onNavigateTo('switch');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#4338ca',
                      border: '1px solid #4338ca',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <MessageSquare size={13} />
                    <span>Open Collaboration Room</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIntegration({ id: 'switch_specs' })}
                    title="View Switch Protocol Specs"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              )}

              <div style={{
                paddingTop: '12px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11.5px',
                color: '#64748b'
              }}>
                <div>
                  <code>{item.configKey}</code>
                </div>
                <div>
                  {item.lastSync}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Linear Setup Requirements or Architecture Details */}
      {selectedIntegration && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 999
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            maxWidth: '560px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  {selectedIntegration.id === 'linear_setup'
                    ? 'Linear OAuth 2.0 Setup Guide'
                    : selectedIntegration.id === 'switch_specs'
                      ? 'Switch Agent Protocol Architecture'
                      : 'Linear Integration Architecture'}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  {selectedIntegration.id === 'linear_setup'
                    ? 'Required environment variables to connect live Linear workspace'
                    : selectedIntegration.id === 'switch_specs'
                      ? 'Official Switch wire contracts, safe context briefings, and version-bound proposals'
                      : 'AES-256-GCM token vault, PKCE state verification, and guarded issue creation'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIntegration(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {selectedIntegration.id === 'linear_setup' ? (
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#fef3c7', borderRadius: '6px', border: '1px solid #fde68a', color: '#92400e', fontSize: '12px' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>Linear OAuth credentials are not configured in your backend environment.</span>
                </div>

                {/* Preflight Variable Checklist */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
                    Environment Preflight Status
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    {[
                      { name: 'LINEAR_CLIENT_ID', label: 'Linear Client ID' },
                      { name: 'LINEAR_CLIENT_SECRET', label: 'Linear Client Secret' },
                      { name: 'INTEGRATION_ENCRYPTION_KEY', label: 'Token Key (64 hex characters / 32 bytes)' }
                    ].map(item => {
                      const v = linearStatus?.preflight?.variables?.[item.name];
                      const isValid = Boolean(v?.valid);
                      const isPresent = Boolean(v?.present);
                      return (
                        <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <code style={{ fontSize: '11px', color: '#0f172a', fontWeight: 600 }}>{item.name}</code>
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({item.label})</span>
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: isValid ? '#dcfce7' : isPresent ? '#fee2e2' : '#f1f5f9',
                            color: isValid ? '#15803d' : isPresent ? '#b91c1c' : '#64748b'
                          }}>
                            {isValid ? 'VALID' : isPresent ? 'MALFORMED' : 'MISSING'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p style={{ margin: 0 }}>
                  To enable genuine live Linear issue creation, register an OAuth application in the <strong>Linear Developer Settings</strong> and configure these variables in <code>backend/.env</code>:
                </p>

                <pre style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#0f172a',
                  overflowX: 'auto',
                  margin: 0
                }}>
{`LINEAR_CLIENT_ID=your-linear-client-id
LINEAR_CLIENT_SECRET=your-linear-client-secret
INTEGRATION_ENCRYPTION_KEY=64-char-hex-string-for-aes-256-gcm`}
                </pre>

                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                  In your Linear Application settings, register this Redirect URI:
                  <br />
                  <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#0f172a' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://127.0.0.1:5173/'}
                  </code>
                </div>
              </div>
            ) : selectedIntegration.id === 'switch_specs' ? (
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>1. Official Wire Protocol:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Follows Switch Agent Protocol v1: <code>POST /agents</code> for registration, <code>POST /agents/{'{agent_id}'}/ops/create_room</code> for synchronous room creation, <code>POST /agents/{'{agent_id}'}/message</code> for messaging, and SSE / WebSocket streams for events.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>2. Safe Context Briefing & Redaction:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Internal API tokens, secrets, encryption keys, and private hashes are strictly stripped before context is broadcast to the Switch room.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>3. Decision-Version Bound Proposals:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Proposals from Switch discussions are bound to <code>decision.version</code>. If the decision changes before review, older proposals are rejected as <code>STALE</code>.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>4. Human PM Gate & Linear Lock:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Switch agents cannot self-merge changes. A human PM must explicitly click <em>Accept & Merge</em>, which increments the decision version, invalidates prior approvals, and re-locks downstream Linear export.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>1. Scope & Tenant Isolation:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Connections are scoped to <code>workspace_id</code> in SQLite (<code>integration_connections</code>). One active connection per workspace, managed by verified PMs.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>2. AES-256-GCM Token Encryption:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Tokens are encrypted using <strong>AES-256-GCM</strong> with unique 96-bit IVs and 128-bit authentication tags per token. Tokens are never exposed to client-side storage.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#0f172a' }}>3. Guarded Delivery Export:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    Downstream issue creation is strictly locked until explicit human PM approval is committed for the active decision version. Rechecked immediately before dispatch.
                  </p>
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedIntegration(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
