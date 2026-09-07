// Deno globals (Deno.env, Deno.readTextFile) come from the runtime's own
// lib.deno.ns.d.ts. A local `declare namespace Deno` shadowed it and collided
// once the toolchain was pinned to the deno the edge runtime actually bundles.

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
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}
