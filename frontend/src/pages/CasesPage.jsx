import React, { useEffect, useState, useCallback, useRef } from 'react';
import { casesApi } from 'utils/api';
import { useApp } from 'hooks/useApp';
import CaseOpenAnimation from 'components/cases/CaseOpenAnimation';
import MediaPreview from 'components/common/MediaPreview';

const CASE_TYPE_LABELS = { normal: null, roulette: 'Roulette', daily_free: 'Daily Free', referral: 'Referral', promo: 'PROMO' };

function rarityBorderColor(rarity) {
  const c = { common: 'rgba(107,114,128,0.2)', rare: 'rgba(59,130,246,0.2)', epic: 'rgba(139,92,246,0.25)', legendary: 'rgba(245,158,11,0.3)' };
  return c[rarity] || c.common;
}

function CaseCard({ caseData, onClick }) {
  const typeLabel = CASE_TYPE_LABELS[caseData.case_type];
  const isFree = caseData.case_type === 'daily_free';
  const isReferral = caseData.case_type === 'referral';
  const isPromo = caseData.case_type === 'promo';
  return (
    <div className="case-card" onClick={() => onClick(caseData)}>
      {isFree && <div className="free-badge">FREE</div>}
      {isReferral && <div className="ref-badge">REFERRAL</div>}
      {isPromo && <div className="case-type-badge" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff' }}>PROMO</div>}
      {typeLabel && !isFree && !isReferral && !isPromo && <div className="case-type-badge">{typeLabel}</div>}
      <div className="case-image-wrap">
        {caseData.image_url
          ? <MediaPreview source={caseData.image_url} alt={caseData.name} className="case-image" fit="contain" fallback={<div className="case-image-placeholder">🎁</div>} />
          : <div className="case-image-placeholder">🎁</div>}
      </div>
      <div className="case-info">
        <div className="case-name">{caseData.name}</div>
        <div className="case-price-badge">
          {isFree || isReferral ? (
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 700 }}>FREE</span>
          ) : isPromo ? (
            <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>🎟 PROMO</span>
          ) : (
            <><span>{parseFloat(caseData.price).toLocaleString()}</span><span>⭐</span></>
          )}
        </div>
      </div>
    </div>
  );
}

// Promo code modal
function PromoModal({ onClose, onOpen, onAnimResult }) {
  const { showToast } = useApp();
  const [code, setCode] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleValidate = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const data = await casesApi.validatePromo(code.trim());
      setInfo(data);
    } catch (e) {
      showToast(e.message, 'error');
      setInfo(null);
    } finally { setLoading(false); }
  };

  const handleOpen = async () => {
    setOpening(true);
    try {
      const result = await casesApi.openPromo(code.trim());
      onClose();
      onAnimResult({ ...result, caseData: { name: result.case_name || 'Promo Case' } });
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setOpening(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎟</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Promo Kod</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Admindan olingan kodni kiriting</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="input-field" placeholder="PROMO KOD"
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}
            onKeyDown={e => e.key === 'Enter' && handleValidate()}
          />
          <button className="btn btn-secondary" onClick={handleValidate} disabled={loading || !code.trim()}>
            {loading ? '...' : '✓'}
          </button>
        </div>
        {info && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ {info.case_name}</div>
            {info.stars_required > 0 && <div style={{ fontSize: 13, color: '#f59e0b' }}>💫 {info.stars_required} ⭐ to'lov kerak</div>}
            {info.uses_left !== null && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Qolgan: {info.uses_left} marta</div>}
            {info.claimed_today && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>⏰ Bugun allaqachon ochildi. GMT+5 00:00 da reset.</div>}
          </div>
        )}
        <button
          className="btn btn-primary"
          onClick={handleOpen}
          disabled={!info || info.claimed_today || opening}
          style={{ width: '100%' }}
        >
          {opening ? 'Ochilmoqda...' : info?.claimed_today ? '⏰ Ertaga qayta' : '🎟 Ochish'}
        </button>
      </div>
    </div>
  );
}

