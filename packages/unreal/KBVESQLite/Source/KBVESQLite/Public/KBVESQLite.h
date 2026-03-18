#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

THIRD_PARTY_INCLUDES_START
#include "sqlite3.h"
THIRD_PARTY_INCLUDES_END

class FKBVESQLiteModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};
