# RentEarth ARPG Ephemeral Events — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the 8 server ephemeral gameplay events and drive the Unreal client HUD + worldspace FX (damage numbers, projectile tracers, bars, toasts).

**Architecture:** Per-kind postcard decoders + an `OnEphemeral` delegate in the transport module `KBVESimgrid` (fixture-locked to the laser hex vectors). Two reusable worldspace FX actors in `KBVESimgridRender`. A `chuck`-side router that decodes on `OnEphemeral`, spawns FX, and republishes to the existing `UchuckUIEvents` bus. Server stays full authority.

**Tech Stack:** UE 5.8, C++, UE Automation tests, existing `FPostcardReader` (KBVESimgrid), `TKBVEChannel<T>` (KBVEEvents), `SKBVEToastLayer` (KBVEUI).

## Global Constraints

- No code comments anywhere (project rule — every file, no exceptions).
- Additions to `KBVESimgrid` are additive; do not change existing transport behavior.
- Export macros: `KBVESIMGRID_API` (KBVESimgrid), `KBVESIMGRIDRENDER_API` (KBVESimgridRender).
- Postcard read order is wire-critical and positional. `FPostcardReader::VarI32()` already zigzag-decodes; `Option()` reads one present-byte → bool; `String()` reads varint-len + UTF-8; `SeqLen()` reads a varint count.
- Ephemeral kind numbers: Inventory=1, Combat=2, Pickup=3, ItemUsed=5, Equipped=6, Stats=7, Status=8, Projectile=12.
- `to == 65535` (u16::MAX) is broadcast; state events (Stats/Inventory/Status/Equipped) apply only when `To == YourSlot`.
- Test naming `KBVE.Simgrid.Ephemeral.<Case>`, guarded `#if WITH_DEV_AUTOMATION_TESTS`, flags `EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter`.
- Build/run: editor target `chuckEditor Mac Development` via `UE_5.8` `Build.sh`, project = the worktree's `apps/rentearth/unreal-rentearth/rentearth.uproject`; automation via `UnrealEditor-Cmd -nullrhi -unattended -nopause -ExecCmds="Automation RunTests KBVE.Simgrid.Ephemeral; Quit" -TestExit="Automation Test Queue Empty"`. Clear stale locks first: `pkill -9 -f UnrealEditor-Cmd; rm -f /tmp/UnrealEditor-Cmd*`.
- Pinned laser fixtures (verbatim, from `packages/npm/laser/src/lib/net/postcard-wire.spec.ts`): Combat `02070106676f626c696e0a0100`, Projectile `020a050e04056172726f7701`, Pickup `056172726f7703`, ItemUsed `06706f74696f6e18`, Equipped `010573776f726406776561706f6e0602`, Stats `0464c801500e031428`, Status `030305`, Inventory `0200056172726f77030006706f74696f6e01`.

---

### Task 1: Ephemeral structs + FEphemeralCodec — Combat / Pickup / ItemUsed / Status

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridEphemeral.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridEphemeral.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridEphemeralTests.cpp`

**Interfaces:**
- Consumes: `FPostcardReader`, `FSimgridTile` (from `SimgridPostcard.h` / `SimgridProto.h`).
- Produces: structs `FSimgridCombat`, `FSimgridPickup`, `FSimgridItemUsed`, `FSimgridStatus` and `FEphemeralCodec::DecodeCombat/DecodePickup/DecodeItemUsed/DecodeStatus`. (Projectile/Equipped/Stats/Inventory added in Task 2 to the same files.)

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridEphemeralTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridEphemeral.h"

static TArray<uint8> HexBytes(const FString& Hex)
{
	TArray<uint8> Out;
	for (int32 i = 0; i + 1 < Hex.Len(); i += 2)
	{
		Out.Add((uint8)FParse::HexNumber(*Hex.Mid(i, 2)));
	}
	return Out;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralCombatTest,
	"KBVE.Simgrid.Ephemeral.Combat",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralCombatTest::RunTest(const FString& Parameters)
{
	const FSimgridCombat C = FEphemeralCodec::DecodeCombat(HexBytes(TEXT("02070106676f626c696e0a0100")));
	TestEqual("attacker", C.Attacker, (uint32)2);
	TestEqual("target", C.Target, (uint32)7);
	TestTrue("has ref", C.bHasTargetRef);
	TestEqual("ref", C.TargetRef, FString(TEXT("goblin")));
	TestEqual("dmg", C.Dmg, 5);
	TestTrue("crit", C.bCrit);
	TestFalse("died", C.bDied);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralPickupTest,
	"KBVE.Simgrid.Ephemeral.Pickup",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralPickupTest::RunTest(const FString& Parameters)
{
	const FSimgridPickup P = FEphemeralCodec::DecodePickup(HexBytes(TEXT("056172726f7703")));
	TestEqual("ref", P.ItemRef, FString(TEXT("arrow")));
	TestEqual("count", P.Count, (uint32)3);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralItemUsedTest,
	"KBVE.Simgrid.Ephemeral.ItemUsed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralItemUsedTest::RunTest(const FString& Parameters)
{
	const FSimgridItemUsed U = FEphemeralCodec::DecodeItemUsed(HexBytes(TEXT("06706f74696f6e18")));
	TestEqual("ref", U.ItemRef, FString(TEXT("potion")));
	TestEqual("heal", U.Heal, 12);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralStatusTest,
	"KBVE.Simgrid.Ephemeral.Status",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralStatusTest::RunTest(const FString& Parameters)
{
	const FSimgridStatus S = FEphemeralCodec::DecodeStatus(HexBytes(TEXT("030305")));
	TestEqual("kind", (int32)S.Kind, 3);
	TestEqual("magnitude", S.Magnitude, -2);
	TestEqual("remaining", S.Remaining, (uint32)5);
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run the `Build.sh` compile (see Global Constraints).
Expected: FAIL — `SimgridEphemeral.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridEphemeral.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "SimgridProto.h"

