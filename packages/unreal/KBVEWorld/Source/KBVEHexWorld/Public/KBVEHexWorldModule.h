#pragma once

#include "Modules/ModuleManager.h"

class FKBVEHexWorldModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
