import React, {useEffect} from 'react';
import { useStore } from '@nanostores/react';
import { atom } from 'nanostores';
import { EventEmitter, type PlayerEventData } from '@kbve/laser';

const $playerStore = atom<PlayerEventData>({
  health: '',
  account: '',
  mana: '',
  inventory: [],
});


const StickySidebar: React.FC = () => {
  const playerStore$ = useStore($playerStore);


  useEffect(() => {
    const handlePlayerData = (data?: PlayerEventData) => {
      if (data) {
        $playerStore.set(data);
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
        <p className="text-sm text-green-400">{`HP: ${playerStore$.health || '0'} / 100`}</p>
        <p className="text-sm text-blue-400">{`MP: ${playerStore$.mana || '0'} / 100`}</p>

      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">User Information</h2>
        <p className="text-sm">{playerStore$.account}</p>
      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">General Information</h2>
        <p className="text-sm">{playerStore$.inventory}</p>
      </div>
    </div>
  );
};

export default StickySidebar;
