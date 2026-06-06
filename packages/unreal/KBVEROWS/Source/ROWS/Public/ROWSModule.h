#pragma once

#include "Modules/ModuleManager.h"

class FROWSModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
