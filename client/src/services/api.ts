/**
 * AirBridge API client
 * Handles all communication with the backend server.
 */

const API_BASE = '/api';

/** Get stored auth token */
function getToken(): string | null {
  return sessionStorage.getItem('airbridge_token');
}

/** Set auth token */
export function setToken(token: string): void {
  sessionStorage.setItem('airbridge_token', token);
}

/** Clear auth token */
export function clearToken(): void {
  sessionStorage.removeItem('airbridge_token');
}

/** Check if authenticated */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Make an authenticated API request */
async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData or raw binary
  if (
    !(options.body instanceof FormData) &&
    !(options.body instanceof ArrayBuffer) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof Uint8Array) &&
    typeof options.body === 'string'
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  return response;
}

// ============ Health ============

export async function checkHealth(): Promise<{ status: string; uptime: number }> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

// ============ Pairing ============

export async function generatePairingPin(): Promise<{
  pin: string;
  expiresAt: number;
  serverUrl: string;
  qrCode: string;
  addresses: { name: string; address: string }[];
}> {
  const res = await apiFetch('/pair/generate', { method: 'POST' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to generate PIN');
  return data.data;
}

export async function verifyPin(
  pin: string,
  deviceName: string
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const res = await apiFetch('/pair/verify', {
    method: 'POST',
    body: JSON.stringify({ pin, deviceName }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Pairing failed');
  setToken(data.data.token);
  return data.data;
}

export async function getPinStatus(): Promise<{
  active: boolean;
  pin?: string;
  expiresAt?: number;
}> {
  const res = await apiFetch('/pair/pin');
  const data = await res.json();
  return data.data;
}

export async function getSessions(): Promise<
  { id: string; deviceName: string; active: boolean; createdAt: string; lastActivity: string }[]
> {
  const res = await apiFetch('/pair/sessions');
  const data = await res.json();
  return data.data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiFetch(`/pair/session/${sessionId}`, { method: 'DELETE' });
}

// ============ Transfers (Upload) ============

export async function createTransfer(params: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize?: number;
  clientHash?: string;
}): Promise<{
  id: string;
  chunkSize: number;
  totalChunks: number;
  safeName: string;
}> {
  const res = await apiFetch('/transfers', {
    method: 'POST',
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to create transfer');
  return data.data;
}

export async function uploadChunk(
  transferId: string,
  chunkIndex: number,
  data: ArrayBuffer
): Promise<{
  bytesReceived: number;
  chunksReceived: number;
  totalChunks: number;
}> {
  const res = await apiFetch(`/transfers/${transferId}/chunks/${chunkIndex}`, {
    method: 'PUT',
    body: data,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to upload chunk');
  return json.data;
}

export async function getTransferStatus(transferId: string): Promise<{
  id: string;
  originalName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  chunksReceived: number;
  bytesReceived: number;
  status: string;
  missingChunks: number[];
  serverHash?: string;
  error?: string;
}> {
  const res = await apiFetch(`/transfers/${transferId}/status`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to get transfer status');
  return data.data;
}

export async function finalizeTransfer(transferId: string): Promise<{
  id: string;
  originalName: string;
  totalSize: number;
  serverHash: string;
  completedAt: string;
  hashMatch?: boolean;
}> {
  const res = await apiFetch(`/transfers/${transferId}/finalize`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to finalize transfer');
  return data.data;
}

export async function cancelTransfer(transferId: string): Promise<void> {
  const res = await apiFetch(`/transfers/${transferId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to cancel transfer');
}

export async function listTransfers(): Promise<any[]> {
  const res = await apiFetch('/transfers');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to list transfers');
  return data.data;
}

// ============ Shares (Download) ============

export async function listShares(): Promise<
  {
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    hash?: string;
    createdAt: string;
    downloadCount: number;
  }[]
> {
  const res = await apiFetch('/shares');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to list shares');
  return data.data;
}

export async function shareFile(filePath: string): Promise<{
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}> {
  const res = await apiFetch('/shares', {
    method: 'POST',
    body: JSON.stringify({ filePath }),
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to share file');
  return data.data;
}

export function getDownloadUrl(shareId: string): string {
  const token = getToken();
  return `${API_BASE}/shares/${shareId}/download${token ? `?token=${token}` : ''}`;
}

export async function removeShare(shareId: string): Promise<void> {
  const res = await apiFetch(`/shares/${shareId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to remove share');
}

// ============ Stats ============

export async function getStats(): Promise<{
  totalUploads: number;
  activeTransfers: number;
  totalBytesUploaded: number;
  activeShares: number;
  totalDownloads: number;
  uptime: number;
}> {
  const res = await apiFetch('/stats');
  const data = await res.json();
  return data.data;
}
