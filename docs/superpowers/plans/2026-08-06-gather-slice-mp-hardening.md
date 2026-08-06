# Gather-slice MP hardening (3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the professiondb gather slice work on a dedicated server with remote clients — replicate node depletion and route the Interact→gather through a proximity-validated client→server RPC, instead of the current authority-local (host/PIE-only) path.

**Architecture:** `AchuckResourceNode` becomes a replicated actor (`bReplicates=true`) with a `Replicated` `RemainingAmount` (so clients see depletion / stop prompting on empty) and an `IsWithinRange(const AActor*)` server-side proximity check. `AchuckCoreCharacter` gains a `UFUNCTION(Server, Reliable) ServerGatherNode(AchuckResourceNode*)` RPC whose `_Implementation` runs on the server: reject if the node is null/depleted or the requesting pawn is out of range, else call the existing authority-guarded `Node->Gather(this)`. `OnInteractPressed` (client) resolves the nearby node via `GetNearby()` and calls `Char->ServerGatherNode(Node)`; the RPC marshals the replicated node ref to the server. The dead `GatherNearby` static helper is removed.

**Tech Stack:** UE5 C++ replication (`DOREPLIFETIME`, `Net/UnrealNetwork.h`), Server RPC (`UFUNCTION(Server, Reliable)` + `_Implementation`), rentearth `chuck` module.

## Global Constraints

- Worktree `/Users/alappatel/Documents/GitHub/kbve-mp`, branch `trunk/professiondb-ue-gather-mp`. Never the main tree. Absolute paths.
- DROP ALL code comments in newly authored/edited C++.
- **NO UE toolchain here — untested netcode.** Correctness bar = (a) mirror `AchuckCoreCharacter`'s replication idiom exactly (`bReplicates`, `GetLifetimeReplicatedProps`+`DOREPLIFETIME`, `#include "Net/UnrealNetwork.h"`); (b) UE-standard Server-RPC form (`UFUNCTION(Server, Reliable)` decl + `..._Implementation` def, no manual body for the decl); (c) every referenced symbol exists. clangd `CoreMinimal.h not found` diagnostics are EXPECTED — ignore. Real gate = a dispatched rentearth UE build.
- This is the FIRST `UFUNCTION(Server, ...)` RPC in the live chuck module (Phase C confirmed none exist) — follow standard UE5 conventions precisely; there is no in-repo RPC to copy, but `chuckCoreCharacter`'s replication is the mirror for the `DOREPLIFETIME` half.
- Do NOT add `WithValidation`/`_Validate` (optional in UE5; keep the surface minimal). Note it as a follow-up if CI's UE version rejects a validation-less Server RPC.
- Commits: no `Co-Authored-By`, no "Generated with Claude". One commit per task.

## Verified facts

