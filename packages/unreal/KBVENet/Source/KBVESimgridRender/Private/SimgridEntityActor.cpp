#include "SimgridEntityActor.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/TextRenderComponent.h"
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

	NameText = CreateDefaultSubobject<UTextRenderComponent>(TEXT("NameText"));
	NameText->SetupAttachment(MeshComp);
	NameText->SetRelativeLocation(FVector(0.0f, 0.0f, 220.0f));
	NameText->SetUsingAbsoluteRotation(true);
	NameText->SetHorizontalAlignment(EHTA_Center);
	NameText->SetWorldSize(32.0f);
	NameText->SetTextRenderColor(FColor::White);
	NameText->SetVisibility(false);
}

void ASimgridEntityActor::SetDisplayName(const FString& Name)
{
	if (!NameText || DisplayName == Name)
	{
		return;
	}
	DisplayName = Name;
	NameText->SetText(FText::FromString(Name));
	NameText->SetVisibility(!Name.IsEmpty());
}

void ASimgridEntityActor::SetNameplateFacing(const FRotator& Rot)
{
	if (NameText && NameText->IsVisible())
	{
		NameText->SetWorldRotation(Rot);
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
