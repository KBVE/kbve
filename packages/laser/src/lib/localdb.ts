import { persistentAtom } from '@nanostores/persistent';
import { task } from 'nanostores';
import { EventEmitter } from './eventhandler';
import axios from 'axios';
import {
  IConsumable,
  IEquipment,
  IJournal,
  IObject,
  IPlayerData,
  IPlayerInventory,
  IPlayerState,
  IPlayerStats,
  IQuest,
  IStatBoost,
  ITask,
  ItemAction,
  INotification,
  NotificationType,
  UserSettings,
  MinigameState,
  GameMode,
  MinigameAction,
  MinigameTextures
} from '../types';

import { createULID } from './utils/ulid';

const _IQuest: IQuest = {
  id: '',
  title: '',
  description: '',
  journals: [],
  isComplete: false,
  reward: '',
};

const _IPlayerInventory: IPlayerInventory = {
  backpack: [],
  equipment: {
    head: null,
    body: null,
    legs: null,
    feet: null,
    hands: null,
    weapon: null,
    shield: null,
    accessory: null,
  },
};

const _initialItems: Record<string, IObject> = {};

const _IPlayerState: IPlayerState = {
  inCombat: false,
  isDead: false,
  isResting: false,
  activeBoosts: {},
};

const _IPlayerStats: IPlayerStats = {
  username: 'Guest',
  health: '100',
  mana: '100',
  energy: '100',
  maxHealth: '100',
  maxMana: '100',
  maxEnergy: '100',
  armour: '0',
  agility: '0',
  strength: '0',
  intelligence: '0',
  experience: '0',
  reputation: '0',
  faith: '0',
};

const _IPlayerData: IPlayerData = {
  stats: _IPlayerStats,
  inventory: _IPlayerInventory,
  state: _IPlayerState,
};

const defaultSettings: UserSettings = {
  tooltipItem: { id: null, position: { x: 0, y: 0 } },
  submenuItem: { id: null, position: { x: 0, y: 0 } },
  tooltipNPC: { id: null, position: { x: 0, y: 0 } },
  isStatsMenuCollapsed: false,
  isSettingsMenuCollapsed: false,
  debugMode: false,
  textSpeed: 40,
};


export const initialMinigameState: MinigameState = {
  gamemode: 'Idle',
  action: {
    type: 'ROLL_DICE',
    diceValues: [],
    isRolling: false,
  },
  textures: {
    side1: '',
    side2: '',
    side3: '',
    side4: '',
    side5: '',
    side6: '',
  },
};

export function completeTask<T>(
  quest: IQuest<T>,
  journalId: string,
  taskId: string,
): IQuest<T> {
  const updatedJournals = quest.journals.map((journal) => {
    if (journal.id === journalId) {
      const updatedTasks = journal.tasks.map((task) =>
        task.id === taskId ? { ...task, isComplete: true } : task,
      );

      const isJournalComplete = updatedTasks.every((task) => task.isComplete);
      EventEmitter.emit('taskCompletion', { taskId, isComplete: true });

      return { ...journal, tasks: updatedTasks, isComplete: isJournalComplete };
    }
    return journal;
  });

  const isQuestComplete = updatedJournals.every(
    (journal) => journal.isComplete,
  );

  return { ...quest, journals: updatedJournals, isComplete: isQuestComplete };
}

export function addTask<T>(journal: IJournal<T>, task: ITask<T>): IJournal<T> {
  const updatedTasks = [...journal.tasks, task];
  return { ...journal, tasks: updatedTasks };
}

export function updateTask<T>(
  journal: IJournal<T>,
  taskId: string,
  updatedTask: Partial<ITask<T>>,
): IJournal<T> {
  const updatedTasks = journal.tasks.map((task) =>
    task.id === taskId ? { ...task, ...updatedTask } : task,
  );
  return { ...journal, tasks: updatedTasks };
}

export function removeTask<T>(
  journal: IJournal<T>,
  taskId: string,
): IJournal<T> {
  const updatedTasks = journal.tasks.filter((task) => task.id !== taskId);
  return { ...journal, tasks: updatedTasks };
}

export function addJournal<T>(
  quest: IQuest<T>,
  journal: IJournal<T>,
): IQuest<T> {
  const updatedJournals = [...quest.journals, journal];
  return { ...quest, journals: updatedJournals };
}

export function updateJournal<T>(
  quest: IQuest<T>,
  journalId: string,
  updatedJournal: Partial<IJournal<T>>,
): IQuest<T> {
  const updatedJournals = quest.journals.map((journal) =>
    journal.id === journalId ? { ...journal, ...updatedJournal } : journal,
  );
  return { ...quest, journals: updatedJournals };
}

export function removeJournal<T>(
  quest: IQuest<T>,
  journalId: string,
): IQuest<T> {
  const updatedJournals = quest.journals.filter(
    (journal) => journal.id !== journalId,
  );
  return { ...quest, journals: updatedJournals };
}

