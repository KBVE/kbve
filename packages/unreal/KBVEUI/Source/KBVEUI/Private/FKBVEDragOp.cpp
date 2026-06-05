#include "FKBVEDragOp.h"

TSharedRef<FKBVEDragOp> FKBVEDragOp::New(FName InDomain, int32 InSourceIndex, int32 InPayloadKey, TSharedPtr<SWidget> InDecorator, TSharedPtr<SWidget> InSourceWidget)
{
	TSharedRef<FKBVEDragOp> Op = MakeShareable(new FKBVEDragOp());
	Op->Domain            = InDomain;
	Op->SourceIndex       = InSourceIndex;
	Op->SourcePayloadKey  = InPayloadKey;
	Op->DecoratorOverride = InDecorator;
	Op->SourceWidget      = InSourceWidget;
	Op->Construct();
	return Op;
}
