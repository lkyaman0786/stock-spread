import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Activity, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

interface ChartPoint {
  time: string;
  spread: number;
  legA: number;
  legB: number;
}

interface ChartMonitorProps {
  legA: any;
  legB: any;
  ticks: { [token: string]: any };
  spreadValue: number;
}

export const ChartMonitor: React.FC<ChartMonitorProps> = ({ legA, legB, ticks, spreadValue }) => {
  const [history, setHistory] = useState<ChartPoint[]>([]);

  // Collect history points when spread value updates
  useEffect(() => {
    const ltpA = ticks[legA.token]?.ltp || 0;
    const ltpB = ticks[legB.token]?.ltp || 0;
    
    if (ltpA === 0 || ltpB === 0) return;

    const newPoint: ChartPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      spread: parseFloat(spreadValue.toFixed(2)),
      legA: ltpA,
      legB: ltpB
    };

    setHistory(prev => {
      const next = [...prev, newPoint];
      if (next.length > 40) {
        next.shift(); // Limit to 40 data points
      }
      return next;
    });
  }, [spreadValue, ticks, legA.token, legB.token]);

  // Handle switching spreads/clearing history
  useEffect(() => {
    setHistory([]);
  }, [legA.token, legB.token]);

  const ltpA = ticks[legA.token]?.ltp || 0;
  const changePctA = ticks[legA.token]?.change_pct || 0;
  const ltpB = ticks[legB.token]?.ltp || 0;
  const changePctB = ticks[legB.token]?.change_pct || 0;

  // Compute stats
  const minSpread = history.length > 0 ? Math.min(...history.map(h => h.spread)) : 0;
  const maxSpread = history.length > 0 ? Math.max(...history.map(h => h.spread)) : 0;
  const avgSpread = history.length > 0 ? (history.reduce((acc, h) => acc + h.spread, 0) / history.length) : 0;

  const isSpreadPositive = spreadValue >= 0;

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} className="pulse-glow" style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.45)' }}>Live Spread monitor</span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginTop: '6px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            {spreadValue.toFixed(2)}
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-sans)' }}>
              ({legA.symbol} - {legB.symbol})
            </span>
          </h2>
        </div>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', padding: '8px 12px', textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>MIN SPREAD</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#fff' }}>{minSpread.toFixed(2)}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', padding: '8px 12px', textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>MAX SPREAD</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#fff' }}>{maxSpread.toFixed(2)}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '10px', padding: '8px 12px', textAlign: 'right' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>AVG SPREAD</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#fff' }}>{avgSpread.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Leg Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Leg A LTP */}
        <div style={{ background: 'rgba(255, 255, 255, 0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Leg A LTP ({legA.symbol})</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff', marginTop: '4px' }}>
              ₹{ltpA.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: changePctA >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '13px', fontWeight: 600 }}>
            {changePctA >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {changePctA.toFixed(2)}%
          </div>
        </div>

        {/* Leg B LTP */}
        <div style={{ background: 'rgba(255, 255, 255, 0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Leg B LTP ({legB.symbol})</div>
            <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fff', marginTop: '4px' }}>
              ₹{ltpB.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: changePctB >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '13px', fontWeight: 600 }}>
            {changePctB >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {changePctB.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div style={{ width: '100%', height: '240px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', padding: '10px 4px 4px 4px', border: '1px solid rgba(255,255,255,0.02)' }}>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="spreadGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                domain={['auto', 'auto']}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(11, 15, 25, 0.9)',
                  border: '1px solid var(--border-glass-active)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  fontSize: '12px'
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area 
                type="monotone" 
                dataKey="spread" 
                stroke="var(--primary)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#spreadGlow)" 
                activeDot={{ r: 5, fill: 'var(--primary)', stroke: '#fff', strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'rgba(255,255,255,0.35)' }}>
            <TrendingUp size={24} className="pulse-glow" />
            <span style={{ fontSize: '13px' }}>Awaiting market telemetry to construct chart...</span>
          </div>
        )}
      </div>

    </div>
  );
};
