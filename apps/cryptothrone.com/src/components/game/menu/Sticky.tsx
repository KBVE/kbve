import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  EventEmitter,
  type PlayerEventData,
  playerData,
  quest,
  itemStore,
  type IPlayerInventory,
  type ItemActionEventData,
  type IEquipment,
  type IObjectAction,
  type ItemAction,
  type IconProps,
  CollapseIcon,
  ExpandIcon,
  settings,
  getUserSetting,
  setUserSetting,
  getItemDetails,
  getActionEvents,
} from '@kbve/laser';

const renderTooltip = (
  itemId: string,
  tooltipPosition: { x: number; y: number },
) => {
  const item = getItemDetails(itemId);
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
  equipment: Record<keyof IPlayerInventory['equipment'], string | null>,
  showTooltip: (itemId: string, event: React.MouseEvent) => void,
  hideTooltip: () => void,
  handleItemClick: (itemId: string, event: React.MouseEvent) => void,
) => {
  return (
    <ul className="grid grid-cols-8 gap-2">
      {Object.keys(equipment).map((key) => {
        const itemId = equipment[key as keyof IPlayerInventory['equipment']];
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
  const item = getItemDetails(itemId);
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
        const item = getItemDetails(itemId);
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

const StickySidebar: React.FC = () => {
  const _playerStore$ = useStore(playerData);
  const userSettings = useStore(settings);
  const _quest$ = useStore(quest);
  const _itemStore$ = useStore(itemStore);

  const [tooltipItemId, setTooltipItemId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  const [submenuItemId, setSubmenuItemId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const handlePlayerData = (data?: PlayerEventData) => {
      if (data) {
        // $playerStore.set(data);
      }
    };

    EventEmitter.on('playerEvent', handlePlayerData);
    return () => {
      EventEmitter.off('playerEvent', handlePlayerData);
    };
  }, []);

  const showTooltip = (itemId: string, event: React.MouseEvent) => {
    setTooltipItemId(itemId);
    setTooltipPosition({ x: event.clientX + 10, y: event.clientY - 100 });
  };

  const hideTooltip = () => {
    setTooltipItemId(null);
  };

  const handleItemClick = (itemId: string, event: React.MouseEvent) => {
    setSubmenuItemId(itemId);
    setSubmenuPosition({ x: event.clientX, y: event.clientY - 100 });
  };

  const closeSubmenu = () => {
    setSubmenuItemId(null);
  };

  const handleItemAction = (
    itemId: string,
    action: ItemAction['actionEvent'],
  ) => {
    const item = getItemDetails(itemId);
    if (item) {
      const eventData: ItemActionEventData = {
        itemId: item.id,
        action: action,
      };
      EventEmitter.emit('itemAction', eventData);
      closeSubmenu();
    }
  };

  // Check if _playerStore$ is defined and has stats
  if (!_playerStore$ || !_playerStore$.stats) {
    return null; // Or render a loading state
  }

  // Get action events dynamically
  const actions = submenuItemId ? getActionEvents(submenuItemId) : [];

  return (
    <div className="fixed top-24 left-3 w-[350px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-20 transition transform ease-in-out duration-500 opacity-50 hover:opacity-100">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="bg-yellow-500 text-white p-2 rounded"
      >
        {isCollapsed ? <ExpandIcon styleClass='w-8' /> : <CollapseIcon styleClass='w-8' />}
      </button>
      {!isCollapsed && (
        <div className={`transition transform duration-1000 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0' : 'max-h-screen'
        }`}>
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Stats</h2>
            <p className="text-sm text-green-400">{`HP: ${
              _playerStore$.stats.health || '0'
            } / ${_playerStore$.stats.maxHealth}`}</p>
            <p className="text-sm text-blue-400">{`MP: ${
              _playerStore$.stats.mana || '0'
            } / ${_playerStore$.stats.maxMana}`}</p>
            <p className="text-sm text-yellow-400">{`EP: ${
              _playerStore$.stats.energy || '0'
            } / ${_playerStore$.stats.maxEnergy}`}</p>
          </div>
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
          {tooltipItemId && renderTooltip(tooltipItemId, tooltipPosition)}
          {submenuItemId && (
            <div
              style={{ top: submenuPosition.y, left: submenuPosition.x }}
              className="absolute bg-gray-700 text-white p-2 rounded shadow-lg z-50"
            >
              {/* Close button at the top */}
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
                    onClick={() => handleItemAction(submenuItemId, event)}
                    className="cursor-pointer hover:bg-gray-600"
                  >
                    {event.charAt(0).toUpperCase() + event.slice(1)}
                  </li>
                ))}
                {/* Close option at the bottom */}
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
      )}
    </div>
  );
};

export default StickySidebar;
