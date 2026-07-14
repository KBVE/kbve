#include "Actors/KBVEWebTerminalActor.h"

#include "Auth/KBVEWebAuthProvider.h"
#include "Components/KBVEWebSurfaceComponent.h"
#include "Components/StaticMeshComponent.h"

AKBVEWebTerminalActor::AKBVEWebTerminalActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Frame = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Frame"));
	Frame->SetupAttachment(Root);
	Frame->SetCollisionProfileName(TEXT("BlockAllDynamic"));

	Surface = CreateDefaultSubobject<UKBVEWebSurfaceComponent>(TEXT("Surface"));
	Surface->SetupAttachment(Frame);
	Surface->SetRelativeLocation(FVector(2.f, 0.f, 0.f));
}

void AKBVEWebTerminalActor::BeginPlay()
{
	Super::BeginPlay();
	if (!Surface || InitialURL.IsEmpty())
	{
		return;
	}

	if (AuthProvider && AuthProvider->GetClass()->ImplementsInterface(UKBVEWebAuthProvider::StaticClass()))
	{
		FKBVEWebAuthTokenDelegate Cb;
		Cb.BindDynamic(this, &AKBVEWebTerminalActor::HandleResolvedToken);
		IKBVEWebAuthProvider::Execute_ResolveToken(AuthProvider, Cb);
		return;
	}

	if (AuthToken.IsEmpty())
	{
		Surface->LoadURL(InitialURL);
	}
	else
	{
		Surface->LoadURLWithFragmentToken(InitialURL, AuthToken);
	}
}

void AKBVEWebTerminalActor::HandleResolvedToken(const FString& Token)
{
	if (!Surface)
	{
		return;
	}
	if (Token.IsEmpty())
	{
		Surface->LoadURL(InitialURL);
	}
	else
	{
		Surface->LoadURLWithFragmentToken(InitialURL, Token);
	}
}
