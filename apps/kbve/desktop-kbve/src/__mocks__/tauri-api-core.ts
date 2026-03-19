// Mock for @tauri-apps/api/core — used in tests and CI where Tauri is not available.
export async function invoke(_cmd: string, _args?: unknown): Promise<unknown> {
	return undefined;
}
