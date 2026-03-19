#include "SGitInstallerPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Layout/SSpacer.h"
#include "Async/Async.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"

#define LOCTEXT_NAMESPACE "SGitInstallerPanel"

void SGitInstallerPanel::Construct(const FArguments& InArgs)
{
	ChildSlot
	[
		SNew(SScrollBox)
		+ SScrollBox::Slot()
		.Padding(10.0f)
		[
			SNew(SVerticalBox)

			// ── Header ──
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 10)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("Header", "GitHub Plugin Installer"))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 16))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SNew(SSeparator)
			]

			// ── Repo URL ──
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 5, 0, 2)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("RepoUrlLabel", "Repository URL (HTTPS)"))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SAssignNew(RepoUrlInput, SEditableTextBox)
				.HintText(LOCTEXT("RepoUrlHint", "https://github.com/owner/repo"))
			]

			// ── Branch / Tag ──
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 5, 0, 2)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("BranchLabel", "Branch / Tag / SHA (optional)"))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 10)
			[
				SAssignNew(BranchInput, SEditableTextBox)
				.HintText(LOCTEXT("BranchHint", "main"))
			]

			// ── Buttons ──
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SNew(SHorizontalBox)

				+ SHorizontalBox::Slot()
				.AutoWidth()
				.Padding(0, 0, 5, 0)
				[
					SAssignNew(CloneButton, SButton)
					.Text(LOCTEXT("CloneBtn", "Clone & Validate"))
					.OnClicked(this, &SGitInstallerPanel::OnCloneClicked)
				]

				+ SHorizontalBox::Slot()
				.AutoWidth()
				[
					SAssignNew(InstallButton, SButton)
					.Text(LOCTEXT("InstallBtn", "Install to Project"))
					.OnClicked(this, &SGitInstallerPanel::OnInstallClicked)
					.IsEnabled(false)
				]
			]

			// ── Status ──
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 10, 0, 0)
			[
				SAssignNew(StatusText, STextBlock)
				.Text(LOCTEXT("StatusReady", "Ready."))
				.AutoWrapText(true)
			]
		]
	];
}

void SGitInstallerPanel::SetStatus(const FString& Message, const FColor& Color)
{
	if (StatusText.IsValid())
	{
		StatusText->SetText(FText::FromString(Message));
		StatusText->SetColorAndOpacity(FSlateColor(Color));
	}
}

FReply SGitInstallerPanel::OnCloneClicked()
{
	FString RepoUrl = RepoUrlInput->GetText().ToString().TrimStartAndEnd();
	FString Branch = BranchInput->GetText().ToString().TrimStartAndEnd();

	if (RepoUrl.IsEmpty())
	{
		SetStatus(TEXT("Please enter a repository URL."), FColor::Yellow);
		return FReply::Handled();
	}

	// Disable button during operation
	CloneButton->SetEnabled(false);
	InstallButton->SetEnabled(false);
	SetStatus(TEXT("Cloning repository..."), FColor::White);

	RunCloneAsync(RepoUrl, Branch);

	return FReply::Handled();
}

void SGitInstallerPanel::RunCloneAsync(const FString& RepoUrl, const FString& Branch)
{
	// Generate staging path
	FString RepoName = FPaths::GetBaseFilename(RepoUrl);
	if (RepoName.EndsWith(TEXT(".git")))
	{
		RepoName = RepoName.LeftChop(4);
	}
	StagingPath = FPaths::Combine(FPaths::ProjectIntermediateDir(), TEXT("GitStaging"), RepoName);

	// Clean previous staging
	if (IFileManager::Get().DirectoryExists(*StagingPath))
	{
		IFileManager::Get().DeleteDirectory(*StagingPath, false, true);
	}

	// Capture for lambda
	TWeakPtr<SGitInstallerPanel> WeakThis = SharedThis(this);
	FString CapturedStagingPath = StagingPath;

	Async(EAsyncExecution::Thread, [WeakThis, RepoUrl, CapturedStagingPath, Branch]()
	{
		// Clone
		FGitRepoService::FGitResult CloneResult = FGitRepoService::CloneRepo(RepoUrl, CapturedStagingPath, Branch);

		// Back to game thread for UI updates
		AsyncTask(ENamedThreads::GameThread, [WeakThis, CloneResult, CapturedStagingPath]()
		{
			TSharedPtr<SGitInstallerPanel> Panel = WeakThis.Pin();
			if (!Panel.IsValid())
			{
				return;
			}

			Panel->CloneButton->SetEnabled(true);

			if (!CloneResult.bSuccess)
			{
				Panel->SetStatus(FString::Printf(TEXT("Clone failed: %s"), *CloneResult.ErrorMessage), FColor::Red);
				return;
			}

			// Validate
			FGitPluginValidator::FValidationResult Validation = FGitPluginValidator::Validate(CapturedStagingPath);
			Panel->LastValidation = Validation;

			if (!Validation.bIsValid)
			{
				Panel->SetStatus(FString::Printf(TEXT("Validation failed: %s"), *Validation.ErrorMessage), FColor::Red);
				return;
			}

			FString StatusMsg = FString::Printf(TEXT("Cloned and validated: %s v%s\nPath: %s"),
				*Validation.PluginName, *Validation.VersionName, *Validation.UpluginPath);

			for (const FString& Warning : Validation.Warnings)
			{
				StatusMsg += FString::Printf(TEXT("\nWarning: %s"), *Warning);
			}

			Panel->SetStatus(StatusMsg, FColor::Green);
			Panel->InstallButton->SetEnabled(true);
		});
	});
}

FReply SGitInstallerPanel::OnInstallClicked()
{
	if (!LastValidation.bIsValid || StagingPath.IsEmpty())
	{
		SetStatus(TEXT("No valid plugin to install. Clone first."), FColor::Yellow);
		return FReply::Handled();
	}

	bool bInstalled = FGitPluginValidator::InstallToProject(StagingPath, LastValidation.PluginName);

	if (bInstalled)
	{
		SetStatus(FString::Printf(
			TEXT("Installed %s to Plugins/. Restart the editor to load it."),
			*LastValidation.PluginName), FColor::Green);
		InstallButton->SetEnabled(false);
	}
	else
	{
		SetStatus(TEXT("Install failed — check the output log for details."), FColor::Red);
	}

	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
