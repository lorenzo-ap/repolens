import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class TokenCipher {
  private readonly key: Buffer;

  /** @param hexKey 32 bytes, hex encoded (64 characters). */
  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");
    }
    this.key = Buffer.from(hexKey, "hex");
  }

  /** Returns base64(iv || tag || ciphertext). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, data]).toString("base64");
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < IV_BYTES + TAG_BYTES) throw new Error("ciphertext too short");
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const data = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}

/** Generates a session token for the cookie and the hash stored in the database. */
export function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}
