// Copyright Epic Games, Inc. All Rights Reserved.

#include "chuck.h"

#include "Modules/ModuleManager.h"
#include "UI/ChuckUIStyle.h"

class FChuckModule : public FDefaultGameModuleImpl
{
public:
	virtual void StartupModule() override
	{
		FChuckUIStyle::Initialize();
	}

	virtual void ShutdownModule() override
	{
		FChuckUIStyle::Shutdown();
	}
};

IMPLEMENT_PRIMARY_GAME_MODULE(FChuckModule, chuck, "chuck");

DEFINE_LOG_CATEGORY(Logchuck)
