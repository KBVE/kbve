#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPContextHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
