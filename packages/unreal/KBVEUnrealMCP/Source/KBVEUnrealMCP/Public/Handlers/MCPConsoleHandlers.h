#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPConsoleHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleExecute(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetLog(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
