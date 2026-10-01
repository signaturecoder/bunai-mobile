import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDesigns, getApiUrl } from '@/lib/api';
import { getAuthHeader } from '@/lib/auth';
import { getQueueState, hasQueueState, setQueueState, subscribe } from '@/lib/queue';

const extractTotalPicks = (item: any): string => {
  const direct = item?.totalPicks;
  if (typeof direct === 'number' && Number.isFinite(direct)) return String(direct);

  const metadataTotal = item?.metadata?.totalPicks;
  if (typeof metadataTotal === 'number' && Number.isFinite(metadataTotal)) return String(metadataTotal);

  const entries = item?.metadata?.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    const lastSubTotal = Number(entries[entries.length - 1]?.subTotal);
    if (Number.isFinite(lastSubTotal) && lastSubTotal > 0) return String(lastSubTotal);
  }

  return '--';
};

export default function DesignsScreen() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [pendingCompileIds, setPendingCompileIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const loadDesigns = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setIsRefreshing(true);
      setError(null);
      try {
        const res = await getDesigns(1, 50, searchQuery || undefined);
        setDesigns(res.designs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load designs');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [searchQuery]
  );

  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  useEffect(() => {
    if (hasQueueState()) {
      setQueuedIds(new Set(getQueueState().map((item: any) => item.id)));
    }

    const unsub = subscribe((_, items) => {
      if (items) {
        setQueuedIds(new Set(items.map((queuedItem: any) => queuedItem.id)));
      }
    });

    return () => unsub();
  }, []);

  const handleRefresh = () => loadDesigns(true);

  const handleAddToCompile = async (item: any) => {
    if (queuedIds.has(item.id) || pendingCompileIds.has(item.id)) {
      return;
    }

    setPendingCompileIds((prev) => new Set(prev).add(item.id));

    try {
      const authHeader = await getAuthHeader();
      const minimal = { id: item.id, filename: item.filename, thumbnail: item.thumbnail };

      if (authHeader && Object.keys(authHeader).length > 0) {
        const base = getApiUrl();
        const cached = hasQueueState() ? getQueueState() : [];
        let existing: any[] = Array.isArray(cached) ? cached : [];

        if (existing.length === 0) {
          const getRes = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
          if (getRes.ok) {
            const json = await getRes.json();
            existing = json.items || [];
          }
        }

        if (existing.some((d) => d.id === minimal.id)) {
          return;
        }

        const optimisticItems = [...existing, minimal];
        setQueueState(optimisticItems);

        const saveRes = await fetch(`${base}/api/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ items: optimisticItems }),
          });

        if (!saveRes.ok) {
          setQueueState(existing);
          throw new Error('Failed to add design to compile queue');
        }

        return;
      }
      // We require authentication for compile/cart on mobile; do not use local fallback
      console.warn('Add to compile attempted while unauthenticated');
      Alert.alert('Not authenticated', 'Please login to add designs to the compile queue.');
    } catch (err) {
      console.warn('Add to compile failed:', err);
      Alert.alert('Add failed', err instanceof Error ? err.message : 'Failed to add design to compile queue');
    } finally {
      setPendingCompileIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const picksValue = extractTotalPicks(item);
    const picksLabel = `${picksValue} picks`;
    const isQueued = queuedIds.has(item.id);
    const isPending = pendingCompileIds.has(item.id);

    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => router.push(`/(app)/design/${item.id}`)} activeOpacity={0.7}>
          <View style={styles.cardIcon}>
            <Ionicons name="image" size={24} color="#7c3aed" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.filename}</Text>
            <Text style={styles.cardPicks}>{picksLabel}</Text>
            <Text style={styles.cardSubtitle}>{item.tags?.join(', ')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
        </TouchableOpacity>

        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterHint}>{isQueued ? 'Ready in compile queue' : 'Add this design to the active compile queue'}</Text>
          <TouchableOpacity
            style={[
              styles.inlineActionButton,
              isQueued && styles.inlineActionButtonSuccess,
              (isPending || isQueued) && styles.inlineActionButtonDisabled,
            ]}
            onPress={() => handleAddToCompile(item)}
            disabled={isPending || isQueued}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#4338ca" />
            ) : (
              <Ionicons
                name={isQueued ? 'checkmark-circle' : 'add-circle-outline'}
                size={16}
                color={isQueued ? '#15803d' : '#4338ca'}
              />
            )}
            <Text style={[styles.inlineActionText, isQueued && styles.inlineActionTextSuccess]}>
              {isPending ? 'Adding...' : isQueued ? 'Added' : 'Add to Compile'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading designs...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadDesigns()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search designs..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => loadDesigns()}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                loadDesigns();
              }}
            >
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={designs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={["#7c3aed"]} tintColor="#7c3aed" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No designs found</Text>
            <Text style={styles.emptySubtext}>Create designs on the web app to see them here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  errorText: { marginTop: 16, fontSize: 16, color: '#ef4444', textAlign: 'center' },
  retryButton: { marginTop: 16, backgroundColor: '#7c3aed', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  searchContainer: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#111827' },
  list: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardPicks: { fontSize: 14, fontWeight: '700', color: '#15803d', marginTop: 2 },
  cardSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 12 },
  cardFooterHint: { flex: 1, fontSize: 12, color: '#6b7280' },
  inlineActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  inlineActionButtonSuccess: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  inlineActionButtonDisabled: {
    opacity: 0.85,
  },
  inlineActionText: { color: '#3730a3', fontSize: 13, fontWeight: '700' },
  inlineActionTextSuccess: { color: '#15803d' },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cardDate: { fontSize: 12, color: '#9ca3af' },
  emptyState: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#6b7280', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});
