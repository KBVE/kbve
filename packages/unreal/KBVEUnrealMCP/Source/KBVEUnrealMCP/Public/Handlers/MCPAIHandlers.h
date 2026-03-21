#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPAIHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
