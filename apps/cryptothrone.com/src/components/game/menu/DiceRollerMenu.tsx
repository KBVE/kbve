// DiceRollModal.tsx
import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { npcInteractionStore} from './tempstore';
import { EventEmitter, notificationType, queryItemDB} from '@kbve/laser';


import { MinigameDice } from '@kbve/laser';

const DiceRollModal: React.FC = () => {
  const [diceRoll, setDiceRoll] = useState<number | null>(null);

  const _npc$ = useStore(npcInteractionStore);

  const rollDice = () => {
    const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    setDiceRoll(roll);
    handleRollResult(roll);
  };

  const handleRollResult = (roll: number) => {
    if (_npc$) {
      if (roll >= 7) {
        const item = queryItemDB('Salmon');
        if (item) {
          EventEmitter.emit('playerReward', {
            message: `You successfully stole a ${item.name}!`,
            item: item,
          }, 2000);
         
        } else {
          console.warn('Item not found in ItemDB');
        }
      } else {
        EventEmitter.emit('notification', {
          title: 'Danger',
          message: `You failed to steal from ${_npc$.npcName}!`,
          notificationType: notificationType['danger'],
        });
        EventEmitter.emit('playerDamage', {
          damage: '1',
        });
      }
    }
    
  };

  const handleClose = () => {
    npcInteractionStore.set(null);
  };

  if (!_npc$) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-zinc-800 bg-opacity-50">
      <div className="bg-zinc-800 p-4 rounded-lg shadow-lg max-w-xs w-full">
        <h2 className="text-lg font-bold mb-4">Steal Attempt</h2>
        <p className="mb-4">Roll the dice to steal from {_npc$.npcName}. You need a total of 7 or higher to succeed.</p>
        <MinigameDice
            textures={{
            side1: '/assets/items/set/dice/dice1.png',
            side2: '/assets/items/set/dice/dice2.png',
            side3: '/assets/items/set/dice/dice3.png',
            side4: '/assets/items/set/dice/dice4.png',
            side5: '/assets/items/set/dice/dice5.png',
            side6: '/assets/items/set/dice/dice6.png'
            }}
            styleClass="h-96"
            diceCount={2}
        />
        <button
          onClick={handleClose}
          className="block w-full py-2 bg-red-500 text-white rounded hover:bg-red-700"
        >
          Close
        </button>
      </div>
     
    </div>
  );
};

export default DiceRollModal;
