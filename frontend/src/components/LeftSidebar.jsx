import React from 'react';
import {
  Sparkles,
  Layers,
  FileCheck,
  Compass,
  Package,
  Plus,
  Pause,
  Play
} from 'lucide-react';

export default function LeftSidebar({
  activeNav = 'evidence',
  setActiveNav,
  sources = [],
  onCaptureSourceClick
}) {
  const navItems = [
    { id: 'evidence', label: 'Evidence workspace', icon: Layers },
    { id: 'decisions', label: 'Product decisions', icon: FileCheck },
    { id: 'validation', label: 'Validation plans', icon: Compass },
    { id: 'artifacts', label: 'Delivery artifacts', icon: Package }
  ];

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      background: '#ffffff',
      borderRight: '1px solid #e5e8e1',
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
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
        padding: '12px 14px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.8px',
          color: '#718378',
          textTransform: 'uppercase',
          marginBottom: '3px'
        }}>
          WORKSPACE
        </div>
        <div style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: '#131916'
        }}>
          Moonshot Studio
        </div>
      </div>

      {/* Nav Menu */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#143825' : '#4f6156',
                background: isActive ? '#e3edd7' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2.3 : 1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Captured Context Section */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderTop: '1px solid #f0f3ee',
        paddingTop: '20px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 4px'
        }}>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#131916'
          }}>
            Captured context
          </span>
          <span style={{
            fontSize: '10.5px',
            fontWeight: 700,
            background: '#e6f7ec',
            color: '#047857',
            padding: '2px 7px',
            borderRadius: '9999px',
            letterSpacing: '0.4px'
          }}>
            {sources.length} sources
          </span>
        </div>

        {/* Source List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  gap: '10px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f7f8f5'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: badgeBg,
                  color: badgeColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}>
                  {src.badge}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#131916',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {src.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#718378'
                  }}>
                    {src.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <button
          onClick={onCaptureSourceClick}
          style={{
            background: '#12261e',
            color: '#ffffff',
            border: 'none',
            borderRadius: '9999px',
            padding: '10px 14px',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '6px'
          }}
        >
          <span>+ Capture evidence</span>
        </button>

        <button
          style={{
            background: 'transparent',
            color: '#495a51',
            border: '1px solid #d8dfd9',
            borderRadius: '9999px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          Pause collection
        </button>
      </div>
    </aside>
  );
}
