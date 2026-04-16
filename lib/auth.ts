/**
 * Authentication utilities for mobile app
 * Uses expo-secure-store for secure token storage
 */

import * as SecureStore from 'expo-secure-store';
import type { User, AuthResponse } from './types';

const TOKEN_KEY = 'bunai_auth_token';
const USER_KEY = 'bunai_user';
const EXPIRES_KEY = 'bunai_token_expires';

/**
 * Store authentication data securely
 */
export async function storeAuth(authData: AuthResponse): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, authData.token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(authData.user));
  await SecureStore.setItemAsync(EXPIRES_KEY, authData.expiresAt);
}

/**
 * Get stored auth token
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const expiresAt = await SecureStore.getItemAsync(EXPIRES_KEY);
    
    // Check if token is expired
    if (token && expiresAt) {
      const expiryDate = new Date(expiresAt);
      if (expiryDate > new Date()) {
        return token;
      } else {
        // Token expired, clear it
        await clearAuth();
        return null;
      }
    }
    
    return token;
  } catch {
    return null;
  }
}

/**
 * Get stored user data
 */
export async function getUser(): Promise<User | null> {
  try {
    const userJson = await SecureStore.getItemAsync(USER_KEY);
    if (userJson) {
      return JSON.parse(userJson) as User;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null;
}

/**
 * Clear all auth data (logout)
 */
export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_KEY);
}

/**
 * Get auth header for API requests
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  return {};
}
