// src/lib/gateway/index.ts
// Main exports for Supabase Gateway

export { SupabaseGateway } from './SupabaseGateway';
export { WorkerPool } from './WorkerPool';
export {
	getWorkerCommunication,
	WorkerCommunication,
} from './WorkerCommunication';
export {
	detectCapabilities,
	selectStrategy,
	logCapabilities,
	getStrategyDescription,
} from './capabilities';
export * from './types';
export { SharedWorkerStrategy } from './strategies/SharedWorkerStrategy';
export { WebWorkerStrategy } from './strategies/WebWorkerStrategy';
export { DirectStrategy } from './strategies/DirectStrategy';
