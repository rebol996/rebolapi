import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token: string, tokenHash: string): boolean {
  const computed = hashToken(token);
  // timingSafeEqual requires equal-length Buffers
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(tokenHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateToken(): string {
  return "rba_" + randomBytes(32).toString("hex");
}
