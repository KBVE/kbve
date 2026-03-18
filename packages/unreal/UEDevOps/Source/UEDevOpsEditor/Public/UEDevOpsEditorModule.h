#pragma once

#include "Modules/ModuleManager.h"

class FUEDevOpsEditorModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	void RegisterMenus();
};
