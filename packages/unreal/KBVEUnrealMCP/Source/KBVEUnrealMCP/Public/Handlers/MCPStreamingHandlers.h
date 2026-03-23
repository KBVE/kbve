#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPStreamingHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleListLevels(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleLoadLevel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleUnloadLevel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetVisibility(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
