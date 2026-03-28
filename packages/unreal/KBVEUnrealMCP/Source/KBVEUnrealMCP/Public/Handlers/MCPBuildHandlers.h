#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPBuildHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
