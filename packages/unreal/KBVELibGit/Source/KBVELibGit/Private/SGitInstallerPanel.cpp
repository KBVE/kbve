#include "SGitInstallerPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Views/STableRow.h"
#include "Async/Async.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformFileManager.h"

#define LOCTEXT_NAMESPACE "SGitInstallerPanel"

// ─────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────

void SGitInstallerPanel::Construct(const FArguments& InArgs)
{
	InitializeRegistry();

	ChildSlot
	[
		SNew(SScrollBox)
		+ SScrollBox::Slot()
		.Padding(10.0f)
		[
			SNew(SVerticalBox)

			// ══════════════════════════════════════════════
			// KBVE Plugin Registry
			// ══════════════════════════════════════════════
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("RegistryHeader", "KBVE Plugin Registry"))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 16))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("RegistrySubheader", "Plugins from github.com/kbve/kbve"))
				.ColorAndOpacity(FSlateColor(FLinearColor::Gray))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 8)
			[
				SNew(SButton)
				.Text(LOCTEXT("CheckUpdatesBtn", "Check for Updates"))
				.OnClicked(this, &SGitInstallerPanel::OnCheckForUpdatesClicked)
			]

			// Registry list
			+ SVerticalBox::Slot()
			.AutoHeight()
			.MaxHeight(350.0f)
			.Padding(0, 0, 0, 10)
			[
				SAssignNew(RegistryListView, SListView<TSharedPtr<FKBVEPluginEntry>>)
				.ListItemsSource(&RegistryEntries)
				.OnGenerateRow(this, &SGitInstallerPanel::OnGenerateRegistryRow)
				.SelectionMode(ESelectionMode::None)
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 5, 0, 10)
			[
				SNew(SSeparator)
			]

			// ══════════════════════════════════════════════
			// Custom Repository
			// ══════════════════════════════════════════════
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 5)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("CustomHeader", "Custom Repository"))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 14))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 2)
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

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 2)
			[
				SNew(STextBlock)
				.Text(LOCTEXT("BranchLabel", "Branch / Tag / SHA (optional)"))
			]

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 8)
			[
				SAssignNew(BranchInput, SEditableTextBox)
				.HintText(LOCTEXT("BranchHint", "main"))
			]

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

			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 5, 0, 10)
			[
				SNew(SSeparator)
			]

			// ══════════════════════════════════════════════
			// Status bar
			// ══════════════════════════════════════════════
			+ SVerticalBox::Slot()
			.AutoHeight()
			.Padding(0, 0, 0, 0)
			[
				SAssignNew(StatusText, STextBlock)
				.Text(LOCTEXT("StatusReady", "Ready."))
				.AutoWrapText(true)
			]
		]
	];
}

// ─────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────

void SGitInstallerPanel::InitializeRegistry()
{
	TArray<FKBVEPluginEntry> Defaults = FKBVEPluginRegistry::GetDefaultEntries();
	FKBVEPluginRegistry::CheckLocalInstallStatus(Defaults);

	RegistryEntries.Empty();
	for (FKBVEPluginEntry& E : Defaults)
	{
		RegistryEntries.Add(MakeShared<FKBVEPluginEntry>(MoveTemp(E)));
	}
}

