#include "KBVEWorldFence.h"

#include "KBVEWorldHeightfield.h"

namespace
{
	// Its own stream, mixed off the world seed rather than taken from it. A run's
	// style and its jitter have to be stable against everything else the seed
	// feeds, or adding a decision anywhere upstream walks every fence in the
	// world -- the failure that is invisible until two builds disagree.
	uint32 FenceHash(int32 Seed, const FIntPoint& Edge, int32 Salt)
	{
		uint32 H = static_cast<uint32>(Seed) ^ 0x9E3779B9u;
		H = (H ^ static_cast<uint32>(Edge.X)) * 0x85EBCA6Bu;
		H = (H ^ static_cast<uint32>(Edge.Y)) * 0xC2B2AE35u;
		H = (H ^ static_cast<uint32>(Salt)) * 0x27D4EB2Fu;
		H ^= H >> 15;
		return H;
	}

	float Unit(uint32 H)
	{
		return static_cast<float>(H & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
	}

	/** Where a distance along the polyline lands, and which way the road runs there. */
	void SampleAt(const TArray<FVector>& Path, const TArray<float>& Along, float Distance,
		FVector& OutPoint, FVector& OutTangent)
	{
		int32 I = 1;
		while (I < Path.Num() - 1 && Along[I] < Distance)
		{
			++I;
		}

		const float Segment = FMath::Max(Along[I] - Along[I - 1], KINDA_SMALL_NUMBER);
		const float Frac = FMath::Clamp((Distance - Along[I - 1]) / Segment, 0.0f, 1.0f);
		OutPoint = FMath::Lerp(Path[I - 1], Path[I], Frac);
		OutTangent = (Path[I] - Path[I - 1]).GetSafeNormal();
	}

	void MeasureAlong(const TArray<FVector>& Path, TArray<float>& OutAlong)
	{
		OutAlong.SetNumUninitialized(Path.Num());
		OutAlong[0] = 0.0f;
		for (int32 I = 1; I < Path.Num(); ++I)
		{
			OutAlong[I] = OutAlong[I - 1] + FVector::Dist2D(Path[I - 1], Path[I]);
		}
	}
}

FVector FKBVEWorldFence::PointAt(const TArray<FVector>& Path, float Distance)
{
	if (Path.Num() == 0)
	{
		return FVector::ZeroVector;
	}
	if (Path.Num() == 1)
	{
		return Path[0];
	}

	TArray<float> Along;
	MeasureAlong(Path, Along);

	FVector Point;
	FVector Tangent;
	SampleAt(Path, Along, Distance, Point, Tangent);
	return Point;
}

void FKBVEWorldFence::FindRuns(const FKBVEWorldFenceParams& Fence, const FKBVEWorldRoadParams& Road,
	int32 Seed, const FIntPoint& Edge, const TArray<FVector>& Path,
	const TArray<FKBVEWorldRoadSpan>& Spans, TArray<FKBVEWorldFenceRun>& OutRuns)
{
	OutRuns.Reset();
	if (Path.Num() < 2 || Fence.Coverage <= 0.0f)
	{
		return;
	}

	TArray<float> Along;
	MeasureAlong(Path, Along);
	const float Total = Along.Last();
	if (Total <= Fence.MinRunLength)
	{
		return;
	}

	// The stretches a crossing owns, as distances. A fence stops at these: the
	// bridge carries its own handrails, and a run marched over one would stand
	// its posts through the deck and into the water underneath.
	TArray<FVector2D> Blocked;
	for (const FKBVEWorldRoadSpan& Span : Spans)
	{
		if (Span.Begin < Along.Num() && Span.End < Along.Num())
		{
			Blocked.Emplace(Along[Span.Begin], Along[Span.End]);
		}
	}

	auto IsBlocked = [&Blocked](float A, float B)
	{
		for (const FVector2D& Span : Blocked)
		{
			if (A < Span.Y && B > Span.X)
			{
				return true;
			}
		}
		return false;
	};

	for (int32 SideIndex = 0; SideIndex < 2; ++SideIndex)
	{
		const float Side = SideIndex == 0 ? -1.0f : 1.0f;

		// Walked rather than sliced, so a run's length is its own and the gap
		// after it is too. Slicing the edge into equal cells and rolling for each
		// gives every fence in the world the same length, which reads as a rule.
		float Cursor = 0.0f;
		int32 Step = 0;

		while (Cursor < Total && Step < 64)
		{
			const uint32 H = FenceHash(Seed, Edge, SideIndex * 977 + Step * 31);
			++Step;

			const float Length = FMath::Lerp(Fence.MinRunLength, Fence.MaxRunLength,
				Unit(FenceHash(Seed, Edge, SideIndex * 977 + Step * 31 + 7)));
			const float End = FMath::Min(Cursor + Length, Total);

			if (Unit(H) < Fence.Coverage && !IsBlocked(Cursor, End)
				&& End - Cursor >= Fence.MinRunLength)
			{
				FKBVEWorldFenceRun& Run = OutRuns.AddDefaulted_GetRef();
				Run.Side = Side;
				Run.Begin = Cursor;
				Run.End = End;
				Run.Seed = static_cast<int32>(H);

				const float StyleRoll = Unit(FenceHash(Seed, Edge,
					SideIndex * 977 + Step * 31 + 13));
				if (StyleRoll < Fence.StoneChance)
				{
					Run.Style = EKBVEWorldFenceStyle::Wall;
				}
				else if (StyleRoll < Fence.StoneChance + Fence.PicketChance)
				{
					Run.Style = EKBVEWorldFenceStyle::Picket;
				}
				else
				{
					Run.Style = EKBVEWorldFenceStyle::PostAndRail;
				}
			}

			Cursor = End + FMath::Lerp(Fence.MinRunLength * 0.5f, Fence.MaxRunLength,
				Unit(FenceHash(Seed, Edge, SideIndex * 977 + Step * 31 + 3)));
		}
	}
}

void FKBVEWorldFence::BuildRun(const FKBVEWorldFenceParams& Fence, const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FKBVEWorldRoadField* Field,
	const TArray<FVector>& Path, const FKBVEWorldFenceRun& Run, EKBVEWorldFenceDetail Detail,
	FKBVEWorldFenceMesh& Out)
{
	if (Path.Num() < 2 || Run.End - Run.Begin < KINDA_SMALL_NUMBER)
	{
		return;
	}

	TArray<float> Along;
	MeasureAlong(Path, Along);

	// The graded surface, the same one the road was levelled onto. A fence set
	// against the raw heightfield would stand beside a road that is no longer
	// where the ground says it is.
	auto GroundAt = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field ? Field->Level(Base, P.X, P.Y) : Base;
	};

