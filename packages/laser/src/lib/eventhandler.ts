import type {
  IPlayerData,
  NotificationType,
  IObject,
  DiceRollResultEventData,
  CharacterEventData,
  GameEvent,
  ItemActionEventData,
  NPCInteractionEventData,
  NotificationEventData,
  OpenModalEventData,
  PlayerCombatDamage,
  PlayerEventData,
  PlayerMoveEventData,
  PlayerRewardEvent,
  PlayerStealEventData,
  SceneTransitionEventData,
  TaskCompletionEventData,
  WASMEventData,
  NPCDialogueEventData,
} from '../types';

import { Debug } from './utils/debug';

export type EventData = {
  openModal: OpenModalEventData;
  wasmEvent: WASMEventData;
  gameEvent: GameEvent;
  charEvent: CharacterEventData;
  playerEvent: PlayerEventData;
  sceneTransition: SceneTransitionEventData;
  taskCompletion: TaskCompletionEventData;
  npcInteraction: NPCInteractionEventData;
  npcInteractionClick: NPCInteractionEventData;
  playerMove: PlayerMoveEventData;
  notification: NotificationEventData;
  playerSteal: PlayerStealEventData;
  playerDamage: PlayerCombatDamage;
  playerReward: PlayerRewardEvent;
  itemAction: ItemActionEventData;
  diceRollResult: DiceRollResultEventData;
  npcDialogue: NPCDialogueEventData;
};

type EventHandler<T> = (data?: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class EventEmitter<T extends Record<string, any>> {
  private events: { [K in keyof T]?: EventHandler<T[K]>[] } = {};
  private lastEmitted: Map<keyof T, number> = new Map();

  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event]?.push(handler);
  }

  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>) {
    if (!this.events[event]) return;

    this.events[event] = this.events[event]?.filter((h) => h !== handler);
  }

  emit<K extends keyof T>(event: K, data?: T[K], throttleTime = 0, message?: string) {
    const now = Date.now();
    const lastEmitTime = this.lastEmitted.get(event) || 0;

    if (now - lastEmitTime >= throttleTime) {
      if (!this.events[event]) return;

      this.events[event]?.forEach((handler) => handler(data));

      if (message && Debug.isEnabled()) {
        Debug.log(`Event: ${String(event)} - Message: ${message}`);
      }

      if (Debug.isEnabled()) {
        Debug.log(`Event Data: ${String(event)} - Data: ${data ? JSON.stringify(data) : 'No data'}`);
      }
      
      this.lastEmitted.set(event, now);
    }
  }
}

const eventEmitterInstance = new EventEmitter<EventData>();

export { eventEmitterInstance as EventEmitter };
export default eventEmitterInstance;
