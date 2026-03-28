#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Views/SListView.h"
#include "GitRepoService.h"
#include "GitPluginValidator.h"
#include "KBVEPluginRegistry.h"

/**
 * Editor Slate panel for managing KBVE plugins and installing custom repos.
 * Two sections:
 *   1. KBVE Registry — known plugins with install/update/check status
 *   2. Custom Repository — manual URL input for arbitrary repos
 */
class SGitInstallerPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGitInstallerPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	// ── Registry section ──

	/** The list of known KBVE plugins */
	TArray<TSharedPtr<FKBVEPluginEntry>> RegistryEntries;

	/** ListView for the registry */
	TSharedPtr<SListView<TSharedPtr<FKBVEPluginEntry>>> RegistryListView;

	/** Path where the monorepo is cloned for version checks */
	FString RegistryStagingPath;

	/** Whether a registry refresh is in progress */
	bool bRefreshing = false;

	/** Generate a row for the registry list */
	TSharedRef<ITableRow> OnGenerateRegistryRow(
		TSharedPtr<FKBVEPluginEntry> Entry,
		const TSharedRef<STableViewBase>& OwnerTable);

	/** Refresh button — clones/fetches the monorepo and reads remote versions */
	FReply OnCheckForUpdatesClicked();

	/** Install a specific plugin from the registry */
	void OnInstallRegistryPlugin(TSharedPtr<FKBVEPluginEntry> Entry);

	/** Update a specific plugin from the registry */
	void OnUpdateRegistryPlugin(TSharedPtr<FKBVEPluginEntry> Entry);

	// ── Custom repo section ──

	TSharedPtr<SEditableTextBox> RepoUrlInput;
	TSharedPtr<SEditableTextBox> BranchInput;
	TSharedPtr<SButton> CloneButton;
	TSharedPtr<SButton> InstallButton;

	FGitPluginValidator::FValidationResult LastValidation;
	FString CustomStagingPath;

	FReply OnCloneClicked();
	FReply OnInstallClicked();
	void RunCloneAsync(const FString& RepoUrl, const FString& Branch);

	// ── Shared ──

	TSharedPtr<STextBlock> StatusText;
	void SetStatus(const FString& Message, const FColor& Color = FColor::White);

	/** Populate the registry list with default entries and check local status */
	void InitializeRegistry();

	/** Install a plugin from the cloned monorepo staging path */
	void InstallPluginFromMonorepo(TSharedPtr<FKBVEPluginEntry> Entry);
};
