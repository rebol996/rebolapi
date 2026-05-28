"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseFetchOptions<T> {
  initialData?: T;
  immediate?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseFetchResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  fetch: () => Promise<void>;
  mutate: (data: T) => void;
}

export function useFetch<T>(
  url: string | null,
  options: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const { initialData, immediate = true, onSuccess, onError } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!url) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();

      if (mountedRef.current) {
        setData(json.data);
        onSuccess?.(json.data);
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onError?.(error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [url, onSuccess, onError]);

  useEffect(() => {
    mountedRef.current = true;
    const loadData = async () => {
      if (immediate) {
        await fetchData();
      }
    };
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData, immediate]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, fetch: fetchData, mutate };
}

interface UseMutationOptions<T, V> {
  onSuccess?: (data: T, variables: V) => void;
  onError?: (error: Error, variables: V) => void;
}

interface UseMutationResult<T, V> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  mutate: (variables: V) => Promise<T | undefined>;
}

export function useMutation<T, V = Record<string, unknown>>(
  url: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH" = "POST",
  options: UseMutationOptions<T, V> = {}
): UseMutationResult<T, V> {
  const { onSuccess, onError } = options;
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (variables: V): Promise<T | undefined> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = await response.json();
      setData(json.data);
      onSuccess?.(json.data, variables);
      return json.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error, variables);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [url, method, onSuccess, onError]);

  return { data, loading, error, mutate };
}
