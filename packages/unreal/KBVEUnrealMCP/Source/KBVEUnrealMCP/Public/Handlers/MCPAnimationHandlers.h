#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPAnimationHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleGetTracks(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
