import React, { useState } from 'react';
import ProfileSettings from './ProfileSettings.jsx';
import TtsSettings from './TtsSettings.jsx';

const TABS = [
  { key: 'profile', label: '个人信息' },
  { key: 'tts', label: '播报设置' }
];

export default function SettingsPage({ settings, onChange, user, onUpdateCategories, onUpdateProfile, onChangePassword, voices = [] }) {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="shrink-0 lg:w-48">
        <nav className="space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium ${
                activeTab === tab.key
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        {activeTab === 'profile' && (
          <ProfileSettings user={user} onUpdateCategories={onUpdateCategories}
            onUpdateProfile={onUpdateProfile} onChangePassword={onChangePassword} />
        )}
        {activeTab === 'tts' && (
          <TtsSettings settings={settings} onChange={onChange} voices={voices} />
        )}
      </div>
    </div>
  );
}
