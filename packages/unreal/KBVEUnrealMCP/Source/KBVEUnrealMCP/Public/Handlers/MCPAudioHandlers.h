#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPAudioHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