struct KBVESIMGRID_API FSimgridCombat
{
	uint32 Attacker = 0;
	uint32 Target = 0;
	bool bHasTargetRef = false;
	FString TargetRef;
	int32 Dmg = 0;
	bool bCrit = false;
	bool bDied = false;
};

struct KBVESIMGRID_API FSimgridPickup
{
	FString ItemRef;
	uint32 Count = 0;
};

struct KBVESIMGRID_API FSimgridItemUsed
{
	FString ItemRef;
	int32 Heal = 0;
};

struct KBVESIMGRID_API FSimgridStatus
{
	uint8 Kind = 0;
	int32 Magnitude = 0;
	uint32 Remaining = 0;
};

struct KBVESIMGRID_API FSimgridProjectile
{
	uint32 Attacker = 0;
	FSimgridTile From;
	FSimgridTile To;
	FString Kind;
	bool bHit = false;
};

struct KBVESIMGRID_API FSimgridEquipped
{
	bool bHasItemRef = false;
	FString ItemRef;
	FString Slot;
	int32 Attack = 0;
	int32 Defense = 0;
};

struct KBVESIMGRID_API FSimgridStats
{
	int32 Level = 0;
	int32 Xp = 0;
	int32 XpNext = 0;
	int32 MaxHp = 0;
	int32 Attack = 0;
	uint32 Kills = 0;
	int32 Mp = 0;
	int32 MaxMp = 0;
};

struct KBVESIMGRID_API FSimgridInvItem
{
	FString Id;
	FString ItemRef;
	uint32 Count = 0;
};

struct KBVESIMGRID_API FSimgridInventory
{
	TArray<FSimgridInvItem> Items;
};

class KBVESIMGRID_API FEphemeralCodec
{
public:
	static FSimgridCombat DecodeCombat(const TArray<uint8>& Payload);
	static FSimgridPickup DecodePickup(const TArray<uint8>& Payload);
	static FSimgridItemUsed DecodeItemUsed(const TArray<uint8>& Payload);
	static FSimgridStatus DecodeStatus(const TArray<uint8>& Payload);
	static FSimgridProjectile DecodeProjectile(const TArray<uint8>& Payload);
	static FSimgridEquipped DecodeEquipped(const TArray<uint8>& Payload);
	static FSimgridStats DecodeStats(const TArray<uint8>& Payload);
	static FSimgridInventory DecodeInventory(const TArray<uint8>& Payload);
};
```

- [ ] **Step 4: Write the implementation (Task 1 methods only)**

`Private/SimgridEphemeral.cpp`:

```cpp
#include "SimgridEphemeral.h"
#include "SimgridPostcard.h"

FSimgridCombat FEphemeralCodec::DecodeCombat(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridCombat C;
	C.Attacker = R.VarU32();
	C.Target = R.VarU32();
	C.bHasTargetRef = R.Option();
	if (C.bHasTargetRef)
	{
		C.TargetRef = R.String();
	}
	C.Dmg = R.VarI32();
	C.bCrit = R.Bool();
	C.bDied = R.Bool();
	return C;
}

