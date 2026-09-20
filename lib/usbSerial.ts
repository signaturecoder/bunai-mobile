/**
 * Send raw bytes to the currently open USB serial device (no protocol, no echo)
 */
export async function sendRawData(data: Uint8Array): Promise<void> {
  if (currentSerial === null) {
    throw new Error('No device connected');
  }
  // Send all bytes as-is
  await currentSerial.send(toHex(data));
}
/**
 * Convert a Uint8Array (MOD file) to Intel HEX format lines
 * Each line is a string, ready to send over serial
 * Default record size: 16 bytes
 */
export function modToIntelHex(data: Uint8Array, recordSize = 16): string[] {
  function checksum(bytes: number[]): number {
    const sum = bytes.reduce((a, b) => a + b, 0);
    return ((~sum + 1) & 0xFF);
  }

  const lines: string[] = [];
  let addr = 0;
  while (addr < data.length) {
    const count = Math.min(recordSize, data.length - addr);
    const record = [
      count,
      (addr >> 8) & 0xFF,
      addr & 0xFF,
      0x00, // record type: data
      ...Array.from(data.slice(addr, addr + count)),
    ];
    const cs = checksum(record);
    const hex = ':' + record.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('') + cs.toString(16).padStart(2, '0').toUpperCase();
    lines.push(hex);
    addr += count;
  }
  // End-of-file record
  lines.push(':00000001FF');
  return lines;
}
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
const DEFAULT_BAUD_RATE = 28800;
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
let currentBaudRate: number = DEFAULT_BAUD_RATE;

/**
 * Convert Uint8Array to hex string (required by library send())
 */
function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function debugLog(...args: any[]) {
  if (typeof console !== 'undefined') {
    console.log('[usbSerial]', ...args);
  }
}

/**
 * Convert hex string to Uint8Array (received data is hex string)
 */
function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Check if USB serial is available (Android only)
 */
