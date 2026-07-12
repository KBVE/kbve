// mecs — Multi-thread Entity Component System. A SharedArrayBuffer-backed store
// whose entity membership lives in the buffer, so the same world maps across
// worker + main thread and queries run on either side. Separate from the bitecs
// `@kbve/laser/ecs` subpath on purpose: no dependency, no name collisions, and
// framework-free (no three/react/rapier) so a worker can import it cheaply.

export {
	createSabWorld,
	sabBytes,
	type SabWorld,
	type Schema,
	type FieldType,
} from './lib/mecs/sab';
