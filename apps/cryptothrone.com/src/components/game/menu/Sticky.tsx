import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import * as Laser from '@kbve/laser';
import ToggleButton from './components/ToggleButton';
import StatsSection from './components/StatsSection';
import UserSettingsToggleSwitch from './components/UserSettingsToggleSwitch';

const renderTooltip = (
  itemId: string,
  tooltipPosition: { x: number; y: number },
) => {
  const item = Laser.getItemDetails(itemId);
  if (!item) {
    return null;
  }

  return (
    <div
      style={{ top: tooltipPosition.y, left: tooltipPosition.x }}
      className="absolute bg-gray-700 text-white p-2 rounded shadow-lg z-50"
    >
      <p className="text-sm font-semibold">{item.name}</p>
      <p className="text-xs">Type: {item.type}</p>
      <p className="text-xs">Bonuses: {JSON.stringify(item.bonuses)}</p>
      <p className="text-xs">Durability: {item.durability}</p>
      <p className="text-xs">Weight: {item.weight}</p>
    </div>
  );
};

const renderAllEquipment = (
  equipment: Record<keyof Laser.IPlayerInventory['equipment'], string | null>,
  showTooltip: (itemId: string, event: React.MouseEvent) => void,
  hideTooltip: () => void,
  handleItemClick: (itemId: string, event: React.MouseEvent) => void,
) => {
  return (
    <ul className="grid grid-cols-8 gap-2">
      {Object.keys(equipment).map((key) => {
        const itemId = equipment[key as keyof Laser.IPlayerInventory['equipment']];
        return renderEquipment(
          itemId,
          showTooltip,
          hideTooltip,
          handleItemClick,
        );
      })}
    </ul>
  );
};

const renderEquipment = (
  itemId: string | null,
  showTooltip: (itemId: string, event: React.MouseEvent) => void,
  hideTooltip: () => void,
  handleItemClick: (itemId: string, event: React.MouseEvent) => void,
) => {
  if (!itemId) {
    return (
      <li
        key={`empty-${Math.random()}`}
        className="text-sm relative flex items-center justify-center border border-gray-500 bg-gray-200"
        style={{ width: '32px', height: '32px' }}
      ></li>
    );
  }
  const item = Laser.getItemDetails(itemId);
  return item ? (
    <li
      key={item.id}
      className="text-sm relative"
      onMouseEnter={(e) => showTooltip(item.id, e)}
      onMouseLeave={hideTooltip}
      onClick={(e) => handleItemClick(item.id, e)}
    >
      {item.name} ({item.type}) - Bonuses: {JSON.stringify(item.bonuses)} -
      Durability: {item.durability} - Weight: {item.weight}
    </li>
  ) : null;
};

const renderInventory = (
  backpack: string[],
  showTooltip: (itemId: string, event: React.MouseEvent) => void,
  hideTooltip: () => void,
  handleItemClick: (itemId: string, event: React.MouseEvent) => void,
) => {
  return (
    <ul className="grid grid-cols-8 gap-1">
      {backpack.map((itemId, index) => {
        const item = Laser.getItemDetails(itemId);
        return item ? (
          <li
            key={index}
            className="text-sm relative hover:scale-[1.3] transition ease-in-out duration-100"
            onMouseEnter={(e) => showTooltip(item.id, e)}
            onMouseLeave={hideTooltip}
            onClick={(e) => handleItemClick(item.id, e)}
          >
            <img
              src={item.img}
              alt={item.name}
              style={{ width: '32px', height: '32px' }}
              className="inline-block border border-yellow-400/50"
            />
          </li>
        ) : null;
      })}
    </ul>
  );
};

const SettingsPanel: React.FC = () => {
  return (
    <div className="transition transform duration-1000 ease-in-out">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Settings</h2>
        <p className="text-sm">Additional settings can go here.</p>
        <UserSettingsToggleSwitch settingKey="debugMode" label="Debug Mode" />
      </div>
    </div>
  );
};

