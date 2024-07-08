// DiceRollModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { npcInteractionStore, diceRoll, playerStealDiceRoll } from './tempstore';
import {
  EventEmitter,
  notificationType,
  queryItemDB,
  minigameState,
  type DiceRollResultEventData,
  isDiceAction,
  type MinigameAction,
} from '@kbve/laser';

import { MinigameDice, setRollingStatus, updateDiceValues } from '@kbve/laser';

const ModalDice: React.FC = () => {
  const _npc$ = useStore(playerStealDiceRoll);
  useEffect(() => {
    const handleDiceRollResult = (newValues?: DiceRollResultEventData) => {
      if (newValues) {
        handleRollResult(newValues.diceValues);
      }
    };

    EventEmitter.on('diceRollResult', handleDiceRollResult);
    return () => {
      EventEmitter.off('diceRollResult', handleDiceRollResult);
    };
  }, [_npc$]);

  const handleRollResult = (newValues: number[]) => {
    const roll = newValues.reduce((acc, val) => acc + val, 0);

    if (!_npc$) return;

    let itemName = '';
    let message = '';

    switch (true) {
      case roll == 12:
        itemName = '01J27QABD2GPFNRVK69S51HSGB';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll == 11:
        itemName = '01J27QN2KZG1RDZW4CE9Q9Z3YQ';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll == 10:
        itemName = '01J269PK47V1DWX2S1251DEASD';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll == 9:
        itemName = 'Blue Shark';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll >= 7:
        itemName = 'Salmon';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll == 2:
        EventEmitter.emit('notification', {
          title: 'Danger',
          message: `You crit failed to steal from ${_npc$.npcName}!`,
          notificationType: notificationType['danger'],
        });
        EventEmitter.emit('playerDamage', {
          damage: '5',
        });
        break;
      default:
        EventEmitter.emit('notification', {
          title: 'Danger',
          message: `You failed to steal from ${_npc$.npcName}!`,
          notificationType: notificationType['danger'],
        });
        EventEmitter.emit('playerDamage', {
          damage: '1',
        });
        return;
    }

    const item = queryItemDB(itemName);
    if (item) {
      EventEmitter.emit('playerReward', {
        message: message,
        item: item,
      });
    } else {
      console.warn('Item not found in ItemDB');
    }
  };

  const handleClose = () => {
    updateDiceValues([]);
    playerStealDiceRoll.set(null);
   // npcInteractionStore.set(null);
  };

  if (!_npc$) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-zinc-800 bg-opacity-50">
      <div className="bg-zinc-800 p-4 rounded-lg shadow-lg max-w-xs w-full">
        <h2 className="text-lg font-bold mb-4">Steal Attempt</h2>
        <p className="mb-4">
          Roll the dice to steal from {_npc$.npcName}. You need a total of 7 or
          higher to succeed.
        </p>
        <MinigameDice
          textures={{
            side1: '/assets/items/set/dice/dice1.png',
            side2: '/assets/items/set/dice/dice2.png',
            side3: '/assets/items/set/dice/dice3.png',
            side4: '/assets/items/set/dice/dice4.png',
            side5: '/assets/items/set/dice/dice5.png',
            side6: '/assets/items/set/dice/dice6.png',
          }}
          styleClass="h-96"
          diceCount={2}
        />

        <button
          onClick={handleClose}
          className="block w-full py-2 bg-red-500 text-white rounded hover:bg-red-700 mt-2"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ModalDice;
