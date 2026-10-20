
import { useState, useRef, useEffect } from 'react';
import {
  QrCode,
  KeyRound,
  Smartphone,
  MonitorSmartphone,
  AlertCircle,
} from 'lucide-react';
import {
  generatePairingPin,
  verifyPin,
  getSessions,
} from '../services/api';
import type { PairingData } from '../types';

interface PairingViewProps {
  serverOnline: boolean;
  onPaired: () => void;
}

interface ConnectedDevice {
  id: string;
  deviceName: string;
  active: boolean;
  createdAt: string;
  lastActivity: string;
}

export default function PairingView({
  serverOnline,
  onPaired,
}: PairingViewProps) {
  const [mode, setMode] = useState<
    'initial' | 'pc-display' | 'phone-enter'
  >('initial');

  const [pairingData, setPairingData] = useState<PairingData | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    []
  );

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // A browser using a LAN address is treated as a phone.
  const isPhoneAccess =
    typeof window !== 'undefined' &&
    !window.location.hostname.match(/localhost|127\.0\.0\.1/);

  useEffect(() => {
    if (isPhoneAccess && serverOnline) {
      setMode('phone-enter');
    }
  }, [isPhoneAccess, serverOnline]);

  // Refresh the connected-device list on the PC.
  // getSessions() establishes the temporary host session automatically.
  useEffect(() => {
    if (isPhoneAccess || !serverOnline || mode !== 'pc-display') {
      return;
    }

    let cancelled = false;

    const refreshConnectedDevices = async () => {
      try {
        const sessions = await getSessions();

        if (!cancelled) {
          setConnectedDevices(
            sessions.filter((session) => session.active)
          );
        }
      } catch {
        // Keep pairing usable if a status refresh temporarily fails.
      }
    };

    void refreshConnectedDevices();

    const interval = window.setInterval(() => {
      void refreshConnectedDevices();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isPhoneAccess, serverOnline, mode]);

  const handleGeneratePin = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await generatePairingPin();
      setPairingData(data);
      setMode('pc-display');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate pairing PIN'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[value.length - 1];
    }

    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newDigits = [...pinDigits];
    newDigits[index] = value;
    setPinDigits(newDigits);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((digit) => digit !== '')) {
      void handleVerifyPin(newDigits.join(''));
    }
  };

  const handlePinKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === 'Backspace' &&
      !pinDigits[index] &&
      index > 0
    ) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyPin = async (pin: string) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const userAgent = navigator.userAgent;

      const deviceName = userAgent.includes('Android')
        ? 'Android Phone'
        : userAgent.includes('iPhone')
          ? 'iPhone'
          : 'Browser Device';

      await verifyPin(pin, deviceName);
      onPaired();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
      setPinDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Pairing PIN countdown.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!pairingData) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const left = Math.max(
        0,
        Math.floor((pairingData.expiresAt - Date.now()) / 1000)
      );

      setTimeLeft(left);

      if (left <= 0) {
        setPairingData(null);
        setMode('initial');
      }
    };

    updateTimer();

    const interval = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(interval);
  }, [pairingData]);

  if (!serverOnline && !isPhoneAccess) {
    return (
      <div className="card fade-in">
        <div className="pairing-container">
          <AlertCircle size={48} color="var(--error)" />
          <h2>Server Not Running</h2>
          <p className="text-secondary">
            Start the AirShare server on your Windows PC first.
          </p>

          <div
            className="text-small text-secondary"
            style={{ maxWidth: 400 }}
          >
            <p>Run these commands in the AirShare project directory:</p>
            <code
              style={{
                display: 'block',
                background: 'var(--bg-tertiary)',
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                marginTop: 8,
              }}
            >
              cd server
              <br />
              npm run dev
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Initial: choose PC or phone */}
      {mode === 'initial' && (
        <div className="card">
          <div className="pairing-container">
            <MonitorSmartphone size={56} color="var(--accent)" />
            <h2>Pair Your Devices</h2>

            <p
              className="text-secondary text-center"
              style={{ maxWidth: 400 }}
            >
              Connect your Android phone and Windows PC to start transferring
              files wirelessly.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn btn-primary"
                onClick={handleGeneratePin}
                disabled={loading}
              >
                <QrCode size={18} />
                I'm on the PC, Show QR Code.
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => setMode('phone-enter')}
              >
                <Smartphone size={18} />
                I'm on the Phone, Enter PIN :
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PC: show QR code and pairing PIN */}
      {mode === 'pc-display' && pairingData && (
        <div className="card">
          <div className="pairing-container">
            {connectedDevices.length > 0 && (
              <div
                className="card fade-in"
                style={{
                  width: '100%',
                  maxWidth: 420,
                  boxSizing: 'border-box',
                  borderColor: 'var(--success)',
                  marginBottom: 20,
                  padding: 16,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Smartphone size={24} color="var(--success)" />

                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <strong>
                      {connectedDevices.length === 1
                        ? 'Phone connected'
                        : `${connectedDevices.length} devices connected`}
                    </strong>

                    {connectedDevices.map((device) => (
                      <div
                        key={device.id}
                        className="text-small text-secondary"
                        style={{ marginTop: 4 }}
                      >
                        {device.deviceName} Â· Paired successfully
                      </div>
                    ))}
                  </div>

                  <span
                    className="status-dot connected"
                    aria-label="Connected"
                    title="Connected"
                  />
                </div>
              </div>
            )}

            <h2>Scan QR Code or Enter PIN</h2>

            <p
              className="text-secondary text-center"
              style={{ maxWidth: 400 }}
            >
              Open <strong>{pairingData.serverUrl}</strong> on your phone's
              browser, then enter the PIN below.
            </p>

            <div className="qr-container">
              <img
                src={pairingData.qrCode}
                alt="QR Code"
                width={250}
                height={250}
                style={{ display: 'block' }}
              />
            </div>

            <div>
              <div className="text-center text-secondary mb-2">
                Pairing PIN
              </div>

              <div className="pin-display">
                {pairingData.pin.split('').map((digit, index) => (
                  <div key={index} className="pin-digit">
                    {digit}
                  </div>
                ))}
              </div>
            </div>

            {timeLeft !== null && (
              <div className="text-small text-secondary">
                Expires in {Math.floor(timeLeft / 60)}:
                {(timeLeft % 60).toString().padStart(2, '0')}
              </div>
            )}

            <div
              className="text-small text-secondary"
              style={{ maxWidth: 400 }}
            >
              <strong>Network addresses:</strong>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  marginTop: 4,
                }}
              >
                {pairingData.addresses.map((address) => (
                  <li key={address.address}>
                    {address.name}:{' '}
                    <code>http://{address.address}:3456</code>
                  </li>
                ))}
              </ul>
            </div>

            <button
              className="btn btn-secondary btn-small"
              onClick={handleGeneratePin}
              disabled={loading}
            >
              Generate New PIN
            </button>
          </div>
        </div>
      )}

      {/* Phone: enter the pairing PIN */}
      {mode === 'phone-enter' && (
        <div className="card">
          <div className="pairing-container">
            <KeyRound size={48} color="var(--accent)" />
            <h2>Enter Pairing PIN</h2>

            <p
              className="text-secondary text-center"
              style={{ maxWidth: 400 }}
            >
              Enter the 6-digit PIN shown on your Windows PC.
            </p>

            <div className="pin-input-container">
              <div className="pin-input">
                {pinDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(event) =>
                      handlePinInput(index, event.target.value)
                    }
                    onKeyDown={(event) => handlePinKeyDown(index, event)}
                    autoFocus={index === 0}
                    disabled={loading}
                    aria-label={`PIN digit ${index + 1}`}
                  />
                ))}
              </div>

              {loading && (
                <div className="text-secondary pulse">Verifying...</div>
              )}
            </div>

            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                setMode('initial');
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div
          className="card fade-in"
          style={{
            borderColor: 'var(--error)',
            background: 'var(--error-bg)',
          }}
          role="alert"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: 'var(--error)',
            }}
          >
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
