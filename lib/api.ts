/**
 * API client for communicating with the Next.js backend
 * 
 * All requests to your existing /api/* endpoints
 */

import { getAuthHeader, storeAuth, clearAuth, getRefreshToken, storeAuth as storeAuthData, getTokenInfo, getRefreshInfo } from './auth';
import { emitAuthExpired } from './authEvents';
import { router } from 'expo-router';
import type { AuthResponse, ModFile, ModFileDetail } from './types';

// Your deployed Next.js app URL
// In development, you can use your local IP or ngrok
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gamchadesign-git-staging-sanu-kumars-projects.vercel.app';

// Single-flight refresh promise to coalesce concurrent refresh attempts
let refreshingPromise: Promise<boolean> | null = null;

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function performRefreshWithRetries(): Promise<boolean> {
  // Before attempting refresh, check whether the refresh token has expired
  try {
    const refreshInfo = await getRefreshInfo();
    if (!refreshInfo.refreshToken) return false;
    if (refreshInfo.refreshExpiresAt && Date.now() > refreshInfo.refreshExpiresAt) {
      // Refresh token expired — clear auth and signal expired
      try {
        await clearAuth();
      } catch (e) {}
      try { emitAuthExpired(); } catch (e) {}
      return false;
    }
  } catch (e) {
    // fallback to reading token directly
  }

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  const attempts = [500, 1000, 2000];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const r = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (r.ok) {
        const json = await r.json();
        const newAuth = {
          token: json.accessToken || json.token,
          refreshToken: json.refreshToken || refreshToken,
          user: json.user || undefined,
          expiresAt: json.expiresAt,
        };
        await storeAuthData(newAuth as any);
        return true;
      }

      // 4xx likely means refresh token invalid/expired — stop retrying
      if (r.status >= 400 && r.status < 500) {
        try {
          await clearAuth();
        } catch (e) {
          // ignore
        }
        return false;
      }

      // otherwise treat as transient and retry
    } catch (e) {
      // network error — will retry
    }

    // wait before next attempt
    await delay(attempts[i]);
  }

  // final attempt: clear auth to be safe
  try {
    await clearAuth();
  } catch (e) {}
  return false;
}

async function ensureRefreshed(): Promise<boolean> {
  if (refreshingPromise) return refreshingPromise;
  refreshingPromise = performRefreshWithRetries();
  try {
    const ok = await refreshingPromise;
    return ok;
  } finally {
    refreshingPromise = null;
  }
}

async function tryRefreshOnce(): Promise<boolean> {
  try {
    return await ensureRefreshed();
  } catch (e) {
    return false;
  }
}

// Exported for callers that want to proactively ensure tokens are valid
export { ensureRefreshed };

/**
 * Base fetch wrapper with auth headers
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Single-flight refresh state held in module scope
  // Attempt request; if 401 or token near expiry attempt refresh flow
  let authHeader = await getAuthHeader();

  // proactive refresh: if token expires soon, try refresh first
  try {
    const info = await getTokenInfo();
    if (info.token && info.expiresAt) {
      const now = Date.now();
      const remaining = info.expiresAt - now;
      const PROACTIVE_MS = 60 * 1000; // 60s
      if (remaining > 0 && remaining <= PROACTIVE_MS) {
        await ensureRefreshed();
        authHeader = await getAuthHeader();
      }
    }
  } catch (e) {
    // ignore
  }

  let res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Try refresh token and retry once
    const ok = await tryRefreshOnce();
    if (ok) {
      authHeader = await getAuthHeader();
      res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeader, ...options.headers },
      });
    }
    // If still unauthorized after refresh attempt, clear auth and emit auth-expired event
    if (res.status === 401) {
      try {
        await clearAuth();
      } catch (e) {
        // ignore
      }
      // emit event for UI to handle (e.g., show modal) and navigate to login
      try {
        emitAuthExpired();
      } catch (e) {}
      try {
        router.replace('/(auth)/login');
      } catch (e) {
        // ignore if router not available
      }
    }
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = parsed?.message || parsed?.error || `HTTP ${res.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return res.json();
}

/**
 * Login with phone and password
 * Calls your new /api/auth/mobile endpoint
 */
