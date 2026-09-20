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
 * Only strings are stored in SecureStore
 */
export async function storeAuth(authData: AuthResponse): Promise<void> {
  // Validate token exists and is a string
  if (!authData.token || typeof authData.token !== 'string') {
    throw new Error('Invalid token: must be a non-empty string');
  }

  // Validate user object exists
  if (!authData.user || typeof authData.user !== 'object') {
    throw new Error('Invalid user: must be an object');
  }

  // Validate expiresAt is a string
  if (!authData.expiresAt || typeof authData.expiresAt !== 'string') {
    throw new Error('Invalid expiresAt: must be a string');
  }

  // Store as strings only
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
    
    // Validate token is a string
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Check if token is expired
    if (expiresAt && typeof expiresAt === 'string') {
      try {
        const expiryDate = new Date(expiresAt);
        if (expiryDate > new Date()) {
          return token;
        } else {
          // Token expired, clear it
          await clearAuth();
          return null;
        }
      } catch (dateError) {
        console.error('Failed to parse token expiry date:', dateError);
        // If we can't parse the date, treat token as expired
        await clearAuth();
        return null;
      }
    }
    
    return token;
  } catch (error) {
    console.error('Error retrieving token from SecureStore:', error);
    return null;
  }
}

/**
 * Get stored user data
 */
export async function getUser(): Promise<User | null> {
  try {
    const userJson = await SecureStore.getItemAsync(USER_KEY);
    if (!userJson) {
      return null;
    }
    
    // Safely parse JSON, with error handling for malformed data
    try {
      const user = JSON.parse(userJson) as User;
      return user;
    } catch (parseError) {
      console.error('Failed to parse stored user JSON:', parseError);
      // Clear corrupted data
      await clearAuth();
      return null;
    }
  } catch (error) {
    console.error('Error retrieving user from SecureStore:', error);
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
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error(`Error clearing ${TOKEN_KEY}:`, error);
  }

  try {
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch (error) {
    console.error(`Error clearing ${USER_KEY}:`, error);
  }

  try {
    await SecureStore.deleteItemAsync(EXPIRES_KEY);
  } catch (error) {
    console.error(`Error clearing ${EXPIRES_KEY}:`, error);
  }
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
