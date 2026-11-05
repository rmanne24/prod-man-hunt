/**
 * PMPilot Token Encryption Service
 * 
 * Provides authenticated encryption for integration OAuth tokens using AES-256-GCM.
 * Requires a dedicated 256-bit environment encryption key (INTEGRATION_ENCRYPTION_KEY).
 * 
 * Strict safeguard: Does not silently derive fallback keys from session secrets in production.
 * Fails safely if the dedicated key is missing or malformed.
 */

import crypto from 'node:crypto';

class EncryptionService {
  /**
   * Validates whether an encryption key is present and is exactly 32 bytes of hex (64 hex characters).
   * Safe: Does not return or log the key value.
   * @param {string} [rawKey]
   * @returns {{ present: boolean, valid: boolean, error?: string }}
   */
  validateKey(rawKey = process.env.INTEGRATION_ENCRYPTION_KEY) {
    if (rawKey === undefined || rawKey === null || rawKey === '') {
      return { present: false, valid: false, error: 'Key is not configured in environment variables' };
    }
    if (typeof rawKey !== 'string') {
      return { present: true, valid: false, error: 'Key must be a string' };
    }
    const cleanKey = rawKey.trim();
    if (cleanKey.length === 0) {
      return { present: false, valid: false, error: 'Key is empty' };
    }
    if (cleanKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      return {
        present: true,
        valid: false,
        error: `Key must be exactly 32 bytes encoded as 64 hex characters (got ${cleanKey.length} characters)`
      };
    }
    return { present: true, valid: true };
  }

  /**
   * Retrieves and validates the dedicated 256-bit encryption key
   */
  getEncryptionKey() {
    const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY is not configured in environment variables. ' +
        'Refusing to operate on unencrypted tokens or unsafe fallback keys.'
      );
    }

    const validation = this.validateKey(rawKey);
    if (!validation.valid) {
      throw new Error(
        `INTEGRATION_ENCRYPTION_KEY is malformed: ${validation.error}.`
      );
    }

    return Buffer.from(rawKey.trim(), 'hex');
  }

  /**
   * Checks whether the dedicated encryption key is present and valid
   */
  isConfigured() {
    return this.validateKey().valid;
  }

  /**
   * Encrypts plaintext using AES-256-GCM with a fresh 12-byte IV per encryption
   * @param {string} plainText 
   * @returns {{ encrypted: string, iv: string, tag: string }}
   */
  encrypt(plainText) {
    if (!plainText || typeof plainText !== 'string') {
      throw new Error('Plaintext string is required for encryption.');
    }

    const key = this.getEncryptionKey();
    // 96-bit IV recommended by NIST SP 800-38D for AES-GCM
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag
    };
  }

  /**
   * Decrypts ciphertext using AES-256-GCM and verifies the 16-byte authentication tag
   * @param {{ encrypted: string, iv: string, tag: string }} payload
   * @returns {string}
   */
  decrypt({ encrypted, iv, tag }) {
    if (!encrypted || !iv || !tag) {
      throw new Error('Encrypted payload, IV, and authentication tag are required for decryption.');
    }

    const key = this.getEncryptionKey();

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      throw new Error(`Failed to decrypt token: authentication tag mismatch or ciphertext corrupted (${err.message}).`);
    }
  }
}

export const encryptionService = new EncryptionService();

