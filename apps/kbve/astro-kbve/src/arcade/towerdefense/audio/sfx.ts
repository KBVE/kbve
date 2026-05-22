const STORAGE_KEY = 'td_audio_muted';

interface SfxConfig {
	freq: number;
	endFreq?: number;
	durationMs: number;
	type?: OscillatorType;
	volume?: number;
}

const SFX: Record<string, SfxConfig> = {
	tower_fire: {
		freq: 720,
		endFreq: 540,
		durationMs: 70,
		type: 'square',
		volume: 0.04,
	},
	enemy_hit: {
		freq: 360,
		endFreq: 240,
		durationMs: 60,
		type: 'triangle',
		volume: 0.05,
	},
	enemy_die: {
		freq: 220,
		endFreq: 90,
		durationMs: 180,
		type: 'sawtooth',
		volume: 0.06,
	},
	wave_start: {
		freq: 440,
		endFreq: 660,
		durationMs: 220,
		type: 'sine',
		volume: 0.08,
	},
	place_building: {
		freq: 520,
		endFreq: 780,
		durationMs: 90,
		type: 'sine',
		volume: 0.07,
	},
	demolish: {
		freq: 180,
		endFreq: 60,
		durationMs: 240,
		type: 'sawtooth',
		volume: 0.07,
	},
	card_pick: {
		freq: 880,
		endFreq: 1320,
		durationMs: 140,
		type: 'triangle',
		volume: 0.06,
	},
	game_over: {
		freq: 200,
		endFreq: 50,
		durationMs: 600,
		type: 'square',
		volume: 0.08,
	},
	nexus_hit: {
		freq: 140,
		endFreq: 80,
		durationMs: 90,
		type: 'sawtooth',
		volume: 0.07,
	},
};

export type SfxId = keyof typeof SFX;

export class SfxPlayer {
	private ctx: AudioContext | null = null;
	private muted = false;
	private lastPlayedAt = new Map<string, number>();

	constructor() {
		if (typeof window === 'undefined') return;
		try {
			this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
		} catch {
			this.muted = false;
		}
	}

	private ensureCtx(): AudioContext | null {
		if (this.ctx) return this.ctx;
		if (typeof window === 'undefined') return null;
		const W = window as typeof window & {
			webkitAudioContext?: typeof AudioContext;
		};
		const Ctor = window.AudioContext || W.webkitAudioContext;
		if (!Ctor) return null;
		this.ctx = new Ctor();
		return this.ctx;
	}

	isMuted(): boolean {
		return this.muted;
	}

	toggleMute(): boolean {
		this.muted = !this.muted;
		try {
			window.localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
		} catch {
			// ignore
		}
		return this.muted;
	}

	play(id: SfxId, throttleMs = 35): void {
		if (this.muted) return;
		const cfg = SFX[id];
		if (!cfg) return;
		const now =
			typeof performance !== 'undefined' ? performance.now() : Date.now();
		const last = this.lastPlayedAt.get(id) ?? -Infinity;
		if (now - last < throttleMs) return;
		this.lastPlayedAt.set(id, now);
		const ctx = this.ensureCtx();
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = cfg.type ?? 'sine';
		const startAt = ctx.currentTime;
		const endAt = startAt + cfg.durationMs / 1000;
		osc.frequency.setValueAtTime(cfg.freq, startAt);
		if (cfg.endFreq !== undefined) {
			osc.frequency.exponentialRampToValueAtTime(
				Math.max(40, cfg.endFreq),
				endAt,
			);
		}
		const vol = cfg.volume ?? 0.05;
		gain.gain.setValueAtTime(vol, startAt);
		gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
		osc.connect(gain).connect(ctx.destination);
		osc.start(startAt);
		osc.stop(endAt + 0.01);
	}
}
