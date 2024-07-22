import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import * as Laser from '@kbve/laser';

import { npcInteractionStore } from './tempstore';

const ActionMenu: React.FC = () => {
  const _npc$ = useStore(npcInteractionStore);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleNPCInteractionClick = (data?: Laser.NPCInteractionEventData) => {
      if (data) {
        npcInteractionStore.set(data);
        setTimeout(() => {
          setSubmenuPosition(calculatePosition(data.coords.x, data.coords.y));
        }, 0); // Delay to ensure submenuRef is updated
      }
    };

    Laser.EventEmitter.on('npcInteractionClick', handleNPCInteractionClick);
    return () => {
      Laser.EventEmitter.off('npcInteractionClick', handleNPCInteractionClick);
    };
  }, []);

  const calculatePosition = (x: number, y: number) => {
    const padding = 10;
    const submenu = submenuRef.current;

    if (!submenu) {
      return { x, y };
    }

    const rect = submenu.getBoundingClientRect();
    let newX = x;
    let newY = y;

    // Adjust to keep within the right edge of the viewport
    if (newX + rect.width > window.innerWidth - padding) {
      newX = window.innerWidth - rect.width - padding;
    }

    // Adjust to keep within the bottom edge of the viewport
    if (newY + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding;
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

  const handleAction = (action: Laser.NPCAction) => {
    if (_npc$) {
      const actionHandler = Laser.npcHandler.getActionHandler(action);
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
        ref={submenuRef}
        className="absolute bg-zinc-900 border border-yellow-300 rounded-md p-2 z-[100]"
        style={{
          left: `${x}px`,
          top: `${y}px`,
        }}
        key={npcId}
      >
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-sm text-white">{npcName}</h3>
          <button
            onClick={handleClose}
            className="text-xs font-bold m-1 text-yellow-300 border rounded-full pl-1 pr-1 hover:text-yellow-500 hover:scale-110"
          >
            X
          </button>
        </div>
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action as Laser.NPCAction)}
            className="block w-full text-sm py-1 px-2 mb-1 bg-yellow-500 hover:bg-yellow-400 rounded capitalize"
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
