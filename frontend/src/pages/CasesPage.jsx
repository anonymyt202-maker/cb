import React, { useEffect, useState, useCallback } from 'react';
import { casesApi } from 'utils/api';
import { useApp } from 'hooks/useApp';
import CaseOpenAnimation from 'components/cases/CaseOpenAnimation';

const CASE_TYPE_LABELS = {
  normal: null,
  roulette: 'Roulette',
  daily_free: 'Daily Free',
  referral: 'Referral',
};

function CaseCard({ caseData, onClick }) {
  const typeLabel = CASE_TYPE_LABELS[caseData.case_type];
  const isFree = caseData.case_type === 'daily_free';
  const isReferral = caseData.case_type === 'referral';

  return (
    <div className="case-card" onClick={() => onClick(caseData)}>
      {isFree && <div className="free-badge">FREE</div>}
      {isReferral && <div className="ref-badge">REFERRAL</div>}
      {typeLabel && !isFree && !isReferral && (
        <div className="case-type-badge">{typeLabel}</div>
      )}
      <div className="case-image-wrap">
        {caseData.image_url ? (
          <img src={caseData.image_url} alt={caseData.name} className="case-image" />
        ) : (
          <div className="case-image-placeholder">🎁</div>
        )}
      </div>
      <div className="case-info">
        <div className="case-name">{caseData.name}</div>
        <div className="case-price-badge">
          {isFree || isReferral ? (
            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 700 }}>FREE</span>
          ) : (
            <><span>{parseFloat(caseData.price).toLocaleString()}</span><span>⭐</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseDetailModal({ caseData, rewards, eligibility, onOpen, onClose, opening }) {
  const { balance } = useApp();
  const price = parseFloat(caseData.price);
  const canAfford = balance >= price;

  const canOpen = () => {
    if (caseData.case_type === 'daily_free' || caseData.case_type === 'referral') {
      return eligibility?.eligible;
    }
    return canAfford;
  };

  const getOpenButtonText = () => {
    if (opening) return 'Opening...';
    if (caseData.case_type === 'daily_free') {
      if (eligibility?.claimed_today) return '⏰ Come back tomorrow';
      if (!eligibility?.task_completed) return `Complete task to open`;
      return '🎁 Open Free Case';
    }
    if (caseData.case_type === 'referral') {
      if (eligibility?.claimed_today) return '⏰ Come back tomorrow';
      if (!eligibility?.eligible) return `Need ${eligibility?.required_referrals} referrals`;
      return '🎁 Open Referral Case';
    }
    if (!canAfford) return `Need ${price.toLocaleString()} ⭐`;
    return `Open for ${price.toLocaleString()} ⭐`;
  };

  const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortedRewards = [...(rewards || [])].sort((a, b) =>
    (rarityOrder[a.rarity] ?? 3) - (rarityOrder[b.rarity] ?? 3)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {caseData.image_url ? (
            <img src={caseData.image_url} alt={caseData.name}
              style={{ width: 100, height: 100, objectFit: 'contain', marginBottom: 10 }} />
          ) : (
            <div style={{ fontSize: 72, marginBottom: 10 }}>🎁</div>
          )}
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{caseData.name}</div>
          {caseData.description && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{caseData.description}</div>
          )}

          {/* Task info for free cases */}
          {caseData.case_type === 'daily_free' && eligibility && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              {eligibility.claimed_today ? (
                <span style={{ color: '#f59e0b' }}>⏰ Resets at midnight</span>
              ) : eligibility.task_type === 'channel_sub' ? (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>📢 Subscribe to {eligibility.task_value} to unlock</span>
              ) : eligibility.task_type === 'referrals' ? (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>👥 {eligibility.task_message}</span>
              ) : (
                <span style={{ color: '#10b981' }}>✅ Ready to open!</span>
              )}
            </div>
          )}

          {caseData.case_type === 'referral' && eligibility && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              {eligibility.claimed_today ? (
                <span style={{ color: '#f59e0b' }}>⏰ Resets at midnight</span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                  👥 {eligibility.current_referrals}/{eligibility.required_referrals} referrals
                </span>
              )}
            </div>
          )}

          {caseData.case_type === 'roulette' && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#f59e0b' }}>
              🎲 Win chance: {caseData.win_chance}%
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Possible Rewards
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedRewards.map(reward => (
              <div key={reward.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 14px',
                border: `1px solid ${rarityBorderColor(reward.rarity)}`,
              }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>
                  {reward.gift_emoji || (reward.reward_type === 'stars' ? '⭐' : '🖼️')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{reward.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                    <span className={`rarity-badge ${reward.rarity}`}>{reward.rarity}</span>
                    {reward.reward_type === 'stars' && (
                      <span style={{ fontSize: 12, color: '#f59e0b' }}>{reward.stars_amount} ⭐</span>
                    )}
                    {(reward.reward_type === 'gift' || reward.reward_type === 'nft') && (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{reward.value} ⭐ value</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                  {parseFloat(reward.chance).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          className={`btn ${canOpen() ? 'btn-primary' : 'btn-secondary'}`}
          onClick={canOpen() && !opening ? onOpen : undefined}
          disabled={!canOpen() || opening}
        >
          {getOpenButtonText()}
        </button>
      </div>
    </div>
  );
}

function rarityBorderColor(rarity) {
  const colors = { common: 'rgba(107,114,128,0.2)', rare: 'rgba(59,130,246,0.2)', epic: 'rgba(139,92,246,0.25)', legendary: 'rgba(245,158,11,0.3)' };
  return colors[rarity] || colors.common;
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

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const data = await casesApi.getAll();
      setCases(data.cases || []);
    } catch (e) {
      // Auth xatosini ko'rsatmaymiz — foydalanuvchi botdan kirishi kerak
      if (!e.message?.includes('auth') && !e.message?.includes('Auth') && !e.message?.includes('Missing') && !e.message?.includes('Invalid')) {
        showToast(e.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const openCaseDetail = useCallback(async (caseData) => {
    setSelectedCase(caseData);
    try {
      const data = await casesApi.getById(caseData.id);
      setSelectedRewards(data.rewards || []);
      if (caseData.case_type === 'daily_free' || caseData.case_type === 'referral') {
        const elig = await casesApi.getEligibility(caseData.id);
        setEligibility(elig);
      } else {
        setEligibility(null);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [showToast]);

  const handleOpen = useCallback(async () => {
    if (!selectedCase || opening) return;
    setOpening(true);
    try {
      const result = await casesApi.open(selectedCase.id);
      setSelectedCase(null);
      setAnimResult({ ...result, caseData: selectedCase });
      await refreshBalance();
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
    if (activeFilter === 'paid') return c.case_type === 'normal' || c.case_type === 'roulette';
    return true;
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading cases...</div>
      </div>
    );
  }

  return (
    <>
      <div className="filter-tabs">
        {[
          { id: 'all', label: 'All Cases' },
          { id: 'paid', label: '💰 Paid' },
          { id: 'free', label: '🆓 Daily Free' },
          { id: 'referral', label: '👥 Referral' },
        ].map(f => (
          <div
            key={f.id}
            className={`filter-tab ${activeFilter === f.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </div>
        ))}
      </div>

      {filteredCases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">📦</div>
          <div className="empty-state-title">No cases here</div>
          <div className="empty-state-text">Check back soon for new cases to open!</div>
        </div>
      ) : (
        <div className="cases-grid">
          {filteredCases.map(c => (
            <CaseCard key={c.id} caseData={c} onClick={openCaseDetail} />
          ))}
        </div>
      )}

      {selectedCase && (
        <CaseDetailModal
          caseData={selectedCase}
          rewards={selectedRewards}
          eligibility={eligibility}
          onOpen={handleOpen}
          onClose={() => { setSelectedCase(null); setOpening(false); }}
          opening={opening}
        />
      )}

      {animResult && (
        <CaseOpenAnimation
          caseData={animResult.caseData}
          result={animResult}
          onClose={handleAnimClose}
        />
      )}
    </>
  );
}
