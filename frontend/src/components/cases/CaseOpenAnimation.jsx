import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import MediaPreview from 'components/common/MediaPreview';

const RARITY_COLORS = {
  common: '#6b7280',
  rare: '#3b82f6',
  epic: '#8b5cf6',
  legendary: '#f59e0b',
};

function RewardDisplay({ reward, size = 'normal' }) {
  const isLarge = size === 'large';
  const fontSize = isLarge ? '80px' : '44px';
  const imgSize = isLarge ? '110px' : '70px';
  if (reward.reward_type === 'gift' && reward.gift_emoji) {
    return <MediaPreview source={reward.gift_emoji} alt={reward.name} style={{ width: imgSize, height: imgSize }} fit="contain" fallback={<span style={{ fontSize, lineHeight: 1 }}>{reward.gift_emoji}</span>} />;
  }
  if (reward.image_url) {
    return <MediaPreview source={reward.image_url} alt={reward.name} style={{ width: imgSize, height: imgSize }} fit="contain" fallback={<span style={{ fontSize, lineHeight: 1 }}>🎁</span>} />;
  }
  if (reward.reward_type === 'stars') return <span style={{ fontSize, lineHeight: 1 }}>⭐</span>;
  return <span style={{ fontSize, lineHeight: 1 }}>🎁</span>;
}

export default function CaseOpenAnimation({ caseData, result, demo = false, onClose }) {
  const trackRef = useRef(null);
  const [phase, setPhase] = useState('spinning');
  const [winnerIndex] = useState(23);
  const animationRewards = result.animation_rewards || [];

  useEffect(() => {
    const ITEM_WIDTH = 140;
    const containerWidth = window.innerWidth;
    const centerOffset = containerWidth / 2 - ITEM_WIDTH / 2;
    const targetX = -(winnerIndex * ITEM_WIDTH - centerOffset);

    requestAnimationFrame(() => {
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = 'translateX(0)';
        requestAnimationFrame(() => {
          if (trackRef.current) {
            trackRef.current.style.transition = 'transform 5.5s cubic-bezier(0.12, 0.95, 0.30, 1.0)';
            trackRef.current.style.transform = `translateX(${targetX}px)`;
          }
        });
      }
    });

    const timer = setTimeout(() => {
      setPhase('result');
      // Only show confetti if actually won (not roulette loss)
      if (result.won) {
        const color = RARITY_COLORS[result.reward?.rarity] || '#f59e0b';
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, colors: [color, '#ffffff', '#f59e0b'], gravity: 0.8, scalar: 1.1 });
        setTimeout(() => {
          confetti({ particleCount: 60, spread: 50, origin: { y: 0.4, x: 0.2 }, colors: [color, '#ffffff'] });
          confetti({ particleCount: 60, spread: 50, origin: { y: 0.4, x: 0.8 }, colors: [color, '#ffffff'] });
        }, 300);
      }
    }, 5800);

    return () => clearTimeout(timer);
  }, []);

  const reward = result.reward;
  const rarityColor = RARITY_COLORS[reward?.rarity] || '#6b7280';

  return (
    <div className="case-open-overlay">
      {phase === 'spinning' && (
        <>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              {demo ? '🎮 Demo' : 'Ochilmoqda'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{caseData?.name}</div>
          </div>
          <div className="reel-container">
            <div className="reel-pointer" />
            <div className="reel-track" ref={trackRef} style={{ transform: 'translateX(0)' }}>
              {animationRewards.map((item, i) => (
                <div key={i} className={`reel-item ${i === winnerIndex ? 'is-winner' : ''}`}
                  style={{
                    borderColor: i === winnerIndex ? RARITY_COLORS[item.rarity] : undefined,
                    background: i === winnerIndex ? `rgba(${hexToRgb(RARITY_COLORS[item.rarity])}, 0.15)` : undefined,
                  }}>
                  <RewardDisplay reward={item} />
                  <span className="reel-item-name">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 32, color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 500 }}>
            {demo ? 'Demo rejim — priz saqlanmaydi' : 'Omad! 🍀'}
          </div>
        </>
      )}

      {phase === 'result' && (
        <div className="result-popup">
          <div className="modal-handle" />

          {result.won ? (
            <>
              {demo && (
                <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '6px 12px', marginBottom: 12, fontSize: 12, color: '#f59e0b', textAlign: 'center' }}>
                  🎮 Demo — priz inventoryga qo'shilmadi
                </div>
              )}
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                {demo ? 'Demo Natija!' : 'Yutdingiz!'}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, padding: 20, borderRadius: 18,
                background: `rgba(${hexToRgb(rarityColor)}, 0.1)`,
                border: `2px solid rgba(${hexToRgb(rarityColor)}, 0.4)`,
                boxShadow: `0 0 40px rgba(${hexToRgb(rarityColor)}, 0.3)`,
              }}>
                <RewardDisplay reward={reward} size="large" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{reward?.name}</div>
              {reward?.rarity && <div className={`rarity-badge ${reward.rarity}`} style={{ marginBottom: 8, display: 'inline-flex' }}>{reward.rarity}</div>}
              {reward?.reward_type === 'stars' && <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b', marginBottom: 4 }}>+{reward.stars_amount} ⭐</div>}
              {(reward?.reward_type === 'gift' || reward?.reward_type === 'nft') && reward?.value && (
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Qiymat: {reward.value} ⭐</div>
              )}
              <div style={{ height: 16 }} />
              <button className="btn btn-primary" onClick={onClose}>
                {demo ? '🎮 Yana Demo' : '🎉 Zo\'r!'}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 56, marginBottom: 12 }}>😔</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Yutmadingiz!</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Keling, yana urinib ko'ring! Keyingi marta albatta yutasiz!</div>
              <button className="btn btn-secondary" onClick={onClose}>Yana urinish</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255,255,255';
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}
