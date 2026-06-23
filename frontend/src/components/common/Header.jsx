import React from 'react';
import { useApp } from 'hooks/useApp';

export default function Header({ onDepositClick, onProfileClick }) {
  const { user, balance } = useApp();

  const displayBalance = () => {
    if (balance >= 1000000) return `${(balance / 1000000).toFixed(1)}M`;
    if (balance >= 1000) return `${(balance / 1000).toFixed(1)}K`;
    return Math.floor(balance).toLocaleString();
  };

  const getInitials = () => {
    if (!user) return '?';
    return (user.first_name?.[0] || '').toUpperCase();
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">🎁</div>
        <span className="header-title">TmuxCase</span>
      </div>
      <div className="header-right">
        <div className="balance-badge" onClick={onDepositClick}>
          <div className="plus-btn">+</div>
          <span className="balance-value">{displayBalance()}</span>
          <span className="star-icon">⭐</span>
        </div>
        <div className="avatar" onClick={onProfileClick}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="avatar" />
          ) : (
            getInitials()
          )}
        </div>
      </div>
    </header>
  );
}
