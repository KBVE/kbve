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
