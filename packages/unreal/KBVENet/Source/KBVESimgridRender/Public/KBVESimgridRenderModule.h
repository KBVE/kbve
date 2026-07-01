#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

KBVESIMGRIDRENDER_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVESimgridRender, Log, All);

class FKBVESimgridRenderModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
