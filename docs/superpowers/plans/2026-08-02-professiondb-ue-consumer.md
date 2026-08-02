# KBVEProfessionDB — UE5 professiondb consumer (`-uecpp`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `KBVEProfessionDB` UE5 plugin that consumes professiondb via generated C++ (the `-uecpp` convention, mirroring itemdb/npcdb/spelldb/questdb): (1) `gen-professiondb-uecpp.mjs` codegen; (2) nx `sync:professiondb-uecpp` wired into `sync:professiondb`; (3) the plugin (`.uplugin`, `Build.cs`, module, `UKBVEProfessionDBDatabase` subsystem, gameplay structs, `FromGen` mapper) loading `Content/Data/professiondb-data.json` into an **action-ref-keyed** lookup; (4) sync `professiondb-data.json` into the rentearth UE Content dir.

**Architecture:** `descriptors/professiondb.binpb` → `gen-professiondb-uecpp.mjs` (byte-identical generator engine to `gen-itemdb-uecpp.mjs`, only tokens differ) emits `FKBVEGen*` USTRUCTs + `KBVEProfessionDBProto::Populate()` yyjson parsers into the plugin's `Public/Generated/`. Runtime: `professiondb-data.json` (root `{professions:[...]}`) → `yyjson_read` → per-profession `Populate(FKBVEGenProfession&, val)` → flatten each `Gen.Actions[]` through `KBVEProfessionMap::FromGen(prof, action)` into `TArray<FKBVEProfessionActionDef>` keyed by action `Ref` in `TMap<FName,int32>`, each action carrying its owning `ProfessionRef`. UE resolves harvest weight from its own already-loaded mapdb node — no need for the runtime-view's baked `harvestWeight`. Mirror template = `KBVEQuestDB` (leanest sibling on the generated `Populate()` path: single `KBVEYYJson` dep, no SQLite/Mass).

**Tech Stack:** Node ESM codegen (`@bufbuild/protobuf`), nx `run-commands`, UE5 C++ (`GameInstanceSubsystem`, yyjson via `KBVEYYJson`), bash `sync-data.sh`.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-ue-consumer`, branch `trunk/professiondb-ue-consumer-1785674901`. Never the main tree. Absolute paths.
- DROP ALL code comments in **newly authored** code (C++ subsystem/types/mapper). EXCEPTION: `gen-professiondb-uecpp.mjs` is a verbatim copy of the sibling generator with only tokens swapped — keep it byte-identical to `gen-itemdb-uecpp.mjs` (inherited JSDoc + the emitted `// AUTO-GENERATED` banner strings stay) so the codegen family stays maintainable/parity-checkable (Decision 3).
- Never hand-edit generated headers — codegen only.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- **NO UE toolchain here** — plugin C++ cannot be compiled/run. Local gate = (a) generator runs + emits correct-shape headers; (b) hand-written `.uplugin`/`Build.cs`/subsystem/mapper/types statically diffed against `KBVEQuestDB` for parity; (c) the mapper references only field names present in the freshly generated header. Real compile = `.github/workflows/ci-unreal-plugins.yml` (auto-discovers the plugin via `.github/scripts/ue-plugin-matrix.mjs` — no CI edit needed).

## Verified facts (VERIFIED read-only)

