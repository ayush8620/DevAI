import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
// MASTER_ENCRYPTION_KEY should be at least 32 bytes (256 bits)
const ENCRYPTION_KEY = Buffer.from(config.MASTER_ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag,
  };
}

export function decrypt(data: { ciphertext: string; iv: string; authTag: string }): string {
  const iv = Buffer.from(data.iv, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(data.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const rawKey = crypto.randomBytes(32).toString('hex');
  const key = `dvai_${rawKey}`;
  const prefix = key.substring(0, 12);
  const hash = hashApiKey(key);
  
  return { key, prefix, hash };
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  const lastFour = key.substring(key.length - 4);
  return `sk-••••••${lastFour}`;
}
