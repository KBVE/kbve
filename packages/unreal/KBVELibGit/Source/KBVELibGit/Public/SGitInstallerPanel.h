#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "GitRepoService.h"
#include "GitPluginValidator.h"

/**
 * Editor Slate panel for cloning/installing public GitHub repos as UE plugins.
 * Registered as an editor tab via FKBVELibGitModule.
 */
class SGitInstallerPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SGitInstallerPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	/** URL input box */
	TSharedPtr<SEditableTextBox> RepoUrlInput;

	/** Branch/tag input box */
	TSharedPtr<SEditableTextBox> BranchInput;

	/** Status text shown to the user */
	TSharedPtr<STextBlock> StatusText;

	/** Clone button */
	TSharedPtr<SButton> CloneButton;

	/** Install button (visible after successful clone + validation) */
	TSharedPtr<SButton> InstallButton;

	/** Cached validation result after clone */
	FGitPluginValidator::FValidationResult LastValidation;

	/** Staging directory for the current clone */
	FString StagingPath;

	// -- Handlers --
	FReply OnCloneClicked();
	FReply OnInstallClicked();

	void SetStatus(const FString& Message, const FColor& Color = FColor::White);
	void RunCloneAsync(const FString& RepoUrl, const FString& Branch);
};
