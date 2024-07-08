import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  EventEmitter,
  type NPCInteractionEventData,

} from '@kbve/laser';
import NPCSubmenu from './NPCSubmenu';

import { npcInteractionStore } from './tempstore';


const ActionMenu: React.FC = () => {
  const _npc$ = useStore(npcInteractionStore);
  //const _stolen$ = useStore(playerStealDiceRoll);

  useEffect(() => {
    const handleNPCInteractionClick = (data?: NPCInteractionEventData) => {
      if (data) {
        npcInteractionStore.set(data);
      }
    };
    // const handleShowDiceRollModal = (data?: PlayerStealEventData) => {
    //   if(data) {
    //     playerStealDiceRoll.set(data);
    //   }
    // };

    EventEmitter.on('npcInteractionClick', handleNPCInteractionClick);
    //EventEmitter.on('playerSteal', handleShowDiceRollModal);
    return () => {
      EventEmitter.off('npcInteractionClick', handleNPCInteractionClick);
     // EventEmitter.off('playerSteal', handleShowDiceRollModal);
    };
  }, []);

  return (
    <div>
      {_npc$ && <NPCSubmenu key={_npc$.npcId} />}
    </div>
  );
};

export default ActionMenu;