import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  AlertCircle, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  KeyRound,
  Shield,
  ShieldAlert
} from 'lucide-react';

export default function AuthScreen() {
  const { login, register, loginWithAuth0, enterDemoMode, authConfig, authError, setAuthError } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [showAuth0Setup, setShowAuth0Setup] = useState(false);

  const isAuth0Configured = Boolean(authConfig?.auth0?.isConfigured);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (setAuthError) setAuthError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim());
      }
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFillSeededPM = () => {
    setMode('login');
    setEmail('pm@pmpilot.ai');
    setPassword('PMPilotDemo2026!');
    setLocalError(null);
  };

  const displayedError = localError || authError;

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px'
    }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 800
          }}>
            P
          </div>
          <span style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>
            PMPilot
          </span>
        </div>
        <div style={{ fontSize: '13.5px', color: '#64748b', fontWeight: 500 }}>
          Evidence-grounded decision intelligence for product managers
        </div>
      </div>

      {/* Main Authentication Card */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Enterprise SSO / Auth0 Section */}
        <div style={{ padding: '24px 24px 0 24px' }}>
          {isAuth0Configured ? (
            <div>
              <button
                type="button"
                onClick={loginWithAuth0}
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
              >
                <Shield size={16} color="#2563eb" />
                <span>Continue with Auth0 (SSO)</span>
              </button>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0 16px 0',
                color: '#94a3b8',
                fontSize: '11.5px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ padding: '0 12px' }}>or continue with email</span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>
            </div>
          ) : (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} color="#d97706" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    Enterprise SSO (Auth0)
                  </span>
                </div>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a'
                }}>
                  UNCONFIGURED
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.45, marginBottom: '8px' }}>
                Identity provider is not configured. Set <code>AUTH0_DOMAIN</code> & <code>AUTH0_CLIENT_ID</code> in backend environment to activate.
              </div>
              <button
                type="button"
                disabled
                title="Auth0 credentials are not configured in backend environment"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Shield size={13} color="#94a3b8" />
                <span>Sign in with Auth0 (SSO Disabled)</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Switcher: Sign in vs Create account */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '1px solid #e2e8f0',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc'
        }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setLocalError(null); }}
            style={{
              padding: '13px 16px',
              fontSize: '13.5px',
              fontWeight: mode === 'login' ? 700 : 500,
              color: mode === 'login' ? '#0f172a' : '#64748b',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: mode === 'login' ? '2px solid #0f172a' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setLocalError(null); }}
            style={{
              padding: '13px 16px',
              fontSize: '13.5px',
              fontWeight: mode === 'register' ? 700 : 500,
              color: mode === 'register' ? '#0f172a' : '#64748b',
              background: mode === 'register' ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: mode === 'register' ? '2px solid #0f172a' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Create Account
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px' }}>
          {displayedError && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '12.5px',
              lineHeight: 1.45,
              marginBottom: '20px'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>{displayedError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'register' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  marginBottom: '6px'
                }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sarah Connor"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13.5px',
                      outline: 'none',
                      background: '#ffffff'
                    }}
                  />
                  <User size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                </div>
              </div>
            )}

            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px'
              }}>
                Work Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155'
                }}>
                  Password
                </label>
                {mode === 'register' && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Min. 8 characters
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    outline: 'none',
                    background: '#ffffff'
                  }}
                />
                <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: '8px',
                padding: '11px',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isSubmitting ? 0.75 : 1
              }}
            >
              <span>{isSubmitting ? 'Verifying...' : mode === 'login' ? 'Sign In to Workspace' : 'Create PM Account'}</span>
              {!isSubmitting && <ArrowRight size={15} />}
            </button>
          </form>

          {/* Quick Credential Fill for Evaluators */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleQuickFillSeededPM}
              style={{
                background: 'none',
                border: 'none',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <KeyRound size={13} />
              <span>Use default demo PM account (<code>pm@pmpilot.ai</code>)</span>
            </button>
          </div>
        </div>

        {/* Judge Demo Walkthrough Bypass */}
        <div style={{
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Evaluating for hackathon judging?
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: '#e0f2fe',
              color: '#0369a1',
              border: '1px solid #bae6fd'
            }}>
              JUDGE DEMO
            </span>
          </div>
          <button
            type="button"
            onClick={enterDemoMode}
            style={{
              padding: '9px 14px',
              borderRadius: '6px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} color="#0f172a" />
            <span>Explore Demo Walkthrough (No Sign-in Required)</span>
          </button>
        </div>
      </div>

      {/* Auth0 Provider Setup Information Card */}
      <div style={{
        marginTop: '20px',
        width: '100%',
        maxWidth: '440px',
        background: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '12px 16px',
        fontSize: '12px',
        color: '#64748b'
      }}>
        <div
          onClick={() => setShowAuth0Setup(!showAuth0Setup)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Info size={14} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#334155' }}>
              Identity Architecture & Auth0 Status
            </span>
          </div>
          {showAuth0Setup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>

        {showAuth0Setup && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 8px 0' }}>
              <strong>Provider Status:</strong> {authConfig?.notice || 'Local persistent cryptographic verification active (PBKDF2 + HMAC-SHA256 in SQLite).'}
            </p>
            <p style={{ margin: '0 0 8px 0' }}>
              To connect enterprise <strong>Auth0 OIDC (Authorization Code with PKCE)</strong>, configure these variables in <code>backend/.env</code>:
            </p>
            <pre style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#0f172a',
              overflowX: 'auto',
              margin: '0 0 8px 0'
            }}>
{`AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://api.pmpilot.ai`}
            </pre>
            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
              In the Auth0 Dashboard, add <code>http://127.0.0.1:5173/</code> and <code>http://localhost:5173/</code> to <strong>Allowed Callback URLs</strong>, <strong>Allowed Logout URLs</strong>, and <strong>Allowed Web Origins</strong>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
