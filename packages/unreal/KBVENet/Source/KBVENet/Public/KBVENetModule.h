#pragma once

#include "Modules/ModuleManager.h"

class FKBVENetModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
