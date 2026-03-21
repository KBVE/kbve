#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPNetworkHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
