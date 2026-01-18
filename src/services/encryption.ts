import crypto from 'crypto';

const getKey = (): Buffer => {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('Missing ENCRYPTION_KEY (base64, 32 bytes) for token encryption');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${key.length}`);
  }
  return key;
};

/**
 * AES-256-GCM encrypt. Output is base64 of: iv(12) || tag(16) || ciphertext
 */
export const encryptString = (plaintext: string): string => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
};

export const decryptString = (b64: string): string => {
  const key = getKey();
  const raw = Buffer.from(String(b64), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};


