# Phase 5 — Mount ARPG Client onto Play Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the built simgrid ARPG net client onto a dedicated play map so entering the game connects to the live Rust ARPG server, shows the isometric camera, and moves a server-authoritative local player from WASD.

**Architecture:** New `AchuckSimgridGameMode` binds `AchuckSimgridController` (existing) + a new minimal `AchuckArpgPawn`. The controller polls WASD each tick, builds a normalized tile-space move intent (pure `BuildMoveIntent`), and calls the existing `USimgridClientSubsystem::SendMove`. The pawn is a dumb visual driven only by `IKBVEMovementDriver::ApplyServerCorrection`. A new minimal map `L_ArpgWorld` (authored by a headless editor Python step) is the travel target; the GameMode is forced via the `OpenLevel` `game=` URL option. Camera is unchanged (already 2:1-correct).

**Tech Stack:** Unreal Engine 5.8 (C++), rentearth chuck fork, KBVENet plugin (KBVESimgrid / KBVESimgridRender), KBVEGameplay (`IKBVEMovementDriver`), UE automation tests.

## Global Constraints

- rentearth chuck fork only (`apps/rentearth/unreal-rentearth/Source/chuck`); NEVER touch main chuck at `apps/chuckrpg/unreal-chuck`.
- UE editor build target is `chuckEditor` (NOT `rentearthEditor`).
- No code comments in shipped source.
- Movement is server-authoritative (server-snap) this phase — no prediction, no Chaos, no Iris.
- `Mx`/`My` are `int8`, tile-space, normalized to ±127 (matches web `readIntent` basis `wx=ix+iy, wy=iy-ix`).
- Worktree: `.claude/worktrees/rentearth-arpg-phase5`; branch `feat/rentearth-arpg-net-phase5`; PR into `dev`.

**Build command (run from `apps/rentearth/unreal-rentearth`):**
```bash
"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" chuckEditor Mac Development -project="$(pwd)/rentearth.uproject" -waitmutex
```

**Automation test command (clear singleton first):**
```bash
pkill -9 -f UnrealEditor-Cmd; rm -f /tmp/UnrealEditor-Cmd*
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$(pwd)/rentearth.uproject" -ExecCmds="Automation RunTests Chuck.Arpg; Quit" -unattended -nop4 -nullrhi -nosplash -abslog=/tmp/arpg-phase5-tests.log
grep "LogAutomationController: Display: Test Completed" /tmp/arpg-phase5-tests.log
```

---

### Task 1: `BuildMoveIntent` pure function + automation tests

The screen→tile move-intent conversion, isolated as a pure static so it is unit-testable without an engine world. Mirrors web `readIntent` (`apps/agones/arpg/web/src/game/systems/movement.ts:273-293`).

**Files:**
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h` (add `FchuckMoveIntent` struct + `static BuildMoveIntent`)
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/Tests/chuckArpgMoveTests.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `struct FchuckMoveIntent { int8 Mx = 0; int8 My = 0; bool bRun = false; };`
  - `static FchuckMoveIntent AchuckSimgridController::BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun);`
    - `ScreenAxis.X` = right(+)/left(−); `ScreenAxis.Y` = down(+)/up(−).
    - Zero axis (`|axis| < KINDA_SMALL_NUMBER`) → `{0, 0, bRun}`.
    - Else `wx = ScreenAxis.X + ScreenAxis.Y`, `wy = ScreenAxis.Y - ScreenAxis.X`, normalize `(wx,wy)`, `Mx = round(wx*127)`, `My = round(wy*127)`, clamp to [−127,127].

- [ ] **Step 1: Add the struct + static declaration to the controller header**

In `chuckSimgridController.h`, immediately before `UCLASS()`, add the struct; and inside the class `public:` section, add the static declaration.

Before `UCLASS()`:
```cpp
struct FchuckMoveIntent
{
	int8 Mx = 0;
	int8 My = 0;
	bool bRun = false;
};
```

Inside `class AchuckSimgridController`, `public:` (after the `HandleEphemeral` declaration):
```cpp
	static FchuckMoveIntent BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun);
