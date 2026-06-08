#pragma once

#include "Modules/ModuleManager.h"

class FKBVEPostViewExtension;

class FKBVEPostShaderModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	TSharedPtr<FKBVEPostViewExtension, ESPMode::ThreadSafe> ViewExtension;
};
