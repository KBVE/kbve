#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

THIRD_PARTY_INCLUDES_START
#include "yyjson.h"
THIRD_PARTY_INCLUDES_END

class FKBVEYYJsonModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};
