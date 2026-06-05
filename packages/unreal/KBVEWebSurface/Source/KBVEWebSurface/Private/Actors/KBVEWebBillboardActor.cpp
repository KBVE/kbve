#include "Actors/KBVEWebBillboardActor.h"

#include "Components/KBVEWebSurfaceComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "TimerManager.h"

AKBVEWebBillboardActor::AKBVEWebBillboardActor()
{
	PrimaryActorTick.bCanEverTick = false;
	RotationIntervalSeconds = 30.f;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Frame = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Frame"));
	Frame->SetupAttachment(Root);
	Frame->SetCollisionProfileName(TEXT("NoCollision"));

	Surface = CreateDefaultSubobject<UKBVEWebSurfaceComponent>(TEXT("Surface"));
	Surface->SetupAttachment(Frame);
	Surface->MaxFrameRate = 10;
	Surface->bPauseWhenOffscreen = true;
	Surface->SnapshotDistance = 500.f;
}

void AKBVEWebBillboardActor::BeginPlay()
{
	Super::BeginPlay();
	if (RotationURLs.Num() == 0 || !Surface)
	{
		return;
	}
	AdvanceURL();
	if (RotationURLs.Num() > 1)
	{
		GetWorldTimerManager().SetTimer(
			RotationTimer,
			this,
			&AKBVEWebBillboardActor::AdvanceURL,
			RotationIntervalSeconds,
			true);
	}
}

void AKBVEWebBillboardActor::EndPlay(const EEndPlayReason::Type Reason)
{
	GetWorldTimerManager().ClearTimer(RotationTimer);
	Super::EndPlay(Reason);
}

void AKBVEWebBillboardActor::AdvanceURL()
{
	if (!Surface || RotationURLs.Num() == 0)
	{
		return;
	}
	const FString& Next = RotationURLs[CurrentIndex % RotationURLs.Num()];
	CurrentIndex = (CurrentIndex + 1) % RotationURLs.Num();
	Surface->LoadURL(Next);
}
