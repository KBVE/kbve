import React from 'react';
import {type UserSettings, CollapseIcon, ExpandIcon, getUserSetting, setUserSetting } from '@kbve/laser';

const ToggleButton: React.FC<{
  settingKey: keyof UserSettings;
  label: string;
  collapseIcon?: React.ElementType;
  expandIcon?: React.ElementType;
}> = ({
  settingKey,
  label,
  collapseIcon: Collapse = CollapseIcon,
  expandIcon: Expand = ExpandIcon,
}) => {
  const isCollapsed = getUserSetting(settingKey);
  const toggleSetting = () => setUserSetting(settingKey, !isCollapsed);
  
  return (
    <button onClick={toggleSetting} className="bg-yellow-500 text-white text-sm p-2 rounded ml-2 flex items-center w-20 h-10">
      {isCollapsed ? <Expand className="w-2" /> : <Collapse className="w-4" />}
      <span className="ml-2 text-xs">{label}</span>
    </button>
  );
};

export default ToggleButton;
