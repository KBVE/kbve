/**
 * Vitest-only stand-in for the @kbve/laser runtime barrel. The real barrel
 * value-exports Phaser-backed helpers node-env vitest cannot load. This stub
 * re-exports the pure leaves the spec import graphs actually execute
 * (heightfield via iso.ts, game-auth via config.ts, the Cat enum via
 * targetLock.ts); laser type-only imports are erased before resolution and
 * never reach it.
 */
export * from '../../../../../../packages/npm/laser/src/lib/determ/heightfield';
export * from '../../../../../../packages/npm/laser/src/lib/auth/game-auth';
export { Cat } from '../../../../../../packages/npm/laser/src/lib/ecs/store';
