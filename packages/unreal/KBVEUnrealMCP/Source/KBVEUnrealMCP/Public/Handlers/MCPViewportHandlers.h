#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPViewportHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleGetCamera(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetCamera(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleTakeScreenshot(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleFocusActor(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
