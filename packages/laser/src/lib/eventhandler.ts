import type { IPlayerData } from './localdb';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NPCInteractionEventData<T = any> {
  npcId: string;
  npcName: string;
  actions: string[];
  data?: T;
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

export type EventData = {
  openModal: OpenModalEventData;
  wasmEvent: WASMEventData;
  gameEvent: GameEvent;
  charEvent: CharacterEventData;
  playerEvent: PlayerEventData;
  sceneTransition: SceneTransitionEventData;
  taskCompletion: TaskCompletionEventData;
  npcInteraction: NPCInteractionEventData;
  playerMove: PlayerMoveEventData;
};

type EventHandler<T> = (data?: T) => void;

class EventEmitter<T extends Record<string, any>> {
  private events: { [K in keyof T]?: EventHandler<T[K]>[] } = {};

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

  emit<K extends keyof T>(event: K, data?: T[K]) {
    if (!this.events[event]) return;

    this.events[event]?.forEach((handler) => handler(data));
  }
}

const eventEmitterInstance = new EventEmitter<EventData>();

export { eventEmitterInstance as EventEmitter };
export default eventEmitterInstance;
