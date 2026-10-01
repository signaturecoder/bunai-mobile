import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getAuthHeader } from '@/lib/auth';
import { getApiUrl } from '@/lib/api';
import { subscribe, computeCount, hasQueueState, getQueueState, setQueueState, getQueueVersion } from '@/lib/queue';

export default function TabsLayout() {
  const [badgeCount, setBadgeCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 && Math.abs(gestureState.dy) < 50) {
          setMenuOpen(false);
        }
      },
    })
  ).current;

  useEffect(() => {
    let mounted = true;

    const getServerCount = async () => {
      const authHeader = await getAuthHeader();
      if (authHeader && Object.keys(authHeader).length > 0) {
        const base = getApiUrl();
        const res = await fetch(`${base}/api/compile`, { headers: { ...authHeader } });
        if (res.ok) {
          const json = await res.json();
          return (json.items || []).length;
        }
      }
      throw new Error('no server');
    };

    const getLocalCount = async () => {
      const raw = await AsyncStorage.getItem('compile-queue');
      const queue = raw ? JSON.parse(raw) : [];
      return Array.isArray(queue) ? queue.length : 0;
    };

    async function refreshCount() {
      const requestVersion = getQueueVersion();

      try {
        const c = await computeCount(getServerCount, getLocalCount);
        if (!mounted) return;

        if (hasQueueState() && getQueueVersion() !== requestVersion) {
          return;
        }

        if (hasQueueState()) {
          setBadgeCount(getQueueState().length);
          return;
        }

        setBadgeCount(c);
      } catch (e) {
        // ignore
      }
    }

    if (hasQueueState()) {
      setBadgeCount(getQueueState().length);
    }

    refreshCount();
    const unsub = subscribe((c) => {
      if (mounted) setBadgeCount(c);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#7c3aed',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            paddingBottom: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '500',
          },
          headerStyle: {
            backgroundColor: '#7c3aed',
          },
          headerLeftContainerStyle: {
            paddingLeft: 12,
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => setMenuOpen(true)} style={{ paddingLeft: 12 }}>
              <Ionicons name="menu" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      >
        <Tabs.Screen
          name="designs"
          options={{
            title: 'Designs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="compile"
          options={{
            title: 'Compile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="play-circle-outline" size={size} color={color} />
            ),
            tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
          }}
        />

        <Tabs.Screen
          name="mods"
          options={{
            title: 'MODs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="folder-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <Modal visible={menuOpen} animationType="slide" transparent={true} onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuOverlay} {...panResponder.panHandlers}>
          <View style={styles.menuPane}>
            <Text style={styles.menuTitle}>Menu</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); router.replace('/(app)/settings'); }}>
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); router.replace('/(app)/diagnostics'); }}>
              <Text style={styles.menuItemText}>Diagnostics</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, { marginTop: 12 }]} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.menuItemText, { color: '#6b7280' }]}>Close</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.overlayTapArea} activeOpacity={1} onPress={() => setMenuOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row' },
  menuPane: { width: 260, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 16, paddingBottom: 24 },
  menuTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  menuItem: { paddingVertical: 12 },
  menuItemText: { fontSize: 16 },
  overlayTapArea: { flex: 1 },
});
