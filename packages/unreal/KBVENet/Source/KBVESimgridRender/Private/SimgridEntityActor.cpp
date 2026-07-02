#include "SimgridEntityActor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/WidgetComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Animation/AnimationAsset.h"

ASimgridEntityActor::ASimgridEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;

	MeshComp = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComp"));
	SetRootComponent(MeshComp);
	MeshComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MeshComp->SetMobility(EComponentMobility::Movable);

	SkelComp = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("SkelComp"));
	SkelComp->SetupAttachment(MeshComp);
	SkelComp->SetRelativeRotation(FRotator(0.0f, -90.0f, 0.0f));
	SkelComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SkelComp->SetMobility(EComponentMobility::Movable);
	SkelComp->SetVisibility(false);

	PlateComp = CreateDefaultSubobject<UWidgetComponent>(TEXT("PlateComp"));
	PlateComp->SetupAttachment(MeshComp);
	PlateComp->SetRelativeLocation(FVector(0.0f, 0.0f, 230.0f));
	PlateComp->SetWidgetSpace(EWidgetSpace::Screen);
	PlateComp->SetDrawAtDesiredSize(true);
	PlateComp->SetWidgetClass(USimgridNameplateWidget::StaticClass());
	PlateComp->SetVisibility(false);
}

USimgridNameplateWidget* ASimgridEntityActor::GetNameplate() const
{
	return PlateComp ? Cast<USimgridNameplateWidget>(PlateComp->GetUserWidgetObject()) : nullptr;
}

void ASimgridEntityActor::SetDisplayName(const FString& Name)
{
	if (DisplayName == Name)
	{
		return;
	}
	if (USimgridNameplateWidget* Plate = GetNameplate())
	{
		DisplayName = Name;
		Plate->SetDisplayName(Name);
		PlateComp->SetVisibility(!Name.IsEmpty());
	}
}

void ASimgridEntityActor::SetBar(ESimgridNameplateBar Bar, float Current, float Max)
{
	if (USimgridNameplateWidget* Plate = GetNameplate())
	{
		Plate->SetBar(Bar, Current, Max);
	}
}

void ASimgridEntityActor::SetLocomotionAnim(UAnimationAsset* Anim)
{
	if (!SkelComp || CurrentAnim == Anim)
	{
		return;
	}
	CurrentAnim = Anim;
	if (Anim)
	{
		SkelComp->PlayAnimation(Anim, true);
	}
	else
	{
		SkelComp->Stop();
	}
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
