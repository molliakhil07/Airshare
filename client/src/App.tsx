import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Smartphone } from 'lucide-react';
import {
  checkHealth,
  isAuthenticated,
  clearToken,
  getSessions,
  disconnectPhoneSession,
} from './services/api';
import PairingView from './components/PairingView';
import TransferView from './components/TransferView';
import HostDashboard from './components/HostDashboard';
import type { ConnectionState } from './types';

interface ConnectedDevice {
  id: string;
  deviceName: string;
  active: boolean;
  createdAt: string;
  lastActivity: string;
}

export default function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [serverOnline, setServerOnline] = useState(false);
  const [connectedDevices, setConnectedDevices] =
    useState<ConnectedDevice[]>([]);

  const isHostBrowser =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  const checkConnection = useCallback(async () => {
    try {
      await checkHealth();
      setServerOnline(true);

      // On the phone, the stored token indicates successful pairing.
      // On the PC, use the server's active-device list instead.
      if (!isHostBrowser) {
        setConnectionState(
          isAuthenticated() ? 'connected' : 'disconnected'
        );
      }
    } catch {
      setServerOnline(false);
      setConnectionState('error');
      setConnectedDevices([]);
    }
  }, [isHostBrowser]);

  useEffect(() => {
    void checkConnection();

    const interval = window.setInterval(
      () => void checkConnection(),
      10000
    );

    return () => window.clearInterval(interval);
  }, [checkConnection]);

  // The PC dashboard follows the server's active paired-device list.
  useEffect(() => {
    if (!isHostBrowser || !serverOnline) {
      setConnectedDevices([]);
      return;
    }

    let cancelled = false;

    const refreshDevices = async () => {
      try {
        const sessions = await getSessions();

        if (cancelled) return;

        const activeDevices = sessions.filter(
          (session) => session.active
        );

        setConnectedDevices(activeDevices);
        setConnectionState(
          activeDevices.length > 0 ? 'connected' : 'disconnected'
        );
      } catch {
        // A temporary session-list error should not take the
        // pairing screen or transfer service down.
      }
    };

    void refreshDevices();

    const interval = window.setInterval(
      () => void refreshDevices(),
      2000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isHostBrowser, serverOnline]);

  const handlePaired = () => {
    setConnectionState('connected');
  };

  const handleDisconnect = async () => {
  if (isHostBrowser) {
    try {
      const response = await fetch('/api/pair/sessions', {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Unable to disconnect paired devices.');
      }

      setConnectedDevices([]);
      setConnectionState('disconnected');
    } catch (error) {
      console.error('Disconnect failed:', error);
    }

    return;
  }

  try {
    await disconnectPhoneSession();
    setConnectionState('disconnected');
  } catch (error) {
    console.error('Phone disconnect failed:', error);
  }
};

  const showHostDashboard =
    isHostBrowser &&
    serverOnline &&
    connectionState === 'connected' &&
    connectedDevices.length > 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <img
            src="/airbridge-logo.svg"
            alt="AirShare logo"
            className="header-logo"
          />
          <span className="header-title">AirShare.</span>
        </div>

        <div className="header-status">
          <span
            className={`status-dot ${
              connectionState === 'connected'
                ? 'connected'
                : connectionState === 'error'
                  ? 'error'
                  : ''
            }`}
          />

          {connectionState === 'connected' ? (
            <>
              <Wifi size={16} />
              <span>Connected</span>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => void handleDisconnect()}
                title="Disconnect paired device"
              >
                Disconnect
              </button>
            </>
          ) : connectionState === 'error' ? (
            <>
              <WifiOff size={16} />
              <span>Server offline</span>
            </>
          ) : (
            <span>Not paired</span>
          )}
        </div>
      </header>

      <main className="main-content">
        {isHostBrowser ? (
          showHostDashboard ? (
            <>
              <section className="card fade-in">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Smartphone
                    size={30}
                    color="var(--accent)"
                  />

                  <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0 }}>
                      Connected device
                    </h2>

                    <p
                      className="text-secondary"
                      style={{ margin: '6px 0 0' }}
                    >
                      {connectedDevices.length === 1
                        ? connectedDevices[0].deviceName
                        : `${connectedDevices.length} devices connected`}
                    </p>
                  </div>

                  <span
                    className="status-dot connected"
                    title="Connected"
                  />
                </div>
              </section>

              <HostDashboard />
            </>
          ) : (
            <PairingView
              serverOnline={serverOnline}
              onPaired={handlePaired}
            />
          )
        ) : connectionState === 'connected' ? (
          <TransferView />
        ) : (
          <PairingView
            serverOnline={serverOnline}
            onPaired={handlePaired}
          />
        )}
      </main>
    </div>
  );
}
