#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPVolumeHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
