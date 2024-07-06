import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  EventEmitter,
  type PlayerEventData,
  playerData,
  type NPCInteractionEventData,
  npcHandler,
} from '@kbve/laser';
import { atom } from 'nanostores';

const npcInteractionStore = atom<NPCInteractionEventData | null>(null);

const ActionMenu: React.FC = () => {
  const _npc$ = useStore(npcInteractionStore);

  const _playerStore$ = useStore(playerData);

  useEffect(() => {
    const handleNPCInteraction = (data?: NPCInteractionEventData) => {
      if (data) {
        npcInteractionStore.set(data);
      } 
    };

    EventEmitter.on('npcInteraction', handleNPCInteraction);
    return () => {
      EventEmitter.off('npcInteraction', handleNPCInteraction);
    };
  }, []);

  const handleAction = (action: string) => {
    if (_npc$) {
      const actionHandler = npcHandler.getActionHandler(action);
      if (actionHandler) {
        actionHandler(_npc$.npcId, _npc$.npcName, _npc$.data);
      }
    }
  };

  return (
    <div className="transition ease-in-out duration-500 opacity-50 hover:opacity-100 fixed top-12 right-0 transform translate-y-12 -translate-x-10 w-[350px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-50">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Actions</h2>
        {_npc$ && _npc$.npcName ? (
          <div className="mb-4">
            <h3 className="text-md font-semibold">{`Actions for ${_npc$.npcName}`}</h3>
            {_npc$.actions.map((action, index) => (
              <button
                key={index}
                className="relative w-full m-1 p-2 px-5 py-3 overflow-hidden font-medium text-yellow-600 bg-yellow-100 border border-yellow-100 rounded-lg shadow-inner group"
                onClick={() => handleAction(action)}
              >
                <span className="absolute top-0 left-0 w-0 h-0 transition-all duration-200 border-t-2 border-yellow-600 group-hover:w-full ease"></span>
                <span className="absolute bottom-0 right-0 w-0 h-0 transition-all duration-200 border-b-2 border-yellow-600 group-hover:w-full ease"></span>
                <span className="absolute top-0 left-0 w-full h-0 transition-all duration-300 delay-200 bg-yellow-600 group-hover:h-full ease"></span>
                <span className="absolute bottom-0 left-0 w-full h-0 transition-all duration-300 delay-200 bg-yellow-600 group-hover:h-full ease"></span>
                <span className="absolute inset-0 w-full h-full duration-300 delay-300 bg-yellow-900 opacity-0 group-hover:opacity-100"></span>
                <span className="relative transition-colors duration-300 delay-200 group-hover:text-white ease">
                  {action}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <p>No actions available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionMenu;