```

- [ ] **Step 2: Write the failing test**

Create `Source/chuck/Net/Tests/chuckArpgMoveTests.cpp`:
```cpp
#include "Misc/AutomationTest.h"
#include "../chuckSimgridController.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentZero, "Chuck.Arpg.MoveIntent.Zero", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentZero::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, 0.0), false);
	TestEqual(TEXT("zero Mx"), (int32)R.Mx, 0);
	TestEqual(TEXT("zero My"), (int32)R.My, 0);
	TestFalse(TEXT("zero run"), R.bRun);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentUp, "Chuck.Arpg.MoveIntent.Up", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentUp::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, -1.0), false);
	TestEqual(TEXT("up Mx"), (int32)R.Mx, -90);
	TestEqual(TEXT("up My"), (int32)R.My, -90);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentRight, "Chuck.Arpg.MoveIntent.Right", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentRight::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(1.0, 0.0), false);
	TestEqual(TEXT("right Mx"), (int32)R.Mx, 90);
	TestEqual(TEXT("right My"), (int32)R.My, -90);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FchuckArpgMoveIntentRun, "Chuck.Arpg.MoveIntent.Run", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FchuckArpgMoveIntentRun::RunTest(const FString& Parameters)
{
	const FchuckMoveIntent R = AchuckSimgridController::BuildMoveIntent(FVector2D(0.0, -1.0), true);
	TestTrue(TEXT("run flag passes through"), R.bRun);
	return true;
}

#endif
```

Rationale for the ±90 expectations: screen-up `(0,−1)` → `wx=−1, wy=−1`, normalized `(−0.707,−0.707)`, ×127 = ∓90. Screen-right `(1,0)` → `wx=1, wy=−1`, normalized `(0.707,−0.707)`, ×127 = `(90,−90)`.

- [ ] **Step 3: Run tests, verify they FAIL**

Build with the Build command above.
Expected: FAIL to link/compile — `BuildMoveIntent` is declared but not defined (unresolved external symbol).

- [ ] **Step 4: Implement `BuildMoveIntent`**

Add to `chuckSimgridController.cpp` (near the top, after includes, before `GetSubsystem`):
```cpp
FchuckMoveIntent AchuckSimgridController::BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun)
{
	FchuckMoveIntent Out;
	Out.bRun = bRun;
	if (ScreenAxis.SizeSquared() < KINDA_SMALL_NUMBER)
	{
		return Out;
	}
	const double Wx = ScreenAxis.X + ScreenAxis.Y;
	const double Wy = ScreenAxis.Y - ScreenAxis.X;
	const double Mag = FMath::Sqrt(Wx * Wx + Wy * Wy);
	if (Mag < KINDA_SMALL_NUMBER)
	{
		return Out;
	}
	Out.Mx = (int8)FMath::Clamp(FMath::RoundToInt((Wx / Mag) * 127.0), -127, 127);
	Out.My = (int8)FMath::Clamp(FMath::RoundToInt((Wy / Mag) * 127.0), -127, 127);
	return Out;
}
```

- [ ] **Step 5: Run tests, verify they PASS**

Build, then run the automation test command. Expected: `Chuck.Arpg.MoveIntent.{Zero,Up,Right,Run}` all `Result={Success}` in `/tmp/arpg-phase5-tests.log`.

- [ ] **Step 6: Commit**
```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp apps/rentearth/unreal-rentearth/Source/chuck/Net/Tests/chuckArpgMoveTests.cpp
git commit -m "feat(rentearth): BuildMoveIntent screen->tile move mapping + tests"
```

---

### Task 2: `AchuckArpgPawn` — minimal server-driven visual pawn

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckArpgPawn.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckArpgPawn.cpp`

**Interfaces:**
- Consumes: `IKBVEMovementDriver` from `KBVEMovementDriver.h` (module KBVEGameplay). Method to override: `virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity)`.
- Produces:
  - `class AchuckArpgPawn : public APawn, public IKBVEMovementDriver`
  - `void SetVisualMesh(UStaticMesh* Mesh)` — assigns the mesh the manager renders remote entities with, so local == remote.