FSimgridPickup FEphemeralCodec::DecodePickup(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridPickup P;
	P.ItemRef = R.String();
	P.Count = R.VarU32();
	return P;
}

FSimgridItemUsed FEphemeralCodec::DecodeItemUsed(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridItemUsed U;
	U.ItemRef = R.String();
	U.Heal = R.VarI32();
	return U;
}

FSimgridStatus FEphemeralCodec::DecodeStatus(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridStatus S;
	S.Kind = R.U8();
	S.Magnitude = R.VarI32();
	S.Remaining = R.VarU32();
	return S;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run the automation command with `KBVE.Simgrid.Ephemeral`.
Expected: `Combat`, `Pickup`, `ItemUsed`, `Status` all `Success` (Task 2 tests not yet present).

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridEphemeral.h packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridEphemeral.cpp packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridEphemeralTests.cpp
git commit -m "feat(KBVESimgrid): ephemeral combat/pickup/itemused/status decoders"
```

---

### Task 2: FEphemeralCodec — Projectile / Equipped / Stats / Inventory

**Files:**
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridEphemeral.cpp` (add 4 methods)
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridEphemeralTests.cpp` (add 4 tests)

**Interfaces:**
- Consumes: `FPostcardReader`, the structs + declarations from Task 1 (already in `SimgridEphemeral.h`).
- Produces: `FEphemeralCodec::DecodeProjectile/DecodeEquipped/DecodeStats/DecodeInventory` implementations.

- [ ] **Step 1: Add the failing tests**

Append to `Private/Tests/SimgridEphemeralTests.cpp` (before the final `#endif`):

```cpp
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralProjectileTest,
	"KBVE.Simgrid.Ephemeral.Projectile",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralProjectileTest::RunTest(const FString& Parameters)
{
	const FSimgridProjectile P = FEphemeralCodec::DecodeProjectile(HexBytes(TEXT("020a050e04056172726f7701")));
	TestEqual("attacker", P.Attacker, (uint32)2);
	TestEqual("from.x", P.From.X, 5);
	TestEqual("from.y", P.From.Y, -3);
	TestEqual("to.x", P.To.X, 7);
	TestEqual("to.y", P.To.Y, 2);
	TestEqual("kind", P.Kind, FString(TEXT("arrow")));
	TestTrue("hit", P.bHit);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralEquippedTest,
	"KBVE.Simgrid.Ephemeral.Equipped",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralEquippedTest::RunTest(const FString& Parameters)
{
	const FSimgridEquipped E = FEphemeralCodec::DecodeEquipped(HexBytes(TEXT("010573776f726406776561706f6e0602")));
	TestTrue("has ref", E.bHasItemRef);
	TestEqual("ref", E.ItemRef, FString(TEXT("sword")));
	TestEqual("slot", E.Slot, FString(TEXT("weapon")));
	TestEqual("attack", E.Attack, 3);
	TestEqual("defense", E.Defense, 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralStatsTest,
	"KBVE.Simgrid.Ephemeral.Stats",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralStatsTest::RunTest(const FString& Parameters)
{
	const FSimgridStats S = FEphemeralCodec::DecodeStats(HexBytes(TEXT("0464c801500e031428")));
	TestEqual("level", S.Level, 2);
	TestEqual("xp", S.Xp, 50);
	TestEqual("xp_next", S.XpNext, 100);
	TestEqual("max_hp", S.MaxHp, 40);
	TestEqual("attack", S.Attack, 7);
	TestEqual("kills", S.Kills, (uint32)3);
	TestEqual("mp", S.Mp, 10);
	TestEqual("max_mp", S.MaxMp, 20);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridEphemeralInventoryTest,
	"KBVE.Simgrid.Ephemeral.Inventory",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridEphemeralInventoryTest::RunTest(const FString& Parameters)
{
	const FSimgridInventory Inv = FEphemeralCodec::DecodeInventory(HexBytes(TEXT("0200056172726f77030006706f74696f6e01")));
	TestEqual("count", Inv.Items.Num(), 2);
	TestEqual("i0 id", Inv.Items[0].Id, FString(TEXT("")));
	TestEqual("i0 ref", Inv.Items[0].ItemRef, FString(TEXT("arrow")));
	TestEqual("i0 count", Inv.Items[0].Count, (uint32)3);
	TestEqual("i1 ref", Inv.Items[1].ItemRef, FString(TEXT("potion")));
	TestEqual("i1 count", Inv.Items[1].Count, (uint32)1);
	return true;
}
```

- [ ] **Step 2: Run to verify they fail**

Run the `Build.sh` compile.
Expected: FAIL — link error / unresolved `DecodeProjectile` etc.

- [ ] **Step 3: Add the implementations**

Append to `Private/SimgridEphemeral.cpp`:

```cpp
static FSimgridTile ReadTile(FPostcardReader& R)
{
	FSimgridTile T;
	T.X = R.VarI32();
	T.Y = R.VarI32();
	return T;
}

FSimgridProjectile FEphemeralCodec::DecodeProjectile(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridProjectile P;
	P.Attacker = R.VarU32();
	P.From = ReadTile(R);
	P.To = ReadTile(R);
	P.Kind = R.String();
	P.bHit = R.Bool();
	return P;
}

FSimgridEquipped FEphemeralCodec::DecodeEquipped(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridEquipped E;
	E.bHasItemRef = R.Option();
	if (E.bHasItemRef)
	{
		E.ItemRef = R.String();
	}
	E.Slot = R.String();
	E.Attack = R.VarI32();
	E.Defense = R.VarI32();
	return E;
}

FSimgridStats FEphemeralCodec::DecodeStats(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridStats S;
	S.Level = R.VarI32();
	S.Xp = R.VarI32();
	S.XpNext = R.VarI32();
	S.MaxHp = R.VarI32();
	S.Attack = R.VarI32();
	S.Kills = R.VarU32();
	S.Mp = R.VarI32();
	S.MaxMp = R.VarI32();
	return S;
}

FSimgridInventory FEphemeralCodec::DecodeInventory(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridInventory Inv;
	const int32 N = R.SeqLen();
	for (int32 i = 0; i < N; ++i)
	{
		FSimgridInvItem Item;
		Item.Id = R.String();
		Item.ItemRef = R.String();
		Item.Count = R.VarU32();
		Inv.Items.Add(Item);
	}
	return Inv;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run the automation command with `KBVE.Simgrid.Ephemeral`.
Expected: all 8 `Success` (Combat, Pickup, ItemUsed, Status, Projectile, Equipped, Stats, Inventory).

- [ ] **Step 5: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridEphemeral.cpp packages/unreal/KBVENet/Source/KBVESimgrid/Private/Tests/SimgridEphemeralTests.cpp
git commit -m "feat(KBVESimgrid): ephemeral projectile/equipped/stats/inventory decoders"
```

---

### Task 3: Subsystem OnEphemeral delegate + getters

**Files:**
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridClientSubsystem.h`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridClientSubsystem.cpp`

**Interfaces:**
- Consumes: `FServerDecoded.EphemeralKind/EphemeralTo/EphemeralPayload` (existing).
- Produces: `USimgridClientSubsystem::OnEphemeral` (dynamic multicast, no params), `int32 GetLastEphemeralKind() const`, `int32 GetLastEphemeralTo() const`, `const TArray<uint8>& GetLastEphemeralPayload() const`.

Compile-only (delegate plumbing; the decoders it feeds are already tested in Tasks 1-2).

- [ ] **Step 1: Add the delegate + members to the header**

In `Public/SimgridClientSubsystem.h`, after the existing `DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnDisconnected);` line, add:

```cpp
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSimgridOnEphemeral);
```

In the `public:` section, after the existing `OnDisconnected` UPROPERTY, add:

```cpp
	UPROPERTY(BlueprintAssignable, Category = "KBVE|Simgrid")
	FSimgridOnEphemeral OnEphemeral;

	int32 GetLastEphemeralKind() const { return LastEphemeralKind; }
	int32 GetLastEphemeralTo() const { return LastEphemeralTo; }
	const TArray<uint8>& GetLastEphemeralPayload() const { return LastEphemeralPayload; }
```

In the `private:` section, after `FSimgridSnapshot LastSnapshot;`, add:

```cpp
	int32 LastEphemeralKind = 0;
	int32 LastEphemeralTo = 0;
	TArray<uint8> LastEphemeralPayload;
```

- [ ] **Step 2: Wire HandleBinary in the cpp**

In `Private/SimgridClientSubsystem.cpp`, replace the existing `case EServerEventType::Ephemeral:` block:

```cpp
	case EServerEventType::Ephemeral:
		UE_LOG(LogKBVESimgrid, Verbose, TEXT("Ephemeral kind=%u (%d bytes)"), D.EphemeralKind, D.EphemeralPayload.Num());
		break;
```

with:

```cpp
	case EServerEventType::Ephemeral:
		LastEphemeralKind = (int32)D.EphemeralKind;
		LastEphemeralTo = (int32)D.EphemeralTo;
		LastEphemeralPayload = D.EphemeralPayload;
		OnEphemeral.Broadcast();
		break;
```

- [ ] **Step 3: Compile**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgrid/Public/SimgridClientSubsystem.h packages/unreal/KBVENet/Source/KBVESimgrid/Private/SimgridClientSubsystem.cpp
git commit -m "feat(KBVESimgrid): OnEphemeral delegate + last-ephemeral getters"
```

---

### Task 4: EntityManager WorldPosOf getter

**Files:**
- Modify: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityManager.h`
- Modify: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityManager.cpp`

**Interfaces:**
- Consumes: the existing `TMap<uint32, TObjectPtr<ASimgridEntityActor>> Actors` and `ASimgridEntityActor` (has `GetActorLocation`).
- Produces: `bool USimgridEntityManager::WorldPosOf(uint32 Eid, FVector& OutPos) const` — returns the actor's world location for a remote eid, false if not tracked.

Compile-only (small getter; actor spawning is not headless-testable).

- [ ] **Step 1: Declare in the header**

In `Public/SimgridEntityManager.h`, after `bool IsLocalWorldPos(FVector& OutPos) const;`, add:

```cpp
	bool WorldPosOf(uint32 Eid, FVector& OutPos) const;
```

- [ ] **Step 2: Implement in the cpp**

Add to `Private/SimgridEntityManager.cpp`:

```cpp
bool USimgridEntityManager::WorldPosOf(uint32 Eid, FVector& OutPos) const
{
	if (const TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
	{
		if (const ASimgridEntityActor* Actor = Found->Get())
		{
			OutPos = Actor->GetActorLocation();
			return true;
		}
	}
	return false;
}
```

Ensure `SimgridEntityActor.h` is included in the cpp (it already is, for `SpawnActor`).

- [ ] **Step 3: Compile**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityManager.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityManager.cpp
git commit -m "feat(KBVESimgridRender): entity-manager WorldPosOf(eid) lookup"
```

---

### Task 5: ASimgridDamageText — floating worldspace damage number

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridDamageText.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridDamageText.cpp`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ASimgridDamageText : public AActor`; `void Init(int32 Amount, bool bCrit)`. Spawn at a world location; floats up and fades over `LIFETIME` seconds then self-destroys.

Compile-only (worldspace behavior verified in the final manual run).

- [ ] **Step 1: Write the header**

`Public/SimgridDamageText.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridDamageText.generated.h"

class UTextRenderComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridDamageText : public AActor
{
	GENERATED_BODY()

public:
	ASimgridDamageText();

	void Init(int32 Amount, bool bCrit);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UTextRenderComponent> Text;

	float Age = 0.0f;

	static constexpr float LIFETIME = 1.0f;
	static constexpr float RISE_SPEED = 120.0f;
};
```

- [ ] **Step 2: Write the implementation**

`Private/SimgridDamageText.cpp`:

```cpp
#include "SimgridDamageText.h"
#include "Components/TextRenderComponent.h"

ASimgridDamageText::ASimgridDamageText()
{
	PrimaryActorTick.bCanEverTick = true;

	Text = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Text"));
	SetRootComponent(Text);
	Text->SetHorizontalAlignment(EHTA_Center);
	Text->SetWorldSize(64.0f);
}

void ASimgridDamageText::Init(int32 Amount, bool bCrit)
{
	if (Text)
	{
		Text->SetText(FText::AsNumber(Amount));
		Text->SetTextRenderColor(bCrit ? FColor(255, 200, 0) : FColor::White);
		Text->SetWorldSize(bCrit ? 96.0f : 64.0f);
	}
}

void ASimgridDamageText::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Age += DeltaSeconds;
	AddActorWorldOffset(FVector(0.0f, 0.0f, RISE_SPEED * DeltaSeconds));

	if (Text)
	{
		const float Alpha = FMath::Clamp(1.0f - (Age / LIFETIME), 0.0f, 1.0f);
		FColor C = Text->TextRenderColor;
		C.A = (uint8)(Alpha * 255.0f);
		Text->SetTextRenderColor(C);
	}

	if (Age >= LIFETIME)
	{
		Destroy();
	}
}
```

- [ ] **Step 3: Compile**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridDamageText.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridDamageText.cpp
git commit -m "feat(KBVESimgridRender): floating damage-text actor"
```

---

### Task 6: ASimgridProjectileTracer — from→to tracer

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridProjectileTracer.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridProjectileTracer.cpp`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ASimgridProjectileTracer : public AActor`; `void Init(const FVector& From, const FVector& To)`. Lerps a mesh from `From` to `To` over `FLIGHT_TIME`, then self-destroys.

Compile-only.

- [ ] **Step 1: Write the header**

`Public/SimgridProjectileTracer.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridProjectileTracer.generated.h"

class UStaticMeshComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridProjectileTracer : public AActor
{
	GENERATED_BODY()

public:
	ASimgridProjectileTracer();

	void Init(const FVector& From, const FVector& To);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Mesh;

	FVector Start = FVector::ZeroVector;
	FVector End = FVector::ZeroVector;
	float Age = 0.0f;

	static constexpr float FLIGHT_TIME = 0.2f;
};
```

- [ ] **Step 2: Write the implementation**

`Private/SimgridProjectileTracer.cpp`:

```cpp
#include "SimgridProjectileTracer.h"
#include "Components/StaticMeshComponent.h"

ASimgridProjectileTracer::ASimgridProjectileTracer()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetMobility(EComponentMobility::Movable);
}

void ASimgridProjectileTracer::Init(const FVector& From, const FVector& To)
{
	Start = From;
	End = To;
	SetActorLocation(From);
}

void ASimgridProjectileTracer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Age += DeltaSeconds;
	const float T = FMath::Clamp(Age / FLIGHT_TIME, 0.0f, 1.0f);
	SetActorLocation(FMath::Lerp(Start, End, T));

	if (Age >= FLIGHT_TIME)
	{
		Destroy();
	}
}
```

- [ ] **Step 3: Compile**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridProjectileTracer.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridProjectileTracer.cpp
git commit -m "feat(KBVESimgridRender): projectile tracer actor"
```

