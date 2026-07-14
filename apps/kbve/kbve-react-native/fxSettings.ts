/// Live FX controls shared between the switcher UI and the effect host. The
/// host reads `.current` every frame, so writes take effect immediately without
/// re-rendering React. A globalThis singleton survives Metro double-eval.
export interface FxSettings {
	speed: number;
	intensity: number;
}

const KEY = '__kbveFxSettings';
const scope = globalThis as unknown as Record<string, unknown>;

export const fxSettings: { current: FxSettings } = (scope[KEY] as {
	current: FxSettings;
}) ?? { current: { speed: 1, intensity: 1 } };
scope[KEY] = fxSettings;
