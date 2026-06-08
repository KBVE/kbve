#include "UEDevOpsEditorModule.h"

#include "Editor.h"
#include "Engine/GameInstance.h"
#include "Framework/Docking/TabManager.h"
#include "HAL/IConsoleManager.h"
#include "Misc/Paths.h"
#include "SUEDevOpsPanel.h"
#include "ToolMenus.h"
#include "UEDevOpsGitHubService.h"
#include "UEDevOpsImportLibrary.h"
#include "UEDevOpsTelemetrySubsystem.h"
#include "Widgets/Docking/SDockTab.h"

#define LOCTEXT_NAMESPACE "FUEDevOpsEditorModule"

static const FName UEDevOpsPanelTabName("UEDevOpsPanel");

static TSharedRef<SDockTab> SpawnUEDevOpsPanelTab(const FSpawnTabArgs& Args)
{
	return SNew(SDockTab)
		.TabRole(NomadTab)
		.Label(LOCTEXT("PanelTabTitle", "DevOps Panel"))
		[
			SNew(SUEDevOpsPanel)
		];
}

static FAutoConsoleCommand GUEDevOpsImportRawCmd(
	TEXT("UEDevOps.ImportRaw"),
	TEXT("UEDevOps.ImportRaw <SourceFolder> <DestContentPath> [MaterialName]\n"
	     "Runs the Python raw asset importer on a filesystem folder."),
	FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args)
	{
		if (Args.Num() < 2)
		{
			UE_LOG(LogTemp, Warning, TEXT("[UEDevOps] Usage: UEDevOps.ImportRaw <SourceFolder> <DestContentPath> [MaterialName]"));
			return;
		}
		const FString MaterialName = Args.Num() >= 3 ? Args[2] : FString();
		FUEDevOpsImportLibrary::ImportRawAssetFolder(Args[0], Args[1], MaterialName);
	})
);

static FAutoConsoleCommand GUEDevOpsImportPickCmd(
	TEXT("UEDevOps.ImportPick"),
	TEXT("Open a directory picker and import the chosen Raw folder into /Game/Imported/<name>."),
	FConsoleCommandDelegate::CreateLambda([]()
	{
		FUEDevOpsImportLibrary::PromptAndImport();
	})
);

static FAutoConsoleCommand GUEDevOpsPanelCmd(
	TEXT("UEDevOps.Panel"),
	TEXT("Open the UEDevOps panel tab."),
	FConsoleCommandDelegate::CreateLambda([]()
	{
		FGlobalTabmanager::Get()->TryInvokeTab(UEDevOpsPanelTabName);
	})
);

static FAutoConsoleCommand GUEDevOpsImportArcadeCmd(
	TEXT("UEDevOps.ImportArcade"),
	TEXT("One-shot: import an arcade cabinet prop from Raw/Props/Arcade with all canonical paths."),
	FConsoleCommandDelegate::CreateLambda([]()
	{
		const FString Source = FPaths::ConvertRelativePathToFull(
			FPaths::ProjectDir() / TEXT("Raw/Props/Arcade"));
		const FString Dest   = TEXT("/Game/Art/Furniture/Arcade");
		const FString MatName = TEXT("Arcade");
		const float Scale     = 1.0f;
		const bool bOk = FUEDevOpsImportLibrary::ImportRawAssetFolder(Source, Dest, MatName, Scale);
		UE_LOG(LogTemp, Display, TEXT("[UEDevOps] ImportArcade %s -> %s [M_%s] scale=%.2f result=%s"),
			*Source, *Dest, *MatName, Scale, bOk ? TEXT("ok") : TEXT("FAIL"));
	})
);

void FUEDevOpsEditorModule::StartupModule()
{
	FGlobalTabmanager::Get()->RegisterNomadTabSpawner(
		UEDevOpsPanelTabName,
		FOnSpawnTab::CreateStatic(&SpawnUEDevOpsPanelTab))
		.SetDisplayName(LOCTEXT("PanelDisplayName", "DevOps Panel"))
		.SetTooltipText(LOCTEXT("PanelTooltip", "Asset import, telemetry, GitHub — all under one panel"));

	UToolMenus::RegisterStartupCallback(
		FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FUEDevOpsEditorModule::RegisterMenus));
}

void FUEDevOpsEditorModule::ShutdownModule()
{
	FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(UEDevOpsPanelTabName);
	UToolMenus::UnRegisterStartupCallback(this);
	UToolMenus::UnregisterOwner(this);
}

void FUEDevOpsEditorModule::RegisterMenus()
{
	FToolMenuOwnerScoped OwnerScoped(this);

	UToolMenu* MenuBar = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu");
	MenuBar->AddSubMenu(
		"MainMenu",
		NAME_None,
		"KBVE",
		LOCTEXT("KBVEMenu", "KBVE"),
		LOCTEXT("KBVEMenuTooltip", "KBVE Tools and Plugin Management")
	);

	UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.KBVE");
	FToolMenuSection& Section = Menu->FindOrAddSection("DevOps");
	Section.Label = LOCTEXT("UEDevOpsSection", "DevOps");

	Section.AddMenuEntry(
		"OpenDevOpsPanel",
		LOCTEXT("DevOpsPanelEntry", "DevOps Panel"),
		LOCTEXT("DevOpsPanelEntryTooltip", "Open the DevOps panel — import, telemetry, GitHub"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]()
		{
			FGlobalTabmanager::Get()->TryInvokeTab(UEDevOpsPanelTabName);
		}))
	);
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FUEDevOpsEditorModule, UEDevOpsEditor)
