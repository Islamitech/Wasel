import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt sensitive document metadata or PII with AES-256-GCM
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
 * Decrypt sensitive document metadata or PII
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
