// ActionMenu.tsx
import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  EventEmitter,
  type NPCInteractionEventData,
  type NPCAction,
  npcHandler,
} from '@kbve/laser';

import { npcInteractionStore } from './tempstore';

const ActionMenu: React.FC = () => {
  const _npc$ = useStore(npcInteractionStore);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleNPCInteractionClick = (data?: NPCInteractionEventData) => {
      if (data) {
        npcInteractionStore.set(data);
        setSubmenuPosition(calculatePosition(data.coords.x ,data.coords.y));
      }
    };

    EventEmitter.on('npcInteractionClick', handleNPCInteractionClick);
    return () => {
      EventEmitter.off('npcInteractionClick', handleNPCInteractionClick);
    };
  }, []);

  const calculatePosition = (x: number, y: number) => {
    const padding = 10; // Padding from the edges of the viewport
    const submenuWidth = 200; // Approximate width of the submenu
    const submenuHeight = 200; // Approximate height of the submenu
  
    const offsetX = 250; // Offset to position submenu closer to the right
    const offsetY = 250; // Offset to position submenu further down
  
    let newX = x + offsetX;
    let newY = y + offsetY;
  
    // Adjust to keep within the right edge of the viewport
    if (newX + submenuWidth > window.innerWidth - padding) {
      newX = window.innerWidth - submenuWidth - padding;
    }
  
    // Adjust to keep within the bottom edge of the viewport
    if (newY + submenuHeight > window.innerHeight - padding) {
      newY = window.innerHeight - submenuHeight - padding;
    }
  
    // Adjust to keep within the left edge of the viewport
    if (newX < padding) {
      newX = padding;
    }
  
    // Adjust to keep within the top edge of the viewport
    if (newY < padding) {
      newY = padding;
    }
  
    return { x: newX, y: newY };
  };
  
  


  const handleAction = (action: NPCAction) => {
    if (_npc$) {
      const actionHandler = npcHandler.getActionHandler(action);
      if (actionHandler) {
        actionHandler(_npc$);
        handleClose();
      }
    }
  };

  const handleClose = () => {
    npcInteractionStore.set(null);
  };

  const renderNPCSubmenu = () => {
    if (!_npc$) return null;

    const { npcName, actions, npcId } = _npc$;
    const { x, y } = submenuPosition;

    return (
      <div
        className="absolute bg-zinc-900 border border-yellow-300 rounded-md p-2 z-50 transition transform ease-in-out duration-500 opacity-50 hover:opacity-100"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, -100%)',
        }}
        key={npcId}
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
            onClick={() => handleAction(action as NPCAction)}
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

  return (
    <div>
      {renderNPCSubmenu()}
    </div>
  );
};

export default ActionMenu;