- `gen-itemdb-uecpp.mjs` (259 lines): distinguishing tokens at L11-12 (header-comment filenames), L25 `DESCRIPTOR='descriptors/itemdb.binpb'`, L26-29 `OUT_DIR=.../KBVEItemDB/.../Public/Generated`, L30 `PKG_PREFIX='item.'`, L158 emitted banner `from item/itemdb.proto`, L160 `#include "KBVEItemDBProtoTypes.generated.h"`, L164 `KBVEITEMDB_API`, L169 `Category = "KBVE|ItemDB"`, L180 parser banner, L183 `#include "Generated/KBVEItemDBProtoTypes.h"`, L185 `namespace KBVEItemDBProto`, L257-258 output filenames. Everything else is generator engine to keep identical.
- Generated headers DO include `<Db>ProtoTypes.generated.h` (UHT reflection) — confirmed in `KBVEQuestDBProtoTypes.h:6`.
- `professiondb.proto` (package `profession`) has EXACTLY 7 messages: `ResourceAmount, ExperienceCurve, ProfessionAction, ProfessionUnlock, ProfessionExtension, Profession, ProfessionRegistry`. Nested-repeated: `Profession.actions[]`, `ProfessionAction.inputs[]/outputs[]`. oneof in `ProfessionExtension`. 2 enums. No maps. `descriptors/professiondb.binpb` exists.
- `professiondb-data.json` root key = `professions`; action shape `{ref,key,name,requiredLevel,xpReward,durationMs,resourceNodeRef,toolRefs[],inputs:[{itemRef,quantity}],outputs:[...]}`.
- nx `apps/kbve/astro-kbve/project.json`: `sync:itemdb-uecpp` at L379-394 (template); `sync:professiondb` at L395-418 `dependsOn:["sync:mapdb","sync:itemdb"]`. No `sync:professiondb-uecpp`.
- `KBVEQuestDB` = leanest mirror: `.uplugin` (single `KBVEYYJson` plugin dep), `Build.cs` (deps `Core/CoreUObject/Engine/KBVEYYJson`), `KBVEQuestDB.h` (inline `IModuleInterface`), `KBVEQuestDBModule.cpp` (`IMPLEMENT_MODULE`), `KBVEQuestDatabase.h/.cpp` (subsystem: Initialize→LoadFromFile(`ProjectContentDir()/Data/questdb-data.json`)→LoadFromJson→yyjson root→arr→Populate→FromGen→RefToIndex), `KBVEQuestMap.h` (`namespace KBVEQuestMap`), `KBVEQuestTypes.h`. `version.toml` = `version = "0.0.0"`.
- `apps/rentearth/unreal-rentearth/scripts/sync-data.sh`: `FILES=(itemdb-data.json npcdb-data.json mapdb-data.json questdb-data.json spelldb-data.json)`; wrapped by nx `unreal-rentearth:sync-data`. Only rentearth has `Content/Data/` (chuck/cleanroom/deathslayer/rareicon do not).
- UE CI `ci-unreal-plugins.yml` auto-discovers plugins via `ue-plugin-matrix.mjs` — no plugin registration to edit.

## Decisions (confirm at review)

1. **Mirror = `KBVEQuestDB`** (no SQLite/Mass) for a lean loader+query subsystem. Confirm no SQLite persistence wanted.
2. **Primary index = action-ref → flattened action** (secondary profession index), since UE's hook is `worldObject.ProfessionActionRef`.
3. **Keep `gen-professiondb-uecpp.mjs` byte-identical to the sibling** (inherited comments) rather than stripping — codegen-family parity. Confirm over the strict no-comments rule.
4. **`FKBVEProfessionDef.Category` = raw FString** (proto enum name), no `EKBVEProfessionCategory`. Confirm.
5. **Data-sync = rentearth only.** Confirm no other UE app needs it.
6. **Gameplay def is action-focused** — `ProfessionExtension`/`ExperienceCurve`/`ProfessionUnlock` exist in the generated `FKBVEGen*` but are not surfaced in the curated structs. Confirm droppable for the first consumer.
7. **Scope stops at the queryable subsystem** — KBVEMapDB→KBVEProfessionDB gameplay resolution is a later pass (the subsystem exposes `LookupActionByRef(FName)` for it).

---

## Task 1: `gen-professiondb-uecpp.mjs` (copy + token-swap)

**Files:** Create `packages/data/codegen/gen-professiondb-uecpp.mjs` from the sibling via `cp` + surgical token edits ONLY (keeps the generator engine byte-identical → output matches sibling shape).

