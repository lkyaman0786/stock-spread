import React, { useState, useEffect } from 'react';
import { Play, Square, Settings, Volume2, VolumeX, ShieldAlert, Crosshair } from 'lucide-react';

interface SpreadControlProps {
  spreadValue: number;
  onExecuteTrade: (direction: 'BUY' | 'SELL', qty: number) => void;
  onClosePositions: () => void;
  hasOpenPosition: boolean;
}

export const SpreadControl: React.FC<SpreadControlProps> = ({
  spreadValue,
  onExecuteTrade,
  onClosePositions,
  hasOpenPosition
}) => {
  const [triggerType, setTriggerType] = useState<'GREATER_THAN' | 'LESS_THAN'>('GREATER_THAN');
  const [triggerValue, setTriggerValue] = useState<number>(0);
  const [targetValue, setTargetValue] = useState<number>(0);
  const [stopValue, setStopValue] = useState<number>(0);
  const [tradeQty, setTradeQty] = useState<number>(1);
  
  const [isAlgoActive, setIsAlgoActive] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Auto trigger check loop
  useEffect(() => {
    if (!isAlgoActive) return;

    // Check conditions
    let shouldTrigger = false;
    let tradeDirection: 'BUY' | 'SELL' = 'BUY';

    if (triggerType === 'GREATER_THAN' && spreadValue >= triggerValue) {
      shouldTrigger = true;
      tradeDirection = 'BUY'; // Buy Leg A, Sell Leg B
    } else if (triggerType === 'LESS_THAN' && spreadValue <= triggerValue) {
      shouldTrigger = true;
      tradeDirection = 'SELL'; // Sell Leg A, Buy Leg B
    }

    if (shouldTrigger) {
      // Execute
      onExecuteTrade(tradeDirection, tradeQty);
      setIsAlgoActive(false); // Stop algo after execution

      if (soundEnabled) {
        playTriggerSound();
      }
    }
  }, [spreadValue, isAlgoActive, triggerType, triggerValue, tradeQty, onExecuteTrade, soundEnabled]);

  // Audio generation helper (so no external audio files required, we use Web Audio API!)
  const playTriggerSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Sound 1: Alert Synth beep
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      
      osc.start();
      
      // High pitch double beep
      setTimeout(() => {
        osc.frequency.setValueAtTime(1320, audioCtx.currentTime); // E6
      }, 100);
      
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio Context failed: ", e);
    }
  };

  const handleManualTrade = (direction: 'BUY' | 'SELL') => {
    onExecuteTrade(direction, tradeQty);
    if (soundEnabled) {
      playTriggerSound();
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} /> Algorithmic Execution Panel
        </div>
      </h3>

      {/* Algo Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isAlgoActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isAlgoActive ? 'var(--success)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '10px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            className={isAlgoActive ? "pulse-glow" : ""}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isAlgoActive ? 'var(--success)' : 'rgba(255,255,255,0.2)',
              boxShadow: isAlgoActive ? '0 0 10px var(--success)' : 'none'
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 600, color: isAlgoActive ? 'var(--success)' : 'rgba(255,255,255,0.5)' }}>
            {isAlgoActive ? 'ALGO ENGINE: ARMED' : 'ALGO ENGINE: STANDBY'}
          </span>
        </div>
        
        {/* Mute toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {soundEnabled ? <Volume2 size={16} style={{ color: 'var(--primary)' }} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Inputs Configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Trigger Condition Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Trigger Condition</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as any)}
            className="input-cyber"
            style={{ width: '100%' }}
          >
            <option value="GREATER_THAN" style={{ background: '#0b0f19' }}>Spread &gt;=</option>
            <option value="LESS_THAN" style={{ background: '#0b0f19' }}>Spread &lt;=</option>
          </select>
        </div>

        {/* Trigger Value */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Trigger Price</label>
          <input
            type="number"
            step="0.05"
            value={triggerValue}
            onChange={(e) => setTriggerValue(parseFloat(e.target.value) || 0)}
            className="input-cyber"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {/* Quantity (Lots) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Quantity (Lots)</label>
          <input
            type="number"
            min="1"
            value={tradeQty}
            onChange={(e) => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="input-cyber"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {/* Info panel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(255, 255, 255, 0.015)', border: '1px solid rgba(255, 255, 255, 0.03)', borderRadius: '10px' }}>
          <Crosshair size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.2' }}>
            Engine locks executing both legs simultaneously.
          </span>
        </div>
      </div>

      {/* Algo Control Buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => setIsAlgoActive(!isAlgoActive)}
          className="btn-cyber"
          style={{
            flex: 1,
            padding: '12px',
            background: isAlgoActive ? 'linear-gradient(135deg, var(--danger) 0%, #be123c 100%)' : 'linear-gradient(135deg, var(--primary) 0%, #0891b2 100%)',
            boxShadow: isAlgoActive ? '0 0 15px rgba(244, 63, 94, 0.3)' : '0 0 15px rgba(6, 182, 212, 0.25)',
          }}
        >
          {isAlgoActive ? (
            <>
              <Square size={16} /> Disarm Engine
            </>
          ) : (
            <>
              <Play size={16} /> Arm Algo Engine
            </>
          )}
        </button>
      </div>

      {/* Manual Execution Actions */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Manual Execution Triage</span>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button
            onClick={() => handleManualTrade('BUY')}
            className="btn-cyber"
            style={{
              background: 'linear-gradient(135deg, var(--success) 0%, #047857 100%)',
              boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)',
              color: '#fff',
              padding: '12px'
            }}
          >
            Buy Spread
          </button>
          
          <button
            onClick={() => handleManualTrade('SELL')}
            className="btn-cyber"
            style={{
              background: 'linear-gradient(135deg, var(--danger) 0%, #be123c 100%)',
              boxShadow: '0 0 15px rgba(244, 63, 94, 0.2)',
              color: '#fff',
              padding: '12px'
            }}
          >
            Sell Spread
          </button>
        </div>

        {hasOpenPosition && (
          <button
            onClick={onClosePositions}
            className="btn-cyber-outline"
            style={{
              width: '100%',
              borderColor: 'var(--warning)',
              color: 'var(--warning)',
              padding: '12px',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.25)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <ShieldAlert size={16} /> Square Off All Open Legs
          </button>
        )}
      </div>
    </div>
  );
};
