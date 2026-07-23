export type SupabaseResource = {
  url: string;
  service_key: string;
};

export type Profile = {
  linked: boolean;
  kbveUsername: string | null;
  credits: number;
  khash: number;
  cached: boolean;
};

type ProxyRow = {
  linked: boolean;
  user_id: string | null;
  kbve_username: string | null;
  credits: number;
  khash: number;
};

const CACHE_TTL_SECS = 60;
const CACHE_PREFIX = "wm:profile:";

/// Best-effort Valkey read. Any failure (no client, no url, network) returns
/// null so the caller falls through to PostgREST — the cache is never load-bearing.
async function cacheGet(url: string | undefined, key: string): Promise<Profile | null> {
  if (!url) return null;
  try {
    const RedisClient = (globalThis as any).Bun?.RedisClient;
    if (!RedisClient) return null;
    const client = new RedisClient(url);
    const raw = await client.get(key);
    client.close?.();
    if (!raw) return null;
    return { ...(JSON.parse(raw) as Profile), cached: true };
  } catch {
    return null;
  }
}

/// Best-effort Valkey write with TTL. Silently no-ops on any failure.
async function cacheSet(url: string | undefined, key: string, value: Profile): Promise<void> {
  if (!url) return;
  try {
    const RedisClient = (globalThis as any).Bun?.RedisClient;
    if (!RedisClient) return;
    const client = new RedisClient(url);
    await client.set(key, JSON.stringify({ ...value, cached: false }), "EX", CACHE_TTL_SECS);
    client.close?.();
  } catch {
    /* cache is advisory only */
  }
}

async function fetchFromDb(sb: SupabaseResource, discordId: string): Promise<Profile> {
  const resp = await fetch(`${sb.url.replace(/\/$/, "")}/rest/v1/rpc/proxy_discord_profile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      apikey: sb.service_key,
      authorization: `Bearer ${sb.service_key}`,
    },
    body: JSON.stringify({ p_discord_id: discordId }),
  });
  if (!resp.ok) {
    throw new Error(`proxy_discord_profile ${resp.status}: ${await resp.text()}`);
  }

  const rows = (await resp.json()) as ProxyRow[];
  const row = Array.isArray(rows) ? rows[0] : (rows as ProxyRow | undefined);
  if (!row || !row.linked) {
    return { linked: false, kbveUsername: null, credits: 0, khash: 0, cached: false };
  }
  return {
    linked: true,
    kbveUsername: row.kbve_username,
    credits: Number(row.credits) || 0,
    khash: Number(row.khash) || 0,
    cached: false,
  };
}

export async function fetchProfile(
  discordId: string,
  sb: SupabaseResource,
  valkeyUrl?: string,
): Promise<Profile> {
  if (!/^[0-9]{15,25}$/.test(discordId)) {
    return { linked: false, kbveUsername: null, credits: 0, khash: 0, cached: false };
  }

  const key = `${CACHE_PREFIX}${discordId}`;
  const hit = await cacheGet(valkeyUrl, key);
  if (hit) return hit;

  const profile = await fetchFromDb(sb, discordId);
  if (profile.linked) await cacheSet(valkeyUrl, key, profile);
  return profile;
}

/// Credits are USD-pegged: $1 = 100,000 credits. Render as a dollar string.
export function creditsToUsd(credits: number): string {
  return `$${(credits / 100_000).toFixed(2)}`;
}
