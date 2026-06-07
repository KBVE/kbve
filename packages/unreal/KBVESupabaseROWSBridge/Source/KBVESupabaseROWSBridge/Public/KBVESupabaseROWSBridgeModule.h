#pragma once

#include "Modules/ModuleManager.h"

class FKBVESupabaseROWSBridgeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
