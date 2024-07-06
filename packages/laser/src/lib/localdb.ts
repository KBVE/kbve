import { persistentAtom } from '@nanostores/persistent';
import { task } from 'nanostores';
import { EventEmitter } from './eventhandler';

export interface IPlayerStats {
  username: string;
  health: string;
  mana: string;
  energy: string;
  maxHealth: string;
  maxMana: string;
  maxEnergy: string;
  armour: string;
  agility: string;
  strength: string;
  intelligence: string;
  experience: string;
  reputation: string;
  faith: string;
}

export interface IStatBoost extends Partial<IPlayerStats> {
  duration: number;
  expiry?: number; 
}

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

export interface IPlayerState {
  inCombat: boolean;
  isDead: boolean;
  isResting: boolean;
  activeBoosts: Record<string, IStatBoost>;
}

const _IPlayerState: IPlayerState = {
  inCombat: false,
  isDead: false,
  isResting: false,
  activeBoosts: {},
};

export interface IObject {
  id: string; // ULID
  name: string;
  type: string;
  category?: string;
  description?: string;
  img?: string;
  bonuses?: {
    armor?: number;
    intelligence?: number;
    health?: number;
    mana?: number;
  };
  durability?: number;
  weight?: number;
  equipped?: boolean;
  consumable?: boolean;
  cooldown?: number;
  craftingMaterials?: string[];
  rarity?: string;
}

export interface IConsumable extends IObject {
  type: 'food' | 'scroll' | 'drink' | 'potion';
  effects: {
    health?: number;
    mana?: number;
    energy?: number;
    [key: string]: number | undefined;
  };
  boost?: IStatBoost;
  duration?: number;
  action?: string;

}

export interface IPlayerInventory {
  backpack: string[];
  equipment: {
    head: string | null;
    body: string | null;
    legs: string | null;
    feet: string | null;
    hands: string | null;
    weapon: string | null;
    shield: string | null;
    accessory: string | null;
  };
}

// Player data interface
export interface IPlayerData {
  stats: IPlayerStats;
  inventory: IPlayerInventory;
  state: IPlayerState;
}

export interface NotificationType {
  type: 'caution' | 'warning' | 'danger' | 'success' | 'info';
  color: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  imgUrl: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  notificationType: NotificationType;
}

