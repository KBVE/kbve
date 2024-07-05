import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { EventEmitter, type PlayerEventData, playerData } from '@kbve/laser';

const ActionMenu: React.FC = () => {
  const _playerStore$ = useStore(playerData);

  useEffect(() => {
    const handlePlayerData = (data?: PlayerEventData) => {
      if (data) {
        // Update player data if necessary
      }
    };

    EventEmitter.on('playerEvent', handlePlayerData);
    return () => {
      EventEmitter.off('playerEvent', handlePlayerData);
    };
  }, []);

  const handleTrade = () => {
    // Implement trade functionality
    console.log('Trading with player');
  };

  const handleCombat = () => {
    // Implement combat functionality
    console.log('Entering combat with player');
  };

  return (
    <div className="transition ease-in-out duration-500 opacity-50 hover:opacity-100 fixed top-12 right-0 transform translate-y-12 -translate-x-10 w-[300px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-50">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Actions</h2>
        <button
          className="w-full p-2 mb-2 bg-yellow-600 text-white rounded"
          onClick={handleTrade}
        >
          Trade with Player
        </button>
        <button
          className="w-full p-2 mb-2 bg-rose-500 text-white rounded"
          onClick={handleCombat}
        >
          Enter Combat
        </button>
      </div>
    </div>
  );
};

export default ActionMenu;
