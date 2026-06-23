import React, { useState, useEffect } from 'react';
import { depositsApi } from 'utils/api';
import { useApp } from 'hooks/useApp';

const STAR_PRESETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

export default function DepositPage({ onClose }) {
  const { showToast, refreshBalance } = useApp();
  const [method, setMethod] = useState('stars');
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [tonHash, setTonHash] = useState('');
  const [tonAmount, setTonAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [tonRate, setTonRate] = useState(100); // default: 1 TON = 100 Stars

  useEffect(() => {
    depositsApi.getHistory().then(d => setHistory(d.deposits || [])).catch(() => {});
    // TON rate ni backend dan olish
    fetch('/api/deposit/ton-rate')
      .then(r => r.json())
      .then(d => { if (d.rate) setTonRate(d.rate); })
      .catch(() => {});
  }, []);

  const handleStarsDeposit = async () => {
    const amount = selectedAmount || parseInt(customAmount);
    if (!amount || amount < 1) {
      showToast('Select or enter a valid amount', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await depositsApi.createStarsInvoice(amount);
      const invoiceUrl = result.invoice_url || result.link || result.url;

      const tg = window.Telegram?.WebApp;
      if (tg && invoiceUrl) {
        // WebApp orqali to'lov oynasini ochish
        if (typeof tg.openInvoice === 'function') {
          tg.openInvoice(invoiceUrl, (status) => {
            if (status === 'paid') {
              showToast('⭐ Payment successful! Balance updating...', 'success');
              setTimeout(() => refreshBalance(), 2000);
              onClose?.();
            } else if (status === 'cancelled') {
              showToast('Payment cancelled', 'info');
            } else if (status === 'failed') {
              showToast('Payment failed, try again', 'error');
            }
          });
        } else {
          window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (invoiceUrl) {
        window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
      } else {
        showToast('Invoice created! Opening...', 'success');
      }
    } catch (e) {
      showToast(e.message || 'Failed to create invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTonDeposit = async () => {
    if (!tonHash.trim() || !tonAmount || parseFloat(tonAmount) <= 0) {
      showToast('Enter transaction hash and TON amount', 'error');
      return;
    }
    setLoading(true);
    try {
      const result = await depositsApi.submitTon({ tx_hash: tonHash.trim(), ton_amount: parseFloat(tonAmount) });
      showToast(result.message || 'Deposit submitted!', 'success');
      setTonHash('');
      setTonAmount('');
      onClose?.();
    } catch (e) {
      showToast(e.message || 'Failed to create invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  const expectedStars = tonAmount ? Math.floor(parseFloat(tonAmount) * tonRate) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Top Up Balance</div>

        {/* Method tabs */}
        <div className="deposit-methods">
          <div
            className={`deposit-method-tab ${method === 'stars' ? 'active' : ''}`}
            onClick={() => setMethod('stars')}
          >
            ⭐ Stars
          </div>
          <div
            className={`deposit-method-tab ${method === 'ton' ? 'active' : ''}`}
            onClick={() => setMethod('ton')}
          >
            💎 TON
          </div>
        </div>

        {/* Stars method */}
        {method === 'stars' && (
          <>
            <div style={{ padding: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 4 }}>
              Pay directly with Telegram Stars. Balance credited instantly after payment.
            </div>
            <div className="stars-amounts">
              {STAR_PRESETS.map(amt => (
                <div
                  key={amt}
                  className={`stars-amount-btn ${selectedAmount === amt ? 'selected' : ''}`}
                  onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{amt >= 1000 ? `${amt / 1000}K` : amt}</div>
                  <div style={{ fontSize: 11, color: '#f59e0b' }}>⭐</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0 0 16px' }}>
              <div className="input-label">Or enter custom amount</div>
              <input
                className="input-field"
                type="number"
                min="1"
                placeholder="e.g. 750"
                value={customAmount}
                onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
              />
            </div>
            <button
              className="btn btn-gold"
              onClick={handleStarsDeposit}
              disabled={loading || (!selectedAmount && !customAmount)}
            >
              {loading ? 'Processing...' : `⭐ Pay ${(selectedAmount || parseInt(customAmount) || 0).toLocaleString()} Stars`}
            </button>
          </>
        )}

        {/* TON method */}
        {method === 'ton' && (
          <>
            {/* Rate info */}
            <div style={{
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 14,
              fontSize: 13, color: 'rgba(255,255,255,0.7)',
            }}>
              💱 <strong style={{ color: '#10b981' }}>1 TON = {tonRate.toLocaleString()} ⭐ Stars</strong>
            </div>

            <div style={{
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 14, padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#4f8ef7' }}>💎 TON Wallet Address</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {process.env.REACT_APP_TON_WALLET || 'UQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => {
                  navigator.clipboard.writeText(process.env.REACT_APP_TON_WALLET || '');
                  showToast('Wallet address copied!', 'success');
                }}
              >
                📋 Copy Address
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div className="input-label">TON Amount Sent</div>
              <input
                className="input-field"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 1.5"
                value={tonAmount}
                onChange={e => setTonAmount(e.target.value)}
              />
              {/* Expect stars preview */}
              {expectedStars > 0 && (
                <div style={{ marginTop: 6, fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                  ≈ {expectedStars.toLocaleString()} ⭐ Stars (after admin approval)
                </div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="input-label">Transaction Hash (TX ID)</div>
              <input
                className="input-field"
                placeholder="Paste your transaction hash..."
                value={tonHash}
                onChange={e => setTonHash(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16, lineHeight: 1.5 }}>
              ⚠️ Deposits are reviewed manually. Stars will be credited within 24 hours after admin approval.
            </div>
            <button
              className="btn btn-primary"
              onClick={handleTonDeposit}
              disabled={loading || !tonHash.trim() || !tonAmount}
            >
              {loading ? 'Submitting...' : '💎 Submit TON Deposit'}
            </button>
          </>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowHistory(!showHistory)}
            >
              📜 Deposit History
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{showHistory ? '▲' : '▼'}</span>
            </div>
            {showHistory && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 10).map(dep => (
                  <div key={dep.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px',
                    fontSize: 13,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {dep.method === 'stars' ? '⭐' : '💎'} {dep.method.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                        {new Date(dep.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: '#f59e0b' }}>+{parseFloat(dep.stars_credited).toLocaleString()} ⭐</div>
                      <div style={{
                        fontSize: 10, fontWeight: 700, marginTop: 2,
                        color: dep.status === 'completed' ? '#10b981' : dep.status === 'pending' ? '#f59e0b' : '#ef4444',
                        textTransform: 'uppercase',
                      }}>
                        {dep.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