- [ ] **Step 1: Write the header**

Create `chuckArpgPawn.h`:
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "KBVEMovementDriver.h"
#include "chuckArpgPawn.generated.h"

class UStaticMeshComponent;
class UStaticMesh;

UCLASS()
class AchuckArpgPawn : public APawn, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AchuckArpgPawn();

	void SetVisualMesh(UStaticMesh* Mesh);

	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Visual;
};
```

- [ ] **Step 2: Write the implementation**

Create `chuckArpgPawn.cpp`:
```cpp
#include "chuckArpgPawn.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"

AchuckArpgPawn::AchuckArpgPawn()
{
	PrimaryActorTick.bCanEverTick = false;

	Visual = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Visual"));
	SetRootComponent(Visual);
	Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Visual->SetMobility(EComponentMobility::Movable);
}

void AchuckArpgPawn::SetVisualMesh(UStaticMesh* Mesh)
{
	if (Visual && Mesh)
	{
		Visual->SetStaticMesh(Mesh);
	}
}

void AchuckArpgPawn::ApplyServerCorrection(const FVector& Position, const FVector& Velocity)
{
	SetActorLocation(Position);
}
```

- [ ] **Step 3: Build, verify it compiles**

Run the Build command. Expected: `Result: Succeeded`. (No unit test — a pawn needs a world; its behavior is exercised by the PIE smoke check in the DoD.)

- [ ] **Step 4: Commit**
```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckArpgPawn.h apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckArpgPawn.cpp
git commit -m "feat(rentearth): AchuckArpgPawn server-driven visual pawn"
```

---

### Task 3: `AchuckSimgridGameMode` + input polling + disconnect travel

Bind the controller + pawn in a GameMode; poll WASD each tick and send moves; bounce to the menu on disconnect. Also assign the entity mesh to the local pawn so it renders.

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridGameMode.h`
- Create: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridGameMode.cpp`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp` (Tick input send; assign pawn mesh in `HandleWelcome`; `ClientTravel` in `HandleDisconnected`)
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h` (add `bWasMoving` + `MenuLevelName`)

**Interfaces:**
- Consumes: `AchuckSimgridController` (Task 1 static `BuildMoveIntent`), `AchuckArpgPawn` + `SetVisualMesh` (Task 2), `USimgridClientSubsystem::SendMove(const FSimgridMove&)`, `FSimgridMove{ uint32 Seq; int8 Mx; int8 My; bool bRun; uint32 Tick; }`.
- Produces: `class AchuckSimgridGameMode : public AGameModeBase` with `PlayerControllerClass = AchuckSimgridController`, `DefaultPawnClass = AchuckArpgPawn`. Class path string `/Script/chuck.chuckSimgridGameMode` (used by Task 4).

- [ ] **Step 1: Write the GameMode header**

Create `chuckSimgridGameMode.h`:
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "chuckSimgridGameMode.generated.h"

UCLASS()
class AchuckSimgridGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AchuckSimgridGameMode();
};
```

- [ ] **Step 2: Write the GameMode implementation**

Create `chuckSimgridGameMode.cpp`:
```cpp
#include "chuckSimgridGameMode.h"
#include "chuckSimgridController.h"
#include "chuckArpgPawn.h"

AchuckSimgridGameMode::AchuckSimgridGameMode()
{
	PlayerControllerClass = AchuckSimgridController::StaticClass();
	DefaultPawnClass = AchuckArpgPawn::StaticClass();
}
```

- [ ] **Step 3: Add controller members for input + travel**

In `chuckSimgridController.h`, add to the `private:` section (after `int32 LocalSlot = -1;`):
```cpp
	bool bWasMoving = false;
```
And add to the `protected:` section (after the `DefaultEntityMesh` UPROPERTY):
```cpp
	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	FName MenuLevelName = TEXT("L_MainMenu");
```

- [ ] **Step 4: Assign the pawn mesh on welcome**

