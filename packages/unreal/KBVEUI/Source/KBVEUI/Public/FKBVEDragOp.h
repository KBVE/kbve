#pragma once

#include "CoreMinimal.h"
#include "Input/DragAndDrop.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

// Generic drag-drop payload used by KBVEUI slot widgets. Caller stuffs an
// opaque int32 source identifier (slot index, hotbar position, etc.) plus
// a FName domain tag so drop targets can reject cross-domain drops cheaply.
class KBVEUI_API FKBVEDragOp : public FDragDropOperation
{
public:
	DRAG_DROP_OPERATOR_TYPE(FKBVEDragOp, FDragDropOperation)

	FName Domain;
	int32 SourceIndex = INDEX_NONE;
	int32 SourcePayloadKey = 0;

	static TSharedRef<FKBVEDragOp> New(FName InDomain, int32 InSourceIndex, int32 InPayloadKey);
};
