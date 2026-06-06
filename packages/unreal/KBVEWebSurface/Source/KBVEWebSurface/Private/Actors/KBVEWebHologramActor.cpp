#include "Actors/KBVEWebHologramActor.h"

#include "Components/KBVEWebRenderSurfaceComponent.h"

AKBVEWebHologramActor::AKBVEWebHologramActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Surface = CreateDefaultSubobject<UKBVEWebRenderSurfaceComponent>(TEXT("Surface"));
	Surface->SetupAttachment(Root);
	Surface->MaxFrameRate = 20;
}

void AKBVEWebHologramActor::BeginPlay()
{
	Super::BeginPlay();
	if (Surface && !InitialURL.IsEmpty())
	{
		Surface->LoadURL(InitialURL);
	}
}
