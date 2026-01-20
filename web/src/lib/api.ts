export type ApiRequestInit = RequestInit & {
  skipAuthRefresh?: boolean
}

function getApiOrigin() {
  return import.meta.env.VITE_API_ORIGIN || ''
}

export async function apiFetch(path: string, init: ApiRequestInit = {}) {
  const base = getApiOrigin()
  const url = base ? `${base}${path}` : path
  const { skipAuthRefresh, ...requestInit } = init

  const response = await fetch(url, {
    credentials: 'include',
    ...requestInit,
  })

  if (response.status !== 401 || skipAuthRefresh) {
    return response
  }

  const refreshResponse = await fetch(base ? `${base}/api/auth/refresh` : '/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })

  if (!refreshResponse.ok) {
    return response
  }

  return fetch(url, {
    credentials: 'include',
    ...requestInit,
  })
}

export async function apiFetchJSON<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  if (!response.ok) {
    let message = 'Request failed'
    try {
      const data = await response.json()
      if (data?.error) {
        message = data.error
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}
