#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class STextBlock;
class SProgressBar;

class KBVEUI_API SKBVELoadingPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVELoadingPanel)
		: _InitialMessage(NSLOCTEXT("SKBVELoadingPanel", "DefaultMessage", "Loading..."))
		, _UnitLabel(TEXT(""))
	{}
		SLATE_ARGUMENT(FText, InitialMessage)
		SLATE_ARGUMENT(FString, UnitLabel)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetProgress(int32 Completed, int32 Total);
	void SetMessage(const FString& Msg);

private:
	FString UnitLabel;
	TSharedPtr<STextBlock>   StatusText;
	TSharedPtr<STextBlock>   CountText;
	TSharedPtr<SProgressBar> Bar;
};
