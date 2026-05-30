import { describe, it, expect } from "vitest";
import { scanForSensitiveInfo, redactSensitiveInfo } from "@/lib/sensitive-scanner";

describe("sensitive-scanner", () => {
  describe("scanForSensitiveInfo", () => {
    it("detects OpenAI-style API keys", () => {
      const result = scanForSensitiveInfo("my key is sk-abc123def456ghi789jkl012mno");
      expect(result.found).toBe(true);
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].type).toBe("api_key");
    });

    it("detects Anthropic-style API keys", () => {
      const result = scanForSensitiveInfo("use sk-ant-abc123def456ghi789jkl012mno");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("api_key");
    });

    it("detects AWS access keys", () => {
      const result = scanForSensitiveInfo("access key: AKIAIOSFODNN7EXAMPLE");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("aws_key");
    });

    it("detects private keys", () => {
      const result = scanForSensitiveInfo("-----BEGIN RSA PRIVATE KEY-----\nMIIE...");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("private_key");
    });

    it("detects database URLs", () => {
      const result = scanForSensitiveInfo("connect to postgres://user:pass@host/db");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("database_url");
    });

    it("detects GitHub tokens", () => {
      const result = scanForSensitiveInfo("token: ghp_abcdefghijklmnopqrstuvwxyz");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("token");
    });

    it("detects Supabase tokens", () => {
      const result = scanForSensitiveInfo("sbp_abcdefghijklmnopqrstuvwxyz");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("token");
    });

    it("detects passwords in assignments", () => {
      const result = scanForSensitiveInfo('password = "supersecret123"');
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("password");
    });

    it("detects credentials with service_role_key", () => {
      const result = scanForSensitiveInfo('service_role_key = "eyJhbGciOiJIUzI1NiJ9longvalue"');
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("credential");
    });

    it("detects emails", () => {
      const result = scanForSensitiveInfo("contact user@example.com for info");
      expect(result.found).toBe(true);
      expect(result.patterns[0].type).toBe("email");
    });

    it("returns not found for clean text", () => {
      const result = scanForSensitiveInfo("Please review this function for bugs.");
      expect(result.found).toBe(false);
      expect(result.patterns).toHaveLength(0);
    });

    it("detects multiple issues in one text", () => {
      const text = 'key=sk-abc123def456ghi789jkl012mno email user@example.com';
      const result = scanForSensitiveInfo(text);
      expect(result.found).toBe(true);
      expect(result.patterns.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("redactSensitiveInfo", () => {
    it("replaces matched content with redaction markers", () => {
      const text = "my key is sk-abc123def456ghi789jkl012mno";
      const scan = scanForSensitiveInfo(text);
      const redacted = redactSensitiveInfo(text, scan.patterns);
      expect(redacted).not.toContain("sk-abc123def456ghi789jkl012mno");
      expect(redacted).toContain("[REDACTED_API_KEY]");
    });

    it("preserves non-sensitive content", () => {
      const text = "Please review this code. key=sk-abc123def456ghi789jkl012mno done.";
      const scan = scanForSensitiveInfo(text);
      const redacted = redactSensitiveInfo(text, scan.patterns);
      expect(redacted).toContain("Please review this code.");
      expect(redacted).toContain("done.");
    });

    it("handles multiple redactions", () => {
      const text = "key=sk-abc123def456ghi789jkl012mno and email user@example.com";
      const scan = scanForSensitiveInfo(text);
      const redacted = redactSensitiveInfo(text, scan.patterns);
      expect(redacted).not.toContain("sk-abc123def456ghi789jkl012mno");
      expect(redacted).not.toContain("user@example.com");
    });

    it("returns original text when no matches", () => {
      const text = "clean text with nothing sensitive";
      const result = redactSensitiveInfo(text, []);
      expect(result).toBe(text);
    });
  });
});