	// Where a post stands, given a distance along the edge.
	auto StationAt = [&](float Distance, FVector& OutFoot, FVector& OutTangent)
	{
		FVector Point;
		SampleAt(Path, Along, Distance, Point, OutTangent);
		const FVector Across(OutTangent.Y, -OutTangent.X, 0.0f);
		const FVector At = Point + Across * (Fence.Offset * Run.Side);
		OutFoot = FVector(At.X, At.Y, GroundAt(At));
	};

	const bool bWall = Run.Style == EKBVEWorldFenceStyle::Wall;
	const float Spacing = bWall ? Fence.WallSegmentLength : Fence.PostSpacing;
	const int32 Bays = FMath::Max(FMath::RoundToInt((Run.End - Run.Begin) / Spacing), 1);
	const float Step = (Run.End - Run.Begin) / static_cast<float>(Bays);

	TArray<FKBVEWorldPart>& Parts = bWall ? Out.Stone : Out.Wood;

	// Every station, stood on the ground, before anything is built from them.
	// The line the rails ride is eased across the whole run, so a station cannot
	// know its own height until its neighbours have been sampled too.
	struct FStation
	{
		FVector Foot = FVector::ZeroVector;
		FVector Tangent = FVector::ZeroVector;
		float LineZ = 0.0f;
		bool bDropped = false;
	};

