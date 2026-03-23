#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPPlacementHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandlePlaceInGrid(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandlePlaceInCircle(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleScatterInArea(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandlePlaceAlongSpline(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	static AActor* SpawnActorByType(UWorld* World, const FString& ActorType, const FVector& Location, const FRotator& Rotation);
};
