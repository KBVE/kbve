#include "SimgridEntityActor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"

ASimgridEntityActor::ASimgridEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;

	MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComp"));
	SetRootComponent(MeshComp);
	MeshComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MeshComp->SetMobility(EComponentMobility::Movable);

	SkelComp = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("SkelComp"));
	SkelComp->SetupAttachment(MeshComp);
	SkelComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SkelComp->SetMobility(EComponentMobility::Movable);
	SkelComp->SetVisibility(false);
}

void ASimgridEntityActor::SetMesh(UStaticMesh* Mesh)
{
	if (MeshComp)
	{
		MeshComp->SetStaticMesh(Mesh);
	}
}

void ASimgridEntityActor::SetSkeletalMesh(USkeletalMesh* Mesh)
{
	if (SkelComp)
	{
		SkelComp->SetSkeletalMesh(Mesh);
		SkelComp->SetVisibility(Mesh != nullptr);
	}
	if (MeshComp && Mesh)
	{
		MeshComp->SetVisibility(false);
	}
}

void ASimgridEntityActor::ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind)
{
	SetActorLocationAndRotation(WorldPos, FRotator(0.0f, Yaw, 0.0f));
	CurrentKind = Kind;
}
