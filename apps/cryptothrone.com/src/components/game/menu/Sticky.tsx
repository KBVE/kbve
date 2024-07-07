import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  EventEmitter,
  type PlayerEventData,
  playerData,
  quest,
  itemStore,
  type ItemActionEventData,
  getItemDetails,
} from '@kbve/laser';

const renderTooltip = (
  itemId: string,
  tooltipPosition: { x: number; y: number },
) => (
  <div
    style={{ top: tooltipPosition.y, left: tooltipPosition.x }}
    className="absolute bg-gray-700 text-white p-2 rounded shadow-lg z-50"
  >
    <p className="text-sm">Actions:</p>
    <ul className="text-xs">
      <li
        onClick={() => handleItemAction(itemId, 'consume')}
        className="cursor-pointer hover:bg-gray-600"
      >
        Consume
      </li>
      <li
        onClick={() => handleItemAction(itemId, 'equip')}
        className="cursor-pointer hover:bg-gray-600"
      >
        Equip
      </li>
      <li
        onClick={() => handleItemAction(itemId, 'unequip')}
        className="cursor-pointer hover:bg-gray-600"
      >
        Unequip
      </li>
      <li
        onClick={() => handleItemAction(itemId, 'discard')}
        className="cursor-pointer hover:bg-gray-600"
      >
        Discard
      </li>
      <li
        onClick={() => handleItemAction(itemId, 'view')}
        className="cursor-pointer hover:bg-gray-600"
      >
        View
      </li>
    </ul>
  </div>
);

const renderEquipment = (
  itemId: string | null,
  showTooltip: (itemId: string, event: React.MouseEvent) => void,
  hideTooltip: () => void,
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
    >
      {item.name} ({item.type}) - Bonuses: {JSON.stringify(item.bonuses)} -
      Durability: {item.durability} - Weight: {item.weight}
    </li>
  ) : null;
};

const handleItemAction = (
  itemId: string,
  action: 'consume' | 'equip' | 'unequip' | 'discard' | 'view',
) => {
  const item = getItemDetails(itemId);
  if (item) {
    EventEmitter.emit('itemAction', { itemId: item.id, action });
  }
};

const StickySidebar: React.FC = () => {
  const _playerStore$ = useStore(playerData);
  const _quest$ = useStore(quest);
  const _itemStore$ = useStore(itemStore);

  const [tooltipItemId, setTooltipItemId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

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
    setTooltipPosition({ x: event.clientX + 10, y: event.clientY + 10 });
  };

  const hideTooltip = () => {
    setTooltipItemId(null);
  };

  // Check if _playerStore$ is defined and has stats
  if (!_playerStore$ || !_playerStore$.stats) {
    return null; // Or render a loading state
  }

  return (
    <div className="transition ease-in-out duration-500 opacity-50 hover:opacity-100 fixed top-12 left-0 transform translate-y-12 translate-x-10 w-[350px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-20">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Stats</h2>
        <p className="text-sm text-green-400">{`HP: ${_playerStore$.stats.health || '0'} / ${_playerStore$.stats.maxHealth}`}</p>
        <p className="text-sm text-blue-400">{`MP: ${_playerStore$.stats.mana || '0'} / ${_playerStore$.stats.maxMana}`}</p>
        <p className="text-sm text-yellow-400">{`EP: ${_playerStore$.stats.energy || '0'} / ${_playerStore$.stats.maxEnergy}`}</p>
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
        <ul>
          {_playerStore$.inventory.backpack.map((itemId, index) => {
            const item = getItemDetails(itemId);
            return item ? (
              <li
                key={index}
                className="text-sm relative"
                onMouseEnter={(e) => showTooltip(item.id, e)}
                onMouseLeave={hideTooltip}
              >
                {item.name} ({item.type}) - Durability: {item.durability} -
                Weight: {item.weight}
              </li>
            ) : null;
          })}
        </ul>
      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Equipment</h2>
        <ul>
          {renderEquipment(
            _playerStore$.inventory.equipment.head,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.body,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.legs,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.feet,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.hands,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.weapon,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.shield,
            showTooltip,
            hideTooltip,
          )}
          {renderEquipment(
            _playerStore$.inventory.equipment.accessory,
            showTooltip,
            hideTooltip,
          )}
        </ul>
      </div>
      {tooltipItemId && renderTooltip(tooltipItemId, tooltipPosition)}
    </div>
  );
};

export default StickySidebar;
