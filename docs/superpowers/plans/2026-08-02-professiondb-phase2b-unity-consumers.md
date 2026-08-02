# professiondb Phase 2b-Unity — Engine-neutral runtime view + Unity consumer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an **engine-agnostic resolved runtime view** of professiondb (`professiondb-runtime.json`) that pre-joins cross-DB data (mapdb node `harvest_weight` onto gather actions) once, so every game engine (Unity, UE, bevy, bitecs) consumes ONE shared shape via a thin per-engine loader — no per-engine transforms in the gen script. Then wire rareicon's Unity (DOTS/C#) itemdb consumers off the now-RESERVED `Item.skilling` / `Item.compress` fields onto that runtime view (parity migration). `FoodInfo.cooking_level`/`cooking_xp` are already dead on Unity. Must land before the next `sync:itemdb` regenerates `StreamingAssets/itemdb.json` without `skilling`/`compress` (latent break: all gathering + storage-consolidation silently stop).

**Architecture:** MDX under `apps/kbve/astro-kbve/src/content/docs/professiondb/**` → `gen-professiondb-data.mjs` emits three artifacts to `packages/data/codegen/generated/`: (1) `professiondb-data.json` + `.binpb` — **proto-canonical, pure** (unchanged); (2) `professiondb-runtime.json` — the **engine-neutral resolved view**: the same professions/actions plus resolved scalars from cross-DB joins (today: `harvestWeight` from `gather.resourceNodeRef` → mapdb node, default 100). The runtime view is the ONE contract all engines target. A `RUNTIME_SYNC_TARGETS` array lists each engine's asset dir; the gen script copies `professiondb-runtime.json` into each. **Onboarding a new engine = add one path to `RUNTIME_SYNC_TARGETS` + write a thin loader that deserializes the shared shape.** Unity is the first consumer: managed POCOs + a static cache build `itemRef → gather{skill,harvestWeight}` and `itemRef → compress{targetRef,ratio}` lookups; `ItemDB.Materialise()` reads those instead of `src.Skilling`/`src.Compress`. The Burst runtime slice (`ItemDefRuntime`, `ItemDBSingleton`, `HarvestSystem`, `ConsolidatorCore`) is unchanged.

**Tech Stack:** Node ESM codegen (`@bufbuild/protobuf`, `gray-matter`) via nx `nx:run-commands`; Unity DOTS/ECS C#, Newtonsoft.Json; nx.

## Global Constraints

- Work only in worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-unity-consumers`, branch `trunk/professiondb-unity-consumers-1785660682`. Never the main tree. Absolute paths.
- **DROP ALL code comments** (C# and JS) in authored/edited code — no `//`, no `///`, no XML doc comments. Console/`Debug` log strings are not comments and are allowed.
- Commits: no `Co-Authored-By`, no "Generated with Claude".
- Build via nx (`npx nx run ...` / `./kbve.sh -nx`), never raw tooling. Generated data via the `gen-*-data.mjs` scripts + sync targets, never hand-edited.
- MDX is source of truth for content; regenerate, don't hand-edit generated JSON.

## Multi-engine contract (the whole point — do not violate)

`professiondb-runtime.json` is the single shape every engine reads. Its schema:

```
{
  "schema": "professiondb-runtime",
  "version": 1,
  "professions": [
    {
      "ref": string, "key": int, "name": string, "category": string?,
      "actions": [
        {
          "ref": string, "key": int, "name": string,
          "requiredLevel": int?, "xpReward": int?, "durationMs": int?,
          "toolRefs": string[]?,
          "resourceNodeRef": string?,      // gather actions
          "harvestWeight": int,            // RESOLVED (gather actions only): mapdb node weight, default 100
          "inputs":  [{ "itemRef": string, "quantity": int }]?,   // production/compress actions
          "outputs": [{ "itemRef": string, "quantity": int }]?
        }
      ]
    }
  ]
}
```

Rules that keep it engine-agnostic:

