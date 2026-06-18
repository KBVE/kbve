#pragma once

#include "Modules/ModuleManager.h"

class FKBVEAgonesModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
