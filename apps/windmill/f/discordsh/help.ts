type ScriptListing = {
  path: string;
  summary?: string;
};

const HELP_COLOR = 0x5865f2;
const NAMESPACE = "f/discordsh/";

const HIDDEN = new Set(["help", "index"]);

function baseUrl(): string {
  return (
    process.env.BASE_INTERNAL_URL ??
    process.env.BASE_URL ??
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

async function listCommands(): Promise<ScriptListing[]> {
  const token = process.env.WM_TOKEN;
  const workspace = process.env.WM_WORKSPACE ?? "kbve";
  if (!token) throw new Error("WM_TOKEN not available to help script");

  const url =
    `${baseUrl()}/api/w/${workspace}/scripts/list` +
    `?path_start=${encodeURIComponent(NAMESPACE)}&per_page=200`;

  const resp = await fetch(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`scripts/list ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as ScriptListing[];
}

export async function main(
  _args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const scripts = await listCommands();

  const commands = scripts
    .map((s) => ({ name: s.path.slice(NAMESPACE.length), summary: s.summary }))
    .filter((c) => c.name && !c.name.includes("/") && !HIDDEN.has(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (commands.length === 0) {
    throw new Error("no /wm commands resolved from the workspace");
  }

  const fields = commands.map((c) => ({
    name: `/wm ${c.name}`,
    value: c.summary?.trim() || "—",
    inline: false,
  }));

  const requestedBy = (discord?.username as string) ?? null;

  return {
    embed: {
      title: "KBVE · /wm commands",
      description:
        "Run any of these with `/wm <name>`. Most take optional args — " +
        "`/wm poem Emily Dickinson`, `/wm ud yeet`, `/wm npm laser`.",
      color: HELP_COLOR,
      fields,
      footer: requestedBy
        ? `${commands.length} commands • requested by ${requestedBy}`
        : `${commands.length} commands`,
    },
  };
}
