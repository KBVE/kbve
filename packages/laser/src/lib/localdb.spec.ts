import {
    completeTask,
    addTask,
    updateTask,
    removeTask,
    addJournal,
    updateJournal,
    removeJournal,
    createPersistentAtom,
    addItemToStore,
    reloadItemDB,
    queryItemDB,
    addItemToBackpack,
    getItemDetails,
    createAndAddItemToBackpack,
    equipItem,
    unequipItem,
    removeItemFromBackpack,
    updatePlayerState,
    isPlayerInCombat,
    isPlayerDead,
    isPlayerResting,
    updatePlayerStats,
    setPlayerStat,
    decreasePlayerHealth,
    increasePlayerHealth,
    decreasePlayerMana,
    increasePlayerMana,
    decreasePlayerEnergy,
    increasePlayerEnergy,
    applyImmediateEffects,
    addStatBoost,
    removeStatBoost,
    handleBoostExpiry,
    applyConsumableEffects,
    notificationType,
    getEffectiveStats,
    playerData,
    settings,
    getUserSetting,
    setUserSetting
  } from './localdb';

import { 
    createULID
} from './utils/ulid';
import { EventEmitter } from './eventhandler';
import type { IQuest, IJournal, ITask, IPlayerData, IPlayerStats, IPlayerInventory, IObject, IStatBoost, IConsumable, NotificationType, UserSettings } from '../types';

