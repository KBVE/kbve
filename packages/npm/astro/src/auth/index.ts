export { AuthBridge, type OAuthProvider } from './AuthBridge';
export { useAuthBridge } from './useAuthBridge';
export { bootAuth, resolveStaffFlag } from './bootAuth';
export { IDBStorage } from './IDBStorage';
export {
	setSharedToken,
	getSharedToken,
	clearSharedToken,
} from './cross-domain';
export {
	registerSupabaseGateway,
	getSupabaseGateway,
	getAccessToken,
} from './registry';
export { useSession, type SessionView } from './useSession';
