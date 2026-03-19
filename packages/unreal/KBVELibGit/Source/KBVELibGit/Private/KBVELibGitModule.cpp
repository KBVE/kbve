#include "KBVELibGit.h"
#include "SGitInstallerPanel.h"
#include "Widgets/Docking/SDockTab.h"
#include "Framework/Docking/TabManager.h"

#define LOCTEXT_NAMESPACE "FKBVELibGitModule"

static const FName GitInstallerTabName("KBVEGitInstaller");

static TSharedRef<SDockTab> SpawnGitInstallerTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab)
		.TabRole(NomadTab)
		.Label(LOCTEXT("TabTitle", "Git Plugin Installer"))
		[
			SNew(SGitInstallerPanel)
		];
}

void FKBVELibGitModule::StartupModule()
{
	git_libgit2_init();

	FGlobalTabmanager::Get()->RegisterNomadTabSpawner(
		GitInstallerTabName,
		FOnSpawnTab::CreateStatic(&SpawnGitInstallerTab))
		.SetDisplayName(LOCTEXT("TabDisplayName", "Git Plugin Installer"))
		.SetTooltipText(LOCTEXT("TabTooltip", "Clone and install public GitHub repos as Unreal plugins"));

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Module started — libgit2 initialized, editor tab registered"));
}

void FKBVELibGitModule::ShutdownModule()
{
	FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(GitInstallerTabName);
	git_libgit2_shutdown();

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Module shut down"));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVELibGitModule, KBVELibGit)
