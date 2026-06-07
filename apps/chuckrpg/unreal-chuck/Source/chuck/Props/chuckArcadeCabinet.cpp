#include "chuckArcadeCabinet.h"

#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/KBVEWebSurfaceComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"
#include "KBVESupabaseSubsystem.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	TWeakObjectPtr<AchuckArcadeCabinet> GCurrentNearbyArcade;
}

AchuckArcadeCabinet::AchuckArcadeCabinet()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	Mesh->SetCanEverAffectNavigation(true);
	Mesh->SetMobility(EComponentMobility::Static);
	RootComponent = Mesh;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> MeshFinder(TEXT("/Game/Art/Furniture/Arcade/ArcadeCabinet.ArcadeCabinet"));
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

	InteractionRadius = CreateDefaultSubobject<USphereComponent>(TEXT("InteractionRadius"));
	InteractionRadius->SetupAttachment(RootComponent);
	InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	InteractionRadius->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	InteractionRadius->SetGenerateOverlapEvents(true);

	ScreenSurface = CreateDefaultSubobject<UKBVEWebSurfaceComponent>(TEXT("ScreenSurface"));
	ScreenSurface->SetupAttachment(RootComponent);
	ScreenSurface->SetRelativeLocation(FVector(0.f, 15.f, 130.f));
	ScreenSurface->SetRelativeRotation(FRotator(0.f, 180.f, 0.f));
	ScreenSurface->SetRelativeScale3D(FVector(0.18f, 0.18f, 0.18f));
	ScreenSurface->SetDrawSize(FVector2D(640.f, 480.f));
	ScreenSurface->SetDrawAtDesiredSize(false);
	ScreenSurface->bPauseWhenOffscreen = true;
	ScreenSurface->InitialURL = FString();

	SetReplicates(false);
}

void AchuckArcadeCabinet::BeginPlay()
{
	Super::BeginPlay();
	if (InteractionRadius)
	{
		InteractionRadius->OnComponentBeginOverlap.AddDynamic(this, &AchuckArcadeCabinet::HandleBeginOverlap);
		InteractionRadius->OnComponentEndOverlap.AddDynamic(this, &AchuckArcadeCabinet::HandleEndOverlap);
		InteractionRadius->SetSphereRadius(InteractionRadiusCm);
	}
	if (bPreloadScreen && ScreenSurface)
	{
		FString Token;
		if (UGameInstance* GI = GetGameInstance())
		{
			if (UKBVESupabaseSubsystem* Sub = GI->GetSubsystem<UKBVESupabaseSubsystem>())
			{
				Token = Sub->GetAccessToken();
			}
		}
		if (Token.IsEmpty())
		{
			ScreenSurface->LoadURL(ArcadeURL);
		}
		else
		{
			ScreenSurface->LoadURLWithFragmentToken(ArcadeURL, Token);
		}
		bIsActive = true;
		UE_LOG(LogTemp, Display, TEXT("[Arcade] Preload screen url=%s tokenLen=%d"),
			*ArcadeURL, Token.Len());
	}
}

void AchuckArcadeCabinet::EndPlay(const EEndPlayReason::Type Reason)
{
	if (GCurrentNearbyArcade.Get() == this)
	{
		GCurrentNearbyArcade.Reset();
	}
	Super::EndPlay(Reason);
}

void AchuckArcadeCabinet::HandleBeginOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	GCurrentNearbyArcade = this;
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(
			static_cast<uint64>(reinterpret_cast<UPTRINT>(this)),
			5.f,
			FColor(80, 220, 255),
			TEXT("[Arcade] Press F to play"));
	}
}

void AchuckArcadeCabinet::HandleEndOverlap(UPrimitiveComponent*, AActor* OtherActor, UPrimitiveComponent*, int32)
{
	APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn || !Pawn->IsPlayerControlled())
	{
		return;
	}
	if (GCurrentNearbyArcade.Get() == this)
	{
		GCurrentNearbyArcade.Reset();
	}
	if (GEngine)
	{
		GEngine->RemoveOnScreenDebugMessage(static_cast<uint64>(reinterpret_cast<UPTRINT>(this)));
	}
	Deactivate();
}

void AchuckArcadeCabinet::Activate()
{
	if (!ScreenSurface)
	{
		return;
	}

	FString Token;
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UKBVESupabaseSubsystem* Sub = GI->GetSubsystem<UKBVESupabaseSubsystem>())
		{
			Token = Sub->GetAccessToken();
		}
	}

	if (Token.IsEmpty())
	{
		ScreenSurface->LoadURL(ArcadeURL);
	}
	else
	{
		ScreenSurface->LoadURLWithFragmentToken(ArcadeURL, Token);
	}

	bIsActive = true;
	UE_LOG(LogTemp, Display, TEXT("[Arcade] Activated %s url=%s tokenLen=%d"),
		*GetName(), *ArcadeURL, Token.Len());
}

void AchuckArcadeCabinet::Deactivate()
{
	if (!bIsActive) return;
	bIsActive = false;
	if (ScreenSurface)
	{
		ScreenSurface->LoadURL(FString());
	}
}

AchuckArcadeCabinet* AchuckArcadeCabinet::GetNearby()
{
	return GCurrentNearbyArcade.Get();
}

bool AchuckArcadeCabinet::ActivateNearby()
{
	AchuckArcadeCabinet* Near = GCurrentNearbyArcade.Get();
	if (!Near) return false;
	Near->Activate();
	return true;
}
