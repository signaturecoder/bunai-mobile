/**
 * TypeScript types for the mobile app
 * Mirrors types from the web app
 */

export interface User {
  id: string;
  phone: string;
  name?: string | null;
  organizationId: string;
  organizationName: string;
  role: string;
  isSuperAdmin: boolean;
  isDemoAccount?: boolean;
  demoExpiresAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: string;
}

export interface ModFile {
  id: string;
  name: string;
  description?: string;
  metadata?: {
    totalSlots: number;
    usedSlots: number;
    designs: Array<{
      slotIndex: number;
      designName: string;
      totalPicks: number;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: {
    name?: string;
    email: string;
  };
  designs: Array<{
    id: string;
    slotIndex: number;
    design: {
      id: string;
      filename: string;
      thumbnail?: string;
    };
  }>;
}

export interface ModFileDetail extends ModFile {
  fileData: string; // Base64 encoded MOD file
}

export interface WriteProgress {
  phase: 'connecting' | 'writing' | 'saving' | 'complete' | 'error';
  bytesWritten: number;
  totalBytes: number;
  percent: number;
  message: string;
}
