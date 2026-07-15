import React, { useState, useEffect } from 'react';
import { Shield, Phone, KeyRound, AlertTriangle, CheckCircle2, MessageSquare, ArrowRight, Edit2 } from 'lucide-react';

interface ClientLoginProps {
  onLoginSuccess: (phoneNumber: string, token: string) => void;
}

export const ClientLogin: React.FC<ClientLoginProps> = ({ onLoginSuccess }) => {
  const [phoneNumber, setPhoneNumber] = useState(() => localStorage.getItem('nh_last_phone') || '');
  const [chatId, setChatId] = useState(() => localStorage.getItem('nh_last_chat_id') || '');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((t) => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (!chatId || chatId.trim().length < 5) {
      setError('Please enter a valid Telegram Chat ID.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/client/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          chat_id: chatId.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // Save to local storage for convenience next time
        localStorage.setItem('nh_last_phone', phoneNumber.trim());
        localStorage.setItem('nh_last_chat_id', chatId.trim());
        
        setStep('verify');
        setTimer(60); // 1 minute countdown for resend
      } else {
        setError(data.detail || 'Failed to send OTP. Please check your credentials.');
      }
    } catch (err) {
      setError('Unable to reach authentication server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter a 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/client/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        onLoginSuccess(data.phone_number, data.token);
      } else {
        setError(data.detail || 'Invalid OTP code. Please try again.');
      }
    } catch (err) {
      setError('Unable to reach authentication server.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        background: 'var(--bg-deep)',
        backgroundImage: `
          radial-gradient(at 0% 0%, rgba(6, 182, 212, 0.15) 0px, transparent 50%),
          radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
          radial-gradient(at 50% 100%, rgba(16, 185, 129, 0.08) 0px, transparent 50%)
        `,
        zIndex: 9999,
        padding: '20px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '450px',
          padding: '40px 32px',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          boxShadow: '0 12px 40px 0 rgba(6, 182, 212, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(6, 182, 212, 0.1)',
              border: '2px solid var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              boxShadow: '0 0 15px var(--primary-glow)',
              marginBottom: '8px',
            }}
          >
            <Shield size={28} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
            NH Stock Spread
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
            Client 2FA Security Authentication
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'start',
              gap: '10px',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Phone Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <Phone size={14} /> Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="input-cyber"
                style={{ fontSize: '15px' }}
                disabled={loading}
                required
              />
            </div>

            {/* Chat ID Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <MessageSquare size={14} /> Telegram Chat ID
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 987654321"
                className="input-cyber"
                style={{ fontSize: '15px' }}
                disabled={loading}
                required
              />
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.35)', lineHeight: '1.4', marginTop: '4px' }}>
                💡 <strong>How to get Chat ID:</strong> Message <strong>@userinfobot</strong> or <strong>@getmyid_bot</strong> on Telegram. Also ensure you click "Start" in our bot first.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-cyber"
              style={{ width: '100%', padding: '12px', marginTop: '8px', fontSize: '14px', fontWeight: 600 }}
            >
              {loading ? 'Sending Verification...' : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  Send OTP Code <ArrowRight size={16} />
                </span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>OTP sent to phone:</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  +91 {phoneNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('request');
                  setOtp('');
                  setError('');
                }}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: 'var(--primary)',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <Edit2 size={12} /> Edit
              </button>
            </div>

            {/* OTP Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                <KeyRound size={14} /> Enter 6-digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="input-cyber"
                style={{
                  textAlign: 'center',
                  fontSize: '22px',
                  letterSpacing: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-cyber"
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600 }}
            >
              {loading ? 'Verifying Code...' : 'Verify & Launch Dashboard'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
              {timer > 0 ? (
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                  Resend code in {timer}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  Resend OTP Code
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