export const addItemToStore = (item: IObject) => {
  task(async () => {
    itemStore.set({ ...itemStore.get(), [item.id]: item });
  });
};

export const removeItemFromStore = (itemId: string) => {
  task(async () => {
    const currentStore = itemStore.get();
    const { [itemId]: _, ...remainingItems } = currentStore;
    itemStore.set(remainingItems);
  });
};

export function createPersistentAtom<T>(key: string, defaultValue: T) {
  return persistentAtom<T>(key, defaultValue, {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(value) {
      try {
        return JSON.parse(value);
      } catch {
        return defaultValue;
      }
    },
  });
}

// Stores

export const playerData = createPersistentAtom<IPlayerData>(
  'playerData',
  _IPlayerData,
);
export const quest = createPersistentAtom<IQuest>('quest', _IQuest);
export const itemStore = createPersistentAtom<Record<string, IObject>>(
  'items',
  _initialItems,
);

export const notificationsStore = createPersistentAtom<INotification[]>(
  'notifications',
  [],
);

export const itemDB = createPersistentAtom<Record<string, IObject>>(
  'itemDB',
  _initialItems,
);

export const settings = createPersistentAtom<UserSettings>(
  'settings',
  defaultSettings,
);

export const minigameState = createPersistentAtom<MinigameState>(
  'minigameState',
  initialMinigameState
);


export const getUserSetting = <T extends keyof UserSettings>(key: T): UserSettings[T] => {
  return settings.get()[key];
};

export const setUserSetting = <T extends keyof UserSettings>(key: T, value: UserSettings[T]): void => {
  task(async () => {
    const currentSettings = settings.get();
    settings.set({ ...currentSettings, [key]: value });
  });
};

export const reloadItemDB = () => {
  task(async () => {
    try {
      const response = await axios.get('https://kbve.com/api/itemdb.json');
      const items: Record<string, Record<string, IObject>> = response.data;
      const flattenedItems: Record<string, IObject> = {};

      Object.keys(items['key']).forEach((key) => {
        const item = items['key'][key];
        flattenedItems[item.id] = item;
        flattenedItems[item.name] = item;
      });

      itemDB.set(flattenedItems);
    } catch (error) {
      console.error('Failed to reload item database:', error);
    }
  });
};

export const queryItemDB = (itemId: string): IObject | undefined => {
  const items = itemDB.get();
  return items[itemId];
};

export const addItemToBackpack = (itemId: string) => {
  task(async () => {
    const player = playerData.get();
    player.inventory.backpack.push(itemId);
    playerData.set({ ...player });
  });
};

export const getItemDetails = (
  itemId: string,
): IObject | IEquipment | IConsumable | undefined => {
  const items = itemStore.get();
  const item = items[itemId];
  if (item) {
    return item;
  } else {
    console.warn(`Item with ID ${itemId} not found.`);
    return undefined;
  }
};

export const createAndAddItemToBackpack = (item: Omit<IObject, 'id'>) => {
  task(async () => {
    const id = createULID();
    const newItem: IObject = { ...item, id };

    addItemToStore(newItem);

    addItemToBackpack(newItem.id);

    EventEmitter.emit('notification', {
      title: 'Success',
      message: `You got a ${newItem.name}, verified by E Corp ID ${newItem.id}`,
      notificationType: notificationType['success'],
    });
  });
};

export const equipItem = (
  slot: keyof IPlayerInventory['equipment'],
  itemId: string,
) => {
  task(async () => {
    const player = playerData.get();
    const item = itemStore.get()[itemId];

    if (item) {
      const currentItemId = player.inventory.equipment[slot];
      if (currentItemId) {
        const currentItem = itemStore.get()[currentItemId];
        currentItem.equipped = false;
        itemStore.set({ ...itemStore.get(), [currentItem.id]: currentItem });
      }

      item.equipped = true;
      itemStore.set({ ...itemStore.get(), [item.id]: item });
      player.inventory.equipment[slot] = itemId;
      playerData.set({ ...player });
    }
  });
};

export const unequipItem = (slot: keyof IPlayerInventory['equipment']) => {
  task(async () => {
    const player = playerData.get();
    const itemId = player.inventory.equipment[slot];

    if (itemId) {
      const item = itemStore.get()[itemId];
      if (item) {
        item.equipped = false;
        itemStore.set({ ...itemStore.get(), [item.id]: item });
        player.inventory.equipment[slot] = null;
        playerData.set({ ...player });
      }
    }
  });
};