- [ ] **Step 1:** `cd <worktree> && cp packages/data/codegen/gen-itemdb-uecpp.mjs packages/data/codegen/gen-professiondb-uecpp.mjs`
- [ ] **Step 2:** Apply the token swaps (use Edit per line; do NOT rewrite the file). Change exactly:
    - header comment `Public/Generated/KBVEItemDBProtoTypes.h`/`ProtoParse.h` (L11-12) → `KBVEProfessionDBProtoTypes.h`/`ProtoParse.h`
    - `const DESCRIPTOR = resolve(__dirname, 'descriptors/itemdb.binpb');` → `'descriptors/professiondb.binpb'`
    - `OUT_DIR` path `packages/unreal/KBVEItemDB/Source/KBVEItemDB/Public/Generated` → `packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated`
    - `const PKG_PREFIX = 'item.';` → `'profession.';`
    - emitStructs banner `AUTO-GENERATED by gen-itemdb-uecpp.mjs from item/itemdb.proto` → `gen-professiondb-uecpp.mjs from profession/professiondb.proto`
    - `#include "KBVEItemDBProtoTypes.generated.h"` → `KBVEProfessionDBProtoTypes.generated.h`
    - `struct KBVEITEMDB_API` → `struct KBVEPROFESSIONDB_API`
    - `Category = "KBVE|ItemDB"` → `"KBVE|ProfessionDB"`
    - emitParsers banner `gen-itemdb-uecpp.mjs` → `gen-professiondb-uecpp.mjs`
    - `#include "Generated/KBVEItemDBProtoTypes.h"` → `Generated/KBVEProfessionDBProtoTypes.h`
    - `namespace KBVEItemDBProto` → `namespace KBVEProfessionDBProto`
    - `writeFileSync(resolve(OUT_DIR, 'KBVEItemDBProtoTypes.h')` → `'KBVEProfessionDBProtoTypes.h'`; same for `KBVEItemDBProtoParse.h` → `KBVEProfessionDBProtoParse.h`
    - Verify NO other `ItemDB`/`item.`/`KBVEITEMDB` tokens remain: `grep -nE "ItemDB|KBVEITEMDB|item\.|itemdb" packages/data/codegen/gen-professiondb-uecpp.mjs` → only benign matches if any (should be none).
- [ ] **Step 3:** Run: `node packages/data/codegen/gen-professiondb-uecpp.mjs` → `✓ Generated 7 USTRUCTs → …/KBVEProfessionDB/…/Public/Generated`.
- [ ] **Step 4:** Shape verify:

```bash
ls packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated
grep -E "struct KBVEPROFESSIONDB_API FKBVEGen(ResourceAmount|ExperienceCurve|ProfessionAction|ProfessionUnlock|ProfessionExtension|Profession|ProfessionRegistry)\b" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoTypes.h
grep -E "inline void Populate\(FKBVEGen(Profession|ProfessionAction|ResourceAmount)&" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoParse.h
grep -E "TArray<FKBVEGenProfessionAction> Actions;|TArray<FKBVEGenResourceAmount> (Inputs|Outputs);" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoTypes.h
grep -E "StringValue|IntValue|FloatValue|BoolValue|BytesValue" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoTypes.h
```

All must print (7 structs, 3 Populate overloads, nested repeated, oneof-as-independent-UPROPERTYs). **Record the exact pascal field names** emitted on `FKBVEGenProfession`/`FKBVEGenProfessionAction`/`FKBVEGenResourceAmount` — Task 4's mapper must reference these verbatim.

- [ ] **Step 5:** Commit: `git add packages/data/codegen/gen-professiondb-uecpp.mjs packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated && git commit -m "feat(data): add gen-professiondb-uecpp codegen + generated headers"`

## Task 2: nx `sync:professiondb-uecpp` + wire into `sync:professiondb`

**Files:** Modify `apps/kbve/astro-kbve/project.json`.

- [ ] **Step 1:** Append `"sync:professiondb-uecpp"` to `sync:professiondb`'s `dependsOn`: `["sync:mapdb", "sync:itemdb"]` → `["sync:mapdb", "sync:itemdb", "sync:professiondb-uecpp"]`.
- [ ] **Step 2:** Add the target (mirror `sync:itemdb-uecpp`), placed near the other `*-uecpp` targets:

```json
		"sync:professiondb-uecpp": {
			"executor": "nx:run-commands",
			"inputs": [
				"{workspaceRoot}/packages/data/codegen/gen-professiondb-uecpp.mjs",
				"{workspaceRoot}/packages/data/codegen/descriptors/professiondb.binpb"
			],
			"outputs": [
				"{workspaceRoot}/packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoTypes.h",
				"{workspaceRoot}/packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoParse.h"
			],
			"options": {
				"command": "node packages/data/codegen/gen-professiondb-uecpp.mjs",
				"cwd": "{workspaceRoot}"
			},
			"cache": true
		},
```

