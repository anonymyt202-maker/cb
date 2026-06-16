import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';

// ========== API ==========
const BASE = process.env.REACT_APP_API_URL || '/api';
const api = axios.create({ baseURL: BASE, timeout: 15000 });
api.interceptors.request.use(cfg => {
  cfg.headers = cfg.headers || {};
  Object.assign(cfg.headers, getAdminAuthHeaders());
  return cfg;
});
api.interceptors.response.use(r => r, e => Promise.reject(new Error(e.response?.data?.error || 'Request failed')));

const ADMIN_IDS = new Set(
  String(process.env.REACT_APP_ADMIN_IDS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => Number.parseInt(v, 10))
    .filter(Number.isFinite)
);

const ADMIN_USERNAMES = new Set(
  String(process.env.REACT_APP_ADMIN_USERNAMES || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
);

const BROWSER_ADMIN_KEY = Array.from(ADMIN_IDS)[0] ? String(Array.from(ADMIN_IDS)[0]) : '';

function getAdminAuthHeaders() {
  const headers = {};
  const tg = getTelegramWebApp();
  const tgInitData = tg?.initData || '';
  if (tgInitData) {
    headers['X-Init-Data'] = tgInitData;
    return headers;
  }

  if (BROWSER_ADMIN_KEY) {
    headers['X-Admin-Key'] = BROWSER_ADMIN_KEY;
    return headers;
  }

  const stored = localStorage.getItem('admin_init_data') || '';
  if (stored) headers['X-Init-Data'] = stored;
  return headers;
}

function getTelegramWebApp() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

function syncAdminInitData() {
  try {
    const tg = getTelegramWebApp();
    const initData = tg?.initData || '';
    if (initData && initData.length > 0) {
      localStorage.setItem('admin_init_data', initData);
      return initData;
    }
  } catch {}
  return localStorage.getItem('admin_init_data') || '';
}

function isAllowedAdminUser(user) {
  if (!user?.id) return false;
  const idOk = ADMIN_IDS.size === 0 || ADMIN_IDS.has(Number(user.id));
  const username = String(user.username || '').trim().toLowerCase();
  const usernameOk = ADMIN_USERNAMES.size === 0 || (username && ADMIN_USERNAMES.has(username));
  return idOk && usernameOk;
}


function MediaPreview({ source, alt = '', size = 72, fit = 'contain' }) {
  const [resolved, setResolved] = useState(null);
  const [kind, setKind] = useState('image');

  useEffect(() => {
    let mounted = true;
    const value = String(source || '').trim();
    if (!value) {
      setResolved(null);
      return;
    }

    const isPlainEmoji = value.length <= 4 && !/^https?:\/\//i.test(value) && !/^[A-Za-z0-9_-]{20,}$/.test(value);
    if (isPlainEmoji) {
      setResolved(value);
      setKind('emoji');
      return;
    }

    const direct = /^https?:\/\//i.test(value) && !/^https?:\/\/(?:t\.me|telegram\.me)\//i.test(value);
    if (direct) {
      setResolved(value);
      setKind(/\.(webm|mp4|mov)$/i.test(value) ? 'video' : 'image');
      return;
    }

    api.get('/media/resolve', { params: { source: value } })
      .then(r => {
        if (!mounted) return;
        setResolved(r.data?.url || null);
        setKind(r.data?.kind || 'image');
      })
      .catch(() => {
        if (mounted) {
          setResolved(null);
          setKind('image');
        }
      });

    return () => { mounted = false; };
  }, [source]);

  if (!source) return null;
  if (kind === 'emoji') {
    return <div style={{ width: size, height: size, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.55 }}>{resolved}</div>;
  }
  if (!resolved) {
    return <div style={{ width: size, height: size, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.55, background: 'rgba(255,255,255,0.05)' }}>🖼️</div>;
  }

  if (kind === 'video') {
    return <video src={resolved} autoPlay loop muted playsInline style={{ width: size, height: size, objectFit: fit, borderRadius: 14 }} />;
  }

  return <img src={resolved} alt={alt} style={{ width: size, height: size, objectFit: fit, borderRadius: 14 }} />;
}

// ========== AUTH CONTEXT ==========
const AuthCtx = createContext(null);
function useAuth() { return useContext(AuthCtx); }

// ========== STYLES ==========
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;background:#0d0d14;color:#fff;min-height:100vh;}
  ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px;}
  .admin-layout{display:flex;min-height:100vh;}
  .sidebar{width:240px;background:#111118;border-right:1px solid rgba(255,255,255,0.07);flex-shrink:0;display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:100;}
  .sidebar-logo{padding:24px 20px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.07);}
  .sidebar-logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#4f8ef7,#7c3aed);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;}
  .sidebar-logo-text{font-size:16px;font-weight:800;}
  .sidebar-nav{padding:12px 10px;flex:1;}
  .nav-link{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.5);text-decoration:none;transition:all .2s;margin-bottom:2px;}
  .nav-link:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);}
  .nav-link.active{background:rgba(79,142,247,0.15);color:#4f8ef7;border:1px solid rgba(79,142,247,0.25);}
  .nav-section{font-size:10px;font-weight:700;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:1px;padding:12px 12px 6px;}
  .main-content{flex:1;margin-left:240px;min-height:100vh;}
  .topbar{background:#111118;border-bottom:1px solid rgba(255,255,255,0.07);padding:16px 28px;display:flex;align-items:center;justify-content:space-between;}
  .page-title{font-size:20px;font-weight:800;}
  .content-area{padding:28px;}
  .card{background:#161621;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:28px;}
  .stat-card{background:#161621;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:18px 20px;}
  .stat-num{font-size:28px;font-weight:900;background:linear-gradient(135deg,#4f8ef7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  .stat-lbl{font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;font-weight:600;}
  .table{width:100%;border-collapse:collapse;}
  .table th{text-align:left;font-size:11px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:.5px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.07);}
  .table td{padding:13px 16px;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);}
  .table tr:last-child td{border-bottom:none;}
  .table tr:hover td{background:rgba(255,255,255,0.02);}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
  .badge-green{background:rgba(16,185,129,.15);color:#10b981;}
  .badge-yellow{background:rgba(245,158,11,.15);color:#f59e0b;}
  .badge-red{background:rgba(239,68,68,.15);color:#ef4444;}
  .badge-blue{background:rgba(79,142,247,.15);color:#4f8ef7;}
  .badge-purple{background:rgba(139,92,246,.15);color:#8b5cf6;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;border:none;cursor:pointer;transition:all .2s;}
  .btn:active{transform:scale(.96);}
  .btn:disabled{opacity:.5;cursor:not-allowed;}
  .btn-primary{background:linear-gradient(135deg,#4f8ef7,#7c3aed);color:#fff;}
  .btn-secondary{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#fff;}
  .btn-success{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}
  .btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;}
  .btn-sm{padding:6px 12px;font-size:12px;}
  .form-group{margin-bottom:16px;}
  .form-label{font-size:12px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:block;}
  .form-input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 14px;font-size:14px;color:#fff;outline:none;transition:border .2s;font-family:inherit;}
  .form-input:focus{border-color:#4f8ef7;}
  .form-input::placeholder{color:rgba(255,255,255,.25);}
  select.form-input option{background:#1a1a28;}
  .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;}
  .modal-box{background:#161621;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;}
  .modal-title{font-size:18px;font-weight:800;margin-bottom:20px;}
  .flex{display:flex;} .gap-2{gap:8px;} .gap-3{gap:12px;} .gap-4{gap:16px;}
  .items-center{align-items:center;} .justify-between{justify-content:space-between;} .flex-1{flex:1;}
  .mb-2{margin-bottom:8px;} .mb-4{margin-bottom:16px;} .mb-6{margin-bottom:24px;}
  .text-sm{font-size:13px;} .text-xs{font-size:11px;} .text-muted{color:rgba(255,255,255,.4);}
  .text-right{text-align:right;} .w-full{width:100%;}
  .spinner{width:20px;height:20px;border:2px solid rgba(255,255,255,.15);border-top-color:#4f8ef7;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .loading-center{display:flex;align-items:center;justify-content:center;padding:60px;gap:12px;color:rgba(255,255,255,.4);font-size:14px;}
  .search-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 14px;font-size:14px;color:#fff;outline:none;font-family:inherit;width:100%;max-width:300px;}
  .search-input::placeholder{color:rgba(255,255,255,.25);}
  .pagination{display:flex;align-items:center;gap:8px;margin-top:16px;}
  .page-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 12px;font-size:13px;color:#fff;cursor:pointer;font-weight:600;}
  .page-btn.active{background:rgba(79,142,247,.25);border-color:rgba(79,142,247,.4);color:#4f8ef7;}
  .alert{padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:16px;}
  .alert-error{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:#ef4444;}
  .alert-success{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.25);color:#10b981;}
  .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;}
  .section-title{font-size:17px;font-weight:800;}
  .divider{height:1px;background:rgba(255,255,255,.07);margin:20px 0;}
`;

// ========== HELPERS ==========
function Badge({ status }) {
  const map = {
    completed: 'badge-green', approved: 'badge-green', active: 'badge-green', win: 'badge-green',
    pending: 'badge-yellow',
    rejected: 'badge-red', banned: 'badge-red', lose: 'badge-red',
    normal: 'badge-blue', roulette: 'badge-purple', daily_free: 'badge-green', referral: 'badge-blue',
  };
  return <span className={`badge ${map[status] || 'badge-blue'}`}>{status}</span>;
}

function Spinner() { return <div className="spinner" />; }
function LoadingCenter() { return <div className="loading-center"><Spinner /> Loading...</div>; }

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="modal-title" style={{ margin: 0 }}>{title}</div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Alert({ msg, type = 'error' }) {
  if (!msg) return null;
  return <div className={`alert alert-${type}`}>{msg}</div>;
}

// ========== DASHBOARD ==========
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard').then(r => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCenter />;

  const statCards = [
    { label: 'Total Users', value: stats?.total_users?.toLocaleString(), icon: '👥' },
    { label: 'Total Deposits', value: `${parseFloat(stats?.total_deposits || 0).toLocaleString()} ⭐`, icon: '💰' },
    { label: 'Case Opens', value: stats?.total_case_opens?.toLocaleString(), icon: '🎁' },
    { label: 'Upgrades', value: stats?.total_upgrades?.toLocaleString(), icon: '⚡' },
    { label: 'Pending Withdrawals', value: stats?.pending_withdrawals, icon: '⏳', warn: stats?.pending_withdrawals > 0 },
    { label: 'Pending Deposits', value: stats?.pending_deposits, icon: '💎', warn: stats?.pending_deposits > 0 },
  ];

  return (
    <div>
      <div className="stat-grid">
        {statCards.map(s => (
          <div key={s.label} className="stat-card" style={s.warn ? { borderColor: 'rgba(245,158,11,.35)' } : {}}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div className="stat-num" style={s.warn ? { background: 'none', WebkitTextFillColor: '#f59e0b', color: '#f59e0b' } : {}}>{s.value}</div>
            <div className="stat-lbl">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-title mb-4">Recent Activity</div>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Case</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.recent_activity || []).map((a, i) => (
              <tr key={i}>
                <td>{a.first_name}{a.username ? ` @${a.username}` : ''}</td>
                <td>{a.case_name}</td>
                <td className="text-muted text-sm">{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ========== USERS ==========
function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceModal, setBalanceModal] = useState(null);
  const [balAmount, setBalAmount] = useState('');
  const [balReason, setBalReason] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/users', { params: { search, page, limit: 20 } });
      setUsers(r.data.users);
      setTotal(r.data.total);
    } catch (e) {
      setActionMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const handleBan = async (user) => {
    if (!window.confirm(`${user.is_banned ? 'Unban' : 'Ban'} ${user.first_name}?`)) return;
    try {
      if (user.is_banned) await api.post(`/admin/users/${user.id}/unban`);
      else await api.post(`/admin/users/${user.id}/ban`);
      load();
    } catch (e) { setActionMsg(e.message); }
  };

  const handleAdjustBalance = async () => {
    if (!balAmount) return;
    try {
      await api.post(`/admin/users/${balanceModal.id}/balance`, { amount: parseFloat(balAmount), reason: balReason });
      setBalanceModal(null); setBalAmount(''); setBalReason('');
      setActionMsg('Balance adjusted!');
      load();
    } catch (e) { setActionMsg(e.message); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Users</div>
        <div className="flex gap-2">
          <input className="search-input" placeholder="Search by name, username, ID..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          <button className="btn btn-primary" onClick={load}>Search</button>
        </div>
      </div>

      <Alert msg={actionMsg} type={actionMsg.includes('!') ? 'success' : 'error'} />

      <div className="card">
        {loading ? <LoadingCenter /> : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th><th>Balance</th><th>Deposited</th><th>Status</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{u.first_name} {u.last_name || ''}</div>
                    <div className="text-xs text-muted">{u.username ? `@${u.username}` : `ID: ${u.id}`}</div>
                  </td>
                  <td style={{ color: '#f59e0b', fontWeight: 700 }}>{parseFloat(u.stars_balance || 0).toLocaleString()} ⭐</td>
                  <td className="text-muted">{parseFloat(u.total_deposited || 0).toLocaleString()} ⭐</td>
                  <td>
                    {u.is_banned ? <Badge status="banned" /> : <Badge status="active" />}
                    {u.is_admin && <Badge status="admin" />}
                  </td>
                  <td className="text-sm text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUser(u)}>View</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setBalanceModal(u)}>💰</button>
                      <button className={`btn btn-sm ${u.is_banned ? 'btn-success' : 'btn-danger'}`} onClick={() => handleBan(u)}>
                        {u.is_banned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pagination">
          <span className="text-sm text-muted">Total: {total}</span>
          {page > 1 && <button className="page-btn" onClick={() => setPage(p => p - 1)}>← Prev</button>}
          <span className="page-btn active">{page}</span>
          {users.length === 20 && <button className="page-btn" onClick={() => setPage(p => p + 1)}>Next →</button>}
        </div>
      </div>

      {selectedUser && (
        <Modal title={`${selectedUser.first_name}'s Profile`} onClose={() => setSelectedUser(null)}>
          <div className="text-sm">
            <div className="mb-2"><b>ID:</b> {selectedUser.id}</div>
            <div className="mb-2"><b>Username:</b> @{selectedUser.username || 'N/A'}</div>
            <div className="mb-2"><b>Balance:</b> {parseFloat(selectedUser.stars_balance || 0).toLocaleString()} ⭐</div>
            <div className="mb-2"><b>Total Deposited:</b> {parseFloat(selectedUser.total_deposited || 0).toLocaleString()} ⭐</div>
            <div className="mb-2"><b>Referral Code:</b> {selectedUser.referral_code}</div>
            <div className="mb-2"><b>Status:</b> {selectedUser.is_banned ? '🚫 Banned' : '✅ Active'}</div>
            <div className="mb-2"><b>Joined:</b> {new Date(selectedUser.created_at).toLocaleString()}</div>
          </div>
        </Modal>
      )}

      {balanceModal && (
        <Modal title={`Adjust Balance — ${balanceModal.first_name}`} onClose={() => setBalanceModal(null)}>
          <div className="form-group">
            <label className="form-label">Amount (positive to add, negative to deduct)</label>
            <input className="form-input" type="number" placeholder="e.g. 100 or -50" value={balAmount} onChange={e => setBalAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input className="form-input" placeholder="Admin bonus, correction, etc." value={balReason} onChange={e => setBalReason(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => setBalanceModal(null)}>Cancel</button>
            <button className="btn btn-primary flex-1" onClick={handleAdjustBalance}>Apply</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ========== CASES MANAGEMENT ==========
function CasesManager() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCase, setEditCase] = useState(null);
  const [rewardsCase, setRewardsCase] = useState(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', image_url: '', price: 0,
    case_type: 'normal', referrals_required: 0, task_type: 'none',
    task_value: '', task_min_referrals: 0, win_chance: 50, sort_order: 0, is_active: true,
  });

  const load = () => {
    api.get('/admin/cases').then(r => setCases(r.data.cases)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditCase(null);
    setForm({ name: '', description: '', image_url: '', price: 0, case_type: 'normal', referrals_required: 0, task_type: 'none', task_value: '', task_min_referrals: 0, win_chance: 50, sort_order: 0, is_active: true });
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditCase(c);
    setForm({ ...c });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editCase) await api.put(`/admin/cases/${editCase.id}`, form);
      else await api.post('/admin/cases', form);
      setShowForm(false);
      setMsg('Case saved!');
      load();
    } catch (e) { setMsg(e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this case?')) return;
    try {
      await api.delete(`/admin/cases/${id}`);
      setMsg('Case deleted!');
      load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Cases</div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Case</button>
      </div>
      <Alert msg={msg} type={msg.includes('!') ? 'success' : 'error'} />
      <div className="card">
        {loading ? <LoadingCenter /> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Type</th><th>Price</th><th>Rewards</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    {c.image_url && <div className="text-xs text-muted">Has image</div>}
                  </td>
                  <td><Badge status={c.case_type} /></td>
                  <td style={{ color: '#f59e0b', fontWeight: 700 }}>
                    {c.case_type === 'daily_free' || c.case_type === 'referral' ? 'FREE' : `${parseFloat(c.price).toLocaleString()} ⭐`}
                  </td>
                  <td>{c.reward_count} rewards</td>
                  <td><Badge status={c.is_active ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => setRewardsCase(c)}>Rewards</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={editCase ? 'Edit Case' : 'Create Case'} onClose={() => setShowForm(false)}>
          {['name', 'description', 'image_url'].map(f => (
            <div className="form-group" key={f}>
              <label className="form-label">{f.replace('_', ' ')}</label>
              <input className="form-input" placeholder={f === 'image_url' ? 'https://..., telegram link, or file_id' : f} value={form[f] || ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} />
              {f === 'image_url' && form.image_url ? (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <MediaPreview source={form.image_url} alt={form.name || 'preview'} size={64} />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Telegram photo, sticker, or channel preview supported.</div>
                </div>
              ) : null}
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">Case Type</label>
            <select className="form-input" value={form.case_type} onChange={e => setForm(p => ({ ...p, case_type: e.target.value }))}>
              <option value="normal">Normal</option>
              <option value="roulette">Roulette</option>
              <option value="daily_free">Daily Free</option>
              <option value="referral">Referral</option>
            </select>
          </div>
          {(form.case_type === 'normal' || form.case_type === 'roulette') && (
            <div className="form-group">
              <label className="form-label">Price (Stars)</label>
              <input className="form-input" type="number" min="0" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} />
            </div>
          )}
          {form.case_type === 'roulette' && (
            <div className="form-group">
              <label className="form-label">Win Chance (%)</label>
              <input className="form-input" type="number" min="0.1" max="99.9" step="0.1" value={form.win_chance} onChange={e => setForm(p => ({ ...p, win_chance: e.target.value }))} />
            </div>
          )}
          {form.case_type === 'referral' && (
            <div className="form-group">
              <label className="form-label">Referrals Required</label>
              <input className="form-input" type="number" min="1" value={form.referrals_required} onChange={e => setForm(p => ({ ...p, referrals_required: e.target.value }))} />
            </div>
          )}
          {form.case_type === 'daily_free' && (
            <>
              <div className="form-group">
                <label className="form-label">Task Type</label>
                <select className="form-input" value={form.task_type} onChange={e => setForm(p => ({ ...p, task_type: e.target.value }))}>
                  <option value="none">No Task (Free)</option>
                  <option value="channel_sub">Channel Subscription</option>
                  <option value="referrals">Minimum Referrals</option>
                </select>
              </div>
              {form.task_type === 'channel_sub' && (
                <div className="form-group">
                  <label className="form-label">Channel Username (e.g. @mychannel)</label>
                  <input className="form-input" placeholder="@channel" value={form.task_value} onChange={e => setForm(p => ({ ...p, task_value: e.target.value }))} />
                </div>
              )}
              {form.task_type === 'referrals' && (
                <div className="form-group">
                  <label className="form-label">Min Referrals Required</label>
                  <input className="form-input" type="number" min="1" value={form.task_min_referrals} onChange={e => setForm(p => ({ ...p, task_min_referrals: e.target.value }))} />
                </div>
              )}
            </>
          )}
          <div className="form-group">
            <label className="form-label">Sort Order</label>
            <input className="form-input" type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
          </div>
          <div className="form-group flex items-center gap-2">
            <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="active" className="form-label" style={{ margin: 0 }}>Active</label>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary flex-1" onClick={handleSave}>Save Case</button>
          </div>
        </Modal>
      )}

      {rewardsCase && <RewardsManager caseData={rewardsCase} onClose={() => { setRewardsCase(null); load(); }} />}
    </div>
  );
}

// ========== REWARDS MANAGER ==========
function RewardsManager({ caseData, onClose }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editReward, setEditReward] = useState(null);
  const [msg, setMsg] = useState('');
  const GIFT_EMOJIS = ['🧸','💝','🎁','🌹','🎂','💐','🍾','🚀','💎','🏆'];
  const [form, setForm] = useState({ case_id: caseData.id, reward_type: 'gift', name: '', image_url: '', gift_emoji: '🎁', stars_amount: 0, value: 0, rarity: 'common', chance: 10, is_active: true });

  const load = () => {
    api.get(`/admin/cases/${caseData.id}/rewards`).then(r => setRewards(r.data.rewards)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditReward(null);
    setForm({ case_id: caseData.id, reward_type: 'gift', name: '', image_url: '', gift_emoji: '🎁', stars_amount: 0, value: 0, rarity: 'common', chance: 10, is_active: true });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editReward) await api.put(`/admin/rewards/${editReward.id}`, form);
      else await api.post('/admin/rewards', form);
      setShowForm(false);
      setMsg('Reward saved!');
      load();
    } catch (e) { setMsg(e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete reward?')) return;
    try {
      await api.delete(`/admin/rewards/${id}`);
      setMsg('Deleted!');
      load();
    } catch (e) { setMsg(e.message); }
  };

  const totalChance = rewards.reduce((s, r) => s + parseFloat(r.chance || 0), 0);

  return (
    <Modal title={`Rewards — ${caseData.name}`} onClose={onClose}>
      <Alert msg={msg} type={msg.includes('!') ? 'success' : 'error'} />
      <div style={{ marginBottom: 12, fontSize: 13, color: totalChance > 100 ? '#ef4444' : totalChance === 100 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
        Total chance: {totalChance.toFixed(2)}% {totalChance !== 100 && '(should equal 100%)'}
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 14 }}>
        {loading ? <LoadingCenter /> : rewards.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 28 }}>{r.gift_emoji ? <MediaPreview source={r.gift_emoji} alt={r.name} size={28} /> : (r.reward_type === 'stars' ? '⭐' : '🖼️')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                <span className={`badge ${r.rarity === 'legendary' ? 'badge-yellow' : r.rarity === 'epic' ? 'badge-purple' : r.rarity === 'rare' ? 'badge-blue' : 'badge-blue'}`} style={{ fontSize: 9 }}>{r.rarity}</span>
                {' '}{r.chance}% chance {r.value > 0 && `· ${r.value} ⭐ val`}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditReward(r); setForm({ ...r }); setShowForm(true); }}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button>
          </div>
        ))}
      </div>

      <button className="btn btn-primary w-full" onClick={openCreate}>+ Add Reward</button>

      {showForm && (
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editReward ? 'Edit Reward' : 'New Reward'}</div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input" value={form.reward_type} onChange={e => setForm(p => ({ ...p, reward_type: e.target.value }))}>
              <option value="gift">Gift</option>
              <option value="nft">NFT</option>
              <option value="stars">Stars</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" placeholder="Reward name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          {form.reward_type === 'gift' && (
            <div className="form-group">
              <label className="form-label">Gift Emoji</label>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {GIFT_EMOJIS.map(e => (
                  <div key={e} onClick={() => setForm(p => ({ ...p, gift_emoji: e }))}
                    style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, borderRadius: 10, cursor: 'pointer', background: form.gift_emoji === e ? 'rgba(79,142,247,0.25)' : 'rgba(255,255,255,0.05)', border: form.gift_emoji === e ? '2px solid #4f8ef7' : '2px solid transparent' }}>
                    {e}
                  </div>
                ))}
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Custom Gift Emoji / Sticker file_id</label>
                <input className="form-input" placeholder="Paste emoji, file_id, or t.me link" value={form.gift_emoji} onChange={e => setForm(p => ({ ...p, gift_emoji: e.target.value }))} />
                {form.gift_emoji ? (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MediaPreview source={form.gift_emoji} alt={form.name || 'gift preview'} size={64} />
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Animated stickers and premium emoji file_ids are supported here.</div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {form.reward_type === 'nft' && (
            <div className="form-group">
              <label className="form-label">Image / Telegram link / file_id</label>
              <input className="form-input" placeholder="https://..., t.me link, or file_id" value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
              {form.image_url ? (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <MediaPreview source={form.image_url} alt={form.name || 'preview'} size={64} />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Sticker / animated media preview will render here.</div>
                </div>
              ) : null}
            </div>
          )}
          {form.reward_type === 'stars' ? (
            <div className="form-group">
              <label className="form-label">Stars Amount</label>
              <input className="form-input" type="number" min="1" value={form.stars_amount} onChange={e => setForm(p => ({ ...p, stars_amount: e.target.value }))} />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Value (Stars)</label>
              <input className="form-input" type="number" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Rarity</label>
            <select className="form-input" value={form.rarity} onChange={e => setForm(p => ({ ...p, rarity: e.target.value }))}>
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Chance % (remaining: {(100 - totalChance + (editReward ? parseFloat(editReward.chance) : 0)).toFixed(2)}%)</label>
            <input className="form-input" type="number" min="0.01" max="100" step="0.01" value={form.chance} onChange={e => setForm(p => ({ ...p, chance: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary flex-1" onClick={handleSave}>Save</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ========== WITHDRAWALS ==========
function Withdrawals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin/withdrawals', { params: { status } }).then(r => setItems(r.data.withdrawals)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status]);

  const handleAction = async (id, action) => {
    try {
      if (action === 'approve') await api.post(`/admin/withdrawals/${id}/approve`, {});
      else await api.post(`/admin/withdrawals/${id}/reject`, { notes: 'Rejected by admin' });
      setMsg(`${action === 'approve' ? 'Approved' : 'Rejected'}!`);
      load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Withdrawals</div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected'].map(s => (
            <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <Alert msg={msg} type={msg.includes('!') ? 'success' : 'error'} />
      <div className="card">
        {loading ? <LoadingCenter /> : items.length === 0 ? (
          <div className="loading-center" style={{ padding: 40 }}>No {status} withdrawals</div>
        ) : (
          <table className="table">
            <thead><tr><th>User</th><th>Item</th><th>Type</th><th>Value</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(w => (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{w.first_name}</div>
                    <div className="text-xs text-muted">{w.username ? `@${w.username}` : `ID: ${w.user_id}`}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 24 }}>{w.gift_emoji || (w.reward_type === 'nft' ? '🖼️' : '🎁')}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{w.item_name}</span>
                    </div>
                  </td>
                  <td><Badge status={w.reward_type} /></td>
                  <td style={{ color: '#f59e0b', fontWeight: 700 }}>{parseFloat(w.value).toLocaleString()} ⭐</td>
                  <td className="text-sm text-muted">{new Date(w.requested_at).toLocaleDateString()}</td>
                  <td>
                    {status === 'pending' ? (
                      <div className="flex gap-2">
                        <button className="btn btn-success btn-sm" onClick={() => handleAction(w.id, 'approve')}>✅ Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction(w.id, 'reject')}>❌ Reject</button>
                      </div>
                    ) : <Badge status={w.status} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ========== DEPOSITS ==========
function Deposits() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [msg, setMsg] = useState('');
  const [approveModal, setApproveModal] = useState(null); // { id, stars_credited, ton_amount }
  const [customStars, setCustomStars] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin/deposits', { params: { status } }).then(r => setItems(r.data.deposits)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [status]);

  const openApprove = (dep) => {
    setApproveModal(dep);
    setCustomStars(String(dep.stars_credited || ''));
  };

  const handleApprove = async () => {
    try {
      await api.post(`/admin/deposits/${approveModal.id}/approve`, { custom_stars: parseFloat(customStars) });
      setMsg('Approved!');
      setApproveModal(null);
      load();
    } catch (e) { setMsg(e.message); }
  };

  const handleReject = async (id) => {
    try {
      await api.post(`/admin/deposits/${id}/reject`);
      setMsg('Rejected!');
      load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Deposits</div>
        <div className="flex gap-2">
          {['pending', 'completed', 'rejected'].map(s => (
            <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
      </div>
      <Alert msg={msg} type={msg.includes('!') ? 'success' : 'error'} />
      {approveModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-title">✅ Approve Deposit</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              User: <strong style={{ color: '#fff' }}>{approveModal.first_name}</strong> | TON: <strong style={{ color: '#4f8ef7' }}>{approveModal.ton_amount} TON</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Stars to Credit ⭐</label>
              <input
                className="form-input"
                type="number"
                value={customStars}
                onChange={e => setCustomStars(e.target.value)}
                min="1"
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                Auto-calculated from TON amount × rate. You can change manually.
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-success flex-1" onClick={handleApprove}>✅ Confirm Approve</button>
              <button className="btn btn-secondary" onClick={() => setApproveModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        {loading ? <LoadingCenter /> : items.length === 0 ? (
          <div className="loading-center" style={{ padding: 40 }}>No {status} deposits</div>
        ) : (
          <table className="table">
            <thead><tr><th>User</th><th>Method</th><th>Amount</th><th>TX Hash</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{d.first_name}</div>
                    <div className="text-xs text-muted">{d.username ? `@${d.username}` : `ID: ${d.user_id}`}</div>
                  </td>
                  <td><Badge status={d.method} /></td>
                  <td style={{ color: '#f59e0b', fontWeight: 700 }}>
                    {parseFloat(d.stars_credited).toLocaleString()} ⭐
                    {d.ton_amount && <div className="text-xs text-muted">{d.ton_amount} TON</div>}
                  </td>
                  <td className="text-xs" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.ton_tx_hash ? <span title={d.ton_tx_hash} style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>{d.ton_tx_hash.slice(0, 16)}...</span> : '—'}
                  </td>
                  <td className="text-sm text-muted">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td>
                    {d.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button className="btn btn-success btn-sm" onClick={() => openApprove(d)}>✅ Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(d.id)}>❌</button>
                      </div>
                    ) : <Badge status={d.status} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ========== BROADCAST ==========
function Broadcast() {
  const [form, setForm] = useState({ message_text: '', image_url: '', button_text: '', button_url: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSend = async () => {
    if (!form.message_text) { setMsg('Message is required'); return; }
    if (!window.confirm('Send broadcast to ALL users?')) return;
    setLoading(true);
    try {
      const r = await api.post('/admin/broadcast', form);
      setMsg(`Broadcast started! ID: ${r.data.broadcast_id}`);
      setForm({ message_text: '', image_url: '', button_text: '', button_url: '' });
    } catch (e) { setMsg(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="section-title mb-6">Broadcast Message</div>
      <Alert msg={msg} type={msg.includes('started') ? 'success' : 'error'} />
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="form-group">
          <label className="form-label">Message Text (HTML supported)</label>
          <textarea className="form-input" rows={5} placeholder="<b>Hello!</b> Check out our new cases..." value={form.message_text} onChange={e => setForm(p => ({ ...p, message_text: e.target.value }))} style={{ resize: 'vertical' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Image URL (optional)</label>
          <input className="form-input" placeholder="https://example.com/image.jpg, t.me link, or file_id" value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} />
          {form.image_url ? (
            <div style={{ marginTop: 10 }}>
              <MediaPreview source={form.image_url} alt="broadcast preview" size={72} />
            </div>
          ) : null}
        </div>
        <div className="form-group">
          <label className="form-label">Button Text (optional)</label>
          <input className="form-input" placeholder="Open App" value={form.button_text} onChange={e => setForm(p => ({ ...p, button_text: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Button URL (optional)</label>
          <input className="form-input" placeholder="https://..." value={form.button_url} onChange={e => setForm(p => ({ ...p, button_url: e.target.value }))} />
        </div>
        <button className="btn btn-primary w-full" onClick={handleSend} disabled={loading}>
          {loading ? <><Spinner /> Sending...</> : '📢 Send to All Users'}
        </button>
      </div>
    </div>
  );
}

// ========== SETTINGS ==========
function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/settings').then(r => setSettings(r.data.settings)).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      await api.put('/admin/settings', settings);
      setMsg('Settings saved!');
    } catch (e) { setMsg(e.message); }
  };

  const settingsDef = [
    { key: 'referral_reward_stars', label: 'Stars Per Referral', type: 'number' },
    { key: 'referral_reward_percentage', label: 'Referral Deposit Bonus %', type: 'number' },
    { key: 'ton_to_stars_rate', label: 'TON → Stars Rate (Stars per 1 TON)', type: 'number' },
    { key: 'upgrade_min_value', label: 'Min Upgrade Item Value', type: 'number' },
    { key: 'max_upgrade_chance', label: 'Max Upgrade Chance %', type: 'number' },
    { key: 'min_upgrade_chance', label: 'Min Upgrade Chance %', type: 'number' },
    { key: 'bot_username', label: 'Bot Username', type: 'text' },
    { key: 'webapp_url', label: 'Mini App URL', type: 'text' },
    { key: 'maintenance_mode', label: 'Maintenance Mode (true/false)', type: 'text' },
  ];

  return (
    <div>
      <div className="section-title mb-6">System Settings</div>
      <Alert msg={msg} type={msg.includes('!') ? 'success' : 'error'} />
      {loading ? <LoadingCenter /> : (
        <div className="card" style={{ maxWidth: 560 }}>
          {settingsDef.map(s => (
            <div className="form-group" key={s.key}>
              <label className="form-label">{s.label}</label>
              <input
                className="form-input"
                type={s.type}
                value={settings[s.key] || ''}
                onChange={e => setSettings(p => ({ ...p, [s.key]: e.target.value }))}
              />
            </div>
          ))}
          <button className="btn btn-primary w-full" onClick={handleSave}>💾 Save Settings</button>
        </div>
      )}
    </div>
  );
}

// ========== LOGS ==========
function Logs() {
  const [logs, setLogs] = useState([]);
  const [type, setType] = useState('admin');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/logs', { params: { type } }).then(r => setLogs(r.data.logs)).finally(() => setLoading(false));
  }, [type]);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Logs</div>
        <div className="flex gap-2">
          {['admin', 'case_opens', 'upgrades'].map(t => (
            <button key={t} className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="card">
        {loading ? <LoadingCenter /> : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                {type === 'admin' && <><th>Admin</th><th>Action</th><th>Target</th></>}
                {type === 'case_opens' && <><th>User</th><th>Case</th><th>Reward</th></>}
                {type === 'upgrades' && <><th>User</th><th>Source ⭐</th><th>Target ⭐</th><th>Chance</th><th>Result</th></>}
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td className="text-xs text-muted">{new Date(l.created_at).toLocaleString()}</td>
                  {type === 'admin' && (
                    <><td>{l.first_name}</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{l.action}</td><td className="text-muted text-sm">{l.target_type} #{l.target_id}</td></>
                  )}
                  {type === 'case_opens' && (
                    <><td>{l.first_name} {l.username ? `@${l.username}` : ''}</td><td>{l.case_name}</td><td>{l.reward_name}</td></>
                  )}
                  {type === 'upgrades' && (
                    <><td>{l.first_name}</td><td style={{ color: '#f59e0b' }}>{parseFloat(l.source_value).toLocaleString()}</td><td style={{ color: '#f59e0b' }}>{parseFloat(l.target_value).toLocaleString()}</td><td>{l.win_chance}%</td><td><Badge status={l.result} /></td></>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ========== LOGIN ==========
function Login() {
  const [initData, setInitData] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);

  useEffect(() => {
    const tg = getTelegramWebApp();
    const currentUser = tg?.initDataUnsafe?.user || null;
    setTelegramUser(currentUser);

    const stored = syncAdminInitData();
    setInitData(stored);

    if (currentUser && !isAllowedAdminUser(currentUser)) {
      setError('This Telegram account is not allowed to access admin.');
      return;
    }

    if (stored) {
      handleLogin(stored);
    }
  }, []);

  async function handleLogin(providedInitData) {
    const data = String(providedInitData ?? initData ?? '').trim();
    if (!data) { setError('Access key is missing'); return; }
    if (telegramUser && !isAllowedAdminUser(telegramUser)) {
      setError('This Telegram account is not allowed to access admin.');
      return;
    }
    setLoading(true);
    try {
      if (data !== BROWSER_ADMIN_KEY) {
        localStorage.setItem('admin_init_data', data);
      }
      await api.get('/admin/dashboard');
      window.location.reload();
    } catch (e) {
      if (data !== BROWSER_ADMIN_KEY) localStorage.removeItem('admin_init_data');
      setError('Invalid credentials or not an admin');
    } finally {
      setLoading(false);
    }
  }

  const tg = getTelegramWebApp();
  const detectedUser = telegramUser || tg?.initDataUnsafe?.user || null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div style={{ background: '#161621', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🎁</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>TmuxCase Admin</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {BROWSER_ADMIN_KEY ? 'Browser admin access is enabled' : 'Telegram initData orqali kirish'}
          </div>
        </div>
        <Alert msg={error} type="error" />
        {detectedUser && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.18)', fontSize: 13, lineHeight: 1.5 }}>
            <div><strong>User ID:</strong> {detectedUser.id}</div>
            <div><strong>Username:</strong> @{detectedUser.username || 'no username'}</div>
          </div>
        )}
        {!BROWSER_ADMIN_KEY && (
          <div className="form-group">
            <label className="form-label">Telegram InitData</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="query_id=...&user=...&auth_date=...&hash=..."
              value={initData}
              onChange={e => setInitData(e.target.value)}
              style={{ resize: 'none', fontFamily: 'monospace', fontSize: 11 }}
            />
          </div>
        )}
        {!BROWSER_ADMIN_KEY && (
          <button className="btn btn-primary w-full" onClick={() => handleLogin()} disabled={loading}>
            {loading ? 'Checking...' : 'Login →'}
          </button>
        )}
        <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.6 }}>
          {BROWSER_ADMIN_KEY
            ? 'Admin panel browser access key orqali ochildi.'
            : 'Telegram ichida ochilganda initData avtomatik olinadi.<br/>Ruxsat faqat ADMIN_IDS ga mos bo‘lsa beriladi.'}
        </div>
      </div>
    </div>
  );
}

// ========== SIDEBAR ==========
function Sidebar() {
  const handleLogout = () => { localStorage.removeItem('admin_init_data'); window.location.reload(); };
  const navItems = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { section: 'Management' },
    { to: '/users', label: 'Users', icon: '👥' },
    { to: '/cases', label: 'Cases', icon: '🎁' },
    { section: 'Operations' },
    { to: '/withdrawals', label: 'Withdrawals', icon: '📤' },
    { to: '/deposits', label: 'Deposits', icon: '💰' },
    { section: 'Tools' },
    { to: '/broadcast', label: 'Broadcast', icon: '📢' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
    { to: '/logs', label: 'Logs', icon: '📜' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🎁</div>
        <div className="sidebar-logo-text">TmuxCase</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section">{item.section}</div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {item.icon} {item.label}
            </NavLink>
          )
        )}
      </nav>
      <div style={{ padding: 12 }}>
        <button className="btn btn-secondary" style={{ width: '100%', fontSize: 12 }} onClick={handleLogout}>🚪 Logout</button>
      </div>
    </div>
  );
}

// ========== PAGE WRAPPER ==========
function PageWrapper({ title, children }) {
  return (
    <div className="main-content">
      <div className="topbar">
        <div className="page-title">{title}</div>
      </div>
      <div className="content-area">{children}</div>
    </div>
  );
}

// ========== APP ==========
export default function App() {
  try {
    const tg = getTelegramWebApp();
    if (tg?.initData && tg.initData.length > 0) {
      localStorage.setItem('admin_init_data', tg.initData);
      tg.ready();
      tg.expand();
    }
  } catch (e) {}

  const [authed, setAuthed] = useState(!!syncAdminInitData() || !!BROWSER_ADMIN_KEY);

  useEffect(() => {
    const check = async () => {
      if (BROWSER_ADMIN_KEY) {
        setAuthed(true);
        return;
      }
      if (!syncAdminInitData()) { setAuthed(false); return; }
      try {
        await api.get('/admin/dashboard');
        setAuthed(true);
      } catch { localStorage.removeItem('admin_init_data'); setAuthed(false); }
    };
    check();
  }, []);

  if (!authed) return (
    <>
      <style>{styles}</style>
      <Login />
    </>
  );

  return (
    <BrowserRouter basename="/admin">
      <style>{styles}</style>
      <div className="admin-layout">
        <Sidebar />
        <Routes>
          <Route path="/" element={<PageWrapper title="Dashboard"><Dashboard /></PageWrapper>} />
          <Route path="/users" element={<PageWrapper title="Users"><Users /></PageWrapper>} />
          <Route path="/cases" element={<PageWrapper title="Cases"><CasesManager /></PageWrapper>} />
          <Route path="/withdrawals" element={<PageWrapper title="Withdrawals"><Withdrawals /></PageWrapper>} />
          <Route path="/deposits" element={<PageWrapper title="Deposits"><Deposits /></PageWrapper>} />
          <Route path="/broadcast" element={<PageWrapper title="Broadcast"><Broadcast /></PageWrapper>} />
          <Route path="/settings" element={<PageWrapper title="Settings"><Settings /></PageWrapper>} />
          <Route path="/logs" element={<PageWrapper title="Logs"><Logs /></PageWrapper>} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
