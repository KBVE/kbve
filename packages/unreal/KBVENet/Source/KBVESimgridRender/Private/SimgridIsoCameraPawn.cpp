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