- [ ] **Step 3:** Verify: `node -e "JSON.parse(require('fs').readFileSync('apps/kbve/astro-kbve/project.json','utf8'));console.log('json ok')"`; then `npx nx run astro-kbve:sync:professiondb-uecpp --skip-nx-cache` (isolated — avoids the mapdb/itemdb churn the parent triggers) → succeeds; `git status --porcelain packages/unreal/KBVEProfessionDB packages/data/codegen` shows only the (already-committed) headers, i.e. clean or headers-only.
- [ ] **Step 4:** Commit: `git commit -am "feat(nx): wire sync:professiondb-uecpp into sync:professiondb"`

## Task 3: plugin scaffold (`.uplugin`, `Build.cs`, module, version)

**Files:** Create under `packages/unreal/KBVEProfessionDB/`. Mirror `KBVEQuestDB`.

- [ ] **Step 1:** Read `KBVEQuestDB.uplugin`, `Source/KBVEQuestDB/KBVEQuestDB.Build.cs`, `KBVEQuestDB.h`, `KBVEQuestDBModule.cpp`, `version.toml` to match style/keys exactly.
- [ ] **Step 2:** `KBVEProfessionDB.uplugin`:

```json
{
	"FileVersion": 3,
	"Version": 1,
	"VersionName": "0.1.0",
	"FriendlyName": "KBVE ProfessionDB",
	"Description": "Game-agnostic profession database loader for KBVE games. Loads the shared professiondb artifact (Content/Data/professiondb-data.json) into runtime profession/action defs, flattened to an action-ref lookup. Synced from astro-kbve MDX (professiondb).",
	"Category": "KBVE",
	"CreatedBy": "KBVE",
	"CreatedByURL": "https://kbve.com",
	"SupportURL": "https://github.com/KBVE/kbve/issues",
	"CanContainContent": false,
	"IsBetaVersion": true,
	"IsExperimentalVersion": false,
	"Installed": false,
	"EnabledByDefault": false,
	"Modules": [
		{
			"Name": "KBVEProfessionDB",
			"Type": "Runtime",
			"LoadingPhase": "Default"
		}
	],
	"Plugins": [{ "Name": "KBVEYYJson", "Enabled": true }]
}
```

