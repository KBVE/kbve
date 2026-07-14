import { createSignal, createEventBus } from '@kbve/core';
import type { Signal, EventBus } from '@kbve/core';
import { RingBuffer } from './ringBuffer';
import type {
	Toast,
	ToastInput,
	ToastSnapshot,
	ToastEvents,
	ToastDismissReason,
	ToastQueueOptions,
	ToastScheduler,
	ToastTone,
} from './types';

const defaultScheduler: ToastScheduler = {
	set: (fn, ms) => setTimeout(fn, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Tracked {
	toast: Toast;
	timer: unknown;
	remaining: number;
	startedAt: number;
}

export class ToastQueue {
	readonly signal: Signal<ToastSnapshot>;
	readonly bus: EventBus<ToastEvents>;

	private readonly maxVisible: number;
	private readonly capacity: number;
	private readonly defaultDurationMs: number;
	private readonly now: () => number;
	private readonly scheduler: ToastScheduler;
	private readonly history: RingBuffer<Toast>;

	private visible: Tracked[] = [];
	private pending: Toast[] = [];
	private paused = false;
	private seq = 0;

	constructor(options: ToastQueueOptions = {}) {
		this.maxVisible = options.maxVisible ?? 3;
		this.capacity = options.capacity ?? 32;
		this.defaultDurationMs = options.defaultDurationMs ?? 4000;
		this.now = options.now ?? (() => Date.now());
		this.scheduler = options.scheduler ?? defaultScheduler;
		this.history = new RingBuffer<Toast>(options.historyCapacity ?? 50);
		this.signal = createSignal<ToastSnapshot>({
			visible: [],
			pending: 0,
			history: [],
		});
		this.bus = createEventBus<ToastEvents>();
	}

	push(input: ToastInput): string {
		const existing = input.dedupeKey
			? this.find(input.dedupeKey)
			: undefined;
		if (existing) {
			this.refresh(existing, input);
			return existing.id;
		}
		const toast: Toast = {
			id: `toast-${this.seq++}`,
			message: input.message,
			tone: input.tone ?? 'neutral',
			priority: input.priority ?? 10,
			durationMs: input.durationMs ?? this.defaultDurationMs,
			dedupeKey: input.dedupeKey,
			action: input.action,
			meta: input.meta,
			createdAt: this.now(),
			status: 'queued',
		};
		if (this.visible.length < this.maxVisible) {
			this.show(toast);
		} else {
			this.enqueue(toast);
		}
		this.emitSnapshot();
		return toast.id;
	}

	dismiss(id: string, reason: ToastDismissReason = 'user'): void {
		const i = this.visible.findIndex((t) => t.toast.id === id);
		if (i === -1) {
			const p = this.pending.findIndex((t) => t.id === id);
			if (p !== -1) {
				const [removed] = this.pending.splice(p, 1);
				this.finalize(removed, reason);
				this.emitSnapshot();
			}
			return;
		}
		const tracked = this.visible[i];
		this.disarm(tracked);
		this.visible.splice(i, 1);
		this.finalize(tracked.toast, reason);
		this.promote();
		this.emitSnapshot();
	}

	clear(): void {
		for (const t of this.visible) {
			this.disarm(t);
			this.finalize(t.toast, 'cleared');
		}
		for (const p of this.pending) {
			this.finalize(p, 'cleared');
		}
		this.visible = [];
		this.pending = [];
		this.bus.emit('clear', undefined as never);
		this.emitSnapshot();
	}

	pause(): void {
		if (this.paused) return;
		this.paused = true;
		for (const t of this.visible) this.disarm(t);
	}

	resume(): void {
		if (!this.paused) return;
		this.paused = false;
		for (const t of this.visible) this.arm(t);
	}

	getSnapshot(): ToastSnapshot {
		return this.signal.get();
	}

	success(
		message: string,
		input?: Omit<ToastInput, 'message' | 'tone'>,
	): string {
		return this.tone('success', message, input);
	}

	danger(
		message: string,
		input?: Omit<ToastInput, 'message' | 'tone'>,
	): string {
		return this.tone('danger', message, input);
	}

	warning(
		message: string,
		input?: Omit<ToastInput, 'message' | 'tone'>,
	): string {
		return this.tone('warning', message, input);
	}

	info(
		message: string,
		input?: Omit<ToastInput, 'message' | 'tone'>,
	): string {
		return this.tone('info', message, input);
	}

	private tone(
		tone: ToastTone,
		message: string,
		input?: Omit<ToastInput, 'message' | 'tone'>,
	): string {
		return this.push({ ...input, message, tone });
	}

	private enqueue(toast: Toast): void {
		toast.status = 'queued';
		const idx = this.pending.findIndex((p) => p.priority < toast.priority);
		if (idx === -1) this.pending.push(toast);
		else this.pending.splice(idx, 0, toast);
		if (this.pending.length > this.capacity) {
			const dropped = this.pending.pop();
			if (dropped) this.finalize(dropped, 'replaced');
		}
	}

	private show(toast: Toast): void {
		toast.status = 'visible';
		const tracked: Tracked = {
			toast,
			timer: null,
			remaining: toast.durationMs,
			startedAt: this.now(),
		};
		this.visible.push(tracked);
		this.bus.emit('show', toast);
		if (!this.paused) this.arm(tracked);
	}

	private promote(): void {
		while (this.visible.length < this.maxVisible && this.pending.length) {
			const next = this.pending.shift();
			if (next) this.show(next);
		}
	}

	private arm(tracked: Tracked): void {
		if (tracked.toast.durationMs <= 0) return;
		tracked.startedAt = this.now();
		tracked.timer = this.scheduler.set(
			() => this.dismiss(tracked.toast.id, 'expired'),
			tracked.remaining,
		);
	}

	private disarm(tracked: Tracked): void {
		if (tracked.timer != null) {
			this.scheduler.clear(tracked.timer);
			tracked.timer = null;
			tracked.remaining = Math.max(
				0,
				tracked.remaining - (this.now() - tracked.startedAt),
			);
		}
	}

	private finalize(toast: Toast, reason: ToastDismissReason): void {
		toast.status = reason === 'expired' ? 'expired' : 'dismissed';
		this.history.push(toast);
		this.bus.emit('dismiss', { toast, reason });
	}

	private find(key: string): Toast | undefined {
		return (
			this.visible.find((t) => t.toast.dedupeKey === key)?.toast ??
			this.pending.find((t) => t.dedupeKey === key)
		);
	}

	private refresh(toast: Toast, input: ToastInput): void {
		toast.message = input.message;
		toast.tone = input.tone ?? toast.tone;
		if (input.action) toast.action = input.action;
		if (input.meta) toast.meta = input.meta;
		const tracked = this.visible.find((t) => t.toast.id === toast.id);
		if (tracked) {
			this.disarm(tracked);
			tracked.remaining = input.durationMs ?? toast.durationMs;
			if (!this.paused) this.arm(tracked);
		}
		this.emitSnapshot();
	}

	private emitSnapshot(): void {
		this.signal.set({
			visible: this.visible.map((t) => t.toast),
			pending: this.pending.length,
			history: this.history.toArray(),
		});
	}
}

export function createToastQueue(options?: ToastQueueOptions): ToastQueue {
	return new ToastQueue(options);
}

export const toasts = createToastQueue();