TSharedRef<ITableRow> SGitInstallerPanel::OnGenerateRegistryRow(
	TSharedPtr<FKBVEPluginEntry> Entry,
	const TSharedRef<STableViewBase>& OwnerTable)
{
	// Determine status text and color
	FString VersionLabel;
	FLinearColor StatusColor;

	if (Entry->bInstalled)
	{
		if (Entry->bUpdateAvailable)
		{
			VersionLabel = FString::Printf(TEXT("v%s -> v%s"), *Entry->LocalVersion, *Entry->RemoteVersion);
			StatusColor = FLinearColor(1.0f, 0.7f, 0.0f); // orange
		}
		else if (!Entry->RemoteVersion.IsEmpty())
		{
			VersionLabel = FString::Printf(TEXT("v%s (up to date)"), *Entry->LocalVersion);
			StatusColor = FLinearColor::Green;
		}
		else
		{
			VersionLabel = FString::Printf(TEXT("v%s (installed)"), *Entry->LocalVersion);
			StatusColor = FLinearColor(0.6f, 0.8f, 1.0f); // light blue
		}
	}
	else
	{
		if (!Entry->RemoteVersion.IsEmpty())
		{
			VersionLabel = FString::Printf(TEXT("v%s available"), *Entry->RemoteVersion);
		}
		else
		{
			VersionLabel = TEXT("not installed");
		}
		StatusColor = FLinearColor::Gray;
	}

	// Action button
	FText ButtonText;
	bool bButtonEnabled = false;

	if (Entry->bInstalled && Entry->bUpdateAvailable)
	{
		ButtonText = LOCTEXT("UpdateBtn", "Update");
		bButtonEnabled = true;
	}
	else if (!Entry->bInstalled && !Entry->RemoteVersion.IsEmpty())
	{
		ButtonText = LOCTEXT("InstallRegBtn", "Install");
		bButtonEnabled = true;
	}
	else if (!Entry->bInstalled)
	{
		ButtonText = LOCTEXT("InstallRegBtnDisabled", "Install");
		bButtonEnabled = false; // need to check for updates first
	}
	else
	{
		ButtonText = LOCTEXT("InstalledBtn", "Installed");
		bButtonEnabled = false;
	}

	// Capture for lambda
	TWeakPtr<SGitInstallerPanel> WeakThis = SharedThis(this);
	TSharedPtr<FKBVEPluginEntry> CapturedEntry = Entry;

	return SNew(STableRow<TSharedPtr<FKBVEPluginEntry>>, OwnerTable)
		.Padding(FMargin(4, 2))
		[
			SNew(SHorizontalBox)

			// Plugin name
			+ SHorizontalBox::Slot()
			.FillWidth(0.25f)
			.VAlign(VAlign_Center)
			.Padding(4, 0)
			[
				SNew(STextBlock)
				.Text(FText::FromString(Entry->Name))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 10))
			]

			// Description
			+ SHorizontalBox::Slot()
			.FillWidth(0.35f)
			.VAlign(VAlign_Center)
			.Padding(4, 0)
			[
				SNew(STextBlock)
				.Text(FText::FromString(Entry->Description))
				.ColorAndOpacity(FSlateColor(FLinearColor::Gray))
			]

			// Version / status
			+ SHorizontalBox::Slot()
			.FillWidth(0.25f)
			.VAlign(VAlign_Center)
			.Padding(4, 0)
			[
				SNew(STextBlock)
				.Text(FText::FromString(VersionLabel))
				.ColorAndOpacity(FSlateColor(StatusColor))
			]

			// Action button
			+ SHorizontalBox::Slot()
			.FillWidth(0.15f)
			.VAlign(VAlign_Center)
			.Padding(4, 0)
			[
				SNew(SButton)
				.Text(ButtonText)
				.IsEnabled(bButtonEnabled)
				.OnClicked_Lambda([WeakThis, CapturedEntry]() -> FReply
				{
					TSharedPtr<SGitInstallerPanel> Panel = WeakThis.Pin();
					if (Panel.IsValid())
					{
						if (CapturedEntry->bInstalled && CapturedEntry->bUpdateAvailable)
						{
							Panel->OnUpdateRegistryPlugin(CapturedEntry);
						}
						else
						{
							Panel->OnInstallRegistryPlugin(CapturedEntry);
						}
					}
					return FReply::Handled();
				})
			]
		];
}

