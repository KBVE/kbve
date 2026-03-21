#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPWidgetHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
