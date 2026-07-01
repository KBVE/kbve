#include "SimgridEphemeral.h"
#include "SimgridPostcard.h"

FSimgridCombat FEphemeralCodec::DecodeCombat(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridCombat C;
	C.Attacker = R.VarU32();
	C.Target = R.VarU32();
	C.bHasTargetRef = R.Option();
	if (C.bHasTargetRef)
	{
		C.TargetRef = R.String();
	}
	C.Dmg = R.VarI32();
	C.bCrit = R.Bool();
	C.bDied = R.Bool();
	return C;
}

FSimgridPickup FEphemeralCodec::DecodePickup(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridPickup P;
	P.ItemRef = R.String();
	P.Count = R.VarU32();
	return P;
}

FSimgridItemUsed FEphemeralCodec::DecodeItemUsed(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridItemUsed U;
	U.ItemRef = R.String();
	U.Heal = R.VarI32();
	return U;
}

FSimgridStatus FEphemeralCodec::DecodeStatus(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridStatus S;
	S.Kind = R.U8();
	S.Magnitude = R.VarI32();
	S.Remaining = R.VarU32();
	return S;
}