const StickySidebar: React.FC = () => {
  const _playerStore$ = useStore(Laser.playerData);
  const userSettings = useStore(Laser.settings);
  const _quest$ = useStore(Laser.quest);
  const _itemStore$ = useStore(Laser.itemStore);

  useEffect(() => {
    const handlePlayerData = (data?: Laser.PlayerEventData) => {
      if (data) {
        // $playerStore.set(data);
      }
    };

    Laser.EventEmitter.on('playerEvent', handlePlayerData);
    return () => {
      Laser.EventEmitter.off('playerEvent', handlePlayerData);
    };
  }, []);

  const showTooltip = (itemId: string, event: React.MouseEvent) => {
    Laser.setUserSetting('tooltipItem', {
      id: itemId,
      position: { x: event.clientX + 10, y: event.clientY - 150 },
    });
  };

  const hideTooltip = () => {
    Laser.setUserSetting('tooltipItem', {
      ...Laser.getUserSetting('tooltipItem'),
      id: null,
    });
  };

  const handleItemClick = (itemId: string, event: React.MouseEvent) => {
    Laser.setUserSetting('submenuItem', {
      id: itemId,
      position: { x: event.clientX, y: event.clientY - 150 },
    });
  };

  const closeSubmenu = () => {
    Laser.setUserSetting('submenuItem', {
      ...Laser.getUserSetting('submenuItem'),
      id: null,
    });
  };

  const handleItemAction = (
    itemId: string,
    action: Laser.ItemAction['actionEvent'],
  ) => {
    const item = Laser.getItemDetails(itemId);
    if (item) {
      const eventData: Laser.ItemActionEventData = {
        itemId: item.id,
        action: action,
      };
     Laser.EventEmitter.emit('itemAction', eventData);
      closeSubmenu();
    }
  };

  if (!_playerStore$ || !_playerStore$.stats) {
    // Check if _playerStore$ is defined and has stats
    return null; // Or render a loading state
  }

  const submenuItem = Laser.getUserSetting('submenuItem');
  const actions = submenuItem.id ? Laser.getActionEvents(submenuItem.id) : [];

  const tooltipItem = Laser.getUserSetting('tooltipItem');

  return (
    <div className="fixed top-24 left-3 w-[350px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-20 transition transform ease-in-out duration-500 opacity-50 hover:opacity-100">
      
      <div className="flex flex-row space-y-2 align-top">
      <ToggleButton settingKey="isStatsMenuCollapsed" label="Stats" />
      <ToggleButton settingKey="isSettingsMenuCollapsed" label="Settings" />
      </div>

      <div
  className={`transition transform duration-1000 ease-in-out ${Laser.getUserSetting('isSettingsMenuCollapsed') ? 'max-h-0 overflow-hidden' : 'max-h-screen'}`}
>
  <SettingsPanel />
</div>

      <div
        className={`transition transform duration-1000 ease-in-out ${Laser.getUserSetting('isStatsMenuCollapsed') ? 'max-h-0 overflow-hidden' : 'max-h-screen'}`}
      >
               <StatsSection stats={_playerStore$.stats} />
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">User Information</h2>
          <p className="text-sm">{_playerStore$.stats.username || 'Guest'}</p>
        </div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">General Information</h2>
          <p className="text-sm">{``}</p>
        </div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Inventory</h2>
          {renderInventory(
            _playerStore$.inventory.backpack,
            showTooltip,
            hideTooltip,
            handleItemClick,
          )}
        </div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Equipment</h2>
          {renderAllEquipment(
            _playerStore$.inventory.equipment,
            showTooltip,
            hideTooltip,
            handleItemClick,
          )}
        </div>
        {tooltipItem.id && renderTooltip(tooltipItem.id, tooltipItem.position)}
        {submenuItem.id && (
          <div
            style={{
              top: submenuItem.position.y,
              left: submenuItem.position.x,
            }}
            className="absolute bg-gray-700 text-white p-2 rounded shadow-lg z-50"
          >
            <button
              onClick={closeSubmenu}
              className="absolute top-1 right-1 translate-x-6 bg-yellow-400 p-1 text-white hover:text-gray-400"
            >
              X
            </button>
            <p className="text-sm strong">Actions:</p>
            <ul className="text-xs">
              {actions.map((event) => (
                <li
                  key={event}
                  onClick={() =>
                    submenuItem.id && handleItemAction(submenuItem.id, event)
                  }
                  className="cursor-pointer hover:bg-gray-600"
                >
                  {event.charAt(0).toUpperCase() + event.slice(1)}
                </li>
              ))}
              <li
                onClick={closeSubmenu}
                className="cursor-pointer hover:bg-gray-600"
              >
                Close
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default StickySidebar;
