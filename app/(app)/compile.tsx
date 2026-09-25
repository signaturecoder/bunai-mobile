import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Button,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getApiUrl, compileMod, saveModToLibrary } from '@/lib/api';
import { getAuthHeader } from '@/lib/auth';
import { emit, subscribe } from '@/lib/queue';

export default function CompileScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiled, setCompiled] = useState<any | null>(null);
  const [modalName, setModalName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const authHeader = await getAuthHeader();
        if (authHeader && Object.keys(authHeader).length > 0) {
          const base = getApiUrl();
          const res = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
          if (res.ok) {
            const json = await res.json();
            setItems(json.items || []);
            return;
          }
        }

        // If unauthenticated or fetch failed, show empty list (mobile requires auth)
        setItems([]);
      } catch (err) {
        console.warn('Failed to load compile queue', err);
      }
    }
    load();
    const unsub = subscribe((count, items) => {
      if (items) setItems(items);
    });
    return () => unsub();
  }, []);

  const handleCompile = async () => {
    if (items.length === 0) return;
    setIsCompiling(true);
    try {
      const ids = items.map((i) => i.id);
      const res = await compileMod(ids);
      // Store result and show modal to ask for name
      setCompiled(res);
      const suggested = (res.filename || `compiled-${Date.now()}.MOD`).replace(/\.MOD$/i, '');
      setModalName(suggested);
    } catch (err) {
      Alert.alert('Compile failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleClearAll = async () => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader || Object.keys(authHeader).length === 0) {
        Alert.alert('Not authenticated', 'Please login to manage your compile queue.');
        return;
      }
      const base = getApiUrl();
      await fetch(`${base}/api/compile`, { method: 'DELETE', headers: { ...authHeader } });
      setItems([]);
      emit(0);
    } catch (err) {
      Alert.alert('Clear failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleConfirmSave = async () => {
    if (!compiled) return;
    const { base64, metadata, designIds } = compiled;
    if (!modalName || modalName.trim().length === 0) {
      Alert.alert('Name required', 'Please enter a name for the MOD file');
      return;
    }

    setModalError(null);
    setIsSaving(true);
    try {
      await saveModToLibrary({
        name: modalName.trim(),
        description: null,
        fileData: base64,
        designIds: designIds || items.map((i) => i.id),
        metadata: metadata || {},
      });

      // Clear server cart
      const authHeader = await getAuthHeader();
      if (authHeader && Object.keys(authHeader).length > 0) {
        const base = getApiUrl();
        await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify({ items: [] }) });
      }

      setItems([]);
      emit(0);
      setCompiled(null);
      setModalName('');
      // Navigate to Mods list
      router.replace('/(app)/mods');
    } catch (err) {
      const e = err as any;
      // Check for duplicate filename server error
      if (e && (e.code === 'DUPLICATE_FILENAME' || (typeof e.message === 'string' && e.message.toLowerCase().includes('already exists')))) {
        setModalError(e.message || 'A MOD file with that name already exists');
        return;
      }
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelSave = () => {
    setCompiled(null);
    setModalName('');
  };

  const handleRemove = async (id: string) => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader || Object.keys(authHeader).length === 0) {
        Alert.alert('Not authenticated', 'Please login to manage your compile queue.');
        return;
      }
      const base = getApiUrl();
      const res = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
      if (!res.ok) throw new Error('Failed to fetch cart');
      const json = await res.json();
      const existing: any[] = json.items || [];
      const updated = existing.filter((i) => i.id !== id);
      await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify({ items: updated }) });
      setItems(updated);
      emit(updated.length);
    } catch (err) {
      Alert.alert('Remove failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Clear All" onPress={handleClearAll} />
          <Button title={isCompiling ? 'Compiling...' : 'Click to Compile'} onPress={handleCompile} disabled={isCompiling || items.length === 0} />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>{item.filename || item.id}</Text>
            <Text style={styles.itemSubtitle}>{item.thumbnail ? 'Has thumbnail' : ''}</Text>
            <View style={{ marginTop: 8 }}>
              <Button title="Remove" onPress={() => handleRemove(item.id)} />
            </View>
          </View>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text>No items in compile queue</Text></View>}
      />
      {/* Save modal - shown after successful compile to ask for module name */}
      {compiled && (
        <Modal visible={true} animationType="slide" transparent={true}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ width: '90%', backgroundColor: '#fff', padding: 16, borderRadius: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Save Module</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Enter a name for the compiled MOD file</Text>
              <TextInput value={modalName} onChangeText={(v) => { setModalName(v); setModalError(null); }} style={{ borderWidth: 1, borderColor: '#e5e7eb', padding: 10, borderRadius: 6, marginBottom: 8 }} />
              {modalError ? (
                <Text style={{ color: '#ef4444', marginBottom: 8 }}>{modalError}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={handleCancelSave} style={{ paddingVertical: 10, paddingHorizontal: 12, marginRight: 8 }}>
                  <Text style={{ color: '#6b7280' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmSave} style={{ paddingVertical: 10, paddingHorizontal: 12 }} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator /> : <Text style={{ color: '#111', fontWeight: '700' }}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  item: { backgroundColor: '#fff', padding: 16, marginHorizontal: 16, marginBottom: 12, borderRadius: 8 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  empty: { padding: 24, alignItems: 'center' },
});
