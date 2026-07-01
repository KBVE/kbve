#include "SimgridInterpolator.h"

void FSimgridInterpolator::Push(const FSimgridSnapshot& Snap)
{
	Snapshots.Add(Snap);
	while (Snapshots.Num() > MAX_SNAPSHOTS)
	{
		Snapshots.RemoveAt(0);
	}
}

const FSimgridEntityDelta* FSimgridInterpolator::FindEntity(const FSimgridSnapshot& Snap, uint32 Eid)
{
	for (const FSimgridEntityDelta& E : Snap.Entities)
	{
		if (E.Eid == Eid)
		{
			return &E;
		}
	}
	return nullptr;
}

void FSimgridInterpolator::Fill(FSimgridInterpState& Out, const FSimgridEntityDelta& E)
{
	Out.Eid = E.Eid;
	Out.WorldXY = FSimgridCoords::QuantToWorldXY(E.Qx, E.Qy);
	Out.Z = E.Z;
	Out.VelXY = FSimgridCoords::QuantVelToWorldXY(E.Qvx, E.Qvy);
	Out.Facing = E.Facing;
	Out.Kind = E.Kind;
	Out.Owner = E.Owner;
	Out.MaxHp = E.MaxHp;
}

const TArray<FSimgridEntityDelta>& FSimgridInterpolator::LatestEntities() const
{
	static const TArray<FSimgridEntityDelta> Empty;
	return Snapshots.Num() > 0 ? Snapshots.Last().Entities : Empty;
}

uint32 FSimgridInterpolator::LatestServerTimeMs() const
{
	return Snapshots.Num() > 0 ? Snapshots.Last().ServerTimeMs : 0;
}

bool FSimgridInterpolator::SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpState& Out) const
{
	if (Snapshots.Num() == 0)
	{
		return false;
	}

	if (Snapshots.Num() == 1)
	{
		const FSimgridEntityDelta* Only = FindEntity(Snapshots[0], Eid);
		if (!Only)
		{
			return false;
		}
		Fill(Out, *Only);
		return true;
	}

	int32 NewerIdx = INDEX_NONE;
	for (int32 i = 1; i < Snapshots.Num(); ++i)
	{
		if ((double)Snapshots[i].ServerTimeMs >= RenderTimeMs)
		{
			NewerIdx = i;
			break;
		}
	}

	if (RenderTimeMs <= (double)Snapshots[0].ServerTimeMs)
	{
		const FSimgridEntityDelta* E = FindEntity(Snapshots[0], Eid);
		if (!E) { return false; }
		Fill(Out, *E);
		return true;
	}

	if (NewerIdx == INDEX_NONE)
	{
		const FSimgridEntityDelta* E = FindEntity(Snapshots.Last(), Eid);
		if (!E) { return false; }
		Fill(Out, *E);
		return true;
	}

	const FSimgridSnapshot& A = Snapshots[NewerIdx - 1];
	const FSimgridSnapshot& B = Snapshots[NewerIdx];
	const FSimgridEntityDelta* Ea = FindEntity(A, Eid);
	const FSimgridEntityDelta* Eb = FindEntity(B, Eid);

	if (!Ea && !Eb) { return false; }
	if (!Ea) { Fill(Out, *Eb); return true; }
	if (!Eb) { Fill(Out, *Ea); return true; }

	const double Span = (double)B.ServerTimeMs - (double)A.ServerTimeMs;
	const double T = Span > 0.0 ? FMath::Clamp((RenderTimeMs - (double)A.ServerTimeMs) / Span, 0.0, 1.0) : 1.0;

	FSimgridInterpState Sa; Fill(Sa, *Ea);
	FSimgridInterpState Sb; Fill(Sb, *Eb);

	Out.Eid = Eid;
	Out.WorldXY = FMath::Lerp(Sa.WorldXY, Sb.WorldXY, T);
	Out.Z = FMath::RoundToInt(FMath::Lerp((double)Sa.Z, (double)Sb.Z, T));
	Out.VelXY = Sb.VelXY;
	Out.Facing = Eb->Facing;
	Out.Kind = Eb->Kind;
	Out.Owner = Eb->Owner;
	Out.MaxHp = Eb->MaxHp;
	return true;
}
