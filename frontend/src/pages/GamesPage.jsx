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
  // ── G'ildirak matematikasi ────────────────────────────────────────────────
  // Ko'rsatkich (pointer) tepada (0°) qo'zg'almas turadi, g'ildirakning o'zi
  // soat yo'nalishida `rotation` daraja aylanadi. Agar g'ildirak R daraja CW
  // aylansa, ko'rsatkich OSTIDA ko'rinib turgan ASL (aylanishdan oldingi)
  // burchak nuqtasi = (360 - R) mod 360 bo'ladi (chunki ko'rinish nuqtai
  // nazaridan bu R ga teskari yo'nalishda siljiydi).
  //
  // Yashil (win) zonasi: asl burchak [0, chance*3.6) gradus.
  // Qizil (lose) zonasi: asl burchak [chance*3.6, 360) gradus.
  //
  // Demak to'g'ri tushish nuqtasini tanlash uchun, avval "qaysi asl burchakka
  // tushishini" xohlaymiz (win bo'lsa yashil zona o'rtasi, lose bo'lsa qizil
  // zona o'rtasi), keyin R = (360 - target_angle) mod 360 dan kerakli
  // rotationni hisoblaymiz va unga bir necha to'liq aylanish (spin effekti
  // uchun) qo'shamiz.
  const greenZoneDeg = chance * 3.6;
  const redZoneDeg = 360 - greenZoneDeg;

  let targetAngle;
  if (won) {
    // Yashil zona o'rtasiga (lekin chegaradan biroz ichkariga, juda qisqa
    // bo'lsa ham ko'rsatkich aniq yashilda to'xtashi uchun)
    targetAngle = Math.min(greenZoneDeg / 2, Math.max(greenZoneDeg - 2, 1));
  } else {
    // Qizil zona o'rtasiga
    targetAngle = greenZoneDeg + Math.min(redZoneDeg / 2, Math.max(redZoneDeg - 2, 1));
  }

  const baseRotation = (360 - targetAngle + 360) % 360;
  const rotation = spinning ? 720 + baseRotation : 0;

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
  const [activeGame, setActiveGame] = useState('upgrade');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
        <button
          className={`game-tab-btn ${activeGame === 'upgrade' ? 'active' : ''}`}
          onClick={() => setActiveGame('upgrade')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 12, fontWeight: 800, fontSize: 13,
            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            background: activeGame === 'upgrade' ? 'linear-gradient(135deg,#f59e0b,#f97316)' : 'rgba(255,255,255,0.04)',
            color: activeGame === 'upgrade' ? '#0a0a0a' : 'rgba(255,255,255,0.6)',
          }}
        >
          ⬆️ Upgrade
        </button>
        <button
          className={`game-tab-btn ${activeGame === 'mines' ? 'active' : ''}`}
          onClick={() => setActiveGame('mines')}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 12, fontWeight: 800, fontSize: 13,
            border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            background: activeGame === 'mines' ? 'linear-gradient(135deg,#f59e0b,#f97316)' : 'rgba(255,255,255,0.04)',
            color: activeGame === 'mines' ? '#0a0a0a' : 'rgba(255,255,255,0.6)',
          }}
        >
          💣 Mines
        </button>
      </div>

      {activeGame === 'upgrade' ? <UpgradeGame /> : <MinesGame />}
    </div>
  );
}

