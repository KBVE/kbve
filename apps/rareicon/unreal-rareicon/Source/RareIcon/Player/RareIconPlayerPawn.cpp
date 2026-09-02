#include "RareIconPlayerPawn.h"

#include "Components/CapsuleComponent.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "RareIcon.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	// Manny ships inside the MoverExamples plugin rather than as engine content,
	// because this install has no feature packs. That makes the player mesh a
	// dependency on an Experimental plugin's sample content -- fine for finding
	// the feel of the game, wrong to ship. Replacing it means changing this path
	// and nothing else.
	const TCHAR* MannyMeshPath = TEXT("/MoverExamples/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple");

	// Individual clips rather than the blendspace beside them, because playing a
	// blendspace needs an animation graph to evaluate it and the blueprint that
	// ships here does not compile. Single-node playback is the honest floor:
	// the character animates and reads correctly at a glance, with no blending
	// between states and no strafe set. A real locomotion graph replaces this.
	const TCHAR* IdleAnimPath = TEXT("/MoverExamples/Characters/Mannequins/Animations/Manny/MM_Idle.MM_Idle");
	const TCHAR* WalkAnimPath = TEXT("/MoverExamples/Characters/Mannequins/Animations/Manny/MM_Walk_Fwd.MM_Walk_Fwd");
	const TCHAR* RunAnimPath = TEXT("/MoverExamples/Characters/Mannequins/Animations/Manny/MM_Run_Fwd.MM_Run_Fwd");
	const TCHAR* FallAnimPath = TEXT("/MoverExamples/Characters/Mannequins/Animations/Manny/MM_Fall_Loop.MM_Fall_Loop");

	template <typename T>
	T* FindAsset(const TCHAR* Path)
	{
		ConstructorHelpers::FObjectFinder<T> Finder(Path);
		return Finder.Succeeded() ? Finder.Object : nullptr;
	}
}

ARareIconPlayerPawn::ARareIconPlayerPawn(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	PrimaryActorTick.bCanEverTick = true;
	if (Mesh)
	{
		if (USkeletalMesh* Manny = FindAsset<USkeletalMesh>(MannyMeshPath))
		{
			Mesh->SetSkeletalMesh(Manny);
			// Manny's origin is at his feet and the capsule's is at its centre,
			// so the mesh has to drop by the half-height or he floats. The yaw
			// is because the skeleton faces -Y and a pawn's forward is +X.
			const float HalfHeight = Capsule ? Capsule->GetUnscaledCapsuleHalfHeight() : 88.0f;
			Mesh->SetRelativeLocationAndRotation(
				FVector(0.0f, 0.0f, -HalfHeight), FRotator(0.0f, -90.0f, 0.0f));
		}

		// Single-node playback, driven from Tick. No animation blueprint: the one
		// that ships beside this mesh does not compile in 5.8 -- its cast to
		// MoverExamplesCharacter has a stale pin and the whole graph fails.
		Mesh->SetAnimationMode(EAnimationMode::AnimationSingleNode);
	}

	InputMappingContext = FindAsset<UInputMappingContext>(TEXT("/Game/Input/IMC_RareIcon.IMC_RareIcon"));
	MoveAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Move.IA_Move"));
	LookAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Look.IA_Look"));
	JumpAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Jump.IA_Jump"));
	SprintAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Sprint.IA_Sprint"));
	InteractAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Interact.IA_Interact"));
	InventoryAction = FindAsset<UInputAction>(TEXT("/Game/Input/IA_Inventory.IA_Inventory"));

	IdleAnim = FindAsset<UAnimSequence>(IdleAnimPath);
	WalkAnim = FindAsset<UAnimSequence>(WalkAnimPath);
	RunAnim = FindAsset<UAnimSequence>(RunAnimPath);
	FallAnim = FindAsset<UAnimSequence>(FallAnimPath);
}

void ARareIconPlayerPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UpdateLocomotionAnimation();
}

void ARareIconPlayerPawn::UpdateLocomotionAnimation()
{
	if (!Mesh)
	{
		return;
	}

	const FVector Velocity = GetAuthoritativeVelocity();
	const float GroundSpeed = Velocity.Size2D();

	UAnimSequence* Desired = IdleAnim;
	float PlayRate = 1.0f;

	if (FMath::Abs(Velocity.Z) > FallSpeedThreshold)
	{
		Desired = FallAnim;
	}
	else if (GroundSpeed > RunSpeedThreshold)
	{
		Desired = RunAnim;
		// Scaled to the clip's authored speed so the feet slide less. Not foot
		// IK, and no substitute for it -- just the cheap half of the problem.
		PlayRate = RunClipSpeed > KINDA_SMALL_NUMBER ? GroundSpeed / RunClipSpeed : 1.0f;
	}
	else if (GroundSpeed > MoveSpeedThreshold)
	{
		Desired = WalkAnim;
		PlayRate = WalkClipSpeed > KINDA_SMALL_NUMBER ? GroundSpeed / WalkClipSpeed : 1.0f;
	}

	if (!Desired)
	{
		return;
	}

	// Restarting the clip every frame would freeze it on frame zero.
	if (Desired != CurrentAnim)
	{
		Mesh->PlayAnimation(Desired, true);
		CurrentAnim = Desired;
	}

	Mesh->SetPlayRate(FMath::Clamp(PlayRate, 0.25f, 2.5f));
}
