export interface OpenModalEventData {
  message: string;
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

export type EventData = {
  openModal: OpenModalEventData;
  wasmEvent: WASMEventData;
  gameEvent: GameEvent;
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

export default new EventEmitter<EventData>();
