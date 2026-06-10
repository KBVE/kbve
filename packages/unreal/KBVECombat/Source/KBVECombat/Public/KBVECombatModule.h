#pragma once

#include "Modules/ModuleManager.h"

class FKBVECombatModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
