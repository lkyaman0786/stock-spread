import React, { useState } from 'react';
import { ListFilter, RefreshCw, Layers, TrendingUp, TrendingDown, ClipboardList } from 'lucide-react';

interface OrderBookProps {
  orders: any[];
  positions: any[];
  onReset: () => void;
  ticks: { [token: string]: any };
}

export const OrderBook: React.FC<OrderBookProps> = ({ orders, positions, onReset, ticks }) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders'>('positions');

  // Helper to compute PnL for active positions
  const getPositionPnL = (pos: any) => {
    const ltp = ticks[pos.token]?.ltp || 0;
    if (ltp === 0 || pos.qty === 0) return pos.realized_pnl || 0;
    
    // Unrealized = (LTP - AvgPrice) * Qty
    // Adjust if Short position (Qty < 0)
    const unrealized = (ltp - pos.avg_price) * pos.qty;
    return (pos.realized_pnl || 0) + unrealized;
  };

  const totalPnL = positions.reduce((acc, pos) => acc + getPositionPnL(pos), 0);

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', minHeight: '360px' }}>
      
      {/* Header with selector tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('positions')}
            className={activeTab === 'positions' ? 'btn-cyber' : 'btn-cyber-outline'}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
          >
            <Layers size={14} /> Active Positions
          </button>
          
          <button
            onClick={() => setActiveTab('orders')}
            className={activeTab === 'orders' ? 'btn-cyber' : 'btn-cyber-outline'}
            style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
          >
            <ClipboardList size={14} /> Order History ({orders.length})
          </button>
        </div>

        {/* Global PnL and Reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {positions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Total PnL:</span>
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: totalPnL >= 0 ? 'var(--success)' : 'var(--danger)',
                  textShadow: totalPnL >= 0 ? '0 0 8px var(--success-glow)' : '0 0 8px var(--danger-glow)',
                }}
              >
                ₹{totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <button
            onClick={onReset}
            className="btn-cyber-outline"
            style={{ padding: '6px', borderRadius: '6px', borderColor: 'rgba(255,255,255,0.08)' }}
            title="Reset Positions and Logs"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '350px' }}>
        {activeTab === 'positions' ? (
          /* Positions Table */
          positions.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifycontent: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: '8px' }}>
              <Layers size={24} />
              <span style={{ fontSize: '13px' }}>No active stock spread positions</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '10px 8px' }}>Broker/Client</th>
                  <th style={{ padding: '10px 8px' }}>Symbol</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Avg Price</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>LTP</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>PnL (M2M)</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, idx) => {
                  const pnl = getPositionPnL(pos);
                  const ltp = ticks[pos.token]?.ltp || 0;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', hover: { background: 'rgba(255,255,255,0.01)' } }}>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{pos.broker}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{pos.client_id}</div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{pos.symbol}</span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: pos.qty >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {pos.qty > 0 ? `+${pos.qty}` : pos.qty}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        ₹{pos.avg_price.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                        ₹{ltp > 0 ? ltp.toFixed(2) : '...'}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        ₹{pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          /* Order History Table */
          orders.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifycontent: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: '8px' }}>
              <ClipboardList size={24} />
              <span style={{ fontSize: '13px' }}>Order book is empty</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '10px 8px' }}>Timestamp</th>
                  <th style={{ padding: '10px 8px' }}>Broker Details</th>
                  <th style={{ padding: '10px 8px' }}>Symbol</th>
                  <th style={{ padding: '10px 8px' }}>Action</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 8px', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                      {ord.timestamp.split(' ')[1] || ord.timestamp}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{ord.broker}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{ord.client_id}</div>
                    </td>
                    <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)' }}>
                      {ord.symbol}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background: ord.transaction_type === 'BUY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                          color: ord.transaction_type === 'BUY' ? 'var(--success)' : 'var(--danger)',
                          border: `1px solid ${ord.transaction_type === 'BUY' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`
                        }}
                      >
                        {ord.transaction_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {ord.qty}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      ₹{ord.exec_price.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>{ord.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};
