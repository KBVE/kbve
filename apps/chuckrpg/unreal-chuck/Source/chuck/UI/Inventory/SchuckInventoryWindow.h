#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"

class AchuckCoreCharacter;
class SKBVEMovableFrame;

class SchuckInventoryWindow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckInventoryWindow) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	TWeakObjectPtr<AchuckCoreCharacter> Character;
	FSimpleDelegate OnClose;
	TSharedPtr<int32> SelectedKey;
	TSharedPtr<SKBVEMovableFrame> MovableFrame;
};
