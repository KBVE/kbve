// Deno global types
declare namespace Deno {
	interface Env {
		get(key: string): string | undefined;
		toObject(): Record<string, string>;
	}
	const env: Env;
}

// Edge Runtime types
declare namespace EdgeRuntime {
	interface UserWorkerOptions {
		servicePath: string;
		memoryLimitMb: number;
		workerTimeoutMs: number;
		noModuleCache: boolean;
		importMapPath: string | null;
		envVars: [string, string][];
	}

	interface UserWorker {
		fetch(request: Request): Promise<Response>;
	}

	const userWorkers: {
		create(options: UserWorkerOptions): Promise<UserWorker>;
	};
}

// Module declarations for Deno imports
declare module 'https://deno.land/std@0.131.0/http/server.ts' {
	export function serve(
		handler: (request: Request) => Response | Promise<Response>,
	): void;
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
	export function serve(
		handler: (request: Request) => Response | Promise<Response>,
	): void;
}

declare module 'https://deno.land/x/jose@v4.14.4/index.ts' {
	import type { JWTPayload } from 'jose';
	export function jwtVerify(
		jwt: string,
		key: Uint8Array,
		options?: { algorithms?: string[] },
	): Promise<{ payload: JWTPayload & Record<string, unknown> }>;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
	export { createClient } from '@supabase/supabase-js';
}
