#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class SEditableTextBox;
class STextBlock;
class SScrollBox;
template <typename OptionType> class SComboBox;

class UEDEVOPSEDITOR_API SUEDevOpsPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SUEDevOpsPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	static const TArray<FString>& GetArtCategories();
	static void ScaffoldArtCategories();

private:
	FReply HandleImportPickClicked();
	FReply HandleImportRunClicked();
	FReply HandleFlushTelemetryClicked();
	FReply HandleGitHubIssueClicked();

	void   AppendLog(const FString& Line);
	void   RefreshDestFromCategory();
	void   OnCategoryChanged(TSharedPtr<FString> NewCategory, ESelectInfo::Type SelectInfo);

	TSharedPtr<SEditableTextBox> SourceInput;
	TSharedPtr<SEditableTextBox> DestInput;
	TSharedPtr<SEditableTextBox> MaterialInput;
	TSharedPtr<SEditableTextBox> ScaleInput;
	TSharedPtr<SScrollBox>       LogScroll;

	TArray<TSharedPtr<FString>>            CategoryOptions;
	TSharedPtr<FString>                    SelectedCategory;
	TSharedPtr<SComboBox<TSharedPtr<FString>>> CategoryCombo;

	TArray<TSharedPtr<STextBlock>> LogLines;
};
