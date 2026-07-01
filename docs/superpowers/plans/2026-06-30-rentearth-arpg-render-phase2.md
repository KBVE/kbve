# RentEarth ARPG Client Render — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render decoded ARPG server snapshots as interpolated, terrain-grounded entity actors viewed through a fixed orthographic isometric camera, in a new reusable `KBVESimgridRender` module.

**Architecture:** A new `KBVESimgridRender` module under the `KBVENet` plugin, sibling to Phase 1's `KBVESimgrid`. Pure helpers (coordinate mapping, snapshot interpolation, terrain height) are unit-tested with UE automation. Engine-integration pieces (entity actor, entity manager, iso camera pawn, world bridge) are built on the confirmed KBVEWorld + KBVESimgrid APIs and verified by an editor compile + automation run. `chuck` supplies content and wiring only; the local player is driven through the existing `IKBVEMovementDriver::ApplyServerCorrection` seam.

**Tech Stack:** Unreal Engine 5.8, C++, UE Automation tests (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`), KBVEWorld noise (`FKBVEWorldNoise`), KBVESimgrid transport subsystem.

## Global Constraints

- No code comments anywhere (project rule — every file, no exceptions).
- Module name: `KBVESimgridRender`, under `packages/unreal/KBVENet/Source/`, added to `KBVENet.uplugin` Modules array.
- Export macro: `KBVESIMGRIDRENDER_API` on all public classes/structs that cross the module boundary.
- Log category: `LogKBVESimgridRender`.
- Dequant scales (consumer-side, NOT on wire): `POS_SCALE = 32`, `VEL_SCALE = 256`.
- Render tunables (named constants in `SimgridCoords.h`): `TILE_SIZE = 100.0f` (uu/tile), `FLOOR_HEIGHT = 200.0f` (uu per server Z level).
- Interpolation delay constant: `INTERP_DELAY_MS = 100.0`.
- Iso camera: orthographic, pitch −30°, yaw 45°, `ORTHO_WIDTH = 2048.0f`.
- Server Facing enum order (verbatim): `Down = 0, Up = 1, Left = 2, Right = 3`.
- Facing → yaw table (chosen convention, cosmetic): `Down → 0`, `Up → 180`, `Left → 90`, `Right → 270` (degrees).
- Test naming: `KBVE.SimgridRender.<Group>.<Case>`, guarded by `#if WITH_DEV_AUTOMATION_TESTS`, flags `EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter`.
- Build/run: editor target `chuckEditor Mac Development` via `UE_5.8` `Build.sh`; automation via `UnrealEditor-Cmd -nullrhi -ExecCmds="Automation RunTests KBVE.SimgridRender"`.
- Server authority is unchanged — this module only renders; it never mutates simulation state or the transport module.

---

### Task 1: Module scaffold

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/KBVESimgridRender.Build.cs`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/KBVESimgridRenderModule.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/KBVESimgridRenderModule.cpp`
- Modify: `packages/unreal/KBVENet/KBVENet.uplugin` (add module entry)

**Interfaces:**
- Consumes: nothing.
- Produces: module `KBVESimgridRender`, log category `LogKBVESimgridRender` (declared `KBVESIMGRIDRENDER_API` in the module header).

- [ ] **Step 1: Write the Build.cs**

`packages/unreal/KBVENet/Source/KBVESimgridRender/KBVESimgridRender.Build.cs`:

```csharp
using UnrealBuildTool;

public class KBVESimgridRender : ModuleRules
{
	public KBVESimgridRender(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVESimgrid"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"KBVEWorld",
			"KBVEWorldCore",
			"KBVEGameplay"
		});
	}
}
```

- [ ] **Step 2: Write the module header**

`Public/KBVESimgridRenderModule.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

KBVESIMGRIDRENDER_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVESimgridRender, Log, All);

class FKBVESimgridRenderModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
```

- [ ] **Step 3: Write the module cpp**

`Private/KBVESimgridRenderModule.cpp`:

```cpp
#include "KBVESimgridRenderModule.h"

DEFINE_LOG_CATEGORY(LogKBVESimgridRender);

void FKBVESimgridRenderModule::StartupModule()
{
}

void FKBVESimgridRenderModule::ShutdownModule()
{
}

IMPLEMENT_MODULE(FKBVESimgridRenderModule, KBVESimgridRender)
```

- [ ] **Step 4: Register the module in the uplugin**

In `packages/unreal/KBVENet/KBVENet.uplugin`, add to the `Modules` array (after the `KBVESimgrid` entry):

```json
		{
			"Name": "KBVESimgridRender",
			"Type": "Runtime",
			"LoadingPhase": "Default"
		}
```

- [ ] **Step 5: Compile the module**

Run:
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" chuckEditor Mac Development -Project="/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rentearth-arpg-net-phase1/apps/rentearth/unreal-rentearth/rentearth.uproject" -WaitMutex
```
Expected: `Result: Succeeded`; `libUnrealEditor-KBVESimgridRender.dylib` linked.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender packages/unreal/KBVENet/KBVENet.uplugin
git commit -m "feat(KBVESimgridRender): module scaffold under KBVENet"
```

---

### Task 2: SimgridCoords — coordinate + facing mapping

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridCoords.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridCoords.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridCoordsTests.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FSimgridCoords::QuantToWorldXY(int32 Qx, int32 Qy) -> FVector2D`
  - `FSimgridCoords::TileToWorldXY(int32 X, int32 Y) -> FVector2D`
  - `FSimgridCoords::QuantVelToWorldXY(int16 Qvx, int16 Qvy) -> FVector2D`
  - `FSimgridCoords::FacingToYaw(uint8 Facing) -> float`
  - constants `FSimgridCoords::TILE_SIZE`, `POS_SCALE`, `VEL_SCALE`, `FLOOR_HEIGHT`.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridCoordsTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridCoords.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCoordsMapTest,
	"KBVE.SimgridRender.Coords.Map",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCoordsMapTest::RunTest(const FString& Parameters)
{
	const FVector2D A = FSimgridCoords::QuantToWorldXY(160, -96);
	TestEqual("qx", A.X, 160.0 / 32.0 * 100.0);
	TestEqual("qy", A.Y, -96.0 / 32.0 * 100.0);

	const FVector2D T = FSimgridCoords::TileToWorldXY(5, -3);
	TestEqual("tile x", T.X, 500.0);
	TestEqual("tile y", T.Y, -300.0);

	const FVector2D V = FSimgridCoords::QuantVelToWorldXY(256, -128);
	TestEqual("vel x", V.X, 256.0 / 256.0 * 100.0);
	TestEqual("vel y", V.Y, -128.0 / 256.0 * 100.0);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridCoordsFacingTest,
	"KBVE.SimgridRender.Coords.Facing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridCoordsFacingTest::RunTest(const FString& Parameters)
{
	TestEqual("down", FSimgridCoords::FacingToYaw(0), 0.0f);
	TestEqual("up", FSimgridCoords::FacingToYaw(1), 180.0f);
	TestEqual("left", FSimgridCoords::FacingToYaw(2), 90.0f);
	TestEqual("right", FSimgridCoords::FacingToYaw(3), 270.0f);
	TestEqual("unknown clamps to down", FSimgridCoords::FacingToYaw(99), 0.0f);
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" chuckEditor Mac Development -Project="/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rentearth-arpg-net-phase1/apps/rentearth/unreal-rentearth/rentearth.uproject" -WaitMutex
```
Expected: FAIL — `SimgridCoords.h` not found / `FSimgridCoords` undefined.

- [ ] **Step 3: Write the header**

`Public/SimgridCoords.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

struct KBVESIMGRIDRENDER_API FSimgridCoords
{
	static constexpr float TILE_SIZE = 100.0f;
	static constexpr float FLOOR_HEIGHT = 200.0f;
	static constexpr int32 POS_SCALE = 32;
	static constexpr int32 VEL_SCALE = 256;

	static FVector2D QuantToWorldXY(int32 Qx, int32 Qy);
	static FVector2D TileToWorldXY(int32 X, int32 Y);
	static FVector2D QuantVelToWorldXY(int16 Qvx, int16 Qvy);
	static float FacingToYaw(uint8 Facing);
};
```

- [ ] **Step 4: Write the implementation**

`Private/SimgridCoords.cpp`:

```cpp
#include "SimgridCoords.h"

FVector2D FSimgridCoords::QuantToWorldXY(int32 Qx, int32 Qy)
{
	return FVector2D(
		(double)Qx / (double)POS_SCALE * (double)TILE_SIZE,
		(double)Qy / (double)POS_SCALE * (double)TILE_SIZE);
}

FVector2D FSimgridCoords::TileToWorldXY(int32 X, int32 Y)
{
	return FVector2D((double)X * (double)TILE_SIZE, (double)Y * (double)TILE_SIZE);
}

FVector2D FSimgridCoords::QuantVelToWorldXY(int16 Qvx, int16 Qvy)
{
	return FVector2D(
		(double)Qvx / (double)VEL_SCALE * (double)TILE_SIZE,
		(double)Qvy / (double)VEL_SCALE * (double)TILE_SIZE);
}

float FSimgridCoords::FacingToYaw(uint8 Facing)
{
	switch (Facing)
	{
	case 1: return 180.0f;
	case 2: return 90.0f;
	case 3: return 270.0f;
	default: return 0.0f;
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rentearth-arpg-net-phase1/apps/rentearth/unreal-rentearth/rentearth.uproject" -nullrhi -unattended -nopause -ExecCmds="Automation RunTests KBVE.SimgridRender.Coords; Quit" -TestExit="Automation Test Queue Empty"
```
Expected: `KBVE.SimgridRender.Coords.Map` and `.Facing` both `Success`.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridCoords.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridCoords.cpp packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridCoordsTests.cpp
git commit -m "feat(KBVESimgridRender): coordinate + facing mapping"
```

---

### Task 3: SimgridInterpolator — snapshot buffer + lerp

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridInterpolator.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridInterpolator.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridInterpolatorTests.cpp`

**Interfaces:**
- Consumes: `FSimgridSnapshot`, `FSimgridEntityDelta` from `SimgridProto.h` (Phase 1); `FSimgridCoords` (Task 2).
- Produces:
  - struct `FSimgridInterpState { uint32 Eid; FVector2D WorldXY; int32 Z; FVector2D VelXY; uint8 Facing; uint16 Kind; uint16 Owner; }`
  - `FSimgridInterpolator::Push(const FSimgridSnapshot& Snap)`
  - `FSimgridInterpolator::SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpState& Out) -> bool`
  - `FSimgridInterpolator::LatestEntities() const -> const TArray<FSimgridEntityDelta>&`
  - `FSimgridInterpolator::LatestServerTimeMs() const -> uint32`
  - `FSimgridInterpolator::INTERP_DELAY_MS` constant.

This is a pure logic unit (no UObject, no world), so it is fully unit-testable.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridInterpolatorTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridInterpolator.h"
#include "SimgridProto.h"

static FSimgridSnapshot MakeSnap(uint32 TimeMs, uint32 Eid, int32 Qx, int32 Qy, int32 Z)
{
	FSimgridSnapshot S;
	S.ServerTimeMs = TimeMs;
	S.bKeyframe = true;
	FSimgridEntityDelta E;
	E.Eid = Eid;
	E.Qx = Qx;
	E.Qy = Qy;
	E.Z = Z;
	E.Facing = 0;
	E.Kind = 7;
	E.Owner = 3;
	S.Entities.Add(E);
	return S;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpBracketTest,
	"KBVE.SimgridRender.Interp.Bracket",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpBracketTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));
	Interp.Push(MakeSnap(1100, 2, 320, 320, 10));

	FSimgridInterpState Out;
	const bool bOk = Interp.SampleEntity(2, 1050.0, Out);
	TestTrue("sampled", bOk);
	TestEqual("mid x", Out.WorldXY.X, FSimgridCoords::QuantToWorldXY(160, 160).X);
	TestEqual("mid z", Out.Z, 5);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpClampTest,
	"KBVE.SimgridRender.Interp.Clamp",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpClampTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));
	Interp.Push(MakeSnap(1100, 2, 320, 0, 0));

	FSimgridInterpState Before;
	TestTrue("before oldest ok", Interp.SampleEntity(2, 500.0, Before));
	TestEqual("clamp to oldest", Before.WorldXY.X, 0.0);

	FSimgridInterpState After;
	TestTrue("after newest ok", Interp.SampleEntity(2, 5000.0, After));
	TestEqual("clamp to newest", After.WorldXY.X, FSimgridCoords::QuantToWorldXY(320, 0).X);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridInterpMissingTest,
	"KBVE.SimgridRender.Interp.Missing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridInterpMissingTest::RunTest(const FString& Parameters)
{
	FSimgridInterpolator Interp;
	Interp.Push(MakeSnap(1000, 2, 0, 0, 0));

	FSimgridInterpState Single;
	TestTrue("single sample returns it", Interp.SampleEntity(2, 1000.0, Single));
	TestEqual("single x", Single.WorldXY.X, 0.0);

	FSimgridInterpState Unknown;
	TestFalse("unknown eid false", Interp.SampleEntity(999, 1000.0, Unknown));
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run the same `Build.sh` command as Task 2 Step 2.
Expected: FAIL — `SimgridInterpolator.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridInterpolator.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "SimgridProto.h"
#include "SimgridCoords.h"

struct KBVESIMGRIDRENDER_API FSimgridInterpState
{
	uint32 Eid = 0;
	FVector2D WorldXY = FVector2D::ZeroVector;
	int32 Z = 0;
	FVector2D VelXY = FVector2D::ZeroVector;
	uint8 Facing = 0;
	uint16 Kind = 0;
	uint16 Owner = 0;
};

class KBVESIMGRIDRENDER_API FSimgridInterpolator
{
public:
	static constexpr double INTERP_DELAY_MS = 100.0;
	static constexpr int32 MAX_SNAPSHOTS = 8;

	void Push(const FSimgridSnapshot& Snap);
	bool SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpState& Out) const;

	const TArray<FSimgridEntityDelta>& LatestEntities() const;
	uint32 LatestServerTimeMs() const;
	bool HasData() const { return Snapshots.Num() > 0; }

private:
	TArray<FSimgridSnapshot> Snapshots;

	static const FSimgridEntityDelta* FindEntity(const FSimgridSnapshot& Snap, uint32 Eid);
	static void Fill(FSimgridInterpState& Out, const FSimgridEntityDelta& E);
};
```

- [ ] **Step 4: Write the implementation**

`Private/SimgridInterpolator.cpp`:

```cpp
#include "SimgridInterpolator.h"

void FSimgridInterpolator::Push(const FSimgridSnapshot& Snap)
{
	Snapshots.Add(Snap);
	while (Snapshots.Num() > MAX_SNAPSHOTS)
	{
		Snapshots.RemoveAt(0);
	}
}

const FSimgridEntityDelta* FSimgridInterpolator::FindEntity(const FSimgridSnapshot& Snap, uint32 Eid)
{
	for (const FSimgridEntityDelta& E : Snap.Entities)
	{
		if (E.Eid == Eid)
		{
			return &E;
		}
	}
	return nullptr;
}

void FSimgridInterpolator::Fill(FSimgridInterpState& Out, const FSimgridEntityDelta& E)
{
	Out.Eid = E.Eid;
	Out.WorldXY = FSimgridCoords::QuantToWorldXY(E.Qx, E.Qy);
	Out.Z = E.Z;
	Out.VelXY = FSimgridCoords::QuantVelToWorldXY(E.Qvx, E.Qvy);
	Out.Facing = E.Facing;
	Out.Kind = E.Kind;
	Out.Owner = E.Owner;
}

const TArray<FSimgridEntityDelta>& FSimgridInterpolator::LatestEntities() const
{
	static const TArray<FSimgridEntityDelta> Empty;
	return Snapshots.Num() > 0 ? Snapshots.Last().Entities : Empty;
}

uint32 FSimgridInterpolator::LatestServerTimeMs() const
{
	return Snapshots.Num() > 0 ? Snapshots.Last().ServerTimeMs : 0;
}

bool FSimgridInterpolator::SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpState& Out) const
{
	if (Snapshots.Num() == 0)
	{
		return false;
	}

	if (Snapshots.Num() == 1)
	{
		const FSimgridEntityDelta* Only = FindEntity(Snapshots[0], Eid);
		if (!Only)
		{
			return false;
		}
		Fill(Out, *Only);
		return true;
	}

	int32 NewerIdx = INDEX_NONE;
	for (int32 i = 1; i < Snapshots.Num(); ++i)
	{
		if ((double)Snapshots[i].ServerTimeMs >= RenderTimeMs)
		{
			NewerIdx = i;
			break;
		}
	}

	if (RenderTimeMs <= (double)Snapshots[0].ServerTimeMs)
	{
		const FSimgridEntityDelta* E = FindEntity(Snapshots[0], Eid);
		if (!E) { return false; }
		Fill(Out, *E);
		return true;
	}

	if (NewerIdx == INDEX_NONE)
	{
		const FSimgridEntityDelta* E = FindEntity(Snapshots.Last(), Eid);
		if (!E) { return false; }
		Fill(Out, *E);
		return true;
	}

	const FSimgridSnapshot& A = Snapshots[NewerIdx - 1];
	const FSimgridSnapshot& B = Snapshots[NewerIdx];
	const FSimgridEntityDelta* Ea = FindEntity(A, Eid);
	const FSimgridEntityDelta* Eb = FindEntity(B, Eid);

	if (!Ea && !Eb) { return false; }
	if (!Ea) { Fill(Out, *Eb); return true; }
	if (!Eb) { Fill(Out, *Ea); return true; }

	const double Span = (double)B.ServerTimeMs - (double)A.ServerTimeMs;
	const double T = Span > 0.0 ? FMath::Clamp((RenderTimeMs - (double)A.ServerTimeMs) / Span, 0.0, 1.0) : 1.0;

	FSimgridInterpState Sa; Fill(Sa, *Ea);
	FSimgridInterpState Sb; Fill(Sb, *Eb);

	Out.Eid = Eid;
	Out.WorldXY = FMath::Lerp(Sa.WorldXY, Sb.WorldXY, T);
	Out.Z = FMath::RoundToInt(FMath::Lerp((double)Sa.Z, (double)Sb.Z, T));
	Out.VelXY = Sb.VelXY;
	Out.Facing = Eb->Facing;
	Out.Kind = Eb->Kind;
	Out.Owner = Eb->Owner;
	return true;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run the automation command from Task 2 Step 5 with `KBVE.SimgridRender.Interp`.
Expected: `Bracket`, `Clamp`, `Missing` all `Success`.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridInterpolator.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridInterpolator.cpp packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridInterpolatorTests.cpp
git commit -m "feat(KBVESimgridRender): snapshot interpolation buffer"
```

---

### Task 4: SimgridWorldBridge — terrain height + chunk spawn

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridWorldBridge.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridWorldBridge.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridWorldBridgeTests.cpp`

**Interfaces:**
- Consumes: `FKBVEWorldNoise::Sample2D` and `FKBVENoiseSettings` from `KBVEWorldNoise.h` / `KBVEWorldNoiseTypes.h` (KBVEWorldCore).
- Produces:
  - `USimgridWorldBridge : public UObject`
  - `void Init(int64 InSeed)`
  - `float SampleHeight(float Wx, float Wy) const` — deterministic terrain height at world XY for the current seed.
  - `int64 GetSeed() const`

Height sampling is deterministic and unit-testable; the chunk-actor spawn is left as an editor/manual concern (the base `AKBVEWorldChunkActor::SampleHeight` returns 0, so height comes from `FKBVEWorldNoise` directly, guaranteeing cross-client determinism without depending on a concrete terrain subclass).

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridWorldBridgeTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridWorldBridge.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridWorldBridgeDeterminismTest,
	"KBVE.SimgridRender.World.Determinism",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridWorldBridgeDeterminismTest::RunTest(const FString& Parameters)
{
	USimgridWorldBridge* A = NewObject<USimgridWorldBridge>();
	USimgridWorldBridge* B = NewObject<USimgridWorldBridge>();
	A->Init(0xC0FFEE);
	B->Init(0xC0FFEE);

	const float Ha = A->SampleHeight(1234.0f, -567.0f);
	const float Hb = B->SampleHeight(1234.0f, -567.0f);
	TestEqual("same seed same height", Ha, Hb);

	USimgridWorldBridge* C = NewObject<USimgridWorldBridge>();
	C->Init(0xBADD1E);
	const float Hc = C->SampleHeight(1234.0f, -567.0f);
	TestNotEqual("different seed differs", Ha, Hc);

	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run the `Build.sh` command.
Expected: FAIL — `SimgridWorldBridge.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridWorldBridge.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldNoiseTypes.h"
#include "UObject/Object.h"
#include "SimgridWorldBridge.generated.h"

UCLASS()
class KBVESIMGRIDRENDER_API USimgridWorldBridge : public UObject
{
	GENERATED_BODY()

public:
	void Init(int64 InSeed);
	float SampleHeight(float Wx, float Wy) const;
	int64 GetSeed() const { return Seed; }

private:
	int64 Seed = 0;
	FKBVENoiseSettings Settings;
};
```

- [ ] **Step 4: Write the implementation**

`Private/SimgridWorldBridge.cpp`:

```cpp
#include "SimgridWorldBridge.h"
#include "KBVEWorldNoise.h"

void USimgridWorldBridge::Init(int64 InSeed)
{
	Seed = InSeed;
	Settings = FKBVENoiseSettings();
}

float USimgridWorldBridge::SampleHeight(float Wx, float Wy) const
{
	return FKBVEWorldNoise::Sample2D(Wx, Wy, Seed, Settings);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run the automation command with `KBVE.SimgridRender.World`.
Expected: `Determinism` `Success`.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridWorldBridge.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridWorldBridge.cpp packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridWorldBridgeTests.cpp
git commit -m "feat(KBVESimgridRender): seed-deterministic terrain height bridge"
```

---

### Task 5: ASimgridEntityActor — thin render actor

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityActor.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityActor.cpp`

**Interfaces:**
- Consumes: nothing from earlier tasks (takes resolved world transform + mesh).
- Produces:
  - `ASimgridEntityActor : public AActor`
  - `void ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind)`
  - `void SetMesh(UStaticMesh* Mesh)`
  - `uint16 GetKind() const`

No physics, no movement component; transform is set directly. This is engine-integration; verified by compile and by the manager's manual test (Task 6 / Task 7). No standalone automation test (headless `-nullrhi` actor spawning is unreliable).

- [ ] **Step 1: Write the header**

`Public/SimgridEntityActor.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridEntityActor.generated.h"

class UStaticMeshComponent;
class UStaticMesh;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridEntityActor : public AActor
{
	GENERATED_BODY()

public:
	ASimgridEntityActor();

	void ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind);
	void SetMesh(UStaticMesh* Mesh);
	uint16 GetKind() const { return CurrentKind; }

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> MeshComp;

	uint16 CurrentKind = 0;
};
```

- [ ] **Step 2: Write the implementation**

`Private/SimgridEntityActor.cpp`:

```cpp
#include "SimgridEntityActor.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"

ASimgridEntityActor::ASimgridEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;

	MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComp"));
	SetRootComponent(MeshComp);
	MeshComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MeshComp->SetMobility(EComponentMobility::Movable);
}

void ASimgridEntityActor::SetMesh(UStaticMesh* Mesh)
{
	if (MeshComp)
	{
		MeshComp->SetStaticMesh(Mesh);
	}
}

void ASimgridEntityActor::ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind)
{
	SetActorLocationAndRotation(WorldPos, FRotator(0.0f, Yaw, 0.0f));
	CurrentKind = Kind;
}
```

- [ ] **Step 3: Compile**

Run the `Build.sh` command.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityActor.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityActor.cpp
git commit -m "feat(KBVESimgridRender): thin server-driven entity actor"
```

---

### Task 6: Membership reconcile helper (pure) + tests

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridReconcile.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridReconcile.cpp`
- Test: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridReconcileTests.cpp`

**Interfaces:**
- Consumes: `FSimgridEntityDelta`, `FSimgridSnapshot` (Phase 1).
- Produces:
  - `FSimgridReconcile::DespawnSet(const TSet<uint32>& Live, const TArray<FSimgridEntityDelta>& Keyframe) -> TSet<uint32>` — eids to destroy = currently-live eids absent from a keyframe.
  - `FSimgridReconcile::DestroyedIds(const TArray<FSimgridEntityDelta>& Entities) -> TSet<uint32>` — eids with `bDestroyed`.

Splitting the reconcile decision into a pure function lets Task 7's manager stay thin and gives us deterministic tests for the spawn/despawn contract without spawning actors.

- [ ] **Step 1: Write the failing test**

`Private/Tests/SimgridReconcileTests.cpp`:

```cpp
#if WITH_DEV_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "SimgridReconcile.h"
#include "SimgridProto.h"

static FSimgridEntityDelta Ent(uint32 Eid, bool bDestroyed = false)
{
	FSimgridEntityDelta E;
	E.Eid = Eid;
	E.bDestroyed = bDestroyed;
	return E;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridReconcileDespawnTest,
	"KBVE.SimgridRender.Reconcile.Despawn",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridReconcileDespawnTest::RunTest(const FString& Parameters)
{
	TSet<uint32> Live = { 1, 2, 3 };
	TArray<FSimgridEntityDelta> Keyframe = { Ent(2), Ent(3), Ent(4) };

	const TSet<uint32> Gone = FSimgridReconcile::DespawnSet(Live, Keyframe);
	TestTrue("1 despawned", Gone.Contains(1));
	TestFalse("2 kept", Gone.Contains(2));
	TestFalse("4 not in live", Gone.Contains(4));
	TestEqual("only one gone", Gone.Num(), 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FSimgridReconcileDestroyedTest,
	"KBVE.SimgridRender.Reconcile.Destroyed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FSimgridReconcileDestroyedTest::RunTest(const FString& Parameters)
{
	TArray<FSimgridEntityDelta> Ents = { Ent(1, true), Ent(2, false), Ent(3, true) };
	const TSet<uint32> Dead = FSimgridReconcile::DestroyedIds(Ents);
	TestTrue("1 dead", Dead.Contains(1));
	TestFalse("2 alive", Dead.Contains(2));
	TestTrue("3 dead", Dead.Contains(3));
	return true;
}

#endif
```

- [ ] **Step 2: Run test to verify it fails**

Run the `Build.sh` command.
Expected: FAIL — `SimgridReconcile.h` not found.

- [ ] **Step 3: Write the header**

`Public/SimgridReconcile.h`:

```cpp
#pragma once

#include "CoreMinimal.h"

struct FSimgridEntityDelta;

struct KBVESIMGRIDRENDER_API FSimgridReconcile
{
	static TSet<uint32> DespawnSet(const TSet<uint32>& Live, const TArray<FSimgridEntityDelta>& Keyframe);
	static TSet<uint32> DestroyedIds(const TArray<FSimgridEntityDelta>& Entities);
};
```

- [ ] **Step 4: Write the implementation**

`Private/SimgridReconcile.cpp`:

```cpp
#include "SimgridReconcile.h"
#include "SimgridProto.h"

TSet<uint32> FSimgridReconcile::DespawnSet(const TSet<uint32>& Live, const TArray<FSimgridEntityDelta>& Keyframe)
{
	TSet<uint32> Present;
	Present.Reserve(Keyframe.Num());
	for (const FSimgridEntityDelta& E : Keyframe)
	{
		Present.Add(E.Eid);
	}

	TSet<uint32> Gone;
	for (const uint32 Eid : Live)
	{
		if (!Present.Contains(Eid))
		{
			Gone.Add(Eid);
		}
	}
	return Gone;
}

TSet<uint32> FSimgridReconcile::DestroyedIds(const TArray<FSimgridEntityDelta>& Entities)
{
	TSet<uint32> Dead;
	for (const FSimgridEntityDelta& E : Entities)
	{
		if (E.bDestroyed)
		{
			Dead.Add(E.Eid);
		}
	}
	return Dead;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run the automation command with `KBVE.SimgridRender.Reconcile`.
Expected: `Despawn`, `Destroyed` both `Success`.

- [ ] **Step 6: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridReconcile.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridReconcile.cpp packages/unreal/KBVENet/Source/KBVESimgridRender/Private/Tests/SimgridReconcileTests.cpp
git commit -m "feat(KBVESimgridRender): pure spawn/despawn reconcile helper"
```

---

### Task 7: USimgridEntityManager — spawn/update/despawn driver

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityManager.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityManager.cpp`

**Interfaces:**
- Consumes: `FSimgridInterpolator` + `FSimgridInterpState` (Task 3), `FSimgridCoords` (Task 2), `USimgridWorldBridge` (Task 4), `ASimgridEntityActor` (Task 5), `FSimgridReconcile` (Task 6), `IKBVEMovementDriver` (`ApplyServerCorrection`), `USimgridClientSubsystem` (Phase 1).
- Produces:
  - `USimgridEntityManager : public UObject`
  - `void Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh)`
  - `void SetLocalSlot(int32 Slot)`
  - `void SetLocalPawn(AActor* Pawn)` (must implement `IKBVEMovementDriver`)
  - `void OnSnapshotReceived()` (bind to subsystem `OnSnapshot`)
  - `void Tick(double NowMs)` — sample interpolator, upsert actors, route local slot, despawn stale.
  - `void Clear()` — destroy all actors (on disconnect).

Engine-integration; the spawn/despawn logic is verified via the pure reconcile tests (Task 6) plus a manual integration run (Task 8). No standalone automation test.

- [ ] **Step 1: Write the header**

`Public/SimgridEntityManager.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "SimgridInterpolator.h"
#include "UObject/Object.h"
#include "SimgridEntityManager.generated.h"

class USimgridClientSubsystem;
class USimgridWorldBridge;
class ASimgridEntityActor;
class UStaticMesh;

UCLASS()
class KBVESIMGRIDRENDER_API USimgridEntityManager : public UObject
{
	GENERATED_BODY()

public:
	void Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh);
	void SetLocalSlot(int32 Slot) { LocalSlot = Slot; }
	void SetLocalPawn(AActor* Pawn) { LocalPawn = Pawn; }

	UFUNCTION()
	void OnSnapshotReceived();

	void Tick(double NowMs);
	void Clear();

	bool IsLocalWorldPos(FVector& OutPos) const;

private:
	FVector ResolveWorldPos(const FSimgridInterpState& S) const;
	ASimgridEntityActor* SpawnActor(uint16 Kind);

	FSimgridInterpolator Interp;

	UPROPERTY()
	TWeakObjectPtr<UWorld> WorldPtr;

	UPROPERTY()
	TObjectPtr<USimgridClientSubsystem> Sub;

	UPROPERTY()
	TObjectPtr<USimgridWorldBridge> WorldBridge;

	UPROPERTY()
	TObjectPtr<UStaticMesh> DefaultMeshAsset;

	UPROPERTY()
	TMap<uint32, TObjectPtr<ASimgridEntityActor>> Actors;

	UPROPERTY()
	TWeakObjectPtr<AActor> LocalPawn;

	int32 LocalSlot = -1;
	bool bHasLocalPos = false;
	FVector LocalWorldPos = FVector::ZeroVector;
};
```

- [ ] **Step 2: Write the implementation**

`Private/SimgridEntityManager.cpp`:

```cpp
#include "SimgridEntityManager.h"
#include "SimgridEntityActor.h"
#include "SimgridWorldBridge.h"
#include "SimgridReconcile.h"
#include "SimgridClientSubsystem.h"
#include "SimgridCoords.h"
#include "KBVEMovementDriver.h"
#include "KBVESimgridRenderModule.h"
#include "Engine/World.h"

void USimgridEntityManager::Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh)
{
	WorldPtr = World;
	Sub = Subsystem;
	WorldBridge = Bridge;
	DefaultMeshAsset = DefaultMesh;

	if (Sub)
	{
		Sub->OnSnapshot.AddDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
	}
}

void USimgridEntityManager::OnSnapshotReceived()
{
	if (Sub)
	{
		Interp.Push(Sub->GetLastSnapshot());
	}
}

FVector USimgridEntityManager::ResolveWorldPos(const FSimgridInterpState& S) const
{
	const float Height = WorldBridge ? WorldBridge->SampleHeight((float)S.WorldXY.X, (float)S.WorldXY.Y) : 0.0f;
	const float Z = Height + (float)S.Z * FSimgridCoords::FLOOR_HEIGHT;
	return FVector(S.WorldXY.X, S.WorldXY.Y, Z);
}

ASimgridEntityActor* USimgridEntityManager::SpawnActor(uint16 Kind)
{
	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASimgridEntityActor* Actor = World->SpawnActor<ASimgridEntityActor>(ASimgridEntityActor::StaticClass(), FTransform::Identity, Params);
	if (Actor)
	{
		Actor->SetMesh(DefaultMeshAsset);
	}
	return Actor;
}

void USimgridEntityManager::Tick(double NowMs)
{
	if (!Interp.HasData())
	{
		return;
	}

	const double RenderTime = NowMs - FSimgridInterpolator::INTERP_DELAY_MS;
	const TArray<FSimgridEntityDelta>& Keyframe = Interp.LatestEntities();

	bHasLocalPos = false;

	for (const FSimgridEntityDelta& E : Keyframe)
	{
		FSimgridInterpState S;
		if (!Interp.SampleEntity(E.Eid, RenderTime, S))
		{
			continue;
		}

		const FVector WorldPos = ResolveWorldPos(S);
		const float Yaw = FSimgridCoords::FacingToYaw(S.Facing);

		const bool bIsLocal = (LocalSlot >= 0) && ((int32)S.Owner == LocalSlot);
		if (bIsLocal)
		{
			bHasLocalPos = true;
			LocalWorldPos = WorldPos;

			AActor* Pawn = LocalPawn.Get();
			if (Pawn)
			{
				if (IKBVEMovementDriver* Driver = Cast<IKBVEMovementDriver>(Pawn))
				{
					Driver->ApplyServerCorrection(WorldPos, FVector(S.VelXY.X, S.VelXY.Y, 0.0f));
				}
			}
			continue;
		}

		TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(E.Eid);
		ASimgridEntityActor* Actor = Found ? Found->Get() : nullptr;
		if (!Actor)
		{
			Actor = SpawnActor(S.Kind);
			if (!Actor)
			{
				continue;
			}
			Actors.Add(E.Eid, Actor);
		}
		Actor->ApplyState(WorldPos, Yaw, S.Kind);
	}

	TSet<uint32> Live;
	Actors.GetKeys(Live);

	TSet<uint32> Gone = FSimgridReconcile::DespawnSet(Live, Keyframe);
	Gone.Append(FSimgridReconcile::DestroyedIds(Keyframe));

	for (const uint32 Eid : Gone)
	{
		if (TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
		{
			if (ASimgridEntityActor* Actor = Found->Get())
			{
				Actor->Destroy();
			}
			Actors.Remove(Eid);
		}
	}
}

bool USimgridEntityManager::IsLocalWorldPos(FVector& OutPos) const
{
	OutPos = LocalWorldPos;
	return bHasLocalPos;
}

void USimgridEntityManager::Clear()
{
	for (TPair<uint32, TObjectPtr<ASimgridEntityActor>>& Pair : Actors)
	{
		if (ASimgridEntityActor* Actor = Pair.Value.Get())
		{
			Actor->Destroy();
		}
	}
	Actors.Empty();
	bHasLocalPos = false;
}
```

- [ ] **Step 3: Compile**

Run the `Build.sh` command.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridEntityManager.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridEntityManager.cpp
git commit -m "feat(KBVESimgridRender): entity manager spawn/update/despawn + local routing"
```

---

### Task 8: ASimgridIsoCameraPawn — orthographic iso rig

**Files:**
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridIsoCameraPawn.h`
- Create: `packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridIsoCameraPawn.cpp`

**Interfaces:**
- Consumes: nothing from earlier tasks (follow target set externally each tick).
- Produces:
  - `ASimgridIsoCameraPawn : public APawn`
  - `void SetFollowTarget(const FVector& WorldPos)`
  - constants for pitch/yaw/ortho width (from Global Constraints).

Engine-integration; verified by compile + the manual integration run (below). No standalone automation test.

- [ ] **Step 1: Write the header**

`Public/SimgridIsoCameraPawn.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SimgridIsoCameraPawn.generated.h"

class UCameraComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridIsoCameraPawn : public APawn
{
	GENERATED_BODY()

public:
	ASimgridIsoCameraPawn();

	void SetFollowTarget(const FVector& WorldPos);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UCameraComponent> Camera;

	FVector TargetPos = FVector::ZeroVector;
	bool bHasTarget = false;

	static constexpr float ISO_PITCH = -30.0f;
	static constexpr float ISO_YAW = 45.0f;
	static constexpr float ORTHO_WIDTH = 2048.0f;
	static constexpr float FOLLOW_LERP = 10.0f;
	static constexpr float BOOM_DISTANCE = 3000.0f;
};
```

- [ ] **Step 2: Write the implementation**

`Private/SimgridIsoCameraPawn.cpp`:

```cpp
#include "SimgridIsoCameraPawn.h"
#include "Camera/CameraComponent.h"

ASimgridIsoCameraPawn::ASimgridIsoCameraPawn()
{
	PrimaryActorTick.bCanEverTick = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	SetRootComponent(Camera);
	Camera->ProjectionMode = ECameraProjectionMode::Orthographic;
	Camera->OrthoWidth = ORTHO_WIDTH;
	Camera->SetRelativeRotation(FRotator(ISO_PITCH, ISO_YAW, 0.0f));
}

void ASimgridIsoCameraPawn::SetFollowTarget(const FVector& WorldPos)
{
	TargetPos = WorldPos;
	bHasTarget = true;
}

void ASimgridIsoCameraPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bHasTarget)
	{
		return;
	}

	const FRotator Rot(ISO_PITCH, ISO_YAW, 0.0f);
	const FVector Desired = TargetPos - Rot.Vector() * BOOM_DISTANCE;
	const FVector NewLoc = FMath::VInterpTo(GetActorLocation(), Desired, DeltaSeconds, FOLLOW_LERP);
	SetActorLocation(NewLoc);
}
```

- [ ] **Step 3: Compile**

Run the `Build.sh` command.
Expected: `Result: Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add packages/unreal/KBVENet/Source/KBVESimgridRender/Public/SimgridIsoCameraPawn.h packages/unreal/KBVENet/Source/KBVESimgridRender/Private/SimgridIsoCameraPawn.cpp
git commit -m "feat(KBVESimgridRender): orthographic isometric camera pawn"
```

---

### Task 9: chuck wiring + editor verification

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs` (add `KBVESimgridRender` to `PrivateDependencyModuleNames`)
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs` (add `"chuck/Net"` to `PublicIncludePaths`)

**Interfaces:**
- Consumes: `USimgridClientSubsystem` (Phase 1), `USimgridEntityManager`, `USimgridWorldBridge`, `ASimgridIsoCameraPawn` (this module), `AchuckCoreCharacter` (local pawn, implements `IKBVEMovementDriver`).
- Produces: `AchuckSimgridController : public AchuckPlayerController` — the networked-view controller that owns the manager, bridge, and camera, wires the subsystem delegates, and ticks the manager.

This is the integration seam that turns the module into a playable networked view. The chuck-side controller owns lifetime; the module classes stay game-agnostic.

- [ ] **Step 1: Add the module dependency**

In `apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs`, add `"KBVESimgridRender"` to the `PrivateDependencyModuleNames` array (after `"KBVENet"`), and add `"chuck/Net"` to the `PublicIncludePaths` array.

- [ ] **Step 2: Write the controller header**

`apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckSimgridController.generated.h"

class USimgridClientSubsystem;
class USimgridEntityManager;
class USimgridWorldBridge;
class ASimgridIsoCameraPawn;
class UStaticMesh;

UCLASS()
class AchuckSimgridController : public AchuckPlayerController
{
	GENERATED_BODY()

public:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	UFUNCTION()
	void HandleWelcome(int32 YourSlot, int64 Seed);

	UFUNCTION()
	void HandleDisconnected();

protected:
	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	FString ServerUrl = TEXT("ws://localhost:7979/ws");

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	TObjectPtr<UStaticMesh> DefaultEntityMesh;

private:
	UPROPERTY()
	TObjectPtr<USimgridEntityManager> Manager;

	UPROPERTY()
	TObjectPtr<USimgridWorldBridge> Bridge;

	UPROPERTY()
	TObjectPtr<ASimgridIsoCameraPawn> CameraPawn;

	USimgridClientSubsystem* GetSubsystem() const;
};
```

- [ ] **Step 3: Write the controller implementation**

`apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp`:

```cpp
#include "chuckSimgridController.h"
#include "SimgridClientSubsystem.h"
#include "SimgridEntityManager.h"
#include "SimgridWorldBridge.h"
#include "SimgridIsoCameraPawn.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"

USimgridClientSubsystem* AchuckSimgridController::GetSubsystem() const
{
	if (const UGameInstance* GI = GetGameInstance())
	{
		return GI->GetSubsystem<USimgridClientSubsystem>();
	}
	return nullptr;
}

void AchuckSimgridController::BeginPlay()
{
	Super::BeginPlay();

	USimgridClientSubsystem* Sub = GetSubsystem();
	if (!Sub)
	{
		return;
	}

	Bridge = NewObject<USimgridWorldBridge>(this);
	Manager = NewObject<USimgridEntityManager>(this);
	Manager->Setup(GetWorld(), Sub, Bridge, DefaultEntityMesh);
	Manager->SetLocalPawn(GetPawn());

	Sub->OnWelcome.AddDynamic(this, &AchuckSimgridController::HandleWelcome);
	Sub->OnDisconnected.AddDynamic(this, &AchuckSimgridController::HandleDisconnected);

	Sub->ConnectToServer(ServerUrl);
}

void AchuckSimgridController::HandleWelcome(int32 YourSlot, int64 Seed)
{
	if (Bridge)
	{
		Bridge->Init(Seed);
	}
	if (Manager)
	{
		Manager->SetLocalSlot(YourSlot);
		Manager->SetLocalPawn(GetPawn());
	}

	if (!CameraPawn)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		CameraPawn = GetWorld()->SpawnActor<ASimgridIsoCameraPawn>(ASimgridIsoCameraPawn::StaticClass(), FTransform::Identity, Params);
	}
	if (CameraPawn)
	{
		SetViewTargetWithBlend(CameraPawn, 0.2f);
	}
}

void AchuckSimgridController::HandleDisconnected()
{
	if (Manager)
	{
		Manager->Clear();
	}
}

void AchuckSimgridController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!Manager)
	{
		return;
	}

	const double NowMs = GetWorld() ? (double)GetWorld()->GetTimeSeconds() * 1000.0 : 0.0;
	Manager->Tick(NowMs);

	FVector LocalPos;
	if (CameraPawn && Manager->IsLocalWorldPos(LocalPos))
	{
		CameraPawn->SetFollowTarget(LocalPos);
	}
}

void AchuckSimgridController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (USimgridClientSubsystem* Sub = GetSubsystem())
	{
		Sub->OnWelcome.RemoveDynamic(this, &AchuckSimgridController::HandleWelcome);
		Sub->OnDisconnected.RemoveDynamic(this, &AchuckSimgridController::HandleDisconnected);
		Sub->Disconnect();
	}
	if (Manager)
	{
		Manager->Clear();
	}
	Super::EndPlay(EndPlayReason);
}
```

- [ ] **Step 4: Compile the editor target**

Run:
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" chuckEditor Mac Development -Project="/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rentearth-arpg-net-phase1/apps/rentearth/unreal-rentearth/rentearth.uproject" -WaitMutex
```
Expected: `Result: Succeeded`; `libUnrealEditor-KBVESimgridRender.dylib` and the chuck module both link.

- [ ] **Step 5: Run the full render automation suite**

Run:
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "/Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/rentearth-arpg-net-phase1/apps/rentearth/unreal-rentearth/rentearth.uproject" -nullrhi -unattended -nopause -ExecCmds="Automation RunTests KBVE.SimgridRender; Quit" -TestExit="Automation Test Queue Empty"
```
Expected: all `KBVE.SimgridRender.*` tests `Success` (Coords ×2, Interp ×3, World ×1, Reconcile ×2 = 8 pass).

- [ ] **Step 6: Commit**

```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/chuck.Build.cs apps/rentearth/unreal-rentearth/Source/chuck/Net
git commit -m "feat(chuck): networked iso render controller wiring KBVESimgridRender"
```

---

## Notes for the Integrator

- **Manual integration test (not automatable):** run a local ARPG server on `:7979`, set the rentearth default player controller to `AchuckSimgridController` (or a Blueprint subclass with `DefaultEntityMesh` assigned), PIE with two clients, confirm: remote players appear as meshes grounded on the seed terrain, movement is smooth (interpolated at −100 ms), the iso orthographic camera follows the local player, and disconnect despawns remotes.
- **Local pawn correction:** `AchuckCoreCharacter::ApplyServerCorrection` already exists (Phase 1 tree). If its current body does not teleport/kinematically move the pawn on the networked path, that is a chuck-side follow-up — the render module's contract is only to *call* `ApplyServerCorrection` with the interpolated world position + velocity each tick, which Task 7 does.
- **Facing yaw convention** is cosmetic; adjust the `FacingToYaw` table if the iso view reads rotated once meshes are in.
- **DefaultEntityMesh** unset → entities spawn with no mesh (invisible but tracked); assign an engine primitive (e.g. `/Engine/BasicShapes/Cube`) for the first manual test.
