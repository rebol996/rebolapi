export const PROVIDER_FETCH_TIMEOUT_MS = 30000;

export function createTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS);
}
