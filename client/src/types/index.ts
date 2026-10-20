/** Transfer status */
export type TransferStatus = 'pending' | 'uploading' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

/** File in the upload queue */
export interface QueuedFile {
  id: string;
  file: File;
  status: TransferStatus;
  transferId?: string;
  progress: number;
  bytesUploaded: number;
  totalChunks: number;
  chunksUploaded: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  error?: string;
  serverHash?: string;
  startTime?: number;
}

/** Transfer status from server */
export interface TransferStatusResponse {
  id: string;
  originalName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  chunksReceived: number;
  bytesReceived: number;
  status: TransferStatus;
  missingChunks: number[];
  serverHash?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

/** Shared file available for download */
export interface SharedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  hash?: string;
  createdAt: string;
  downloadCount: number;
}

/** Pairing data */
export interface PairingData {
  pin: string;
  expiresAt: number;
  serverUrl: string;
  qrCode: string;
  addresses: { name: string; address: string }[];
}

/** Session data */
export interface SessionData {
  token: string;
  sessionId: string;
  expiresAt: string;
}

/** Connection state */
export type ConnectionState = 'disconnected' | 'pairing' | 'connected' | 'error';
