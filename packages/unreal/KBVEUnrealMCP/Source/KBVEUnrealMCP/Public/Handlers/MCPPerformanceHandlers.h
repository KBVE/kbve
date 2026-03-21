#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPPerformanceHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleGetStats(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleProfileGpu(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetMemoryInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
