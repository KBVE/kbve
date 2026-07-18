type RegistryDoc = {
  error?: string;
  description?: string;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
  homepage?: string;
};

type PkgInfo = {
  name: string;
  version: string;
  description: string;
  published: number | null;
  url: string;
};

const MAINTAINED = [
  "chat",
  "devops",
  "droid",
  "khashvault",
  "laser",
];

const REGISTRY = "https://registry.npmjs.org";
const NPM_COLOR = 0xcb3837;
const DAY = 86_400_000;

function ago(ts: number | null): string {
  if (ts === null) return "unpublished";
  const days = Math.floor((Date.now() - ts) / DAY);
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

async function fetchPkg(short: string): Promise<PkgInfo | null> {
  const name = `@kbve/${short}`;
  const resp = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) return null;

  const doc = (await resp.json()) as RegistryDoc;
  if (doc.error) return null;

  const version = doc["dist-tags"]?.latest ?? "0.0.0";
  const pubIso = doc.time?.[version];
  return {
    name,
    version,
    description: doc.description ?? "",
    published: pubIso ? Date.parse(pubIso) : null,
    url: `https://www.npmjs.com/package/${name}`,
  };
}

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const filter = args.join(" ").trim().toLowerCase();
  const targets = filter
    ? MAINTAINED.filter((p) => p.includes(filter.replace(/^@kbve\//, "")))
    : MAINTAINED;

  const settled = await Promise.all(targets.map(fetchPkg));
  const pkgs = settled
    .filter((p): p is PkgInfo => p !== null)
    .sort((a, b) => (b.published ?? 0) - (a.published ?? 0));

  if (pkgs.length === 0) {
    throw new Error(
      filter
        ? `no maintained @kbve npm package matches "${filter}"`
        : "no @kbve npm packages resolved from registry",
    );
  }

  const fields = pkgs.map((p) => ({
    name: `${p.name} \`${p.version}\``,
    value: `${p.description || "—"}\n${ago(p.published)} · [npm](${p.url})`,
    inline: false,
  }));

  const requestedBy = (discord?.username as string) ?? null;

  return {
    embed: {
      title: "KBVE · maintained npm packages",
      description:
        "Live from the npm registry — packages we ship from the `kbve` monorepo (`packages/npm/*`).",
      url: "https://www.npmjs.com/org/kbve",
      color: NPM_COLOR,
      fields,
      footer: requestedBy
        ? `npm registry • ${pkgs.length} shown • requested by ${requestedBy}`
        : `npm registry • ${pkgs.length} shown`,
    },
  };
}
