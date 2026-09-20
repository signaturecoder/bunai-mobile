import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  listDevices,
  openDevice,
  closeDevice,
  pingDevice,
  isUsbSerialSupported,
  getCurrentDeviceId,
  isConnected,
} from '@/lib/usbSerial';

export default function DiagnosticsScreen() {
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  function addLog(msg: string) {
    setLogs((s) => [new Date().toISOString() + ' — ' + msg, ...s].slice(0, 200));
  }

  const handleList = async () => {
    addLog('Listing devices...');
    try {
      const d = await listDevices();
      setDevices(d);
      addLog(`Found ${d.length} devices`);
    } catch (e: any) {
      addLog('listDevices error: ' + String(e));
    }
  };

  const [baudRate, setBaudRate] = useState<number>(28800);

  const handleOpenWithRate = async (deviceId?: number) => {
    const id = deviceId ?? devices[0]?.deviceId;
    if (!id) {
      addLog('No deviceId to open');
      return;
    }
    addLog(`Opening device ${id} with baud ${baudRate}...`);
    try {
      await openDevice(id, { baudRate });
      setConnected(true);
      addLog('Device opened');
    } catch (e: any) {
      addLog('openDevice error: ' + String(e));
    }
  };

  const handleOpen = async (deviceId?: number) => {
    const id = deviceId ?? devices[0]?.deviceId;
    if (!id) {
      addLog('No deviceId to open');
      return;
    }
    addLog(`Requesting permission & opening device ${id}...`);
    try {
      await openDevice(id);
      setConnected(true);
      addLog('Device opened');
    } catch (e: any) {
      addLog('openDevice error: ' + String(e));
    }
  };

  const handleClose = async () => {
    addLog('Closing device...');
    try {
      await closeDevice();
      setConnected(false);
      addLog('Device closed');
    } catch (e: any) {
      addLog('closeDevice error: ' + String(e));
    }
  };

  const handlePing = async () => {
    addLog('Pinging device...');
    try {
      const ok = await pingDevice();
      addLog('Ping result: ' + ok);
    } catch (e: any) {
      addLog('pingDevice error: ' + String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>USB Diagnostics</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Platform support:</Text>
        <Text style={styles.value}>{isUsbSerialSupported() ? 'Android (enabled)' : 'Not supported'}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Connected device id:</Text>
        <Text style={styles.value}>{getCurrentDeviceId() ?? 'none'}</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.button} onPress={handleList}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.buttonText}>List Devices</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => handleOpen()}>
          <Ionicons name="link" size={18} color="#fff" />
          <Text style={styles.buttonText}>Open First</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleClose}>
          <Ionicons name="close" size={18} color="#fff" />
          <Text style={styles.buttonText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.button} onPress={handlePing}>
          <Ionicons name="pulse" size={18} color="#fff" />
          <Text style={styles.buttonText}>Ping</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Devices</Text>
        {devices.length === 0 ? (
          <Text style={styles.empty}>No devices found</Text>
        ) : (
          devices.map((d) => (
            <View key={d.deviceId} style={styles.deviceItem}>
              <Text style={styles.deviceLine}>{d.productName || `Device ${d.deviceId}`}</Text>
              <Text style={styles.deviceMeta}>VID: {d.vendorId.toString(16)} PID: {d.productId.toString(16)}</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => handleOpen(d.deviceId)}>
                <Text style={styles.smallButtonText}>Open</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Logs</Text>
        {logs.length === 0 ? <Text style={styles.empty}>No logs</Text> : logs.map((l, i) => (
          <Text key={i} style={styles.logLine}>{l}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#374151' },
  value: { color: '#6b7280', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  button: { backgroundColor: '#2563eb', padding: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  section: { marginTop: 12 },
  sectionTitle: { fontWeight: '700', marginBottom: 8 },
  empty: { color: '#9ca3af' },
  deviceItem: { padding: 8, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8 },
  deviceLine: { fontWeight: '600' },
  deviceMeta: { color: '#9ca3af', fontSize: 12 },
  smallButton: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#7c3aed', padding: 6, borderRadius: 6 },
  smallButtonText: { color: '#fff', fontWeight: '600' },
  logLine: { fontSize: 12, color: '#374151', marginBottom: 4 },
});
