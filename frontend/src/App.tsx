import React, { useState, useEffect, useRef } from 'react';
import { ThreeDCanvas } from './components/ThreeDCanvas';
import { BrokerLogin } from './components/BrokerLogin';
import { ClientLogin } from './components/ClientLogin';
import { SpreadBuilder } from './components/SpreadBuilder';
import type { LegConfig } from './components/SpreadBuilder';
import { ChartMonitor } from './components/ChartMonitor';
import { OrderBook } from './components/OrderBook';
import { 
  Shield, Network, Layers, BarChart4, Power, RefreshCw, 
  Landmark, Plus, Trash2, Crosshair, Play, Square, Activity, BellRing, Settings, LogOut, X 
} from 'lucide-react';

interface SpreadBid {
  id: string;
  price: string | number;
  qty: number;
  type: 'GREATER_THAN' | 'LESS_THAN';
  direction: 'BUY' | 'SELL';
  isArmed: boolean;
}

interface SpreadConfig {
  id: string;
  name: string;
  legA: LegConfig;
  legB: LegConfig;
  bids: SpreadBid[];
}

export const App: React.FC = () => {
  // Client session states
  const [clientSession, setClientSession] = useState<{ phone: string; token: string } | null>(() => {
    const saved = localStorage.getItem('nh_client_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse client session', e);
      }
    }
    return null;
  });

  // Navigation tabs (Dashboard itself is main terminal)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');

  // Modals visibility
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeChartSpread, setActiveChartSpread] = useState<SpreadConfig | null>(null);
  const [editingSpread, setEditingSpread] = useState<SpreadConfig | null>(null);

  // Broker states
  const [connectedBrokers, setConnectedBrokers] = useState<Array<{ broker: string; client_id: string; mode?: string }>>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);

  // System Logs & Console Alerts
  const [systemLogs, setSystemLogs] = useState<Array<{ id: string; time: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>>([
    { id: '1', time: new Date().toLocaleTimeString(), message: 'System initialized. Ready for spread limit bids.', type: 'info' }
  ]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setSystemLogs(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString(),
        message,
        type
      }
    ].slice(-50));
  };

  const handleClientLoginSuccess = (phone: string, token: string) => {
    const session = { phone, token };
    localStorage.setItem('nh_client_session', JSON.stringify(session));
    setClientSession(session);
    addLog(`Client authenticated: +91 ${phone}`, 'success');
  };

  const handleClientLogout = () => {
    localStorage.removeItem('nh_client_session');
    setClientSession(null);
    setConnectedBrokers([]);
    setOrders([]);
    setPositions([]);
    addLog('Client logged out.', 'info');
  };

  // Local card input states for limit bids
  const [cardPriceInputs, setCardPriceInputs] = useState<{[cardId: string]: string}>({});
  const [cardQtyInputs, setCardQtyInputs] = useState<{[cardId: string]: number}>({});

  // Spreads configurations
  const [spreads, setSpreads] = useState<SpreadConfig[]>(() => {
    const saved = localStorage.getItem('nh_spreads');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved spreads', e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('nh_spreads', JSON.stringify(spreads));
  }, [spreads]);

  // Real-time feeds
  const [ticks, setTicks] = useState<{ [token: string]: any }>({});
  const [spreadHistories, setSpreadHistories] = useState<{ [spreadId: string]: any[] }>({});
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Audio beep notifier
  const playTriggerSound = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioCtx = audioContextRef.current;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      setTimeout(() => {
        osc.frequency.setValueAtTime(1320, audioCtx.currentTime); // E6
      }, 100);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
      console.warn("Audio Context beep failed: ", e);
    }
  };

  // Fetch session parameters
  const fetchBrokerData = async () => {
    try {
      const resBrokers = await fetch('http://127.0.0.1:8000/api/broker/status');
      if (resBrokers.ok) {
        const data = await resBrokers.json();
        setConnectedBrokers(data.connected_brokers || []);
      }

      const resOrders = await fetch('http://127.0.0.1:8000/api/broker/orders');
      if (resOrders.ok) {
        const data = await resOrders.json();
        setOrders(data.orders || []);
      }

      const resPositions = await fetch('http://127.0.0.1:8000/api/broker/positions');
      if (resPositions.ok) {
        const data = await resPositions.json();
        setPositions(data.positions || []);
      }
    } catch (e) {
      console.warn("Failed fetching server data:", e);
    }
  };

  useEffect(() => {
    if (!clientSession) return;
    fetchBrokerData();
    const interval = setInterval(fetchBrokerData, 3000);
    return () => clearInterval(interval);
  }, [clientSession]);

  // 1. WebSocket Connection on mount
  useEffect(() => {
    if (!clientSession) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isIntentionalClose = false;

    const connectWs = () => {
      if (isIntentionalClose) return;
      
      ws = new WebSocket('ws://127.0.0.1:8000/ws/live');
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('Telemetry WS connected.');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ticks') {
          setTicks(prevTicks => ({ ...prevTicks, ...msg.data }));
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!isIntentionalClose) {
          console.warn('Telemetry WS disconnected. Retrying in 3s...');
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
    };

    connectWs();

    return () => {
      isIntentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [clientSession]);

  // 2. Telemetry subscription whenever spreads change or connection goes live
  useEffect(() => {
    if (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const tokens = new Set<string>();
      spreads.forEach(s => {
        tokens.add(`${s.legA.exch_seg}:${s.legA.token}`);
        tokens.add(`${s.legB.exch_seg}:${s.legB.token}`);
      });

      if (tokens.size > 0) {
        wsRef.current.send(JSON.stringify({
          action: 'subscribe',
          tokens: Array.from(tokens)
        }));
        console.log("Subscribed to tokens:", Array.from(tokens));
      }
    }
  }, [spreads, wsConnected]);

  // 3. Compile histories whenever ticks update
  useEffect(() => {
    setSpreadHistories(prevHist => {
      const nextHist = { ...prevHist };
      let changed = false;

      spreads.forEach(s => {
        const ltpA = ticks[s.legA.token]?.ltp || 0;
        const ltpB = ticks[s.legB.token]?.ltp || 0;
        
        if (ltpA > 0 && ltpB > 0) {
          const val = ltpA - ltpB;
          const history = nextHist[s.id] || [];
          
          const lastPoint = history[history.length - 1];
          const newTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          if (!lastPoint || lastPoint.spread !== val) {
            const newPoint = {
              time: newTime,
              spread: parseFloat(val.toFixed(2)),
              legA: ltpA,
              legB: ltpB
            };
            const updatedHistory = [...history, newPoint];
            if (updatedHistory.length > 50) updatedHistory.shift();
            nextHist[s.id] = updatedHistory;
            changed = true;
          }
        }
      });

      return changed ? nextHist : prevHist;
    });
  }, [ticks, spreads]);

  // Check algo arm triggers (supporting multiple bids per spread)
  useEffect(() => {
    spreads.forEach(s => {
      if (!s.bids || s.bids.length === 0) return;

      const ltpA = ticks[s.legA.token]?.ltp || 0;
      const ltpB = ticks[s.legB.token]?.ltp || 0;
      
      if (ltpA === 0 || ltpB === 0) return;

      const val = ltpA - ltpB;

      s.bids.forEach(bid => {
        if (!bid.isArmed) return;

        const triggerValNum = parseFloat(bid.price.toString());
        if (isNaN(triggerValNum)) return;

        let triggerMet = false;
        if (bid.type === 'GREATER_THAN' && val >= triggerValNum) {
          triggerMet = true;
        } else if (bid.type === 'LESS_THAN' && val <= triggerValNum) {
          triggerMet = true;
        }

        if (triggerMet) {
          // Disarm this specific bid first
          disarmAlgoBid(s.id, bid.id);
          // Execute unified spread order
          handleExecuteSpreadTrade(s, bid.direction, bid.qty, ltpA, ltpB);
          playTriggerSound();
        }
      });
    });
  }, [ticks, spreads]);

  const disarmAlgoBid = (spreadId: string, bidId: string) => {
    setSpreads(prev => prev.map(s => {
      if (s.id === spreadId) {
        return { 
          ...s, 
          bids: s.bids.map(b => b.id === bidId ? { ...b, isArmed: false } : b)
        };
      }
      return s;
    }));
  };

  // Add or Edit spread card
  const handleSpreadConfigured = (name: string, configuredLegA: LegConfig, configuredLegB: LegConfig) => {
    if (editingSpread) {
      setSpreads(prev => prev.map(s => {
        if (s.id === editingSpread.id) {
          return {
            ...s,
            name,
            legA: configuredLegA,
            legB: configuredLegB
          };
        }
        return s;
      }));
      addLog(`Spread edited: ${name}`, 'info');
      setEditingSpread(null);
    } else {
      const newSpread: SpreadConfig = {
        id: `spread-${Date.now()}`,
        name,
        legA: configuredLegA,
        legB: configuredLegB,
        bids: [],
      };
      setSpreads(prev => [...prev, newSpread]);
      addLog(`New spread deployed: ${name}`, 'success');
    }
    setIsAddModalOpen(false);
  };

  // Delete spread card
  const handleDeleteSpread = (id: string) => {
    // Unsubscribe tokens if no longer used
    setSpreads(prev => prev.filter(s => s.id !== id));
    setSpreadHistories(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Trade Execution
  // Trade Execution (Unified Spread Order with concurrent margin check)
  const handleExecuteSpreadTrade = async (s: SpreadConfig, direction: 'BUY' | 'SELL', qty: number, explicitLtpA?: number, explicitLtpB?: number) => {
    let actionA = s.legA.direction;
    let actionB = s.legB.direction;

    if (direction === 'SELL') {
      actionA = s.legA.direction === 'BUY' ? 'SELL' : 'BUY';
      actionB = s.legB.direction === 'BUY' ? 'SELL' : 'BUY';
    }

    const ltpA = explicitLtpA || ticks[s.legA.token]?.ltp || 0;
    const ltpB = explicitLtpB || ticks[s.legB.token]?.ltp || 0;

    const splitKeyA = s.legA.brokerKey.split(':');
    const brokerNameA = splitKeyA[0] || 'SIMULATOR';
    const clientIdA = splitKeyA[1] || 'GUEST';

    const finalBrokerKeyA = connectedBrokers.length > 0 ? `${brokerNameA}:${clientIdA}` : 'Simulator:Guest';
    const finalBrokerKeyB = connectedBrokers.length > 0 ? `${s.legB.brokerKey}` : 'Simulator:Guest';

    const payload = {
      name: s.name,
      legA: {
        token: s.legA.token,
        symbol: s.legA.symbol,
        exch_seg: s.legA.exch_seg,
        direction: actionA,
        multiplier: s.legA.multiplier,
        lotsize: parseInt(s.legA.lotsize) || 1,
        instrumenttype: s.legA.instrumenttype || '',
        strike: parseFloat(s.legA.strike) || 0.0,
        brokerKey: finalBrokerKeyA
      },
      legB: {
        token: s.legB.token,
        symbol: s.legB.symbol,
        exch_seg: s.legB.exch_seg,
        direction: actionB,
        multiplier: s.legB.multiplier,
        lotsize: parseInt(s.legB.lotsize) || 1,
        instrumenttype: s.legB.instrumenttype || '',
        strike: parseFloat(s.legB.strike) || 0.0,
        brokerKey: finalBrokerKeyB
      },
      qty,
      ltpA,
      ltpB
    };

    try {
      addLog(`Placing spread order: ${s.name} (${qty} Lots)...`, 'info');
      const response = await fetch('http://127.0.0.1:8000/api/broker/spread-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        addLog(`SUCCESS: ${s.name} (${qty} Lots) executed. Margin: ₹${resData.req_funds.toLocaleString()}`, 'success');
        fetchBrokerData();
      } else {
        const errorMsg = resData.detail || 'Spread trade rejected.';
        addLog(`REJECTED: ${errorMsg}`, 'error');
      }
    } catch (e: any) {
      console.error("Failed to execute spread:", e);
      addLog(`Order Placement Failed: ${e.message || e}`, 'error');
    }
  };

  // Close Positions
  const handleClosePositions = async () => {
    for (const pos of positions) {
      if (pos.qty === 0) continue;
      const reverseDir = pos.qty > 0 ? 'SELL' : 'BUY';
      const ltp = ticks[pos.token]?.ltp || 0;

      try {
        await fetch('http://127.0.0.1:8000/api/broker/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            broker: pos.broker,
            client_id: pos.client_id,
            token: pos.token,
            symbol: pos.symbol,
            transaction_type: reverseDir,
            qty: Math.abs(pos.qty),
            price: ltp,
            order_type: 'MARKET',
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }
    fetchBrokerData();
  };

  const handleResetPositions = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/broker/positions/reset', { method: 'POST' });
      fetchBrokerData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogoutBroker = async (broker: string, clientId: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/broker/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker, client_id: clientId }),
      });
      if (res.ok) {
        fetchBrokerData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!clientSession) {
    return <ClientLogin onLoginSuccess={handleClientLoginSuccess} />;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100vh', zIndex: 1, position: 'relative' }}>
      <ThreeDCanvas />

      {/* Header Bar */}
      <header className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--success) 0%, var(--primary) 100%)', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: '900', fontSize: '18px', boxShadow: '0 0 15px rgba(16,185,129,0.3)' }}>
            NH
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>NH STOCK SPREAD</h1>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Indian Stock & F&O Spread Trading Suite</span>
          </div>
        </div>

        {/* Status and Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <span className={wsConnected ? "pulse-glow" : ""} style={{ width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? 'var(--success)' : 'var(--danger)', boxShadow: wsConnected ? '0 0 8px var(--success)' : '0 0 8px var(--danger)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)' }}>TELEMETRY WS</span>
          </div>

          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="btn-cyber-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
          >
            <Landmark size={14} /> 
            {connectedBrokers.length > 0 ? (
              connectedBrokers.some(b => b.mode === 'REAL') 
                ? `${connectedBrokers.length} Linked (LIVE)`
                : `${connectedBrokers.length} Linked (SIM)`
            ) : 'Link Broker'}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn-cyber"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
          >
            <Plus size={14} /> Add Spread
          </button>

          <button
            onClick={handleClientLogout}
            className="btn-cyber-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
            title="Log Out Client Session"
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </header>

      {/* Tabs navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setActiveTab('dashboard')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'dashboard' ? 'var(--primary)' : 'rgba(255,255,255,0.45)',
            fontSize: '14px',
            fontWeight: 600,
            padding: '10px 16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'dashboard' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          Spread Dashboard ({spreads.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'history' ? 'var(--primary)' : 'rgba(255,255,255,0.45)',
            fontSize: '14px',
            fontWeight: 600,
            padding: '10px 16px',
            cursor: 'pointer',
            borderBottom: activeTab === 'history' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          Positions & Orders History
        </button>
      </div>

      {/* Main Switcher Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'dashboard' && (
          <div>
            {spreads.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'rgba(255,255,255,0.35)' }}>
                <Layers size={48} className="pulse-glow" style={{ color: 'var(--primary)' }} />
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 600 }}>Welcome to NH Stock Spread</h3>
                  <p style={{ fontSize: '13px', marginTop: '4px', maxWidth: '400px' }}>
                    Configure and execute cross-market spreads. Link your broker and add spreads to build your dashboard.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="btn-cyber"
                  style={{ padding: '10px 20px', marginTop: '8px' }}
                >
                  <Plus size={16} /> Deploy Your First Spread
                </button>
              </div>
            ) : (
              /* Spreads Grid list */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(430px, 1fr))', gap: '20px' }}>
                {spreads.map((s) => {
                  const ltpA = ticks[s.legA.token]?.ltp || 0;
                  const ltpB = ticks[s.legB.token]?.ltp || 0;
                  const badla = ltpA > 0 && ltpB > 0 ? ltpA - ltpB : 0;
                  const history = spreadHistories[s.id] || [];

                  return (
                    <div key={s.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', border: s.isAlgoArmed ? '1px solid var(--border-glass-active)' : '1px solid var(--border-glass)' }}>
                      
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.name}</h3>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                            Leg A ({s.legA.direction}) / Leg B ({s.legB.direction})
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => {
                              setEditingSpread(s);
                              setIsAddModalOpen(true);
                            }}
                            className="btn-cyber-outline"
                            style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', borderColor: 'rgba(255,255,255,0.06)' }}
                            title="Edit Spread"
                          >
                            <Settings size={13} />
                          </button>

                          <button
                            onClick={() => setActiveChartSpread(s)}
                            className="btn-cyber-outline"
                            style={{ padding: '5px 8px', fontSize: '11px', borderRadius: '6px', borderColor: 'rgba(255,255,255,0.06)' }}
                            title="View Chart"
                          >
                            <BarChart4 size={13} />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteSpread(s.id)}
                            className="btn-cyber-outline"
                            style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--danger)', borderRadius: '6px', borderColor: 'rgba(244,63,94,0.1)' }}
                            title="Delete Spread"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Legs Readouts */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Leg A: {s.legA.symbol}</div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            ₹{ltpA > 0 ? ltpA.toFixed(2) : '...'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Leg B: {s.legB.symbol}</div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                            ₹{ltpB > 0 ? ltpB.toFixed(2) : '...'}
                          </div>
                        </div>
                      </div>

                      {/* Large Center Live Spread "Badla" display */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px', background: 'rgba(6, 182, 212, 0.03)', border: '1px solid rgba(6, 182, 212, 0.08)', borderRadius: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Spread LTP ("Badla")</span>
                        <span
                          style={{
                            fontSize: '28px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: badla >= 0 ? 'var(--success)' : 'var(--danger)',
                            textShadow: badla >= 0 ? '0 0 10px var(--success-glow)' : '0 0 10px var(--danger-glow)',
                            marginTop: '4px'
                          }}
                        >
                          {ltpA > 0 && ltpB > 0 ? badla.toFixed(2) : 'Awaiting...'}
                        </span>
                      </div>

                      {/* Spread Limit Bids / Algo Triggers inline card */}
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Crosshair size={12} /> Spread Limit Bids
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: (s.bids || []).filter(b => b.isArmed).length > 0 ? 'var(--success)' : 'rgba(255,255,255,0.3)' }}>
                            {(s.bids || []).filter(b => b.isArmed).length > 0 ? `● ${s.bids.filter(b => b.isArmed).length} BIDS ACTIVE` : '○ NO ACTIVE BIDS'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <input
                            type="text"
                            value={cardPriceInputs[s.id] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Allow typing minus sign, decimals, numbers
                              if (val === '' || val === '-' || val === '-.' || !isNaN(Number(val))) {
                                setCardPriceInputs(prev => ({ ...prev, [s.id]: val }));
                              }
                            }}
                            className="input-cyber"
                            style={{ padding: '4px 6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                            placeholder="Bid Price"
                          />

                          <input
                            type="number"
                            min="1"
                            value={cardQtyInputs[s.id] || 1}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setCardQtyInputs(prev => ({ ...prev, [s.id]: val }));
                            }}
                            className="input-cyber"
                            style={{ padding: '4px 6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                            placeholder="Lots"
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <button
                            onClick={() => {
                              const priceStr = cardPriceInputs[s.id] || '';
                              const qtyVal = cardQtyInputs[s.id] || 1;
                              const priceNum = parseFloat(priceStr);
                              if (isNaN(priceNum)) {
                                addLog("Please enter a valid numeric Bid Price.", "warning");
                                return;
                              }
                              
                              const newBid: SpreadBid = {
                                id: `bid-${Date.now()}-${Math.random()}`,
                                price: priceNum,
                                qty: qtyVal,
                                type: 'LESS_THAN',
                                direction: 'BUY',
                                isArmed: true
                              };

                              setSpreads(prev => prev.map(item => {
                                if (item.id === s.id) {
                                  return {
                                    ...item,
                                    bids: [...(item.bids || []), newBid]
                                  };
                                }
                                return item;
                              }));

                              // Reset price input
                              setCardPriceInputs(prev => ({ ...prev, [s.id]: '' }));
                              addLog(`Placed BUY Bid: ${qtyVal} Lots @ ${priceNum.toFixed(2)}`, 'info');
                            }}
                            className="btn-cyber"
                            style={{
                              padding: '6px',
                              fontSize: '11px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              fontWeight: 700
                            }}
                          >
                            <Play size={10} /> Buy Bid
                          </button>

                          <button
                            onClick={() => {
                              const priceStr = cardPriceInputs[s.id] || '';
                              const qtyVal = cardQtyInputs[s.id] || 1;
                              const priceNum = parseFloat(priceStr);
                              if (isNaN(priceNum)) {
                                addLog("Please enter a valid numeric Bid Price.", "warning");
                                return;
                              }
                              
                              const newBid: SpreadBid = {
                                id: `bid-${Date.now()}-${Math.random()}`,
                                price: priceNum,
                                qty: qtyVal,
                                type: 'GREATER_THAN',
                                direction: 'SELL',
                                isArmed: true
                              };

                              setSpreads(prev => prev.map(item => {
                                if (item.id === s.id) {
                                  return {
                                    ...item,
                                    bids: [...(item.bids || []), newBid]
                                  };
                                }
                                return item;
                              }));

                              // Reset price input
                              setCardPriceInputs(prev => ({ ...prev, [s.id]: '' }));
                              addLog(`Placed SELL Bid: ${qtyVal} Lots @ ${priceNum.toFixed(2)}`, 'info');
                            }}
                            className="btn-cyber"
                            style={{
                              padding: '6px',
                              fontSize: '11px',
                              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                              fontWeight: 700
                            }}
                          >
                            <Play size={10} /> Sell Bid
                          </button>
                        </div>

                        {/* Render Active Bids List */}
                        {s.bids && s.bids.filter(b => b.isArmed).length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', maxHeight: '110px', overflowY: 'auto', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.3)', textTransform: 'uppercase', fontWeight: 600 }}>Active Bids:</span>
                            {s.bids.filter(b => b.isArmed).map((bid) => (
                              <div key={bid.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#fff', padding: '2px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>
                                  <span style={{ color: bid.direction === 'BUY' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{bid.direction}</span> {bid.qty} Lots @ {parseFloat(bid.price.toString()).toFixed(2)}
                                </span>
                                <button
                                  onClick={() => {
                                    disarmAlgoBid(s.id, bid.id);
                                    addLog(`Cancelled Bid: ${bid.direction} ${bid.qty} Lots @ ${parseFloat(bid.price.toString()).toFixed(2)}`, 'info');
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '10px', fontWeight: 600, padding: '2px 4px' }}
                                  title="Cancel Bid"
                                >
                                  Cancel
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <OrderBook
            orders={orders}
            positions={positions}
            onReset={handleResetPositions}
            ticks={ticks}
          />
        )}
      </main>

      {/* 4. Execution Logs & System Alerts Terminal Window */}
      {activeTab === 'dashboard' && (
        <div className="glass-panel" style={{ marginTop: '30px', padding: '16px', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(6, 182, 212, 0.8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', background: 'var(--primary)', borderRadius: '50%' }} className="pulse-glow" />
              Execution Logs & System Alerts
            </span>
            <button
              onClick={() => setSystemLogs([{ id: '1', time: new Date().toLocaleTimeString(), message: 'Console logs cleared.', type: 'info' }])}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '10px' }}
            >
              Clear Logs
            </button>
          </div>
          <div style={{
            height: '140px',
            overflowY: 'auto',
            background: 'rgba(3, 7, 18, 0.6)',
            borderRadius: '6px',
            padding: '10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: '1.6',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            {systemLogs.map((log) => {
              let color = 'rgba(255,255,255,0.6)';
              if (log.type === 'success') color = '#10b981';
              else if (log.type === 'error') color = '#f43f5e';
              else if (log.type === 'warning') color = '#f59e0b';
              else if (log.type === 'info') color = '#06b6d4';
              
              return (
                <div key={log.id} style={{ color }}>
                  <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '8px' }}>[{log.time}]</span>
                  {log.message}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Actions Square Off */}
      {positions.length > 0 && activeTab === 'dashboard' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            onClick={handleClosePositions}
            className="btn-cyber-outline"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.05)', padding: '10px 20px', fontSize: '13px', fontWeight: 600 }}
          >
            Square Off All Open Position Legs
          </button>
        </div>
      )}

      {/* Modal dialogs overlay */}
      {/* 1. Add Spread Modal */}
      {isAddModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(3,7,18,0.7)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '850px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <SpreadBuilder
              connectedBrokers={connectedBrokers}
              onSpreadConfigured={handleSpreadConfigured}
              onClose={() => {
                setIsAddModalOpen(false);
                setEditingSpread(null);
              }}
              initialSpread={editingSpread || undefined}
            />
          </div>
        </div>
      )}

      {/* 2. Broker Connection Modal */}
      {isLoginModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(3,7,18,0.7)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '900px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Landmark size={18} style={{ color: 'var(--primary)' }} /> Link Broker Terminals
              </h3>
              <button
                onClick={() => setIsLoginModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <BrokerLogin
              onLoginSuccess={() => fetchBrokerData()}
              connectedBrokers={connectedBrokers}
              onLogout={handleLogoutBroker}
            />
          </div>
        </div>
      )}

      {/* 3. Spread Chart Modal (floating drawer when chart button clicked) */}
      {activeChartSpread && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(3,7,18,0.7)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '750px', padding: '24px', position: 'relative' }}>
            <button
              onClick={() => setActiveChartSpread(null)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', zIndex: 10 }}
            >
              <X size={18} />
            </button>
            
            <ChartMonitor
              legA={activeChartSpread.legA}
              legB={activeChartSpread.legB}
              ticks={ticks}
              spreadValue={
                (ticks[activeChartSpread.legA.token]?.ltp || 0) -
                (ticks[activeChartSpread.legB.token]?.ltp || 0)
              }
            />
          </div>
        </div>
      )}

    </div>
  );
};
export default App;
