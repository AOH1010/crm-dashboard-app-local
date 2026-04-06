const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();

function normalizeApiBaseUrl(value: string) {
  if (!value) {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const API_BASE_URL = normalizeApiBaseUrl(rawApiBaseUrl);

export function buildApiUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${safePath}` : safePath;
}
