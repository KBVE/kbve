#pragma once

#include "CoreMinimal.h"
#include "SimgridProto.h"
#include "SimgridCoords.h"

struct KBVESIMGRIDRENDER_API FSimgridInterpState
{
	uint32 Eid = 0;
	FVector2D WorldXY = FVector2D::ZeroVector;
	int32 Z = 0;
	FVector2D VelXY = FVector2D::ZeroVector;
	uint8 Facing = 0;
	uint16 Kind = 0;
	uint16 Owner = 0;
};

class KBVESIMGRIDRENDER_API FSimgridInterpolator
{
public:
	static constexpr double INTERP_DELAY_MS = 100.0;
	static constexpr int32 MAX_SNAPSHOTS = 8;

	void Push(const FSimgridSnapshot& Snap);
	bool SampleEntity(uint32 Eid, double RenderTimeMs, FSimgridInterpState& Out) const;

	const TArray<FSimgridEntityDelta>& LatestEntities() const;
	uint32 LatestServerTimeMs() const;
	bool HasData() const { return Snapshots.Num() > 0; }

private:
	TArray<FSimgridSnapshot> Snapshots;

	static const FSimgridEntityDelta* FindEntity(const FSimgridSnapshot& Snap, uint32 Eid);
	static void Fill(FSimgridInterpState& Out, const FSimgridEntityDelta& E);
};