FReply SGitInstallerPanel::OnCheckForUpdatesClicked()
{
	if (bRefreshing)
	{
		SetStatus(TEXT("Already checking for updates..."), FColor::Yellow);
		return FReply::Handled();
	}

	bRefreshing = true;
	SetStatus(TEXT("Cloning KBVE registry to check versions..."), FColor::White);

	RegistryStagingPath = FPaths::Combine(
		FPaths::ProjectIntermediateDir(), TEXT("GitStaging"), TEXT("_kbve_registry"));

	TWeakPtr<SGitInstallerPanel> WeakThis = SharedThis(this);
	FString CapturedStagingPath = RegistryStagingPath;

	Async(EAsyncExecution::Thread, [WeakThis, CapturedStagingPath]()
	{
		FGitRepoService::FGitResult Result;

		if (IFileManager::Get().DirectoryExists(*CapturedStagingPath))
		{
			// Already cloned — just fetch latest
			Result = FGitRepoService::FetchRepo(CapturedStagingPath);
			if (Result.bSuccess)
			{
				Result = FGitRepoService::CheckoutRef(CapturedStagingPath, FKBVEPluginRegistry::DefaultBranch);
			}
		}
		else
		{
			// Fresh clone
			Result = FGitRepoService::CloneRepo(
				FKBVEPluginRegistry::RegistryRepoUrl,
				CapturedStagingPath,
				FKBVEPluginRegistry::DefaultBranch);
		}

		AsyncTask(ENamedThreads::GameThread, [WeakThis, CapturedStagingPath, Result]()
		{
			TSharedPtr<SGitInstallerPanel> Panel = WeakThis.Pin();
			if (!Panel.IsValid())
			{
				return;
			}

			Panel->bRefreshing = false;

			if (!Result.bSuccess)
			{
				Panel->SetStatus(
					FString::Printf(TEXT("Registry fetch failed: %s"), *Result.ErrorMessage),
					FColor::Red);
				return;
			}

			// Re-check local install status
			TArray<FKBVEPluginEntry> Updated = FKBVEPluginRegistry::GetDefaultEntries();
			FKBVEPluginRegistry::CheckLocalInstallStatus(Updated);
			FKBVEPluginRegistry::ReadRemoteVersions(Updated, CapturedStagingPath);

			Panel->RegistryEntries.Empty();
			for (FKBVEPluginEntry& E : Updated)
			{
				Panel->RegistryEntries.Add(MakeShared<FKBVEPluginEntry>(MoveTemp(E)));
			}
			Panel->RegistryListView->RequestListRefresh();

			// Count updates available
			int32 UpdateCount = 0;
			int32 InstalledCount = 0;
			for (const auto& E : Panel->RegistryEntries)
			{
				if (E->bInstalled) InstalledCount++;
				if (E->bUpdateAvailable) UpdateCount++;
			}

			FString Msg = FString::Printf(TEXT("Registry refreshed. %d installed, %d update(s) available."),
				InstalledCount, UpdateCount);
			Panel->SetStatus(Msg, UpdateCount > 0 ? FColor::Orange : FColor::Green);
		});
	});

	return FReply::Handled();
}

void SGitInstallerPanel::OnInstallRegistryPlugin(TSharedPtr<FKBVEPluginEntry> Entry)
{
	if (RegistryStagingPath.IsEmpty() || !IFileManager::Get().DirectoryExists(*RegistryStagingPath))
	{
		SetStatus(TEXT("Click 'Check for Updates' first to fetch the registry."), FColor::Yellow);
		return;
	}

	InstallPluginFromMonorepo(Entry);
}

void SGitInstallerPanel::OnUpdateRegistryPlugin(TSharedPtr<FKBVEPluginEntry> Entry)
{
	if (RegistryStagingPath.IsEmpty() || !IFileManager::Get().DirectoryExists(*RegistryStagingPath))
	{
		SetStatus(TEXT("Click 'Check for Updates' first to fetch the registry."), FColor::Yellow);
		return;
	}

	// For updates, remove the old version first then reinstall
	FString DestDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Plugins"), Entry->Name);
	if (IFileManager::Get().DirectoryExists(*DestDir))
	{
		IFileManager::Get().DeleteDirectory(*DestDir, false, true);
	}

	InstallPluginFromMonorepo(Entry);
}