export const removeItemFromBackpack = (itemId: string) => {
  task(async () => {
    const player = playerData.get();
    const item = itemStore.get()[itemId];

    if (item && !item.equipped) {
      player.inventory.backpack = player.inventory.backpack.filter(
        (id) => id !== itemId,
      );
      playerData.set({ ...player });
      removeItemFromStore(itemId);
    } else {
      EventEmitter.emit('notification', {
        title: 'Warning',
        message: `Cannot remove item that is currently equipped.`,
        notificationType: notificationType['warning'],
      });
    }
  });
};

export const updatePlayerState = (updates: Partial<IPlayerState>) => {
  task(async () => {
    const player = playerData.get();
    player.state = { ...player.state, ...updates };
    playerData.set({ ...player });
  });
};

export function isPlayerInCombat(): boolean {
  return playerData.get().state.inCombat;
}

export function isPlayerDead(): boolean {
  return playerData.get().state.isDead;
}

export function isPlayerResting(): boolean {
  return playerData.get().state.isResting;
}

export const updatePlayerStats = async (updates: Partial<IPlayerStats>) => {
  task(async () => {
    const player = playerData.get();
    const updatedStats: Partial<IPlayerStats> = { ...player.stats, ...updates };

    // Ensure all stats are strings
    (Object.keys(updatedStats) as Array<keyof IPlayerStats>).forEach((key) => {
      const value = updatedStats[key];
      updatedStats[key] = value?.toString() as string;
    });

    player.stats = updatedStats as IPlayerStats;
    playerData.set({ ...player });
  });
};

export const setPlayerStat = (stat: keyof IPlayerStats, value: string) => {
  task(async () => {
    const player = playerData.get();
    player.stats = { ...player.stats, [stat]: value };
    playerData.set({ ...player });
  });
};

export const decreasePlayerHealth = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentHealth = parseInt(player.stats.health, 10);
    const newHealth = Math.max(currentHealth - amount, 0);
    player.stats = { ...player.stats, health: newHealth.toString() };
    playerData.set({ ...player });
  });
};

export const increasePlayerHealth = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentHealth = parseInt(player.stats.health, 10);
    const maxHealth = parseInt(player.stats.maxHealth, 10);
    const newHealth = Math.min(currentHealth + amount, maxHealth);
    player.stats = { ...player.stats, health: newHealth.toString() };
    playerData.set({ ...player });
  });
};

export const decreasePlayerMana = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentMana = parseInt(player.stats.mana, 10);
    const newMana = Math.max(currentMana - amount, 0);
    player.stats = { ...player.stats, mana: newMana.toString() };
    playerData.set({ ...player });
  });
};

export const increasePlayerMana = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentMana = parseInt(player.stats.mana, 10);
    const maxMana = parseInt(player.stats.maxMana, 10);
    const newMana = Math.min(currentMana + amount, maxMana);
    player.stats = { ...player.stats, mana: newMana.toString() };
    playerData.set({ ...player });
  });
};

export const decreasePlayerEnergy = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentEnergy = parseInt(player.stats.energy, 10);
    const newEnergy = Math.max(currentEnergy - amount, 0);
    player.stats = { ...player.stats, energy: newEnergy.toString() };
    playerData.set({ ...player });
  });
};

export const increasePlayerEnergy = (amount: number) => {
  task(async () => {
    const player = playerData.get();
    const currentEnergy = parseInt(player.stats.energy, 10);
    const maxEnergy = parseInt(player.stats.maxEnergy, 10);
    const newEnergy = Math.min(currentEnergy + amount, maxEnergy);
    player.stats = { ...player.stats, energy: newEnergy.toString() };
    playerData.set({ ...player });
  });
};

export const applyImmediateEffects = (effects: Partial<IPlayerStats>) => {
  if (effects.health !== undefined) {
    const healthAmount = parseInt(effects.health as unknown as string, 10);
    if (healthAmount > 0) {
      increasePlayerHealth(healthAmount);
    } else {
      decreasePlayerHealth(Math.abs(healthAmount));
    }
  }

  if (effects.mana !== undefined) {
    const manaAmount = parseInt(effects.mana as unknown as string, 10);
    if (manaAmount > 0) {
      increasePlayerMana(manaAmount);
    } else {
      decreasePlayerMana(Math.abs(manaAmount));
    }
  }

  if (effects.energy !== undefined) {
    const energyAmount = parseInt(effects.energy as unknown as string, 10);
    if (energyAmount > 0) {
      increasePlayerEnergy(energyAmount);
    } else {
      decreasePlayerEnergy(Math.abs(energyAmount));
    }
  }
};

export const addStatBoost = async (boost: IStatBoost) => {
  const boostId = createULID();
  task(async () => {
    const player = playerData.get();

    player.state.activeBoosts[boostId] = {
      ...boost,
      expiry: Date.now() + boost.duration * 1000,
    };

    playerData.set({ ...player });
  });
};

export const removeStatBoost = async (boostId: string) => {
  task(async () => {
    const player = playerData.get();
    if (player.state.activeBoosts[boostId]) {
      delete player.state.activeBoosts[boostId];
      playerData.set({ ...player });
    }
  });
};