export async function login(phone: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Invalid phone or password');
  }

  const authData: AuthResponse = await response.json();
  
  // Validate response has required fields
  if (!authData || typeof authData !== 'object') {
    throw new Error('Invalid login response from server');
  }

  if (!authData.token || typeof authData.token !== 'string') {
    throw new Error('Missing or invalid token in response');
  }

  if (!authData.user || typeof authData.user !== 'object') {
    throw new Error('Missing or invalid user data in response');
  }

  if (!authData.expiresAt || typeof authData.expiresAt !== 'string') {
    throw new Error('Missing or invalid expiry date in response');
  }
  
  // Store auth data securely
  await storeAuth(authData);
  
  return authData;
}

/**
 * Fetch all MOD files for the current user
 */
export async function fetchModFiles(search?: string): Promise<ModFile[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  
  const query = params.toString();
  const endpoint = `/api/mods${query ? `?${query}` : ''}`;
  
  const data = await apiFetch<{ modFiles: ModFile[] }>(endpoint);
  return data.modFiles;
}

/**
 * Fetch a single MOD file with full data (including binary)
 */
export async function fetchModFileDetail(id: string): Promise<ModFileDetail> {
  // Append a timestamp to avoid cached responses and ensure latest data
  const ts = Date.now();
  const data = await apiFetch<{ modFile: ModFileDetail }>(`/api/mods/${id}?_=${ts}`);
  return data.modFile;
}

/**
 * Convert base64 MOD file data to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get the API base URL (for debugging)
 */
export function getApiUrl(): string {
  return API_BASE_URL;
}

/**
 * Designs API for mobile
 */
export async function getDesigns(page = 1, limit = 50, search?: string) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (search) params.set('search', search);
  const endpoint = `/api/designs?${params.toString()}`;
  return apiFetch<{ designs: any[]; pagination: any }>(endpoint);
}

export async function getDesign(id: string) {
  return apiFetch<any>(`/api/designs/${id}`);
}

export async function updateDesign(id: string, payload: {
  filename?: string;
  description?: string | null;
  tags?: string[];
  fileData?: string; // base64
  metadata?: any;
  thumbnail?: string | null;
}) {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_BASE_URL}/api/designs/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({ error: 'Update failed' }));
    const message = parsed.message || parsed.error || `HTTP ${res.status}`;
    const error = new Error(message);
    (error as any).code = parsed.error || parsed.code || null;
    throw error;
  }

  return res.json();
}

export async function compileDesign(designId: string) {
  // Single-design compile (server will return base64 and filename)
  const endpoint = `/api/compile/compile-design`;
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ designId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Compile failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function compileMod(designIds: string[], name?: string) {
  const endpoint = `/api/compile/compile-mod`;
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ designIds, name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Compile failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Save a compiled MOD file to the server library (/api/mods)
 * Expects base64 fileData and metadata/designIds returned from /api/compile/compile-mod
 */
export async function saveModToLibrary(payload: {
  name: string;
  description?: string | null;
  fileData: string; // base64
  designIds?: string[];
  metadata?: any;
}) {
  const authHeader = await getAuthHeader();
  const endpoint = `/api/mods`;
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({ error: 'Save failed' }));
    const message = parsed.message || parsed.error || `HTTP ${res.status}`;
    const error = new Error(message);
    // attach server error code if present (e.g., DUPLICATE_FILENAME)
    (error as any).code = parsed.error || parsed.code || null;
    throw error;
  }

  return res.json();
}

/**
 * Create a new design by uploading a generated DB0 file
 */
export async function createDesign(payload: { filename: string; fileData: string; metadata?: any; description?: string | null; tags?: string[]; thumbnail?: string | null }) {
  const authHeader = await getAuthHeader();
  const endpoint = `/api/designs`;
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({ error: 'Create failed' }));
    const message = parsed.message || parsed.error || `HTTP ${res.status}`;
    const error = new Error(message);
    (error as any).code = parsed.error || parsed.code || null;
    throw error;
  }

  return res.json();
}

/**
 * Update an existing MOD file via PUT /api/mods/:id
 */
export async function updateMod(id: string, payload: {
  name?: string;
  description?: string | null;
  fileData?: string; // base64
  designIds?: string[];
  metadata?: any;
}) {
  const authHeader = await getAuthHeader();
  const endpoint = `/api/mods/${id}`;
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const parsed = await res.json().catch(() => ({ error: 'Update failed' }));
    const message = parsed.message || parsed.error || `HTTP ${res.status}`;
    const error = new Error(message);
    (error as any).code = parsed.error || parsed.code || null;
    throw error;
  }

  return res.json();
}
