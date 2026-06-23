import React, { useState, useEffect } from 'react';
import { adminApi } from 'utils/api';
import './App.css';

const TABS = {
  DASHBOARD: 'dashboard',
  USERS: 'users',
  CASES: 'cases',
  REWARDS: 'rewards',
  NFT: 'nft',
  PROMO: 'promo',
  WITHDRAWALS: 'withdrawals',
  DEPOSITS: 'deposits',
  BROADCAST: 'broadcast',
  SETTINGS: 'settings',
};

function CaseRewardForm({ caseId, reward = null, onSave, onCancel }) {
  const [formData, setFormData] = useState(reward || { reward_type: 'gift', rarity: 'common', chance: 10, value: 10 });
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (file, type = 'gifts') => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('type', type);
    try {
      setUploading(true);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setFormData(prev => ({ ...prev, image_url: data.url }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.case_id) {
      alert('Name and case required');
      return;
    }
    try {
      if (reward?.id) {
        await adminApi.updateReward(reward.id, { ...formData, case_id: caseId });
      } else {
        await adminApi.createReward({ ...formData, case_id: caseId });
      }
      onSave();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="form-modal">
      <div className="form-modal-content">
        <h3>{reward ? 'Edit Reward' : 'New Reward'}</h3>
        <div className="form-group">
          <label>Type</label>
          <select value={formData.reward_type} onChange={e => setFormData(prev => ({ ...prev, reward_type: e.target.value }))}>
            <option value="gift">Gift</option>
            <option value="nft">NFT</option>
            <option value="stars">Stars</option>
          </select>
        </div>
        <div className="form-group">
          <label>Name</label>
          <input value={formData.name || ''} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Reward name" />
        </div>
        {formData.reward_type === 'stars' ? (
          <div className="form-group">
            <label>Stars Amount</label>
            <input type="number" value={formData.stars_amount || 0} onChange={e => setFormData(prev => ({ ...prev, stars_amount: parseFloat(e.target.value) }))} />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label>Rarity</label>
              <select value={formData.rarity || 'common'} onChange={e => setFormData(prev => ({ ...prev, rarity: e.target.value }))}>
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
            <div className="form-group">
              <label>Value (Stars)</label>
              <input type="number" value={formData.value || 0} onChange={e => setFormData(prev => ({ ...prev, value: parseFloat(e.target.value) }))} />
            </div>
          </>
        )}
        <div className="form-group">
          <label>Chance (%)</label>
          <input type="number" value={formData.chance || 10} onChange={e => setFormData(prev => ({ ...prev, chance: parseFloat(e.target.value) }))} min="0" max="100" />
        </div>
        <div className="form-group">
          <label>Image URL</label>
          <input value={formData.image_url || ''} onChange={e => setFormData(prev => ({ ...prev, image_url: e.target.value }))} placeholder="https://..." />
          <input type="file" accept="image/*" onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0])} disabled={uploading} />
          {uploading && <small>Uploading...</small>}
        </div>
        <div className="form-group">
          <label>Gift Emoji / Icon</label>
          <input value={formData.gift_emoji || ''} onChange={e => setFormData(prev => ({ ...prev, gift_emoji: e.target.value }))} placeholder="e.g., 🎁" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PromoCodForm({ onSave, onCancel }) {
  const [cases, setCases] = useState([]);
  const [formData, setFormData] = useState({ code: '', case_id: '', stars_required: 0, max_uses: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getCases().then(d => { setCases(d.cases || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!formData.code || !formData.case_id) { alert('Code and case required'); return; }
    try {
      await adminApi.createPromoCode(formData);
      onSave();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="form-modal">
      <div className="form-modal-content">
        <h3>Create Promo Code</h3>
        <div className="form-group">
          <label>Code (uppercase)</label>
          <input value={formData.code} onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} placeholder="PROMO2024" />
        </div>
        <div className="form-group">
          <label>Case</label>
          <select value={formData.case_id} onChange={e => setFormData(prev => ({ ...prev, case_id: e.target.value }))}>
            <option value="">Select case...</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Stars Required (0 = free)</label>
          <input type="number" value={formData.stars_required} onChange={e => setFormData(prev => ({ ...prev, stars_required: parseInt(e.target.value) }))} min="0" />
        </div>
        <div className="form-group">
          <label>Max Uses (0 = unlimited)</label>
          <input type="number" value={formData.max_uses} onChange={e => setFormData(prev => ({ ...prev, max_uses: parseInt(e.target.value) }))} min="0" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handleCreate}>Create</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BroadcastStarsModal({ onClose, onRefresh }) {
  const [amount, setAmount] = useState(5);
  const [reason, setReason] = useState('Admin bonus');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!amount || amount <= 0) { alert('Valid amount required'); return; }
    setLoading(true);
    try {
      const result = await adminApi.broadcastStars({ amount: parseInt(amount), reason });
      alert(`✅ ${result.credited} users received ${amount} ⭐`);
      onRefresh();
      onClose();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-modal">
      <div className="form-modal-content">
        <h3>🌟 Broadcast Stars</h3>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>Give stars to all users (except banned)</p>
        <div className="form-group">
          <label>Amount per user (⭐)</label>
          <input type="number" value={amount} onChange={e => setAmount(parseInt(e.target.value))} min="1" />
        </div>
        <div className="form-group">
          <label>Reason (shown in transactions)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Admin bonus, event reward, etc." rows={3} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-gold" onClick={handleSend} disabled={loading}>
            {loading ? 'Sending...' : `Send ${amount} ⭐ to All`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NFTManagementSection() {
  const [nfts, setNfts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingNFT, setEditingNFT] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', value: 100, rarity: 'rare', image_url: '', metadata: {} });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // In a real implementation, fetch NFTs from API
    // For now, we'll load from rewards with type 'nft'
  }, []);

  const handleImageUpload = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('type', 'nfts');
    try {
      setUploading(true);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) setFormData(prev => ({ ...prev, image_url: data.url }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) { alert('Name required'); return; }
    // Save NFT (in a real app, would call API)
    // For now, just close the form
    setShowForm(false);
    setFormData({ name: '', description: '', value: 100, rarity: 'rare', image_url: '', metadata: {} });
  };

  return (
    <div className="section">
      <div className="section-header">
        <h2>🖼️ NFT Management</h2>
        <button className="btn btn-primary" onClick={() => { setEditingNFT(null); setShowForm(true); }}>+ New NFT</button>
      </div>

      {showForm && (
        <div className="form-modal">
          <div className="form-modal-content">
            <h3>{editingNFT ? 'Edit NFT' : 'Create NFT'}</h3>
            <div className="form-group">
              <label>NFT Name</label>
              <input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="NFT name" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="NFT description" rows={3} />
            </div>
            <div className="form-group">
              <label>Value (Stars)</label>
              <input type="number" value={formData.value} onChange={e => setFormData(prev => ({ ...prev, value: parseInt(e.target.value) }))} />
            </div>
            <div className="form-group">
              <label>Rarity</label>
              <select value={formData.rarity} onChange={e => setFormData(prev => ({ ...prev, rarity: e.target.value }))}>
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
            <div className="form-group">
              <label>Image</label>
              <input value={formData.image_url} onChange={e => setFormData(prev => ({ ...prev, image_url: e.target.value }))} placeholder="https://..." />
              <input type="file" accept="image/*" onChange={e => e.target.files[0] && handleImageUpload(e.target.files[0])} disabled={uploading} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>NFTs will be created as Case Rewards with type 'nft'</p>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Use the Rewards section to add NFTs to cases</p>
      </div>
    </div>
  );
}

function PromoCodeSection() {
  const [promoCodes, setPromoCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadPromoCodes(); }, []);

  const loadPromoCodes = async () => {
    try {
      const data = await adminApi.getPromoCodes();
      setPromoCodes(data.promo_codes || []);
      setLoading(false);
    } catch (err) {
      alert('Error: ' + err.message);
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this promo code?')) return;
    try {
      await adminApi.deletePromoCode(id);
      loadPromoCodes();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="section">
      <div className="section-header">
        <h2>🎟️ Promo Codes</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Code</button>
      </div>

      {showForm && <PromoCodForm onSave={() => { setShowForm(false); loadPromoCodes(); }} onCancel={() => setShowForm(false)} />}

      <div style={{ marginTop: 16 }}>
        {promoCodes.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.4)' }}>No promo codes yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {promoCodes.map(promo => (
              <div key={promo.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{promo.code}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{promo.case_name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    {promo.stars_required > 0 && `${promo.stars_required}⭐ | `}
                    Used: {promo.used_count}/{promo.max_uses || '∞'}
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => handleDelete(promo.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    // Check if user is admin
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
      alert('Please open this app via Telegram bot');
      window.location.href = '/';
    }
  }, []);

  return (
    <div className="admin-app">
      <div className="admin-header">
        <div className="admin-logo">🎁 TMUX Admin</div>
        <div className="admin-nav">
          {Object.entries(TABS).map(([key, value]) => (
            <button
              key={value}
              className={`nav-btn ${activeTab === value ? 'active' : ''}`}
              onClick={() => setActiveTab(value)}
            >
              {key.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-content">
        {activeTab === TABS.NFT && <NFTManagementSection />}
        {activeTab === TABS.PROMO && <PromoCodeSection />}
        {activeTab === TABS.BROADCAST && (
          <div className="section">
            <div className="section-header">
              <h2>📢 Broadcast</h2>
              <button className="btn btn-gold" onClick={() => {
                const modal = document.createElement('div');
                document.body.appendChild(modal);
              }}>⭐ Send Stars to All</button>
            </div>
            <BroadcastStarsModal onClose={() => {}} onRefresh={() => {}} />
          </div>
        )}
        {activeTab === TABS.DASHBOARD && (
          <div className="section">
            <h2>Dashboard</h2>
            <p>Welcome to TMUX Admin Panel</p>
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div className="stat-card">
                <div className="stat-label">Users</div>
                <div className="stat-value">-</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cases</div>
                <div className="stat-value">-</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Deposits</div>
                <div className="stat-value">-</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Pending Withdrawals</div>
                <div className="stat-value">-</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
