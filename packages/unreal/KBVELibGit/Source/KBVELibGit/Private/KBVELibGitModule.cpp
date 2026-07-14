#include "KBVELibGit.h"
#include "SGitInstallerPanel.h"
#include "KBVEPluginRegistry.h"
#include "Widgets/Docking/SDockTab.h"
#include "Framework/Docking/TabManager.h"
#include "Framework/Notifications/NotificationManager.h"
#include "Widgets/Notifications/SNotificationList.h"
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

	// Deferred so Slate is ready for the notification toast
	LockDriftTickHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateRaw(this, &FKBVELibGitModule::CheckLockDriftOnStartup), 2.0f);

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

bool FKBVELibGitModule::CheckLockDriftOnStartup(float /*DeltaTime*/)
{
	TArray<FString> Drift = FKBVEPluginRegistry::GetLockDrift();
	if (Drift.Num() > 0)
	{
		const FString Joined = FString::Join(Drift, TEXT("\n  • "));
		UE_LOG(LogTemp, Warning, TEXT("[KBVELibGit] Plugin lockfile drift (%d):\n  • %s"), Drift.Num(), *Joined);

		FNotificationInfo Info(FText::FromString(FString::Printf(
			TEXT("KBVE plugins out of date with lockfile (%d). Open KBVE > Git Plugin Installer to sync."),
			Drift.Num())));
		Info.ExpireDuration = 10.0f;
		Info.bFireAndForget = true;
		FSlateNotificationManager::Get().AddNotification(Info);
	}

	return false; // one-shot
}

void FKBVELibGitModule::ShutdownModule()
{
	if (LockDriftTickHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(LockDriftTickHandle);
		LockDriftTickHandle.Reset();
	}

	UToolMenus::UnregisterOwner(this);
	FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(GitInstallerTabName);
	git_libgit2_shutdown();

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Module shut down"));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVELibGitModule, KBVELibGit)
