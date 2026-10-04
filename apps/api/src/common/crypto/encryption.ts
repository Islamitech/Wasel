import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt sensitive document metadata or PII with AES-256-GCM using raw 32-byte hex key
 */
export function encryptData(text: string, secretKeyHex: string): string {
  const key = Buffer.from(secretKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt sensitive document metadata or PII using raw 32-byte hex key
 */
export function decryptData(cipherText: string, secretKeyHex: string): string {
  const key = Buffer.from(secretKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid cipher text format. Expected iv:tag:content');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const tag = Buffer.from(parts[1]!, 'hex');
  const encrypted = Buffer.from(parts[2]!, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Versioned Encryption & Keyring Management (S-09)
 */
export function getDefaultKeyring(): Record<string, string> {
  const primaryKey =
    process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const primaryKeyId = process.env.ENCRYPTION_KEY_ID || 'v1';

  const keyring: Record<string, string> = {
    [primaryKeyId]: primaryKey,
  };

  if (process.env.ENCRYPTION_KEYRING) {
    try {
      const parsed = JSON.parse(process.env.ENCRYPTION_KEYRING);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.assign(keyring, parsed);
      }
    } catch {
      // Keep default
    }
  }

  return keyring;
}

export function encryptDataWithVersion(
  text: string,
  keyId = process.env.ENCRYPTION_KEY_ID || 'v1',
  keyring = getDefaultKeyring(),
): string {
  const keyHex = keyring[keyId];
  if (!keyHex) {
    throw new Error(`Encryption key ID "${keyId}" not found in keyring`);
  }
  const rawEncrypted = encryptData(text, keyHex);
  return `${keyId}:${rawEncrypted}`;
}

export function decryptDataWithVersion(
  cipherText: string,
  keyring = getDefaultKeyring(),
): string {
  const parts = cipherText.split(':');
  if (parts.length === 4) {
    const [keyId, iv, tag, enc] = parts;
    const keyHex = keyring[keyId!];
    if (!keyHex) {
      throw new Error(`Decryption key ID "${keyId}" not found in keyring`);
    }
    return decryptData(`${iv}:${tag}:${enc}`, keyHex);
  }

  if (parts.length === 3) {
    // Legacy format without version prefix -> use primary key
    const primaryKeyId = process.env.ENCRYPTION_KEY_ID || 'v1';
    const keyHex = keyring[primaryKeyId] || process.env.ENCRYPTION_KEY;
    if (!keyHex) {
      throw new Error('No encryption key found for legacy ciphertext');
    }
    return decryptData(cipherText, keyHex);
  }

  throw new Error('Invalid ciphertext format. Expected keyId:iv:tag:content');
}

export function reencryptData(
  cipherText: string,
  targetKeyId: string,
  keyring = getDefaultKeyring(),
): string {
  const plainText = decryptDataWithVersion(cipherText, keyring);
  return encryptDataWithVersion(plainText, targetKeyId, keyring);
}

@Injectable()
export class EncryptionService {
  private readonly keyring: Record<string, string>;
  private readonly activeKeyId: string;

  constructor() {
    this.keyring = getDefaultKeyring();
    this.activeKeyId = process.env.ENCRYPTION_KEY_ID || 'v1';
  }

  encrypt(text: string, keyId?: string): string {
    return encryptDataWithVersion(text, keyId || this.activeKeyId, this.keyring);
  }

  decrypt(cipherText: string): string {
    return decryptDataWithVersion(cipherText, this.keyring);
  }

  reencrypt(cipherText: string, targetKeyId: string): string {
    return reencryptData(cipherText, targetKeyId, this.keyring);
  }

  getKeyring(): Record<string, string> {
    return { ...this.keyring };
  }

  getActiveKeyId(): string {
    return this.activeKeyId;
  }
}

