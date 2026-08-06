// Mock for @tauri-apps/api/core — used in tests and CI where Tauri is not available.
// Tests can register a per-command handler to script backend responses and
// assert on the calls the frontend made.

type InvokeHandler = (cmd: string, args?: unknown) => unknown;

let handler: InvokeHandler = () => undefined;

export const __invokeCalls: Array<{ cmd: string; args?: unknown }> = [];

export function __setInvokeHandler(fn: InvokeHandler): void {
	handler = fn;
}

export function __resetInvokeMock(): void {
	handler = () => undefined;
	__invokeCalls.length = 0;
}

export async function invoke(cmd: string, args?: unknown): Promise<unknown> {
	__invokeCalls.push({ cmd, args });
	return handler(cmd, args);
}
