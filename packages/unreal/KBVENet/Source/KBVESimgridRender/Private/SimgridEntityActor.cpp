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
