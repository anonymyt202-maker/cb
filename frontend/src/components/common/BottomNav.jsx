import React from 'react';

const tabs = [
  { id: 'cases', label: 'Cases', icon: '🎁' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'inventory', label: 'Inventory', icon: '🎒' },
  { id: 'referrals', label: 'Referrals', icon: '👥' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`nav-item ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </div>
      ))}
    </nav>
  );
}