In `chuckSimgridController.cpp`, in `HandleWelcome`, replace the existing local-pawn line:
```cpp
	if (Manager)
	{
		Manager->SetLocalSlot(YourSlot);
		Manager->SetLocalPawn(GetPawn());
	}
```
with (add the mesh push to the pawn):
```cpp
	if (Manager)
	{
		Manager->SetLocalSlot(YourSlot);
		Manager->SetLocalPawn(GetPawn());
	}
	if (AchuckArpgPawn* ArpgPawn = Cast<AchuckArpgPawn>(GetPawn()))
	{
		ArpgPawn->SetVisualMesh(DefaultEntityMesh);
	}
```
Add the include near the top of the file (with the other local includes):
```cpp
#include "chuckArpgPawn.h"
```

- [ ] **Step 5: Poll WASD and send moves each tick**

In `chuckSimgridController.cpp`, in `Tick`, after the existing camera-follow block (after the `if (CameraPawn && Manager->IsLocalWorldPos(LocalPos)) { ... }`), add:
```cpp
	FVector2D ScreenAxis(0.0, 0.0);
	if (IsInputKeyDown(EKeys::D)) { ScreenAxis.X += 1.0; }
	if (IsInputKeyDown(EKeys::A)) { ScreenAxis.X -= 1.0; }
	if (IsInputKeyDown(EKeys::S)) { ScreenAxis.Y += 1.0; }
	if (IsInputKeyDown(EKeys::W)) { ScreenAxis.Y -= 1.0; }

	const bool bRun = IsInputKeyDown(EKeys::LeftShift) || IsInputKeyDown(EKeys::RightShift);
	const bool bMoving = !ScreenAxis.IsNearlyZero();

	if (bMoving || bWasMoving)
	{
		const FchuckMoveIntent Intent = BuildMoveIntent(ScreenAxis, bRun);
		if (USimgridClientSubsystem* Sub = GetSubsystem())
		{
			FSimgridMove Move;
			Move.Mx = Intent.Mx;
			Move.My = Intent.My;
			Move.bRun = Intent.bRun;
			Sub->SendMove(Move);
		}
	}
	bWasMoving = bMoving;
```
Add the include near the top of the file (with the other local includes):
```cpp
#include "SimgridProto.h"
```
(`USimgridClientSubsystem` and `EKeys` are already available — the subsystem via the existing `SimgridClientSubsystem.h` include, `EKeys` via `PlayerController.h`.)

- [ ] **Step 6: Bounce to the menu on disconnect**

In `chuckSimgridController.cpp`, replace `HandleDisconnected`:
```cpp
void AchuckSimgridController::HandleDisconnected()
{
	if (Manager)
	{
		Manager->Clear();
	}
}
```
with:
```cpp
void AchuckSimgridController::HandleDisconnected()
{
	if (Manager)
	{
		Manager->Clear();
	}
	ClientTravel(MenuLevelName.ToString(), TRAVEL_Absolute);
}
```

- [ ] **Step 7: Build, verify it compiles**

Run the Build command. Expected: `Result: Succeeded`.

- [ ] **Step 8: Run automation tests, verify still green**

Run the automation test command. Expected: `Chuck.Arpg.MoveIntent.*` still `Result={Success}` (Task 1 tests unaffected).

- [ ] **Step 9: Commit**
```bash
git add apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridGameMode.h apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridGameMode.cpp apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.h apps/rentearth/unreal-rentearth/Source/chuck/Net/chuckSimgridController.cpp
git commit -m "feat(rentearth): simgrid GameMode + WASD SendMove + disconnect travel"
```

---

### Task 4: `L_ArpgWorld` map + menu repoint

Create the minimal travel-target map via a headless editor Python step, and point the menu at it with the GameMode forced through the `OpenLevel` URL option.

