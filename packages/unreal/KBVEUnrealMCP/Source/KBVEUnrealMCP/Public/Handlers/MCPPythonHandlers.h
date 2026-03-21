#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPPythonHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleExecute(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleEvaluate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
