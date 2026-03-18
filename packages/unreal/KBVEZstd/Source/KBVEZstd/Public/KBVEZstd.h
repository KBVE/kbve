#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

THIRD_PARTY_INCLUDES_START
#include "zstd.h"
THIRD_PARTY_INCLUDES_END

class FKBVEZstdModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};
