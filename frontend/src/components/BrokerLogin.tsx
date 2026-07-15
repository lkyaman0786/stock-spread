import React, { useState, useEffect } from 'react';
import { Shield, Key, User, Cpu, Power, CheckCircle, AlertTriangle, Lock } from 'lucide-react';

interface Broker {
  id: string;
  name: string;
  logoColor: string;
}

interface BrokerLoginProps {
  onLoginSuccess: (broker: string, clientId: string) => void;
  connectedBrokers: Array<{ broker: string; client_id: string; mode?: string }>;
  onLogout: (broker: string, clientId: string) => void;
}

const BROKERS: Broker[] = [
  { id: 'angelone', name: 'Angel One', logoColor: '#ff6600' },
  { id: 'zerodha', name: 'Zerodha Kite', logoColor: '#387ed1' },
  { id: 'fyers', name: 'Fyers', logoColor: '#369d3f' },
  { id: 'upstox', name: 'Upstox', logoColor: '#4d2d79' },
  { id: 'groww', name: 'Groww', logoColor: '#00d09c' },
  { id: 'aliceblue', name: 'Alice Blue', logoColor: '#0c529c' },
  { id: 'paisa5', name: '5Paisa', logoColor: '#ea1c26' },
];

export const BrokerLogin: React.FC<BrokerLoginProps> = ({ onLoginSuccess, connectedBrokers, onLogout }) => {
  const [selectedBroker, setSelectedBroker] = useState<Broker>(BROKERS[0]);
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState(''); // PIN / password
  const [apiKey, setApiKey] = useState('');     // Developer API key
  const [totpSecret, setTotpSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isFlipped, setIsFlipped] = useState(false);

  const isAngelOne = selectedBroker.id === 'angelone';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !totpSecret || (isAngelOne && (!password || !apiKey)) || (!isAngelOne && !apiKey)) {
      setError('Please fill in all credential fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/broker/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broker: selectedBroker.name,
          client_id: clientId,
          password: isAngelOne ? password : '',
          api_key: apiKey,
          totp_secret: totpSecret,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTotpCode(data.totp_code || 'CONNECTED');
        onLoginSuccess(selectedBroker.name, clientId);
        
        // Reset form
        setClientId('');
        setPassword('');
        setApiKey('');
        setTotpSecret('');
        
        setIsFlipped(true);
        setTimeout(() => setIsFlipped(false), 3000);
      } else {
        setError(data.detail || 'Login failed. Verify your details.');
      }
    } catch (err) {
      setError('Failed to contact login backend.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '24px', height: '100%' }}>
      {/* Broker List Panel */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={20} /> Select Broker Terminal
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, maxHeight: '350px', paddingRight: '4px' }}>
          {BROKERS.map((broker) => {
            const isSelected = selectedBroker.id === broker.id;
            const isConnected = connectedBrokers.some(b => b.broker === broker.name);
            const activeSession = connectedBrokers.find(b => b.broker === broker.name);
            
            return (
              <div
                key={broker.id}
                onClick={() => {
                  setSelectedBroker(broker);
                  setError('');
                }}
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: broker.logoColor,
                      boxShadow: `0 0 8px ${broker.logoColor}`,
                    }}
                  />
                  <span style={{ fontWeight: 500, color: isSelected ? '#fff' : '#cbd5e1' }}>
                    {broker.name}
                  </span>
                </div>

                {isConnected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      color: activeSession?.mode === 'REAL' ? 'var(--success)' : 'var(--warning)', 
                      fontSize: '11px', 
                      background: activeSession?.mode === 'REAL' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', 
                      padding: '2px 8px', 
                      borderRadius: '12px',
                      fontWeight: 600
                    }}>
                      {activeSession?.mode === 'REAL' ? 'LIVE' : 'SIMULATED'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeSession) {
                          onLogout(activeSession.broker, activeSession.client_id);
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 600,
                        textDecoration: 'underline'
                      }}
                    >
                      Logout
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '12px' }}>Offline</span>
                )}
              </div>
            );
          })}
        </div>

        {connectedBrokers.length > 0 && (
          <div style={{ marginTop: 'auto', background: 'rgba(6, 182, 212, 0.05)', padding: '12px', borderRadius: '10px', border: '1px dashed var(--border-glass-active)' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Connected Terminals:</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {connectedBrokers.map((b, idx) => (
                <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', background: b.mode === 'REAL' ? 'var(--success)' : 'var(--warning)', borderRadius: '50%' }} />
                  {b.broker} ({b.client_id}) - {b.mode === 'REAL' ? 'LIVE' : 'SIMULATED'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Login Card Panel (with 3D perspective effect) */}
      <div style={{ perspective: '1000px', height: '100%' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front Side: Form */}
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflowY: 'auto'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#fff' }}>
                  Link {selectedBroker.name} Account
                </h3>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: selectedBroker.logoColor + '1a',
                    color: selectedBroker.logoColor,
                    fontSize: '11px',
                    fontWeight: 600,
                    border: `1px solid ${selectedBroker.logoColor}4d`,
                  }}
                >
                  {isAngelOne ? 'SmartAPI Real' : 'API Standard'}
                </span>
              </div>

              {error && (
                <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Client ID */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={13} /> Client Username / ID
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="e.g. M163733 or ZER123"
                    className="input-cyber"
                    required
                  />
                </div>

                {/* Password / PIN - Only visible for Angel One */}
                {isAngelOne && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lock size={13} /> Client PIN / Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. yKh9jmp2 or 4-digit PIN"
                      className="input-cyber"
                      required={isAngelOne}
                    />
                  </div>
                )}

                {/* API Key (Publisher developer key) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Key size={13} /> {isAngelOne ? 'SmartAPI App Developer Key' : 'API Key / Password'}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter publisher API Key"
                    className="input-cyber"
                    required
                  />
                </div>

                {/* TOTP */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={13} /> 2FA TOTP Secret Key or 6-digit Code
                  </label>
                  <input
                    type="password"
                    value={totpSecret}
                    onChange={(e) => setTotpSecret(e.target.value)}
                    placeholder="Enter base32 secret or current 6-digit TOTP"
                    className="input-cyber"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-cyber"
                  style={{ width: '100%', marginTop: '6px', padding: '10px' }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="pulse-glow" style={{ width: '6px', height: '6px', background: '#fff', borderRadius: '50%' }} />
                      Connecting Terminals...
                    </span>
                  ) : (
                    <>
                      <Power size={14} /> Establish Session
                    </>
                  )}
                </button>
              </form>
            </div>

            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.35)', textAlign: 'center', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <Shield size={10} /> Data is secured locally in memory. No server storage.
            </div>
          </div>

          {/* Back Side: Success Panel */}
          <div
            className="glass-panel"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              borderColor: 'var(--success)',
              boxShadow: '0 0 25px rgba(16, 185, 129, 0.15)',
            }}
          >
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '2px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', boxShadow: '0 0 15px var(--success-glow)' }}>
              <CheckCircle size={32} />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>Connection Confirmed</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginTop: '4px' }}>
                Secure handshake completed with {selectedBroker.name} API.
              </p>
            </div>

            {totpCode && totpCode !== 'CONNECTED' && (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '10px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active 2FA TOTP Code</span>
                <span style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary)', letterSpacing: '4px' }}>
                  {totpCode}
                </span>
              </div>
            )}
            
            <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 500 }} className="pulse-glow">
              Status: Live Feed Synced
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
export default BrokerLogin;
