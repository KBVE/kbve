#include "FKBVEDragOp.h"

TSharedRef<FKBVEDragOp> FKBVEDragOp::New(FName InDomain, int32 InSourceIndex, int32 InPayloadKey)
{
	TSharedRef<FKBVEDragOp> Op = MakeShareable(new FKBVEDragOp());
	Op->Domain           = InDomain;
	Op->SourceIndex      = InSourceIndex;
	Op->SourcePayloadKey = InPayloadKey;
	Op->Construct();
	return Op;
}
