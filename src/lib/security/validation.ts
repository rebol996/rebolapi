export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMessages(messages: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(messages)) {
    return { valid: false, errors: ["Messages must be an array"] };
  }

  if (messages.length === 0) {
    return { valid: false, errors: ["Messages array is empty"] };
  }

  if (messages.length > 100) {
    errors.push("Too many messages (max 100)");
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
      errors.push(`Message ${i} is invalid`);
      continue;
    }

    const { role, content } = msg as Record<string, unknown>;

    if (!role || !["user", "assistant", "system", "tool"].includes(role as string)) {
      errors.push(`Message ${i} has invalid role`);
    }

    if (!content || typeof content !== "string") {
      errors.push(`Message ${i} has invalid content`);
    } else if ((content as string).length > 100000) {
      errors.push(`Message ${i} content is too long (max 100000 chars)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateEndpointId(id: unknown): ValidationResult {
  if (!id) return { valid: true, errors: [] };
  
  if (typeof id !== "string") {
    return { valid: false, errors: ["Endpoint ID must be a string"] };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { valid: false, errors: ["Endpoint ID must be a valid UUID"] };
  }

  return { valid: true, errors: [] };
}

export function validateStrategy(strategy: unknown): ValidationResult {
  if (!strategy) return { valid: true, errors: [] };
  
  const validStrategies = ["manual", "best_quality", "lowest_cost", "fastest", "most_quota_left", "balanced", "fallback_chain"];
  if (typeof strategy !== "string" || !validStrategies.includes(strategy)) {
    return { valid: false, errors: ["Invalid strategy"] };
  }

  return { valid: true, errors: [] };
}

export function validateTaskType(taskType: unknown): ValidationResult {
  if (!taskType) return { valid: true, errors: [] };
  
  const validTypes = [
    "chat", "analyze", "review", "plan", "refactor", "bug_diagnosis",
    "test_generation", "security_review", "performance_analysis",
    "pr_description", "commit_message", "requirement_breakdown", "custom"
  ];
  
  if (typeof taskType !== "string" || !validTypes.includes(taskType)) {
    return { valid: false, errors: ["Invalid task type"] };
  }

  return { valid: true, errors: [] };
}

export function validateTemperature(temperature: unknown): ValidationResult {
  if (temperature === undefined || temperature === null) return { valid: true, errors: [] };
  
  if (typeof temperature !== "number" || temperature < 0 || temperature > 2) {
    return { valid: false, errors: ["Temperature must be between 0 and 2"] };
  }

  return { valid: true, errors: [] };
}

export function validateMaxTokens(maxTokens: unknown): ValidationResult {
  if (maxTokens === undefined || maxTokens === null) return { valid: true, errors: [] };
  
  if (typeof maxTokens !== "number" || maxTokens < 1 || maxTokens > 1000000) {
    return { valid: false, errors: ["Max tokens must be between 1 and 1000000"] };
  }

  return { valid: true, errors: [] };
}

const gatewayRateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkGatewayTokenRateLimit(tokenId: string, limit: number): boolean {
  const now = Date.now();
  const minuteKey = Math.floor(now / 60000);
  const key = `${tokenId}:${minuteKey}`;
  const state = gatewayRateLimitStore.get(key);

  for (const [storeKey, value] of gatewayRateLimitStore.entries()) {
    if (value.resetAt < now) {
      gatewayRateLimitStore.delete(storeKey);
    }
  }

  if (!state) {
    gatewayRateLimitStore.set(key, { count: 1, resetAt: (minuteKey + 1) * 60000 });
    return true;
  }

  if (state.count >= limit) {
    return false;
  }

  state.count++;
  return true;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 100000);
}