export const getEffectiveStats = (): IPlayerStats => {
  const player = playerData.get();
  const effectiveStats = { ...player.stats };

  Object.values(player.state.activeBoosts).forEach((boost) => {
    Object.keys(boost).forEach((key) => {
      if (key !== 'duration' && key !== 'expiry') {
        const statKey = key as keyof IPlayerStats;
        const boostValue =
          parseInt(boost[statKey] as unknown as string, 10) || 0;
        effectiveStats[statKey] = (
          parseInt(effectiveStats[statKey], 10) + boostValue
        ).toString();
      }
    });
  });

  return effectiveStats;
};

export const handleBoostExpiry = async () => {
  task(async () => {
    const player = playerData.get();
    const now = Date.now();
    let stateChanged = false;

    Object.keys(player.state.activeBoosts).forEach((boostId) => {
      const boost = player.state.activeBoosts[boostId];

      if (boost.expiry && now >= boost.expiry) {
        delete player.state.activeBoosts[boostId];
        stateChanged = true;
      }
    });

    if (stateChanged) {
      playerData.set({ ...player });
    }
  });
};

export const applyConsumableEffects = (item: IConsumable) => {
  task(async () => {
    const player = playerData.get();
    // const effects = item.effects;

    // const effectsAsStrings: Partial<IPlayerStats> = {
    //   health: effects.health !== undefined ? effects.health.toString() : undefined,
    //   mana: effects.mana !== undefined ? effects.mana.toString() : undefined,
    //   energy: effects.energy !== undefined ? effects.energy.toString() : undefined
    // };

    const bonuses = item.bonuses;

    const bonusesAsStrings: Partial<IPlayerStats> = {
      health:
        bonuses?.health !== undefined ? bonuses.health.toString() : undefined,
      mana: bonuses?.mana !== undefined ? bonuses.mana.toString() : undefined,
      energy:
        bonuses?.energy !== undefined ? bonuses.energy.toString() : undefined,
    };

    applyImmediateEffects(bonusesAsStrings);

    //applyImmediateEffects(effectsAsStrings);

    if (item.boost) {
      addStatBoost(item.boost);
    }

    if (item.action) {
      console.log(`Action: ${item.action}`);
    }

    playerData.set({ ...player });
  });
};

export const getActionEvents = (
  itemId: string,
): ItemAction['actionEvent'][] => {
  const item = getItemDetails(itemId);
  if (!item) {
    return [];
  }

  const actions: ItemAction['actionEvent'][] = ['view', 'discard'];

  if (item.consumable) {
    actions.push('consume');
  }
  if (item.equipped) {
    actions.push('unequip');
  } else if (!item.consumable) {
    actions.push('equip');
  }

  return actions;
};

export const notificationType: Record<string, NotificationType> = {
  caution: {
    type: 'caution',
    color: 'bg-yellow-200 border-yellow-300 text-yellow-700',
    imgUrl: '/assets/icons/notification.svg',
  },
  warning: {
    type: 'warning',
    color: 'bg-orange-200 border-orange-300 text-orange-700',
    imgUrl: '/assets/icons/notification.svg',
  },
  danger: {
    type: 'danger',
    color: 'bg-red-200 border-red-300 text-red-700',
    imgUrl: '/assets/icons/notification.svg',
  },
  success: {
    type: 'success',
    color: 'bg-green-200 border-green-300 text-green-700',
    imgUrl: '/assets/icons/notification.svg',
  },
  info: {
    type: 'info',
    color: 'bg-blue-200 border-blue-300 text-blue-700',
    imgUrl: '/assets/icons/notification.svg',
  },
};

//** MiniGames */


export function updateMinigameState(updates: Partial<MinigameState>) {
  try {
    task(async () => {
      const state = minigameState.get();
      minigameState.set({ ...state, ...updates });
    });
  } catch (error) {
    console.error('Error updating minigame state:', error);
  }
}

export function setGameMode(gamemode: GameMode) {
  updateMinigameState({ gamemode });
}

export function setAction(action: MinigameAction) {
  updateMinigameState({ action });
}

export function setTextures(textures: MinigameTextures) {
  updateMinigameState({ textures });
}

export function updateDiceValues(diceValues: number[]) {
  const state = minigameState.get();
  if (state.gamemode === 'Dice' && state.action.type === 'ROLL_DICE') {
    updateMinigameState({
      action: { ...state.action, diceValues } as MinigameAction,
    });
  }
}

export function setRollingStatus(isRolling: boolean) {
  const state = minigameState.get();
  if (state.gamemode === 'Dice' && state.action.type === 'ROLL_DICE') {
    updateMinigameState({
      action: { ...state.action, isRolling } as MinigameAction,
    });
  }
}
