import React, { useState, useEffect, useCallback } from 'react';
import {
  Plug,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  Check,
  Eye,
  EyeOff,
  Power,
  Sparkles,
  RotateCw,
  Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import IntegrationWizardModal from './IntegrationWizardModal.jsx';
import EvidenceReviewModal from './EvidenceReviewModal.jsx';

export default function IntegrationsView({ onNavigateTo }) {
  const { token, isAuthenticated, activeWorkspace, isDemoMode } = useAuth();
  const workspaceId = activeWorkspace?.id || 'ws_moonshot';

  // State: Core Integrations
  const [linearStatus, setLinearStatus] = useState(null);
  const [slackStatus, setSlackStatus] = useState(null);
  const [switchPreflight, setSwitchPreflight] = useState(null);
  const [integrationsSummary, setIntegrationsSummary] = useState(null);

  // State: Custom Integrations
  const [customIntegrations, setCustomIntegrations] = useState([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState(false);

  // State: Wizards & Evidence Inspector
  const [activeWizard, setActiveWizard] = useState(null);
  const [isEvidenceReviewOpen, setIsEvidenceReviewOpen] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState(null);

  // State: UI & Modals
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, CORE, COLLAB, DESIGN, CUSTOM, COMING_SOON
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState(null); // 'linear', 'slack', 'switch', 'custom_api', 'custom_webhook', 'coming_soon'
  const [selectedComingSoon, setSelectedComingSoon] = useState(null);
  const [editingCustomItem, setEditingCustomItem] = useState(null);

  // State: Actions & Feedback
  const [actionAlert, setActionAlert] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Form State: Slack
  const [slackForm, setSlackForm] = useState({
    webhookUrl: '',
    channel: '#product-announcements',
    teamName: 'Product Team Slack'
  });

  // Form State: Custom API
  const [apiForm, setApiForm] = useState({
    name: '',
    description: '',
    url: '',
    authType: 'BEARER',
    authHeaderName: 'X-API-Key',
    secret: '',
    customHeaders: ''
  });
  const [showApiSecret, setShowApiSecret] = useState(false);

  // Form State: Custom Webhook
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    description: '',
    url: '',
    events: ['decision.approved', 'proposal.accepted'],
    signingSecret: ''
  });

  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (isDemoMode) headers['X-PMPilot-Demo'] = 'true';
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
    return headers;
  }, [token, isDemoMode, workspaceId]);

  // 1. Fetch Linear Status
  const fetchLinearStatus = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/status`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setLinearStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch Linear status:', err.message);
    }
  }, [workspaceId, getHeaders]);

  // 2. Fetch Slack Status
  const fetchSlackStatus = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/slack/status`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSlackStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch Slack status:', err.message);
    }
  }, [workspaceId, getHeaders]);

  // 3. Fetch Switch Preflight Health
  const fetchSwitchStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4000/api/integrations/switch/preflight');
      if (res.ok) {
        const data = await res.json();
        setSwitchPreflight(data.preflight);
      }
    } catch (err) {
      console.warn('Could not fetch Switch status:', err.message);
    }
  }, []);

  // 4. Fetch Custom Integrations
  const fetchCustomIntegrations = useCallback(async () => {
    if (!token && !isDemoMode) return;
    setIsLoadingCustom(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setCustomIntegrations(data.integrations || []);
      }
    } catch (err) {
      console.warn('Could not fetch custom integrations:', err.message);
    } finally {
      setIsLoadingCustom(false);
    }
  }, [workspaceId, token, isDemoMode, getHeaders]);

  // Handlers: Linear
  const handleLinearCallback = useCallback(async (code, state) => {
    setIsProcessing(true);
    try {
      const redirectUri = `${window.location.origin}/`;
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/callback`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ code, state, redirectUri })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `Successfully connected Linear to workspace (${data.connection?.organizationName || 'Linear Org'})!`
        });
        fetchLinearStatus();
      } else {
        setActionAlert({
          type: 'error',
          text: `Linear OAuth failed: ${data.error || 'Server rejected token exchange.'}`
        });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Linear network error: ${err.message}` });
    } finally {
      setIsProcessing(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [workspaceId, getHeaders, fetchLinearStatus]);

  // Fetch Integrations Summary across all providers
  const fetchIntegrationsSummary = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/summary`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.integrations) {
          setIntegrationsSummary(data.integrations);
          if (data.integrations.linear) setLinearStatus(data.integrations.linear);
          if (data.integrations.slack) setSlackStatus(data.integrations.slack);
        }
      }
    } catch (err) {
      console.warn('Could not fetch integrations summary:', err.message);
    }
  }, [workspaceId, getHeaders]);

  // Sync Now action for any connected provider
  const handleSyncNow = useCallback(async (providerId) => {
    setSyncingProvider(providerId);
    try {
      let endpoint = '';
      if (providerId === 'google_drive') endpoint = 'google-drive';
      else if (providerId === 'github') endpoint = 'github';
      else if (providerId === 'notion') endpoint = 'notion';
      else if (providerId === 'jira') endpoint = 'jira';
      else if (providerId === 'figma') endpoint = 'figma';
      else if (providerId === 'productboard') endpoint = 'productboard';

      if (!endpoint) return;

      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/${endpoint}/sync`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ incremental: true })
      });
      const data = await res.json();
      if (res.ok) {
        setActionAlert({
          type: 'success',
          text: `Successfully synced ${data.importedCount !== undefined ? `${data.importedCount} records from ` : ''}${providerId.replace('_', ' ').toUpperCase()}.`
        });
        fetchIntegrationsSummary();
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Sync failed.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Sync network error: ${err.message}` });
    } finally {
      setSyncingProvider(null);
    }
  }, [workspaceId, getHeaders, fetchIntegrationsSummary]);

  // Disconnect any provider
  const handleDisconnectProvider = useCallback(async (providerId, providerDisplayName) => {
    if (!window.confirm(`Are you sure you want to disconnect ${providerDisplayName}?`)) return;
    setIsProcessing(true);
    try {
      let endpoint = '';
      if (providerId === 'google_drive') endpoint = 'google-drive';
      else if (providerId === 'github') endpoint = 'github';
      else if (providerId === 'notion') endpoint = 'notion';
      else if (providerId === 'jira') endpoint = 'jira';
      else if (providerId === 'figma') endpoint = 'figma';
      else if (providerId === 'productboard') endpoint = 'productboard';

      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/${endpoint}/disconnect`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        setActionAlert({
          type: 'success',
          text: `${providerDisplayName} disconnected successfully.`
        });
        fetchIntegrationsSummary();
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [workspaceId, getHeaders, fetchIntegrationsSummary]);

  // Initial load
  useEffect(() => {
    fetchIntegrationsSummary();
    fetchLinearStatus();
    fetchSlackStatus();
    fetchSwitchStatus();
    fetchCustomIntegrations();

    // Check if returning from Linear OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const hasAuth0Verifier = Boolean(sessionStorage.getItem('pmpilot_pkce_verifier'));

    if (code && state && !hasAuth0Verifier) {
      handleLinearCallback(code, state);
    }
  }, [fetchIntegrationsSummary, fetchLinearStatus, fetchSlackStatus, fetchSwitchStatus, fetchCustomIntegrations, handleLinearCallback]);

  const handleConnectLinear = async () => {
    if (!isAuthenticated && !isDemoMode) {
      setActionAlert({ type: 'error', text: 'Please sign in to connect workspace integrations.' });
      return;
    }
    setIsProcessing(true);
    try {
      const redirectUri = `${window.location.origin}/`;
      const res = await fetch(
        `http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}`,
        { headers: getHeaders() }
      );
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        window.location.href = data.url;
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Could not initiate Linear authorization.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: `Linear authorization error: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectLinear = async () => {
    if (!confirm('Disconnect Linear integration from this workspace? Encrypted tokens will be wiped.')) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/linear/disconnect`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({ type: 'success', text: 'Linear integration disconnected.' });
        fetchLinearStatus();
        setActiveModal(null);
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Failed to disconnect Linear.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Handlers: Slack ---
  const handleConnectSlack = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setTestResult(null);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/slack/connect`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(slackForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({ type: 'success', text: 'Slack webhook successfully verified and connected!' });
        fetchSlackStatus();
        setActiveModal(null);
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Failed to connect Slack.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestSlack = async () => {
    setIsProcessing(true);
    setTestResult(null);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/slack/test`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || 'Test notification delivered to Slack!' });
        fetchSlackStatus();
      } else {
        setTestResult({ success: false, error: data.error || 'Slack test failed.' });
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectSlack = async () => {
    if (!confirm('Disconnect Slack integration from this workspace?')) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/slack/disconnect`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({ type: 'success', text: 'Slack integration disconnected.' });
        fetchSlackStatus();
        setActiveModal(null);
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Handlers: Custom Integrations ---
  const handleSaveCustomApi = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      let customHeadersObj = {};
      if (apiForm.customHeaders.trim()) {
        try {
          customHeadersObj = JSON.parse(apiForm.customHeaders);
        } catch {
          alert('Custom headers must be a valid JSON object.');
          setIsProcessing(false);
          return;
        }
      }

      const payload = {
        name: apiForm.name,
        description: apiForm.description,
        type: 'CUSTOM_API',
        url: apiForm.url,
        authType: apiForm.authType,
        authHeaderName: apiForm.authHeaderName,
        secret: apiForm.secret,
        customHeaders: customHeadersObj
      };

      const url = editingCustomItem
        ? `http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom/${editingCustomItem.id}`
        : `http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom`;

      const method = editingCustomItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `Custom API "${data.integration.name}" successfully ${editingCustomItem ? 'updated' : 'configured'}!`
        });
        fetchCustomIntegrations();
        setActiveModal(null);
        setEditingCustomItem(null);
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Failed to save Custom API integration.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveCustomWebhook = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const payload = {
        name: webhookForm.name,
        description: webhookForm.description,
        type: 'CUSTOM_WEBHOOK',
        url: webhookForm.url,
        events: webhookForm.events,
        signingSecret: webhookForm.signingSecret
      };

      const url = editingCustomItem
        ? `http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom/${editingCustomItem.id}`
        : `http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom`;

      const method = editingCustomItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActionAlert({
          type: 'success',
          text: `Custom Webhook "${data.integration.name}" successfully ${editingCustomItem ? 'updated' : 'configured'}!`
        });
        fetchCustomIntegrations();
        setActiveModal(null);
        setEditingCustomItem(null);
      } else {
        setActionAlert({ type: 'error', text: data.error || 'Failed to save Custom Webhook.' });
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestCustomItem = async (itemId) => {
    setIsProcessing(true);
    setTestResult(null);
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom/${itemId}/test`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Endpoint verified (HTTP ${data.result.httpStatus} ${data.result.statusText}) in ${data.result.durationMs}ms.`
        });
        fetchCustomIntegrations();
      } else {
        setTestResult({
          success: false,
          error: data.error || data.result?.error || 'Integration test failed.'
        });
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleCustomItem = async (itemId, currentEnabled) => {
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom/${itemId}/toggle`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ isEnabled: !currentEnabled })
      });
      if (res.ok) fetchCustomIntegrations();
    } catch (err) {
      console.warn('Toggle failed:', err.message);
    }
  };

  const handleDeleteCustomItem = async (itemId, itemName) => {
    if (!confirm(`Delete custom integration "${itemName}"?`)) return;
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${workspaceId}/integrations/custom/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        setActionAlert({ type: 'success', text: `Deleted custom integration "${itemName}".` });
        fetchCustomIntegrations();
      }
    } catch (err) {
      setActionAlert({ type: 'error', text: err.message });
    }
  };

  // --- Integration Catalog Definition ---
  const isLinearConnected = Boolean(linearStatus?.connected);
  const isSlackConnected = Boolean(slackStatus?.connected);
  const isSwitchConnected = switchPreflight?.status === 'CONNECTED';

  const gdriveStatus = integrationsSummary?.googleDrive;
  const isGdriveConnected = Boolean(gdriveStatus?.connected);

  const githubStatus = integrationsSummary?.github;
  const isGithubConnected = Boolean(githubStatus?.connected);

  const notionStatus = integrationsSummary?.notion;
  const isNotionConnected = Boolean(notionStatus?.connected);

  const jiraStatus = integrationsSummary?.jira;
  const isJiraConnected = Boolean(jiraStatus?.connected);

  const figmaStatus = integrationsSummary?.figma;
  const isFigmaConnected = Boolean(figmaStatus?.connected);

  const pbStatus = integrationsSummary?.productboard;
  const isPbConnected = Boolean(pbStatus?.connected);

  const coreIntegrations = [
    {
      id: 'linear',
      name: 'Linear',
      category: 'CORE',
      badge: 'DELIVERY',
      logoText: 'L',
      logoBg: '#5e6ad2',
      tagline: 'Downstream issue tracking & engineering epic delivery',
      description: 'Export version-approved decision specifications directly to Linear issues, sub-issues, and engineering epics with human PM gates.',
      status: isLinearConnected ? 'CONNECTED' : (linearStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isLinearConnected ? 'Connected' : (linearStatus?.configured ? 'Not connected' : 'Configuration required'),
      connectedDetails: isLinearConnected ? linearStatus.connection?.organizationName : null,
      isAvailable: true,
      onManage: () => {
        setTestResult(null);
        setActiveModal('linear');
      }
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'COLLAB',
      badge: 'DISCUSSIONS',
      logoText: '#',
      logoBg: '#4a154b',
      tagline: 'Team decision broadcasts & asynchronous feedback',
      description: 'Notify product channels when decisions reach approval, broadcast contradictions, and collect stakeholder feedback.',
      status: isSlackConnected ? 'CONNECTED' : 'NOT_CONNECTED',
      statusLabel: isSlackConnected ? 'Connected' : 'Not connected',
      connectedDetails: isSlackConnected ? `${slackStatus.connection?.organizationName} (${slackStatus.connection?.channel})` : null,
      isAvailable: true,
      onManage: () => {
        setTestResult(null);
        if (isSlackConnected) {
          setSlackForm({
            webhookUrl: '',
            channel: slackStatus.connection?.channel || '#product-announcements',
            teamName: slackStatus.connection?.organizationName || 'Slack Workspace'
          });
        }
        setActiveModal('slack');
      }
    },
    {
      id: 'switch',
      name: 'Switch AI Collaboration',
      category: 'COLLAB',
      badge: 'OFFICIAL SPONSOR',
      logoText: 'SW',
      logoBg: '#0f766e',
      tagline: 'Live Switch rooms & structured proposal drafts',
      description: 'Sync canonical decision context into collaborative Switch agent rooms and merge version-bound proposals with PM approval.',
      status: isSwitchConnected ? 'CONNECTED' : (switchPreflight?.reachable ? 'NOT_CONNECTED' : 'OFFLINE'),
      statusLabel: isSwitchConnected ? 'Connected' : (switchPreflight?.reachable ? 'Reachable (Server Online)' : 'Server unreachable (Optional)'),
      connectedDetails: isSwitchConnected ? 'Protocol v1 Ready' : null,
      isAvailable: true,
      onManage: () => {
        setTestResult(null);
        setActiveModal('switch');
      }
    },
    {
      id: 'google_drive',
      name: 'Google Drive & Docs',
      category: 'COLLAB',
      badge: 'WORKSPACE & DOCS',
      logoText: 'G',
      logoBg: '#34a853',
      tagline: 'Ingest research transcripts & PRD documents',
      description: 'Extract plain-text and structured content from Google Docs and Drive folders into reviewable decision signals with timestamp preservation.',
      status: isGdriveConnected ? 'CONNECTED' : (gdriveStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isGdriveConnected ? 'Connected' : (gdriveStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isGdriveConnected ? gdriveStatus.connection?.organizationName : null,
      importedCount: gdriveStatus?.importedCount || 0,
      lastSyncedAt: gdriveStatus?.connection?.lastSyncedAt,
      selectedResources: gdriveStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'GOOGLE_DRIVE',
          providerName: 'Google Drive & Docs',
          logoText: 'G',
          logoBg: '#34a853',
          connection: gdriveStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('google_drive'),
      onDisconnect: () => handleDisconnectProvider('google_drive', 'Google Drive & Docs')
    },
    {
      id: 'github',
      name: 'GitHub',
      category: 'CORE',
      badge: 'VERSION CONTROL',
      logoText: 'GH',
      logoBg: '#24292e',
      tagline: 'Link architectural decisions to Pull Requests & Issues',
      description: 'Track PR merge status, commit hashes, and detect discrepancies between approved specifications and code.',
      status: isGithubConnected ? 'CONNECTED' : (githubStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isGithubConnected ? 'Connected' : (githubStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isGithubConnected ? githubStatus.connection?.organizationName : null,
      importedCount: githubStatus?.importedCount || 0,
      lastSyncedAt: githubStatus?.connection?.lastSyncedAt,
      selectedResources: githubStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'GITHUB',
          providerName: 'GitHub',
          logoText: 'GH',
          logoBg: '#24292e',
          connection: githubStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('github'),
      onDisconnect: () => handleDisconnectProvider('github', 'GitHub')
    },
    {
      id: 'notion',
      name: 'Notion',
      category: 'COLLAB',
      badge: 'DOCUMENTATION',
      logoText: 'N',
      logoBg: '#000000',
      tagline: 'Bi-directional PRD sync & product documentation',
      description: 'Import product requirements into evidence and publish human-approved PRDs directly into team Notion databases with strict approval guards.',
      status: isNotionConnected ? 'CONNECTED' : (notionStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isNotionConnected ? 'Connected' : (notionStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isNotionConnected ? notionStatus.connection?.organizationName : null,
      importedCount: notionStatus?.importedCount || 0,
      lastSyncedAt: notionStatus?.connection?.lastSyncedAt,
      selectedResources: notionStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'NOTION',
          providerName: 'Notion',
          logoText: 'N',
          logoBg: '#000000',
          connection: notionStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('notion'),
      onDisconnect: () => handleDisconnectProvider('notion', 'Notion')
    },
    {
      id: 'jira',
      name: 'Jira Software',
      category: 'CORE',
      badge: 'ISSUE TRACKING',
      logoText: 'J',
      logoBg: '#0052cc',
      tagline: 'Enterprise Atlassian sprint & epic delivery',
      description: 'Push human-approved specifications into Jira epics and stories with strict approval & version guards.',
      status: isJiraConnected ? 'CONNECTED' : (jiraStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isJiraConnected ? 'Connected' : (jiraStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isJiraConnected ? jiraStatus.connection?.organizationName : null,
      importedCount: jiraStatus?.importedCount || 0,
      lastSyncedAt: jiraStatus?.connection?.lastSyncedAt,
      selectedResources: jiraStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'JIRA',
          providerName: 'Jira Software',
          logoText: 'J',
          logoBg: '#0052cc',
          connection: jiraStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('jira'),
      onDisconnect: () => handleDisconnectProvider('jira', 'Jira Software')
    },
    {
      id: 'figma',
      name: 'Figma',
      category: 'DESIGN',
      badge: 'DESIGN SPEC',
      logoText: 'F',
      logoBg: '#f24e1e',
      tagline: 'Anchor design frame annotations to evidence graphs',
      description: 'Import canvas frame hierarchies and critique comments into decision contradiction graphs.',
      status: isFigmaConnected ? 'CONNECTED' : (figmaStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isFigmaConnected ? 'Connected' : (figmaStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isFigmaConnected ? figmaStatus.connection?.organizationName : null,
      importedCount: figmaStatus?.importedCount || 0,
      lastSyncedAt: figmaStatus?.connection?.lastSyncedAt,
      selectedResources: figmaStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'FIGMA',
          providerName: 'Figma',
          logoText: 'F',
          logoBg: '#f24e1e',
          connection: figmaStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('figma'),
      onDisconnect: () => handleDisconnectProvider('figma', 'Figma')
    },
    {
      id: 'productboard',
      name: 'Productboard',
      category: 'DESIGN',
      badge: 'CUSTOMER INSIGHTS',
      logoText: 'PB',
      logoBg: '#1877f2',
      tagline: 'Customer feedback notes & feature prioritization matrix',
      description: 'Ingest customer feedback trends, verbatim quotes, and strategic feature opportunities directly into trade-off models.',
      status: isPbConnected ? 'CONNECTED' : (pbStatus?.configured ? 'NOT_CONNECTED' : 'CONFIG_REQUIRED'),
      statusLabel: isPbConnected ? 'Connected' : (pbStatus?.configured ? 'Not connected' : 'Available to Connect'),
      connectedDetails: isPbConnected ? pbStatus.connection?.organizationName : null,
      importedCount: pbStatus?.importedCount || 0,
      lastSyncedAt: pbStatus?.connection?.lastSyncedAt,
      selectedResources: pbStatus?.connection?.selectedResources,
      isAvailable: true,
      onManage: () => {
        setActiveWizard({
          provider: 'PRODUCTBOARD',
          providerName: 'Productboard',
          logoText: 'PB',
          logoBg: '#1877f2',
          connection: pbStatus?.connection
        });
      },
      onSyncNow: () => handleSyncNow('productboard'),
      onDisconnect: () => handleDisconnectProvider('productboard', 'Productboard')
    }
  ];

  const customIntegrationTemplates = [
    {
      id: 'custom_api',
      name: 'Custom REST API',
      category: 'CUSTOM',
      badge: 'DEVELOPER API',
      logoText: 'API',
      logoBg: '#0f172a',
      tagline: 'Connect external microservices & telemetry signals',
      description: 'Configure workspace-scoped REST endpoints with Bearer tokens, API keys, or custom headers to ingest telemetry and product evidence.',
      onAdd: () => {
        setEditingCustomItem(null);
        setApiForm({
          name: '',
          description: '',
          url: '',
          authType: 'BEARER',
          authHeaderName: 'X-API-Key',
          secret: '',
          customHeaders: ''
        });
        setTestResult(null);
        setActiveModal('custom_api');
      }
    },
    {
      id: 'custom_webhook',
      name: 'Custom Webhook',
      category: 'CUSTOM',
      badge: 'EVENT STREAM',
      logoText: 'WH',
      logoBg: '#1e293b',
      tagline: 'Publish HMAC-signed decision lifecycle events',
      description: 'Stream real-time cryptographic webhook payloads to Zapier, Datadog, or downstream services on decision approval or mutation.',
      onAdd: () => {
        setEditingCustomItem(null);
        const secretCandidate = 'whsec_' + (window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, '') : 'sec' + Date.now());
        setWebhookForm({
          name: '',
          description: '',
          url: '',
          events: ['decision.approved', 'proposal.accepted'],
          signingSecret: secretCandidate
        });
        setTestResult(null);
        setActiveModal('custom_webhook');
      }
    }
  ];

  const comingSoonIntegrations = [
    {
      id: 'miro',
      name: 'Miro',
      category: 'DESIGN',
      badge: 'COMING SOON',
      logoText: 'M',
      logoBg: '#ffd02f',
      tagline: 'Visual user journey & systems architecture boards',
      description: 'Sync customer journey mapping canvases and architectural whiteboards directly into decision problem contexts.',
      plannedCapabilities: [
        'Associate Miro frame sticky notes directly with decision constraints',
        'Export decision specification flowcharts to Miro boards',
        'Notify visual designers when technical requirements change'
      ]
    },
    {
      id: 'amplitude',
      name: 'Amplitude',
      category: 'CORE',
      badge: 'COMING SOON',
      logoText: 'AMP',
      logoBg: '#1e61f2',
      tagline: 'Product telemetry & retention cohort signals',
      description: 'Ingest funnel conversion drop-off cohorts and feature retention analytics as automated telemetry signals.',
      plannedCapabilities: [
        'Sync checkout conversion drop-off funnels into contradiction models',
        'Attach behavioral user cohorts as quantitative evidence signals',
        'Automatic alert when drop-off exceeds statistical thresholds'
      ]
    },
    {
      id: 'segment',
      name: 'Segment',
      category: 'CORE',
      badge: 'COMING SOON',
      logoText: 'SEG',
      logoBg: '#52bd95',
      tagline: 'Customer Data Platform & live event stream',
      description: 'Stream cross-platform user interaction events and cart checkout funnels directly into evidence pools.',
      plannedCapabilities: [
        'Stream real-time checkout abandonment events into decision signals',
        'Identify conflicting user behaviors across web and mobile platforms',
        'Map user journey events to decision options'
      ]
    }
  ];

  // Filter logic
  const filteredCore = coreIntegrations.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'ALL') return true;
    if (activeTab === 'CONNECTED') return item.status === 'CONNECTED';
    if (activeTab === 'CUSTOM') return item.category === 'CUSTOM';
    return item.category === activeTab;
  });

  const filteredComingSoon = comingSoonIntegrations.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'CONNECTED') return false;
    if (activeTab === 'CUSTOM') return false;
    if (activeTab === 'ALL' || activeTab === 'COMING_SOON') return true;
    return item.category === activeTab;
  });

  const filteredCustomTemplates = customIntegrationTemplates.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'CONNECTED') return false;
    if (activeTab === 'COMING_SOON') return false;
    if (activeTab === 'ALL' || activeTab === 'CUSTOM') return true;
    return item.category === activeTab;
  });

  const connectedList = coreIntegrations.filter(i => i.status === 'CONNECTED');
  const totalConnectedCount = connectedList.length + customIntegrations.length;

  return (
    <div style={{ padding: '32px 40px', maxWidth: '1280px', margin: '0 auto', width: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* 1. Header & Actions */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Workspace: {activeWorkspace?.name || 'My Workspace'}
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Integrations
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', marginBottom: 0 }}>
            Connect your team's tools to PMPilot. Export specifications to project delivery tools and stream decision events.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsEvidenceReviewOpen(true)}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Database size={15} color="#2563eb" />
            <span>Evidence Repository</span>
            {integrationsSummary?.totalImportedRecords > 0 && (
              <span style={{
                background: '#2563eb',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {integrationsSummary.totalImportedRecords}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setEditingCustomItem(null);
              setApiForm({ name: '', description: '', url: '', authType: 'BEARER', authHeaderName: 'X-API-Key', secret: '', customHeaders: '' });
              setTestResult(null);
              setActiveModal('custom_api');
            }}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: '#0f172a',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Plus size={15} />
            <span>Add Custom Integration</span>
          </button>
        </div>
      </div>

      {/* 2. Notification Banner */}
      {actionAlert && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          background: actionAlert.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${actionAlert.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: actionAlert.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{actionAlert.text}</span>
          <button
            onClick={() => setActionAlert(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Search & Category Filters */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '28px',
        flexWrap: 'wrap'
      }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'ALL', label: 'All Integrations' },
            { id: 'CONNECTED', label: `Connected (${totalConnectedCount})` },
            { id: 'CORE', label: 'Project Delivery' },
            { id: 'COLLAB', label: 'Collaboration' },
            { id: 'DESIGN', label: 'Design & Research' },
            { id: 'CUSTOM', label: `Custom APIs & Webhooks (${customIntegrations.length})` },
            { id: 'COMING_SOON', label: 'Coming Soon' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: activeTab === tab.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
                background: activeTab === tab.id ? '#0f172a' : '#ffffff',
                color: activeTab === tab.id ? '#ffffff' : '#64748b',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              outline: 'none',
              background: '#ffffff'
            }}
          />
        </div>
      </div>

      {/* 4. Section: Connected Integrations (Highlights active tools) */}
      {activeTab !== 'COMING_SOON' && totalConnectedCount > 0 && searchQuery === '' && (
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Connected Integrations
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px' }}>
              {totalConnectedCount} Active
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
            {connectedList.map(item => (
              <div
                key={item.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #a7f3d0',
                  padding: '18px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: item.logoBg,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 700
                  }}>
                    {item.logoText}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{item.name}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#047857', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>
                        ✓ Connected
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      {item.connectedDetails || 'Active connection'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={item.onManage}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Configure
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Section: Available Core Integrations */}
      {filteredCore.length > 0 && (
        <div style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px 0', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Available Integrations
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filteredCore.map(item => {
              const isConnected = item.status === 'CONNECTED';
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: isConnected ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                    padding: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    {/* Top Row: Logo, Name, Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          background: item.logoBg,
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 700
                        }}>
                          {item.logoText}
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                            {item.badge}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isConnected ? '#ecfdf5' : '#f1f5f9',
                        color: isConnected ? '#047857' : '#475569',
                        border: `1px solid ${isConnected ? '#a7f3d0' : '#e2e8f0'}`
                      }}>
                        {item.statusLabel}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      {item.tagline}
                    </div>

                    <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      {item.description}
                    </p>

                    {/* Connected Details & Metadata */}
                    {isConnected && (
                      <div style={{
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        padding: '12px',
                        marginBottom: '16px',
                        fontSize: '12px'
                      }}>
                        {item.connectedDetails && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>Connected Account:</span>
                            <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.connectedDetails}</span>
                          </div>
                        )}
                        {item.importedCount !== undefined && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>Evidence Records:</span>
                            <span style={{ color: '#047857', fontWeight: 600 }}>{item.importedCount} imported</span>
                          </div>
                        )}
                        {item.lastSyncedAt && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>Last Synced:</span>
                            <span style={{ color: '#475569' }}>{new Date(item.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                        {item.selectedResources && Array.isArray(item.selectedResources) && item.selectedResources.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>Resources:</span>
                            <span style={{
                              color: '#334155',
                              fontWeight: 500,
                              background: '#e2e8f0',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px'
                            }}>
                              {item.selectedResources.length} tracked
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isConnected ? (
                      <>
                        <button
                          onClick={item.onManage}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '6px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#0f172a',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px'
                          }}
                        >
                          <Check size={13} color="#059669" />
                          <span>Configure</span>
                        </button>

                        {item.onSyncNow && (
                          <button
                            onClick={item.onSyncNow}
                            disabled={syncingProvider === item.id}
                            title="Sync recent updates now"
                            style={{
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#334155',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: syncingProvider === item.id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '5px'
                            }}
                          >
                            <RotateCw
                              size={13}
                              style={{
                                animation: syncingProvider === item.id ? 'spin 1s linear infinite' : 'none'
                              }}
                            />
                            <span>{syncingProvider === item.id ? 'Syncing...' : 'Sync Now'}</span>
                          </button>
                        )}

                        {item.onDisconnect && (
                          <button
                            onClick={item.onDisconnect}
                            title="Disconnect integration"
                            style={{
                              padding: '8px 10px',
                              borderRadius: '6px',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              color: '#b91c1c',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Power size={13} />
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={item.onManage}
                        style={{
                          flex: 1,
                          padding: '8px 14px',
                          borderRadius: '6px',
                          background: '#0f172a',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plug size={14} />
                        <span>Connect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Section: Custom Workspace Integrations List (APIs & Webhooks) */}
      {customIntegrations.length > 0 && activeTab !== 'COMING_SOON' && (
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Your Custom Integrations ({customIntegrations.length})
            </h2>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>NAME & TYPE</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>TARGET URL</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>AUTH / SIGNING</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>STATUS</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>LAST TEST</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {customIntegrations.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {c.type === 'CUSTOM_API' ? 'REST API Endpoint' : 'Outbound Webhook'}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#475569', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <code>{c.url}</code>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748b' }}>
                      {c.type === 'CUSTOM_API' ? (
                        <span>{c.authType} {c.hasSecret && '(Encrypted)'}</span>
                      ) : (
                        <span>HMAC-SHA256</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: c.isEnabled ? (c.status === 'ERROR' ? '#fef2f2' : '#ecfdf5') : '#f1f5f9',
                        color: c.isEnabled ? (c.status === 'ERROR' ? '#dc2626' : '#059669') : '#64748b'
                      }}>
                        {c.isEnabled ? (c.status === 'ERROR' ? 'Error' : 'Active') : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: '12px', color: '#64748b' }}>
                      {c.lastTestAt ? new Date(c.lastTestAt).toLocaleTimeString() : 'Not tested'}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handleTestCustomItem(c.id)}
                          title="Run safe test probe"
                          disabled={isProcessing}
                          style={{
                            padding: '5px 9px',
                            borderRadius: '4px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            color: '#0f172a',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Test
                        </button>
                        <button
                          onClick={() => handleToggleCustomItem(c.id, c.isEnabled)}
                          title={c.isEnabled ? 'Disable' : 'Enable'}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '4px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: c.isEnabled ? '#059669' : '#94a3b8',
                            cursor: 'pointer'
                          }}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomItem(c.id, c.name)}
                          title="Delete integration"
                          style={{
                            padding: '5px 8px',
                            borderRadius: '4px',
                            background: '#ffffff',
                            border: '1px solid #fecaca',
                            color: '#dc2626',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Section: Coming Soon Integrations */}
      {filteredComingSoon.length > 0 && (
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Coming Soon
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
              Planned Roadmap
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filteredComingSoon.map(item => (
              <div
                key={item.id}
                style={{
                  background: '#fafbfc',
                  borderRadius: '12px',
                  border: '1px dashed #cbd5e1',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: item.logoBg,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700
                      }}>
                        {item.logoText}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                          {item.badge}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: '#f1f5f9',
                      color: '#64748b',
                      border: '1px solid #e2e8f0'
                    }}>
                      In Development
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    {item.tagline}
                  </div>

                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                    {item.description}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedComingSoon(item);
                    setActiveModal('coming_soon');
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={13} color="#64748b" />
                  <span>View Details & Request Access</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. Section: Add Your Own Integration (At the VERY BOTTOM below Coming Soon) */}
      {filteredCustomTemplates.length > 0 && (
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f172a'
            }}>
              <Plus size={16} strokeWidth={2.5} />
            </div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Add Your Own Integration
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
            Connect your team's internal tools, APIs and services to PMPilot.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {filteredCustomTemplates.map(item => (
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: item.logoBg,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700
                      }}>
                        {item.logoText}
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                          {item.badge}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #e2e8f0'
                    }}>
                      Custom Tool
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    {item.tagline}
                  </div>

                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, margin: '0 0 20px 0' }}>
                    {item.description}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={item.onAdd}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={15} />
                    <span>Add Integration</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* A. LINEAR SETUP MODAL */}
      {activeModal === 'linear' && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#5e6ad2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>L</div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Linear Integration Setup</h3>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, marginTop: 0 }}>
                Linear connects your decision intelligence pipeline to development tickets. Once approved by a human PM, decision records export directly into Linear issues and sub-issues.
              </p>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Connection Status:</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: isLinearConnected ? '#059669' : '#b45309' }}>
                    {isLinearConnected ? `Connected (${linearStatus.connection?.organizationName})` : 'Not Connected'}
                  </span>
                </div>
                {isLinearConnected && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Authorized Scopes:</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>read, write, issues:create</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Encryption:</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>AES-256-GCM (Dedicated Key)</span>
                    </div>
                  </>
                )}
              </div>

              {isLinearConnected ? (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleDisconnectLinear}
                    disabled={isProcessing}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Disconnect Linear
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#0f172a', border: 'none', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectLinear}
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: '8px',
                    background: '#5e6ad2',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <ExternalLink size={15} />
                  <span>Authorize with Linear (OAuth 2.0)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* B. SLACK SETUP MODAL */}
      {activeModal === 'slack' && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#4a154b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>#</div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Slack Workspace Connection</h3>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <form onSubmit={handleConnectSlack} style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginTop: 0 }}>
                Connect your team's Slack channel via Incoming Webhook. Approved decisions and executive PRD digests will broadcast directly to this channel.
              </p>

              {testResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  background: testResult.success ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${testResult.success ? '#a7f3d0' : '#fecaca'}`,
                  color: testResult.success ? '#065f46' : '#991b1b',
                  fontSize: '12.5px'
                }}>
                  {testResult.message || testResult.error}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>
                  Incoming Webhook URL <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  value={slackForm.webhookUrl}
                  onChange={(e) => setSlackForm({ ...slackForm, webhookUrl: e.target.value })}
                  style={inputStyle}
                />
                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                  Encrypted at rest using AES-256-GCM. Never exposed in frontend responses.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Target Channel</label>
                  <input
                    type="text"
                    required
                    placeholder="#product-announcements"
                    value={slackForm.channel}
                    onChange={(e) => setSlackForm({ ...slackForm, channel: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Team / Workspace Name</label>
                  <input
                    type="text"
                    placeholder="Acme Product Slack"
                    value={slackForm.teamName}
                    onChange={(e) => setSlackForm({ ...slackForm, teamName: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {isSlackConnected && (
                  <button
                    type="button"
                    onClick={handleTestSlack}
                    disabled={isProcessing}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Send Test Ping
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {isProcessing ? 'Verifying & Saving...' : (isSlackConnected ? 'Update Connection' : 'Verify & Connect Slack')}
                </button>

                {isSlackConnected && (
                  <button
                    type="button"
                    onClick={handleDisconnectSlack}
                    disabled={isProcessing}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* C. SWITCH COLLABORATION MODAL */}
      {activeModal === 'switch' && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#0f766e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>SW</div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Switch AI Collaboration</h3>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginTop: 0 }}>
                Switch is our hackathon sponsor AI collaboration platform. PMPilot connects decision contexts to live Switch rooms and turns room discussions into version-bound proposals for PM approval.
              </p>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Server URL:</span>
                  <code style={{ fontSize: '12px', color: '#0f172a' }}>{switchPreflight?.serverUrl || 'http://localhost:8000'}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Health Probe:</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: switchPreflight?.reachable ? '#059669' : '#dc2626' }}>
                    {switchPreflight?.reachable ? 'Online (GET /health 200)' : 'Offline / Unreachable'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Agent Protocol:</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>Official Wire Protocol v1</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    fetchSwitchStatus();
                    alert('Switch health probe executed.');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Re-Probe Server
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    if (onNavigateTo) onNavigateTo('switch');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#0f766e',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Open Collaboration Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* D. CUSTOM API MODAL */}
      {activeModal === 'custom_api' && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>API</div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  {editingCustomItem ? 'Edit Custom REST API' : 'Connect Custom REST API'}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <form onSubmit={handleSaveCustomApi} style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginTop: 0 }}>
                Configure an external REST service to ingest metrics and signals. Target URLs are protected with SSRF safeguards.
              </p>

              {testResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  background: testResult.success ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${testResult.success ? '#a7f3d0' : '#fecaca'}`,
                  color: testResult.success ? '#065f46' : '#991b1b',
                  fontSize: '12.5px'
                }}>
                  {testResult.message || testResult.error}
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Integration Name <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Customer Telemetry Gateway"
                  value={apiForm.name}
                  onChange={(e) => setApiForm({ ...apiForm, name: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Base URL <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourcompany.com/v1"
                  value={apiForm.url}
                  onChange={(e) => setApiForm({ ...apiForm, url: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={labelStyle}>Authentication Method</label>
                  <select
                    value={apiForm.authType}
                    onChange={(e) => setApiForm({ ...apiForm, authType: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="NONE">None / Public</option>
                    <option value="BEARER">Bearer Token</option>
                    <option value="API_KEY">API Key (Header)</option>
                    <option value="BASIC">Basic Auth</option>
                  </select>
                </div>

                {apiForm.authType === 'API_KEY' && (
                  <div>
                    <label style={labelStyle}>Header Name</label>
                    <input
                      type="text"
                      placeholder="X-API-Key"
                      value={apiForm.authHeaderName}
                      onChange={(e) => setApiForm({ ...apiForm, authHeaderName: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              {apiForm.authType !== 'NONE' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Token / Secret Key</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiSecret ? 'text' : 'password'}
                      placeholder={editingCustomItem?.hasSecret ? '•••••••• (Leave blank to keep existing)' : 'Enter secret key or bearer token'}
                      value={apiForm.secret}
                      onChange={(e) => setApiForm({ ...apiForm, secret: e.target.value })}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiSecret(!showApiSecret)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                    >
                      {showApiSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Custom Headers (Optional JSON)</label>
                <textarea
                  rows={2}
                  placeholder='{"Accept": "application/json"}'
                  value={apiForm.customHeaders}
                  onChange={(e) => setApiForm({ ...apiForm, customHeaders: e.target.value })}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {isProcessing ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* E. CUSTOM WEBHOOK MODAL */}
      {activeModal === 'custom_webhook' && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>WH</div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  {editingCustomItem ? 'Edit Outbound Webhook' : 'Configure Outbound Webhook'}
                </h3>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <form onSubmit={handleSaveCustomWebhook} style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginTop: 0 }}>
                Deliver signed HTTP POST events to external endpoints when decisions mutate. Events include cryptographic HMAC-SHA256 signatures in the <code>X-PMPilot-Signature</code> header.
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Integration Name <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Datadog / Zapier Pipeline"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Target Endpoint URL <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Signing Secret (HMAC-SHA256)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    required
                    value={webhookForm.signingSecret}
                    onChange={(e) => setWebhookForm({ ...webhookForm, signingSecret: e.target.value })}
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={() => setWebhookForm({ ...webhookForm, signingSecret: `whsec_${Math.random().toString(36).substring(2, 12)}${Date.now()}` })}
                    style={{ padding: '0 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Subscribed Events</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                  {[
                    { id: 'decision.approved', label: 'Decision Approved' },
                    { id: 'decision.created', label: 'Decision Created' },
                    { id: 'proposal.accepted', label: 'Proposal Accepted' },
                    { id: 'conflict.detected', label: 'Conflict Detected' }
                  ].map(ev => {
                    const checked = webhookForm.events.includes(ev.id);
                    return (
                      <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setWebhookForm({ ...webhookForm, events: [...webhookForm.events, ev.id] });
                            } else {
                              setWebhookForm({ ...webhookForm, events: webhookForm.events.filter(x => x !== ev.id) });
                            }
                          }}
                        />
                        <span>{ev.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {isProcessing ? 'Saving...' : 'Save Webhook Configuration'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* F. COMING SOON MODAL */}
      {activeModal === 'coming_soon' && selectedComingSoon && (
        <div style={modalBackdropStyle}>
          <div style={modalBoxStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: selectedComingSoon.logoBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {selectedComingSoon.logoText}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{selectedComingSoon.name} Integration</h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Planned Release · In Development</span>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} style={closeButtonStyle}>✕</button>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, marginTop: 0 }}>
                {selectedComingSoon.description}
              </p>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Planned Capabilities:
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                  {selectedComingSoon.plannedCapabilities?.map((cap, idx) => (
                    <li key={idx}>{cap}</li>
                  ))}
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    alert(`Thank you for your interest! Your workspace (${activeWorkspace?.name || 'My Workspace'}) has been added to the early access waitlist for ${selectedComingSoon.name}.`);
                    setActiveModal(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Join Early Access Waitlist
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. Provider Connection & Sync Wizard Modal */}
      {activeWizard && (
        <IntegrationWizardModal
          provider={activeWizard.provider}
          providerName={activeWizard.providerName}
          logoText={activeWizard.logoText}
          logoBg={activeWizard.logoBg}
          workspaceId={workspaceId}
          token={token}
          isDemoMode={isDemoMode}
          connection={activeWizard.connection}
          onClose={() => setActiveWizard(null)}
          onSuccess={() => {
            setActiveWizard(null);
            fetchIntegrationsSummary();
          }}
        />
      )}

      {/* 12. Workspace Evidence Review Modal */}
      {isEvidenceReviewOpen && (
        <EvidenceReviewModal
          workspaceId={workspaceId}
          token={token}
          isDemoMode={isDemoMode}
          onClose={() => setIsEvidenceReviewOpen(false)}
          onPromoted={() => {
            fetchIntegrationsSummary();
          }}
        />
      )}

    </div>
  );
}

// Common styles
const modalBackdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  backdropFilter: 'blur(3px)'
};

const modalBoxStyle = {
  background: '#ffffff',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '520px',
  boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
  overflow: 'hidden'
};

const modalHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '18px 24px',
  borderBottom: '1px solid #f1f5f9',
  background: '#fafbfc'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '16px',
  cursor: 'pointer',
  color: '#64748b',
  fontWeight: 700
};

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#334155',
  marginBottom: '6px'
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  outline: 'none',
  background: '#ffffff',
  boxSizing: 'border-box'
};
