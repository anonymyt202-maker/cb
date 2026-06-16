import React, { useEffect, useState, useCallback } from 'react';
import { gamesApi } from 'utils/api';
import { useApp } from 'hooks/useApp';
import MediaPreview from 'components/common/MediaPreview';

function ItemSelectModal({ items, title, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">{title}</div>
        <input
          className="input-field"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 14 }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 30 }}>
              <div className="empty-state-emoji">🔍</div>
              <div className="empty-state-title">No items found</div>
            </div>
          ) : filtered.map(item => (
            <div
              key={item.id}
              onClick={() => { onSelect(item); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 14px',
                cursor: 'pointer', transition: 'all 0.15s ease',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: 36, flexShrink: 0 }}>
                {item.gift_emoji ? <MediaPreview source={item.gift_emoji} alt={item.name} style={{ width: 36, height: 36 }} fit="contain" fallback={<span>{item.gift_emoji}</span>} /> : item.image_url ? <MediaPreview source={item.image_url} alt={item.name} style={{ width: 36, height: 36 }} fit="contain" fallback={item.reward_type === 'nft' ? '🖼️' : '🎁'} /> : (item.reward_type === 'nft' ? '🖼️' : '🎁')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{item.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`rarity-badge ${item.rarity}`}>{item.rarity}</span>
                  <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>{parseFloat(item.value).toLocaleString()} ⭐</span>
                </div>
              </div>
              <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.2)' }}>›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UpgradeWheel({ chance, spinning, won }) {
  const rotation = spinning ? (won ? 720 + (chance / 100) * 360 * 0.5 : 720 + (chance / 100) * 360 + 10) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
      <div
        className="upgrade-wheel"
        style={{
          '--chance': chance,
          position: 'relative',
          width: 160,
          height: 160,
        }}
      >
        <div
          className="upgrade-wheel-inner"
          style={{
            transform: spinning ? `rotate(${rotation}deg)` : 'rotate(0deg)',
            transition: spinning ? 'transform 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `conic-gradient(
              #10b981 0deg ${chance * 3.6}deg,
              #ef4444 ${chance * 3.6}deg 360deg
            )`,
          }}
        />
        {/* Center hole */}
        <div style={{
          position: 'absolute', inset: 14, borderRadius: '50%',
          background: 'var(--bg-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 2,
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>{chance}%</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>CHANCE</div>
        </div>
        {/* Pointer */}
        <div style={{
          position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
          borderTop: '14px solid #f59e0b',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Win ({chance}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: '#ef4444' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Lose ({100 - chance}%)</span>
        </div>
      </div>
    </div>
  );
}

function ItemPanel({ label, item, placeholder, onClick }) {
  return (
    <div
      className={`upgrade-panel ${item ? 'selected' : ''}`}
      onClick={onClick}
      style={{ minHeight: 150 }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      {item ? (
        <>
          <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 6 }}>
            {item.gift_emoji ? <MediaPreview source={item.gift_emoji} alt={item.name} style={{ width: 44, height: 44 }} fit="contain" fallback={<span>{item.gift_emoji}</span>} /> : item.image_url ? <MediaPreview source={item.image_url} alt={item.name} style={{ width: 44, height: 44 }} fit="contain" fallback={item.reward_type === 'nft' ? '🖼️' : '🎁'} /> : (item.reward_type === 'nft' ? '🖼️' : '🎁')}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
          <span className={`rarity-badge ${item.rarity}`} style={{ fontSize: 9 }}>{item.rarity}</span>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', marginTop: 6 }}>{parseFloat(item.value).toLocaleString()} ⭐</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8, opacity: 0.3 }}>{placeholder}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Tap to select</div>
        </>
      )}
    </div>
  );
}

export default function GamesPage() {
  const { showToast } = useApp();
  const [ownedItems, setOwnedItems] = useState([]);
  const [upgradeTargets, setUpgradeTargets] = useState([]);
  const [sourceItem, setSourceItem] = useState(null);
  const [targetItem, setTargetItem] = useState(null);
  const [chance, setChance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await gamesApi.getUpgradeItems();
      setOwnedItems(data.owned_items || []);
      setUpgradeTargets(data.upgrade_targets || []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sourceItem && targetItem) {
      fetchChance();
    } else {
      setChance(null);
    }
  }, [sourceItem, targetItem]);

  const fetchChance = async () => {
    try {
      const data = await gamesApi.getUpgradeChance(sourceItem.id, targetItem.id);
      setChance(Math.round(data.chance));
    } catch (e) {
      setChance(null);
    }
  };

  const handleUpgrade = async () => {
    if (!sourceItem || !targetItem || chance === null || upgrading) return;
    setUpgrading(true);
    setSpinning(true);
    setResult(null);

    try {
      // Wait for spin animation
      await new Promise(r => setTimeout(r, 3200));
      const data = await gamesApi.performUpgrade({
        source_inventory_id: sourceItem.id,
        target_reward_id: targetItem.id,
      });

      setSpinning(false);
      setTimeout(() => {
        setResult(data);
        if (data.won) {
          showToast(`🎉 You won ${data.target_reward.name}!`, 'success', 5000);
        } else {
          showToast('😔 Better luck next time!', 'info');
        }
        // Reset for next upgrade
        setSourceItem(null);
        setTargetItem(null);
        setChance(null);
        loadItems();
      }, 400);
    } catch (e) {
      setSpinning(false);
      showToast(e.message, 'error');
    } finally {
      setUpgrading(false);
    }
  };

  // Filter available targets (must be more valuable than source)
  const validTargets = sourceItem
    ? upgradeTargets.filter(t => parseFloat(t.value) > parseFloat(sourceItem.value))
    : upgradeTargets;

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: 400 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="upgrade-container">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Game
        </div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Gift Upgrade</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          Sacrifice an item to win a more valuable one
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div style={{
          background: result.won ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${result.won ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 16, padding: '14px 18px', marginBottom: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>{result.won ? '🎉' : '😔'}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: result.won ? '#10b981' : '#ef4444' }}>
            {result.won ? `You won ${result.target_reward?.name}!` : 'Better luck next time!'}
          </div>
        </div>
      )}

      {/* Upgrade wheel */}
      {chance !== null && (
        <UpgradeWheel chance={chance} spinning={spinning} won={result?.won} />
      )}

      {/* Item panels */}
      <div className="upgrade-panels" style={{ marginBottom: 20 }}>
        <ItemPanel
          label="Your Item"
          item={sourceItem}
          placeholder="🎁"
          onClick={() => !upgrading && setShowSourceModal(true)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 28, color: chance !== null ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}>→</div>
          {chance !== null && (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
              {chance}%
            </div>
          )}
        </div>
        <ItemPanel
          label="Target"
          item={targetItem}
          placeholder="🏆"
          onClick={() => !upgrading && setShowTargetModal(true)}
        />
      </div>

      {/* Value info */}
      {sourceItem && targetItem && chance !== null && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: 14,
          padding: '12px 16px', marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 2 }}>YOUR VALUE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{parseFloat(sourceItem.value).toLocaleString()} ⭐</div>
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 2 }}>TARGET VALUE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{parseFloat(targetItem.value).toLocaleString()} ⭐</div>
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>|</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 2 }}>WIN CHANCE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: chance >= 50 ? '#10b981' : chance >= 25 ? '#f59e0b' : '#ef4444' }}>
              {chance}%
            </div>
          </div>
        </div>
      )}

      {/* Upgrade button */}
      <button
        className="btn btn-gold"
        onClick={handleUpgrade}
        disabled={!sourceItem || !targetItem || chance === null || upgrading}
        style={{ fontSize: 16 }}
      >
        {upgrading ? '🎲 Spinning...' : '⚡ Upgrade'}
      </button>

      {ownedItems.length === 0 && (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <div className="empty-state-emoji">🎒</div>
          <div className="empty-state-title">No items to upgrade</div>
          <div className="empty-state-text">Open cases to get gifts and NFTs you can upgrade!</div>
        </div>
      )}

      {/* Modals */}
      {showSourceModal && (
        <ItemSelectModal
          items={ownedItems}
          title="Select Your Item"
          onSelect={item => { setSourceItem(item); setTargetItem(null); }}
          onClose={() => setShowSourceModal(false)}
        />
      )}

      {showTargetModal && (
        <ItemSelectModal
          items={validTargets}
          title="Select Target"
          onSelect={setTargetItem}
          onClose={() => setShowTargetModal(false)}
        />
      )}
    </div>
  );
}
