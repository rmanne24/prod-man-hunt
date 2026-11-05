import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  FileCheck2,
  Layers,
  Plug,
  Settings,
  PlusCircle,
  Database,
  LogOut,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LeftSidebar({
  activeNav = 'decisions',
  setActiveNav,
  sources = [],
  decisionCount = 0,
  onCaptureSourceClick,
  onOpenSettings,
  onNewDecisionClick
}) {
  const { user, isAuthenticated, isDemoMode, activeWorkspace, workspaces, setActiveWorkspace, createWorkspace, logout, exitDemoMode } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = React.useState(false);
  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (isDemoMode ? 'DM' : 'PM');

  const currentWsName = activeWorkspace?.name || (isDemoMode ? 'Moonshot Studio [DEMO]' : 'My Workspace');
  const roleBadge = isDemoMode ? 'DEMO' : (activeWorkspace?.member_role || 'OWNER');

  const mainNav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Decisions Directory', icon: FolderKanban, badge: `${decisionCount}` },
    { id: 'decisions', label: 'Active Decision', icon: FileCheck2 },
    { id: 'switch', label: 'Switch Collaboration', icon: MessageSquare, badge: 'Sponsor' },
    { id: 'evidence', label: 'Evidence & Signals', icon: Layers, badge: `${sources.length}` },
    { id: 'integrations', label: 'Integrations', icon: Plug },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const handleCreateNewWorkspace = async () => {
    const name = window.prompt("Enter new workspace name:");
    if (name && name.trim()) {
      try {
        await createWorkspace(name.trim());
        setIsWorkspaceMenuOpen(false);
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Brand & Workspace Header */}
      <div style={{
        padding: '18px 16px 14px 16px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 800
          }}>
            P
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '15px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.3px',
              lineHeight: 1.1
            }}>
              PMPilot
            </span>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
              Decision Intelligence
            </span>
          </div>
        </div>

        {/* Workspace Switcher Card */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => isAuthenticated && workspaces.length > 0 && setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isAuthenticated && workspaces.length > 0 ? 'pointer' : 'default'
            }}
          >
            <div style={{ minWidth: 0, flex: 1, marginRight: '6px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                WORKSPACE
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#1e293b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {currentWsName}
              </div>
            </div>
            <span style={{
              fontSize: '10px',
              background: isDemoMode ? '#fef3c7' : '#e0f2fe',
              color: isDemoMode ? '#b45309' : '#0369a1',
              padding: '1px 6px',
              borderRadius: '4px',
              fontWeight: 700,
              flexShrink: 0
            }}>
              {roleBadge}
            </span>
          </div>

          {/* Workspace Dropdown */}
          {isWorkspaceMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              zIndex: 50,
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Your Workspaces
              </div>
              {workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setActiveWorkspace(ws);
                    setIsWorkspaceMenuOpen(false);
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: activeWorkspace?.id === ws.id ? '#f1f5f9' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: activeWorkspace?.id === ws.id ? 700 : 500,
                    color: '#1e293b',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                  <span style={{ fontSize: '9px', color: '#64748b' }}>{ws.member_role || 'OWNER'}</span>
                </button>
              ))}
              <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />
              <button
                onClick={handleCreateNewWorkspace}
                style={{
                  padding: '6px 8px',
                  borderRadius: '4px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#2563eb',
                  cursor: 'pointer'
                }}
              >
                + Create Workspace
              </button>
            </div>
          )}
        </div>

        {/* Quick Action: New Decision */}
        {onNewDecisionClick && (
          <button
            onClick={onNewDecisionClick}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              background: '#0f172a',
              border: 'none',
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
            <PlusCircle size={14} />
            <span>New Decision</span>
          </button>
        )}
      </div>

      {/* Main Navigation Menu */}
      <div style={{ padding: '14px 10px', flex: 1 }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.6px', padding: '0 8px', marginBottom: '6px', textTransform: 'uppercase' }}>
          Platform
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {mainNav.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'settings') {
                    if (onOpenSettings) onOpenSettings();
                  } else {
                    setActiveNav(item.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#0f172a' : '#475569',
                  background: isActive ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.12s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <Icon size={16} color={isActive ? '#0f172a' : '#64748b'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    background: isActive ? '#e2e8f0' : '#f1f5f9',
                    color: isActive ? '#0f172a' : '#64748b',
                    padding: '1px 6px',
                    borderRadius: '4px'
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Context Sources */}
        <div style={{ marginTop: '20px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 8px',
            marginBottom: '6px'
          }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
              Active Signals ({sources.length})
            </span>
            <button
              onClick={onCaptureSourceClick}
              title="Capture source signal"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
            >
              <PlusCircle size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {sources.slice(0, 4).map((src) => (
              <div
                key={src.id}
                onClick={() => setActiveNav('evidence')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#334155',
                  background: 'transparent'
                }}
              >
                <Database size={12} color="#94a3b8" />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {src.name.replace(/^\[.*?\]\s*/, '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: User Identity & Authentication Status */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid #f1f5f9',
        background: '#fafbfc'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: isAuthenticated ? '#0f172a' : '#e2e8f0',
              color: isAuthenticated ? '#ffffff' : '#334155',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {isAuthenticated ? initials : 'DM'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {isAuthenticated ? user.name : 'Judge Demo Client'}
              </div>
              <div style={{
                fontSize: '10px',
                color: isAuthenticated ? '#059669' : '#94a3b8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {isAuthenticated ? '✓ Authenticated PM' : 'UNVERIFIED_DEMO_CLIENT'}
              </div>
            </div>
          </div>

          {isAuthenticated ? (
            <button
              onClick={logout}
              title="Sign out of PMPilot"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <LogOut size={14} />
            </button>
          ) : isDemoMode ? (
            <button
              onClick={exitDemoMode}
              title="Sign in with verified user account"
              style={{
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                cursor: 'pointer',
                padding: '3px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600
              }}
            >
              Sign In
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
