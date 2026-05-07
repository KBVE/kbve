import { jsonResponse, type McRequest } from "./_shared.ts";

const MOJANG_API = "https://api.mojang.com/users/profiles/minecraft";
const LOOKUP_TIMEOUT_MS = 5000;
const USERNAME_RE = /^[A-Za-z0-9_]{2,16}$/;

type Handler = (mcReq: McRequest) => Promise<Response>;

const cache = new Map<string, { data: { mc_uuid: string; username: string }; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key: string, data: { mc_uuid: string; username: string }) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

const handlers: Record<string, Handler> = {
  async lookup({ body }) {
    const { username } = body;
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      return jsonResponse(
        { error: "username must be 2-16 chars of [A-Za-z0-9_]" },
        400,
      );
    }

    const cacheKey = username.toLowerCase();
    const cached = cacheGet(cacheKey);
    if (cached) {
      return jsonResponse({ found: true, ...cached, cached: true });
    }

    let resp: Response;
    try {
      resp = await fetch(`${MOJANG_API}/${encodeURIComponent(username)}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "fetch failed";
      return jsonResponse(
        { error: `Mojang lookup failed: ${reason}` },
        502,
      );
    }

    if (resp.status === 404 || resp.status === 204) {
      return jsonResponse({ found: false });
    }
    if (!resp.ok) {
      return jsonResponse(
        { error: `Mojang lookup returned ${resp.status}` },
        502,
      );
    }

    const data = await resp.json().catch(() => null);
    if (!data || typeof data.id !== "string" || typeof data.name !== "string") {
      return jsonResponse(
        { error: "Mojang returned unexpected payload" },
        502,
      );
    }

    const mc_uuid = data.id.toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(mc_uuid)) {
      return jsonResponse(
        { error: "Mojang returned malformed UUID" },
        502,
      );
    }

    const result = { mc_uuid, username: data.name };
    cacheSet(cacheKey, result);
    return jsonResponse({ found: true, ...result });
  },
};

export const MOJANG_ACTIONS = Object.keys(handlers);

export async function handleMojang(mcReq: McRequest): Promise<Response> {
  const handler = handlers[mcReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown mojang action: ${mcReq.action}. Use: ${MOJANG_ACTIONS.join(", ")}`,
      },
      400,
    );
  }
  return handler(mcReq);
}
