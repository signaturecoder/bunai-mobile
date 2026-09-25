import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, Button } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDesign, compileDesign } from '@/lib/api';
import { saveAs } from 'file-saver';
import * as FileSystem from 'expo-file-system';

export default function DesignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [design, setDesign] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const res = await getDesign(id);
        setDesign(res.design || res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load design');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const handleCompile = async () => {
    if (!id) return;
    setIsCompiling(true);
    try {
      const res = await compileDesign(id);
      // Expecting { base64, filename }
      const { base64, filename } = res;
      if (!base64) throw new Error('Compile returned no data');

      // Save to local filesystem
      const fileUri = `${FileSystem.cacheDirectory}${filename || `design-${id}.MOD`}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      Alert.alert('Compiled', `Saved to ${fileUri}`);
    } catch (err) {
      Alert.alert('Compile failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCompiling(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading design...</Text>
      </View>
    );
  }

  if (error || !design) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={64} color="#ef4444" />
        <Text style={styles.errorText}>{error || 'Design not found'}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: design.filename }} />
      <ScrollView style={styles.container}>
        <View style={styles.headerCard}>
          <Ionicons name="image" size={48} color="#7c3aed" />
          <Text style={styles.headerTitle}>{design.filename}</Text>
          <Text style={styles.headerSubtitle}>{design.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Text>Tags: {design.tags?.join(', ') || '—'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compile</Text>
          <Button title={isCompiling ? 'Compiling...' : 'Compile to MOD'} onPress={handleCompile} disabled={isCompiling} />
        </View>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#6b7280' },
  errorText: { marginTop: 16, fontSize: 16, color: '#ef4444', textAlign: 'center' },
  headerCard: { backgroundColor: '#fff', padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  headerSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  section: { backgroundColor: '#fff', marginTop: 16, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
});