function CaseDetailModal({ caseData, rewards, eligibility, onOpen, onOpenDemo, onClose, opening }) {
  const { balance } = useApp();
  const price = parseFloat(caseData.price);
  const canAfford = balance >= price;

  const canOpen = () => {
    if (caseData.case_type === 'daily_free' || caseData.case_type === 'referral') return eligibility?.eligible;
    return canAfford;
  };

  const getOpenButtonText = () => {
    if (opening) return 'Opening...';
    if (caseData.case_type === 'daily_free') {
      if (eligibility?.claimed_today) return '⏰ Ertaga qayta (GMT+5 00:00)';
      if (!eligibility?.task_completed) return 'Vazifani bajaring';
      return '🎁 Bepul ochish';
    }
    if (caseData.case_type === 'referral') {
      if (eligibility?.claimed_today) return '⏰ Ertaga qayta (GMT+5 00:00)';
      if (!eligibility?.eligible) return `${eligibility?.required_referrals} referal kerak`;
      return '🎁 Referal caseni ochish';
    }
    if (!canAfford) return `${price.toLocaleString()} ⭐ kerak`;
    return `${price.toLocaleString()} ⭐ ga ochish`;
  };

  const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortedRewards = [...(rewards || [])].sort((a, b) => (rarityOrder[a.rarity] ?? 3) - (rarityOrder[b.rarity] ?? 3));

  const canDemo = caseData.case_type === 'normal' || caseData.case_type === 'roulette';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {caseData.image_url
            ? <MediaPreview source={caseData.image_url} alt={caseData.name} style={{ width: 100, height: 100, marginBottom: 10 }} fit="contain" fallback={<div style={{ fontSize: 72, marginBottom: 10 }}>🎁</div>} />
            : <div style={{ fontSize: 72, marginBottom: 10 }}>🎁</div>}
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{caseData.name}</div>
          {caseData.description && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{caseData.description}</div>}

          {caseData.case_type === 'daily_free' && eligibility && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              {eligibility.claimed_today ? (
                <span style={{ color: '#f59e0b' }}>⏰ GMT+5 00:00 da yangilanadi</span>
              ) : eligibility.task_type === 'channel_sub' ? (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>📢 {eligibility.task_value} ga obuna bo'ling</span>
              ) : eligibility.task_type === 'referrals' ? (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>👥 {eligibility.task_message}</span>
              ) : (
                <span style={{ color: '#10b981' }}>✅ Ochishga tayyor!</span>
              )}
            </div>
          )}

          {caseData.case_type === 'referral' && eligibility && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              {eligibility.claimed_today ? (
                <span style={{ color: '#f59e0b' }}>⏰ GMT+5 00:00 da yangilanadi</span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>👥 {eligibility.current_referrals}/{eligibility.required_referrals} referal</span>
              )}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Mumkin bo'lgan mukofotlar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedRewards.map(reward => (
              <div key={reward.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px',
                border: `1px solid ${rarityBorderColor(reward.rarity)}`,
              }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>
                  {reward.gift_emoji
                    ? <MediaPreview source={reward.gift_emoji} alt={reward.name} style={{ width: 28, height: 28 }} fit="contain" fallback={<span>{reward.gift_emoji}</span>} />
                    : reward.image_url
                      ? <MediaPreview source={reward.image_url} alt={reward.name} style={{ width: 28, height: 28 }} fit="contain" fallback={reward.reward_type === 'stars' ? '⭐' : '🖼️'} />
                      : (reward.reward_type === 'stars' ? '⭐' : '🖼️')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{reward.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                    <span className={`rarity-badge ${reward.rarity}`}>{reward.rarity}</span>
                    {reward.reward_type === 'stars' && <span style={{ fontSize: 12, color: '#f59e0b' }}>{reward.stars_amount} ⭐</span>}
                    {(reward.reward_type === 'gift' || reward.reward_type === 'nft') && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{reward.value} ⭐</span>}
                  </div>
                </div>
                {/* NO CHANCE SHOWN */}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${canOpen() ? 'btn-primary' : 'btn-secondary'}`}
            onClick={canOpen() && !opening ? onOpen : undefined}
            disabled={!canOpen() || opening}
            style={{ flex: 1 }}
          >
            {getOpenButtonText()}
          </button>
          {canDemo && (
            <button
              className="btn btn-secondary"
              onClick={!opening ? onOpenDemo : undefined}
              disabled={opening}
              style={{ fontSize: 12, padding: '0 14px' }}
              title="Demo - priz inventoryga qo'shilmaydi"
            >
              🎮 Demo
            </button>
          )}
        </div>
        {canDemo && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 6 }}>
            Demo rejimda priz inventoryga qo'shilmaydi va ko'proq baxt ishlaydi
          </div>
        )}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const { showToast, refreshBalance } = useApp();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedRewards, setSelectedRewards] = useState([]);
  const [eligibility, setEligibility] = useState(null);
  const [opening, setOpening] = useState(false);
  const [animResult, setAnimResult] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showPromoModal, setShowPromoModal] = useState(false);

  useEffect(() => { loadCases(); }, []);

  const loadCases = async () => {
    try {
      const data = await casesApi.getAll();
      setCases(data.cases || []);
    } catch (e) {
      if (!e.message?.includes('auth') && !e.message?.includes('Auth') && !e.message?.includes('Missing') && !e.message?.includes('Invalid')) {
        showToast(e.message, 'error');
      }
    } finally { setLoading(false); }
  };

  const openCaseDetail = useCallback(async (caseData) => {
    setSelectedCase(caseData);
    try {
      const data = await casesApi.getById(caseData.id);
      setSelectedRewards(data.rewards || []);
      if (caseData.case_type === 'daily_free' || caseData.case_type === 'referral') {
        const elig = await casesApi.getEligibility(caseData.id);
        setEligibility(elig);
      } else { setEligibility(null); }
    } catch (e) { showToast(e.message, 'error'); }
  }, [showToast]);

  const handleOpen = useCallback(async (demo = false) => {
    if (!selectedCase || opening) return;
    setOpening(true);
    try {
      const result = await casesApi.open(selectedCase.id, demo);
      setSelectedCase(null);
      setAnimResult({ ...result, demo, caseData: selectedCase });
      if (!demo) await refreshBalance();
    } catch (e) {
      showToast(e.message, 'error');
      setOpening(false);
    }
  }, [selectedCase, opening, refreshBalance, showToast]);

  const handleAnimClose = useCallback(() => {
    setAnimResult(null);
    setOpening(false);
    loadCases();
  }, []);

  const filteredCases = cases.filter(c => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'free') return c.case_type === 'daily_free';
    if (activeFilter === 'referral') return c.case_type === 'referral';
    if (activeFilter === 'promo') return c.case_type === 'promo';
    if (activeFilter === 'paid') return c.case_type === 'normal' || c.case_type === 'roulette';
    return true;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Yuklanmoqda...</div>
    </div>
  );

  return (
    <>
      {/* Promo button */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={() => setShowPromoModal(true)}
          style={{ flex: 1, gap: 8, fontWeight: 700 }}
        >
          🎟 Promo Kod Kiritish
        </button>
      </div>

      <div className="filter-tabs">
        {[
          { id: 'all', label: 'Barchasi' },
          { id: 'paid', label: '💰 Pullik' },
          { id: 'free', label: '🆓 Bepul' },
          { id: 'referral', label: '👥 Referal' },
          { id: 'promo', label: '🎟 Promo' },
        ].map(f => (
          <div key={f.id} className={`filter-tab ${activeFilter === f.id ? 'active' : ''}`} onClick={() => setActiveFilter(f.id)}>
            {f.label}
          </div>
        ))}
      </div>

      {filteredCases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">📦</div>
          <div className="empty-state-title">Case yo'q</div>
          <div className="empty-state-text">Tez orada yangi caseler qo'shiladi!</div>
        </div>
      ) : (
        <div className="cases-grid">
          {filteredCases.map(c => <CaseCard key={c.id} caseData={c} onClick={openCaseDetail} />)}
        </div>
      )}

      {selectedCase && (
        <CaseDetailModal
          caseData={selectedCase}
          rewards={selectedRewards}
          eligibility={eligibility}
          onOpen={() => handleOpen(false)}
          onOpenDemo={() => handleOpen(true)}
          onClose={() => { setSelectedCase(null); setOpening(false); }}
          opening={opening}
        />
      )}

      {showPromoModal && (
        <PromoModal
          onClose={() => setShowPromoModal(false)}
          onAnimResult={(result) => { setAnimResult(result); refreshBalance(); }}
        />
      )}

      {animResult && (
        <CaseOpenAnimation
          caseData={animResult.caseData}
          result={animResult}
          demo={animResult.demo}
          onClose={handleAnimClose}
        />
      )}
    </>
  );
}
