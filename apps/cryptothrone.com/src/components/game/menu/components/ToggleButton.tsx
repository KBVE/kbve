import React from 'react';
import * as Laser from '@kbve/laser';

const ToggleButton: React.FC<{
  settingKey: keyof Laser.UserSettings;
  label: string;
  collapseIcon?: React.ElementType;
  expandIcon?: React.ElementType;
}> = ({
  settingKey,
  label,
  collapseIcon: Collapse = Laser.CollapseIcon,
  expandIcon: Expand = Laser.ExpandIcon,
}) => {
  const isCollapsed = Laser.getUserSetting(settingKey);
  const toggleSetting = () => Laser.setUserSetting(settingKey, !isCollapsed);
  
  return (
    <button onClick={toggleSetting} className="bg-yellow-500 text-white text-sm p-2 rounded ml-2 flex items-center w-24 h-10">
      {isCollapsed ? <Expand className="w-2" /> : <Collapse className="w-4" />}
      <span className="ml-2">{label}</span>
    </button>
  );
};

export default ToggleButton;
