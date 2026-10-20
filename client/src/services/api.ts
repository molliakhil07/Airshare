
/**
 * AirShare API client
 * Handles communication with the backend server.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || '/api';

let hostSessionPromise: Promise<void> | null = null;

/**
 * Establish a temporary PC dashboard session.
 * Retry creation when the cookie expires or the backend restarts.
 */
export async function ensureHostSession(forceRefresh = false): Promise<void> {
  if (forceRefresh) hostSessionPromise = null;

  if (!hostSessionPromise) {
    hostSessionPromise = fetch(`${API_BASE}/host/session`, {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to establish the PC dashboard session.');
        }
      })
      .catch((error) => {
        hostSessionPromise = null;
        throw error;
      });
  }

  return hostSessionPromise;
}

/** Get the paired phone's stored authentication token. */
function getToken(): string | null {
  return sessionStorage.getItem('airbridge_token');
}

/** Store a paired phone's authentication token. */
export function setToken(token: string): void {
  sessionStorage.setItem('airbridge_token', token);
}

/** Clear the paired phone's authentication token. */
export function clearToken(): void {
  sessionStorage.removeItem('airbridge_token');
}

/** Check whether the phone has a stored authentication token. */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Make an authenticated API request for phone-side operations. */
async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // JSON requests need Content-Type; binary and FormData requests do not.
  if (
    !(options.body instanceof FormData) &&
    !(options.body instanceof ArrayBuffer) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof Uint8Array) &&
    typeof options.body === 'string'
  ) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
}

// ============ Health ============

export async function checkHealth(): Promise<{
  status: string;
  uptime: number;
}> {
  const res = await fetch(`${API_BASE}/health`, {
    credentials: 'same-origin',
  });

  if (!res.ok) {
    throw new Error('Unable to check AirShare server health.');
  }

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
  // Establish the temporary PC session before requesting a PIN.
  await ensureHostSession();

  const res = await fetch(`${API_BASE}/pair/generate`, {
    method: 'POST',
    credentials: 'same-origin',
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate PIN');
  }

  return data.data;
}


export async function verifyPin(
  pin: string,
  deviceName: string
): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const res = await apiFetch('/pair/verify', {
    method: 'POST',
    body: JSON.stringify({ pin, deviceName }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Pairing failed');
  }

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

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to get PIN status');
  }

  return data.data;
}

export async function getSessions(): Promise<
  {
    id: string;
    deviceName: string;
    active: boolean;
    createdAt: string;
    lastActivity: string;
  }[]
> {
  const fetchSessions = async (): Promise<Response> => {
    await ensureHostSession();
    return fetch(`${API_BASE}/pair/sessions`, { credentials: 'same-origin' });
  };

  let res = await fetchSessions();
  if (res.status === 401) {
    await ensureHostSession(true);
    res = await fetchSessions();
  }

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Unable to load paired devices.');
  }
  return data.data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await ensureHostSession();

  const res = await fetch(
    `${API_BASE}/pair/session/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
    }
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to revoke session');
  }
}

export async function disconnectPhoneSession(): Promise<void> {
  const res = await apiFetch('/pair/disconnect', {
    method: 'DELETE',
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to disconnect phone.');
  }

  clearToken();
}

// ============ Transfers (Phone â†’ PC upload) ============

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
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create transfer');
  }

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
  const res = await apiFetch(
    `/transfers/${encodeURIComponent(transferId)}/chunks/${chunkIndex}`,
    {
      method: 'PUT',
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    }
  );

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to upload chunk');
  }

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
  const res = await apiFetch(
    `/transfers/${encodeURIComponent(transferId)}/status`
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to get transfer status');
  }

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
  const res = await apiFetch(
    `/transfers/${encodeURIComponent(transferId)}/finalize`,
    { method: 'POST' }
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to finalize transfer');
  }

  return data.data;
}

export async function cancelTransfer(transferId: string): Promise<void> {
  const res = await apiFetch(
    `/transfers/${encodeURIComponent(transferId)}`,
    { method: 'DELETE' }
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to cancel transfer');
  }
}

export async function listTransfers(): Promise<any[]> {
  const res = await apiFetch('/transfers');
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to list transfers');
  }

  return data.data;
}

// ============ Host Dashboard Transfers ============

export interface HostTransfer {
  id: string;
  originalName: string;
  totalSize: number;
  bytesReceived: number;
  chunksReceived: number;
  totalChunks: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}


export async function getHostTransfers(): Promise<HostTransfer[]> {
  const fetchTransfers = async (): Promise<Response> => {
    await ensureHostSession();

    return fetch(`${API_BASE}/transfers/dashboard`, {
      credentials: 'same-origin',
    });
  };

  let res = await fetchTransfers();

  if (res.status === 401) {
    await ensureHostSession(true);
    res = await fetchTransfers();
  }

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(
      data.error || 'Failed to load incoming transfers.'
    );
  }

  return data.data as HostTransfer[];
}

export async function showReceivedFileInFolder(
  transferId: string
): Promise<void> {
  const request = async (): Promise<Response> => {
    await ensureHostSession();

    return fetch(
      `${API_BASE}/transfers/dashboard/${encodeURIComponent(transferId)}/show-in-folder`,
      {
        method: 'POST',
        credentials: 'same-origin',
      }
    );
  };

  let res = await request();

  if (res.status === 401) {
    await ensureHostSession(true);
    res = await request();
  }

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Unable to open the file location.');
  }
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

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to list shares');
  }

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
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to share file');
  }

  return data.data;
}

export function getDownloadUrl(shareId: string): string {
  const token = getToken();

  return `${API_BASE}/shares/${encodeURIComponent(shareId)}/download${
    token ? `?token=${encodeURIComponent(token)}` : ''
  }`;
}

export async function removeShare(shareId: string): Promise<void> {
  const res = await apiFetch(
    `/shares/${encodeURIComponent(shareId)}`,
    { method: 'DELETE' }
  );

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to remove share');
  }
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

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to load statistics');
  }

  return data.data;
}
