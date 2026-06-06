#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWebTerminalActor.generated.h"

class UKBVEWebSurfaceComponent;
class UStaticMeshComponent;
class UObject;

/**
 * Drop-in interactive terminal. Bundles a backing static mesh frame, a flat
 * web surface, and the configuration any consumer needs. Designed to be the
 * one-actor entry point for chuckrpg and other downstream Unreal projects.
 */
UCLASS(BlueprintType, Blueprintable, DisplayName = "KBVE Web Terminal")
class KBVEWEBSURFACE_API AKBVEWebTerminalActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWebTerminalActor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UStaticMeshComponent> Frame;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE")
	TObjectPtr<UKBVEWebSurfaceComponent> Surface;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Terminal")
	FString InitialURL;

	/** Optional static token. Ignored when AuthProvider is set. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Terminal|Auth")
	FString AuthToken;

	/**
	 * UObject implementing IKBVEWebAuthProvider. When set the actor calls
	 * ResolveToken on BeginPlay and uses the resolved token for the initial load.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Terminal|Auth", meta = (MustImplement = "/Script/KBVEWebSurface.KBVEWebAuthProvider"))
	TObjectPtr<UObject> AuthProvider;

protected:
	virtual void BeginPlay() override;

	UFUNCTION()
	void HandleResolvedToken(const FString& Token);
};
