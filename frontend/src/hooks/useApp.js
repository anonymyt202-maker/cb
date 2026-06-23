import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { userApi } from 'utils/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const data = await userApi.getBalance();
      setBalance(parseFloat(data.balance || 0));
    } catch (e) {}
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize Telegram WebApp
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
          tg.setHeaderColor('#0a0a0f');
          tg.setBackgroundColor('#0a0a0f');
        }

        const data = await userApi.getMe();
        setUser(data.user);
        setBalance(parseFloat(data.user.stars_balance || 0));
      } catch (e) {
        // Auth xatosini toast sifatida ko'rsatmaymiz — foydalanuvchi botdan kirishi kerak
        console.error('Init error:', e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  return (
    <AppContext.Provider value={{ user, balance, setBalance, loading, showToast, refreshBalance }}>
      {children}
      <ToastContainer toasts={toasts} />
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' && '✅'}
          {toast.type === 'error' && '❌'}
          {toast.type === 'info' && 'ℹ️'}
          {toast.message}
        </div>
      ))}
    </div>
  );
}
