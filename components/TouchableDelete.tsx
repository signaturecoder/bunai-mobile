import React from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { getApiUrl } from '@/lib/api';
import { getAuthHeader } from '@/lib/auth';

export default function TouchableDelete({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const handleDelete = async () => {
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert('Delete MOD', 'Are you sure you want to delete this MOD file?', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
    if (!ok) return;

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader || Object.keys(authHeader).length === 0) {
        Alert.alert('Not authenticated', 'Please login to delete MOD files.');
        return;
      }

      const base = getApiUrl();
      const res = await fetch(`${base}/api/mods/${id}`, { method: 'DELETE', headers: { ...authHeader } });
      if (!res.ok) throw new Error('Delete failed');
      if (onDeleted) onDeleted();
    } catch (err) {
      Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <TouchableOpacity onPress={handleDelete} style={{ backgroundColor: '#fee2e2', padding: 10, borderRadius: 8 }}>
      <Text style={{ color: '#b91c1c', textAlign: 'center', fontWeight: '600' }}>Delete MOD</Text>
    </TouchableOpacity>
  );
}
