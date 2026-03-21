#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPPhysicsHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleSetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleEnableSimulation(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddConstraint(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
