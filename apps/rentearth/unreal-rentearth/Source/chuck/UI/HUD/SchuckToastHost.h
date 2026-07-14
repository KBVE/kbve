#pragma once

#include "CoreMinimal.h"
#include "KBVEEvents.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class AchuckCoreCharacter;
class SKBVEToastLayer;

class SchuckToastHost : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckToastHost) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual ~SchuckToastHost() override;

private:
	void BindToEventBus();

	TWeakObjectPtr<AchuckCoreCharacter> Character;
	TSharedPtr<SKBVEToastLayer> ToastLayer;

	FKBVEEventHandle ItemConsumedHandle;
	FKBVEEventHandle AuthStatusHandle;
	FKBVEEventHandle AuthErrorHandle;
	FKBVEEventHandle ToastHandle;
};
