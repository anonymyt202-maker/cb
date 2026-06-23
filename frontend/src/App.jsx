import React, { useState } from 'react';
import './styles/global.css';
import { AppProvider, useApp } from './hooks/useApp';
import Header from './components/common/Header';
import BottomNav from './components/common/BottomNav';
import CasesPage from './pages/CasesPage';
import GamesPage from './pages/GamesPage';
import InventoryPage from './pages/InventoryPage';
import ReferralsPage from './pages/ReferralsPage';
import DepositPage from './pages/DepositPage';

function AppContent() {
  const { loading } = useApp();
  const [activePage, setActivePage] = useState('cases');
  const [showDeposit, setShowDeposit] = useState(false);

  if (loading) {
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎁</div>
        <div className="spinner" />
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 12 }}>Loading TmuxCase...</div>
      </div>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case 'cases': return <CasesPage />;
      case 'games': return <GamesPage />;
      case 'inventory': return <InventoryPage />;
      case 'referrals': return <ReferralsPage />;
      default: return <CasesPage />;
    }
  };

  return (
    <div className="app-container">
      <div className="animated-bg" />
      <Header
        onDepositClick={() => setShowDeposit(true)}
        onProfileClick={() => {}}
      />
      <main className="page-content">
        {renderPage()}
      </main>
      <BottomNav active={activePage} onChange={setActivePage} />
      {showDeposit && <DepositPage onClose={() => setShowDeposit(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
