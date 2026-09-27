/**
 * Minimal cart/edit context helpers for mobile app.
 * This stores edit context and provides helper wrappers around server compile cart operations.
 */
import { getAuthHeader } from './auth';
import { getApiUrl } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EDIT_KEY = 'editContext';

export async function clearCart() {
  const auth = await getAuthHeader();
  const base = getApiUrl();
  await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ items: [] }) });
}

export async function addToCart(item: { id: string; filename?: string; thumbnail?: string | null }) {
  const auth = await getAuthHeader();
  const base = getApiUrl();
  // fetch current
  const res = await fetch(`${base}/api/compile`, { headers: { ...auth } });
  const json = await res.json().catch(() => ({ items: [] }));
  const existing: any[] = json.items || [];
  existing.push({ id: item.id, filename: item.filename, thumbnail: item.thumbnail });
  await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ items: existing }) });
}

export async function setEditModId(id: string) {
  const v = { editModId: id };
  try {
    await AsyncStorage.setItem(EDIT_KEY, JSON.stringify(v));
  } catch (e) {
    // ignore
  }
}

export async function setModName(name: string) {
  const ctx = await getEditContext();
  const v = { ...(ctx || {}), modName: name };
  try {
    await AsyncStorage.setItem(EDIT_KEY, JSON.stringify(v));
  } catch (e) {
    // ignore
  }
}

export async function getEditContext(): Promise<{ editModId?: string; modName?: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(EDIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

export async function clearEditContext() {
  try {
    await AsyncStorage.removeItem(EDIT_KEY);
  } catch (e) {}
}

export default {};
