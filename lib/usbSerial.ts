/**
 * USB Serial communication for Android
 * 
 * Protocol: 28800 baud, 8N1, echo-based
 * Same protocol as bunai-bridge and webSerial.ts
 * 
 * Uses react-native-usb-serialport-for-android
 */

import { UsbSerialManager, Parity } from 'react-native-usb-serialport-for-android';
import type { UsbSerial } from 'react-native-usb-serialport-for-android';
import type { WriteProgress } from './types';

// Protocol constants (same as bunai-bridge)
const BAUD_RATE = 28800;
const DATA_BITS = 8;
const STOP_BITS = 1;
const PARITY = Parity.None;

// Commands
const CMD_WRITE = 'w'.charCodeAt(0);     // 0x77 - Write command
const CMD_SAVE = 'Z'.charCodeAt(0);       // 0x5A - Save/commit command
const RESP_SUCCESS = 'X'.charCodeAt(0);   // 0x58 - Success response

// Page size for writing
const PAGE_SIZE = 16;

// Timeouts
const RESPONSE_TIMEOUT_MS = 2000;
const WRITE_DELAY_MS = 50;

interface UsbDevice {
  deviceId: number;
  productId: number;
  vendorId: number;
  productName?: string;
  manufacturerName?: string;
}

let currentSerial: UsbSerial | null = null;

/**
 * Convert Uint8Array to hex string (required by library send())
 */
function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array (received data is hex string)
 */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, 2), 16);
  }
  return bytes;
}

/**
 * Check if USB serial is available (Android only)
 */
export function isUsbSerialSupported(): boolean {
  return true;
}

/**
 * List available USB serial devices
 */
export async function listDevices(): Promise<UsbDevice[]> {
  try {
    const devices = await UsbSerialManager.list();
    return devices;
  } catch (error) {
    console.error('Failed to list USB devices:', error);
    return [];
  }
}

/**
 * Request permission and open a USB serial device
 */
export async function openDevice(deviceId: number): Promise<boolean> {
  try {
    // Request permission
    const granted = await UsbSerialManager.tryRequestPermission(deviceId);
    console.log('[usbSerial] tryRequestPermission result:', granted);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('USB permission dialog result: ' + granted);
    }
    if (!granted) {
      throw new Error('USB permission denied');
    }

    // Open the device - returns UsbSerial instance
    currentSerial = await UsbSerialManager.open(deviceId, {
      baudRate: BAUD_RATE,
      dataBits: DATA_BITS,
      stopBits: STOP_BITS,
      parity: PARITY,
    });

    return true;
  } catch (error) {
    console.error('Failed to open USB device:', error);
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('Failed to open USB device: ' + error);
    }
    throw error;
  }
}

/**
 * Close the current USB serial connection
 */
export async function closeDevice(): Promise<void> {
  if (currentSerial !== null) {
    try {
      await currentSerial.close();
    } catch (error) {
      console.error('Failed to close USB device:', error);
    }
    currentSerial = null;
  }
}

/**
 * Read data from USB serial with timeout
 */
async function readWithTimeout(timeoutMs: number = RESPONSE_TIMEOUT_MS): Promise<Uint8Array> {
  if (currentSerial === null) {
    throw new Error('No device connected');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.remove();
      reject(new Error('Read timeout'));
    }, timeoutMs);

    const sub = currentSerial!.onReceived((event) => {
      clearTimeout(timeout);
      sub.remove();
      resolve(fromHex(event.data));
    });
  });
}

/**
 * Write data to USB serial
 */
async function writeData(data: Uint8Array): Promise<void> {
  if (currentSerial === null) {
    throw new Error('No device connected');
  }

  await currentSerial.send(toHex(data));
}

/**
 * Write a single byte and wait for echo
 */
