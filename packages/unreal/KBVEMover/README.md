# KBVEMover

Shared control-character layer built on UE5's **Mover** plugin — a networked, data-driven pawn that replaces the legacy `CharacterMovementComponent` stack. Server-authoritative with client prediction, so it works standalone, on a listen server, and on the dedicated server out of the box.

## AKBVEMoverPawn

A `APawn` carrying:

- `UCapsuleComponent` (root collision)
- `USkeletalMeshComponent` (visual)
- `USpringArmComponent` + `UCameraComponent` (third-person camera)
- `UCharacterMoverComponent` — the Mover movement component. Its constructor registers the default Walking / Falling / Flying modes, so movement works with no extra setup.
- Implements `IMoverInputProducerInterface`; the pawn sets itself as the component's `InputProducer`.

Input is **Enhanced Input**. `OnMove/OnLook/OnJump` accumulate intent each frame; `ProduceInput` translates it into the Mover sim's `FCharacterDefaultInputs` (`SetMoveInput(DirectionalIntent, …)`, `OrientationIntent`, jump flags) — camera-relative, normalized.

## Usage

1. Enable the plugin (pulls in `Mover` + `EnhancedInput`).
2. Derive a Blueprint from `AKBVEMoverPawn`, assign the skeletal mesh + `InputMappingContext` / `MoveAction` / `LookAction` / `JumpAction`.
3. Set it as the `DefaultPawnClass` (or possess it). Networking is automatic via the Mover component.

It's parallel to the existing CMC `AchuckCoreCharacter` — opt in per game; the legacy character is untouched.

## Verify-on-compile (UE 5.7 Mover, experimental)

Builds in `ci-unreal`, not locally. Touchpoints to confirm in-editor (Mover API moves between versions):

- `IMoverInputProducerInterface::ProduceInput_Implementation(int32, FMoverInputCmdContext&)`
- `InputCmd.InputCollection.FindOrAddMutableDataByType<FCharacterDefaultInputs>()`
- `UCharacterMoverComponent::InputProducer = this`

## Movement-driver seam

`IKBVEMovementDriver` (in **KBVEGameplay**) is the abstraction so gameplay never hard-binds to one movement backend — the avatar can swap **CMC ↔ Mover ↔ Mass/custom** without rewriting callers:

```cpp
virtual void    SubmitMoveInput(const FVector& WorldIntent);   // 0..1 directional
virtual void    SubmitJump(bool bPressed);
virtual FVector GetAuthoritativeVelocity() const;
virtual void    ApplyServerCorrection(const FVector& Pos, const FVector& Vel);
```

`AKBVEMoverPawn` is the **Mover-backed reference implementation**. A CMC driver can wrap the existing `AchuckCoreCharacter` later; both satisfy the same interface.

**Transport is orthogonal:** a driver decides how movement is _simulated_; Iris / KBVENet decide how it _replicates_. Don't conflate them.

## Selecting a backend (policy)

`UKBVEMovementPolicy` (in **KBVEGameplay**) resolves a situation to a backend — it returns an **enum only**, never referencing the Mover/CMC/Mass plugins, so KBVEGameplay stays backend-agnostic:

```cpp
EKBVEMovementBackend Backend = Policy->ResolveBackend(Context);
// spawner (game layer) maps the enum -> a concrete class:
//   CMC   -> AchuckCoreCharacter
//   Mover -> AKBVEMoverPawn (or a subclass)
//   Mass  -> a Mass entity + KBVENet snapshot
```

Default rule: player → CMC; far → Mass; in-combat → CMC; peaceful + dense population → Mover; else CMC. A **peaceful, high-population city** therefore routes its NPCs to Mover; a combat zone keeps CMC; distant crowds drop to Mass — handled gracefully per situation.

**Dependency direction:** KBVEGameplay owns the contracts (driver interface + policy enum) and depends on no backend. Backends (KBVEMover, …) depend on KBVEGameplay. The game/spawner depends on both and does the enum→class mapping. Gameplay never calls the Mover plugin.

This is **spawn-time / representation-LOD** selection — you don't hot-swap CMC↔Mover on one live actor; you spawn the right backend and swap representation by distance (the Mass-ghost ↔ actor LOD).

## Where Mover fits (and where it doesn't)

- **Player avatar → stays CMC for now.** Battle-tested prediction/correction/root-motion. Mover is experimental; keep it as the R&D path behind the driver seam.
- **NPCs / crowds → Mass + KBVENet snapshots** (already shipped) — lightweight replicated transform/anim state, client-interpolated. Not full character movement.
- **Mover's near-term home:** prototyping the future avatar, and physics-heavy movement (mounts/vehicles/Chaos) where CMC is weak.

## Shared gameplay scaffolding on the pawn

- Implements `IKBVEStatTarget` over a replicated `TArray<FKBVEMoverStat>` (generic id/value/max); `ApplyStatDelta` is authority-gated.
- Owns a `UKBVEEffectComponent` (KBVEGameplay).
- Interaction: Interact input → forward camera trace → `IKBVEMoverInteractable::OnInteract` on the hit.
- Input hooks (Sprint / Interact / Inventory) bound and forwarded to `BlueprintNativeEvent` virtuals for games to implement.

## Roadmap

- CMC driver wrapping `AchuckCoreCharacter` (proves the seam end-to-end).
- Locomotion animation layer; custom movement modes (sprint/dash/swim) as `UBaseMovementMode` subclasses.
- chuck Mover subclass wiring `FchuckStatBlock` + inventory + Mass.

## License

Part of the KBVE monorepo — see repo root.
