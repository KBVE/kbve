#pragma once

#include "Modules/ModuleManager.h"

class FKBVEMoverModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
