import React, { useEffect, useState, useCallback } from 'react';
import { inventoryApi } from 'utils/api';
import { useApp } from 'hooks/useApp';

function InventoryItem({ item, onSell, onWithdraw }) {
  return (
    <div className={`inventory-item rarity-glow-${item.rarity}`}>
      <div className="inventory-img-wrap">
        {item.gift_emoji ? (
          <span style={{ fontSize: 56 }}>{item.gift_emoji}</span>
        ) : item.image_url ? (
          <img src={item.image_url} alt={item.name} style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 48 }}>🖼️</span>
        )}
      </div>
      <div className="inventory-info">
        <div className="inventory-name">{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span className={`rarity-badge ${item.rarity}`}>{item.rarity}</span>
          <span className="inventory-value">{parseFloat(item.value).toLocaleString()} ⭐</span>
        </div>
        <div className="inventory-actions">
          <button
            className="btn btn-success btn-sm"
            style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
            onClick={() => onSell(item)}
          >
            💰 Sell
          </button>
          <button
            className="btn btn-secondary btn-sm"
            style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
            onClick={() => onWithdraw(item)}
          >
            📤 Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ item, action, onConfirm, onCancel, loading }) {
  const isSell = action === 'sell';
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>
            {item.gift_emoji || (item.reward_type === 'nft' ? '🖼️' : '🎁')}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            {isSell ? 'Sell Item?' : 'Withdraw Item?'}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
            {isSell
              ? `You'll receive ${parseFloat(item.value).toLocaleString()} ⭐ instantly`
              : 'A withdrawal request will be sent to admin for review'}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`rarity-badge ${item.rarity}`}>{item.rarity}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Value: {item.value} ⭐</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button
            className={`btn ${isSell ? 'btn-success' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Processing...' : isSell ? '💰 Sell' : '📤 Withdraw'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { showToast, refreshBalance } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [confirmItem, setConfirmItem] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const typeMap = { gifts: 'gifts', nfts: 'nfts', all: undefined };
      const data = await inventoryApi.getAll(typeMap[activeTab]);
      setItems(data.items || []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, showToast]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const handleSell = (item) => { setConfirmItem(item); setConfirmAction('sell'); };
  const handleWithdraw = (item) => { setConfirmItem(item); setConfirmAction('withdraw'); };

  const handleConfirm = async () => {
    if (!confirmItem) return;
    setActionLoading(true);
    try {
      if (confirmAction === 'sell') {
        const result = await inventoryApi.sell(confirmItem.id);
        showToast(result.message || 'Sold successfully!', 'success');
        await refreshBalance();
      } else {
        const result = await inventoryApi.withdraw(confirmItem.id);
        showToast(result.message || 'Withdrawal requested!', 'success');
      }
      setConfirmItem(null);
      await loadInventory();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const tabs = [
    { id: 'all', label: '🎒 All' },
    { id: 'gifts', label: '🎁 Gifts' },
    { id: 'nfts', label: '🖼️ NFTs' },
  ];

  return (
    <>
      <div className="filter-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`filter-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height: 300 }}>
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-emoji">🎒</div>
          <div className="empty-state-title">Inventory is empty</div>
          <div className="empty-state-text">Open cases to win gifts, NFTs, and Stars!</div>
        </div>
      ) : (
        <>
          <div style={{ padding: '12px 16px 0', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          <div className="inventory-grid">
            {items.map(item => (
              <InventoryItem
                key={item.id}
                item={item}
                onSell={handleSell}
                onWithdraw={handleWithdraw}
              />
            ))}
          </div>
        </>
      )}

      {confirmItem && (
        <ConfirmModal
          item={confirmItem}
          action={confirmAction}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmItem(null)}
          loading={actionLoading}
        />
      )}
    </>
  );
}
