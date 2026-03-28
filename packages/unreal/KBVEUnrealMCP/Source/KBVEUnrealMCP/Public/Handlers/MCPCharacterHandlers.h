#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPCharacterHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
