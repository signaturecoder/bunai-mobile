import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchModFileDetail, base64ToUint8Array, getApiUrl } from '@/lib/api';
import { replaceCart, setEditModId, setModName } from '@/lib/cart';
import { setQueueState, subscribeMods } from '@/lib/queue';
import { getAuthHeader } from '@/lib/auth';
import type { ModFileDetail, WriteProgress } from '@/lib/types';
import UsbSendButton from '@/components/UsbSendButton';
// Delete UI removed from detail screen; deletion is handled on the Mods list only

export default function ModDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [modFile, setModFile] = useState<ModFileDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPreparingManageFlow, setIsPreparingManageFlow] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadModFile = async () => {
      if (!id) return;

      try {
        const data = await fetchModFileDetail(id);
        if (mounted) setModFile(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load MOD file');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadModFile();
    const unsubMods = subscribeMods((modId) => {
      if (!modId || modId === id) {
        loadModFile();
      }
    });

    return () => {
      mounted = false;
      unsubMods();
    };
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
  const usedSlots = modFile.metadata?.usedSlots || modFile.designs.length;
  const designRows = modFile.designs.map((design) => {
    const metadataMatch = modFile.metadata?.designs?.find((entry) => entry.slotIndex === design.slotIndex);

    return {
      ...design,
      totalPicks: metadataMatch?.totalPicks,
    };
  });

  const handleManageDesigns = async () => {
    try {
      setIsPreparingManageFlow(true);
      const compileItems = modFile.designs.map((design) => ({
        id: design.design.id,
        filename: design.design.filename,
        thumbnail: design.design.thumbnail || null,
      }));

      setQueueState(compileItems);
      await replaceCart(compileItems);
      await Promise.all([
        setEditModId(modFile.id),
        setModName(modFile.name),
      ]);

      router.push('/(app)/(tabs)/designs');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to prepare edit');
    } finally {
      setIsPreparingManageFlow(false);
    }
  };

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
        <View style={styles.summaryCard}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>Designs</Text>
            <Text style={styles.summaryValue}>{usedSlots}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryStat}>
            <Text style={styles.summaryLabel}>Size</Text>
            <Text style={styles.summaryValue}>{modData.length} bytes</Text>
          </View>
        </View>

        {/* Designs List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Designs</Text>
          {modFile.designs.length === 0 ? (
            <Text style={styles.emptyText}>No designs in this MOD file</Text>
          ) : (
            designRows.map((design) => (
              <View key={design.id} style={styles.designItem}>
                <View style={styles.designIndex}>
                  <Text style={styles.designIndexText}>{design.slotIndex}</Text>
                </View>
                <View style={styles.designInfo}>
                  <Text style={styles.designName}>{design.design.filename}</Text>
                  <Text style={styles.designMeta}>{typeof design.totalPicks === 'number' ? `${design.totalPicks} picks` : 'Total picks unavailable'}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal visible={sendSheetOpen} transparent animationType="slide" onRequestClose={() => setSendSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetOverlayTap} activeOpacity={1} onPress={() => setSendSheetOpen(false)} />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Send to Machine</Text>
            <Text style={styles.sheetSubtitle}>Connect your device only when you are ready to send this MOD file.</Text>
            {Platform.OS === 'android' ? (
              <UsbSendButton
                modData={modData}
                fileName={`${modFile.name}.MOD`}
                onSuccess={() => {
                  setSendSheetOpen(false);
                  Alert.alert('Success', 'MOD file sent to machine successfully!');
                }}
                onError={(usbError) => {
                  Alert.alert('Error', usbError);
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
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setSendSheetOpen(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomActionBar}>
        <TouchableOpacity
          style={[styles.bottomPrimaryButton, isPreparingManageFlow && styles.bottomPrimaryButtonDisabled]}
          onPress={handleManageDesigns}
          disabled={isPreparingManageFlow}
        >
          {isPreparingManageFlow ? <ActivityIndicator color="#fff" /> : <Ionicons name="create-outline" size={18} color="#fff" />}
          <Text style={styles.bottomPrimaryButtonText}>{isPreparingManageFlow ? 'Preparing...' : 'Manage Designs'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomSecondaryButton}
          onPress={() => setSendSheetOpen(true)}
        >
          <Ionicons name="send-outline" size={18} color="#4338ca" />
          <Text style={styles.bottomSecondaryButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
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
  summaryCard: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryStat: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
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
    fontWeight: '600',
  },
  designMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#15803d',
    fontWeight: '700',
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
    height: 108,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetOverlayTap: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sheetSubtitle: {
    color: '#6b7280',
    lineHeight: 20,
  },
  sheetCloseBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  sheetCloseText: {
    fontWeight: '600',
    color: '#374151',
  },
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
  bottomPrimaryButton: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2563eb',
  },
  bottomPrimaryButtonDisabled: {
    opacity: 0.65,
  },
  bottomPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  bottomSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  bottomSecondaryButtonText: {
    color: '#3730a3',
    fontSize: 16,
    fontWeight: '800',
  },
});
