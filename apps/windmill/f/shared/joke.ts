export type Joke = {
  text: string;
  source: string;
  label: string;
  url?: string;
};

const SOURCES = ["dad", "chuck", "twopart"] as const;
export type JokeSource = (typeof SOURCES)[number];

const ALIASES: Record<string, JokeSource> = {
  dad: "dad",
  dadjoke: "dad",
  chuck: "chuck",
  chucknorris: "chuck",
  norris: "chuck",
  twopart: "twopart",
  setup: "twopart",
  general: "twopart",
};

export const JOKE_SOURCES = SOURCES;

function resolveSource(raw: string): JokeSource {
  const key = raw.trim().toLowerCase();
  if (key && ALIASES[key]) return ALIASES[key];
  return SOURCES[Math.floor(Math.random() * SOURCES.length)];
}

async function getJson(url: string, accept = "application/json"): Promise<any> {
  const resp = await fetch(url, { headers: { accept } });
  if (!resp.ok) throw new Error(`${url} ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function fetchJoke(source = ""): Promise<Joke> {
  const pick = resolveSource(source);

  if (pick === "dad") {
    const d = await getJson("https://icanhazdadjoke.com/");
    return { text: String(d.joke).trim(), source: "dad", label: "Dad joke" };
  }

  if (pick === "chuck") {
    const d = await getJson("https://api.chucknorris.io/jokes/random");
    return {
      text: String(d.value).trim(),
      source: "chuck",
      label: "Chuck Norris",
      url: d.url,
    };
  }

  const d = await getJson("https://official-joke-api.appspot.com/random_joke");
  return {
    text: `${String(d.setup).trim()}\n\n||${String(d.punchline).trim()}||`,
    source: "twopart",
    label: "Two-part joke",
  };
}

export async function main(source = ""): Promise<Joke> {
  return fetchJoke(source);
}