(Match `KBVEQuestDB.uplugin`'s exact key set + values where they differ — e.g. `EnabledByDefault`, `IsBetaVersion` — adapt to the sibling if it diverges from the above.)

- [ ] **Step 3:** `version.toml` → `version = "0.0.0"`.
- [ ] **Step 4:** `Source/KBVEProfessionDB/KBVEProfessionDB.Build.cs`:

```csharp
using UnrealBuildTool;

public class KBVEProfessionDB : ModuleRules
{
	public KBVEProfessionDB(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVEYYJson"
		});
	}
}
```

(If `KBVEQuestDB.Build.cs` sets extra flags — `bEnableExceptions`, `CppStandard`, private deps — mirror them.)

- [ ] **Step 5:** `Public/KBVEProfessionDB.h` (inline `IModuleInterface`) + `Private/KBVEProfessionDBModule.cpp` (`IMPLEMENT_MODULE(FKBVEProfessionDBModule, KBVEProfessionDB)`) — mirror `KBVEQuestDB.h`/`KBVEQuestDBModule.cpp`.
- [ ] **Step 6:** Verify: `node -e "JSON.parse(require('fs').readFileSync('packages/unreal/KBVEProfessionDB/KBVEProfessionDB.uplugin','utf8'));console.log('uplugin ok')"`; `diff <(grep -oE '"[A-Za-z]+":' packages/unreal/KBVEQuestDB/KBVEQuestDB.uplugin|sort -u) <(grep -oE '"[A-Za-z]+":' packages/unreal/KBVEProfessionDB/KBVEProfessionDB.uplugin|sort -u)` → empty (same schema).
- [ ] **Step 7:** Commit: `git commit -am "feat(unreal): scaffold KBVEProfessionDB plugin"` (add the new files first).

## Task 4: subsystem + gameplay structs + `FromGen` mapper

**Files:** Create `Public/KBVEProfessionTypes.h`, `Public/KBVEProfessionMap.h`, `Public/KBVEProfessionDBDatabase.h`, `Private/KBVEProfessionDBDatabase.cpp`. NO comments in these authored files.

- [ ] **Step 1:** `KBVEProfessionTypes.h` — `FKBVEProfessionResource{FName ItemRef; FString ItemName; int32 Quantity=1; float Chance=1.f}`, `FKBVEProfessionActionDef{FName Ref, ProfessionRef; FString Name, Description; int32 RequiredLevel=0, XpReward=0, DurationMs=0, Key=0; FName FacilityRef, ResourceNodeRef; TArray<FName> ToolRefs; TArray<FKBVEProfessionResource> Inputs, Outputs; bool IsValid()}`, `FKBVEProfessionDef{FName Ref; int32 Key=0; FString Id,Name,Description,Category; TArray<FName> Tags; int32 MaxLevel=0; TArray<FName> ActionRefs; bool IsValid()}`. USTRUCT(BlueprintType) + `#include "KBVEProfessionTypes.generated.h"`. (Full code in the design; every UPROPERTY `Category="KBVE|ProfessionDB"`.)
- [ ] **Step 2:** `KBVEProfessionMap.h` — `namespace KBVEProfessionMap` with `N(FString)->FName`, `NArray`, `FromGen(FKBVEGenResourceAmount)->FKBVEProfessionResource`, `FromGen(FKBVEGenProfession&, FKBVEGenProfessionAction&)->FKBVEProfessionActionDef` (sets `ProfessionRef=N(P.Ref)`), `FromGen(FKBVEGenProfession&)->FKBVEProfessionDef`. **CROSS-CHECK every `G.<Field>`/`A.<Field>`/`P.<Field>` against the Task-1 generated `KBVEProfessionDBProtoTypes.h` pascal names before finalizing** (e.g. `ResourceNodeRef`, `XpReward`, `DurationMs`, `ToolRefs`, `FacilityRef`).
- [ ] **Step 3:** `KBVEProfessionDBDatabase.h` — `UCLASS() UKBVEProfessionDBDatabase : public UGameInstanceSubsystem` with `Initialize`/`Deinitialize`, `LoadFromFile`(BlueprintCallable), `LoadFromJson`, `LookupActionByRef(FName)->const*`, `GetActionByRef`(BP), `GetAllActions`, `Num`(BP), `GetActionsByProfession`(BP), `FindProfessionByRef`, `GetProfessionByRef`(BP), `GetAllProfessions`; private `TArray<FKBVEProfessionActionDef> Actions; TArray<FKBVEProfessionDef> Professions; TMap<FName,int32> ActionRefToIndex, ProfessionRefToIndex`. `#include "KBVEProfessionDBDatabase.generated.h"`.
- [ ] **Step 4:** `KBVEProfessionDBDatabase.cpp` — includes the 2 generated headers + `KBVEProfessionMap.h` + `KBVEYYJson.h` + `Misc/FileHelper.h`/`Misc/Paths.h`. `Initialize`→LoadFromFile(`ProjectContentDir()/TEXT("Data/professiondb-data.json")`). `LoadFromJson`: `yyjson_read` → `yyjson_obj_get(Root,"professions")` → `yyjson_arr_foreach` → `FKBVEGenProfession Gen; KBVEProfessionDBProto::Populate(Gen, ProfVal);` → skip empty ref → `FromGen(Gen)` into Professions + index; inner `for (GenAction : Gen.Actions)` → `FromGen(Gen, GenAction)` → `ActionRefToIndex.Add(ActionDef.Ref, Actions.Num()); Actions.Add(MoveTemp(ActionDef));` → `yyjson_doc_free`. Lookups via the TMaps. (Full code in the design.)
- [ ] **Step 5:** Static verify (NO compiler):

```bash
grep -nE "public UGameInstanceSubsystem|LoadFromFile|LoadFromJson|LookupActionByRef" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/KBVEProfessionDBDatabase.h
grep -nE "yyjson_obj_get\(Root, \"professions\"\)|KBVEProfessionDBProto::Populate|KBVEProfessionMap::FromGen|ActionRefToIndex.Add|yyjson_doc_free" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Private/KBVEProfessionDBDatabase.cpp
for F in Ref XpReward DurationMs ResourceNodeRef FacilityRef ToolRefs Inputs Outputs Actions; do grep -q "${F}" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/Generated/KBVEProfessionDBProtoTypes.h && echo "gen has $F"; done
```

All print. Confirm every mapper field ref exists in the generated header (mismatch = compile break in CI).

- [ ] **Step 6:** Commit: `git commit -am "feat(unreal): add KBVEProfessionDB subsystem, types, FromGen mapper"`

## Task 5: sync `professiondb-data.json` into UE Content

**Files:** Modify `apps/rentearth/unreal-rentearth/scripts/sync-data.sh`.

- [ ] **Step 1:** Add `"professiondb-data.json"` to the `FILES=( … )` array after `"spelldb-data.json"`.
- [ ] **Step 2:** Verify: `bash -n apps/rentearth/unreal-rentearth/scripts/sync-data.sh && echo "syntax ok"`; run `./apps/rentearth/unreal-rentearth/scripts/sync-data.sh`; `ls -l apps/rentearth/unreal-rentearth/Content/Data/professiondb-data.json` exists. (If `Content/Data/` is gitignored like other games' StreamingAssets, the copied file may be untracked — check `.gitignore`; the sync-script change is the tracked deliverable.)
- [ ] **Step 3:** Confirm no other UE app needs it: `ls apps/*/unreal-*/Content/Data 2>/dev/null` — only rentearth. Commit: `git commit -am "feat(rentearth): sync professiondb-data.json into UE Content"` (stage the script; add the copied json only if that dir is tracked for the other dbs).

## Task 6: full gate + push

- [ ] **Step 1:** `npx nx run astro-kbve:sync:professiondb-uecpp --skip-nx-cache` → succeeds, headers stable. `git status --porcelain` clean (revert any stray `sync:itemdb-uecpp` UE-header churn if the parent target was run).
- [ ] **Step 2:** File inventory: `find packages/unreal/KBVEProfessionDB -type f | sort` → `.uplugin`, `version.toml`, `Build.cs`, `KBVEProfessionDB.h`, `KBVEProfessionDBModule.cpp`, `KBVEProfessionTypes.h`, `KBVEProfessionMap.h`, `KBVEProfessionDBDatabase.h`, `KBVEProfessionDBDatabase.cpp`, `Generated/KBVEProfessionDBProtoTypes.h`, `Generated/KBVEProfessionDBProtoParse.h`.
- [ ] **Step 3:** Record the honest UE-compile-gate note (PR body): no local UE compile; static-verified vs `KBVEQuestDB`; real gate is `ci-unreal-plugins.yml` (auto-discovers the plugin).
- [ ] **Step 4:** Push: `git push -u origin trunk/professiondb-ue-consumer-1785674901`.

## RISKS

- **UE compile gate:** no toolchain here — Tasks 3/4 are static-verified only (shape/parity/field-name existence). A UHT/UBT-only error (missing include, `GENERATED_BODY` order, reflection on a namespace fn) surfaces only in `ci-unreal-plugins.yml`. Mitigated by mirroring `KBVEQuestDB` structurally + cross-checking mapper field names against the generated header.
- **Generator drift:** Task 1 is `cp`+token-swap (NOT a rewrite) → generator engine identical to the proven sibling → output shape guaranteed. If any non-token line differs, that's a bug.
- **Field-name mismatch:** the hand-written mapper (Task 4) must reference the exact pascal names the generator emits — the #1 CI-break risk; Step 5 cross-checks it.
- **Content/Data tracking:** the copied `professiondb-data.json` may be gitignored (like rareicon StreamingAssets); the tracked deliverable is the `sync-data.sh` change + the plugin, not necessarily the copied json.
- **oneof/enum:** handled by the generator with zero new logic (already exercised by npc/spell); `ProfessionExtension` oneof → independent UPROPERTYs, enums → FString names.

## Self-Review

- **Scope:** UE professiondb consumer = codegen + nx + standalone `KBVEProfessionDB` plugin (loader + action-ref query) + data sync. Deep gameplay resolution (KBVEMapDB→professiondb) + the `KBVEData` multi-module consolidation are separate/out of scope.
- **Consumption parity vs Unity:** Unity keys item→gather/compress; UE keys action-ref→action (its hook is node→action). Same data, different index — deliberate, both correct.
- **Safety:** the only machine-verifiable parts (generator, nx target, data sync) are gated locally; the C++ is honestly flagged as CI-gated only.
