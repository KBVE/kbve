import React, {useEffect} from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { EventEmitter, type PlayerEventData, playerData, quest, itemStore } from '@kbve/laser';


const StickySidebar: React.FC = () => {
  const _playerStore$ = useStore(playerData);
  const _quest$ = useStore(quest);
  const _itemStore$ = useStore(itemStore);


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

  const getItemDetails = (itemId: string) => {
    return _itemStore$[itemId];
  };

  const renderEquipment = (itemId: string | null) => {
    if (!itemId) return null;
    const item = getItemDetails(itemId);
    return item ? (
      <li key={item.id} className="text-sm">
        {item.name} ({item.type}) - Bonuses: {JSON.stringify(item.bonuses)} - Durability: {item.durability} - Weight: {item.weight}
      </li>
    ) : null;
  };


  return (
    <div className="transition ease-in-out duration-500 fixed top-12 left-0 transform translate-y-12 translate-x-10 w-[300px] p-4 bg-zinc-800 opacity-50 hover:opacity-100 text-yellow-400 border border-yellow-300 rounded-lg z-50">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Stats</h2>
        <p className="text-sm text-green-400">{`HP: ${_playerStore$.stats.health || '0'} / ${_playerStore$.stats.maxHealth}`}</p>
        <p className="text-sm text-blue-400">{`MP: ${_playerStore$.stats.mana || '0'} / ${_playerStore$.stats.maxMana}`}</p>
        <p className="text-sm text-yellow-400">{`EP: ${_playerStore$.stats.energy || '0'} / ${_playerStore$.stats.maxEnergy}`}</p>


      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">User Information</h2>
        <p className="text-sm">{_playerStore$.stats.username ||  'Guest'}</p>
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
              <li key={index} className="text-sm">
                {item.name} ({item.type}) - Durability: {item.durability} - Weight: {item.weight}
              </li>
            ) : null;
          })}
        </ul>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Equipment</h2>
        <ul>
          {renderEquipment(_playerStore$.inventory.equipment.head)}
          {renderEquipment(_playerStore$.inventory.equipment.body)}
          {renderEquipment(_playerStore$.inventory.equipment.legs)}
          {renderEquipment(_playerStore$.inventory.equipment.feet)}
          {renderEquipment(_playerStore$.inventory.equipment.hands)}
          {renderEquipment(_playerStore$.inventory.equipment.weapon)}
          {renderEquipment(_playerStore$.inventory.equipment.shield)}
          {renderEquipment(_playerStore$.inventory.equipment.accessory)}
        </ul>
      </div>
    </div>
  );
};

export default StickySidebar;
