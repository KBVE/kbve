import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { EventEmitter, type PlayerEventData, playerData, type NPCInteractionEventData, npcHandler} from '@kbve/laser';
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
        else {
            npcInteractionStore.set(null);
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
        console.log(`Debug Handler: NPCName: ${_npc$.npcName} NPCID: ${_npc$.npcId}, NPCData: ${_npc$.data}`)
        actionHandler(_npc$.npcId, _npc$.data);
      } else {
        console.log(`No handler found for action: ${action}`);
      }
    }
  };

  return (
    <div className="transition ease-in-out duration-500 opacity-50 hover:opacity-100 fixed top-12 right-0 transform translate-y-12 -translate-x-10 w-[300px] p-4 bg-zinc-800 text-yellow-400 border border-yellow-300 rounded-lg z-50">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Actions</h2>
        {_npc$ && _npc$.npcName ? (
          <div className="mb-4">
            <h3 className="text-md font-semibold">{`Actions for ${_npc$.npcName}`}</h3>
            {_npc$.actions.map((action, index) => (
              <button
                key={index}
                className="w-full p-2 mb-2 bg-yellow-500 text-white rounded"
                onClick={() => handleAction(action)}
              >
                {action}
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