export function isUsbSerialSupported(): boolean {
  // USB serial is only supported on Android in this app
  try {
    // Lazy require to avoid Metro errors on non-native environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native');
    return Platform.OS === 'android';
  } catch (e) {
    return false;
  }
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
export async function openDevice(deviceId: number, opts?: { baudRate?: number; dataBits?: number; stopBits?: number; parity?: Parity }): Promise<boolean> {
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

    // Determine serial options (allow override via opts)
    const baudRate = opts?.baudRate ?? currentBaudRate;
    const dataBits = opts?.dataBits ?? DATA_BITS;
    const stopBits = opts?.stopBits ?? STOP_BITS;
    const parity = opts?.parity ?? PARITY;

    // Open the device - returns UsbSerial instance
    currentSerial = await UsbSerialManager.open(deviceId, {
      baudRate,
      dataBits,
      stopBits,
      parity,
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

export function setBaudRate(rate: number) {
  currentBaudRate = rate;
}

export function getBaudRate(): number {
  return currentBaudRate;
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
      debugLog('Read timeout');
      reject(new Error('Read timeout'));
    }, timeoutMs);

    const sub = currentSerial!.onReceived((event) => {
      clearTimeout(timeout);
      sub.remove();
      const data = fromHex(event.data);
      debugLog('Received:', toHex(data), data);
      resolve(data);
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

  debugLog('Sending:', toHex(data), data);
  await currentSerial.send(toHex(data));
}

/**
 * Write a single byte and wait for echo
 */
async function writeByteWithEcho(byte: number): Promise<boolean> {
  debugLog('writeByteWithEcho: sending', byte, '0x' + byte.toString(16));
  await writeData(new Uint8Array([byte]));
  try {
    const response = await readWithTimeout(500);
    debugLog('writeByteWithEcho: received', response);
    return response.length > 0 && response[0] === byte;
  } catch (e) {
    debugLog('writeByteWithEcho: timeout or error', e);
    return false;
  }
}

/**
 * Write MOD file to device using echo-based protocol (matches bunai.go)
 *
 * Protocol:
 * 1. Send 'w' command → wait for 'X'
 * 2. For each 16-byte page:
 *    a. Send 4-char hex address (e.g., "0010")
 *    b. Read 4 echoes
 *    c. Send 16 data bytes, each echoed
 * 3. Send 'Z' to commit, expect up to 2 echoes
 */
export async function writeModFile(
  data: Uint8Array,
  onProgress?: (progress: WriteProgress) => void
): Promise<void> {
  if (currentSerial === null) {
    const msg = 'No device connected';
    onProgress?.({
      phase: 'error',
      bytesWritten: 0,
      totalBytes: data.length,
      percent: 0,
      message: msg,
    });
    throw new Error(msg);
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

  // Phase 1: Send 'w' command and wait for 'X'
  try {
    debugLog('Protocol: Sending write command (w)');
    await writeData(new Uint8Array([CMD_WRITE]));
    const response = await readWithTimeout();
    debugLog('Protocol: Got response to w:', response);
    if (response.length === 0 || response[0] !== RESP_SUCCESS) {
      const msg = `Device not ready (got ${response[0]}, expected ${RESP_SUCCESS})`;
      onProgress?.({
        phase: 'error',
        bytesWritten: 0,
        totalBytes,
        percent: 0,
        message: msg,
      });
      throw new Error(msg);
    }
  } catch (error) {
    debugLog('Protocol: Error during write command (w)', error);
    const msg = `Device not responding: ${error}`;
    onProgress?.({
      phase: 'error',
      bytesWritten: 0,
      totalBytes,
      percent: 0,
      message: msg,
    });
    throw new Error(msg);
  }

  // Phase 2: Write each page
  for (let page = 0; page < totalPages; page++) {
    const address = page * PAGE_SIZE;
    const pageStart = address;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, totalBytes);
    const pageData = data.slice(pageStart, pageEnd);

    // Pad to 16 bytes if needed
    const paddedData = new Uint8Array(PAGE_SIZE);
    paddedData.set(pageData);

    // Send address as 4-char hex string
    const addressHex = address.toString(16).padStart(4, '0').toUpperCase();
    const addressBytes = new TextEncoder().encode(addressHex);
    try {
      debugLog(`Protocol: Sending address for page ${page}:`, addressHex, addressBytes);
      await writeData(addressBytes);
    } catch (error) {
      debugLog(`Protocol: Failed to send address for page ${page}:`, error);
      const msg = `Failed to send address for page ${page}: ${error}`;
      onProgress?.({
        phase: 'error',
        bytesWritten,
        totalBytes,
        percent: Math.round((bytesWritten / totalBytes) * 95),
        message: msg,
      });
      throw new Error(msg);
    }

    // Read 4 echoes for address
    for (let i = 0; i < 4; i++) {
      try {
        const echo = await readWithTimeout(100);
        debugLog(`Protocol: Address echo ${i}:`, echo);
      } catch (e) {
        debugLog(`Protocol: Address echo ${i} timeout`, e);
        // Ignore echo errors for address
      }
    }

    // Send 16 data bytes with echo verification
    for (let i = 0; i < PAGE_SIZE; i++) {
      debugLog(`Protocol: Sending data byte ${i} of page ${page}:`, paddedData[i]);
      const success = await writeByteWithEcho(paddedData[i]);
      if (!success) {
        const msg = `Echo mismatch at byte ${i} of page ${page}`;
        debugLog(msg);
        onProgress?.({
          phase: 'error',
          bytesWritten,
          totalBytes,
          percent: Math.round((bytesWritten / totalBytes) * 95),
          message: msg,
        });
        throw new Error(msg);
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

  // Phase 3: Send save command 'Z' and check for up to 2 echoes
  onProgress?.({
    phase: 'saving',
    bytesWritten: totalBytes,
    totalBytes,
    percent: 98,
    message: 'Saving to EEPROM...',
  });

  try {
    debugLog('Protocol: Sending save command (Z)');
    await writeData(new Uint8Array([CMD_SAVE]));
  } catch (error) {
    debugLog('Protocol: Failed to send save command (Z)', error);
    const msg = `Failed to send save command: ${error}`;
    onProgress?.({
      phase: 'error',
      bytesWritten: totalBytes,
      totalBytes,
      percent: 98,
      message: msg,
    });
    throw new Error(msg);
  }

  // Wait for up to 2 echoes of 'Z'
  for (let i = 0; i < 2; i++) {
    try {
      const resp = await readWithTimeout(2000);
      debugLog(`Protocol: Save echo ${i}:`, resp);
      if (resp.length > 0 && resp[0] === CMD_SAVE) {
        // Got 'Z' echo
      } else {
        break;
      }
    } catch (e) {
      debugLog(`Protocol: Save echo ${i} timeout`, e);
      break;
    }
  }

  onProgress?.({
    phase: 'complete',
    bytesWritten: totalBytes,
    totalBytes,
    percent: 100,
    message: `Successfully wrote ${totalBytes} bytes`,
  });
}

/**
 * Read MOD file from device using echo-based protocol (matches bunai.go)
 *
 * Protocol:
 * 1. Send 'R' command
 * 2. Wait for device response
 * 3. Read all bytes until timeout or max size
 */
export async function readModFile(maxSize = 5120): Promise<Uint8Array> {
  if (currentSerial === null) {
    throw new Error('No device connected');
  }

  // Clear input buffer (not available in JS, but can read/discard)
  // Send 'R' command
  await writeData(new Uint8Array(["R".charCodeAt(0)]));

  // Wait for device response
  let firstByte: number | null = null;
  try {
    const resp = await readWithTimeout(2000);
    if (resp.length > 0) {
      firstByte = resp[0];
    } else {
      throw new Error('No response from device');
    }
  } catch (e) {
    throw new Error('Device not responding to read command');
  }

  // Read data
  const result: number[] = [firstByte!];
  let lastRead = Date.now();
  const noDataTimeout = 3000;
  while (result.length < maxSize) {
    try {
      const chunk = await readWithTimeout(500);
      if (chunk.length > 0) {
        for (let i = 0; i < chunk.length; i++) {
          result.push(chunk[i]);
        }
        lastRead = Date.now();
      }
    } catch {
      // Timeout
    }
    if (Date.now() - lastRead > noDataTimeout) {
      break;
    }
  }
  return new Uint8Array(result);
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
