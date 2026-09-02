#include "RareIconPlayerPawn.h"

#include "Components/CapsuleComponent.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "Components/CapsuleComponent.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/IConsoleManager.h"
#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "MoveLibrary/FloorQueryUtils.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldStreamer.h"
#include "KBVEWorldHeightfieldActor.h"
#include "RareIcon.h"
#include "EngineUtils.h"
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

	// Once, after the pawn has had time to settle onto the ground, so a headless
	// run records it without anyone typing into a console.
	// A series rather than one sample: a capsule still settling and a capsule
	// wedged at the wrong height look identical in a single reading.
	if (FeetReportsDone < FeetReportCount)
	{
		TimeSinceBeginPlay += DeltaSeconds;
		if (TimeSinceBeginPlay >= FeetReportDelay + FeetReportInterval * FeetReportsDone)
		{
			++FeetReportsDone;
			// Once, well after landing: drop the capsule onto the ground a sweep
			// of that same capsule actually finds. If it stays, the landing
			// simply stopped high and nothing holds it there; if it returns to
			// where it was, something is actively holding it up.
			ReportFeet();
		}
	}
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


// Reports every link between the ground that is drawn and the feet that are
// drawn, in one line, because "floating" can be any of them: a collision
// surface that disagrees with the visual one, a capsule resting high, a mesh
// offset, or an animation whose pose does not put the feet at the root.
void ARareIconPlayerPawn::ReportFeet() const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	const FVector Location = GetActorLocation();
	const UCapsuleComponent* PawnCapsule = FindComponentByClass<UCapsuleComponent>();
	const float HalfHeight = PawnCapsule ? PawnCapsule->GetScaledCapsuleHalfHeight() : 0.0f;
	const float Radius = PawnCapsule ? PawnCapsule->GetScaledCapsuleRadius() : 0.0f;
	const float CapsuleBottom = Location.Z - HalfHeight;

	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);
	const FVector End = Location - FVector(0.0f, 0.0f, 5000.0f);

	// A patch draws one mesh and collides with another. Querying only the
	// visibility channel measures whichever of the two answers it, which is not
	// necessarily the one the capsule rests on -- so name the component that
	// each query hit, and ask on the pawn's own channel as well.
	auto Describe = [&](ECollisionChannel Channel, bool bSweep) -> FString
	{
		FHitResult Hit;
		const bool bAny = bSweep
			? World->SweepSingleByChannel(Hit, Location, End, FQuat::Identity, Channel,
				FCollisionShape::MakeCapsule(Radius, HalfHeight), Params)
			: World->LineTraceSingleByChannel(Hit, Location, End, Channel, Params);
		if (!bAny)
		{
			return FString(TEXT("MISS"));
		}
		const float Z = bSweep ? Hit.Location.Z - HalfHeight : Hit.Location.Z;
		const FString Component = Hit.GetComponent() ? Hit.GetComponent()->GetName() : TEXT("?");
		return FString::Printf(TEXT("%.1f@%s%s"), Z, *Component,
			Hit.bStartPenetrating ? TEXT("!pen") : TEXT(""));
	};

	float Analytic = 0.0f;
	float PeakAnalytic = 0.0f;
	TActorIterator<AKBVEWorldStreamer> StreamerIt(World);
	if (StreamerIt)
	{
		const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(StreamerIt->WorldSeed);
		Analytic = FKBVEWorldHeightfield::HeightAt(
			StreamerIt->Shape, Seed, Location.X / 100.0f, Location.Y / 100.0f);

		PeakAnalytic = Analytic;
		for (int32 Step = 0; Step < 16; ++Step)
		{
			const float Angle = (2.0f * PI * Step) / 16.0f;
			PeakAnalytic = FMath::Max(PeakAnalytic, FKBVEWorldHeightfield::HeightAt(
				StreamerIt->Shape, Seed,
				(Location.X + Radius * FMath::Cos(Angle)) / 100.0f,
				(Location.Y + Radius * FMath::Sin(Angle)) / 100.0f));
		}
	}

	float FootZ = 0.0f;
	if (const USkeletalMeshComponent* MeshComponent = FindComponentByClass<USkeletalMeshComponent>())
	{
		FootZ = MeshComponent->GetSocketLocation(TEXT("foot_l")).Z;
	}

	const FVector Velocity = GetAuthoritativeVelocity();
	const FString Mode = GetMoverComponent()
		? GetMoverComponent()->GetMovementModeName().ToString()
		: FString(TEXT("none"));

	// Which capsule is being measured, and whether it is the one Mover moves. A
	// second capsule, or a half-height that is not what the constructor set,
	// would account for the whole gap on its own.
	FString CapsuleDesc(TEXT("none"));
	if (PawnCapsule)
	{
		int32 CapsuleCount = 0;
		for (const UActorComponent* Component : GetComponents())
		{
			if (Component && Component->IsA<UCapsuleComponent>())
			{
				++CapsuleCount;
			}
		}
		CapsuleDesc = FString::Printf(TEXT("%s h=%.1f r=%.1f count=%d root=%s"),
			*PawnCapsule->GetName(), HalfHeight, Radius, CapsuleCount,
			PawnCapsule == GetRootComponent() ? TEXT("yes") : TEXT("no"));
	}

	const USceneComponent* Updated = GetMoverComponent() ? GetMoverComponent()->GetUpdatedComponent() : nullptr;
	const FString UpdatedDesc = Updated
		? FString::Printf(TEXT("%s z=%.1f"), *Updated->GetName(), Updated->GetComponentLocation().Z)
		: FString(TEXT("none"));

	const FString VisSweep = Describe(ECC_Visibility, true);
	const FString PawnSweep = Describe(ECC_Pawn, true);

	// Every surface under the capsule, named by actor. All 169 patches call
	// their collision component "CollisionMesh", so the component name cannot
	// tell two patches apart -- and two patches overlapping at different
	// heights is exactly what a single hit would hide.
	// Mover's own answer, rather than a reconstruction of it: which surface it
	// believes it is standing on and how far it thinks that surface is.
	FString Floor(TEXT("none"));
	if (UMoverComponent* MoverComp = GetMoverComponent())
	{
		bool bWalkable = false;
		FFloorCheckResult Result;
		UFloorQueryUtils::TryFindFloor(MoverComp, bWalkable, Result);
		Floor = FString::Printf(
			TEXT("blocking=%d walkable=%d dist=%.1f lineTrace=%d lineDist=%.1f hitZ=%.1f impactZ=%.1f on=%s"),
			Result.bBlockingHit ? 1 : 0, Result.bWalkableFloor ? 1 : 0, Result.FloorDist,
			Result.bLineTrace ? 1 : 0, Result.LineDist,
			Result.HitResult.Location.Z, Result.HitResult.ImpactPoint.Z,
			Result.HitResult.GetActor() ? *Result.HitResult.GetActor()->GetName() : TEXT("?"));
		// Where that surface is in XY, and where the patch owning it now sits.
		// Patches are pooled, so a floor remembered from landing can name a
		// patch that has since been recycled to a different chunk.
		const FVector Impact = Result.HitResult.ImpactPoint;
		Floor += FString::Printf(TEXT(" impactXY=(%.0f,%.0f) pawnXY=(%.0f,%.0f)"),
			Impact.X, Impact.Y, Location.X, Location.Y);
		if (const AKBVEWorldHeightfieldActor* Patch =
				Cast<AKBVEWorldHeightfieldActor>(Result.HitResult.GetActor()))
		{
			Floor += FString::Printf(TEXT(" patchOrigin=(%.0f,%.0f) lod=%d colLod=%d"),
				Patch->TileOrigin.X, Patch->TileOrigin.Y, Patch->LODStep, Patch->CollisionLODStep);
		}
	}

	FString Stack;
	{
		TArray<FHitResult> Hits;
		World->SweepMultiByChannel(Hits, Location, End, FQuat::Identity, ECC_Pawn,
			FCollisionShape::MakeCapsule(Radius, HalfHeight), Params);
		for (int32 i = 0; i < FMath::Min(Hits.Num(), 5); ++i)
		{
			Stack += FString::Printf(TEXT(" [%s bottom=%.1f impact=%.1f%s]"),
				Hits[i].GetActor() ? *Hits[i].GetActor()->GetName() : TEXT("?"),
				Hits[i].Location.Z - HalfHeight, Hits[i].ImpactPoint.Z,
				Hits[i].bStartPenetrating ? TEXT(" pen") : TEXT(""));
		}
		if (Hits.Num() == 0)
		{
			Stack = TEXT(" none");
		}
	}

	UE_LOG(LogRareIcon, Display,
		TEXT("feet: mode=%s velZ=%.1f speed2D=%.1f actorZ=%.1f capsuleBottom=%.1f footBoneZ=%.1f "
			"analyticZ=%.1f peakAnalytic=%.1f | capsule=[%s] updated=[%s] "
			"| visSweep=%s pawnSweep=%s | floor=[%s] | stack:%s"),
		*Mode, Velocity.Z, Velocity.Size2D(), Location.Z, CapsuleBottom, FootZ,
		Analytic, PeakAnalytic, *CapsuleDesc, *UpdatedDesc,
		*VisSweep, *PawnSweep, *Floor, *Stack);
}

static void RareIconFeetCmd()
{
	UWorld* World = GEngine ? GEngine->GetCurrentPlayWorld() : nullptr;
	APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	if (const ARareIconPlayerPawn* Pawn = PC ? Cast<ARareIconPlayerPawn>(PC->GetPawn()) : nullptr)
	{
		Pawn->ReportFeet();
	}
	else
	{
		UE_LOG(LogRareIcon, Error, TEXT("no RareIcon pawn possessed"));
	}
}

static FAutoConsoleCommand GRareIconFeetCmd(
	TEXT("rareicon.Feet"),
	TEXT("Report capsule, trace, analytic terrain and foot-bone heights at the pawn."),
	FConsoleCommandDelegate::CreateStatic(&RareIconFeetCmd));
