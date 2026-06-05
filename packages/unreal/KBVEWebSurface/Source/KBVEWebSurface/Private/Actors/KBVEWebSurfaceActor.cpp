#include "Actors/KBVEWebSurfaceActor.h"

#include "Components/KBVEWebSurfaceComponent.h"

AKBVEWebSurfaceActor::AKBVEWebSurfaceActor()
{
	PrimaryActorTick.bCanEverTick = false;
	WebSurface = CreateDefaultSubobject<UKBVEWebSurfaceComponent>(TEXT("WebSurface"));
	RootComponent = WebSurface;
}