- Current `apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h/.cpp` (from #15316): `AActor`; ctor calls `SetReplicates(false)`; `int32 RemainingAmount = 0;` (plain, non-UPROPERTY); `Gather(AchuckCoreCharacter*)` is `HasAuthority()`-guarded and does the professiondb resolve + `ServerAddItemByRef` + `RemainingAmount -= 1`; static `GetNearby()` returns the file-local `GCurrentNearbyResourceNode` weak ptr; static `GatherNearby(AchuckCoreCharacter*)` calls `Near->Gather`. `IsDepleted()` inline. `InteractionRadiusCm` (float, default 250) exists.
- Replication precedent `apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCoreCharacter.{h,cpp}`: `#include "Net/UnrealNetwork.h"` (cpp:20); ctor `bReplicates = true;` (cpp:43); `virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>&) const override;` (h:39); impl calls `Super::GetLifetimeReplicatedProps(...)` then `DOREPLIFETIME(AchuckCoreCharacter, Stats/Inventory)` (cpp:164-168). `ServerAddItemByRef(FName,int32)` is a plain `HasAuthority()`-guarded method (NOT an RPC).
- `OnInteractPressed` (`chuckCorePlayerController.cpp`): currently `if (AchuckResourceNode::GetNearby()) { Char=Cast<AchuckCoreCharacter>(GetPawn()); if (Char && AchuckResourceNode::GatherNearby(Char)) return; }` then arcade fallback. `#include "Props/chuckResourceNode.h"` present.

---

## Task 1: replicate `AchuckResourceNode` + proximity check

**Files:** Modify `Source/chuck/Props/chuckResourceNode.h` + `.cpp`.

- [ ] **Step 1:** In the ctor (`.cpp`), replace `SetReplicates(false);` with `bReplicates = true;`.
- [ ] **Step 2:** In the `.h`, make `RemainingAmount` a replicated UPROPERTY and add the range check + the GetLifetimeReplicatedProps override:
  - Change `int32 RemainingAmount = 0;` → `UPROPERTY(Replicated) int32 RemainingAmount = 0;`
  - Add public: `bool IsWithinRange(const AActor* Actor) const;`
  - Add protected: `virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;`
- [ ] **Step 3:** In the `.cpp`: add `#include "Net/UnrealNetwork.h"` with the other includes. Implement:
```cpp
void AchuckResourceNode::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AchuckResourceNode, RemainingAmount);
}

bool AchuckResourceNode::IsWithinRange(const AActor* Actor) const
{
	if (!Actor)
	{
		return false;
	}
	return FVector::DistSquared(GetActorLocation(), Actor->GetActorLocation()) <= FMath::Square(InteractionRadiusCm);
}
```
- [ ] **Step 4:** Remove the now-dead `GatherNearby` static (decl in `.h`, def in `.cpp`) — Task 2 routes Interact through the RPC instead. Keep `GetNearby`, `Gather`, `IsDepleted`.
- [ ] **Step 5: Static verify:**
```bash
grep -n "bReplicates = true" apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.cpp
grep -n "UPROPERTY(Replicated)" apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h
grep -nE "GetLifetimeReplicatedProps|DOREPLIFETIME\(AchuckResourceNode, RemainingAmount\)|Net/UnrealNetwork.h|IsWithinRange" apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.cpp
grep -c "GatherNearby" apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.h apps/rentearth/unreal-rentearth/Source/chuck/Props/chuckResourceNode.cpp
```
First three print; the `GatherNearby` count must be 0 in both files.
- [ ] **Step 6: Commit.** `git commit -am "feat(rentearth): replicate resource node depletion + add range check"`

## Task 2: `ServerGatherNode` RPC + Interact routing

**Files:** Modify `Source/chuck/Core/chuckCoreCharacter.h` + `.cpp`; `Source/chuck/Core/chuckCorePlayerController.cpp`.

- [ ] **Step 1:** In `chuckCoreCharacter.h`: forward-declare `class AchuckResourceNode;` (near the top with other forward decls) and add, in the public section:
```cpp
	UFUNCTION(Server, Reliable)
	void ServerGatherNode(AchuckResourceNode* Node);
```
- [ ] **Step 2:** In `chuckCoreCharacter.cpp`: add `#include "Props/chuckResourceNode.h"` with the includes, and implement the RPC body as `_Implementation`:
```cpp
void AchuckCoreCharacter::ServerGatherNode_Implementation(AchuckResourceNode* Node)
{
	if (!Node || Node->IsDepleted())
	{
		return;
	}
	if (!Node->IsWithinRange(this))
	{
		return;
	}
	Node->Gather(this);
}
```
(No manual body for the plain `ServerGatherNode` declaration — UE generates the thunk; only `_Implementation` is defined. `Gather` is already `HasAuthority()`-guarded, and this runs on the server, so it proceeds.)
- [ ] **Step 3:** In `chuckCorePlayerController.cpp`, rewrite the resource-node branch of `OnInteractPressed` to call the RPC:
```cpp
	if (AchuckResourceNode* Node = AchuckResourceNode::GetNearby())
	{
		if (AchuckCoreCharacter* Char = Cast<AchuckCoreCharacter>(GetPawn()))
		{
			Char->ServerGatherNode(Node);
			return;
		}
	}
```
(Keep the arcade fallback below unchanged. `#include "Props/chuckResourceNode.h"` and the character header are already present.)
- [ ] **Step 4: Static verify:**
```bash
grep -nE "UFUNCTION\(Server, Reliable\)|void ServerGatherNode" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCoreCharacter.h
grep -nE "ServerGatherNode_Implementation|IsWithinRange|Node->Gather|Props/chuckResourceNode.h" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCoreCharacter.cpp
grep -nE "ServerGatherNode\(Node\)|AchuckResourceNode::GetNearby" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp
grep -c "GatherNearby" apps/rentearth/unreal-rentearth/Source/chuck/Core/chuckCorePlayerController.cpp
```
First three print; `GatherNearby` count in the controller must be 0 (no dangling call to the removed helper). Confirm `IsWithinRange`/`IsDepleted`/`Gather` all exist on `AchuckResourceNode` (grep its header).
- [ ] **Step 5: Commit.** `git commit -am "feat(rentearth): server RPC for authoritative resource gathering"`

## Task 3: gate + push + PR

- [ ] **Step 1:** Whole-slice static consistency: re-run all Task-1/2 greps; confirm no `GatherNearby` reference survives anywhere (`grep -rn GatherNearby apps/rentearth`), and every symbol the RPC path touches (`IsWithinRange`, `IsDepleted`, `Gather`, `GetNearby`, `ServerGatherNode`) is declared where referenced.
- [ ] **Step 2:** `git status --porcelain` clean. Push `git push -u origin trunk/professiondb-ue-gather-mp`.
- [ ] **Step 3:** PR `--base dev`, title `feat(rentearth): make gather slice server-authoritative (RPC + replication)`. Body: (a) node now replicates `RemainingAmount` (clients see depletion); (b) Interact routes through `ServerGatherNode` Server RPC with a server-side range check (anti-cheat); (c) removes the authority-local no-op path — gather now works on dedicated server + remote clients, not just PIE/listen-host; (d) UE C++ is static-verified only (no local compile); first Server RPC in the chuck module (UE-standard form, no WithValidation — add if CI's UE version requires it); real gate = dispatched rentearth build.

## RISKS

- **Untested netcode:** no local UE compile/run. Server RPC + replication correctness (ownership routing, actor-ref marshaling, relevancy) can only be confirmed in a UE build/session. Mitigated by mirroring the in-repo replication idiom + UE-standard RPC form.
- **Server RPC ownership:** `ServerGatherNode` on the possessed `AchuckCoreCharacter` requires the character be owned by the calling client's connection — true for a possessed pawn, so routing is standard. If the pawn isn't net-owned in some flow, the RPC would be dropped (client-side) — acceptable, fail-safe (no gather).
- **Replicated actor-ref param:** passing `AchuckResourceNode*` over the RPC requires the node be replicated (Task 1 `bReplicates=true`) AND net-relevant to the client — level-placed replicated actors are. If a node isn't relevant, the ref arrives null → the `_Implementation` null-guard rejects safely.
- **WithValidation:** omitted (optional in UE5). If CI's engine build rejects a Server RPC without `_Validate`, add `WithValidation` + a `..._Validate` returning `true`.

## Self-Review

- Reuses the existing authority-guarded `Gather` (no gameplay logic duplicated) — only adds the transport (RPC) + state replication + a proximity gate.
- Mirrors `chuckCoreCharacter` replication exactly; UE-standard Server-RPC form.
- Removes the dead `GatherNearby`; no authority-local no-op path remains.
