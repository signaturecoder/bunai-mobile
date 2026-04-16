import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchModFileDetail, base64ToUint8Array } from '@/lib/api';
import type { ModFileDetail, WriteProgress } from '@/lib/types';
import UsbSendButton from '@/components/UsbSendButton';

export default function ModDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [modFile, setModFile] = useState<ModFileDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModFile = async () => {
      if (!id) return;

      try {
        const data = await fetchModFileDetail(id);
        setModFile(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load MOD file');
      } finally {
        setIsLoading(false);
      }
    };

    loadModFile();
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading MOD file...</Text>
      </View>
    );
  }

  if (error || !modFile) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={64} color="#ef4444" />
        <Text style={styles.errorText}>{error || 'MOD file not found'}</Text>
      </View>
    );
  }

  const modData = base64ToUint8Array(modFile.fileData);

  return (
    <>
      <Stack.Screen
        options={{
          title: `${modFile.name}.MOD`,
          headerStyle: { backgroundColor: '#7c3aed' },
          headerTintColor: '#fff',
        }}
      />
      <ScrollView style={styles.container}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="document-text" size={32} color="#7c3aed" />
          </View>
          <Text style={styles.headerTitle}>{modFile.name}.MOD</Text>
          <Text style={styles.headerSubtitle}>
            {modFile.metadata?.usedSlots || modFile.designs.length} designs •{' '}
            {modData.length} bytes
          </Text>
        </View>

        {/* Designs List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Designs</Text>
          {modFile.designs.length === 0 ? (
            <Text style={styles.emptyText}>No designs in this MOD file</Text>
          ) : (
            modFile.designs.map((design, index) => (
              <View key={design.id} style={styles.designItem}>
                <View style={styles.designIndex}>
                  <Text style={styles.designIndexText}>{design.slotIndex}</Text>
                </View>
                <View style={styles.designInfo}>
                  <Text style={styles.designName}>{design.design.filename}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Meta Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>
              {new Date(modFile.createdAt).toLocaleString()}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Created By</Text>
            <Text style={styles.metaValue}>
              {modFile.createdBy.name || modFile.createdBy.email}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>File Size</Text>
            <Text style={styles.metaValue}>{modData.length} bytes</Text>
          </View>
        </View>

        {/* Send Button */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send to Machine</Text>
          {Platform.OS === 'android' ? (
            <UsbSendButton
              modData={modData}
              fileName={`${modFile.name}.MOD`}
              onSuccess={() => {
                Alert.alert('Success', 'MOD file sent to machine successfully!');
              }}
              onError={(error) => {
                Alert.alert('Error', error);
              }}
            />
          ) : (
            <View style={styles.unsupportedBox}>
              <Ionicons name="warning" size={24} color="#f59e0b" />
              <Text style={styles.unsupportedText}>
                USB Serial is only supported on Android devices.
                Use the web app with bunai-bridge on iOS.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  headerCard: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  emptyText: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  designItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  designIndex: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  designIndexText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  designInfo: {
    flex: 1,
  },
  designName: {
    fontSize: 16,
    color: '#111827',
  },
  metaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  metaLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  metaValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  unsupportedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
  },
  unsupportedText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#92400e',
  },
  bottomPadding: {
    height: 32,
  },
});
