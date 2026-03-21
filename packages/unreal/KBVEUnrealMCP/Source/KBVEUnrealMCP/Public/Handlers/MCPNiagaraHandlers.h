#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPNiagaraHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);
};