void SGitInstallerPanel::InstallPluginFromMonorepo(TSharedPtr<FKBVEPluginEntry> Entry)
{
	FString SourceDir = FPaths::Combine(
		RegistryStagingPath,
		FKBVEPluginRegistry::PluginsSubPath,
		Entry->Name);

	FString DestDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Plugins"), Entry->Name);

	if (!IFileManager::Get().DirectoryExists(*SourceDir))
	{
		SetStatus(FString::Printf(TEXT("Plugin source not found: %s"), *SourceDir), FColor::Red);
		return;
	}

	bool bCopied = FPlatformFileManager::Get().GetPlatformFile().CopyDirectoryTree(*DestDir, *SourceDir, true);

	if (bCopied)
	{
		Entry->bInstalled = true;
		Entry->LocalVersion = Entry->RemoteVersion;
		Entry->bUpdateAvailable = false;
		RegistryListView->RequestListRefresh();

		SetStatus(FString::Printf(
			TEXT("Installed %s v%s. Restart the editor to load it."),
			*Entry->Name, *Entry->RemoteVersion), FColor::Green);
	}
	else
	{
		SetStatus(FString::Printf(TEXT("Failed to install %s — check output log."), *Entry->Name), FColor::Red);
	}
}

// ─────────────────────────────────────────────────────────
// Custom Repo (unchanged logic)
// ─────────────────────────────────────────────────────────

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

	CloneButton->SetEnabled(false);
	InstallButton->SetEnabled(false);
	SetStatus(TEXT("Cloning repository..."), FColor::White);

	RunCloneAsync(RepoUrl, Branch);

	return FReply::Handled();
}

void SGitInstallerPanel::RunCloneAsync(const FString& RepoUrl, const FString& Branch)
{
	FString RepoName = FPaths::GetBaseFilename(RepoUrl);
	if (RepoName.EndsWith(TEXT(".git")))
	{
		RepoName = RepoName.LeftChop(4);
	}
	CustomStagingPath = FPaths::Combine(FPaths::ProjectIntermediateDir(), TEXT("GitStaging"), RepoName);

	if (IFileManager::Get().DirectoryExists(*CustomStagingPath))
	{
		IFileManager::Get().DeleteDirectory(*CustomStagingPath, false, true);
	}

	TWeakPtr<SGitInstallerPanel> WeakThis = SharedThis(this);
	FString CapturedStagingPath = CustomStagingPath;

	Async(EAsyncExecution::Thread, [WeakThis, RepoUrl, CapturedStagingPath, Branch]()
	{
		FGitRepoService::FGitResult CloneResult = FGitRepoService::CloneRepo(RepoUrl, CapturedStagingPath, Branch);

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

			FGitPluginValidator::FValidationResult Validation = FGitPluginValidator::Validate(CapturedStagingPath);
			Panel->LastValidation = Validation;

			if (!Validation.bIsValid)
			{
				Panel->SetStatus(FString::Printf(TEXT("Validation failed: %s"), *Validation.ErrorMessage), FColor::Red);
				return;
			}

			FString StatusMsg = FString::Printf(TEXT("Cloned and validated: %s v%s"),
				*Validation.PluginName, *Validation.VersionName);

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
	if (!LastValidation.bIsValid || CustomStagingPath.IsEmpty())
	{
		SetStatus(TEXT("No valid plugin to install. Clone first."), FColor::Yellow);
		return FReply::Handled();
	}

	bool bInstalled = FGitPluginValidator::InstallToProject(CustomStagingPath, LastValidation.PluginName);

	if (bInstalled)
	{
		SetStatus(FString::Printf(
			TEXT("Installed %s to Plugins/. Restart the editor to load it."),
			*LastValidation.PluginName), FColor::Green);
		InstallButton->SetEnabled(false);

		// Refresh registry in case this was a known plugin
		InitializeRegistry();
		if (RegistryListView.IsValid())
		{
			RegistryListView->RequestListRefresh();
		}
	}
	else
	{
		SetStatus(TEXT("Install failed — check the output log for details."), FColor::Red);
	}

	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
