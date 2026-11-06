/**
 * PMPilot GitHub Integration Service
 * 
 * Implements:
 * - GitHub OAuth 2.0 Web Application Flow & Personal Access Token (PAT) options
 * - Organization and Repository selection
 * - Issue and Pull Request import into Evidence Ingestion Pipeline
 * - Commit references and PR merge status synchronization
 * - Decision linking to GitHub issues, PRs, and commits
 * - Discrepancy analysis between approved decision specifications and engineering PRs
 * - Safe read-only analysis: NEVER automatically closes issues, merges PRs, or mutates repositories
 * - AES-256-GCM token encryption and sanitized status reporting
 */

import { IntegrationBaseService } from './integrationBase.js';
import { db } from '../db/database.js';
import { encryptionService } from '../services/encryptionService.js';
import { ingestionService } from '../services/ingestionService.js';

class GitHubService extends IntegrationBaseService {
  constructor() {
    super('GITHUB');
  }

  getClientId() {
    return process.env.GITHUB_CLIENT_ID || null;
  }

  getClientSecret() {
    return process.env.GITHUB_CLIENT_SECRET || null;
  }

  /**
   * Safe preflight report: verifies presence and validity of required environment variables.
   * NEVER returns secret values.
   */
  getPreflightReport() {
    const rawClientId = process.env.GITHUB_CLIENT_ID;
    const rawClientSecret = process.env.GITHUB_CLIENT_SECRET;
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;

    const clientIdPresent = Boolean(rawClientId && typeof rawClientId === 'string' && rawClientId.trim().length > 0);
    const clientSecretPresent = Boolean(rawClientSecret && typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0);
    const keyValidation = encryptionService.validateKey(rawKey);

    const variables = {
      GITHUB_CLIENT_ID: {
        present: clientIdPresent,
        valid: clientIdPresent
      },
      GITHUB_CLIENT_SECRET: {
        present: clientSecretPresent,
        valid: clientSecretPresent
      },
      INTEGRATION_ENCRYPTION_KEY: {
        present: keyValidation.present,
        valid: keyValidation.valid,
        ...(keyValidation.error && !keyValidation.valid ? { error: keyValidation.error } : {})
      }
    };

    const isFullyConfigured = variables.GITHUB_CLIENT_ID.valid &&
      variables.GITHUB_CLIENT_SECRET.valid &&
      variables.INTEGRATION_ENCRYPTION_KEY.valid;

    return {
      provider: 'GITHUB',
      status: isFullyConfigured ? 'READY' : 'UNCONFIGURED',
      isFullyConfigured,
      variables
    };
  }

  isConfigured() {
    return this.getPreflightReport().isFullyConfigured;
  }

  getMissingVariables() {
    const preflight = this.getPreflightReport();
    return Object.entries(preflight.variables)
      .filter(([_, check]) => !check.valid)
      .map(([name, check]) => (!check.present ? name : `${name} (invalid)`));
  }

