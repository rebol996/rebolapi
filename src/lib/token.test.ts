import { describe, it, expect } from "vitest";
import { hashToken, verifyToken, generateToken } from "@/lib/token";

describe("token", () => {
  describe("generateToken", () => {
    it("generates tokens with rba_ prefix", () => {
      const token = generateToken();
      expect(token).toMatch(/^rba_[a-f0-9]{64}$/);
    });

    it("generates unique tokens", () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
      expect(tokens.size).toBe(100);
    });
  });

  describe("hashToken", () => {
    it("produces a hex string", () => {
      const hash = hashToken("test-token");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("is deterministic", () => {
      expect(hashToken("same")).toBe(hashToken("same"));
    });

    it("produces different hashes for different inputs", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });

  describe("verifyToken", () => {
    it("returns true for matching token and hash", () => {
      const token = generateToken();
      const hash = hashToken(token);
      expect(verifyToken(token, hash)).toBe(true);
    });

    it("returns false for mismatched token", () => {
      const hash = hashToken("token-a");
      expect(verifyToken("token-b", hash)).toBe(false);
    });

    it("returns false for tampered hash", () => {
      const token = generateToken();
      const hash = hashToken(token);
      const tampered = "00000000" + hash.slice(8);
      expect(verifyToken(token, tampered)).toBe(false);
    });
  });
});
