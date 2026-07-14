#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "Logging/LogMacros.h"

KBVESUPABASE_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVESupabase, Log, All);

class FKBVESupabaseModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
