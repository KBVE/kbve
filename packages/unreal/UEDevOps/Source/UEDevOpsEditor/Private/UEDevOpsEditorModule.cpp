#include "UEDevOpsEditorModule.h"
#include "ToolMenus.h"
#include "Editor.h"
#include "Engine/GameInstance.h"
#include "HAL/IConsoleManager.h"
#include "UEDevOpsGitHubService.h"
#include "UEDevOpsImportLibrary.h"
#include "UEDevOpsTelemetrySubsystem.h"

#define LOCTEXT_NAMESPACE "FUEDevOpsEditorModule"

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

void FUEDevOpsEditorModule::StartupModule()
{
	UToolMenus::RegisterStartupCallback(
		FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FUEDevOpsEditorModule::RegisterMenus));
}

void FUEDevOpsEditorModule::ShutdownModule()
{
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
		"FlushTelemetry",
		LOCTEXT("FlushTelemetry", "Flush Telemetry Now"),
		LOCTEXT("FlushTelemetryTooltip", "Immediately POST all queued telemetry events"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]()
		{
			if (GEditor && GEditor->GetPIEWorldContext())
			{
				if (UWorld* PIEWorld = GEditor->GetPIEWorldContext()->World())
				{
					if (UGameInstance* GI = PIEWorld->GetGameInstance())
					{
						if (auto* Sub = GI->GetSubsystem<UUEDevOpsTelemetrySubsystem>())
						{
							Sub->FlushEvents();
						}
					}
				}
			}
		}))
	);

	Section.AddMenuEntry(
		"CreateGitHubIssue",
		LOCTEXT("CreateGitHubIssue", "Create GitHub Issue..."),
		LOCTEXT("CreateGitHubIssueTooltip", "Open a dialog to file a GitHub issue from the editor"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]()
		{
			UUEDevOpsGitHubService::OpenCreateIssueDialog();
		}))
	);

	Section.AddMenuEntry(
		"ImportRawFolder",
		LOCTEXT("ImportRawFolder", "Import Raw Asset Folder..."),
		LOCTEXT("ImportRawFolderTooltip", "Pick a filesystem folder of FBX + textures; auto-imports, classifies by suffix, builds a PBR material, assigns it to the mesh"),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateLambda([]()
		{
			FUEDevOpsImportLibrary::PromptAndImport();
		}))
	);
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FUEDevOpsEditorModule, UEDevOpsEditor)
