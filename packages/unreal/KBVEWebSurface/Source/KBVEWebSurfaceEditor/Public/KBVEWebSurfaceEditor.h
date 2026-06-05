#pragma once

#include "Modules/ModuleManager.h"

class FKBVEWebSurfaceEditorModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
