#include "chuckArcadeCabinet.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

AchuckArcadeCabinet::AchuckArcadeCabinet()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	Mesh->SetCanEverAffectNavigation(true);
	Mesh->SetMobility(EComponentMobility::Static);
	RootComponent = Mesh;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> MeshFinder(TEXT("/Game/Props/Arcade/SM_ArcadeCabinet.SM_ArcadeCabinet"));
	if (MeshFinder.Succeeded())
	{
		Mesh->SetStaticMesh(MeshFinder.Object);
	}

	ScreenLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("ScreenLight"));
	ScreenLight->SetupAttachment(RootComponent);
	ScreenLight->SetRelativeLocation(FVector(0.f, 30.f, 130.f));
	ScreenLight->SetIntensity(800.f);
	ScreenLight->SetAttenuationRadius(180.f);
	ScreenLight->SetLightColor(FLinearColor(0.30f, 0.85f, 1.0f));
	ScreenLight->SetCastShadows(false);
	ScreenLight->SetMobility(EComponentMobility::Static);
}
