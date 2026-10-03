import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getApiUrl, compileMod, saveModToLibrary, updateMod } from '@/lib/api';
import { getEditContext, clearEditContext } from '../../../lib/cart';
import { emitMods } from '@/lib/queue';
import { getAuthHeader } from '@/lib/auth';
import { emit, subscribe, getQueueState, hasQueueState, setQueueState, getQueueVersion } from '@/lib/queue';

export default function CompileScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compiled, setCompiled] = useState<any | null>(null);
  const [modalName, setModalName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editCtx, setEditCtx] = useState<any | null>(null);
  const [saveMode, setSaveMode] = useState<'new' | 'update'>('new');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const router = useRouter();

  const maxSlots = 31;
  const totalDesigns = items.length;
  const availableSlots = maxSlots - totalDesigns;
  const slotUsagePercent = Math.round((totalDesigns / maxSlots) * 100);
  const slotUsageColor = totalDesigns > 25 ? '#dc2626' : totalDesigns > 15 ? '#f59e0b' : '#16a34a';

  const activeModuleName = useMemo(() => {
    if (modalName.trim()) return modalName.trim();
    if (compiled?.filename) return String(compiled.filename).replace(/\.MOD$/i, '');
    return 'Not set';
  }, [compiled?.filename, modalName]);

  useEffect(() => {
    async function load() {
      const requestVersion = getQueueVersion();

      try {
        if (hasQueueState()) {
          setItems(getQueueState());
        }

        const authHeader = await getAuthHeader();
        if (authHeader && Object.keys(authHeader).length > 0) {
          const base = getApiUrl();
          const res = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
          if (res.ok) {
            const json = await res.json();
            if (getQueueVersion() === requestVersion) {
              setQueueState(json.items || []);
            }
            return;
          }
        }

        // If unauthenticated or fetch failed, show empty list (mobile requires auth)
        if (!hasQueueState()) {
          setItems([]);
        }
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
      const suggested = (res.filename || `Temp.MOD`).replace(/\.MOD$/i, '');
      // If edit context exists, prefill with existing mod name and mark editing
      const edit = await getEditContext();
      setEditCtx(edit || null);
      setModalName((edit && edit.modName) ? edit.modName : suggested);
      // Safety default: create a new MOD unless user explicitly chooses update.
      setSaveMode('new');
    } catch (err) {
      Alert.alert('Compile failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;

    Alert.alert('Clear compile queue?', 'This will remove all selected designs from the compile queue.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            const authHeader = await getAuthHeader();
            if (!authHeader || Object.keys(authHeader).length === 0) {
              Alert.alert('Not authenticated', 'Please login to manage your compile queue.');
              return;
            }
            const base = getApiUrl();
            await fetch(`${base}/api/compile`, { method: 'DELETE', headers: { ...authHeader } });
            setQueueState([]);
          } catch (err) {
            Alert.alert('Clear failed', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  const handleOpenSummary = () => {
    setSummaryOpen(true);
  };

  const handleCloseSummary = () => {
    setSummaryOpen(false);
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
      // Update existing MOD only when user explicitly opts into update mode.
      const edit = editCtx || await getEditContext();
      const shouldUpdate = Boolean(edit && edit.editModId && saveMode === 'update');

      if (shouldUpdate) {
        const res = await updateMod(edit.editModId, {
          name: modalName.trim(),
          description: null,
          fileData: base64,
          designIds: designIds || items.map((i) => i.id),
          metadata: metadata || {},
        });
        // clear edit context after successful update
        await clearEditContext();
        // notify listeners and navigate to updated mod detail
        try { emitMods(edit.editModId); } catch (_) {}
        router.replace('/(app)/(tabs)/mods');
      } else {
        const res = await saveModToLibrary({
          name: modalName.trim(),
          description: null,
          fileData: base64,
          designIds: designIds || items.map((i) => i.id),
          metadata: metadata || {},
        });
        const newId = res?.modFile?.id || null;
        if (newId) {
          try { emitMods(newId); } catch (_) {}
          router.replace('/(app)/(tabs)/mods');
        } else {
          router.replace('/(app)/(tabs)/mods');
        }
      }

      // Avoid stale edit context causing accidental updates on next compile.
      await clearEditContext();

      // Clear server cart
      const authHeader = await getAuthHeader();
      if (authHeader && Object.keys(authHeader).length > 0) {
        const base = getApiUrl();
        await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify({ items: [] }) });
      }

      setQueueState([]);
      setCompiled(null);
      setModalName('');
      setEditCtx(null);
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
    setSaveMode('new');
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
      setQueueState(updated);
      await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify({ items: updated }) });
    } catch (err) {
      Alert.alert('Remove failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            items.length > 0 ? (
              <TouchableOpacity style={styles.headerGhostButton} onPress={handleClearAll}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.headerGhostButtonText}>Clear</Text>
              </TouchableOpacity>
            ) : null
          ),
        }}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Compile Queue</Text>
          <Text style={styles.headerHint}>{totalDesigns} design{totalDesigns !== 1 ? 's' : ''} selected for MOD compilation</Text>
        </View>
        <TouchableOpacity style={styles.summaryTrigger} onPress={handleOpenSummary}>
          <Ionicons name="stats-chart-outline" size={18} color="#4338ca" />
          <Text style={styles.summaryTriggerText}>Summary</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemRow}>
              <View style={styles.slotBadge}><Text style={styles.slotBadgeText}>{items.findIndex((queued) => queued.id === item.id) + 1}</Text></View>
              <View style={styles.itemMeta}>
                <Text style={styles.itemTitle}>{item.filename || item.id}</Text>
                <Text style={styles.itemSubtitle}>Slot {items.findIndex((queued) => queued.id === item.id) + 1} of {maxSlots}</Text>
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={() => handleRemove(item.id)}>
                <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={56} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No items in compile queue</Text>
            <Text style={styles.emptyText}>Add designs from the library to fill up to 31 slots before compiling.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.bottomActionBar}>
        <TouchableOpacity style={styles.bottomSummaryButton} onPress={handleOpenSummary}>
          <Text style={styles.bottomSummaryTitle}>{totalDesigns}/{maxSlots} slots</Text>
          <Text style={styles.bottomSummaryMeta}>{availableSlots} free</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomCompileButton, (isCompiling || items.length === 0) && styles.bottomCompileButtonDisabled]}
          onPress={handleCompile}
          disabled={isCompiling || items.length === 0}
        >
          {isCompiling ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="layers-outline" size={18} color="#fff" />
              <Text style={styles.bottomCompileButtonText}>Compile</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={summaryOpen} transparent animationType="slide" onRequestClose={handleCloseSummary}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetOverlayTap} activeOpacity={1} onPress={handleCloseSummary} />
          <View style={styles.summarySheet}>
            <View style={styles.summaryHandle} />
            <Text style={styles.summaryTitle}>Compile Summary</Text>
            <Text style={styles.summarySubtitle}>Track module capacity before compiling. A MOD file supports up to 31 slots.</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Module Name</Text>
                <Text style={styles.summaryValueAccent}>{activeModuleName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Designs</Text>
                <Text style={styles.summaryValue}>{totalDesigns}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Available Slots</Text>
                <Text style={[styles.summaryValue, { color: '#16a34a' }]}>{availableSlots}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Maximum Slots</Text>
                <Text style={styles.summaryValue}>{maxSlots}</Text>
              </View>

              <View style={styles.progressBlock}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Slot Usage</Text>
                  <Text style={styles.progressPercent}>{slotUsagePercent}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${(totalDesigns / maxSlots) * 100}%`, backgroundColor: slotUsageColor }]} />
                </View>
                {totalDesigns > 25 ? <Text style={styles.summaryWarning}>Almost at maximum capacity.</Text> : null}
              </View>
            </View>

            <TouchableOpacity style={styles.sheetCloseButton} onPress={handleCloseSummary}>
              <Text style={styles.sheetCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save modal - shown after successful compile to ask for module name */}
      {compiled && (
        <Modal visible={true} animationType="slide" transparent={true}>
          <View style={styles.modalBackdrop}>
            <View style={styles.saveModal}>
              <Text style={styles.saveModalTitle}>{saveMode === 'update' ? 'Update Module' : 'Save New Module'}</Text>
              <Text style={styles.saveModalHint}>
                {saveMode === 'update'
                  ? 'Update the existing MOD file with this newly compiled output.'
                  : 'Create a new MOD file from this compiled output.'}
              </Text>

              {editCtx && editCtx.editModId ? (
                <View style={styles.modeToggleRow}>
                  <TouchableOpacity
                    onPress={() => setSaveMode('new')}
                    style={[styles.modeToggleButton, saveMode === 'new' && styles.modeToggleButtonActiveBlue]}
                  >
                    <Text style={[styles.modeToggleButtonText, saveMode === 'new' && styles.modeToggleButtonTextBlue]}>Save as New</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSaveMode('update')}
                    style={[styles.modeToggleButton, saveMode === 'update' && styles.modeToggleButtonActivePurple]}
                  >
                    <Text style={[styles.modeToggleButtonText, saveMode === 'update' && styles.modeToggleButtonTextPurple]}>Update Existing</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TextInput value={modalName} onChangeText={(v) => { setModalName(v); setModalError(null); }} style={styles.saveModalInput} />
              {modalError ? (
                <Text style={styles.modalError}>{modalError}</Text>
              ) : null}
              <View style={styles.saveModalActions}>
                <TouchableOpacity onPress={handleCancelSave} style={styles.saveModalCancelButton}>
                  <Text style={styles.saveModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmSave} style={styles.saveModalConfirmButton} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveModalConfirmText}>{saveMode === 'update' ? 'Update' : 'Save'}</Text>}
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
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  headerHint: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  headerGhostButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  headerGhostButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  summaryTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  summaryTriggerText: { color: '#3730a3', fontWeight: '700' },
  listContent: { paddingBottom: 110 },
  item: { backgroundColor: '#fff', padding: 16, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  slotBadgeText: { color: '#7c3aed', fontSize: 17, fontWeight: '800' },
  itemMeta: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  removeButton: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  empty: { paddingHorizontal: 24, paddingTop: 72, alignItems: 'center' },
  emptyTitle: { marginTop: 16, fontSize: 18, fontWeight: '800', color: '#111827' },
  emptyText: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#6b7280', textAlign: 'center' },
  bottomActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  bottomSummaryButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  bottomSummaryTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  bottomSummaryMeta: { marginTop: 2, fontSize: 12, color: '#6b7280' },
  bottomCompileButton: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: '#7c3aed', paddingVertical: 14 },
  bottomCompileButtonDisabled: { opacity: 0.45 },
  bottomCompileButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheetOverlayTap: { flex: 1 },
  summarySheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22 },
  summaryHandle: { alignSelf: 'center', width: 52, height: 5, borderRadius: 999, backgroundColor: '#d1d5db', marginBottom: 16 },
  summaryTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  summarySubtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: '#6b7280' },
  summaryCard: { marginTop: 18, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 18, padding: 16, backgroundColor: '#fafafa', gap: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  summaryValue: { fontSize: 19, fontWeight: '800', color: '#111827' },
  summaryValueAccent: { fontSize: 18, fontWeight: '800', color: '#7c3aed' },
  progressBlock: { marginTop: 4, padding: 14, borderRadius: 16, backgroundColor: '#fff' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  progressPercent: { fontSize: 14, fontWeight: '700', color: '#374151' },
  progressTrack: { width: '100%', height: 12, borderRadius: 999, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  progressFill: { height: 12, borderRadius: 999 },
  summaryWarning: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#dc2626' },
  sheetCloseButton: { marginTop: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 14 },
  sheetCloseButtonText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  saveModal: { width: '90%', backgroundColor: '#fff', padding: 18, borderRadius: 16 },
  saveModalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: '#111827' },
  saveModalHint: { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 18 },
  modeToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeToggleButton: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', alignItems: 'center' },
  modeToggleButtonActiveBlue: { borderColor: '#2563eb', backgroundColor: '#dbeafe' },
  modeToggleButtonActivePurple: { borderColor: '#7c3aed', backgroundColor: '#f3e8ff' },
  modeToggleButtonText: { color: '#374151', fontWeight: '700' },
  modeToggleButtonTextBlue: { color: '#1d4ed8' },
  modeToggleButtonTextPurple: { color: '#6d28d9' },
  saveModalInput: { borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 10, marginBottom: 8, backgroundColor: '#fff' },
  modalError: { color: '#ef4444', marginBottom: 8 },
  saveModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  saveModalCancelButton: { paddingVertical: 10, paddingHorizontal: 12 },
  saveModalCancelText: { color: '#6b7280', fontWeight: '600' },
  saveModalConfirmButton: { backgroundColor: '#111827', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, minWidth: 88, alignItems: 'center' },
  saveModalConfirmText: { color: '#fff', fontWeight: '700' },
});
