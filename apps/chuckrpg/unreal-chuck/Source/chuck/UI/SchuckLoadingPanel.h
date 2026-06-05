#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

class STextBlock;
class SProgressBar;

class SchuckLoadingPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckLoadingPanel) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetProgress(int32 Completed, int32 Total);
	void SetMessage(const FString& Msg);

private:
	TSharedPtr<STextBlock>   StatusText;
	TSharedPtr<STextBlock>   CountText;
	TSharedPtr<SProgressBar> Bar;
};
