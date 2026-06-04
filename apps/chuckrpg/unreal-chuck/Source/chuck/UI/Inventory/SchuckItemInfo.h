#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateColor.h"

class AchuckCoreCharacter;

class SchuckItemInfo : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckItemInfo) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AchuckCoreCharacter>, OwningCharacter)
		SLATE_ARGUMENT(TSharedPtr<int32>, SelectedKey)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	const struct FchuckItemDef* GetDef() const;
	class UchuckItemDB* GetDB() const;

	bool         HasContent() const;
	FText        GetTitle()    const;
	FText        GetSubtitle() const;
	FText        GetDetail()   const;
	FText        GetBody()     const;
	FSlateColor  GetTitleColor() const;
	void         PaintIcon(const FGeometry& Geom, FSlateWindowElementList& Out, int32 Layer, const FVector2D& IconSize);

	TWeakObjectPtr<AchuckCoreCharacter> Character;
	TSharedPtr<int32> SelectedKey;
};