- **No engine-specific fields, casing, or file names.** camelCase throughout (matches proto-canonical). No `count`/Unity-isms. The filename is `professiondb-runtime.json` in EVERY engine's asset dir — never `<engine>.json`.
- **All cross-DB resolution happens once, in the gen script**, and lands as plain scalars on the runtime view. Engines never re-join across DBs at load — they read resolved values directly. (Rust today reads `professiondb-data.json` and needs no resolved scalars; it may migrate to the runtime view later — the runtime view is a superset, so that swap is safe and non-breaking.)
- **Adding an engine** = append its asset dir to `RUNTIME_SYNC_TARGETS` in `gen-professiondb-data.mjs` + write a loader deserializing this schema. Nothing else in the gen script changes.
- A gather action = no `inputs`, has `outputs`; a compress/production action = has `inputs`. `harvestWeight` is present only on gather actions.

## Confirmed design decisions (from the user — do NOT re-litigate)

1. **HarvestWeight source = mapdb node** (`gather.resourceNodeRef` → mapdb node `harvest_weight`), resolved at GEN TIME into the runtime view; node stays canonical. Default 100 when node/weight absent.
2. **Parity-only Unity scope.** Keep the 3-value `HarvestRole` (Forager/Lumberjack/Miner) and hardcoded XP constants. No 8-skill extension, no data-driven `xp_reward`. Only the DATA SOURCE changes.
3. **Engine-neutral runtime bundle** (`professiondb-runtime.json`) consumed by all engines via `RUNTIME_SYNC_TARGETS`; Unity is the first consumer, not a special case.

## Verified facts (re-read exact files for current line numbers before editing — anchors drift)

- Unity project: `apps/rareicon/unity-rareicon/`. itemdb C# under `Assets/_RareIcon/Scripts/ECS/DB/Items/`. itemdb = hand-mirrored Newtonsoft POCOs, NOT protobuf C#.
- `professiondb-data.json`: 8 professions, **gather=29 / compress=19 / other=0** actions, camelCase. gather e.g. `mining/gather-copper-ore {key:15,requiredLevel:1,xpReward:18,durationMs:3000,resourceNodeRef:"copper-vein",toolRefs:["pickaxe"],outputs:[{itemRef:"copper-ore",quantity:1}]}`; compress e.g. `compress-berry {inputs:[{itemRef:"berry",quantity:100}],outputs:[{itemRef:"meal",quantity:1}]}`.
- `mapdb-data.json` top-level key `objectDefs` (65 defs). **VERIFIED: all 19 gather-referenced nodes have `harvest_weight` 0/unset** → every resolved weight is 100 today. The resolver is correct plumbing but a behavioral no-op until node MDX authors real weights. `GetHarvestWeight` has no gameplay caller (`HarvestSystem` uses a fixed per-tick amount) → uniform 100 is behavior-neutral.
- Reservations already in this worktree: `itemdb.proto` reserves 42/48 + "skilling"/"compress"; `itemdb-data.json` has no skilling/compress.
- Breakage is LATENT: `StreamingAssets/itemdb.json` gitignored + currently absent; regenerated by `astro-kbve:sync:itemdb`. `professiondb-runtime.json` is NOT gitignored → tracked/committed like `mapdb.json`.
- Deleted-symbol consumers: only `ItemDB.cs` (`Materialise()`), `ItemdbDef.cs` (`SkillingInfoDef`/`CompressInfoDef` + `.Skilling`/`.Compress`), `ItemdbLoaderSystem.cs` (boot-stat log). `StorageConsolidatorSystem` reads `.CompressesTo/.CompressRatio` on the unchanged `ItemDefRuntime`.
- `unity-rareicon/project.json` exposes only `dev:android` — NO headless C# compile/test. New `.cs` `.meta` files generated by the Unity editor on import.
- itemdb's sync convention: `gen-itemdb-data.mjs` writes directly into engine asset dirs via a `SYNC_TARGETS`-style list. Mirror that for `RUNTIME_SYNC_TARGETS`.

---

## Task 1 — Gen: engine-neutral runtime view (`professiondb-runtime.json`) + resolver + sync targets

