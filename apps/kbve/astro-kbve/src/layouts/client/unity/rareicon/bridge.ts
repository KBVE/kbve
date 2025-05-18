import { $deployable } from './store';
import { DeployableMessageSchema } from './schemas';
import type { DeploymentStatus } from './schemas';

declare global {
	interface Window {
		unityBridge?: (json: string) => void;
	}
}

const statusMeta: Record<
	DeploymentStatus,
	{ emoji: string; color: string; message: (prefab: string) => string }
> = {
	success: {
		emoji: '✅',
		color: '#22c55e',
		message: (prefab) => `Deployed <strong>${prefab}</strong>`,
	},
	blocked: {
		emoji: '❌',
		color: '#ef4444',
		message: (prefab) => `Deployment blocked: <strong>${prefab}</strong>`,
	},
};

function buildDeployableHtmlMessage(
	prefab: string,
	status: DeploymentStatus,
): string {
	const meta = statusMeta[status];

	return `
    <div style="
      padding: 1rem;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: ${meta.color};
    ">
      <span style="font-size: 1.4rem;">${meta.emoji}</span>
      <span>${meta.message(prefab)}</span>
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
