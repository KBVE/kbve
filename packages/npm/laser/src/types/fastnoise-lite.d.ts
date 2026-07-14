declare module 'fastnoise-lite' {
	export default class FastNoiseLite {
		constructor(seed?: number);
		static NoiseType: {
			OpenSimplex2: unknown;
			OpenSimplex2S: unknown;
			Cellular: unknown;
			Perlin: unknown;
			ValueCubic: unknown;
			Value: unknown;
		};
		static FractalType: {
			None: unknown;
			FBm: unknown;
			Ridged: unknown;
			PingPong: unknown;
			DomainWarpProgressive: unknown;
			DomainWarpIndependent: unknown;
		};
		SetSeed(seed: number): void;
		SetNoiseType(type: unknown): void;
		SetFractalType(type: unknown): void;
		SetFrequency(frequency: number): void;
		SetFractalOctaves(octaves: number): void;
		SetFractalGain(gain: number): void;
		SetFractalLacunarity(lacunarity: number): void;
		GetNoise(x: number, y: number, z?: number): number;
	}
}