async function writeByteWithEcho(byte: number): Promise<boolean> {
  await writeData(new Uint8Array([byte]));
  
  try {
    const response = await readWithTimeout(500);
    return response.length > 0 && response[0] === byte;
  } catch {
    return false;
  }
}

/**
 * Write MOD file to device using echo-based protocol
 * 
 * Protocol (same as bunai-bridge):
 * 1. Send 'w' command
 * 2. Wait for 'X' response
 * 3. Send address as 4-char hex string
 * 4. Send 16 data bytes (each echoed back)
 * 5. Repeat for all pages
 * 6. Send 'Z' to commit
 */
export async function writeModFile(
  data: Uint8Array,
  onProgress?: (progress: WriteProgress) => void
): Promise<void> {
  if (currentSerial === null) {
    throw new Error('No device connected');
  }

  const totalBytes = data.length;
  const totalPages = Math.ceil(totalBytes / PAGE_SIZE);
  let bytesWritten = 0;

  onProgress?.({
    phase: 'connecting',
    bytesWritten: 0,
    totalBytes,
    percent: 0,
    message: 'Connecting to device...',
  });

  // Write each page
  for (let page = 0; page < totalPages; page++) {
    const address = page * PAGE_SIZE;
    const pageStart = address;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, totalBytes);
    const pageData = data.slice(pageStart, pageEnd);

    // Pad to 16 bytes if needed
    const paddedData = new Uint8Array(PAGE_SIZE);
    paddedData.set(pageData);

    // Send write command
    await writeData(new Uint8Array([CMD_WRITE]));

    // Wait for 'X' response
    try {
      const response = await readWithTimeout();
      if (response.length === 0 || response[0] !== RESP_SUCCESS) {
        throw new Error(`Device not ready (got ${response[0]}, expected ${RESP_SUCCESS})`);
      }
    } catch (error) {
      throw new Error(`Device not responding: ${error}`);
    }

    // Send address as 4-char hex
    const addressHex = address.toString(16).padStart(4, '0').toUpperCase();
    const addressBytes = new TextEncoder().encode(addressHex);
    await writeData(addressBytes);

    // Send 16 data bytes with echo verification
    for (let i = 0; i < PAGE_SIZE; i++) {
      const success = await writeByteWithEcho(paddedData[i]);
      if (!success) {
        throw new Error(`Echo mismatch at byte ${i} of page ${page}`);
      }
    }

    bytesWritten += pageData.length;

    onProgress?.({
      phase: 'writing',
      bytesWritten,
      totalBytes,
      percent: Math.round((bytesWritten / totalBytes) * 95),
      message: `Writing page ${page + 1}/${totalPages}...`,
    });

    // Small delay between pages
    await new Promise(r => setTimeout(r, WRITE_DELAY_MS));
  }

  // Send save command
  onProgress?.({
    phase: 'saving',
    bytesWritten: totalBytes,
    totalBytes,
    percent: 98,
    message: 'Saving to EEPROM...',
  });

  await writeData(new Uint8Array([CMD_SAVE]));

  // Wait for confirmation
  await new Promise(r => setTimeout(r, 500));

  onProgress?.({
    phase: 'complete',
    bytesWritten: totalBytes,
    totalBytes,
    percent: 100,
    message: `Successfully wrote ${totalBytes} bytes`,
  });
}

/**
 * Ping device to check connection
 */
export async function pingDevice(): Promise<boolean> {
  if (currentSerial === null) {
    return false;
  }

  try {
    // Send write command
    await writeData(new Uint8Array([CMD_WRITE]));
    
    // Wait for 'X' response
    const response = await readWithTimeout(1000);
    return response.length > 0 && response[0] === RESP_SUCCESS;
  } catch {
    return false;
  }
}

/**
 * Get current device ID
 */
export function getCurrentDeviceId(): number | null {
  return currentSerial?.deviceId ?? null;
}

/**
 * Check if a device is connected
 */
export function isConnected(): boolean {
  return currentSerial !== null;
}
