#pragma once

#include "CoreMinimal.h"
#include "Input/DragAndDrop.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class KBVEUI_API FKBVEDragOp : public FDragDropOperation
{
public:
	DRAG_DROP_OPERATOR_TYPE(FKBVEDragOp, FDragDropOperation)

	FName Domain;
	int32 SourceIndex = INDEX_NONE;
	int32 SourcePayloadKey = 0;
	TFunction<void()> OnEnded;
	TFunction<void(const FVector2D& /*ScreenPos*/)> OnDroppedOutside;
	TWeakPtr<SWidget> SourceWidget;
	TWeakPtr<SWidget> HoverWidget;
	bool  bDropHandled = false;
	FVector2D LastScreenPos = FVector2D::ZeroVector;

	virtual ~FKBVEDragOp() override
	{
		if (!bDropHandled && OnDroppedOutside) OnDroppedOutside(LastScreenPos);
		if (OnEnded) OnEnded();
	}

	virtual void OnDragged(const FDragDropEvent& Event) override
	{
		FDragDropOperation::OnDragged(Event);
		LastScreenPos = Event.GetScreenSpacePosition();
	}

	static TSharedRef<FKBVEDragOp> New(FName InDomain, int32 InSourceIndex, int32 InPayloadKey, TSharedPtr<SWidget> InDecorator = nullptr, TSharedPtr<SWidget> InSourceWidget = nullptr);

	virtual TSharedPtr<SWidget> GetDefaultDecorator() const override { return DecoratorOverride; }

private:
	TSharedPtr<SWidget> DecoratorOverride;
};
