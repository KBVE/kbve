// components/ToggleSwitch.tsx
import React from 'react';
import * as Laser from '@kbve/laser';

interface ToggleSwitchProps {
  settingKey: keyof Laser.UserSettings;
  label: string;
}

const UserSettingsToggleSwitch: React.FC<ToggleSwitchProps> = ({ settingKey, label }) => {
  const isEnabled = Laser.getUserSetting(settingKey) as boolean;

  const handleToggle = () => {
    Laser.setUserSetting(settingKey, !isEnabled);
  };

  return (
    <label className="flex items-center cursor-pointer">
      <span className="mr-2 text-sm">{label}</span>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={isEnabled}
          onChange={handleToggle}
        />
        <div className="w-10 h-4 bg-gray-400 rounded-full shadow-inner"></div>
        <div
          className={`absolute w-6 h-6 bg-white opacity-75 rounded-full shadow -left-1 -top-1 transition-transform ${
            isEnabled ? 'transform translate-x-full bg-yellow-500 !opacity-100' : ''
          }`}
        ></div>
      </div>
    </label>
  );
};

export default UserSettingsToggleSwitch;
