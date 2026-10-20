import { useState, useRef, useEffect } from 'react';
import { QrCode, KeyRound, Smartphone, MonitorSmartphone, AlertCircle } from 'lucide-react';
import { generatePairingPin, verifyPin } from '../services/api';
import type { PairingData } from '../types';

interface PairingViewProps {
  serverOnline: boolean;
  onPaired: () => void;
}

export default function PairingView({ serverOnline, onPaired }: PairingViewProps) {
  const [mode, setMode] = useState<'initial' | 'pc-display' | 'phone-enter'>('initial');
  const [pairingData, setPairingData] = useState<PairingData | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-detect: if we can reach the API, we might be on the phone accessing the PC
  const isPhoneAccess = typeof window !== 'undefined' && !window.location.hostname.match(/localhost|127\.0\.0\.1/);

  useEffect(() => {
    if (isPhoneAccess && serverOnline) {
      setMode('phone-enter');
    }
  }, [isPhoneAccess, serverOnline]);

  const handleGeneratePin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generatePairingPin();
      setPairingData(data);
      setMode('pc-display');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pairing PIN');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (index: number, value: string) => {
    if (value.length > 1) value = value[value.length - 1];
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...pinDigits];
    newDigits[index] = value;
    setPinDigits(newDigits);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (newDigits.every((d) => d !== '')) {
      handleVerifyPin(newDigits.join(''));
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyPin = async (pin: string) => {
    setLoading(true);
    setError(null);
    try {
      const deviceName = navigator.userAgent.includes('Android')
        ? 'Android Phone'
        : navigator.userAgent.includes('iPhone')
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

  // PIN timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!pairingData) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((pairingData.expiresAt - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        setPairingData(null);
        setMode('initial');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingData]);

  if (!serverOnline && !isPhoneAccess) {
    return (
      <div className="card fade-in">
        <div className="pairing-container">
          <AlertCircle size={48} color="var(--error)" />
          <h2>Server Not Running</h2>
          <p className="text-secondary">
            Start the AirBridge server on your Windows PC first.
          </p>
          <div className="text-small text-secondary" style={{ maxWidth: 400 }}>
            <p>Run these commands in the AirBridge project directory:</p>
            <code style={{
              display: 'block',
              background: 'var(--bg-tertiary)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              marginTop: 8
            }}>
              cd server<br />
              npm run dev
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Mode: Initial — choose role */}
      {mode === 'initial' && (
        <div className="card">
          <div className="pairing-container">
            <MonitorSmartphone size={56} color="var(--accent)" />
            <h2>Pair Your Devices</h2>
            <p className="text-secondary text-center" style={{ maxWidth: 400 }}>
              Connect your Android phone and Windows PC to start transferring files wirelessly.
            </p>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={handleGeneratePin} disabled={loading}>
                <QrCode size={18} />
                I'm on the PC — Show QR Code
              </button>
              <button className="btn btn-secondary" onClick={() => setMode('phone-enter')}>
                <Smartphone size={18} />
                I'm on the Phone — Enter PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mode: PC showing QR + PIN */}
      {mode === 'pc-display' && pairingData && (
        <div className="card">
          <div className="pairing-container">
            <h2>Scan QR Code or Enter PIN</h2>
            <p className="text-secondary text-center" style={{ maxWidth: 400 }}>
              Open <strong>{pairingData.serverUrl}</strong> on your phone's browser,
              then enter the PIN below.
            </p>

            {/* QR Code */}
            <div className="qr-container">
              <img
                src={pairingData.qrCode}
                alt="QR Code"
                width={250}
                height={250}
                style={{ display: 'block' }}
              />
            </div>

            {/* PIN Display */}
            <div>
              <div className="text-center text-secondary mb-2">Pairing PIN</div>
              <div className="pin-display">
                {pairingData.pin.split('').map((digit, i) => (
                  <div key={i} className="pin-digit">{digit}</div>
                ))}
              </div>
            </div>

            {/* Timer */}
            {timeLeft !== null && (
              <div className="text-small text-secondary">
                Expires in {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
            )}

            {/* Network info */}
            <div className="text-small text-secondary" style={{ maxWidth: 400 }}>
              <strong>Network addresses:</strong>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 4 }}>
                {pairingData.addresses.map((addr) => (
                  <li key={addr.address}>
                    {addr.name}: <code>http://{addr.address}:3456</code>
                  </li>
                ))}
              </ul>
            </div>

            <button className="btn btn-secondary btn-small" onClick={handleGeneratePin} disabled={loading}>
              Generate New PIN
            </button>
          </div>
        </div>
      )}

      {/* Mode: Phone entering PIN */}
      {mode === 'phone-enter' && (
        <div className="card">
          <div className="pairing-container">
            <KeyRound size={48} color="var(--accent)" />
            <h2>Enter Pairing PIN</h2>
            <p className="text-secondary text-center" style={{ maxWidth: 400 }}>
              Enter the 6-digit PIN shown on your Windows PC.
            </p>

            <div className="pin-input-container">
              <div className="pin-input">
                {pinDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinInput(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    autoFocus={i === 0}
                    disabled={loading}
                  />
                ))}
              </div>

              {loading && (
                <div className="text-secondary pulse">Verifying...</div>
              )}
            </div>

            <button
              className="btn btn-secondary btn-small"
              onClick={() => { setMode('initial'); setError(null); }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card fade-in" style={{ borderColor: 'var(--error)', background: 'var(--error-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--error)' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
