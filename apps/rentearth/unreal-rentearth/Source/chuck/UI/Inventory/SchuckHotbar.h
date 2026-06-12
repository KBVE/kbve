#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class AchuckCoreCharacter;

class SchuckHotbar : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckHotbar) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	void SetExpanded(bool bInExpanded);

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	void Build();

	TWeakObjectPtr<AchuckCoreCharacter> Character;
	bool  bExpanded     = false;
	float CurrentScale  = 1.f;
	float TargetScale   = 1.f;
};
