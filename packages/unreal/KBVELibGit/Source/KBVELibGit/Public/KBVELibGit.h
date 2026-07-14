#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "Containers/Ticker.h"

THIRD_PARTY_INCLUDES_START
#include "git2.h"
THIRD_PARTY_INCLUDES_END

class FKBVELibGitModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

	static inline FKBVELibGitModule& Get()
	{
		return FModuleManager::LoadModuleChecked<FKBVELibGitModule>("KBVELibGit");
	}

	static inline bool IsAvailable()
	{
		return FModuleManager::Get().IsModuleLoaded("KBVELibGit");
	}

private:
	/** Registers the top-level KBVE menu in the editor menu bar */
	void RegisterMenus();

	/** One-shot ticker: warns (log + editor toast) if installed plugins drift from the lockfile */
	bool CheckLockDriftOnStartup(float DeltaTime);

	FTSTicker::FDelegateHandle LockDriftTickHandle;
};
