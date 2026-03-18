#include "UEDevOpsEditorModule.h"
#include "ToolMenus.h"
#include "Editor.h"
#include "Engine/GameInstance.h"
#include "UEDevOpsGitHubService.h"
#include "UEDevOpsTelemetrySubsystem.h"

#define LOCTEXT_NAMESPACE "FUEDevOpsEditorModule"

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

	UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Tools");
	FToolMenuSection& Section = Menu->FindOrAddSection("UEDevOps");
	Section.Label = LOCTEXT("UEDevOpsSection", "UEDevOps");

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
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FUEDevOpsEditorModule, UEDevOpsEditor)
