export interface ScanResult {
  found: boolean;
  patterns: ScanMatch[];
}

export interface ScanMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

const PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "api_key", pattern: /\b(?:sk-|sk_live_|sk_test_|pk_live_|pk_test_|sk-ant-)[a-zA-Z0-9]{20,}\b/g },
  { type: "aws_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "jwt_token", pattern: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g },
  { type: "private_key", pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { type: "database_url", pattern: /\b(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/g },
  { type: "token", pattern: /\b(?:ghp_|gho_|github_pat_|glpat-|xox[bpras]-|sbp_)[a-zA-Z0-9]{20,}\b/g },
  { type: "password", pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^\s'"]{6,}['"]/gi },
  { type: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { type: "phone", pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { type: "credential", pattern: /(?:api_key|apikey|secret|access_token|auth_token|service_role_key)\s*[=:]\s*['"][^\s'"]{8,}['"]/gi },
];

export function scanForSensitiveInfo(text: string): ScanResult {
  const matches: ScanMatch[] = [];

  for (const { type, pattern } of PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return {
    found: matches.length > 0,
    patterns: matches,
  };
}

export function redactSensitiveInfo(text: string, matches: ScanMatch[]): string {
  let result = text;
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  for (const match of sorted) {
    result = result.slice(0, match.start) + `[REDACTED_${match.type.toUpperCase()}]` + result.slice(match.end);
  }
  return result;
}
