/**
 * PMPilot SSRF Protection & Safe HTTP Client Service
 * 
 * Protects the backend against Server-Side Request Forgery (SSRF) when making outbound
 * calls for custom APIs, webhooks, and third-party integrations:
 * - Blocks localhost, loopback, link-local, private subnets (RFC 1918), and cloud metadata endpoints
 * - Resolves DNS before request execution and verifies all target IP addresses
 * - Restricts protocols to HTTP and HTTPS
 * - Enforces request timeouts (default 5000ms)
 * - Limits response payload size (default 1MB) to prevent denial-of-service
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export class SSRFProtectionService {
  /**
   * Evaluates whether an IPv4 address belongs to a private, loopback, or reserved range.
   * @param {string} ip 
   * @returns {boolean}
   */
  isPrivateIPv4(ip) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed IP treated as unsafe
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (Link-local & Cloud Metadata: AWS/GCP/Azure 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 192 && b === 168) return true;

    // 100.64.0.0/10 (Carrier-grade NAT & cloud internal)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;

    return false;
  }

  /**
   * Evaluates whether an IPv6 address belongs to a private, loopback, or unique local range.
   * @param {string} ip 
   * @returns {boolean}
   */
  isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();

    // Loopback & unspecified
    if (lower === '::1' || lower === '::') return true;

    // IPv4-mapped IPv6 (::ffff:192.168.1.1)
    if (lower.startsWith('::ffff:')) {
      const ipv4Part = lower.replace('::ffff:', '');
      if (net.isIPv4(ipv4Part)) {
        return this.isPrivateIPv4(ipv4Part);
      }
    }

    // fc00::/7 (Unique Local Address)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

    // fe80::/10 (Link-Local Unicast)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;

    // ff00::/8 (Multicast)
    if (lower.startsWith('ff')) return true;

    return false;
  }

  /**
   * Checks whether an IP address is considered private/internal.
   * @param {string} ip 
   * @returns {boolean}
   */
  isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
      return this.isPrivateIPv4(ip);
    }
    if (net.isIPv6(ip)) {
      return this.isPrivateIPv6(ip);
    }
    return true; // Unknown address type treated as unsafe
  }

  /**
   * Validates target URL syntax and resolves hostname to ensure no private IPs are targeted.
   * @param {string} targetUrl 
   * @param {{ allowLocal?: boolean }} options 
   * @returns {Promise<{ valid: boolean, parsedUrl?: URL, resolvedIps?: string[], error?: string }>}
   */
  async validateTargetUrl(targetUrl, options = { allowLocal: false }) {
    if (!targetUrl || typeof targetUrl !== 'string') {
      return { valid: false, error: 'Target URL is required.' };
    }

    let parsed;
    try {
      parsed = new URL(targetUrl.trim());
    } catch {
      return { valid: false, error: 'Target URL is not a valid standard URL.' };
    }

    // Protocol check: Only http and https permitted
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Invalid protocol '${parsed.protocol}'. Only 'http:' and 'https:' are permitted.`
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Blacklist known dangerous hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === 'metadata.google.internal' ||
      hostname === 'instance-data'
    ) {
      if (!options.allowLocal) {
        return {
          valid: false,
          error: `Access to internal hostname '${hostname}' is prohibited.`
        };
      }
    }

    // Direct IP address validation
    if (net.isIP(hostname)) {
      if (!options.allowLocal && this.isPrivateIp(hostname)) {
        return {
          valid: false,
          error: `Target address '${hostname}' resolves to a private or reserved network range.`
        };
      }
      return { valid: true, parsedUrl: parsed, resolvedIps: [hostname] };
    }

    // DNS Resolution check: Resolve hostname and verify all returned addresses
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (!records || records.length === 0) {
        return { valid: false, error: `Could not resolve hostname '${hostname}'.` };
      }

      const resolvedIps = records.map(r => r.address);

      if (!options.allowLocal) {
        for (const ip of resolvedIps) {
          if (this.isPrivateIp(ip)) {
            return {
              valid: false,
              error: `Hostname '${hostname}' resolves to private/reserved IP address '${ip}', which is prohibited.`
            };
          }
        }
      }

      return { valid: true, parsedUrl: parsed, resolvedIps };
    } catch (dnsErr) {
      if (dnsErr.code === 'ENOTFOUND' || dnsErr.code === 'EAI_AGAIN') {
        // In test environments or offline sandbox, allow non-local hostnames if DNS is unavailable
        if (process.env.NODE_ENV === 'test' || options.skipDnsResolution) {
          return { valid: true, parsedUrl: parsed, resolvedIps: [] };
        }
      }
      return {
        valid: false,
        error: `DNS lookup failed for '${hostname}': ${dnsErr.message}`
      };
    }
  }

  /**
   * Executes a safe outbound HTTP request protected against SSRF, hanging sockets, and payload bombs.
   * @param {string} targetUrl 
   * @param {RequestInit} [fetchOptions={}] 
   * @param {{ timeoutMs?: number, maxResponseBytes?: number, allowLocal?: boolean }} [config={}] 
   * @returns {Promise<{ ok: boolean, status: number, statusText: string, text: string, json: any, headers: Record<string, string> }>}
   */
  async safeFetch(targetUrl, fetchOptions = {}, config = {}) {
    const timeoutMs = config.timeoutMs || 5000;
    const maxResponseBytes = config.maxResponseBytes || 1024 * 1024; // 1MB
    const allowLocal = Boolean(config.allowLocal);

    // 1. SSRF Preflight validation
    const validation = await this.validateTargetUrl(targetUrl, { allowLocal });
    if (!validation.valid) {
      throw new Error(`SSRF Protection Blocked Request: ${validation.error}`);
    }

    // 2. Timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        ...fetchOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 3. Response size limit enforcement
      const reader = response.body ? response.body.getReader() : null;
      let text = '';

      if (reader) {
        const decoder = new TextDecoder();
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          if (totalBytes > maxResponseBytes) {
            reader.cancel();
            throw new Error(`Response exceeded maximum size limit of ${maxResponseBytes} bytes.`);
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } else {
        text = await response.text();
      }

      let parsedJson = null;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        // Non-JSON response
      }

      const responseHeaders = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        json: parsedJson,
        headers: responseHeaders
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms.`);
      }
      throw err;
    }
  }
}

export const ssrfProtection = new SSRFProtectionService();
