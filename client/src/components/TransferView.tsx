
import { useRef, useState } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  CircleCheck,
  CircleAlert,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  cancelUpload,
  createQueuedFile,
  formatBytes,
  formatDuration,
  formatSpeed,
  uploadBatch,
} from '../services/upload';
import type { QueuedFile } from '../types';

const MAX_FILE_SIZE = 24 * 1024 * 1024 * 1024;

export default function TransferView() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const updateFile = (updated: QueuedFile) => {
    setFiles((current) =>
      current.map((file) =>
        file.id === updated.id ? { ...updated } : file
      )
    );
  };

  const addFiles = (selectedFiles: FileList | File[]) => {
    const incoming = Array.from(selectedFiles);
    const accepted: QueuedFile[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} exceeds the 24 GB limit.`);
        continue;
      }

      accepted.push(createQueuedFile(file));
    }

    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted]);
      setNotice(
        `${accepted.length} file${accepted.length === 1 ? '' : 's'} added to the queue.`
      );
    }

    if (rejected.length > 0) {
      setNotice(rejected.join(' '));
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const startUploads = async () => {
    const pending = files.filter((file) => file.status === 'pending');

    if (pending.length === 0 || isUploading) return;

    setIsUploading(true);
    setNotice('');

    try {
      await uploadBatch(
        pending,
        {
          onProgress: (file) => updateFile(file),
          onComplete: (file) => {
            updateFile(file);
            setNotice(`${file.file.name} transferred successfully.`);
          },
          onError: (file, error) => {
            updateFile({
              ...file,
              status: 'failed',
              error: error.message,
            });
            setNotice(`Failed: ${file.file.name}. ${error.message}`);
          },
        },
        1
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) =>
      current.filter((file) => file.id !== id)
    );
  };

  const retryFile = (id: string) => {
    setFiles((current) =>
      current.map((file) =>
        file.id === id
          ? {
              ...file,
              status: 'pending',
              progress: 0,
              bytesUploaded: 0,
              totalChunks: 0,
              chunksUploaded: 0,
              speed: 0,
              eta: 0,
              error: undefined,
              transferId: undefined,
            }
          : file
      )
    );
    setNotice('File added back to the queue. Start the transfer to retry.');
  };

  const cancelFile = (file: QueuedFile) => {
    cancelUpload(file.id);
    setFiles((current) =>
      current.map((item) =>
        item.id === file.id && item.status === 'pending'
          ? { ...item, status: 'cancelled' }
          : item
      )
    );
  };

  const clearFinished = () => {
    setFiles((current) =>
      current.filter(
        (file) =>
          !['completed', 'failed', 'cancelled'].includes(file.status)
      )
    );
  };

  const totalBytes = files.reduce(
    (sum, file) => sum + file.file.size,
    0
  );

  const completedCount = files.filter(
    (file) => file.status === 'completed'
  ).length;

  const activeCount = files.filter(
    (file) =>
      file.status === 'uploading' ||
      file.status === 'finalizing'
  ).length;

  const pendingCount = files.filter(
    (file) => file.status === 'pending'
  ).length;

  return (
    <div className="fade-in" style={{ display: 'grid', gap: 20 }}>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <UploadCloud size={21} />
              Send files to your PC
            </h2>
            <p className="text-secondary text-small">
              Transfer files wirelessly from your Android phone
              to the computer hosting AirBridge.
            </p>
          </div>
        </div>

        <div
          className={`dropzone ${isDragging ? 'dragover' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <UploadCloud
            size={42}
            className="dropzone-icon"
          />
          <div className="dropzone-text">
            Drop files here or click to browse
          </div>
          <div className="dropzone-hint">
            Select multiple files for batch transfer.
            Maximum 24 GB per file.
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files);
              }
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 18,
          }}
        >
          <button
            className="btn btn-primary"
            onClick={startUploads}
            disabled={isUploading || pendingCount === 0}
          >
            {isUploading ? (
              <LoaderCircle size={17} />
            ) : (
              <Play size={17} />
            )}
            {isUploading ? 'Transferring…' : 'Start transfer'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={clearFinished}
            disabled={
              !files.some((file) =>
                ['completed', 'failed', 'cancelled'].includes(file.status)
              )
            }
          >
            Clear finished
          </button>
        </div>

        {notice && (
          <p
            role="status"
            className="text-small"
            style={{ marginTop: 14, overflowWrap: 'anywhere' }}
          >
            {notice}
          </p>
        )}
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Files selected</div>
          <div className="stat-value">{files.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value success">{completedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In progress</div>
          <div className="stat-value accent">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Selected size</div>
          <div className="stat-value">{formatBytes(totalBytes)}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">
            <FileText size={20} />
            Transfer queue
          </h2>
          <span className="text-small text-secondary">
            {pendingCount} waiting
          </span>
        </div>

        {files.length === 0 ? (
          <div className="empty-state">
            <UploadCloud size={36} />
            <p>No files selected yet.</p>
            <p className="text-small text-secondary">
              Choose one file or select a batch to get started.
            </p>
          </div>
        ) : (
          <div className="file-list">
            {files.map((file) => {
              const busy =
                file.status === 'uploading' ||
                file.status === 'finalizing';

              return (
                <div className="file-item" key={file.id}>
                  <div className="file-icon">
                    {file.status === 'completed' ? (
                      <CircleCheck size={22} />
                    ) : file.status === 'failed' ? (
                      <CircleAlert size={22} />
                    ) : busy ? (
                      <LoaderCircle size={22} />
                    ) : (
                      <FileText size={22} />
                    )}
                  </div>

                  <div className="file-info" style={{ minWidth: 0 }}>
                    <div
                      className="file-name"
                      title={file.file.name}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {file.file.name}
                    </div>

                    <div className="file-meta">
                      {formatBytes(file.file.size)}
                      {' · '}
                      {file.status === 'pending' && 'Waiting'}
                      {file.status === 'uploading' && 'Uploading'}
                      {file.status === 'finalizing' && 'Verifying and saving'}
                      {file.status === 'completed' && 'Completed'}
                      {file.status === 'failed' && 'Failed'}
                      {file.status === 'cancelled' && 'Cancelled'}
                    </div>

                    {(busy || file.status === 'completed') && (
                      <>
                        <div
                          className="progress-bar"
                          aria-label={`${Math.round(file.progress)}% uploaded`}
                          style={{ marginTop: 9 }}
                        >
                          <div
                            className={`progress-fill ${
                              file.status === 'completed' ? 'completed' : ''
                            }`}
                            style={{
                              width: `${Math.min(file.progress, 100)}%`,
                            }}
                          />
                        </div>

                        <div
                          className="progress-stats"
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 12,
                            marginTop: 6,
                          }}
                        >
                          <span>{Math.round(file.progress)}%</span>
                          {busy && file.speed > 0 && (
                            <span>{formatSpeed(file.speed)}</span>
                          )}
                          {busy && file.eta > 0 && (
                            <span>About {formatDuration(file.eta)} left</span>
                          )}
                        </div>
                      </>
                    )}

                    {file.error && (
                      <p
                        className="text-small"
                        style={{
                          color: 'var(--error)',
                          marginTop: 6,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {file.error}
                      </p>
                    )}
                  </div>

                  <div className="file-actions">
                    {busy && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => cancelFile(file)}
                        title="Cancel transfer"
                        aria-label={`Cancel ${file.file.name}`}
                      >
                        <X size={16} />
                      </button>
                    )}

                    {file.status === 'failed' && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => retryFile(file.id)}
                        title="Retry this file"
                      >
                        <RotateCcw size={16} />
                        Retry
                      </button>
                    )}

                    {!busy && file.status !== 'pending' && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => removeFile(file.id)}
                        title="Remove from list"
                        aria-label={`Remove ${file.file.name}`}
                      >
                        <X size={16} />
                      </button>
                    )}

                    {file.status === 'pending' && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => removeFile(file.id)}
                        title="Remove from queue"
                        aria-label={`Remove ${file.file.name}`}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 18,
          alignItems: 'flex-start',
        }}
      >
        <ShieldCheck size={26} color="var(--success)" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ margin: '0 0 6px' }}>Private local transfers</h3>
          <p className="text-secondary text-small" style={{ margin: 0 }}>
            When both devices can reach your PC over the local network,
            file data can travel directly to your PC without cloud storage.
            Keep AirBridge running until transfers finish.
          </p>
        </div>
        <Zap size={23} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ margin: '0 0 6px' }}>Large-file ready design</h3>
          <p className="text-secondary text-small" style={{ margin: 0 }}>
            Files are divided into chunks instead of being loaded into memory
            all at once. Actual transfer speed and 24 GB reliability still
            need to be validated on your devices.
          </p>
        </div>
      </section>
    </div>
  );
}
