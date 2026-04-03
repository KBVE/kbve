/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

console.log("main function started");

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";
const PUBLIC_ROUTES = new Set(["health"]);

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer") {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }
  return token;
}

async function verifyJWT(jwt: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(JWT_SECRET);
  try {
    await jose.jwtVerify(jwt, secretKey);
  } catch (err) {
    console.error(err);
    return false;
  }
  return true;
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const service_name = url.pathname.split("/")[1];

  if (
    req.method !== "OPTIONS" && VERIFY_JWT && !PUBLIC_ROUTES.has(service_name)
  ) {
    try {
      const token = getAuthToken(req);
      const isValidJWT = await verifyJWT(token);

      if (!isValidJWT) {
        return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error(e);
      return new Response(
        JSON.stringify({ msg: "Authentication failed" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  if (!service_name || service_name === "") {
    const error = { msg: "missing function name in request" };
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const servicePath = `/home/deno/functions/${service_name}`;
  console.error(`serving the request with ${servicePath}`);

  const memoryLimitMb = 150;
  const workerTimeoutMs = 1 * 60 * 1000;
  const noModuleCache = false;
  const importMapPath = null;

  // Principle of least privilege: only pass env vars that workers need.
  // Secrets are allowlisted per-function; anything not listed is withheld.
  const SHARED_ENV = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
    "DENO_DEPLOYMENT_ID",
  ];
  const FUNCTION_ENV: Record<string, string[]> = {
    discordsh: ["HCAPTCHA_SECRET"],
    argo: ["ARGOCD_UPSTREAM_URL", "ARGOCD_AUTH_TOKEN"],
    "guild-vault": [],
    "user-vault": [],
    "vault-reader": [],
    meme: [],
    ows: ["FIRECRACKER_URL"],
    irc: ["ERGO_IRC_HOST", "ERGO_IRC_PORT"],
    logs: ["CLICKHOUSE_URL", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"],
    health: [],
  };
  const allowedKeys = new Set([
    ...SHARED_ENV,
    ...(FUNCTION_ENV[service_name] || []),
  ]);
  const allEnv = Deno.env.toObject();
  const envVars: [string, string][] = Object.entries(allEnv).filter(
    ([key]) => allowedKeys.has(key),
  );

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error("Worker error:", e);
    return new Response(
      JSON.stringify({ msg: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
