# professiondb UE gather vertical slice (Phase C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the professiondb→gather resolution loop in rentearth UE: press Interact near a resource node → resolve its `ProfessionActionRef` through `UKBVEProfessionDBDatabase` → grant the action's `Outputs` into the player inventory → decrement the node's remaining amount.

**Architecture:** A new `AchuckResourceNode` actor mirrors `AchuckArcadeCabinet` exactly (sphere-overlap proximity + a file-local `GCurrentNearbyResourceNode` weak pointer, non-replicated). At `BeginPlay` it reads its own `FKBVEWorldObjectDef` from `UKBVEMapDatabase::FindObjectByRef(NodeRef)` to seed a plain `RemainingAmount` and cache `ProfessionActionRef`. The existing `Interact` input handler is rewritten to try the nearby node before the arcade fallback: it fetches the possessed `AchuckCoreCharacter` and calls `Node->Gather(Char)`. `Gather` is **authority-guarded** (`Char->HasAuthority()`) — it resolves the action via `UKBVEProfessionDBDatabase::LookupActionByRef`, and for each `Output` calls the existing server-authoritative `AchuckCoreCharacter::ServerAddItemByRef(ItemRef, Quantity)`, then decrements `RemainingAmount`.

**Tech Stack:** UE5 C++ (`AActor`, `USphereComponent` overlap, `UGameInstanceSubsystem` lookups, Enhanced Input handler), rentearth `chuck` game module + KBVEMapDB/KBVEProfessionDB plugins.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-c`, branch `trunk/professiondb-ue-gather`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored C++.
- **NO UE toolchain here** — none of this compiles/runs locally. Correctness bar = (a) structural parity with the cited precedents (`AchuckArcadeCabinet`, `ServerAddItemByRef`), (b) every cross-type field/method referenced exists verbatim in the header the dossier quotes, (c) includes/module-deps resolve. clangd `CoreMinimal.h not found`/`Unknown type` diagnostics are EXPECTED noise — ignore.
- **Scope = grant items only.** DEFER (read but do NOT apply): `RequiredLevel`/level-gate, `XpReward` (no UE skill system exists), `DurationMs`/harvest channel timer, `Chance` (grant every Output at full `Quantity`). DEFER: mapdb-driven world spawning (nodes are hand-placed in-level), Mass depletion/respawn processor, `RemainingAmount` replication, and the client→server **RPC** — `Gather` runs authority-local (correct in standalone/PIE/listen-host; no-ops on a remote client). Document these in code-free plan text and the PR body, not in code comments.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.
- The realistic verification path is UE CI. Task 1 (plugin enable) is gated by `ci-unreal-plugins.yml` for the plugin itself, but the **game-side C++ (Tasks 2-3) lives in the `chuck` module, which that workflow does NOT compile** — Task 4 must determine whether any workflow builds rentearth's game target and state the true gate honestly.

## Verified facts (from `.superpowers/sdd/phaseC-facts.md` — read it for verbatim snippets)

- Precedent actor `apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckArcadeCabinet.{h,cpp}`: file-local `namespace { TWeakObjectPtr<AchuckArcadeCabinet> GCurrentNearbyArcade; }`; `USphereComponent InteractionRadius` (`SetCollisionProfileName("OverlapAllDynamic")`, `SetGenerateOverlapEvents(true)`); `BeginPlay` binds `OnComponentBeginOverlap`/`EndOverlap`; handlers filter `Cast<APawn>(OtherActor)->IsPlayerControlled()`, set/clear the singleton; `EndPlay` resets it if `== this`; static `GetNearby()`/`ActivateNearby()`. Plain `UCLASS()`, no `CHUCK_API`. Lives in `Source/chuck/Props/`.
- Interact handler `apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp:887-893` `OnInteractPressed(const FInputActionValue&)` currently only calls `AchuckArcadeCabinet::ActivateNearby()`. Possessed-character idiom in this file: `AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());`. `#include "Props/chuckArcadeCabinet.h"` at line 16.
- Grant entry `apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCoreCharacter.h:45-46`: `int32 ServerAddItemByKey(int32,int32);` `int32 ServerAddItemByRef(FName,int32);` — plain methods, `HasAuthority()` guard lives inside `ServerAddItemByKey`; return = LEFTOVER count (0 = fully granted).
- professiondb: `UKBVEProfessionDBDatabase::LookupActionByRef(FName) const -> const FKBVEProfessionActionDef*`. `FKBVEProfessionActionDef.Outputs` = `TArray<FKBVEProfessionResource>`; `FKBVEProfessionResource{ FName ItemRef; FString ItemName; int32 Quantity=1; float Chance=1.f; }`. Header `packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/KBVEProfessionDBDatabase.h` + `KBVEProfessionTypes.h`.
- mapdb: `UKBVEMapDatabase::FindObjectByRef(FName) const -> const FKBVEWorldObjectDef*`. `FKBVEWorldObjectDef` has `FName ProfessionActionRef; int32 InitialAmount; int32 MaxAmount; int32 HarvestTimeMs; int32 HarvestWeight; bool bInteractable;`. Header `packages/unreal/KBVEMapDB/.../KBVEMapTypes.h`, subsystem `KBVEMapDatabase.h`.
- Subsystem fetch idiom (used across chuck): `UGameInstance* GI = GetGameInstance(); auto* Sub = GI ? GI->GetSubsystem<T>() : nullptr;`.
- `chuck.Build.cs` `PrivateDependencyModuleNames` already has `KBVEItemDB`; `KBVEMapDB` and `KBVEProfessionDB` are ABSENT — must be added.
- `rentearth.uproject`: `KBVEMapDB` enabled; `KBVEProfessionDB` ABSENT — must be added `{ "Name": "KBVEProfessionDB", "Enabled": true }` matching the file's exact entry formatting.

