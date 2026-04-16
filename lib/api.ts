/**
 * API client for communicating with the Next.js backend
 * 
 * All requests to your existing /api/* endpoints
 */

import { getAuthHeader, storeAuth, clearAuth } from './auth';
import type { AuthResponse, ModFile, ModFileDetail } from './types';

// Your deployed Next.js app URL
// In development, you can use your local IP or ngrok
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://your-app.vercel.app';

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
