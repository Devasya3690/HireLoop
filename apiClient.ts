const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('hireloop_token');
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (!token) {
    localStorage.removeItem('hireloop_token');
  } else {
    localStorage.setItem('hireloop_token', token);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (options.auth) {
    const token = getToken();
    if (token) {
      (headers as any).Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'string'
        ? data
        : data?.message || 'Request failed';
    throw new Error(message);
  }

  return data as T;
}

