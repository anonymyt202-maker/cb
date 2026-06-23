import React, { useEffect, useState } from 'react';
import { referralsApi } from 'utils/api';
import { useApp } from 'hooks/useApp';

export default function ReferralsPage() {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    referralsApi.getInfo()
      .then(d => setData(d))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const copyLink = async () => {
    if (!data?.referral_link) return;
    try {
      await navigator.clipboard.writeText(data.referral_link);
      setCopied(true);
      showToast('Referral link copied!', 'success');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const shareLink = () => {
    const tg = window.Telegram?.WebApp;
    if (tg && data?.referral_link) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(data.referral_link)}&text=${encodeURIComponent('🎁 Join TmuxCaseBot and open cases to win Telegram Gifts & NFTs!')}`);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: 300 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      {/* Hero */}
      <div style={{
        margin: '16px 16px 0',
        background: 'linear-gradient(135deg, rgba(79,142,247,0.15), rgba(124,58,237,0.15))',
        border: '1px solid rgba(79,142,247,0.25)',
        borderRadius: 20, padding: '20px 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>👥</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Invite Friends</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          Earn <span style={{ color: '#f59e0b', fontWeight: 800 }}>{data?.reward_per_referral} ⭐</span> for each friend you invite!
        </div>
      </div>

      {/* Stats */}
      <div className="referral-stats">
        <div className="stat-card">
          <div className="stat-value">{data?.referrals_count || 0}</div>
          <div className="stat-label">Total Referrals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{parseFloat(data?.total_earned || 0).toFixed(0)}</div>
          <div className="stat-label">Stars Earned ⭐</div>
        </div>
      </div>

      {/* Referral link */}
      <div className="referral-link-card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Your Referral Link
        </div>
        <div className="referral-link-input">{data?.referral_link}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={copyLink} style={{ flex: 1 }}>
            {copied ? '✅ Copied!' : '📋 Copy Link'}
          </button>
          <button className="btn btn-primary" onClick={shareLink} style={{ flex: 1 }}>
            📤 Share
          </button>
        </div>
      </div>

      {/* How it works */}
      <div style={{ margin: '0 16px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>How it works</div>
        {[
          { icon: '🔗', text: 'Share your unique referral link with friends' },
          { icon: '👤', text: 'Friend joins via your link and starts playing' },
          { icon: '⭐', text: `You instantly earn ${data?.reward_per_referral} Stars per referral` },
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>{step.icon}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{step.text}</div>
          </div>
        ))}
      </div>

      {/* Referral list */}
      {data?.referrals?.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Your Referrals ({data.referrals.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.referrals.map((ref, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                }}>
                  {(ref.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {ref.first_name}{ref.last_name ? ` ${ref.last_name}` : ''}
                    {ref.username && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>@{ref.username}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {new Date(ref.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                  +{data.reward_per_referral} ⭐
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
