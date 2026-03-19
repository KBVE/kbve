// Mock for @tauri-apps/api/event — used in tests and CI where Tauri is not available.
export type UnlistenFn = () => void;

export async function listen<T>(
	_event: string,
	_handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
	// no-op in test environment
	return () => undefined;
}

export async function emit(_event: string, _payload?: unknown): Promise<void> {
	// no-op in test environment
}
