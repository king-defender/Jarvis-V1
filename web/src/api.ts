export type ApiOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.error || data.message || res.statusText);
  }
  return data;
}
