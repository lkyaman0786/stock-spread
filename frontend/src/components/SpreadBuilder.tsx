import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRightLeft, Layers, Calendar, Plus, X } from 'lucide-react';

export interface LegConfig {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  exch_seg: string;
  instrumenttype: string;
  multiplier: number;
  direction: 'BUY' | 'SELL';
  brokerKey: string; // "BrokerName:ClientID"
}

export interface SpreadConfig {
  id: string;
  name: string;
  legA: LegConfig;
  legB: LegConfig;
  isAlgoArmed: boolean;
  triggerType: 'GREATER_THAN' | 'LESS_THAN';
  triggerValue: number;
  tradeQty: number;
}

interface SpreadBuilderProps {
  connectedBrokers: Array<{ broker: string; client_id: string }>;
  onSpreadConfigured: (name: string, legA: LegConfig, legB: LegConfig) => void;
  onClose: () => void;
  initialSpread?: SpreadConfig;
}

export const SpreadBuilder: React.FC<SpreadBuilderProps> = ({ connectedBrokers, onSpreadConfigured, onClose, initialSpread }) => {
  const [spreadName, setSpreadName] = useState('');

  // Leg A State
  const [searchA, setSearchA] = useState('');
  const [resultsA, setResultsA] = useState<any[]>([]);
  const [selectedA, setSelectedA] = useState<any | null>(null);
  const [multA, setMultA] = useState(1);
  const [dirA, setDirA] = useState<'BUY' | 'SELL'>('BUY');
  const [brokerA, setBrokerA] = useState('');

  // Leg B State
  const [searchB, setSearchB] = useState('');
  const [resultsB, setResultsB] = useState<any[]>([]);
  const [selectedB, setSelectedB] = useState<any | null>(null);
  const [multB, setMultB] = useState(1);
  const [dirB, setDirB] = useState<'BUY' | 'SELL'>('SELL');
  const [brokerB, setBrokerB] = useState('');

  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  useEffect(() => {
    if (initialSpread) {
      setSpreadName(initialSpread.name);
      
      setSelectedA(initialSpread.legA);
      setSearchA(initialSpread.legA.symbol);
      setMultA(initialSpread.legA.multiplier);
      setDirA(initialSpread.legA.direction);
      setBrokerA(initialSpread.legA.brokerKey);

      setSelectedB(initialSpread.legB);
      setSearchB(initialSpread.legB.symbol);
      setMultB(initialSpread.legB.multiplier);
      setDirB(initialSpread.legB.direction);
      setBrokerB(initialSpread.legB.brokerKey);
    }
  }, [initialSpread]);

  const [showDropdownA, setShowDropdownA] = useState(false);
  const [showDropdownB, setShowDropdownB] = useState(false);

  const containerRefA = useRef<HTMLDivElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);

  // Set default brokers
  useEffect(() => {
    if (connectedBrokers.length > 0) {
      const defaultBrokerKey = `${connectedBrokers[0].broker}:${connectedBrokers[0].client_id}`;
      if (!brokerA) setBrokerA(defaultBrokerKey);
      if (!brokerB) setBrokerB(defaultBrokerKey);
    }
  }, [connectedBrokers]);

  // Handle auto-generating Spread Name
  useEffect(() => {
    if (selectedA && selectedB) {
      setSpreadName(`${selectedA.symbol} / ${selectedB.symbol} SPREAD`);
    }
  }, [selectedA, selectedB]);

  // Click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRefA.current && !containerRefA.current.contains(event.target as Node)) {
        setShowDropdownA(false);
      }
      if (containerRefB.current && !containerRefB.current.contains(event.target as Node)) {
        setShowDropdownB(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search handler Leg A
  useEffect(() => {
    if (searchA.length < 2) {
      setResultsA([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoadingA(true);
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/search?q=${encodeURIComponent(searchA)}`);
        const data = await res.json();
        setResultsA(data.results || []);
        setShowDropdownA(true);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingA(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchA]);

  // Search handler Leg B
  useEffect(() => {
    if (searchB.length < 2) {
      setResultsB([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoadingB(true);
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/search?q=${encodeURIComponent(searchB)}`);
        const data = await res.json();
        setResultsB(data.results || []);
        setShowDropdownB(true);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingB(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchB]);

  const handleAddSpread = () => {
    if (!selectedA || !selectedB) return;

    const legAConfig: LegConfig = {
      token: selectedA.token,
      symbol: selectedA.symbol,
      name: selectedA.name,
      expiry: selectedA.expiry || '',
      strike: selectedA.strike || '',
      lotsize: selectedA.lotsize || '1',
      exch_seg: selectedA.exch_seg,
      instrumenttype: selectedA.instrumenttype || '',
      multiplier: multA,
      direction: dirA,
      brokerKey: brokerA || 'SIMULATOR:GUEST',
    };

    const legBConfig: LegConfig = {
      token: selectedB.token,
      symbol: selectedB.symbol,
      name: selectedB.name,
      expiry: selectedB.expiry || '',
      strike: selectedB.strike || '',
      lotsize: selectedB.lotsize || '1',
      exch_seg: selectedB.exch_seg,
      instrumenttype: selectedB.instrumenttype || '',
      multiplier: multB,
      direction: dirB,
      brokerKey: brokerB || 'SIMULATOR:GUEST',
    };

    const finalName = spreadName.trim() || `${selectedA.symbol} - ${selectedB.symbol} SPREAD`;
    onSpreadConfigured(finalName, legAConfig, legBConfig);
  };

  const renderScripResultItem = (scrip: any, onClick: () => void) => {
    const isOption = scrip.instrumenttype?.includes('OPT');
    const isFuture = scrip.instrumenttype?.includes('FUT');
    const color = isOption ? '#ec4899' : isFuture ? '#8b5cf6' : '#10b981';

    return (
      <div
        onClick={onClick}
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: '#fff', fontSize: '13px' }}>{scrip.symbol}</span>
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: color + '1e',
                color: color,
                border: `1px solid ${color}40`,
                fontWeight: 600,
              }}
            >
              {scrip.exch_seg}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{scrip.name}</span>
        </div>
        
        {scrip.expiry && (
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={12} /> {scrip.expiry}
          </span>
        )}
      </div>
    );
  };

  const renderLegSelection = (
    label: string,
    search: string,
    setSearch: (s: string) => void,
    results: any[],
    selected: any | null,
    setSelected: (s: any | null) => void,
    loading: boolean,
    showDropdown: boolean,
    setShowDropdown: (b: boolean) => void,
    containerRef: React.RefObject<HTMLDivElement | null>,
    mult: number,
    setMult: (n: number) => void,
    dir: 'BUY' | 'SELL',
    setDir: (d: 'BUY' | 'SELL') => void,
    broker: string,
    setBroker: (b: string) => void
  ) => {
    const lotVal = parseInt(selected?.lotsize || '1');
    const totalQty = mult * lotVal;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', padding: '16px', borderRadius: '12px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '6px' }}>
          {label}
        </h4>

        {/* Autocomplete Input */}
        <div ref={containerRef} style={{ position: 'relative' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'rgba(255,255,255,0.4)' }} />
            <input
              type="text"
              value={selected ? selected.symbol : search}
              onChange={(e) => {
                if (selected) {
                  setSelected(null);
                  setSearch('');
                } else {
                  setSearch(e.target.value);
                }
              }}
              placeholder="Type symbol (e.g. NIFTY, SENSEX, PAYTM)..."
              className="input-cyber"
              style={{ width: '100%', paddingLeft: '32px', fontSize: '13px', padding: '8px 32px' }}
            />
          </div>

          {showDropdown && results.length > 0 && !selected && (
            <div
              style={{
                position: 'absolute',
                top: '40px',
                left: 0,
                right: 0,
                background: 'rgba(11, 15, 25, 0.98)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                zIndex: 100,
                maxHeight: '200px',
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {results.map((scrip) =>
                renderScripResultItem(scrip, () => {
                  setSelected(scrip);
                  setSearch(scrip.symbol);
                  setShowDropdown(false);
                })
              )}
            </div>
          )}

          {loading && (
            <span style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '10px', color: 'var(--primary)' }} className="pulse-glow">
              Searching...
            </span>
          )}
        </div>

        {/* Leg parameter config */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
          {/* Multiplier / Lot Size adjust */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Lots Multiplier</label>
            <input
              type="number"
              min="1"
              value={mult}
              onChange={(e) => setMult(Math.max(1, parseInt(e.target.value) || 1))}
              className="input-cyber"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            />
          </div>

          {/* Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Direction</label>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as 'BUY' | 'SELL')}
              className="input-cyber"
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                background: dir === 'BUY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                borderColor: dir === 'BUY' ? 'var(--success)' : 'var(--danger)',
                color: '#fff'
              }}
            >
              <option value="BUY" style={{ background: '#0b0f19' }}>BUY</option>
              <option value="SELL" style={{ background: '#0b0f19' }}>SELL</option>
            </select>
          </div>
        </div>

        {/* Cross-Broker Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Execution Account</label>
          <select
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            className="input-cyber"
            style={{ padding: '6px 10px', fontSize: '12px' }}
            disabled={connectedBrokers.length === 0}
          >
            {connectedBrokers.length === 0 ? (
              <option value="">Simulation Mode (Paper Trading)</option>
            ) : (
              connectedBrokers.map((b, idx) => {
                const key = `${b.broker}:${b.client_id}`;
                return (
                  <option key={idx} value={key} style={{ background: '#0b0f19' }}>
                    {b.broker} - {b.client_id}
                  </option>
                );
              })
            )}
          </select>
        </div>

        {/* Lot Size detail calculation */}
        {selected && (
          <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Lot Size: </span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{lotVal}</span>
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Total Units: </span>
              <span style={{ color: 'var(--primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{totalQty}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Modal Title Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: 'var(--primary)' }} /> Configure Multi-Leg Spread
        </h3>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Custom Spread Name Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Custom Spread Name</label>
        <input
          type="text"
          value={spreadName}
          onChange={(e) => setSpreadName(e.target.value)}
          placeholder="Enter a descriptive label..."
          className="input-cyber"
          style={{ width: '100%', padding: '8px 12px' }}
        />
      </div>

      {/* Two Legs Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {renderLegSelection(
          'LEG A (Base Leg)',
          searchA,
          setSearchA,
          resultsA,
          selectedA,
          setSelectedA,
          loadingA,
          showDropdownA,
          setShowDropdownA,
          containerRefA,
          multA,
          setMultA,
          dirA,
          setDirA,
          brokerA,
          setBrokerA
        )}

        {renderLegSelection(
          'LEG B (Offset Leg)',
          searchB,
          setSearchB,
          resultsB,
          selectedB,
          setSelectedB,
          loadingB,
          showDropdownB,
          setShowDropdownB,
          containerRefB,
          multB,
          setMultB,
          dirB,
          setDirB,
          brokerB,
          setBrokerB
        )}
      </div>

      {/* Action triggers */}
      <button
        onClick={handleAddSpread}
        disabled={!selectedA || !selectedB}
        className="btn-cyber"
        style={{
          padding: '12px',
          width: '100%',
          opacity: selectedA && selectedB ? 1 : 0.4,
          cursor: selectedA && selectedB ? 'pointer' : 'not-allowed',
          fontSize: '14px',
          marginTop: '8px'
        }}
      >
        <Plus size={16} /> Deploy Spread Card to Dashboard
      </button>
    </div>
  );
};
export default SpreadBuilder;
