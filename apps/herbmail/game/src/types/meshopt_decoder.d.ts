declare module 'three/examples/jsm/libs/meshopt_decoder.module.js' {
	export const MeshoptDecoder: {
		ready: Promise<void>;
		supported: boolean;
		useWorkers(count: number): void;
		decodeVertexBuffer(
			target: Uint8Array,
			count: number,
			size: number,
			source: Uint8Array,
			filter?: string,
		): void;
		decodeIndexBuffer(
			target: Uint8Array,
			count: number,
			size: number,
			source: Uint8Array,
		): void;
		decodeIndexSequence(
			target: Uint8Array,
			count: number,
			size: number,
			source: Uint8Array,
		): void;
		decodeGltfBuffer(
			target: Uint8Array,
			count: number,
			size: number,
			source: Uint8Array,
			mode: string,
			filter?: string,
		): void;
		decodeGltfBufferAsync(
			count: number,
			size: number,
			source: Uint8Array,
			mode: string,
			filter?: string,
		): Promise<Uint8Array>;
	};
}
