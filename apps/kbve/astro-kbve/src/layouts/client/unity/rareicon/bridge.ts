import { $deployable } from './store';
import {
	DeployableMessageSchema,
	BackgroundShiftMessageSchema,
	UnityBridgeSchema,
} from './schemas';
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
			const msg = UnityBridgeSchema.parse(parsed);

			switch (msg.type) {
				case 'deployable': {
					const html = buildDeployableHtmlMessage(
						msg.prefab,
						msg.status,
					);
					$deployable.set(msg);

					window.kbve?.uiux?.openPanel?.('right', {
						rawHtml: html,
					});
					break;
				}
				case 'background-shift': {
					const el = document.getElementById('kbve-body');
					if (el) {
						// You can define a map of background keys to Tailwind or hex colors
						const bgMap: Record<string, string> = {
							forest: 'bg-green-900',
							desert: 'bg-yellow-800',
							map: 'bg-sky-900',
							default: 'bg-stone-950',
						};

						// Remove old bg-* classes
						const oldClasses = Array.from(el.classList).filter(
							(cls) => cls.startsWith('bg-'),
						);
						el.classList.remove(...oldClasses);

						// Add the new one
						const newClass = bgMap[msg.key] || bgMap.default;
						el.classList.add(newClass);
					}
					break;
				}
				default:
					console.warn('[UnityBridge] Unknown message type:', msg);
			}
		} catch (err) {
			console.error('[UnityBridge] Invalid unity message:', err);
		}
	};
}

export function unregisterUnityBridge() {
	delete window.unityBridge;
}
