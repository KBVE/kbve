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

export interface IPlayerState {
  inCombat: boolean;
  isDead: boolean;
  isResting: boolean;
  activeBoosts: Record<string, IStatBoost>;
}

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

export interface IObjectAction {
  itemId: string;
  itemObject: IObject;
  actionEvent: 'consume' | 'equip' | 'unequip' | 'discard' | 'view';
  actionId: string;
  actionDetails?: string;
}

export interface IEquipment extends IObject {
  type:
    | 'head'
    | 'body'
    | 'legs'
    | 'feet'
    | 'hands'
    | 'weapon'
    | 'shield'
    | 'accessory';
  bonuses?: {
    armor?: number;
    intelligence?: number;
    health?: number;
    mana?: number;
    [key: string]: number | undefined;
  };
  durability?: number;
  weight?: number;
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

export interface ItemActionEventData {
  itemId: string;
  action: 'consume' | 'equip' | 'unequip' | 'discard' | 'view';
}

export interface PlayerViewItem {
  itemId: string;
}

export interface NotificationEventData {
  title: string;
  message: string;
  notificationType: NotificationType;
}

export interface PlayerRewardEvent {
  message: string;
  item: IObject;
}

export interface PlayerCombatDamage {
  damage: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PlayerStealEventData<T = any> {
  npcId: string;
  npcName: string;
  data?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NPCInteractionEventData<T = any> {
  npcId: string;
  npcName: string;
  actions: string[];
  data?: T;
}

export interface NPCMessageEventData {
  npcId: string;
  npcName: string;
  message: string;
}

export interface PlayerMoveEventData {
  x: number;
  y: number;
}

export interface OpenModalEventData {
  message: string;
}

export interface PlayerEventData extends IPlayerData {
  account: string;
}

export interface SceneTransitionEventData {
  newSceneKey: string;
  additionalInfo?: string;
}

export interface CharacterEventData {
  message: string;
  character_name?: string;
  character_image?: string;
  background_image?: string;
}

export interface WASMEventData {
  result: {
    value: number;
    description: string;
  };
}

export interface GameEvent {
  type: 'levelUp' | 'itemFound';
  payload: {
    level?: number;
    item?: string;
  };
}

export interface TaskCompletionEventData {
  taskId: string;
  isComplete: boolean;
}
