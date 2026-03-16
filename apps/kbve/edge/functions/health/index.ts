import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface EdgeFunction {
  name: string;
  label: string;
  description: string;
}

interface EdgeManifest {
  version: string;
  functions: EdgeFunction[];
}

async function loadManifest(): Promise<EdgeManifest> {
  const fallback: EdgeManifest = { version: "0.1.11", functions: [] };

  const envVersion = Deno.env.get("EDGE_VERSION");

  try {
    const toml = await Deno.readTextFile("/home/deno/version.toml");

    // Parse version
    const versionMatch = toml.match(/^version\s*=\s*"([^"]+)"/m);
    const version = envVersion ?? versionMatch?.[1] ?? fallback.version;

    // Parse [[functions]] blocks
    const functions: EdgeFunction[] = [];
    const blocks = toml.split(/\[\[functions\]\]/g).slice(1);

    for (const block of blocks) {
      const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const label = block.match(/^label\s*=\s*"([^"]+)"/m)?.[1];
      const description = block.match(/^description\s*=\s*"([^"]+)"/m)?.[1];
      if (name && label && description) {
        functions.push({ name, label, description });
      }
    }

    return { version, functions };
  } catch {
    return { ...fallback, version: envVersion ?? fallback.version };
  }
}

const manifest = await loadManifest();

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      version: manifest.version,
      functions: manifest.functions,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
