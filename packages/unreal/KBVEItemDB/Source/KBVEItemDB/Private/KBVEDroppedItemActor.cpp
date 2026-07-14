#include "KBVEDroppedItemActor.h"

#include "KBVEDroppedItemPool.h"
#include "Components/MaterialBillboardComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Materials/MaterialInstanceDynamic.h"

AKBVEDroppedItemActor::AKBVEDroppedItemActor()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup    = TG_PrePhysics;
	PrimaryActorTick.TickInterval = 0.05f;

	SphereRoot = CreateDefaultSubobject<USphereComponent>(TEXT("SphereRoot"));
	SphereRoot->InitSphereRadius(70.f);
	SphereRoot->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	SphereRoot->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	SphereRoot->SetGenerateOverlapEvents(true);
	SphereRoot->OnComponentBeginOverlap.AddDynamic(this, &AKBVEDroppedItemActor::OnSphereBeginOverlap);
	RootComponent = SphereRoot;

	HaloBillboard = CreateDefaultSubobject<UMaterialBillboardComponent>(TEXT("HaloBillboard"));
	HaloBillboard->SetupAttachment(RootComponent);
	HaloBillboard->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	HaloBillboard->SetTranslucentSortPriority(0);

	IconBillboard = CreateDefaultSubobject<UMaterialBillboardComponent>(TEXT("IconBillboard"));
	IconBillboard->SetupAttachment(RootComponent);
	IconBillboard->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	IconBillboard->SetTranslucentSortPriority(10);

	RarityLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("RarityLight"));
	RarityLight->SetupAttachment(RootComponent);
	RarityLight->SetIntensity(2400.f);
	RarityLight->SetAttenuationRadius(280.f);
	RarityLight->SetSourceRadius(8.f);
	RarityLight->SetCastShadows(false);

	SetReplicates(false);
}

void AKBVEDroppedItemActor::BeginPlay()
{
	Super::BeginPlay();
	SetActorHiddenInGame(true);
	SetActorTickEnabled(false);
}

void AKBVEDroppedItemActor::Acquire(int32 InItemKey, int32 InCount, const FVector& Loc, const FKBVEDroppedItemVisual& Visual)
{
	ItemKey = InItemKey;
	Count   = InCount;
	BaseLocation = Loc;
	bActive = true;
	bHoming = false;
	HomingTarget = nullptr;
	HomingTimer = 0.f;
	BobPhase = 0.f;
	GraceTimer = 2.0f;

	SetActorScale3D(FVector::OneVector);
	SetActorLocation(Loc);
	SetActorHiddenInGame(false);
	SetActorTickEnabled(true);
	if (SphereRoot)
	{
		SphereRoot->SetGenerateOverlapEvents(true);
	}

	if (RarityLight)
	{
		RarityLight->SetLightColor(Visual.RarityColor);
		RarityLight->SetIntensity(2400.f);
	}

	if (HaloBillboard && Visual.HaloMID)
	{
		HaloBillboard->Elements.Reset();
		FMaterialSpriteElement Halo;
		Halo.Material             = Visual.HaloMID;
		Halo.bSizeIsInScreenSpace = false;
		Halo.BaseSizeX            = 55.f;
		Halo.BaseSizeY            = 55.f;
		HaloBillboard->Elements.Add(Halo);
		HaloBillboard->SetBoundsScale(4.f);
		HaloBillboard->MarkRenderStateDirty();
		HaloBillboard->UpdateBounds();
	}

	if (IconBillboard && Visual.IconMID)
	{
		IconBillboard->Elements.Reset();
		FMaterialSpriteElement Icon;
		Icon.Material             = Visual.IconMID;
		Icon.bSizeIsInScreenSpace = false;
		Icon.BaseSizeX            = 28.f;
		Icon.BaseSizeY            = 28.f;
		IconBillboard->Elements.Add(Icon);
		IconBillboard->SetBoundsScale(4.f);
		IconBillboard->MarkRenderStateDirty();
		IconBillboard->UpdateBounds();
	}
}

void AKBVEDroppedItemActor::Release()
{
	bActive = false;
	bHoming = false;
	HomingTarget = nullptr;
	HomingTimer = 0.f;
	ItemKey = 0;
	Count   = 0;
	SetActorScale3D(FVector::OneVector);
	SetActorHiddenInGame(true);
	SetActorTickEnabled(false);
	SetActorTickInterval(0.05f);
	if (HaloBillboard) HaloBillboard->Elements.Reset();
	if (IconBillboard) IconBillboard->Elements.Reset();
	if (RarityLight)
	{
		RarityLight->SetIntensity(0.f);
		RarityLight->SetLightColor(FLinearColor::White);
	}
	if (SphereRoot) SphereRoot->SetGenerateOverlapEvents(false);
}

void AKBVEDroppedItemActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bActive) return;

	if (GraceTimer > 0.f)
	{
		GraceTimer -= DeltaSeconds;
	}

	if (bHoming)
	{
		HomingTimer += DeltaSeconds;
		const float T = FMath::Clamp(HomingTimer / FMath::Max(HomingDuration, KINDA_SMALL_NUMBER), 0.f, 1.f);

		AActor* Target = HomingTarget.Get();
		FVector AimLoc = BaseLocation;
		if (Target)
		{
			AimLoc = Target->GetActorLocation() + FVector(0.f, 0.f, 60.f);
		}
		const float EaseIn = T * T;
		SetActorLocation(FMath::Lerp(BaseLocation, AimLoc, EaseIn));
		SetActorScale3D(FVector(FMath::Lerp(1.f, 0.05f, EaseIn)));

		if (RarityLight)
		{
			RarityLight->SetIntensity((1.f - T) * 2400.f);
		}

		if (T >= 1.f)
		{
			if (UWorld* W = GetWorld())
			{
				if (UKBVEDroppedItemPool* Pool = W->GetSubsystem<UKBVEDroppedItemPool>())
				{
					Pool->HandlePickupComplete(this, Target);
					return;
				}
			}
			Release();
		}
		return;
	}

	BobPhase = FMath::Fmod(BobPhase + DeltaSeconds, 1000.f);
	FVector L = BaseLocation;
	L.Z += FMath::Sin(BobPhase * 3.0f) * 6.f;
	SetActorLocation(L);

	if (RarityLight)
	{
		const float Pulse = 0.5f + 0.5f * FMath::Sin(BobPhase * 4.0f);
		RarityLight->SetIntensity(1900.f + Pulse * 900.f);
	}
}

void AKBVEDroppedItemActor::OnSphereBeginOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	if (!bActive || bHoming || GraceTimer > 0.f) return;
	if (!OtherActor || OtherActor == this) return;
	if (!Cast<APawn>(OtherActor)) return;

	bHoming      = true;
	HomingTarget = OtherActor;
	HomingTimer  = 0.f;
	BaseLocation = GetActorLocation();
	SetActorTickInterval(0.f);
	if (SphereRoot)
	{
		SphereRoot->SetGenerateOverlapEvents(false);
	}
}
