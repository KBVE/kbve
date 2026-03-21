#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPInputHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
