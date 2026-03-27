#include "KBVELibGit.h"
#include "SGitInstallerPanel.h"
#include "Widgets/Docking/SDockTab.h"
#include "Framework/Docking/TabManager.h"
#include "ToolMenus.h"

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

	// Register top-level "KBVE" menu after ToolMenus is ready
	UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(
		this, &FKBVELibGitModule::RegisterMenus));

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Module started — libgit2 initialized, editor tab registered"));
}

void FKBVELibGitModule::RegisterMenus()
{
	// Get the main menu bar
	UToolMenu* MenuBar = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu");

	// Add a top-level "KBVE" menu
	FToolMenuOwnerScoped OwnerScoped(this);
	UToolMenu* KBVEMenu = MenuBar->AddSubMenu(
		"MainMenu",
		NAME_None,
		"KBVE",
		LOCTEXT("KBVEMenu", "KBVE"),
		LOCTEXT("KBVEMenuTooltip", "KBVE Tools and Plugin Management")
	);

	// Add "Git Plugin Installer" entry
	FToolMenuSection& Section = KBVEMenu->AddSection("PluginManagement",
		LOCTEXT("PluginManagementSection", "Plugin Management"));

	Section.AddMenuEntry(
		"GitPluginInstaller",
		LOCTEXT("GitInstallerEntry", "Git Plugin Installer"),
		LOCTEXT("GitInstallerEntryTooltip", "Clone and install public GitHub repos as Unreal plugins"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]()
		{
			FGlobalTabmanager::Get()->TryInvokeTab(GitInstallerTabName);
		}))
	);
}

void FKBVELibGitModule::ShutdownModule()
{
	UToolMenus::UnregisterOwner(this);
	FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(GitInstallerTabName);
	git_libgit2_shutdown();

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Module shut down"));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVELibGitModule, KBVELibGit)
