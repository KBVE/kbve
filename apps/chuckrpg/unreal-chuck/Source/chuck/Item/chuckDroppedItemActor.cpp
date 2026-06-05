#include "chuckDroppedItemActor.h"

#include "Components/MaterialBillboardComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Engine/Texture2D.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"

AchuckDroppedItemActor::AchuckDroppedItemActor()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup    = TG_PrePhysics;

	SphereRoot = CreateDefaultSubobject<USphereComponent>(TEXT("SphereRoot"));
	SphereRoot->InitSphereRadius(45.f);
	SphereRoot->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	SphereRoot->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	SphereRoot->SetGenerateOverlapEvents(true);
	RootComponent = SphereRoot;

	HaloBillboard = CreateDefaultSubobject<UMaterialBillboardComponent>(TEXT("HaloBillboard"));
	HaloBillboard->SetupAttachment(RootComponent);
	HaloBillboard->SetHiddenInGame(false);
	HaloBillboard->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	IconBillboard = CreateDefaultSubobject<UMaterialBillboardComponent>(TEXT("IconBillboard"));
	IconBillboard->SetupAttachment(RootComponent);
	IconBillboard->SetHiddenInGame(false);
	IconBillboard->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	RarityLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("RarityLight"));
	RarityLight->SetupAttachment(RootComponent);
	RarityLight->SetIntensity(2400.f);
	RarityLight->SetAttenuationRadius(280.f);
	RarityLight->SetSourceRadius(8.f);
	RarityLight->SetCastShadows(false);

	SetReplicates(false);
}

void AchuckDroppedItemActor::BeginPlay()
{
	Super::BeginPlay();
	SetActorHiddenInGame(true);
	SetActorTickEnabled(false);
}

void AchuckDroppedItemActor::Acquire(int32 InItemKey, int32 InCount, EchuckItemRarity InRarity, const FLinearColor& InRarityColor, const FVector& Loc, UTexture2D* IconTexture, UTexture2D* HaloTexture, UMaterialInterface* SharedMat)
{
	ItemKey = InItemKey;
	Count   = InCount;
	Rarity  = InRarity;
	RarityColorCache = InRarityColor;
	BaseLocation = Loc;
	bActive = true;
	BobPhase  = 0.f;

	SetActorLocation(Loc);
	SetActorHiddenInGame(false);
	SetActorTickEnabled(true);

	if (RarityLight)
	{
		RarityLight->SetLightColor(InRarityColor);
		RarityLight->SetIntensity(2400.f);
	}

	if (HaloBillboard && SharedMat && HaloTexture)
	{
		HaloBillboard->Elements.Reset();
		UMaterialInstanceDynamic* HaloMID = UMaterialInstanceDynamic::Create(SharedMat, this);
		if (HaloMID)
		{
			HaloMID->SetTextureParameterValue(TEXT("Texture"), HaloTexture);
			HaloMID->SetVectorParameterValue (TEXT("Tint"), FLinearColor(InRarityColor.R, InRarityColor.G, InRarityColor.B, 0.85f));
		}
		FMaterialSpriteElement Halo;
		Halo.Material             = HaloMID ? HaloMID : SharedMat;
		Halo.bSizeIsInScreenSpace = false;
		Halo.BaseSizeX            = 55.f;
		Halo.BaseSizeY            = 55.f;
		HaloBillboard->Elements.Add(Halo);
		HaloBillboard->SetBoundsScale(4.f);
		HaloBillboard->MarkRenderStateDirty();
		HaloBillboard->UpdateBounds();
	}

	if (IconBillboard && SharedMat && IconTexture)
	{
		IconBillboard->Elements.Reset();
		UMaterialInstanceDynamic* IconMID = UMaterialInstanceDynamic::Create(SharedMat, this);
		if (IconMID)
		{
			IconMID->SetTextureParameterValue(TEXT("Texture"), IconTexture);
			IconMID->SetVectorParameterValue (TEXT("Tint"), FLinearColor::White);
		}
		FMaterialSpriteElement Icon;
		Icon.Material             = IconMID ? IconMID : SharedMat;
		Icon.bSizeIsInScreenSpace = false;
		Icon.BaseSizeX            = 28.f;
		Icon.BaseSizeY            = 28.f;
		IconBillboard->Elements.Add(Icon);
		IconBillboard->SetBoundsScale(4.f);
		IconBillboard->MarkRenderStateDirty();
		IconBillboard->UpdateBounds();
	}
}

void AchuckDroppedItemActor::Release()
{
	bActive = false;
	ItemKey = 0;
	Count   = 0;
	SetActorHiddenInGame(true);
	SetActorTickEnabled(false);
	if (HaloBillboard) HaloBillboard->Elements.Reset();
	if (IconBillboard) IconBillboard->Elements.Reset();
}

void AchuckDroppedItemActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bActive) return;

	BobPhase = FMath::Fmod(BobPhase + DeltaSeconds, 1000.f);
	const float Bob = FMath::Sin(BobPhase * 3.0f) * 6.f;
	FVector L = BaseLocation;
	L.Z += Bob;
	SetActorLocation(L);

	if (RarityLight)
	{
		const float Pulse = 0.5f + 0.5f * FMath::Sin(BobPhase * 4.0f);
		RarityLight->SetIntensity(1900.f + Pulse * 900.f);
	}
}