---

### Task 7: chuck Toast channel + toast-host subscription

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Events/chuckEventPayloads.h` (add `FchuckToastPayload`)
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Events/chuckUIEvents.h` (add `Toast` channel)
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/HUD/SchuckToastHost.h` (add handle)
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/HUD/SchuckToastHost.cpp` (subscribe → PushToast)

**Interfaces:**
- Consumes: `TKBVEChannel<T>`, `SKBVEToastLayer::PushToast(Title, Message, Level, Duration)`, `EKBVEToastLevel`.
- Produces: `FchuckToastPayload { FText Title; FText Message; uint8 Level; }`; `UchuckUIEvents::Toast` channel; a subscription in `SchuckToastHost` that calls `ToastLayer->PushToast`.

Compile-only.

- [ ] **Step 1: Add the payload struct**

In `chuck/Events/chuckEventPayloads.h`, after `FchuckItemConsumedPayload`, add:

```cpp
struct FchuckToastPayload
{
	FText Title;
	FText Message;
	uint8 Level = 0;
};
```

- [ ] **Step 2: Add the channel**

In `chuck/Events/chuckUIEvents.h`, after the `ItemConsumed` channel line, add:

```cpp
	TKBVEChannel<FchuckToastPayload>           Toast;
```

- [ ] **Step 3: Add the handle to the toast host header**

