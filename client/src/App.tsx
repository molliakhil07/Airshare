import { useState, useEffect, useCallback } from 'react';
import { Plane, Wifi, WifiOff, Settings } from 'lucide-react';
import { checkHealth, isAuthenticated, clearToken } from './services/api';
import PairingView from './components/PairingView';
import TransferView from './components/TransferView';
import type { ConnectionState } from './types';

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [serverOnline, setServerOnline] = useState(false);

  // Check if server is reachable
  const checkConnection = useCallback(async () => {
    try {
      await checkHealth();
      setServerOnline(true);
      if (isAuthenticated()) {
        setConnectionState('connected');
      } else {
        setConnectionState('disconnected');
      }
    } catch {
      setServerOnline(false);
      setConnectionState('error');
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const handlePaired = () => {
    setConnectionState('connected');
  };

  const handleDisconnect = () => {
    clearToken();
    setConnectionState('disconnected');
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <Plane className="header-logo" />
          <span className="header-title">AirBridge</span>
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
                onClick={handleDisconnect}
                title="Disconnect"
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

      {/* Main Content */}
      <main className="main-content">
        {connectionState === 'connected' ? (
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
