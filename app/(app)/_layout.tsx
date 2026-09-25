import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthHeader } from '@/lib/auth';
import { getApiUrl } from '@/lib/api';
import { subscribe, computeCount } from '@/lib/queue';

export default function AppLayout() {
  const [badgeCount, setBadgeCount] = useState(0);

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
      try {
        const c = await computeCount(getServerCount, getLocalCount);
        if (mounted) setBadgeCount(c);
      } catch (e) {
        // ignore
      }
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
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
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
        options={({}) => ({
          title: 'Compile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle-outline" size={size} color={color} />
          ),
          tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
        })}
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

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="diagnostics"
        options={{
          title: 'Diagnostics',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Keep mod detail route available but hidden from the tab bar */}
      <Tabs.Screen
        name="mod/[id]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
