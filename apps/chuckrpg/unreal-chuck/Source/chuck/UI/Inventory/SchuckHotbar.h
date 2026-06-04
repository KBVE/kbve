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

private:
	TWeakObjectPtr<AchuckCoreCharacter> Character;
};
