console.log('[Alpine] Metrics Running');

import { useSharedWorkerCall, subscribeToTopic } from './client';

// Define a type for your metrics entry – adjust these fields as needed.
interface MetricsEntry {
  key: string;
  value: number;
}

// Define the data type for the "metricsCube" Alpine component
interface MetricsCubeData {
  open: boolean;
  dataEntries: MetricsEntry[];
  unsubscribe: (() => void) | null;
  loading: boolean;
  init(): Promise<void>;
  destroy(): void;
}

// Optionally, define a type for the WebSocket manager if you'd like to be explicit.
interface WebSocketManagerData {
  message: string;
  messages: string[];
  unsubscribe: (() => void) | null;
  init(): Promise<void>;
  destroy(): void;
  sendMessage(): Promise<void>;
}

// Listen for Alpine initialization
export default function RegisterAlpineMetricsComponents(Alpine: typeof window.Alpine) {
  // Define the "metricsCube" Alpine component with type annotation
  Alpine.data('metricsCube', (): MetricsCubeData => ({
    open: false,
    dataEntries: [],
    unsubscribe: null,
    loading: false,

    async init() {
      this.loading = true;

      // Assume your shared-worker call returns an array of MetricsEntry
      // Adjust the type assertion if necessary.
      const initial = (await useSharedWorkerCall('fetch_metrics')) as MetricsEntry[];
      this.dataEntries = initial;

      // subscribeToTopic now has an explicit callback argument type.
      this.unsubscribe = subscribeToTopic('metrics', (data: MetricsEntry[]) => {
        this.dataEntries = data;
        if (this.loading) this.loading = false;
      });

      this.loading = false;
    },

    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    }
  }));

  // Define the "webSocketManager" Alpine component with type annotation
  Alpine.data('webSocketManager', (): WebSocketManagerData => ({
    message: '',
    messages: [],
    unsubscribe: null,

    async init() {
      this.unsubscribe = subscribeToTopic('websocket', (data: any) => {
        // You can add a proper type instead of any if you know the expected structure.
        this.messages.push(JSON.stringify(data));
      });

      // Ensure connection is open
      await useSharedWorkerCall('connect_websocket');
    },

    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    },

    async sendMessage() {
      if (!this.message.trim()) return;

      let parsed;
      try {
        parsed = JSON.parse(this.message);
      } catch (err) {
        this.messages.push('[Invalid JSON]');
        return;
      }

      await useSharedWorkerCall('send_websocket', parsed);
      this.messages.push(`→ ${this.message}`);
      this.message = '';
    }
  }));
};
