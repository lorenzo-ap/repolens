import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken, safeEqual, TokenCipher } from "./crypto";

describe("TokenCipher", () => {
  const cipher = new TokenCipher("ab".repeat(32));

  it("round-trips and never repeats ciphertext", () => {
    const a = cipher.encrypt("gho_secret");
    const b = cipher.encrypt("gho_secret");
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe("gho_secret");
    expect(cipher.decrypt(b)).toBe("gho_secret");
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const c = cipher.encrypt("gho_secret");
    const tampered = Buffer.from(c, "base64");
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => cipher.decrypt(tampered.toString("base64"))).toThrow();
    expect(() => new TokenCipher("cd".repeat(32)).decrypt(c)).toThrow();
    expect(() => cipher.decrypt("short")).toThrow();
  });

  it("requires a 32-byte hex key", () => {
    expect(() => new TokenCipher("abc")).toThrow(/64 hex/);
  });
});

describe("session tokens", () => {
  it("stores only a hash and compares in constant time", () => {
    const { token, hash } = generateSessionToken();
    expect(token).not.toBe(hash);
    expect(hashSessionToken(token)).toBe(hash);
    expect(safeEqual(hash, hashSessionToken(token))).toBe(true);
    expect(safeEqual(hash, "nope")).toBe(false);
  });
});
