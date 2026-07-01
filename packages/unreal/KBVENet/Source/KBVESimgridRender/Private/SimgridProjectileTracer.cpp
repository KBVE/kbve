#include "SimgridProjectileTracer.h"
#include "Components/StaticMeshComponent.h"

ASimgridProjectileTracer::ASimgridProjectileTracer()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetMobility(EComponentMobility::Movable);
}

void ASimgridProjectileTracer::Init(const FVector& From, const FVector& To)
{
	Start = From;
	End = To;
	SetActorLocation(From);
}

void ASimgridProjectileTracer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Age += DeltaSeconds;
	const float T = FMath::Clamp(Age / FLIGHT_TIME, 0.0f, 1.0f);
	SetActorLocation(FMath::Lerp(Start, End, T));

	if (Age >= FLIGHT_TIME)
	{
		Destroy();
	}
}
