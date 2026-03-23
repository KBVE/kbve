#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPFoliageHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandlePaint(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRemove(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