/**
 *
 *  IQuest - Slay 15 Goblins in the Castle and kill their leader.
 *     - IJournal 1 - Go to the Castle
 *          - ITask (1) -> (is X, Y Zone within Castle)
 *     - IJournal 2 - KIll 15 Goblins
 *          - ITask (15) -> Kill a Goblin
 *     - IJournal 3 - Slay The Goblin Leader
 *          - ITask (1) -> Kill Goblin Leader
 *
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ITask<T = any> {
  id: string; // ULID
  name: string;
  description: string;
  isComplete: boolean;
  action: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IJournal<T = any> {
  id: string; // ULID
  title: string;
  tasks: ITask<T>[];
  isComplete: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IQuest<T = any> {
  id: string; // ULID
  title: string;
  description: string;
  journals: IJournal<T>[];
  isComplete: boolean;
  reward: string;
}

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

const _IPlayerData: IPlayerData = {
  stats: _IPlayerStats,
  inventory: _IPlayerInventory,
  state: _IPlayerState,
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

      // Emit task completion event
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

export const playerData = createPersistentAtom<IPlayerData>(
  'playerData',
  _IPlayerData,
);
export const quest = createPersistentAtom<IQuest>('quest', _IQuest);
export const itemStore = createPersistentAtom<Record<string, IObject>>(
  'items',
  _initialItems,
);

export const notificationsStore = createPersistentAtom<Notification[]>(
  'notifications',
  [],
);

export const addItemToBackpack = (itemId: string) => {
  task(async () => {
    const player = playerData.get();
    player.inventory.backpack.push(itemId);
    playerData.set({ ...player });
  });
};

export const getItemDetails = (itemId: string): IObject | undefined => {
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

export const updatePlayerStats = (updates: Partial<IPlayerStats>) => {
  task(async () => {
    const player = playerData.get();
    player.stats = { ...player.stats, ...updates };
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

export const addStatBoost = (boost: IStatBoost) => {
  task(async () => {
    const boostId = createULID();
    applyStatBoost(boost, boostId);
  });
};

const applyStatBoost = (boost: IStatBoost, boostId: string) => {
  const player = playerData.get();
  Object.keys(boost).forEach((key) => {
    if (key !== 'duration' && key !== 'expiry') {
      const statKey = key as keyof IPlayerStats;
      const originalValue = parseInt(player.stats[statKey], 10) || 0;
      const boostValue = boost[statKey] as unknown as number || 0;
      player.stats[statKey] = (originalValue + boostValue).toString();
    }
  });

  // Add the boost to activeBoosts with an expiry time
  player.state.activeBoosts[boostId] = {
    ...boost,
    expiry: Date.now() + boost.duration * 1000, // Convert duration to milliseconds
  };

  playerData.set({ ...player });
};

export const removeStatBoost = (boostId: string) => {
  task(async () => {
    const player = playerData.get();
    const boost = player.state.activeBoosts[boostId];

    if (boost) {
      // Remove the boost from player stats
      Object.keys(boost).forEach((key) => {
        if (key !== 'duration' && key !== 'expiry') {
          const statKey = key as keyof IPlayerStats;
          const originalValue = parseInt(player.stats[statKey], 10) || 0;
          const boostValue = boost[statKey] as unknown as number || 0; // Ensure boost value is a number
          player.stats[statKey] = (originalValue - boostValue).toString();
        }
      });

      // Remove the boost from activeBoosts
      delete player.state.activeBoosts[boostId];

      playerData.set({ ...player });
    }
  });
};

export const handleBoostExpiry = () => {
  task(async () => {
    const player = playerData.get();
    const now = Date.now();
    let stateChanged = false;

    Object.keys(player.state.activeBoosts).forEach((boostId) => {
      const boost = player.state.activeBoosts[boostId];

      // If boost duration has expired, remove it
      if (boost.expiry && now >= boost.expiry) {
        removeStatBoost(boostId);
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
    const effects = item.effects;

    // Convert effects to string format for applyImmediateEffects
    const effectsAsStrings: Partial<IPlayerStats> = {
      health: effects.health !== undefined ? effects.health.toString() : undefined,
      mana: effects.mana !== undefined ? effects.mana.toString() : undefined,
      energy: effects.energy !== undefined ? effects.energy.toString() : undefined
    };

    // Apply immediate effects
    applyImmediateEffects(effectsAsStrings);

    // Apply temporary boosts
    if (item.boost) {
      addStatBoost(item.boost);
    }

    if (item.action) {
      console.log(`Action: ${item.action}`);
      // Implement your action handling logic here
    }

    playerData.set({ ...player });
  });
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


const crockford32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function padStart(str: string, length: number, pad: string): string {
  while (str.length < length) {
    str = pad + str;
  }
  return str;
}

function randomChar(): string {
  const random = Math.floor(Math.random() * crockford32.length);
  return crockford32.charAt(random);
}

function randomChars(count: number): string {
  let str = '';
  for (let i = 0; i < count; i++) {
    str += randomChar();
  }
  return str;
}

function encodeTime(time: number, length: number): string {
  let str = '';
  for (let i = length - 1; i >= 0; i--) {
    const mod = time % crockford32.length;
    str = crockford32.charAt(mod) + str;
    time = Math.floor(time / crockford32.length);
  }
  return padStart(str, length, crockford32[0]);
}

export function createULID(): string {
  const timestamp = Date.now();
  const timePart = encodeTime(timestamp, 10); // 48-bit timestamp
  const randomPart = randomChars(16); // 80-bit randomness
  return timePart + randomPart;
}
