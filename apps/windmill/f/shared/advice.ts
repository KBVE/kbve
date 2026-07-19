export type Advice = {
  text: string;
  id: number;
  label: string;
};

const BASE = "https://api.adviceslip.com";

async function getJson(url: string): Promise<any> {
  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`${url} ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function fetchAdvice(query = ""): Promise<Advice> {
  const q = query.trim();

  if (q) {
    const data = await getJson(`${BASE}/advice/search/${encodeURIComponent(q)}`);
    const slips = data?.slips;
    if (!Array.isArray(slips) || slips.length === 0) {
      throw new Error(`no advice found for "${q}"`);
    }
    const slip = slips[Math.floor(Math.random() * slips.length)];
    return { text: String(slip.advice).trim(), id: slip.id, label: "Advice Slip" };
  }

  const bust = Math.floor(Math.random() * 1e9);
  const data = await getJson(`${BASE}/advice?_=${bust}`);
  const slip = data?.slip;
  if (!slip) throw new Error("no advice returned");
  return { text: String(slip.advice).trim(), id: slip.id, label: "Advice Slip" };
}

export async function main(query = ""): Promise<Advice> {
  return fetchAdvice(query);
}
