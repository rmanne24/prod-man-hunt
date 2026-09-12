import React from 'react';
import {
  Layers,
  FileCheck,
  Compass,
  Package,
  Briefcase,
  Smartphone,
  Globe,
  Key,
  Pause,
  Plus
} from 'lucide-react';

export default function LeftSidebar({
  activeNav = 'evidence',
  setActiveNav,
  sources = [],
  onCaptureSourceClick,
  onOpenSettings
}) {
  const navItems = [
    { id: 'evidence', label: 'Evidence workspace', icon: Layers },
    { id: 'atwork', label: 'At work ecosystem', icon: Briefcase, badge: 'Slack / Teams' },
    { id: 'pocket', label: 'In your pocket', icon: Smartphone, badge: 'Mobile' },
    { id: 'web', label: 'On the web', icon: Globe, badge: 'Agent' },
    { id: 'decisions', label: 'Product decisions', icon: FileCheck },
    { id: 'validation', label: 'Validation plans', icon: Compass },
    { id: 'artifacts', label: 'Delivery artifacts', icon: Package }
  ];

  return (
    <aside style={{
      width: '260px',
      minWidth: '260px',
      background: '#ffffff',
      borderRight: '1px solid #e5e8e1',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Brand Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingLeft: '4px'
      }}>
        <div style={{
          width: '26px',
          height: '26px',
          borderRadius: '7px',
          background: '#0d251c',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 'bold'
        }}>
          ✦
        </div>
        <span style={{
          fontSize: '17px',
          fontWeight: 800,
          color: '#111915',
          letterSpacing: '-0.3px'
        }}>
          Associate PM
        </span>
      </div>

      {/* Workspace Card */}
      <div style={{
        background: '#fafbf9',
        border: '1px solid #e5e8e1',
        borderRadius: '12px',
        padding: '10px 12px'
      }}>
        <div style={{
          fontSize: '9.5px',
          fontWeight: 800,
          letterSpacing: '0.8px',
          color: '#718378',
          textTransform: 'uppercase',
          marginBottom: '2px'
        }}>
          WORKSPACE
        </div>
        <div style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#131916'
        }}>
          Moonshot Studio
        </div>
      </div>

      {/* Nav Menu */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {navItems.map((item) => {
          const isActive = activeNav === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#143825' : '#4f6156',
                background: isActive ? '#e3edd7' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <Icon size={15} strokeWidth={isActive ? 2.3 : 1.8} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  background: isActive ? '#cce0ba' : '#f0f4ec',
                  color: '#2d4536',
                  padding: '2px 5px',
                  borderRadius: '4px'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Captured Context Section */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderTop: '1px solid #f0f3ee',
        paddingTop: '16px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 4px'
        }}>
          <span style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: '#131916'
          }}>
            Captured context
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            background: '#e6f7ec',
            color: '#047857',
            padding: '2px 6px',
            borderRadius: '9999px',
            letterSpacing: '0.4px'
          }}>
            {sources.length} sources
          </span>
        </div>

        {/* Source List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sources.map((src) => {
            let badgeBg = '#f3effe';
            let badgeColor = '#6d28d9';
            if (src.badge === 'F') { badgeBg = '#fdf4ff'; badgeColor = '#c026d3'; }
            if (src.badge === 'N') { badgeBg = '#eef2ff'; badgeColor = '#4338ca'; }
            if (src.badge === 'L') { badgeBg = '#f5f3ff'; badgeColor = '#7c3aed'; }
            if (src.badge === 'E') { badgeBg = '#f0fdfa'; badgeColor = '#0d9488'; }

            return (
              <div
                key={src.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 6px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: badgeBg,
                  color: badgeColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 800
                }}>
                  {src.badge}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#131916',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {src.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#718378' }}>
                    {src.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <button
          onClick={onCaptureSourceClick}
          style={{
            background: '#12261e',
            color: '#ffffff',
            border: 'none',
            borderRadius: '9999px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>+ Capture evidence</span>
        </button>
      </div>

      {/* Settings / API Keys Footer Button */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #f0f3ee', paddingTop: '14px' }}>
        <button
          onClick={onOpenSettings}
          style={{
            width: '100%',
            background: '#f3f6f1',
            color: '#143825',
            border: '1px solid #d8dfd5',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <Key size={13} />
          <span>API Keys & Credits</span>
        </button>
      </div>
    </aside>
  );
}
