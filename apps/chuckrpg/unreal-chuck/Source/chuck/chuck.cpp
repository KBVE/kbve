// Copyright Epic Games, Inc. All Rights Reserved.

#include "chuck.h"

#include "Modules/ModuleManager.h"
#include "UI/ChuckUIStyle.h"

#if WITH_EDITOR
#include "Editor.h"
#endif

class FChuckModule : public FDefaultGameModuleImpl
{
public:
	virtual void StartupModule() override
	{
		FChuckUIStyle::Initialize();
#if WITH_EDITOR
		EndPieHandle = FEditorDelegates::EndPIE.AddLambda([](const bool)
		{
			if (GEngine)
			{
				GEngine->ForceGarbageCollection(true);
			}
		});
#endif
	}

	virtual void ShutdownModule() override
	{
		FChuckUIStyle::Shutdown();
#if WITH_EDITOR
		FEditorDelegates::EndPIE.Remove(EndPieHandle);
#endif
	}

#if WITH_EDITOR
private:
	FDelegateHandle EndPieHandle;
#endif
};

IMPLEMENT_PRIMARY_GAME_MODULE(FChuckModule, chuck, "chuck");

DEFINE_LOG_CATEGORY(Logchuck)
