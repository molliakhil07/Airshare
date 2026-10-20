/** Transfer direction */
export type TransferDirection = 'upload' | 'download';

/** Transfer status */
export type TransferStatus =
  | 'pending'
  | 'uploading'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Chunk status */
export type ChunkStatus = 'pending' | 'received' | 'verified' | 'failed';

/** Transfer metadata persisted to disk */
export interface TransferMeta {
  /** Unique transfer ID (UUID) */
  id: string;
  /** Original filename from client */
  originalName: string;
  /** Sanitized safe filename for storage */
  safeName: string;
  /** MIME type */
  mimeType: string;
  /** Total file size in bytes */
  totalSize: number;
  /** Chunk size in bytes used for this transfer */
  chunkSize: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Bitmap of received chunks (true = received) */
  chunkBitmap: boolean[];
  /** Number of chunks received */
  chunksReceived: number;
  /** Bytes received so far */
  bytesReceived: number;
  /** Transfer status */
  status: TransferStatus;
  /** Transfer direction */
  direction: TransferDirection;
  /** SHA-256 hash provided by client (optional, for verification) */
  clientHash?: string;
  /** SHA-256 hash computed by server after finalization */
  serverHash?: string;
  /** Session ID that created this transfer */
  sessionId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
}

/** Request to create a new transfer */
export interface CreateTransferRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize?: number;
  clientHash?: string;
}

/** Transfer status response */
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

/** Share metadata for PC→Phone downloads */
export interface ShareMeta {
  /** Unique share ID */
  id: string;
  /** Original filename */
  fileName: string;
  /** Full path on PC (never exposed to client) */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** SHA-256 hash (computed lazily) */
  hash?: string;
  /** Session ID that created the share */
  sessionId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Expiry timestamp */
  expiresAt?: string;
  /** Download count */
  downloadCount: number;
}

/** Share response (safe for client) */
export interface ShareResponse {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  hash?: string;
  createdAt: string;
  downloadCount: number;
}

/** Pairing session */
export interface PairingSession {
  /** Session ID */
  id: string;
  /** Device name */
  deviceName: string;
  /** JWT token */
  token: string;
  /** Creation timestamp */
  createdAt: string;
  /** Expiry timestamp */
  expiresAt: string;
  /** Whether the session is active */
  active: boolean;
  /** Last activity */
  lastActivity: string;
}

/** Stats response */
export interface StatsResponse {
  totalUploads: number;
  totalDownloads: number;
  totalBytesUploaded: number;
  totalBytesDownloaded: number;
  activeTransfers: number;
  activeShares: number;
  storageUsed: number;
  uptime: number;
}

/** API error response */
export interface ApiError {
  error: string;
  code: string;
  details?: string;
}

/** API success response */
export interface ApiSuccess<T = void> {
  success: true;
  data?: T;
  message?: string;
}
