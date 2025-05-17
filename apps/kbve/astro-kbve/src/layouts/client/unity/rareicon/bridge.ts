import { $deployable } from './store';
import { DeployableMessageSchema } from './schemas';

declare global {
  interface Window {
    unityBridge?: (json: string) => void;
  }
}


function buildDeployableHtmlMessage(prefab: string, status: 'success' | 'blocked'): string {
  const emoji = status === 'success' ? '✅' : '❌';
  const message = status === 'success'
    ? `Deployed <strong>${prefab}</strong>`
    : `Deployment blocked: <strong>${prefab}</strong>`;

  return `
    <div style="
      padding: 1rem;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: ${status === 'success' ? '#22c55e' : '#ef4444'};
    ">
      <span style="font-size: 1.4rem;">${emoji}</span>
      <span>${message}</span>
    </div>
  `;
}

export function registerUnityBridge() {

  if (window.unityBridge) {
    console.warn('[UnityBridge] Already registered.');
    return;
  }
  
  window.unityBridge = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const msg = DeployableMessageSchema.parse(parsed);

      $deployable.set(msg);

      const html = buildDeployableHtmlMessage(msg.prefab, msg.status);

      window.kbve?.uiux?.openPanel?.('right', {
        rawHtml: html,
      });

    } catch (err) {
      console.error('[UnityBridge] Invalid deployable message:', err);
    }
  };
}

export function unregisterUnityBridge() {
  delete window.unityBridge;
}