	TArray<FStation> Stations;
	Stations.SetNum(Bays + 1);

	float LastKeptZ = 0.0f;
	bool bHaveKept = false;

	for (int32 I = 0; I <= Bays; ++I)
	{
		FStation& S = Stations[I];
		StationAt(Run.Begin + Step * I, S.Foot, S.Tangent);

		// A run gives up where the ground does. A fence marching straight up a
		// bank reads as a texture laid on the hill rather than as something
		// built, and the rails across a step that steep leave a wedge of daylight
		// no kickboard closes.
		if (bHaveKept && FMath::Abs(S.Foot.Z - LastKeptZ) > Fence.MaxSlope * Step)
		{
			S.bDropped = true;
			bHaveKept = false;
			continue;
		}

		S.LineZ = S.Foot.Z;
		LastKeptZ = S.Foot.Z;
		bHaveKept = true;
	}

	// Eased with its ends pinned, and never across a break: the two sides of a
	// gap are separate runs of fence and averaging one into the other drags a
	// stretch of posts toward ground they do not stand on.
	for (int32 Pass = 0; Pass < Fence.ProfileSmoothPasses; ++Pass)
	{
		TArray<float> Eased;
		Eased.SetNumUninitialized(Stations.Num());
		for (int32 I = 0; I < Stations.Num(); ++I)
		{
			Eased[I] = Stations[I].LineZ;
		}

		for (int32 I = 1; I + 1 < Stations.Num(); ++I)
		{
			if (Stations[I].bDropped || Stations[I - 1].bDropped || Stations[I + 1].bDropped)
			{
				continue;
			}
			Eased[I] = (Stations[I - 1].LineZ + Stations[I].LineZ * 2.0f
				+ Stations[I + 1].LineZ) * 0.25f;
		}

		for (int32 I = 0; I < Stations.Num(); ++I)
		{
			Stations[I].LineZ = Eased[I];
		}
	}

	FVector PrevFoot = FVector::ZeroVector;
	float PrevLineZ = 0.0f;
	bool bHasPrev = false;