**Files:**
- Create: `apps/rentearth/unreal-rentearth/Scripts/make_arpg_world.py`
- Create (generated asset, committed): `apps/rentearth/unreal-rentearth/Content/Map/L_ArpgWorld.umap`
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.h:27` (`PlayLevelName` default)
- Modify: `apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.cpp:234` (`OpenLevel` `game=` option)

**Interfaces:**
- Consumes: GameMode class path `/Script/chuck.chuckSimgridGameMode` (Task 3).
- Produces: level asset `/Game/Map/L_ArpgWorld`.

- [ ] **Step 1: Write the editor Python map generator**

Create `Scripts/make_arpg_world.py`:
```python
import unreal

MAP_PACKAGE = "/Game/Map/L_ArpgWorld"

subsys = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
subsys.new_level(MAP_PACKAGE)

world = unreal.EditorLevelLibrary.get_editor_world()

floor = unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.StaticMeshActor, unreal.Vector(0.0, 0.0, 0.0)
)
plane = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane.Plane")
floor.static_mesh_component.set_static_mesh(plane)
floor.set_actor_scale3d(unreal.Vector(100.0, 100.0, 1.0))

unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.DirectionalLight, unreal.Vector(0.0, 0.0, 500.0), unreal.Rotator(-45.0, -45.0, 0.0)
)
unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.SkyLight, unreal.Vector(0.0, 0.0, 600.0)
)
unreal.EditorLevelLibrary.spawn_actor_from_class(
    unreal.PlayerStart, unreal.Vector(0.0, 0.0, 100.0)
)

subsys.save_current_level()
unreal.log("L_ArpgWorld created")
```

- [ ] **Step 2: Run the generator headless**
```bash
cd apps/rentearth/unreal-rentearth
pkill -9 -f UnrealEditor-Cmd; rm -f /tmp/UnrealEditor-Cmd*
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$(pwd)/rentearth.uproject" -run=pythonscript -script="$(pwd)/Scripts/make_arpg_world.py" -unattended -nop4 -nosplash
```
Expected: log line `L_ArpgWorld created` and the file `Content/Map/L_ArpgWorld.umap` exists.

- [ ] **Step 3: Verify the asset exists**
```bash
ls -la apps/rentearth/unreal-rentearth/Content/Map/L_ArpgWorld.umap
```
Expected: file present, non-zero size.

- [ ] **Step 4: Repoint the menu's play level default**

In `chuckMenuPlayerController.h`, change line 27:
```cpp
	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Menu")
	FName PlayLevelName = TEXT("L_ArpgWorld");
```

- [ ] **Step 5: Force the GameMode via the OpenLevel URL option**

In `chuckMenuPlayerController.cpp` line 234, change:
```cpp
		UGameplayStatics::OpenLevel(this, PlayLevelName);
```
to:
```cpp
		UGameplayStatics::OpenLevel(this, PlayLevelName, true, TEXT("game=/Script/chuck.chuckSimgridGameMode"));
```

- [ ] **Step 6: Build, verify it compiles**

Run the Build command. Expected: `Result: Succeeded`.

- [ ] **Step 7: Commit**
```bash
git add apps/rentearth/unreal-rentearth/Scripts/make_arpg_world.py apps/rentearth/unreal-rentearth/Content/Map/L_ArpgWorld.umap apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.h apps/rentearth/unreal-rentearth/Source/chuck/UI/chuckMenuPlayerController.cpp
git commit -m "feat(rentearth): L_ArpgWorld map + point menu play at simgrid GameMode"
```

---

## Definition of Done

- `chuckEditor Mac Development` builds clean.
- `Chuck.Arpg.MoveIntent.{Zero,Up,Right,Run}` automation tests pass.
- New `AchuckSimgridGameMode` binds `AchuckSimgridController` + `AchuckArpgPawn`.
- `L_ArpgWorld.umap` committed; menu `PlayLevelName` = `L_ArpgWorld`; `OpenLevel` forces `game=/Script/chuck.chuckSimgridGameMode`.
- **PIE smoke (manual):** hit Play → login + username gate (Phase 4) → auto-travel to `L_ArpgWorld` → controller connects to `wss://arpg.kbve.com/ws` → isometric orthographic view → WASD moves the server-authoritative pawn → remote entities render → disconnect returns to `L_MainMenu`.