---

## Task 1: enable the plugin + module deps

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/rentearth.uproject`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs`

- [ ] **Step 1:** In `rentearth.uproject`, add a `KBVEProfessionDB` plugin entry to the `Plugins` array, placed right after the `KBVEMapDB` entry, matching the EXACT whitespace/formatting of the surrounding entries (read the raw lines first): `{ "Name": "KBVEProfessionDB", "Enabled": true }`.
- [ ] **Step 2:** In `chuck.Build.cs`, add `"KBVEMapDB"` and `"KBVEProfessionDB"` to `PrivateDependencyModuleNames`, immediately after the existing `"KBVEItemDB"` line, matching indentation.
- [ ] **Step 3: Verify.**
```bash
node -e "JSON.parse(require('fs').readFileSync('apps/rentearth/unreal-rentearth/rentearth.uproject','utf8'));console.log('uproject json ok')"
grep -n "KBVEProfessionDB" apps/rentearth/unreal-rentearth/rentearth.uproject
grep -nE '"KBVEMapDB"|"KBVEProfessionDB"' apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs
```
Expected: `uproject json ok`; the plugin entry prints; both module deps print in Build.cs.
- [ ] **Step 4: Commit.**
```bash
git add apps/rentearth/unreal-rentearth/rentearth.uproject apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs
git commit -m "build(rentearth): enable KBVEProfessionDB + KBVEMapDB deps for gathering"
```

## Task 2: `AchuckResourceNode` actor (proximity + gather resolution)

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.cpp`

**Interfaces:**
- Produces: `class AchuckResourceNode : public AActor` with `static AchuckResourceNode* GetNearby();`, `void Gather(class AchuckCoreCharacter* Gatherer);`, and `UPROPERTY(EditAnywhere) FName NodeRef;`. Task 3 calls `GetNearby()` + `Gather()`.

- [ ] **Step 1: Read the precedent in full** — `Source/chuck/Props/chuckArcadeCabinet.h` and `.cpp` — to mirror structure, subobject setup, overlap binding, and the file-local singleton exactly.

- [ ] **Step 2: Write `chuckResourceNode.h`** (mirror the arcade header; NO `CHUCK_API`; NO comments):
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckResourceNode.generated.h"

class USphereComponent;
class UStaticMeshComponent;
class AchuckCoreCharacter;

UCLASS()
class AchuckResourceNode : public AActor
{
	GENERATED_BODY()

public:
	AchuckResourceNode();

	void Gather(AchuckCoreCharacter* Gatherer);

	bool IsDepleted() const { return RemainingAmount <= 0; }

	static AchuckResourceNode* GetNearby();
	static bool GatherNearby(AchuckCoreCharacter* Gatherer);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	UFUNCTION()
	void HandleBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void HandleEndOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);

	UPROPERTY(VisibleAnywhere, Category = "ResourceNode")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "ResourceNode")
	TObjectPtr<USphereComponent> InteractionRadius;

	UPROPERTY(EditAnywhere, Category = "ResourceNode")
	FName NodeRef;

	UPROPERTY(EditAnywhere, Category = "ResourceNode", meta = (ClampMin = "50"))
	float InteractionRadiusCm = 250.f;

	FName ProfessionActionRef;

	int32 RemainingAmount = 0;
};
```

