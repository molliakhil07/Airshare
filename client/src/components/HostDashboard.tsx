import { useEffect, useState } from 'react';
import {
  File,
  FileCheck2,
  RefreshCw,
  AlertCircle,
  DownloadCloud,
  FolderOpen,
} from 'lucide-react';

import {
  getHostTransfers,
  showReceivedFileInFolder,
} from '../services/api';
import type { HostTransfer } from '../services/api';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${size.toFixed(1)} ${units[unit]}`;
}

function getProgress(file: HostTransfer): number {
  if (file.status === 'completed') return 100;
  if (file.totalSize <= 0) return 0;

  return Math.min(
    100,
    Math.round((file.bytesReceived / file.totalSize) * 100)
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Waiting';
    case 'uploading':
      return 'Receiving';
    case 'finalizing':
      return 'Finishing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export default function HostDashboard() {
  const [transfers, setTransfers] = useState<HostTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [openFileError, setOpenFileError] = useState<string | null>(null);

  const handleShowInFolder = async (file: HostTransfer) => {
    if (file.status !== 'completed' || openingFileId !== null) return;

    setOpeningFileId(file.id);
    setOpenFileError(null);

    try {
      await showReceivedFileInFolder(file.id);
    } catch (err) {
      setOpenFileError(
        err instanceof Error
          ? err.message
          : 'Unable to open the file location.'
      );
    } finally {
      setOpeningFileId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await getHostTransfers();

        if (!cancelled) {
          setTransfers(data);
          setError(null);
          setLastUpdated(new Date());
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load incoming transfers'
          );
          setLoading(false);
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Hide empty pending transfers until the first chunk arrives.
  // This prevents stale zero-byte placeholders from appearing as waiting files.
  const visibleTransfers = transfers.filter(
    (file) => file.status !== 'pending' || file.bytesReceived > 0
  );

  const activeTransfers = visibleTransfers.filter((file) =>
    ['pending', 'uploading', 'finalizing'].includes(file.status)
  );

  const completedTransfers = visibleTransfers.filter(
    (file) => file.status === 'completed'
  );

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Incoming files</h2>
          <p
            className="text-secondary text-small"
            style={{ margin: '6px 0 0' }}
          >
            Files received from your paired devices
          </p>
        </div>

        <div
          className="text-secondary text-small"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={15} />
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()}`
            : 'Connecting…'}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: 14,
            border: '1px solid var(--danger, #ef4444)',
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <AlertCircle size={20} />
          <div>
            <strong>Could not load transfers</strong>
            <p
              className="text-secondary text-small"
              style={{ margin: '5px 0 0' }}
            >
              {error}
            </p>
          </div>
        </div>
      )}

      {openFileError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: 12,
            border: '1px solid var(--danger, #ef4444)',
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <AlertCircle size={18} />
          <div>
            <strong>Could not open file location</strong>
            <p
              className="text-secondary text-small"
              style={{ margin: '5px 0 0' }}
            >
              {openFileError}
            </p>
          </div>
        </div>
      )}

      {loading && transfers.length === 0 && !error && (
        <p className="text-secondary">Loading transfers…</p>
      )}

      {!loading && !error && transfers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 12px' }}>
          <DownloadCloud
            size={36}
            style={{ opacity: 0.6, marginBottom: 10 }}
          />
          <h3 style={{ margin: '0 0 6px' }}>No files received yet</h3>
          <p className="text-secondary text-small" style={{ margin: 0 }}>
            Keep this screen open and send a file from your phone.
          </p>
        </div>
      )}

      {activeTransfers.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <h3 style={{ marginBottom: 12 }}>
            Receiving now ({activeTransfers.length})
          </h3>

          <div style={{ display: 'grid', gap: 12 }}>
            {activeTransfers.map((file) => {
              const progress = getProgress(file);

              return (
                <div
                  key={file.id}
                  style={{
                    padding: 14,
                    border: '1px solid var(--border, #333)',
                    borderRadius: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <File size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ overflowWrap: 'anywhere' }}>
                        {file.originalName}
                      </strong>
                      <p
                        className="text-secondary text-small"
                        style={{ margin: '4px 0 0' }}
                      >
                        {statusLabel(file.status)} ·{' '}
                        {formatBytes(file.bytesReceived)} of{' '}
                        {formatBytes(file.totalSize)}
                      </p>
                    </div>
                    <strong>{progress}%</strong>
                  </div>

                  <div
                    style={{
                      height: 7,
                      background: 'var(--border, #333)',
                      borderRadius: 99,
                      overflow: 'hidden',
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'var(--success, #22c55e)',
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ marginBottom: 12 }}>
          Recently received ({completedTransfers.length})
        </h3>

        {completedTransfers.length === 0 ? (
          <p className="text-secondary text-small">
            Completed files will appear here after a transfer finishes.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {completedTransfers.map((file) => {
              const isOpening = openingFileId === file.id;

              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => void handleShowInFolder(file)}
                  disabled={openingFileId !== null}
                  title="Show this file in Windows File Explorer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    minWidth: 0,
                    textAlign: 'left',
                    padding: 12,
                    border: '1px solid var(--border, #333)',
                    borderRadius: 10,
                    background: 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    cursor: openingFileId !== null ? 'wait' : 'pointer',
                    opacity: isOpening ? 0.7 : 1,
                    transition: 'border-color 150ms ease, opacity 150ms ease',
                  }}
                >
                  <FileCheck2
                    size={22}
                    color="var(--success, #22c55e)"
                    style={{ flexShrink: 0 }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ overflowWrap: 'anywhere' }}>
                      {file.originalName}
                    </strong>
                    <p
                      className="text-secondary text-small"
                      style={{ margin: '4px 0 0' }}
                    >
                      {formatBytes(file.totalSize)}
                      {file.completedAt
                        ? ` · ${new Date(file.completedAt).toLocaleString()}`
                        : ''}
                    </p>
                  </div>

                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--success, #22c55e)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <FolderOpen size={16} />
                    {isOpening ? 'Opening…' : 'Show in folder'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p
          className="text-secondary text-small"
          style={{ margin: '10px 0 0' }}
        >
          Click a completed file to reveal it in Windows File Explorer.
        </p>
      </div>
    </section>
  );
}