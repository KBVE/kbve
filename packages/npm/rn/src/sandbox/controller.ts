import type { Capability } from '../plugin/capability';
import type { UIEntity } from '../ui/models';
import { HostBridge } from './bridge';
import { encodeHostMessage, parsePluginMessage } from './protocol';
import type { HostToPlugin } from './protocol';

export interface SandboxCallbacks {
	onReady?: () => void;
	onRender?: (entities: UIEntity[]) => void;
	onLog?: (level: string, message: string) => void;
	onError?: (message: string) => void;
}

export interface SandboxControllerConfig {
	pluginId: string;
	capabilities: Capability[];
	bridge: HostBridge;
	send: (raw: string) => void;
	callbacks?: SandboxCallbacks;
}

export class SandboxController {
	private ready = false;

	constructor(private readonly config: SandboxControllerConfig) {}

	private post(message: HostToPlugin): void {
		this.config.send(encodeHostMessage(message));
	}

	init(): void {
		this.post({
			kind: 'host/init',
			pluginId: this.config.pluginId,
			capabilities: this.config.capabilities,
		});
	}

	emit(topic: string, payload: unknown): void {
		if (!this.ready) return;
		this.post({ kind: 'host/event', topic, payload });
	}

	handleRaw(raw: string): void {
		const message = parsePluginMessage(raw);
		if (!message) return;
		const cb = this.config.callbacks;
		switch (message.kind) {
			case 'plugin/ready':
				this.ready = true;
				cb?.onReady?.();
				break;
			case 'plugin/render':
				cb?.onRender?.(message.entities);
				break;
			case 'plugin/log':
				cb?.onLog?.(message.level, message.message);
				break;
			case 'plugin/error':
				cb?.onError?.(message.message);
				break;
			case 'plugin/call':
				void this.dispatchCall(
					message.id,
					message.capability,
					message.method,
					message.params,
				);
				break;
		}
	}

	private async dispatchCall(
		id: number,
		capability: Capability,
		method: string,
		params: unknown,
	): Promise<void> {
		try {
			const result = await this.config.bridge.invoke(
				capability,
				method,
				params,
			);
			this.post({ kind: 'host/response', id, ok: true, result });
		} catch (error) {
			this.post({
				kind: 'host/response',
				id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