- [ ] **Step 3: Write `chuckResourceNode.cpp`** (NO comments). Mirror the arcade `.cpp` for the subobject/overlap/singleton mechanics; the new logic is `BeginPlay`'s def lookup and `Gather`:
```cpp
#include "Props/chuckResourceNode.h"

#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/GameInstance.h"
#include "GameFramework/Pawn.h"

#include "Core/chuckCoreCharacter.h"
#include "KBVEMapDatabase.h"
#include "KBVEMapTypes.h"
#include "KBVEProfessionDBDatabase.h"
#include "KBVEProfessionTypes.h"

namespace
{
	TWeakObjectPtr<AchuckResourceNode> GCurrentNearbyResourceNode;
}

AchuckResourceNode::AchuckResourceNode()
{
	PrimaryActorTick.bCanEverTick = false;
	SetReplicates(false);

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;

	InteractionRadius = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionRadius"));
	InteractionRadius->SetupAttachment(RootComponent);
	InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	InteractionRadius->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	InteractionRadius->SetGenerateOverlapEvents(true);
}

void AchuckResourceNode::BeginPlay()
{
	Super::BeginPlay();

	if (InteractionRadius)
	{
		InteractionRadius->OnComponentBeginOverlap.AddDynamic(this, &AchuckResourceNode::HandleBeginOverlap);
		InteractionRadius->OnComponentEndOverlap.AddDynamic(this, &AchuckResourceNode::HandleEndOverlap);
		InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	}

	UGameInstance* GI = GetGameInstance();
	UKBVEMapDatabase* MapDB = GI ? GI->GetSubsystem<UKBVEMapDatabase>() : nullptr;
	if (MapDB)
	{
		if (const FKBVEWorldObjectDef* Def = MapDB->FindObjectByRef(NodeRef))
		{
			ProfessionActionRef = Def->ProfessionActionRef;
			RemainingAmount = Def->InitialAmount > 0 ? Def->InitialAmount : Def->MaxAmount;
		}
	}
}

void AchuckResourceNode::EndPlay(const EEndPlayReason::Type Reason)
{
	if (GCurrentNearbyResourceNode.Get() == this)
	{
		GCurrentNearbyResourceNode.Reset();
	}
	Super::EndPlay(Reason);
}

void AchuckResourceNode::HandleBeginOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	GCurrentNearbyResourceNode = this;
}

void AchuckResourceNode::HandleEndOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	if (GCurrentNearbyResourceNode.Get() == this)
	{
		GCurrentNearbyResourceNode.Reset();
	}
}

void AchuckResourceNode::Gather(AchuckCoreCharacter* Gatherer)
{
	if (!Gatherer || !Gatherer->HasAuthority())
	{
		return;
	}
	if (RemainingAmount <= 0 || ProfessionActionRef.IsNone())
	{
		return;
	}

	UGameInstance* GI = GetGameInstance();
	UKBVEProfessionDBDatabase* ProfDB = GI ? GI->GetSubsystem<UKBVEProfessionDBDatabase>() : nullptr;
	if (!ProfDB)
	{
		return;
	}

	const FKBVEProfessionActionDef* Action = ProfDB->LookupActionByRef(ProfessionActionRef);
	if (!Action)
	{
		return;
	}

	for (const FKBVEProfessionResource& Output : Action->Outputs)
	{
		if (Output.ItemRef.IsNone() || Output.Quantity <= 0)
		{
			continue;
		}
		Gatherer->ServerAddItemByRef(Output.ItemRef, Output.Quantity);
	}

	RemainingAmount -= 1;
}

AchuckResourceNode* AchuckResourceNode::GetNearby()
{
	return GCurrentNearbyResourceNode.Get();
}

bool AchuckResourceNode::GatherNearby(AchuckCoreCharacter* Gatherer)
{
	AchuckResourceNode* Near = GCurrentNearbyResourceNode.Get();
	if (!Near || Near->IsDepleted())
	{
		return false;
	}
	Near->Gather(Gatherer);
	return true;
}
```

- [ ] **Step 4: Static verify** (NO compiler):
```bash
# every cross-type symbol the .cpp references must exist in the plugin headers:
grep -n "FindObjectByRef" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapDatabase.h
grep -nE "ProfessionActionRef|InitialAmount|MaxAmount" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h
grep -n "LookupActionByRef" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/KBVEProfessionDBDatabase.h
grep -nE "struct FKBVEProfessionResource|FName ItemRef|int32 Quantity|TArray<FKBVEProfessionResource> Outputs" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Public/KBVEProfessionTypes.h
grep -nE "int32 ServerAddItemByRef" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCoreCharacter.h
# confirm the two plugin subsystems auto-load data in Initialize (else lookups no-op at runtime):
grep -nE "LoadFromFile|professiondb-data.json" packages/unreal/KBVEProfessionDB/Source/KBVEProfessionDB/Private/KBVEProfessionDBDatabase.cpp
grep -nE "LoadFromFile|mapdb-data.json|-data.json" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
```
All symbol greps must print. For the last two: confirm each subsystem's `Initialize()` calls `LoadFromFile(...Content/Data/...-data.json)`. If mapdb does NOT auto-load, record it as a DONE_WITH_CONCERNS note (the slice still compiles; runtime data load is a separate prerequisite) — do not block.

