import { ApiError } from './auth/errors';
import { clearSession, getToken } from './auth/session';

export type ApiOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  /** Skip global 401 session clear (e.g. login attempt). */
  skipAuthClear?: boolean;
};

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  const token = opts.token ?? getToken() ?? undefined;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  let data: T & { error?: string; message?: string };
  try {
    data = (await res.json()) as T & { error?: string; message?: string };
  } catch {
    throw new ApiError(res.status, res.statusText || 'Invalid JSON response');
  }

  if (!res.ok) {
    const message = data.error || data.message || res.statusText;
    // Only clear on 401 (invalid/expired). 403 is authorization, not identity loss.
    if (res.status === 401 && !opts.skipAuthClear) {
      clearSession('unauthorized');
    }
    throw new ApiError(res.status, message);
  }
  return data;
}
