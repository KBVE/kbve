#pragma once

#include "Modules/ModuleManager.h"

class FKBVEPerfModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