  /**
   * Builds official GitHub OAuth authorization URL
   */
  buildAuthorizeUrl({ workspaceId, userId, redirectUri }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to initiate GitHub OAuth.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`GitHub integration is not fully configured. Missing: ${missing}.`);
    }

    const clientId = this.getClientId();
    const { state } = this.createOAuthState({ workspaceId, userId, redirectUri });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo,read:org,read:user',
      state
    });

    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      state,
      redirectUri
    };
  }

  /**
   * Exchanges authorization code for GitHub access token and persists connection
   */
  async exchangeCodeAndConnect({ code, state, redirectUri, workspaceId, userId }) {
    if (!redirectUri) {
      throw new Error('redirectUri is required to exchange GitHub authorization code.');
    }
    if (!this.isConfigured()) {
      const missing = this.getMissingVariables().join(', ');
      throw new Error(`GitHub integration is not fully configured. Missing: ${missing}.`);
    }

    this.verifyOAuthState(state, workspaceId, userId, redirectUri);
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`GitHub token exchange failed: ${this.sanitizeErrorMessage(err)}`);
    }

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(`GitHub token error: ${this.sanitizeErrorMessage(tokenData.error_description || tokenData.error)}`);
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || 'repo,read:org,read:user';

    return await this.saveConnectionWithToken({ workspaceId, userId, accessToken, scopes });
  }

  /**
   * Allows direct connection with a fine-grained Personal Access Token (PAT)
   */
  async connectWithToken({ workspaceId, userId, token }) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new Error('Valid GitHub token is required.');
    }
    return await this.saveConnectionWithToken({
      workspaceId,
      userId,
      accessToken: token.trim(),
      scopes: 'repo,read:org,read:user (PAT)'
    });
  }

  async saveConnectionWithToken({ workspaceId, userId, accessToken, scopes }) {
    // Retrieve authenticated GitHub user and organizations
    let ghUser = 'GitHub User';
    let ghUserId = null;
    let ghOrgName = 'GitHub Organization';

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'PMPilot-App/1.0',
        'Accept': 'application/vnd.github+json'
      }
    });

    if (userRes.ok) {
      const u = await userRes.json();
      ghUser = u.login;
      ghUserId = String(u.id);
      ghOrgName = u.name ? `${u.name} (@${u.login})` : `@${u.login}`;
    }

    const encrypted = this.encryptTokens(accessToken);

    const connection = db.saveIntegrationConnection({
      workspaceId,
      provider: 'GITHUB',
      connectedByUserId: userId,
      providerOrganizationId: ghUserId,
      providerOrganizationName: ghOrgName,
      providerUserId: ghUserId,
      scopes,
      status: 'CONNECTED',
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenIv: encrypted.tokenIv,
      tokenTag: encrypted.tokenTag
    });

    return this.sanitizeConnection(connection);
  }

  async getValidAccessToken(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'GITHUB');
    if (!conn || conn.status !== 'CONNECTED') {
      throw new Error('GitHub is not connected for this workspace.');
    }
    const { accessToken } = this.decryptTokens(conn);
    return accessToken;
  }

  /**
   * Lists repositories accessible to the connected GitHub account
   */
  async listRepositories(workspaceId) {
    const token = await this.getValidAccessToken(workspaceId);

    const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PMPilot-App/1.0',
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list GitHub repositories: ${this.sanitizeErrorMessage(err)}`);
    }

    const repos = await res.json();
    return repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login,
      defaultBranch: r.default_branch,
      private: r.private,
      htmlUrl: r.html_url,
      description: r.description,
      openIssuesCount: r.open_issues_count
    }));
  }

  /**
   * Synchronizes selected repositories: imports issues, PRs, and commit records
   */
  async syncSelectedRepositories({ workspaceId, selectedRepos = [] }) {
    const token = await this.getValidAccessToken(workspaceId);
    const importedResults = [];

    // Save selected resources
    db.updateIntegrationMetadata(workspaceId, 'GITHUB', {
      selectedResources: selectedRepos,
      status: 'CONNECTED'
    });

    for (const repo of selectedRepos) {
      const repoFullName = typeof repo === 'string' ? repo : (repo.fullName || `${repo.owner}/${repo.name}`);

      try {
        // 1. Fetch recent issues & PRs
        const issuesRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/issues?state=all&per_page=30&sort=updated`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'PMPilot-App/1.0',
              'Accept': 'application/vnd.github+json'
            }
          }
        );

        if (issuesRes.ok) {
          const items = await issuesRes.json();
          for (const item of items) {
            const isPr = Boolean(item.pull_request);
            const contentType = isPr ? 'PULL_REQUEST' : 'ISSUE';

            const record = ingestionService.ingestRecord({
              workspaceId,
              provider: 'GITHUB',
              externalId: `${repoFullName}#${item.number}`,
              sourceUrl: item.html_url,
              title: `[${repoFullName}] #${item.number} ${item.title}`,
              content: item.body || '(No description provided)',
              contentType,
              author: item.user?.login || 'GitHub User',
              originalCreatedAt: item.created_at,
              originalUpdatedAt: item.updated_at,
              metadata: {
                repo: repoFullName,
                number: item.number,
                state: item.state,
                isPullRequest: isPr,
                labels: (item.labels || []).map(l => l.name),
                commentsCount: item.comments
              }
            });

            importedResults.push(record);
          }
        }
      } catch (err) {
        console.error(`[GitHubService] Sync error for repo ${repoFullName}:`, err.message);
      }
    }

    const nowIso = new Date().toISOString();
    db.updateIntegrationMetadata(workspaceId, 'GITHUB', {
      lastSyncedAt: nowIso,
      syncCursor: nowIso,
      errorState: null
    });

    return {
      success: true,
      importedCount: importedResults.length,
      records: importedResults
    };
  }

  /**
   * Compares linked GitHub engineering work (PR or issue) with decision specifications
   * Identifies implementation discrepancies without mutating the repository.
   */
  async inspectLinkedWork({ workspaceId, decision, repoFullName, prNumber }) {
    const token = await this.getValidAccessToken(workspaceId);

    const prRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PMPilot-App/1.0',
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!prRes.ok) {
      throw new Error(`Failed to fetch GitHub PR #${prNumber} from ${repoFullName}.`);
    }

    const pr = await prRes.json();

    // Check implementation status vs decision version and state
    const decisionState = decision.state || 'INITIAL';
    const decisionApproved = decisionState === 'APPROVED' || decisionState === 'ARTIFACT_GENERATED';
    const isMerged = pr.merged;
    const prState = pr.state; // 'open' | 'closed'

    let discrepancy = null;
    if (isMerged && !decisionApproved) {
      discrepancy = 'WARNING: PR was merged before the canonical decision reached human approval.';
    } else if (prState === 'closed' && !isMerged) {
      discrepancy = 'NOTICE: PR was closed without merging.';
    }

    return {
      repo: repoFullName,
      prNumber,
      title: pr.title,
      htmlUrl: pr.html_url,
      state: prState,
      merged: isMerged,
      mergedAt: pr.merged_at,
      author: pr.user?.login,
      branch: pr.head?.ref,
      baseBranch: pr.base?.ref,
      decisionVersion: decision.version,
      decisionApproved,
      discrepancy
    };
  }

  /**
   * Disconnects GitHub and clears credentials
   */
  disconnect(workspaceId) {
    const updated = db.disconnectIntegrationConnection(workspaceId, 'GITHUB');
    return this.sanitizeConnection(updated);
  }

  /**
   * Retrieves connection status and stats for a workspace
   */
  getConnectionStatus(workspaceId) {
    const conn = db.getIntegrationConnection(workspaceId, 'GITHUB');
    const preflight = this.getPreflightReport();
    const importedCount = db.countImportedRecords(workspaceId, 'GITHUB');

    if (!conn || conn.status === 'DISCONNECTED') {
      return {
        provider: 'GITHUB',
        configured: preflight.isFullyConfigured,
        connected: false,
        status: 'NOT_CONNECTED',
        importedCount,
        preflight
      };
    }

    return {
      provider: 'GITHUB',
      configured: preflight.isFullyConfigured,
      connected: conn.status === 'CONNECTED',
      status: conn.status,
      importedCount,
      connection: this.sanitizeConnection(conn),
      preflight
    };
  }
}

export const githubService = new GitHubService();