**Files:** Modify `packages/data/codegen/gen-professiondb-data.mjs`.

**Interfaces produced:** `packages/data/codegen/generated/professiondb-runtime.json` (schema above) + a copy in each `RUNTIME_SYNC_TARGETS` dir (Unity: `apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json`).

- [ ] **Step 1:** Re-read `gen-professiondb-data.mjs` fully — confirm the fs import, the `generatedDir`/repo-root path var/`outputBinPath` declarations, the `main()` body + loaded-professions variable, and where `generateXref()` is called. Adapt the inserts below to the real code.

- [ ] **Step 2:** Extend the `node:fs` import with `mkdirSync` and `existsSync`.

- [ ] **Step 3:** After the existing output-path declarations, add (use the script's real repo-root var if not `repoRoot`):

```js
const mapdbDataPath = resolve(generatedDir, 'mapdb-data.json');
const runtimeFileName = 'professiondb-runtime.json';
const runtimeOutputPath = resolve(generatedDir, runtimeFileName);
const DEFAULT_HARVEST_WEIGHT = 100;
const RUNTIME_SYNC_TARGETS = [
	resolve(repoRoot, 'apps/rareicon/unity-rareicon/Assets/StreamingAssets'),
];
```

`RUNTIME_SYNC_TARGETS` is the scaling seam: a future UE/bitecs engine adds ONE line here.

- [ ] **Step 4:** Add helpers above `function main()`:

```js
function ensureDir(path) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function loadNodeHarvestWeights() {
	if (!existsSync(mapdbDataPath)) {
		throw new Error(
			`professiondb: ${mapdbDataPath} missing — run astro-kbve:sync:mapdb before sync:professiondb`,
		);
	}
	const raw = JSON.parse(readFileSync(mapdbDataPath, 'utf8'));
	const defs = raw.objectDefs ?? [];
	const weights = new Map();
	for (const def of defs) {
		if (typeof def.ref !== 'string') continue;
		const w = def.harvestWeight;
		if (typeof w === 'number' && w > 0)
			weights.set(def.ref, Math.min(w, 255));
	}
	return weights;
}

function buildRuntimeView(professions, nodeWeights) {
	const runtimeProfessions = professions.map((prof) => {
		const actions = (prof.actions ?? []).map((action) => {
			const hasInputs =
				Array.isArray(action.inputs) && action.inputs.length > 0;
			if (hasInputs) return action;
			const nodeRef = action.resourceNodeRef;
			const harvestWeight =
				nodeRef && nodeWeights.has(nodeRef)
					? nodeWeights.get(nodeRef)
					: DEFAULT_HARVEST_WEIGHT;
			return { ...action, harvestWeight };
		});
		return { ...prof, actions };
	});
	return {
		schema: 'professiondb-runtime',
		version: 1,
		professions: runtimeProfessions,
	};
}
```

`buildRuntimeView` spreads (never mutates) so the proto-canonical `professiondb-data.json` written earlier in `main()` stays pure.

- [ ] **Step 5:** In `main()`, immediately before `generateXref()`, add:

```js
const nodeWeights = loadNodeHarvestWeights();
const runtimeView = buildRuntimeView(professions, nodeWeights);
const runtimeJson = JSON.stringify(runtimeView, null, 2) + '\n';
writeFileSync(runtimeOutputPath, runtimeJson);
console.log(`Wrote ${runtimeOutputPath}`);
for (const dir of RUNTIME_SYNC_TARGETS) {
	ensureDir(dir);
	const dest = resolve(dir, runtimeFileName);
	writeFileSync(dest, runtimeJson);
	console.log(`Synced ${dest}`);
}
```

(Use the real loaded-professions variable name from `main()`.)

- [ ] **Step 6:** Run `node packages/data/codegen/gen-professiondb-data.mjs`. Expect `Wrote .../generated/professiondb-runtime.json` + `Synced .../StreamingAssets/professiondb-runtime.json` alongside existing outputs.

- [ ] **Step 7:** Assert shape + resolved weights + schema neutrality:

```bash
node -e '
const b=require("./packages/data/codegen/generated/professiondb-runtime.json");
if(b.schema!=="professiondb-runtime"){console.log("BAD schema="+b.schema);process.exit(1);}
if("count" in b){console.log("LEAKED unity-ism: count");process.exit(1);}
let g=0,c=0,badGather=0;
for(const p of b.professions) for(const a of (p.actions||[])){
  const hi=a.inputs&&a.inputs.length>0, ho=a.outputs&&a.outputs.length>0;
  if(!hi&&ho){g++; if(typeof a.harvestWeight!=="number"||a.harvestWeight<1) badGather++;}
  else if(hi&&ho&&a.inputs.length===1&&a.outputs.length===1) c++;
}
const cu=b.professions.find(p=>p.ref==="mining").actions.find(a=>a.ref==="gather-copper-ore");
console.log("gather="+g,"compress="+c,"badGather="+badGather,"copperWeight="+cu.harvestWeight);
'
```

Expect `gather=29 compress=19 badGather=0 copperWeight=100`.

- [ ] **Step 8:** Confirm the generated + Unity copies are byte-identical:

```bash
diff -q packages/data/codegen/generated/professiondb-runtime.json apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json && echo IDENTICAL
```

Re-run the generator; `git status --short` shows no second-run churn (idempotent). Commit lands in Task 2.

## Task 2 — nx: `sync:professiondb` target

**Files:** Modify `apps/kbve/astro-kbve/project.json`.

- [ ] **Step 1:** Read `sync:questdb`/`sync:mapdb` for the exact convention.

- [ ] **Step 2:** Add:

```json
"sync:professiondb": {
  "executor": "nx:run-commands",
  "dependsOn": ["sync:mapdb", "sync:itemdb"],
  "inputs": [
    "{projectRoot}/src/content/docs/professiondb/**/*.mdx",
    "{workspaceRoot}/packages/data/codegen/gen-professiondb-data.mjs",
    "{workspaceRoot}/packages/data/codegen/gen-professiondb-xref.mjs",
    "{workspaceRoot}/packages/data/codegen/generated/mapdb-data.json",
    "{workspaceRoot}/packages/data/codegen/generated/itemdb-data.json"
  ],
  "outputs": [
    "{workspaceRoot}/packages/data/codegen/generated/professiondb-data.json",
    "{workspaceRoot}/packages/data/codegen/generated/professiondb-data.binpb",
    "{workspaceRoot}/packages/data/codegen/generated/professiondb-runtime.json",
    "{workspaceRoot}/packages/data/codegen/generated/xref-index.json",
    "{workspaceRoot}/apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json"
  ],
  "options": {
    "command": "node packages/data/codegen/gen-professiondb-data.mjs",
    "cwd": "{workspaceRoot}"
  },
  "cache": true
}
```

When a future engine is added to `RUNTIME_SYNC_TARGETS`, add its asset path to this target's `outputs` too.

- [ ] **Step 3:** `npx nx run astro-kbve:sync:professiondb`. Deps run/cache-hit, then generator writes runtime view + Unity copy. Confirm tracked:

```bash
git -C /Users/alappatel/Documents/GitHub/kbve-professiondb-unity-consumers status --short apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json
```

- [ ] **Step 4:** Commit the data layer:

```bash
git add packages/data/codegen/gen-professiondb-data.mjs apps/kbve/astro-kbve/project.json
git commit -m "professiondb: emit engine-neutral runtime view + add sync:professiondb"
```

- [ ] **Step 5:** Commit regenerated artifacts:

```bash
npx nx run astro-kbve:sync:professiondb
git add packages/data/codegen/generated/professiondb-data.json \
        packages/data/codegen/generated/professiondb-data.binpb \
        packages/data/codegen/generated/professiondb-runtime.json \
        packages/data/codegen/generated/xref-index.json \
        apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json
git commit -m "professiondb: regenerate data + runtime view + Unity sync"
```

## Task 3 — Unity: runtime-view POCOs

**Files:** Create `.../Scripts/ECS/DB/Items/Data/ProfessiondbDef.cs`.

- [ ] **Step 1:** Match the namespace used by neighbouring itemdb POCOs (sample assumes `RareIcon` — use the real one).

- [ ] **Step 2:** Write (no comments; POCOs mirror the runtime schema):

```csharp
using System.Collections.Generic;
using Newtonsoft.Json;

namespace RareIcon
{
    public sealed class ProfessiondbRuntime
    {
        [JsonProperty("schema")]      public string Schema;
        [JsonProperty("version")]     public int Version;
        [JsonProperty("professions")] public List<ProfessionDef> Professions = new();
    }

    public sealed class ProfessionDef
    {
        [JsonProperty("ref")]     public string Ref;
        [JsonProperty("key")]     public int Key;
        [JsonProperty("name")]    public string Name;
        [JsonProperty("actions")] public List<ProfessionActionDef> Actions;
    }

    public sealed class ProfessionActionDef
    {
        [JsonProperty("ref")]             public string Ref;
        [JsonProperty("key")]             public int Key;
        [JsonProperty("resourceNodeRef")] public string ResourceNodeRef;
        [JsonProperty("harvestWeight")]   public int? HarvestWeight;
        [JsonProperty("inputs")]          public List<ProfessionResourceDef> Inputs;
        [JsonProperty("outputs")]         public List<ProfessionResourceDef> Outputs;
    }

    public sealed class ProfessionResourceDef
    {
        [JsonProperty("itemRef")]  public string ItemRef;
        [JsonProperty("quantity")] public int Quantity;
    }
}
```

## Task 4 — Unity: professiondb cache + loader system

**Files:** Create `.../Data/ProfessiondbCache.cs` and `.../Systems/ProfessiondbLoaderSystem.cs`.

**Interfaces produced:** `ProfessiondbCache.EnsureLoaded()` (idempotent), `TryGetGather(string itemRef, out GatherInfo)`, `TryGetCompress(string itemRef, out CompressInfo)`, `GatherCount`, `CompressCount`. `GatherInfo{string Skill, byte HarvestWeight}`, `CompressInfo{string TargetRef, int Ratio}`.

- [ ] **Step 1:** Create `ProfessiondbCache.cs` (real namespace; reads `professiondb-runtime.json` from StreamingAssets, mirroring `ItemDBCache`'s read/parse style):

```csharp
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace RareIcon
{
    public readonly struct GatherInfo
    {
        public readonly string Skill;
        public readonly byte HarvestWeight;

        public GatherInfo(string skill, byte harvestWeight)
        {
            Skill = skill;
            HarvestWeight = harvestWeight;
        }
    }

    public readonly struct CompressInfo
    {
        public readonly string TargetRef;
        public readonly int Ratio;

        public CompressInfo(string targetRef, int ratio)
        {
            TargetRef = targetRef;
            Ratio = ratio;
        }
    }

    public static class ProfessiondbCache
    {
        static readonly Dictionary<string, GatherInfo> _gatherByItem = new();
        static readonly Dictionary<string, CompressInfo> _compressByItem = new();

        public static bool IsLoaded { get; private set; }
        public static int GatherCount => _gatherByItem.Count;
        public static int CompressCount => _compressByItem.Count;

        public static bool TryGetGather(string itemRef, out GatherInfo info)
            => _gatherByItem.TryGetValue(itemRef, out info);

        public static bool TryGetCompress(string itemRef, out CompressInfo info)
            => _compressByItem.TryGetValue(itemRef, out info);

        public static void EnsureLoaded()
        {
            if (IsLoaded) return;

            string path = Path.Combine(Application.streamingAssetsPath, "professiondb-runtime.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[ProfessiondbLoader] professiondb-runtime.json missing at {path}. Run `npx nx run astro-kbve:sync:professiondb`. Gathering and storage consolidation stay disabled until present.");
                return;
            }

            string raw;
            try { raw = File.ReadAllText(path); }
            catch (IOException e)
            {
                Debug.LogError($"[ProfessiondbLoader] failed to read professiondb-runtime.json: {e.Message}");
                return;
            }

            ProfessiondbRuntime bundle;
            try { bundle = JsonConvert.DeserializeObject<ProfessiondbRuntime>(raw); }
            catch (JsonException e)
            {
                Debug.LogError($"[ProfessiondbLoader] failed to parse professiondb-runtime.json: {e.Message}");
                return;
            }

            if (bundle?.Professions == null || bundle.Professions.Count == 0)
            {
                Debug.LogError("[ProfessiondbLoader] professiondb-runtime.json had no professions");
                return;
            }

            Load(bundle);
            Debug.Log($"[ProfessiondbLoader] Loaded {bundle.Professions.Count} professions: {GatherCount} gatherable, {CompressCount} compressible item refs.");
        }

        public static void Load(ProfessiondbRuntime bundle)
        {
            Clear();
            foreach (var prof in bundle.Professions)
            {
                if (prof?.Actions == null) continue;
                foreach (var action in prof.Actions)
                {
                    if (action == null) continue;
                    bool hasInputs = action.Inputs != null && action.Inputs.Count > 0;
                    bool hasOutputs = action.Outputs != null && action.Outputs.Count > 0;

                    if (!hasInputs && hasOutputs)
                    {
                        string itemRef = action.Outputs[0].ItemRef;
                        if (string.IsNullOrEmpty(itemRef)) continue;
                        byte weight = action.HarvestWeight.HasValue
                            ? (byte)System.Math.Min(System.Math.Max(action.HarvestWeight.Value, 1), 255)
                            : (byte)100;
                        _gatherByItem[itemRef] = new GatherInfo(prof.Ref, weight);
                    }
                    else if (hasInputs && hasOutputs && action.Inputs.Count == 1 && action.Outputs.Count == 1)
                    {
                        string itemRef = action.Inputs[0].ItemRef;
                        string targetRef = action.Outputs[0].ItemRef;
                        if (string.IsNullOrEmpty(itemRef) || string.IsNullOrEmpty(targetRef)) continue;
                        _compressByItem[itemRef] = new CompressInfo(targetRef, action.Inputs[0].Quantity);
                    }
                }
            }
            IsLoaded = true;
        }

        public static void Clear()
        {
            _gatherByItem.Clear();
            _compressByItem.Clear();
            IsLoaded = false;
        }
    }
}
```

- [ ] **Step 2:** Create `ProfessiondbLoaderSystem.cs`:

```csharp
using Unity.Entities;

namespace RareIcon
{
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class ProfessiondbLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;
            ProfessiondbCache.EnsureLoaded();
        }
    }
}
```

Correctness does not depend on relative loader ordering — `EnsureLoaded()` is idempotent and Task 5 also calls it inside `ItemDBLoaderSystem.OnUpdate()` right before `HydrateFromCache()`. This system is an early-load + logging trigger.

- [ ] **Step 3:** Commit:

```bash
git add apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ProfessiondbDef.cs \
        apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ProfessiondbCache.cs \
        apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Systems/ProfessiondbLoaderSystem.cs
git commit -m "rareicon: add professiondb runtime-view POCOs, cache, loader system"
```

## Task 5 — Unity: rewire Materialise + loader, delete dead itemdb defs (ONE commit)

**Files:** Modify `.../Data/ItemDB.cs`, `.../Systems/ItemdbLoaderSystem.cs`, `.../Data/ItemdbDef.cs`. All three edits in one commit so nothing dangles.

- [ ] **Step 1:** Re-read all three for current line numbers + exact code.

- [ ] **Step 2:** In `ItemDB.Materialise()`, replace the `src.Skilling`/`src.Compress` derivation with cache lookups keyed by `src.Ref`:

```csharp
            HarvestRole harvestRole = HarvestRole.None;
            byte harvestWeight = 100;
            if (ProfessiondbCache.TryGetGather(src.Ref, out var gather))
            {
                harvestRole = SkillToHarvestRole(gather.Skill);
                harvestWeight = gather.HarvestWeight;
            }

            ushort compressesTo = 0, compressRatio = 0;
            if (ProfessiondbCache.TryGetCompress(src.Ref, out var compress) &&
                !string.IsNullOrEmpty(compress.TargetRef) &&
                ItemDBRefMap.RefToId.TryGetValue(compress.TargetRef, out var ct))
            {
                compressesTo = (ushort)ct;
                compressRatio = (ushort)System.Math.Min(compress.Ratio, ushort.MaxValue);
            }
```

`SkillToHarvestRole` unchanged (`foraging`/`woodcutting`/`mining` already match). Confirm `src` exposes `Ref`.

- [ ] **Step 3:** In `ItemdbLoaderSystem`, call `ProfessiondbCache.EnsureLoaded();` immediately before `ItemDBCache.Load(...)`/`ItemDB.HydrateFromCache()`, and replace the boot-stat `skilling`/`compress` counters with `ProfessiondbCache.GatherCount`/`CompressCount`:

```csharp
            ProfessiondbCache.EnsureLoaded();
            ItemDBCache.Load(bundle.Entries);
            int mapped = ItemDB.HydrateFromCache();

            int edible = 0;
            foreach (var def in bundle.Entries)
            {
                if (def.Food != null && (def.Food.Heals.HasValue || def.Food.RestoreEnergy.HasValue || def.Food.RestoreMana.HasValue)) edible++;
            }

            Debug.Log($"[ItemDBLoader] Loaded {bundle.Count} entries, mapped {mapped} to Unity ItemId: " +
                      $"{edible} edible, {ProfessiondbCache.GatherCount} harvestable, {ProfessiondbCache.CompressCount} compressible.");
```

(Adapt `edible` predicate to the real `FoodInfoDef` field names.)

- [ ] **Step 4:** In `ItemdbDef.cs`, delete the `[JsonProperty("skilling")] ... Skilling;` + `[JsonProperty("compress")] ... Compress;` property lines and the `SkillingInfoDef` + `CompressInfoDef` classes entirely.

- [ ] **Step 5:** Static reference audit:

```bash
node -e '
const fs=require("fs"),path=require("path");
const root="/Users/alappatel/Documents/GitHub/kbve-professiondb-unity-consumers/apps/rareicon/unity-rareicon/Assets";
const bad=["SkillingInfoDef","CompressInfoDef","src.Skilling","src.Compress",".Skilling",".Compress"];
let hits=0;
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p); else if(e.name.endsWith(".cs")){const t=fs.readFileSync(p,"utf8").split("\n");
 t.forEach((l,i)=>{for(const n of bad) if(l.includes(n)){console.log(p.replace(root,"")+":"+(i+1)+": "+l.trim());hits++;break;}});}}})(root);
console.log(hits===0?"CLEAN":"REMAINING="+hits);
'
```

Expect `CLEAN`.

- [ ] **Step 6:** Commit:

```bash
git add apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemDB.cs \
        apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Systems/ItemdbLoaderSystem.cs \
        apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemdbDef.cs
git commit -m "rareicon: materialise harvest/compress from professiondb runtime view, drop dead itemdb defs"
```

## Task 6 — Final verification + push

No headless C# compile/test target exists (`unity-rareicon` only has `dev:android`). Layered gate:

- [ ] **Step 1 (data gate, automated):** regenerate + assert join parity:

```bash
npx nx run astro-kbve:sync:itemdb
npx nx run astro-kbve:sync:professiondb
node -e '
const itemdb=require("./apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb.json");
const prof=require("./apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json");
const refs=new Set(itemdb.entries.map(e=>e.ref));
let leaked=itemdb.entries.filter(e=>e.skilling||e.compress).length;
let g=0,c=0,gMiss=0,cMiss=0;
for(const p of prof.professions) for(const a of (p.actions||[])){
  const hi=a.inputs&&a.inputs.length>0, ho=a.outputs&&a.outputs.length>0;
  if(!hi&&ho){g++; if(!refs.has(a.outputs[0].itemRef))gMiss++;}
  else if(hi&&ho&&a.inputs.length===1&&a.outputs.length===1){c++; if(!refs.has(a.inputs[0].itemRef))cMiss++;}
}
console.log("itemdb entries="+itemdb.entries.length,"leakedSkillingCompress="+leaked);
console.log("gather="+g,"gatherRefMissingInItemdb="+gMiss,"compress="+c,"compressSrcMissingInItemdb="+cMiss);
'
```

Expect `leakedSkillingCompress=0`, `gather=29`, `compress=19`. `*MissingInItemdb` informational (items produced/consumed by an action but absent from itemdb are silently skipped by `Materialise`, exactly as before — parity). Eyeball for regressions.

- [ ] **Step 2 (C# compile gate, honest limitation):** only compile path is a Unity editor import / `dev:android` build. Confirm the Task 5 audit is `CLEAN` and that the 3 new + 4 edited files are the entire C# surface. Report this as the residual manual gate — do NOT claim the C# compiles without a Unity build.

- [ ] **Step 3:** Push (controller opens PR after final review):

```bash
git push -u origin trunk/professiondb-unity-consumers-1785660682
```

## Decisions (confirm at review)

1. **Runtime view = separate artifact** (`professiondb-runtime.json`), NOT a field on proto-canonical (`ProfessionAction` has no `harvest_weight`; keeps `.binpb` proto-pure). Resolved scalars live only on the runtime view.
2. **Runtime schema = camelCase `{schema,version,professions:[...]}`** — engine-neutral, no `count`, no engine name in the filename.
3. **Compress classification = single-input + single-output action** (matches all 19 current; excludes future multi-ingredient recipes from `ConsolidatorCore`).
4. **Skill = owning `profession.ref`** (loader already has it; no baked `skillRef`).
5. **`professiondb-runtime.json` committed** in both `generated/` and StreamingAssets (tracked like `mapdb.json`).
6. **`sync:professiondb` dependsOn `["sync:mapdb","sync:itemdb"]`** (mapdb for the resolve, itemdb for warn-only xref). Fallback: drop `sync:itemdb` if its `-uecpp` chain is unhealthy.
7. **Weight-0 = unset → default 100**; cache floors present weight to ≥1.

## RISKS

- **C# compile gate is weak** — no headless target; final validation needs a Unity editor import / CI build. Biggest unverified item. Plan's C# matches existing signatures + passes the static audit but is not machine-compiled here.
- **All 19 gather-referenced mapdb nodes have `harvest_weight` 0/unset (VERIFIED)** → every resolved weight is 100 today. The resolver is correct plumbing but a behavioral no-op until node MDX authors real weights (separate content task, out of scope). `GetHarvestWeight` has no gameplay caller → uniform 100 is behavior-neutral now.
- **Compress vs future craft actions:** structural 1-in/1-out classification is clean for all current data; a future single-in/single-out cooking/smithing action that is NOT a compress recipe would be picked up by `ConsolidatorCore`. A `facility_ref`/naming discriminator could harden it later.
- **`.meta` files** for the 3 new `.cs` files are generated by the Unity editor on import, not by this plan.
- **`sync:itemdb` chain** pulls `sync:itemdb-uecpp`; if unhealthy it blocks `sync:professiondb` — fallback `dependsOn: ["sync:mapdb"]` only.

## Self-Review

- **Scale:** the runtime view + `RUNTIME_SYNC_TARGETS` is the engine-agnostic seam — UE/bevy/bitecs onboard by adding one target path + a thin loader against the shared schema, never by editing the resolver. Rust (PR #15154) can migrate to the runtime view later (superset, non-breaking).
- **Parity:** data source swapped; 3-role HarvestRole + hardcoded XP unchanged; compress semantics identical; harvest weight uniform-100 today (behavior-neutral, no caller).
- **Atomicity:** Task 5's three edits are one commit; new code (Tasks 3-4) lands before the delete so nothing dangles.
