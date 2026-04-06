export interface CachedViewPayload<T> {
  savedAt: string;
  data: T;
}

export function readViewCache<T>(key: string): CachedViewPayload<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedViewPayload<T> | null;
    if (!parsed || typeof parsed.savedAt !== "string" || !("data" in parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeViewCache<T>(key: string, data: T): CachedViewPayload<T> {
  const payload: CachedViewPayload<T> = {
    savedAt: new Date().toISOString(),
    data,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(payload));
  }

  return payload;
}
