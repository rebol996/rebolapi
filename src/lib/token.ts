import { createHash, randomBytes } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token: string, tokenHash: string): boolean {
  return hashToken(token) === tokenHash;
}

export function generateToken(): string {
  return "rba_" + randomBytes(32).toString("hex");
}
