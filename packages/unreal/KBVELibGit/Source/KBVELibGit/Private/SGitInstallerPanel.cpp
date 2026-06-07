#include "SGitInstallerPanel.h"
#include "KBVEPluginLock.h"
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
	SetCanTick(false);
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
				SNew(SHorizontalBox)

				+ SHorizontalBox::Slot()
				.AutoWidth()
				.Padding(0, 0, 5, 0)
				[
					SNew(SButton)
					.Text(LOCTEXT("CheckUpdatesBtn", "Check for Updates"))
					.OnClicked(this, &SGitInstallerPanel::OnCheckForUpdatesClicked)
				]

				+ SHorizontalBox::Slot()
				.AutoWidth()
				[
					SNew(SButton)
					.Text(LOCTEXT("WriteLockBtn", "Write Lock"))
					.ToolTipText(LOCTEXT("WriteLockTip", "Pin installed plugin versions to unreal-plugins.lock.json"))
					.OnClicked(this, &SGitInstallerPanel::OnWriteLockClicked)
				]
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

	FKBVEPluginLockFile Lock;
	if (FKBVEPluginLock::Load(Lock))
	{
		FKBVEPluginRegistry::ApplyLockStatus(Defaults, Lock);
	}

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

	// Lockfile annotation
	if (Entry->bInLock)
	{
		if (Entry->bInstalled && !Entry->bMatchesLock)
		{
			VersionLabel += FString::Printf(TEXT("  [locked v%s — drift]"), *Entry->LockedVersion);
			StatusColor = FLinearColor::Red;
		}
		else
		{
			VersionLabel += FString::Printf(TEXT("  [locked v%s]"), *Entry->LockedVersion);
		}
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
	TWeakPtr<SGitInstallerPanel> WeakPanel = SharedThis(this);
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
				.OnClicked_Lambda([WeakPanel, CapturedEntry]() -> FReply
				{
					TSharedPtr<SGitInstallerPanel> Panel = WeakPanel.Pin();
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

	TWeakPtr<SGitInstallerPanel> WeakPanel = SharedThis(this);
	FString CapturedStagingPath = RegistryStagingPath;

	Async(EAsyncExecution::Thread, [WeakPanel, CapturedStagingPath]()
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

		AsyncTask(ENamedThreads::GameThread, [WeakPanel, CapturedStagingPath, Result]()
		{
			TSharedPtr<SGitInstallerPanel> Panel = WeakPanel.Pin();
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

			FKBVEPluginLockFile Lock;
			if (FKBVEPluginLock::Load(Lock))
			{
				FKBVEPluginRegistry::ApplyLockStatus(Updated, Lock);
			}

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

		FString HeadRef, HeadSha;
		FGitRepoService::GetRepoStatus(RegistryStagingPath, HeadRef, HeadSha);
		PinToLock(Entry->Name, Entry->RemoteVersion, HeadSha);

		RegistryListView->RequestListRefresh();

		SetStatus(FString::Printf(
			TEXT("Installed %s v%s and pinned to lockfile. Restart the editor to load it."),
			*Entry->Name, *Entry->RemoteVersion), FColor::Green);
	}
	else
	{
		SetStatus(FString::Printf(TEXT("Failed to install %s — check output log."), *Entry->Name), FColor::Red);
	}
}

// ─────────────────────────────────────────────────────────
// Lockfile
// ─────────────────────────────────────────────────────────

void SGitInstallerPanel::PinToLock(const FString& Name, const FString& Version, const FString& Ref)
{
	FKBVEPluginLockFile Lock;
	FKBVEPluginLock::Load(Lock);

	if (Lock.Registry.IsEmpty())
	{
		Lock.Registry = FKBVEPluginRegistry::RegistryRepoUrl;
	}

	FKBVEPluginLockEntry Entry;
	Entry.Name = Name;
	Entry.Version = Version;
	Entry.Resolution = FKBVEPluginLock::ResolutionSource;
	Entry.Ref = Ref;
	Entry.Integrity = Ref;
	FKBVEPluginLock::UpsertEntry(Lock, Entry);

	FKBVEPluginLock::Save(Lock);

	for (const TSharedPtr<FKBVEPluginEntry>& E : RegistryEntries)
	{
		if (E->Name == Name)
		{
			E->bInLock = true;
			E->LockedVersion = Version;
			E->bMatchesLock = E->bInstalled && E->LocalVersion == Version;
		}
	}
}

FReply SGitInstallerPanel::OnWriteLockClicked()
{
	FKBVEPluginLockFile Lock;
	FKBVEPluginLock::Load(Lock);

	if (Lock.Registry.IsEmpty())
	{
		Lock.Registry = FKBVEPluginRegistry::RegistryRepoUrl;
	}

	FString HeadRef, HeadSha;
	const bool bHaveStaging = !RegistryStagingPath.IsEmpty() && IFileManager::Get().DirectoryExists(*RegistryStagingPath);
	if (bHaveStaging)
	{
		FGitRepoService::GetRepoStatus(RegistryStagingPath, HeadRef, HeadSha);
	}

	int32 PinCount = 0;
	for (const TSharedPtr<FKBVEPluginEntry>& E : RegistryEntries)
	{
		if (!E->bInstalled || E->LocalVersion.IsEmpty())
		{
			continue;
		}

		FKBVEPluginLockEntry Entry;
		Entry.Name = E->Name;
		Entry.Version = E->LocalVersion;
		Entry.Resolution = FKBVEPluginLock::ResolutionSource;

		// Keep an existing ref/integrity unless we have a fresh registry SHA
		if (const FKBVEPluginLockEntry* Existing = FKBVEPluginLock::FindEntry(Lock, E->Name))
		{
			Entry.Ref = Existing->Ref;
			Entry.Integrity = Existing->Integrity;
		}
		if (!HeadSha.IsEmpty())
		{
			Entry.Ref = HeadSha;
			Entry.Integrity = HeadSha;
		}

		FKBVEPluginLock::UpsertEntry(Lock, Entry);
		E->bInLock = true;
		E->LockedVersion = E->LocalVersion;
		E->bMatchesLock = true;
		PinCount++;
	}

	if (PinCount == 0)
	{
		SetStatus(TEXT("No installed plugins to lock."), FColor::Yellow);
		return FReply::Handled();
	}

	if (FKBVEPluginLock::Save(Lock))
	{
		if (RegistryListView.IsValid())
		{
			RegistryListView->RequestListRefresh();
		}
		SetStatus(FString::Printf(TEXT("Wrote lockfile with %d pinned plugin(s)."), PinCount), FColor::Green);
	}
	else
	{
		SetStatus(TEXT("Failed to write lockfile — check the output log."), FColor::Red);
	}

	return FReply::Handled();
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

	TWeakPtr<SGitInstallerPanel> WeakPanel = SharedThis(this);
	FString CapturedStagingPath = CustomStagingPath;

	Async(EAsyncExecution::Thread, [WeakPanel, RepoUrl, CapturedStagingPath, Branch]()
	{
		FGitRepoService::FGitResult CloneResult = FGitRepoService::CloneRepo(RepoUrl, CapturedStagingPath, Branch);

		AsyncTask(ENamedThreads::GameThread, [WeakPanel, CloneResult, CapturedStagingPath]()
		{
			TSharedPtr<SGitInstallerPanel> Panel = WeakPanel.Pin();
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
