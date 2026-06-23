import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 30000,
});

function getTelegramInitData() {
  try { return window.Telegram?.WebApp?.initData || ''; } catch { return ''; }
}

api.interceptors.request.use(cfg => {
  const initData = getTelegramInitData();
  if (initData) cfg.headers['X-Init-Data'] = initData;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export const casesApi = {
  getAll: () => api.get('/cases').then(r => r.data),
  getById: (id) => api.get(`/cases/${id}`).then(r => r.data),
  open: (id, demo = false) => api.post(demo ? `/cases/${id}/demo` : `/cases/${id}/open`).then(r => r.data),
  getEligibility: (id) => api.get(`/cases/${id}/eligibility`).then(r => r.data),
  validatePromo: (code) => api.get(`/promo/${code}/validate`).then(r => r.data),
  openPromo: (code) => api.post('/promo/open', { code }).then(r => r.data),
};

export const inventoryApi = {
  getAll: () => api.get('/inventory').then(r => r.data),
  sell: (id) => api.post(`/inventory/${id}/sell`).then(r => r.data),
  withdraw: (id) => api.post(`/inventory/${id}/withdraw`).then(r => r.data),
};

export const gamesApi = {
  getUpgradeItems: () => api.get('/games/upgrade/items').then(r => r.data),
  getUpgradeChance: (srcId, tgtId) => api.get(`/games/upgrade/chance/${srcId}/${tgtId}`).then(r => r.data),
  performUpgrade: (data) => api.post('/games/upgrade', data).then(r => r.data),
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
  approveDeposit: (id, data) => api.post(`/admin/deposits/${id}/approve`, data).then(r => r.data),
  rejectDeposit: (id) => api.post(`/admin/deposits/${id}/reject`).then(r => r.data),
  sendBroadcast: (data) => api.post('/admin/broadcast', data).then(r => r.data),
  broadcastStars: (data) => api.post('/admin/broadcast/stars', data).then(r => r.data),
  getSettings: () => api.get('/admin/settings').then(r => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then(r => r.data),
  getLogs: (type) => api.get('/admin/logs', { params: { type } }).then(r => r.data),
  getPromoCodes: () => api.get('/admin/promo').then(r => r.data),
  createPromoCode: (data) => api.post('/admin/promo', data).then(r => r.data),
  deletePromoCode: (id) => api.delete(`/admin/promo/${id}`).then(r => r.data),
};

export default api;
