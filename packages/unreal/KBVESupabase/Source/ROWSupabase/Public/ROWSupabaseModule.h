#pragma once

#include "Modules/ModuleManager.h"

class FROWSupabaseModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
