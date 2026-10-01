import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function ReconnectBanner() {
  const { isRefreshing } = useAuth();

  if (!isRefreshing) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#fde68a',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#92400e',
    fontWeight: '600',
  },
});
