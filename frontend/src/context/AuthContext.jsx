import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

// PKCE Helper utilities using Web Cryptography API
function generateRandomString(length = 43) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join('');
}

async function sha256Base64Url(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('pmpilot_token'));
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('pmpilot_demo_active') === 'true');
  const [isLoading, setIsLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);

  // Fetch provider configuration from backend
  const fetchAuthConfig = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4000/api/auth/config');
      if (res.ok) {
        const data = await res.json();
        setAuthConfig(data);
      }
    } catch (err) {
      console.warn('Could not reach backend auth config:', err.message);
    }
  }, []);

  // Fetch workspaces for authenticated user
  const fetchWorkspaces = useCallback(async (currentToken) => {
    if (!currentToken) return;
    try {
      const res = await fetch('http://localhost:4000/api/workspaces', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.workspaces) {
          setWorkspaces(data.workspaces);
        }
      }
    } catch (err) {
      console.warn('Could not fetch user workspaces:', err.message);
    }
  }, []);

  // Validate existing stored token on mount
  const validateSession = useCallback(async (currentToken) => {
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('http://localhost:4000/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          setIsDemoMode(false);
          localStorage.removeItem('pmpilot_demo_active');
          fetchWorkspaces(currentToken);
          setIsLoading(false);
          return;
        }
      }

      // If token verification failed on server (e.g. expired or revoked)
      localStorage.removeItem('pmpilot_token');
      setToken(null);
      setUser(null);
      setAuthError('Your session has expired. Please sign in again.');
    } catch (err) {
      console.error('Session validation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWorkspaces]);

  // Handle incoming OIDC authorization code callback
  const handleOidcCallback = useCallback(async (code) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const codeVerifier = sessionStorage.getItem('pmpilot_pkce_verifier');
      if (!codeVerifier) {
        throw new Error('PKCE verification code missing from session. Please restart sign-in.');
      }

      const redirectUri = `${window.location.origin}/`;
      const res = await fetch('http://localhost:4000/api/auth/oidc/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier, redirectUri })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete Auth0 SSO sign-in.');
      }

      sessionStorage.removeItem('pmpilot_pkce_verifier');
      localStorage.setItem('pmpilot_token', data.token);
      localStorage.removeItem('pmpilot_demo_active');
      setToken(data.token);
      setUser(data.user);
      setIsDemoMode(false);

      // Clean query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthConfig();

    // Check for OIDC authorization code in URL query params (only if initiated by Auth0)
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const hasAuth0Verifier = Boolean(sessionStorage.getItem('pmpilot_pkce_verifier'));
    if (authCode && hasAuth0Verifier) {
      handleOidcCallback(authCode);
      return;
    }

    validateSession(token);
  }, [fetchAuthConfig, handleOidcCallback, validateSession, token]);

  const loginWithAuth0 = async () => {
    setAuthError(null);
    if (!authConfig?.auth0?.isConfigured) {
      setAuthError('Auth0 identity provider is not configured in backend environment variables.');
      return;
    }

    try {
      const verifier = generateRandomString(64);
      const challenge = await sha256Base64Url(verifier);
      const state = generateRandomString(16);

      sessionStorage.setItem('pmpilot_pkce_verifier', verifier);

      const redirectUri = `${window.location.origin}/`;
      const query = new URLSearchParams({
        redirectUri,
        state,
        codeChallenge: challenge
      });

      const res = await fetch(`http://localhost:4000/api/auth/oidc/login-url?${query.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate Auth0 SSO.');
      }

      // Redirect to Auth0 hosted login page
      window.location.href = data.url;
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const res = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      localStorage.setItem('pmpilot_token', data.token);
      localStorage.removeItem('pmpilot_demo_active');
      setToken(data.token);
      setUser(data.user);
      setIsDemoMode(false);
      fetchWorkspaces(data.token);
      return { success: true, user: data.user };
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const register = async (email, password, name) => {
    setAuthError(null);
    try {
      const res = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create account.');
      }

      localStorage.setItem('pmpilot_token', data.token);
      localStorage.removeItem('pmpilot_demo_active');
      setToken(data.token);
      setUser(data.user);
      setIsDemoMode(false);
      fetchWorkspaces(data.token);
      return { success: true, user: data.user };
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('http://localhost:4000/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.warn('Logout notification error:', err.message);
    } finally {
      localStorage.removeItem('pmpilot_token');
      localStorage.removeItem('pmpilot_demo_active');
      setToken(null);
      setUser(null);
      setIsDemoMode(false);
      setAuthError(null);
      setWorkspaces([]);
    }
  };

  const enterDemoMode = () => {
    localStorage.removeItem('pmpilot_token');
    localStorage.setItem('pmpilot_demo_active', 'true');
    setToken(null);
    setUser(null);
    setIsDemoMode(true);
    setAuthError(null);
  };

  const exitDemoMode = () => {
    localStorage.removeItem('pmpilot_demo_active');
    setIsDemoMode(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isDemoMode,
        isAuthenticated: Boolean(user && token),
        isLoading,
        authConfig,
        authError,
        setAuthError,
        workspaces,
        login,
        register,
        loginWithAuth0,
        logout,
        enterDemoMode,
        exitDemoMode
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