- [ ] **Step 5: Commit.**
```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.cpp
git commit -m "feat(rentearth): add AchuckResourceNode gather actor (professiondb resolution)"
```

## Task 3: rewire the Interact handler

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp`

- [ ] **Step 1:** Add `#include "Props/chuckResourceNode.h"` alongside the existing `#include "Props/chuckArcadeCabinet.h"` (line ~16). Confirm `#include "Core/chuckCoreCharacter.h"` (or the character header) is already included in this .cpp — if not, add it (the file already casts to `AchuckCoreCharacter` per the dossier, so it is).
- [ ] **Step 2:** Rewrite `OnInteractPressed` (lines ~887-893) to try the resource node first, then fall back to arcade:
```cpp
void AchuckCorePlayerController::OnInteractPressed(const FInputActionValue& /*Value*/)
{
	if (AchuckResourceNode::GetNearby())
	{
		AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn());
		if (Char && AchuckResourceNode::GatherNearby(Char))
		{
			return;
		}
	}

	if (!AchuckArcadeCabinet::ActivateNearby())
	{
		UE_LOG(LogTemp, Verbose, TEXT("[chuck] Interact pressed — no nearby interactable"));
	}
}
```
- [ ] **Step 3: Static verify:**
```bash
grep -n '#include "Props/chuckResourceNode.h"' apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp
grep -nE "AchuckResourceNode::GetNearby|AchuckResourceNode::GatherNearby" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp
grep -nE "GetNearby|GatherNearby" apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h
```
The controller references + the header declarations must match (same static method names/signatures).
- [ ] **Step 4: Commit.**
```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp
git commit -m "feat(rentearth): route Interact to nearby resource node before arcade"
```

## Task 4: gate + push + PR

- [ ] **Step 1: Whole-slice static consistency** — re-run every symbol grep from Tasks 2-3; confirm the mapper's referenced field/method names all exist and the controller↔actor static-method names agree.
- [ ] **Step 2: Determine the real CI gate.** Search `.github/workflows/` for any workflow that builds the rentearth GAME target (not just `ci-unreal-plugins.yml`, which compiles plugins only): `grep -rniE "rentearth|chuck.*Target|UnrealGame.*rentearth" .github/workflows/`. Record in the PR body which workflow (if any) actually compiles `chuckResourceNode`/the controller change — if none, state plainly that the game-module C++ is static-verified only with no automated compile gate.
- [ ] **Step 3:** `git status --porcelain` clean. Push `git push -u origin trunk/professiondb-ue-gather`.
- [ ] **Step 4:** PR `--base dev`, title `feat(rentearth): professiondb gather vertical slice`. Body must state: (a) what the slice does (Interact→resolve→grant); (b) explicit DEFERRED list (XP/skill system, level-gate, duration channel, output chance, mapdb world-spawning, Mass depletion/respawn, RemainingAmount replication, client→server RPC — so it's authority-local, works in standalone/PIE/listen-host only); (c) the honest compile-gate status from Step 2; (d) that nodes are hand-placed in-level (`AchuckResourceNode` with a `NodeRef`) for now.

## RISKS

- **Untestable C++:** no local UE build; Tasks 2-3 are static-verified against precedent only. The `chuck` game module may have NO CI compile gate (Task 4 Step 2 establishes this) — highest residual risk in the whole professiondb epic. Mitigated by exact-mirroring `AchuckArcadeCabinet` + grepping every referenced symbol against its header.
- **Authority-local only:** `Gather` guards `HasAuthority()`; on a dedicated server with a remote client, Interact runs client-side and no-ops. This is the deliberate deferred-RPC scope — the slice is exercisable in standalone/PIE/listen-host.
- **Runtime data load:** if `UKBVEMapDatabase`/`UKBVEProfessionDBDatabase` don't auto-load their `-data.json` in `Initialize()`, lookups no-op (node never learns its ProfessionActionRef; gather does nothing). Task 2 Step 4 checks this; if absent it's a follow-up prerequisite, not a compile failure.
- **Silent grant failure:** `ServerAddItemByRef` returns leftover with no error if an output item ref doesn't resolve in `UchuckItemDB`. Acceptable for the slice; a "granted 0 of N" log is a deferred nicety.

## Self-Review

- Scope = the resolution loop only, mirroring existing patterns; every heavier system (XP, world-gen, Mass, replication, RPC) explicitly deferred and documented.
- No new subsystem, no new input action, no new grant path — reuses `Interact`, `ServerAddItemByRef`, and both lookup subsystems.
- The one genuinely new runtime object is `AchuckResourceNode`, a near-verbatim structural clone of `AchuckArcadeCabinet` plus a `Gather` method built only from verified signatures.
