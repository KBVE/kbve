#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPAnimationHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleCreateAnimBP(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetSequence(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddNotify(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetTracks(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
