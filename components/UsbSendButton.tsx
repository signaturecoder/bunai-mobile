import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  listDevices,
  openDevice,
  closeDevice,
  writeModFile,
  pingDevice,
  isConnected,
  getCurrentDeviceId,
} from '@/lib/usbSerial';
import type { WriteProgress } from '@/lib/types';

interface UsbSendButtonProps {
  modData: Uint8Array;
  fileName: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UsbDevice {
  deviceId: number;
  productId: number;
  vendorId: number;
  productName?: string;
  manufacturerName?: string;
}

export default function UsbSendButton({
  modData,
  fileName,
  onSuccess,
  onError,
}: UsbSendButtonProps) {
  const [devices, setDevices] = useState<UsbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<UsbDevice | null>(null);
  const [connected, setConnected] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [scanning, setScanning] = useState(false);

  // Scan for USB devices
  const scanDevices = async () => {
    setScanning(true);
    try {
      const found = await listDevices();
      setDevices(found);
      if (found.length === 1) {
        setSelectedDevice(found[0]);
      }
    } catch (error) {
      console.error('Failed to scan devices:', error);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    scanDevices();
  }, []);

  // Connect to selected device
  const handleConnect = async () => {
    if (!selectedDevice) return;

    try {
      await openDevice(selectedDevice.deviceId);
      setConnected(true);

      // Ping to verify device is responding
      const ready = await pingDevice();
      setDeviceReady(ready);

      if (!ready) {
        console.warn('Device connected but not responding to ping');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect';
      onError?.(message);
      setConnected(false);
      setDeviceReady(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    await closeDevice();
    setConnected(false);
    setDeviceReady(false);
  };

  // Send MOD file
  const handleSend = async () => {
    setSending(true);
    setProgress(null);

    try {
      // Connect if not already
      if (!connected && selectedDevice) {
        await openDevice(selectedDevice.deviceId);
        setConnected(true);
      }

      // Write to device
      await writeModFile(modData, (p) => {
        setProgress(p);
      });

      setDeviceReady(true);
      onSuccess?.();

      // Hold success state
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed';
      setProgress({
        phase: 'error',
        bytesWritten: 0,
        totalBytes: modData.length,
        percent: 0,
        message,
      });
      onError?.(message);
    } finally {
      setSending(false);
      setTimeout(() => setProgress(null), 3000);
    }
  };

  return (
    <View style={styles.container}>
      {/* Device Selection */}
      {!connected && (
        <View style={styles.deviceSection}>
          <View style={styles.deviceHeader}>
            <Text style={styles.deviceTitle}>USB Devices</Text>
            <TouchableOpacity onPress={scanDevices} disabled={scanning}>
              <Ionicons
                name="refresh"
                size={20}
                color={scanning ? '#9ca3af' : '#7c3aed'}
              />
            </TouchableOpacity>
          </View>

          {devices.length === 0 ? (
            <View style={styles.noDevices}>
              <Ionicons name="hardware-chip-outline" size={32} color="#d1d5db" />
              <Text style={styles.noDevicesText}>
                No USB serial devices found
              </Text>
              <Text style={styles.noDevicesHint}>
                Connect your USB-to-RS232 adapter
              </Text>
            </View>
          ) : (
            devices.map((device) => (
              <TouchableOpacity
                key={device.deviceId}
                style={[
                  styles.deviceItem,
                  selectedDevice?.deviceId === device.deviceId &&
                    styles.deviceItemSelected,
                ]}
                onPress={() => setSelectedDevice(device)}
              >
                <Ionicons
                  name={
                    selectedDevice?.deviceId === device.deviceId
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={20}
                  color="#7c3aed"
                />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>
                    {device.productName || `USB Device ${device.deviceId}`}
                  </Text>
                  <Text style={styles.deviceMeta}>
                    VID: {device.vendorId.toString(16).toUpperCase()} | PID:{' '}
                    {device.productId.toString(16).toUpperCase()}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}

          {selectedDevice && (
            <TouchableOpacity
              style={styles.connectButton}
              onPress={handleConnect}
            >
              <Ionicons name="link" size={20} color="#fff" />
              <Text style={styles.connectButtonText}>Connect</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Connected State */}
      {connected && (
        <View style={styles.connectedSection}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                deviceReady ? styles.statusReady : styles.statusConnected,
              ]}
            />
            <Text style={styles.statusText}>
              {deviceReady ? 'ATmega328P Ready' : 'Connected'}
            </Text>
            <TouchableOpacity onPress={handleDisconnect} disabled={sending}>
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Send Button */}
      <TouchableOpacity
        style={[
          styles.sendButton,
          (!connected || sending) && styles.sendButtonDisabled,
        ]}
        onPress={handleSend}
        disabled={!selectedDevice || sending}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="flash" size={24} color="#fff" />
            <Text style={styles.sendButtonText}>
              {connected ? 'Send to Machine' : 'Connect & Send'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Progress */}
      {progress && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text
              style={[
                styles.progressText,
                progress.phase === 'error' && styles.progressError,
                progress.phase === 'complete' && styles.progressSuccess,
              ]}
            >
              {progress.phase === 'error' && '✕ '}
              {progress.phase === 'complete' && '✓ '}
              {progress.message}
            </Text>
            {progress.phase !== 'error' && progress.phase !== 'complete' && (
              <Text style={styles.progressPercent}>{progress.percent}%</Text>
            )}
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                progress.phase === 'error' && styles.progressFillError,
                progress.phase === 'complete' && styles.progressFillSuccess,
                { width: `${progress.percent}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Protocol Info */}
      <Text style={styles.protocolInfo}>
        Direct USB • 28800 baud • ATmega328P
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  deviceSection: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  noDevices: {
    alignItems: 'center',
    padding: 24,
  },
  noDevicesText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  noDevicesHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deviceItemSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#faf5ff',
  },
  deviceInfo: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  deviceMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  connectButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  connectedSection: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: '#fbbf24',
  },
  statusReady: {
    backgroundColor: '#22c55e',
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#065f46',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  progressSection: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressError: {
    color: '#ef4444',
  },
  progressSuccess: {
    color: '#22c55e',
  },
  progressPercent: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  progressFillError: {
    backgroundColor: '#ef4444',
  },
  progressFillSuccess: {
    backgroundColor: '#22c55e',
  },
  protocolInfo: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
