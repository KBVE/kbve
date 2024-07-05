import React, {useEffect} from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { EventEmitter, type PlayerEventData, playerData, quest } from '@kbve/laser';


const StickySidebar: React.FC = () => {
  const _playerStore$ = useStore(playerData);
  const _quest$ = useStore(quest);


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


  return (
    <div className="fixed top-1/2 left-0 transform -translate-y-1/2  translate-x-10 w-64 p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-50">
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
    </div>
  );
};

export default StickySidebar;
