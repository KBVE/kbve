#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWebTerminalActor.generated.h"

class UKBVEWebSurfaceComponent;
class UStaticMeshComponent;

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

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Terminal")
	FString AuthToken;

protected:
	virtual void BeginPlay() override;
};
