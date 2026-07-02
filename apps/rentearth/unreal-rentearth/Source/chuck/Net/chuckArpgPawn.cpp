#include "chuckArpgPawn.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "UObject/ConstructorHelpers.h"

AchuckArpgPawn::AchuckArpgPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	SetRootComponent(Body);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetMobility(EComponentMobility::Movable);

	static ConstructorHelpers::FObjectFinder<USkeletalMesh> MannyFinder(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"));
	if (MannyFinder.Succeeded())
	{
		Body->SetSkeletalMesh(MannyFinder.Object);
	}
}

void AchuckArpgPawn::SetVisualMesh(UStaticMesh* Mesh)
{
}

void AchuckArpgPawn::SetMoveIntent(const FVector2D& Dir, bool bInRun)
{
	IntentDir = Dir;
	bRun = bInRun;
}

void AchuckArpgPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bHasServerPos)
	{
		return;
	}

	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	const float Speed = bRun ? RUN_UU : WALK_UU;

	const float Mag = IntentDir.Size();
	FVector TargetVel = FVector::ZeroVector;
	float Rate = MOVE_FRICTION;
	if (Mag > 0.0f)
	{
		const FVector2D N = IntentDir / Mag;
		const float Scale = FMath::Min(Mag, 1.0f);
		TargetVel = FVector(N.X * Speed * Scale, N.Y * Speed * Scale, 0.0f);
		Rate = MOVE_ACCEL;
	}

	const float Response = 1.0f - FMath::Exp(-Rate * Dt);
	Velocity += (TargetVel - Velocity) * Response;
	if (Mag <= 0.0f && Velocity.Size() < STOP_UU)
	{
		Velocity = FVector::ZeroVector;
	}

	PredictedPos += Velocity * Dt;

	const FVector Err = ServerPos - PredictedPos;
	const float Dist = Err.Size2D();
	const bool bIdle = (Mag <= 0.0f) && Velocity.IsNearlyZero();
	if (Dist > HARD_SNAP_UU)
	{
		PredictedPos = ServerPos;
	}
	else if (bIdle && Dist < SETTLE_UU)
	{
		PredictedPos = ServerPos;
	}
	else
	{
		const float Blend = 1.0f - FMath::Exp(-RECONCILE_RATE * Dt);
		PredictedPos += FVector(Err.X, Err.Y, 0.0f) * Blend;
	}
	PredictedPos.Z = ServerPos.Z;

	SetActorLocation(PredictedPos);
}

void AchuckArpgPawn::ApplyServerCorrection(const FVector& Position, const FVector& InVelocity)
{
	ServerPos = Position;
	if (!bHasServerPos)
	{
		bHasServerPos = true;
		PredictedPos = Position;
		Velocity = InVelocity;
		SetActorLocation(Position);
	}
}
