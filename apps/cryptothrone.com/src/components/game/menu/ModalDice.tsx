// DiceRollModal.tsx
import React, { useState, useEffect, memo } from 'react';
import { useStore } from '@nanostores/react';
import { playerStealDiceRoll } from './tempstore';
import {
  EventEmitter,
  notificationType,
  queryItemDB,
  type DiceRollResultEventData,
  type PlayerStealEventData,
} from '@kbve/laser';
import { MinigameDice, updateDiceValues } from '@kbve/laser';

const ModalDice: React.FC = () => {
  const _npc$ = useStore(playerStealDiceRoll);
  const [diceValues, setDiceValues] = useState<number[]>([]);
  const [currentRoll, setCurrentRoll] = useState<number | null>(null);

  useEffect(() => {
    const handlePlayerSteal = (data?: PlayerStealEventData) => {
      if (data) {
        playerStealDiceRoll.set(data);
      }
    };

    const handleDiceRollResult = (newValues?: DiceRollResultEventData) => {
      if (newValues) {
        setDiceValues(newValues.diceValues);
      }
    };

    EventEmitter.on('playerSteal', handlePlayerSteal);
    EventEmitter.on('diceRollResult', handleDiceRollResult);

    return () => {
      EventEmitter.off('playerSteal', handlePlayerSteal);
      EventEmitter.off('diceRollResult', handleDiceRollResult);
    };
  }, []);

  useEffect(() => {
    if (diceValues.length > 0) {
      handleRollResult(diceValues);
    }
  }, [diceValues]);

  const handleRollResult = (newValues: number[]) => {
    const roll = newValues.reduce((acc, val) => acc + val, 0);
    setCurrentRoll(roll);

    if (!_npc$) return;

    let itemName = '';
    let message = '';

    switch (true) {
      case roll === 12:
        itemName = '01J27QABD2GPFNRVK69S51HSGB';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll === 11:
        itemName = '01J27QN2KZG1RDZW4CE9Q9Z3YQ';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll === 10:
        itemName = '01J269PK47V1DWX2S1251DEASD';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll === 9:
        itemName = 'Blue Shark';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll >= 7:
        itemName = 'Salmon';
        message = `You successfully stole a ${itemName}!`;
        break;
      case roll === 2:
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
    setDiceValues([]);
    setCurrentRoll(null);
    playerStealDiceRoll.set(null);
  };

  if (!_npc$) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-zinc-800 bg-opacity-50">
      <div className="bg-zinc-800 p-4 rounded-lg shadow-lg max-w-xs w-full">
        <DiceRollMessage npcName={_npc$.npcName} roll={currentRoll} />
        <MemoizedMinigameDiceComponent />
        <CloseButton handleClose={handleClose} />
      </div>
    </div>
  );
};

const DiceRollMessage: React.FC<{ npcName: string, roll: number | null }> = ({ npcName, roll }) => (
  <div>
    <h2 className="text-lg text-yellow-400 font-bold mb-4">Steal Attempt</h2>
    <p className="mb-4">
      Roll the dice to steal from {npcName}. You need a total of 7 or higher to succeed.
    </p>
    {roll !== null && (
      <p className="mb-4">
        Your roll: {roll}
      </p>
    )}
  </div>
);

const MinigameDiceComponent: React.FC = () => (
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
    diceCount={8}
  />
);

const MemoizedMinigameDiceComponent = memo(MinigameDiceComponent);

const CloseButton: React.FC<{ handleClose: () => void }> = ({ handleClose }) => (
  <button
    onClick={handleClose}
    className="block w-full py-2 bg-red-500 text-white rounded hover:bg-red-700 mt-2"
  >
    Close
  </button>
);

export default ModalDice;
