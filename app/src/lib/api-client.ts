import 'server-only';

import { cookies } from 'next/headers';

function getApiOrigin() {
  return process.env.API_INTERNAL_ORIGIN || '';
}

async function buildCookieHeader() {
  const cookieStore = await cookies();
  if (typeof cookieStore.getAll !== 'function') return '';
  const all = cookieStore.getAll();
  if (all.length === 0) return '';
  return all.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const base = getApiOrigin();
  const url = base ? `${base}${path}` : path;

  const headers = new Headers(init.headers);
  const cookieHeader = await buildCookieHeader();
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  return fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function apiFetchJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
