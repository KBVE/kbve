import { $deployable } from './store';
import { DeployableMessageSchema } from './schemas';

declare global {
  interface Window {
    unityBridge?: (json: string) => void;
  }
}

export function registerUnityBridge() {
  window.unityBridge = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const msg = DeployableMessageSchema.parse(parsed);

      $deployable.set(msg);

      // Open panel with a simple message
      const message = msg.status === 'success'
        ? `✅ Deployed <strong>${msg.prefab}</strong>`
        : `❌ Deployment blocked: <strong>${msg.prefab}</strong>`;

      window.kbve?.uiux?.openPanel?.('right', {
        rawHtml: `<div style="padding:1rem;font-size:1.1rem;">${message}</div>`,
      });

    } catch (err) {
      console.error('[UnityBridge] Invalid deployable message:', err);
    }
  };
}

export function unregisterUnityBridge() {
  delete window.unityBridge;
}