	for (int32 I = 0; I <= Bays; ++I)
	{
		const FVector Foot = Stations[I].Foot;
		const FVector Tangent = Stations[I].Tangent;
		const float LineZ = Stations[I].LineZ;

		if (Stations[I].bDropped)
		{
			bHasPrev = false;
			continue;
		}

		// Yaw only. The tangent carries the road's own climb, and a post that
		// inherits it leans by however steeply the road happens to be rising --
		// which across a run reads as a fence that has been sheared rather than
		// built. A post stands up whatever the ground under it is doing.
		const FVector Level(Tangent.X, Tangent.Y, 0.0f);
		const FVector Across(Tangent.Y, -Tangent.X, 0.0f);
		const FQuat Facing = FRotationMatrix::MakeFromXY(Level, Across).ToQuat();

		if (bWall)
		{
			// A wall is its own courses rather than posts with something between
			// them, so it is built from the gap and not from the station.
			if (bHasPrev)
			{
				const FVector A(PrevFoot.X, PrevFoot.Y,
					PrevLineZ + Fence.WallHeight * 0.5f - Fence.PostEmbed);
				const FVector B(Foot.X, Foot.Y,
					LineZ + Fence.WallHeight * 0.5f - Fence.PostEmbed);
				const FVector Dir = (B - A).GetSafeNormal();

				FKBVEWorldPart& Course = Parts.AddDefaulted_GetRef();
				Course.Centre = (A + B) * 0.5f;
				Course.Rotation = Dir.IsNearlyZero()
					? Facing
					: FRotationMatrix::MakeFromXY(Dir, Across).ToQuat();
				Course.Size = FVector(FVector::Dist(A, B), Fence.WallThickness,
					Fence.WallHeight + Fence.PostEmbed);
			}
		}
		else
		{
			// The ends of a run are stouter than what is between them. A run that
			// starts and stops on the same post it uses in the middle reads as
			// having been cut off rather than built to a length, and it is the
			// same box scaled.
			const bool bEnd = !bHasPrev || I == Bays;
			const float Width = Fence.PostWidth * (bEnd ? Fence.EndPostScale : 1.0f);

			// Driven to the ground, topped off at the eased line. Standing it at
			// a fixed height off the eased line instead would leave it hanging
			// wherever the easing lifted the line clear of the terrain.
			const float Top = LineZ + Fence.PostHeight;
			const float Bottom = FMath::Min(Foot.Z, LineZ) - Fence.PostEmbed;

			FKBVEWorldPart& Post = Parts.AddDefaulted_GetRef();
			Post.Centre = FVector(Foot.X, Foot.Y, (Top + Bottom) * 0.5f);
			Post.Rotation = Facing;
			Post.Size = FVector(Width, Width, Top - Bottom);

			if (bHasPrev && Detail != EKBVEWorldFenceDetail::Posts)
			{
				// Pitched along the two posts it actually joins, not along the
				// road. The feet are sampled a fence's offset out to the side,
				// where the ground climbs at its own rate -- so a rail carrying
				// the road's pitch leaves one post above its top and the other
				// below it, which is the daylight along the run.
				auto Bridge = [&](float FromZ, float ToZ, float Thickness, float Depth)
					-> FKBVEWorldPart&
				{
					const FVector A(PrevFoot.X, PrevFoot.Y, FromZ);
					const FVector B(Foot.X, Foot.Y, ToZ);
					const FVector Dir = (B - A).GetSafeNormal();

					FKBVEWorldPart& Part = Parts.AddDefaulted_GetRef();
					Part.Centre = (A + B) * 0.5f;
					Part.Rotation = Dir.IsNearlyZero()
						? Facing
						: FRotationMatrix::MakeFromXY(Dir, Across).ToQuat();
					Part.Size = FVector(FVector::Dist(A, B), Thickness, Depth);
					return Part;
				};

				for (const float Height : { Fence.LowerRailHeight, Fence.UpperRailHeight })
				{
					const float Rise = Fence.PostHeight * Height;
					Bridge(PrevLineZ + Rise, LineZ + Rise, Fence.RailThickness,
						Fence.RailDepth);
				}

				if (Detail == EKBVEWorldFenceDetail::Full)
				{
					// Follows the ground rather than the rails, which is the whole
					// of what it is for: between two posts across a dip the rails
					// bridge a hollow and the run is lit from underneath.
					if (Fence.KickboardHeight > 0.0f)
					{
						Bridge(PrevFoot.Z + Fence.KickboardHeight * 0.5f,
							Foot.Z + Fence.KickboardHeight * 0.5f,
							Fence.RailThickness, Fence.KickboardHeight);
					}

					if (Run.Style == EKBVEWorldFenceStyle::Picket)
					{
						const int32 Count = FMath::Max(
							FMath::FloorToInt(FVector::Dist(Foot, PrevFoot)
								/ Fence.PicketSpacing), 1);
						for (int32 P = 1; P < Count; ++P)
						{
							const float T = static_cast<float>(P) / static_cast<float>(Count);
							const FVector At = FMath::Lerp(PrevFoot, Foot, T);
							const float Head = FMath::Lerp(PrevLineZ, LineZ, T)
								+ Fence.PostHeight * 0.9f;
							const float Toe = FMath::Min(At.Z, Head) - Fence.PostEmbed * 0.25f;

							FKBVEWorldPart& Picket = Parts.AddDefaulted_GetRef();
							Picket.Centre = FVector(At.X, At.Y, (Head + Toe) * 0.5f);
							Picket.Rotation = Facing;
							Picket.Size = FVector(Fence.PicketWidth, Fence.RailThickness,
								Head - Toe);
						}
					}
				}
			}
		}

		PrevFoot = Foot;
		PrevLineZ = LineZ;
		bHasPrev = true;
	}
}
