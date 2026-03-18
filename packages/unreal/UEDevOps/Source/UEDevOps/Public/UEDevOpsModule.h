#pragma once

#include "Modules/ModuleManager.h"

class FUEDevOpsModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
