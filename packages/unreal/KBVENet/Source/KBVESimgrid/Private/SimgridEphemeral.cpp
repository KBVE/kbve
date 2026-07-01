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

static FSimgridTile ReadTile(FPostcardReader& R)
{
	FSimgridTile T;
	T.X = R.VarI32();
	T.Y = R.VarI32();
	return T;
}

FSimgridProjectile FEphemeralCodec::DecodeProjectile(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridProjectile P;
	P.Attacker = R.VarU32();
	P.From = ReadTile(R);
	P.To = ReadTile(R);
	P.Kind = R.String();
	P.bHit = R.Bool();
	return P;
}

FSimgridEquipped FEphemeralCodec::DecodeEquipped(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridEquipped E;
	E.bHasItemRef = R.Option();
	if (E.bHasItemRef)
	{
		E.ItemRef = R.String();
	}
	E.Slot = R.String();
	E.Attack = R.VarI32();
	E.Defense = R.VarI32();
	return E;
}

FSimgridStats FEphemeralCodec::DecodeStats(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridStats S;
	S.Level = R.VarI32();
	S.Xp = R.VarI32();
	S.XpNext = R.VarI32();
	S.MaxHp = R.VarI32();
	S.Attack = R.VarI32();
	S.Kills = R.VarU32();
	S.Mp = R.VarI32();
	S.MaxMp = R.VarI32();
	return S;
}

FSimgridInventory FEphemeralCodec::DecodeInventory(const TArray<uint8>& Payload)
{
	FPostcardReader R(Payload);
	FSimgridInventory Inv;
	const int32 N = R.SeqLen();
	for (int32 i = 0; i < N; ++i)
	{
		FSimgridInvItem Item;
		Item.Id = R.String();
		Item.ItemRef = R.String();
		Item.Count = R.VarU32();
		Inv.Items.Add(Item);
	}
	return Inv;
}
