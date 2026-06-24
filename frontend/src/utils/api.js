import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ── Anti multi-account: barqaror device fingerprint ────────────────────────
// Talab: "Multi acc dan himoya ip logger 1 ta device orqali 1 ta akk ishlaydi".
// Telegram WebApp localStorage odatda shu WebView/akkaunt sessiyasiga bog'liq
// bo'lib qoladi, shu sababli bu ID bir xil qurilma+akkountda barqaror turadi.
function getOrCreateDeviceId() {
  const KEY = 'tcb_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage mavjud bo'lmasa (private mode va h.k.), sessiya davomida barqaror bo'lgan ID
    if (!window.__tcbDeviceId) {
      window.__tcbDeviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    }
    return window.__tcbDeviceId;
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Attach Telegram WebApp initData + device fingerprint to every request
api.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    config.headers['X-Init-Data'] = tg.initData;
  }
  config.headers['X-Device-Id'] = getOrCreateDeviceId();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.banned || error.response?.data?.reason === 'multi_account') {
      const message = error.response?.data?.reason === 'multi_account'
        ? "🚫 Akkountingiz bloklandi: bu qurilmada allaqachon boshqa akkount ro'yxatdan o'tgan."
        : '🚫 Akkountingiz bloklangan (banned).';
      return Promise.reject(new Error(message));
    }
    const message = error.response?.data?.error || 'Network error occurred';
    return Promise.reject(new Error(message));
  }
);

export const userApi = {
  getMe: () => api.get('/user/me').then(r => r.data),
  getBalance: () => api.get('/user/balance').then(r => r.data),
  getTransactions: () => api.get('/transactions').then(r => r.data),
};

export const casesApi = {
  getAll: () => api.get('/cases').then(r => r.data),
  getById: (id) => api.get(`/cases/${id}`).then(r => r.data),
  open: (id) => api.post(`/cases/${id}/open`).then(r => r.data),
  getEligibility: (id) => api.get(`/cases/${id}/eligibility`).then(r => r.data),
  checkPromoCode: (code) => api.get(`/cases/promo/${encodeURIComponent(code)}/check`).then(r => r.data),
  openPromoCode: (code) => api.post(`/cases/promo/${encodeURIComponent(code)}/open`).then(r => r.data),
};

export const inventoryApi = {
  getAll: (type) => api.get('/inventory', { params: { type } }).then(r => r.data),
  sell: (id) => api.post(`/inventory/${id}/sell`).then(r => r.data),
  withdraw: (id) => api.post(`/inventory/${id}/withdraw`).then(r => r.data),
};

export const gamesApi = {
  getUpgradeItems: () => api.get('/games/upgrade/items').then(r => r.data),
  getUpgradeChance: (srcId, tgtId) => api.get(`/games/upgrade/chance/${srcId}/${tgtId}`).then(r => r.data),
  performUpgrade: (data) => api.post('/games/upgrade', data).then(r => r.data),
  getActiveMines: () => api.get('/games/mines/active').then(r => r.data),
  startMines: (data) => api.post('/games/mines/start', data).then(r => r.data),
  revealMinesCell: (data) => api.post('/games/mines/reveal', data).then(r => r.data),
  cashoutMines: (game_id) => api.post('/games/mines/cashout', { game_id }).then(r => r.data),
};

export const referralsApi = {
  getInfo: () => api.get('/referrals').then(r => r.data),
};

export const depositsApi = {
  submitTon: (data) => api.post('/deposit/ton', data).then(r => r.data),
  getHistory: () => api.get('/deposit/history').then(r => r.data),
  createStarsInvoice: (amount) => api.post('/deposit/stars/invoice', { amount }).then(r => r.data),
};

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard').then(r => r.data),
  getUsers: (params) => api.get('/admin/users', { params }).then(r => r.data),
  getUser: (id) => api.get(`/admin/users/${id}`).then(r => r.data),
  banUser: (id) => api.post(`/admin/users/${id}/ban`).then(r => r.data),
  unbanUser: (id) => api.post(`/admin/users/${id}/unban`).then(r => r.data),
  adjustBalance: (id, data) => api.post(`/admin/users/${id}/balance`, data).then(r => r.data),

  getCases: () => api.get('/admin/cases').then(r => r.data),
  createCase: (data) => api.post('/admin/cases', data).then(r => r.data),
  updateCase: (id, data) => api.put(`/admin/cases/${id}`, data).then(r => r.data),
  deleteCase: (id) => api.delete(`/admin/cases/${id}`).then(r => r.data),

  getCaseRewards: (caseId) => api.get(`/admin/cases/${caseId}/rewards`).then(r => r.data),
  createReward: (data) => api.post('/admin/rewards', data).then(r => r.data),
  updateReward: (id, data) => api.put(`/admin/rewards/${id}`, data).then(r => r.data),
  deleteReward: (id) => api.delete(`/admin/rewards/${id}`).then(r => r.data),

  getWithdrawals: (status) => api.get('/admin/withdrawals', { params: { status } }).then(r => r.data),
  approveWithdrawal: (id, data) => api.post(`/admin/withdrawals/${id}/approve`, data).then(r => r.data),
  rejectWithdrawal: (id, data) => api.post(`/admin/withdrawals/${id}/reject`, data).then(r => r.data),

  getDeposits: (status) => api.get('/admin/deposits', { params: { status } }).then(r => r.data),
  approveDeposit: (id) => api.post(`/admin/deposits/${id}/approve`).then(r => r.data),
  rejectDeposit: (id) => api.post(`/admin/deposits/${id}/reject`).then(r => r.data),

  sendBroadcast: (data) => api.post('/admin/broadcast', data).then(r => r.data),
  getSettings: () => api.get('/admin/settings').then(r => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then(r => r.data),
  getLogs: (type) => api.get('/admin/logs', { params: { type } }).then(r => r.data),
};

export default api;
