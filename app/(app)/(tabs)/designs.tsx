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
  Button,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDesigns, getApiUrl } from '@/lib/api';
import { getAuthHeader } from '@/lib/auth';
import { emit } from '@/lib/queue';

export default function DesignsScreen() {
  const [designs, setDesigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
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

  const handleRefresh = () => loadDesigns(true);

  const handleAddToCompile = async (item: any) => {
    try {
      const authHeader = await getAuthHeader();
      const minimal = { id: item.id, filename: item.filename, thumbnail: item.thumbnail };

      if (authHeader && Object.keys(authHeader).length > 0) {
        const base = getApiUrl();
        const getRes = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
        let existing: any[] = [];
        if (getRes.ok) {
          const json = await getRes.json();
          existing = json.items || [];
        }

        if (!existing.some((d) => d.id === minimal.id)) {
          existing.push(minimal);
          await fetch(`${base}/api/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ items: existing }),
          });
          // notify listeners with server count and items
          emit(existing.length, existing);
        }
        return;
      }
      // We require authentication for compile/cart on mobile; do not use local fallback
      console.warn('Add to compile attempted while unauthenticated');
    } catch (err) {
      console.warn('Add to compile failed:', err);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardHeader} onPress={() => router.push(`/(app)/design/${item.id}`)} activeOpacity={0.7}>
          <View style={styles.cardIcon}>
            <Ionicons name="image" size={24} color="#7c3aed" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.filename}</Text>
            <Text style={styles.cardSubtitle}>{item.tags?.join(', ')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#9ca3af" />
        </TouchableOpacity>

        <View style={styles.section}>
          <Button title="Add to Compile" onPress={() => handleAddToCompile(item)} />
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  cardDate: { fontSize: 12, color: '#9ca3af' },
  emptyState: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#6b7280', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
  section: { backgroundColor: '#fff', marginTop: 16, padding: 16 },
});
