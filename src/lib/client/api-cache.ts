type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 20_000;

export async function cachedJson<T>(path: string, options: { force?: boolean; ttlMs?: number } = {}): Promise<T> {
  const now = Date.now();
  const cached = cache.get(path);
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  if (!options.force && inflight.has(path)) {
    return inflight.get(path) as Promise<T>;
  }

  const request = fetch(path)
    .then((res) => res.json())
    .then((data) => {
      cache.set(path, {
        data,
        expiresAt: Date.now() + (options.ttlMs ?? DEFAULT_TTL_MS),
      });
      return data;
    })
    .finally(() => {
      inflight.delete(path);
    });

  inflight.set(path, request);
  return request as Promise<T>;
}

export function warmJson(path: string) {
  void cachedJson(path).catch(() => undefined);
}

export function invalidateJson(path: string) {
  cache.delete(path);
}