In `chuck/UI/HUD/SchuckToastHost.h`, after `FKBVEEventHandle ItemConsumedHandle;`, add:

```cpp
	FKBVEEventHandle ToastHandle;
```

- [ ] **Step 4: Subscribe in the toast host cpp**

Read `chuck/UI/HUD/SchuckToastHost.cpp` `BindToEventBus()` to match the existing subscribe pattern, then add a `Toast` subscription that maps `Level` to `EKBVEToastLevel` and calls `ToastLayer->PushToast(Payload.Title, Payload.Message, (EKBVEToastLevel)Payload.Level)`. Follow the exact `Get(World)->Channel.Subscribe(Owner, [this](const T& P){...})` form already used for `ItemConsumed`, and unsubscribe `ToastHandle` in the destructor alongside the existing handles.

Implementation (mirror the file's existing style; example body):

```cpp
	if (UchuckUIEvents* Events = UchuckUIEvents::Get(Character.Get()))
	{
		ToastHandle = Events->Toast.Subscribe(Character.Get(), [this](const FchuckToastPayload& P)
		{
			if (ToastLayer.IsValid())
			{
				ToastLayer->PushToast(P.Title, P.Message, (EKBVEToastLevel)P.Level);
			}
		});
	}
```

Add to the destructor (matching the existing unsubscribe block):

```cpp
	if (UchuckUIEvents* Events = UchuckUIEvents::Get(Character.Get()))
	{
		Events->Toast.Unsubscribe(ToastHandle);
	}
```

(If `BindToEventBus` already caches an `Events` pointer / uses a different context object, reuse that exact pattern instead of the snippet above — the intent is one subscription + one unsubscribe consistent with the file.)

- [ ] **Step 5: Compile**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 6: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Events/chuckEventPayloads.h apps/rentearth/unreal-rentearth/Source/chuck/Events/chuckUIEvents.h apps/rentearth/unreal-rentearth/Source/chuck/UI/HUD/SchuckToastHost.h apps/rentearth/unreal-rentearth/Source/chuck/UI/HUD/SchuckToastHost.cpp
git commit -m "feat(chuck): general Toast channel + toast-host subscription"
```

---

### Task 8: chuck ephemeral router + wiring + editor verify

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp`

**Interfaces:**
- Consumes: `USimgridClientSubsystem` (`OnEphemeral`, `GetLastEphemeral*`), `FEphemeralCodec` (Task 1-2), `USimgridEntityManager::WorldPosOf` (Task 4), `USimgridWorldBridge::SampleHeight`, `FSimgridCoords::TileToWorldXY`/`FLOOR_HEIGHT`, `ASimgridDamageText` (Task 5), `ASimgridProjectileTracer` (Task 6), `UchuckUIEvents` (`Health`, `Mana`, `DamageReceived`, `InventoryDirty`, `Toast`), payloads `FKBVEManaChangedPayload`, `FKBVEDamageReceivedPayload`, `FchuckInventoryDirtyPayload`, `FchuckToastPayload`.
- Produces: `AchuckSimgridController::HandleEphemeral()` (`UFUNCTION`) bound to `OnEphemeral`, plus the local slot cached from `HandleWelcome`.

Ends with the editor compile + the full ephemeral automation run.

- [ ] **Step 1: Declare the handler + slot in the header**

In `chuck/Net/chuckSimgridController.h`, after the `HandleDisconnected` UFUNCTION, add:

```cpp
	UFUNCTION()
	void HandleEphemeral();
```

In the `private:` section, after `USimgridClientSubsystem* GetSubsystem() const;`, add:

```cpp
	int32 LocalSlot = -1;
```

- [ ] **Step 2: Bind + cache slot + implement the router in the cpp**

In `chuck/Net/chuckSimgridController.cpp`:

Add includes at the top (after the existing includes):

```cpp
#include "SimgridEphemeral.h"
#include "SimgridCoords.h"
#include "SimgridDamageText.h"
#include "SimgridProjectileTracer.h"
#include "SimgridEntityManager.h"
#include "SimgridWorldBridge.h"
#include "Events/chuckUIEvents.h"
#include "KBVEGameplayEvents.h"
```

In `BeginPlay()`, after the existing `Sub->OnDisconnected.AddDynamic(...)` line, add:

```cpp
	Sub->OnEphemeral.AddDynamic(this, &AchuckSimgridController::HandleEphemeral);
```

In `HandleWelcome(...)`, after the `Manager->SetLocalSlot(YourSlot);` line, add:

```cpp
	LocalSlot = YourSlot;
```

In `EndPlay(...)`, in the block that removes the other dynamic delegates, add:

```cpp
		Sub->OnEphemeral.RemoveDynamic(this, &AchuckSimgridController::HandleEphemeral);
```

Add the handler implementation:

```cpp
void AchuckSimgridController::HandleEphemeral()
{
	USimgridClientSubsystem* Sub = GetSubsystem();
	if (!Sub)
	{
		return;
	}

	const int32 Kind = Sub->GetLastEphemeralKind();
	const int32 To = Sub->GetLastEphemeralTo();
	const TArray<uint8>& Payload = Sub->GetLastEphemeralPayload();
	const bool bForMe = (To == LocalSlot);

	UchuckUIEvents* Events = UchuckUIEvents::Get(this);

	switch (Kind)
	{
	case 2:
	{
		const FSimgridCombat C = FEphemeralCodec::DecodeCombat(Payload);
		FVector Pos;
		if (Manager && Manager->WorldPosOf(C.Target, Pos))
		{
			if (ASimgridDamageText* Text = GetWorld()->SpawnActor<ASimgridDamageText>(ASimgridDamageText::StaticClass(), FTransform(Pos)))
			{
				Text->Init(C.Dmg, C.bCrit);
			}
		}
		if (Events && C.bDied)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Defeated")), FText::FromString(C.TargetRef), 1 });
		}
		break;
	}
	case 12:
	{
		const FSimgridProjectile P = FEphemeralCodec::DecodeProjectile(Payload);
		const FVector2D FromXY = FSimgridCoords::TileToWorldXY(P.From.X, P.From.Y);
		const FVector2D ToXY = FSimgridCoords::TileToWorldXY(P.To.X, P.To.Y);
		const float FromZ = Bridge ? Bridge->SampleHeight((float)FromXY.X, (float)FromXY.Y) : 0.0f;
		const float ToZ = Bridge ? Bridge->SampleHeight((float)ToXY.X, (float)ToXY.Y) : 0.0f;
		const FVector From(FromXY.X, FromXY.Y, FromZ + FSimgridCoords::FLOOR_HEIGHT);
		const FVector To(ToXY.X, ToXY.Y, ToZ + FSimgridCoords::FLOOR_HEIGHT);
		if (ASimgridProjectileTracer* Tracer = GetWorld()->SpawnActor<ASimgridProjectileTracer>(ASimgridProjectileTracer::StaticClass(), FTransform(From)))
		{
			Tracer->Init(From, To);
		}
		break;
	}
	case 3:
	{
		const FSimgridPickup P = FEphemeralCodec::DecodePickup(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Picked up")), FText::FromString(FString::Printf(TEXT("%u x %s"), P.Count, *P.ItemRef)), 0 });
		}
		break;
	}
	case 5:
	{
		const FSimgridItemUsed U = FEphemeralCodec::DecodeItemUsed(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Used")), FText::FromString(U.ItemRef), 0 });
		}
		break;
	}
	case 7:
	{
		if (!bForMe) { break; }
		const FSimgridStats S = FEphemeralCodec::DecodeStats(Payload);
		if (Events)
		{
			Events->Mana.Publish(FKBVEManaChangedPayload{ (float)S.Mp, (float)S.MaxMp });
		}
		break;
	}
	case 8:
	{
		if (!bForMe) { break; }
		const FSimgridStatus S = FEphemeralCodec::DecodeStatus(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Status")), FText::FromString(FString::Printf(TEXT("kind %d (%u)"), (int32)S.Kind, S.Remaining)), 0 });
		}
		break;
	}
	case 1:
	{
		if (!bForMe) { break; }
		if (Events)
		{
			Events->InventoryDirty.Publish(FchuckInventoryDirtyPayload{ 0 });
		}
		break;
	}
	case 6:
	{
		if (!bForMe) { break; }
		const FSimgridEquipped E = FEphemeralCodec::DecodeEquipped(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Equipped")), FText::FromString(FString::Printf(TEXT("%s -> %s"), *E.ItemRef, *E.Slot)), 0 });
		}
		break;
	}
	default:
		break;
	}
}
```

Note: `Manager` and `Bridge` are the existing private members of `AchuckSimgridController` (Phase 2). If `chuck.Build.cs` does not already resolve `KBVEGameplay` (for `FKBVEManaChangedPayload`) or `KBVESimgrid` (for `FEphemeralCodec`), they are already listed there from Phase 1/2 — confirm at compile; do not re-add unless the compile reports an unresolved symbol, in which case add the missing module name to `PrivateDependencyModuleNames` (minimal) and record it.

- [ ] **Step 3: Compile the editor target**

Run the `Build.sh` compile.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Run the full ephemeral automation suite**

Clear locks then run automation `KBVE.Simgrid.Ephemeral`.
Expected: all 8 ephemeral tests `Success` (Combat, Pickup, ItemUsed, Status, Projectile, Equipped, Stats, Inventory).

- [ ] **Step 5: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp
git commit -m "feat(chuck): ephemeral router — decode + FX + HUD republish"
```

---

## Notes for the Integrator

- **Manual integration test (not automatable):** local ARPG server + a rentearth client with `AchuckSimgridController`; trigger combat (damage numbers over targets), fire projectiles (tracers), pick up / use items (toasts), take a hit / regen mana (HUD), open inventory (panel refresh). Confirm state events only react for the local player.
- **HP bar from Stats:** `StatsEvent` carries `max_hp` but not current hp (current hp arrives on the snapshot). This phase drives Mana from Stats; wiring the HP bar to snapshot `hp` is a Phase 4 follow-up.
- **Damage-text meshes/fonts:** `UTextRenderComponent` uses the engine default font; styling polish (outline, billboard-to-camera) is deferred.
- **Object pooling:** damage-text and tracer actors are spawned-and-destroyed per event; pooling is a Phase 4 optimization noted in the spec.
