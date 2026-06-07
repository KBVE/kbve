#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class SEditableTextBox;
class STextBlock;
class SScrollBox;

class UEDEVOPSEDITOR_API SUEDevOpsPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SUEDevOpsPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleImportPickClicked();
	FReply HandleImportRunClicked();
	FReply HandleFlushTelemetryClicked();
	FReply HandleGitHubIssueClicked();

	void   AppendLog(const FString& Line);

	TSharedPtr<SEditableTextBox> SourceInput;
	TSharedPtr<SEditableTextBox> DestInput;
	TSharedPtr<SEditableTextBox> MaterialInput;
	TSharedPtr<SScrollBox>       LogScroll;

	TArray<TSharedPtr<STextBlock>> LogLines;
};
