// NPCSubmenu.tsx
import React from 'react';
import { useStore } from '@nanostores/react';
import { npcHandler, type NPCInteractionEventData } from '@kbve/laser';
import { npcInteractionStore } from './tempstore';


const NPCSubmenu: React.FC = () => {
  const _npc$ = useStore(npcInteractionStore);

  const handleAction = (action: string) => {
    if (_npc$) {
      const actionHandler = npcHandler.getActionHandler(action);
      if (actionHandler) {
        actionHandler(_npc$);
      }
    }
  };

  const handleClose = () => {
    npcInteractionStore.set(null);
  };


  if (!_npc$) return null;

  const { npcName, actions, coords } = _npc$;
  const { x, y } = coords || { x: 0, y: 0 };

  return (
    <div
      className="absolute bg-zinc-900 border border-yellow-300 rounded-md p-2 z-50 transition transform ease-in-out duration-500 opacity-50 hover:opacity-100"
      style={{
        left: `${x + 120}px`,
        top: `${y + 120}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
     <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-sm">{npcName}</h3>
        <button
          onClick={handleClose}
          className="text-xs font-bold m-1 text-yellow-300 hover:text-yellow-500"
        >
          X
        </button>
      </div>
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={() => handleAction(action)}
          className="block w-full text-xs py-1 px-2 mb-1 bg-yellow-500 hover:bg-yellow-400 rounded"
        >
          {action}
        </button>
      ))}
        <button
        onClick={handleClose}
        className="block w-full text-xs py-1 px-2 mt-2 bg-red-500 hover:bg-red-600 rounded text-white"
      >
        Close
      </button>
    </div>
  );
};

export default NPCSubmenu;
