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

## Roadmap

- Mesh + animation (Mover anim layer / locomotion).
- Custom movement modes (sprint, dash, swim) as `UBaseMovementMode` subclasses.
- Wire stats/inventory (port from `AchuckCoreCharacter`) onto the Mover pawn.

## License

Part of the KBVE monorepo — see repo root.
