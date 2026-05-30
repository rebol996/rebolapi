import { describe, it, expect, beforeAll } from "vitest";

// Set up the required env var before importing crypto
beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = "test-secret-for-unit-tests-only";
});

// Dynamic import so env is set first
const { encrypt, decrypt, decryptLegacy, createKeyPreview } = await import("@/lib/crypto");

describe("crypto", () => {
  describe("encrypt / decrypt round-trip", () => {
    it("encrypts and decrypts a simple string", () => {
      const plaintext = "sk-abc123def456ghi789";
      const ciphertext = encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const ciphertext = encrypt("");
      expect(decrypt(ciphertext)).toBe("");
    });

    it("handles unicode content", () => {
      const plaintext = "你好世界🔑";
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("handles long keys", () => {
      const plaintext = "a".repeat(10000);
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("produces different ciphertext for same input (random salt+IV)", () => {
      const plaintext = "same-key";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });
  });

  describe("decrypt error handling", () => {
    it("throws on invalid base64", () => {
      expect(() => decrypt("not-valid-base64!!!")).toThrow();
    });

    it("throws on truncated ciphertext", () => {
      const short = Buffer.alloc(10).toString("base64");
      expect(() => decrypt(short)).toThrow();
    });

    it("throws on tampered ciphertext", () => {
      const ciphertext = encrypt("test");
      const buf = Buffer.from(ciphertext, "base64");
      // Flip a byte in the encrypted portion
      buf[buf.length - 1] ^= 0xff;
      expect(() => decrypt(buf.toString("base64"))).toThrow();
    });
  });

  describe("decryptLegacy", () => {
    it("decrypts data encrypted with the old hardcoded salt format", async () => {
      // Encrypt with the legacy format for testing
      const { createCipheriv, scryptSync, randomBytes } = await import("crypto");
      const secret = process.env.API_KEY_ENCRYPTION_SECRET!;
      const key = scryptSync(secret, "rebol-api-salt", 32);
      const iv = randomBytes(16);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const plaintext = "legacy-key-value";
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacy = Buffer.concat([iv, tag, encrypted]).toString("base64");

      expect(decryptLegacy(legacy)).toBe(plaintext);
    });
  });

  describe("createKeyPreview", () => {
    it("shows first 4 and last 4 characters", () => {
      expect(createKeyPreview("sk-abc123def456")).toBe("sk-a...f456");
    });

    it("returns *** for short keys", () => {
      expect(createKeyPreview("short")).toBe("***");
      expect(createKeyPreview("12345678")).toBe("***");
    });

    it("handles 9-character keys", () => {
      expect(createKeyPreview("123456789")).toBe("1234...6789");
    });
  });
});