import { Debug } from './utils/debug';
//import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('localdb.ts', () => {
  let quest: IQuest;
  let journal: IJournal;
  let task: ITask;

  beforeEach(() => {
    task = {
      id: 'task-1',
      name: 'Sample Task',
      description: 'This is a sample task',
      isComplete: false,
      action: {}
    };

    journal = {
      id: 'journal-1',
      title: 'Sample Journal',
      tasks: [task],
      isComplete: false
    };

    quest = {
      id: 'quest-1',
      title: 'Sample Quest',
      description: 'This is a sample quest',
      journals: [journal],
      isComplete: false,
      reward: 'Sample Reward'
    };
  });

  it('should complete a task', () => {
    const updatedQuest = completeTask(quest, 'journal-1', 'task-1');
    expect(updatedQuest.journals[0].tasks[0].isComplete).toBe(true);
  });

  it('should add a task to a journal', () => {
    const newTask: ITask = {
      id: 'task-2',
      name: 'New Task',
      description: 'This is a new task',
      isComplete: false,
      action: {}
    };
    const updatedJournal = addTask(journal, newTask);
    expect(updatedJournal.tasks.length).toBe(2);
    expect(updatedJournal.tasks[1]).toEqual(newTask);
  });

  it('should update a task in a journal', () => {
    const updatedTask = { name: 'Updated Task' };
    const updatedJournal = updateTask(journal, 'task-1', updatedTask);
    expect(updatedJournal.tasks[0].name).toBe('Updated Task');
  });

  it('should remove a task from a journal', () => {
    const updatedJournal = removeTask(journal, 'task-1');
    expect(updatedJournal.tasks.length).toBe(0);
  });

  it('should add a journal to a quest', () => {
    const newJournal: IJournal = {
      id: 'journal-2',
      title: 'New Journal',
      tasks: [],
      isComplete: false
    };
    const updatedQuest = addJournal(quest, newJournal);
    expect(updatedQuest.journals.length).toBe(2);
    expect(updatedQuest.journals[1]).toEqual(newJournal);
  });

  it('should update a journal in a quest', () => {
    const updatedJournal = { title: 'Updated Journal' };
    const updatedQuest = updateJournal(quest, 'journal-1', updatedJournal);
    expect(updatedQuest.journals[0].title).toBe('Updated Journal');
  });

  it('should remove a journal from a quest', () => {
    const updatedQuest = removeJournal(quest, 'journal-1');
    expect(updatedQuest.journals.length).toBe(0);
  });

  it('should create a persistent atom for player data and handle JSON parsing', () => {
    const playerData: IPlayerData = {
      stats: {
        username: 'TestUser',
        health: '1000',
        mana: '1000',
        energy: '1000',
        maxHealth: '1000',
        maxMana: '1000',
        maxEnergy: '1000',
        armour: '0',
        agility: '0',
        strength: '0',
        intelligence: '0',
        experience: '0',
        reputation: '0',
        faith: '0'
      },
      inventory: {
        backpack: ['sword', 'shield'],
        equipment: {
          head: null,
          body: null,
          legs: null,
          feet: null,
          hands: null,
          weapon: null,
          shield: null,
          accessory: null
        }
      },
      state: {
        inCombat: false,
        isDead: false,
        isResting: false,
        activeBoosts: {}
      }
    };
    const playerAtom = createPersistentAtom<IPlayerData>('testPlayerData', playerData);
    expect(playerAtom.get()).toEqual(playerData);

    playerAtom.set({
      ...playerData,
      stats: { ...playerData.stats, username: 'UpdatedUser' }
    });
    expect(playerAtom.get().stats.username).toBe('UpdatedUser');
  });

  it('should handle adding and querying items in the item store', async () => {
    const item: IObject = {
      id: 'item-1',
      name: 'Sword of Testing',
      type: 'weapon',
      description: 'A powerful test weapon'
    };

    await addItemToStore(item);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the task to complete
    const storedItem = queryItemDB('item-1');
    expect(storedItem).toEqual(item);
  });

  it('should reload item database from API', async () => {
    await reloadItemDB();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for the task to complete
    const items = queryItemDB('Salmon'); // Use an actual item ID from your API response
    expect(items).toBeDefined();
  });

  it('should handle player inventory and equipment', async () => {
    const item: IObject = {
      id: 'item-1',
      name: 'Helmet of Testing',
      type: 'head',
      description: 'A test helmet',
      equipped: false
    };

    await addItemToStore(item);
    await addItemToBackpack(item.id);
    await equipItem('head', item.id);

    const player = playerData.get();
    expect(player.inventory.backpack).toContain(item.id);
    expect(player.inventory.equipment.head).toBe(item.id);

    await unequipItem('head');
    expect(player.inventory.equipment.head).toBe(null);
  });

  it('should handle player state updates', async () => {
    await updatePlayerState({ inCombat: true });
    expect(isPlayerInCombat()).toBe(true);
    await updatePlayerState({ isDead: true });
    expect(isPlayerDead()).toBe(true);
    await updatePlayerState({ isResting: true });
    expect(isPlayerResting()).toBe(true);
  });

  it('should handle player stats updates and stat boosts', async () => {
    await updatePlayerStats({ health: '900', strength: '50' });
    let player = playerData.get();
    expect(player.stats.health).toBe('900');
    expect(player.stats.strength).toBe('50');

    const statBoost: IStatBoost = {
      health: '100',
      strength: '10',
      duration: 1 // 1 second for testing
    };
    await addStatBoost(statBoost);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the task to complete
    player = playerData.get();
    const effectiveStats = getEffectiveStats();
    expect(effectiveStats.health).toBe('1000'); // 900 + 100
    expect(effectiveStats.strength).toBe('60'); // 50 + 10
  });

  it('should handle consumable effects', async () => {

    await updatePlayerStats({ health: '900', strength: '50' });

    const consumable: IConsumable = {
      id: 'consumable-1',
      name: 'Healing Potion',
      type: 'potion',
      description: 'Restores health',
      effects: { health: 50 },
      boost: { strength: '5', duration: 10 }
    };

    await applyConsumableEffects(consumable);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the task to complete

    const effectiveStats = getEffectiveStats();
    expect(effectiveStats.health).toBe('950'); // 950 + 50
    expect(effectiveStats.strength).toBe('55'); // 50 + 5
  });

  it('should generate a ULID', () => {
    const ulid = createULID();
    expect(ulid).toHaveLength(26);
    expect(typeof ulid).toBe('string');
  });

  it('should handle boost expiry correctly', async () => {
    const statBoost: IStatBoost = {
      health: '100',
      strength: '10',
      duration: 1 // 1 second for testing
    };
    await addStatBoost(statBoost);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the task to complete

    let effectiveStats = getEffectiveStats();
    expect(effectiveStats.health).toBe('1000'); // 900 + 100
    expect(effectiveStats.strength).toBe('60'); // 50 + 10

    // Fast forward time to simulate expiry
    vi.useFakeTimers();
    vi.advanceTimersByTime(2000); // 2 seconds
    await handleBoostExpiry();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for the task to complete

    effectiveStats = getEffectiveStats();
    expect(effectiveStats.health).toBe('900'); // back to original
    expect(effectiveStats.strength).toBe('50'); // back to original
    vi.useRealTimers();
  });

  it('should enable and disable debug mode', async () => {
    setUserSetting('debugMode', true);
    expect(getUserSetting('debugMode')).toBe(true);

    setUserSetting('debugMode', false);
    expect(getUserSetting('debugMode')).toBe(false);
  });

  it('should log debug messages only when debug mode is enabled', () => {
    setUserSetting('debugMode', true);
    const debugMessage = 'Debug log message';
    const consoleSpy = vi.spyOn(console, 'log');

    Debug.log(debugMessage);
    expect(consoleSpy).toHaveBeenCalledWith(`[DEBUG] ${debugMessage}`);

    setUserSetting('debugMode', false);
    Debug.log(debugMessage);
    expect(consoleSpy).toHaveBeenCalledTimes(1); // Should not log again
    consoleSpy.mockRestore();
  });
});