function UpgradeGame() {
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
    setResult(null);

    try {
      // MUHIM TUZATISH: avval natija serverdan so'raladi, KEYIN shu aniq natijaga mos
      // animatsiya ishga tushiriladi. Avvalgi versiyada animatsiya natija kelishidan OLDIN
      // boshlanardi va g'ildirak "lose" holatiga (won=undefined) qarab aylanardi — shuning
      // uchun ba'zan yashil (win) sektorga tushsa ham "yutqazdi" animatsiyasi ko'rsatilardi.
      const data = await gamesApi.performUpgrade({
        source_inventory_id: sourceItem.id,
        target_reward_id: targetItem.id,
      });

      // Natija aniq bo'lgandan keyin animatsiyani boshlaymiz
      setResult(data);
      setSpinning(true);

      await new Promise(r => setTimeout(r, 3200));

      setSpinning(false);
      setTimeout(() => {
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

      {/* Result banner — faqat aylanish ANIMATSIYASI tugagandan keyin ko'rsatiladi,
          aks holda natija oldindan "spoiler" qilib ko'rsatilib qo'yardi */}
      {result && !spinning && (
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

// ============================================================================
//  MINES GAME
// ============================================================================
const MINES_GRID_SIZE = 25;
const MINES_COLS = 5;

function MinesCell({ index, state, onClick, disabled }) {
  // state: 'hidden' | 'safe' | 'mine' | 'mine-dim'
  const isRevealedSafe = state === 'safe';
  const isMine = state === 'mine';
  const isMineDim = state === 'mine-dim';

  return (
    <button
      onClick={() => onClick(index)}
      disabled={disabled || state !== 'hidden'}
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: isRevealedSafe
          ? 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(16,185,129,0.15))'
          : isMine
          ? 'linear-gradient(135deg, rgba(239,68,68,0.5), rgba(239,68,68,0.25))'
          : isMineDim
          ? 'rgba(239,68,68,0.12)'
          : 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, cursor: state === 'hidden' && !disabled ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        transform: isRevealedSafe || isMine ? 'scale(1)' : 'scale(1)',
        animation: isMine ? 'mineReveal 0.4s ease' : (isRevealedSafe ? 'safeReveal 0.3s ease' : 'none'),
      }}
    >
      {isRevealedSafe && '💎'}
      {(isMine || isMineDim) && '💣'}
    </button>
  );
}

function MinesGame() {
  const { showToast, refreshBalance } = useApp();
  const [betAmount, setBetAmount] = useState(10);
  const [minesCount, setMinesCount] = useState(3);
  const [game, setGame] = useState(null); // { id, mines_count, revealed: [], multiplier, potential_payout }
  const [revealedCells, setRevealedCells] = useState([]); // local visual state: array of indices
  const [minePositionsShown, setMinePositionsShown] = useState([]); // shown only after game over
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => { checkActiveGame(); }, []);

  const checkActiveGame = async () => {
    try {
      const data = await gamesApi.getActiveMines();
      if (data.game) {
        setGame(data.game);
        setRevealedCells(data.game.revealed || []);
        setGameOver(false);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleStart = async () => {
    if (starting || busy) return;
    setStarting(true);
    try {
      const data = await gamesApi.startMines({ bet_amount: betAmount, mines_count: minesCount });
      setGame({
        id: data.game_id,
        mines_count: minesCount,
        revealed: [],
        multiplier: 1,
        potential_payout: 0,
      });
      setRevealedCells([]);
      setMinePositionsShown([]);
      setGameOver(false);
      refreshBalance();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleReveal = async (index) => {
    if (!game || busy || gameOver || revealedCells.includes(index)) return;
    setBusy(true);
    try {
      const data = await gamesApi.revealMinesCell({ game_id: game.id, cell_index: index });
      if (data.result === 'mine') {
        setMinePositionsShown(data.mine_positions || [index]);
        setRevealedCells(prev => [...prev, index]);
        setGameOver(true);
        showToast('💥 Boom! You hit a mine.', 'error');
      } else {
        setRevealedCells(prev => [...prev, index]);
        setGame(prev => ({ ...prev, multiplier: data.multiplier, potential_payout: data.potential_payout }));
        if (data.all_cleared) {
          setGameOver(true);
          showToast(`🏆 Board cleared! +${data.payout} ⭐`, 'success', 5000);
          refreshBalance();
        }
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCashout = async () => {
    if (!game || busy || gameOver || revealedCells.length === 0) return;
    setBusy(true);
    try {
      const data = await gamesApi.cashoutMines(game.id);
      setMinePositionsShown(data.mine_positions || []);
      setGameOver(true);
      showToast(`✅ Cashed out: +${data.payout} ⭐ (x${data.multiplier})`, 'success', 5000);
      refreshBalance();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleNewGame = () => {
    setGame(null);
    setRevealedCells([]);
    setMinePositionsShown([]);
    setGameOver(false);
  };

  const getCellState = (index) => {
    if (minePositionsShown.includes(index)) return revealedCells.includes(index) ? 'mine' : 'mine-dim';
    if (revealedCells.includes(index)) return 'safe';
    return 'hidden';
  };

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <style>{`
        @keyframes mineReveal { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes safeReveal { 0% { transform: scale(0.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
          Game
        </div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>💣 Mines</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          Reveal safe cells to grow your multiplier. Cash out before you hit a mine!
        </div>
      </div>

      {!game && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>
              Bet Amount (⭐)
            </label>
            <input
              type="number" min="1" value={betAmount}
              onChange={e => setBetAmount(Math.max(1, parseInt(e.target.value || 1, 10)))}
              className="input-field" style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>
              Mines Count: {minesCount}
            </label>
            <input
              type="range" min="1" max="24" value={minesCount}
              onChange={e => setMinesCount(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              <span>1 (safer)</span><span>24 (riskier)</span>
            </div>
          </div>
        </div>
      )}

      {game && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '10px 16px' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>MULTIPLIER</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>x{(game.multiplier || 1).toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>POTENTIAL PAYOUT</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{(game.potential_payout || 0).toFixed(2)} ⭐</div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid', gridTemplateColumns: `repeat(${MINES_COLS}, 1fr)`, gap: 8,
          opacity: !game ? 0.35 : 1, pointerEvents: !game ? 'none' : 'auto', marginBottom: 18,
        }}
      >
        {Array.from({ length: MINES_GRID_SIZE }).map((_, i) => (
          <MinesCell key={i} index={i} state={getCellState(i)} onClick={handleReveal} disabled={busy || gameOver} />
        ))}
      </div>

      {!game ? (
        <button className="btn-primary" style={{ width: '100%', fontSize: 16 }} onClick={handleStart} disabled={starting}>
          {starting ? '🎲 Starting...' : `▶️ Start Game (${betAmount} ⭐)`}
        </button>
      ) : gameOver ? (
        <button className="btn-primary" style={{ width: '100%', fontSize: 16 }} onClick={handleNewGame}>
          🔄 New Game
        </button>
      ) : (
        <button
          className="btn-primary"
          style={{ width: '100%', fontSize: 16, background: revealedCells.length > 0 ? undefined : 'rgba(255,255,255,0.1)' }}
          onClick={handleCashout}
          disabled={busy || revealedCells.length === 0}
        >
          💰 Cash Out ({(game.potential_payout || 0).toFixed(2)} ⭐)
        </button>
      )}
    </div>
  );
}
