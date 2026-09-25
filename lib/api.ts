/**
 * API client for communicating with the Next.js backend
 * 
 * All requests to your existing /api/* endpoints
 */

import { getAuthHeader, storeAuth, clearAuth } from './auth';
import type { AuthResponse, ModFile, ModFileDetail } from './types';

// Your deployed Next.js app URL
// In development, you can use your local IP or ngrok
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gamchadesign-git-staging-sanu-kumars-projects.vercel.app';

/**
 * Base fetch wrapper with auth headers
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeader = await getAuthHeader();
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired or invalid, clear auth
      await clearAuth();
      throw new Error('Session expired. Please login again.');
    }
    
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
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
  const data = await apiFetch<{ modFile: ModFileDetail }>(`/api/mods/${id}`);
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
