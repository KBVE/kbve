#include "KBVEWorldRoadField.h"

#include "KBVEWorldHeightfield.h"

namespace
{
	float DistanceToSegment(const FVector2D& P, const FVector2D& A, const FVector2D& B, float& OutT)
	{
		const FVector2D AB = B - A;
		const float LengthSq = AB.SizeSquared();
		OutT = (LengthSq > KINDA_SMALL_NUMBER)
			? FMath::Clamp(FVector2D::DotProduct(P - A, AB) / LengthSq, 0.0f, 1.0f)
			: 0.0f;
		return FVector2D::Distance(P, A + AB * OutT);
	}
}

float FKBVEWorldRoadField::CorridorDistance(const FVector2D& P, const FSegment& Segment,
	float& OutT) const
{
	const FVector2D AB = Segment.B - Segment.A;
	const float LengthSq = AB.SizeSquared();
	if (LengthSq <= KINDA_SMALL_NUMBER)
	{
		OutT = 0.0f;
		return FVector2D::Distance(P, Segment.A);
	}

	const float Raw = FVector2D::DotProduct(P - Segment.A, AB) / LengthSq;
	OutT = FMath::Clamp(Raw, 0.0f, 1.0f);

	const FVector2D Nearest = Segment.A + AB * OutT;
	const float Lateral = FVector2D::Distance(P, Nearest);
	if (Raw >= 0.0f && Raw <= 1.0f)
	{
		return Lateral;
	}

	// Past an end, so the point is out where that end reaches. Scaled rather
	// than cut: a hard stop would put a step in the ground across the abutment.
	const float Length = FMath::Sqrt(LengthSq);
	const float Over = (Raw < 0.0f) ? -Raw * Length : (Raw - 1.0f) * Length;
	const float Reach = FMath::Max((Raw < 0.0f) ? Segment.ReachA : Segment.ReachB, 1.0f);
	const float Scaled = Over * Road.CutHalfWidth / Reach;

	// The lateral part is the leg of the same triangle, so the overshoot is
	// traded against it rather than added to it.
	return FMath::Sqrt(FMath::Max(Lateral * Lateral - Over * Over, 0.0f) + Scaled * Scaled);
}

FKBVEWorldRoadField::FKBVEWorldRoadField(const FKBVEWorldRoadParams& InRoad,
	const FKBVEWorldHeightfieldParams& InShape, int32 InSeed)
	: Road(InRoad)
	, Shape(InShape)
	, Seed(InSeed)
	, CellSize(FMath::Max(InRoad.CutHalfWidth, 100.0f))
{
}

bool FKBVEWorldRoadField::Matches(const FKBVEWorldRoadParams& InRoad, int32 InSeed) const
{
	return Seed == InSeed
		&& Road.TilesPerChunk == InRoad.TilesPerChunk
		&& Road.CutHalfWidth == InRoad.CutHalfWidth
		&& Road.CutFlatHalfWidth == InRoad.CutFlatHalfWidth
		&& Road.EdgeDensity == InRoad.EdgeDensity
		&& Road.ProfileSmoothPasses == InRoad.ProfileSmoothPasses
		&& Road.BridgeEndReach == InRoad.BridgeEndReach;
}

const TArray<FVector>* FKBVEWorldRoadField::FindEdge(const FIntPoint& Chunk, int32 Step) const
{
	return Edges.Find(FIntVector(Chunk.X, Chunk.Y, Step));
}

void FKBVEWorldRoadField::AddPolyline(const TArray<FVector>& Points, float StartReach,
	float EndReach) const
{
	for (int32 I = 0; I + 1 < Points.Num(); ++I)
	{
		const int32 Index = Segments.Num();
		FSegment& Segment = Segments.AddDefaulted_GetRef();
		Segment.A = FVector2D(Points[I]);
		Segment.B = FVector2D(Points[I + 1]);
		Segment.ZA = Points[I].Z;
		Segment.ZB = Points[I + 1].Z;
		// Only the run's own two ends are ends. Everywhere else the next segment
		// carries on and there is nothing to overshoot into.
		Segment.ReachA = (I == 0) ? StartReach : Road.CutHalfWidth;
		Segment.ReachB = (I + 2 == Points.Num()) ? EndReach : Road.CutHalfWidth;

		// No taper along the run. One was tried and removed: the profile is
		// smoothed with its ends pinned to the raw ground, so a corridor already
		// arrives at the height it started from and there is no step to ease --
		// while a taper measured in samples silently drops short runs entirely.
		// A dry run of two points has both of them at an end, so every segment
		// came out at zero strength and the stretches between crossings were
		// never graded at all.

		// Every bucket the segment's influence reaches, not just the ones its
		// ends land in: a query is answered from one bucket and its neighbours,
		// so a segment crossing a bucket without stopping in it still has to be
		// listed there.
		const FVector2D Min = FVector2D::Min(Segment.A, Segment.B) - FVector2D(CellSize, CellSize);
		const FVector2D Max = FVector2D::Max(Segment.A, Segment.B) + FVector2D(CellSize, CellSize);
		for (int32 Y = FMath::FloorToInt(Min.Y / CellSize); Y <= FMath::FloorToInt(Max.Y / CellSize); ++Y)
		{
			for (int32 X = FMath::FloorToInt(Min.X / CellSize); X <= FMath::FloorToInt(Max.X / CellSize); ++X)
			{
				Buckets.FindOrAdd(FIntPoint(X, Y)).Add(Index);
			}
		}
	}
}

void FKBVEWorldRoadField::RouteChunk(const FIntPoint& Chunk) const
{
	if (Routed.Contains(Chunk))
	{
		return;
	}
	Routed.Add(Chunk);

	const FIntPoint Steps[2] = { FIntPoint(1, 0), FIntPoint(0, 1) };

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	for (int32 S = 0; S < 2; ++S)
	{
		FKBVEWorldRoadGraph::RouteEdge(Road, Shape, Seed, Chunk, Chunk + Steps[S], Path);
		if (Path.Num() < 2)
		{
			continue;
		}

		// Smoothed in section before anything is levelled to it. Without this the
		// corridor inherits the ground's own relief and the cut does nothing --
		// flattening terrain to a profile that already rolls with the terrain
		// leaves it exactly where it started.
		for (int32 Pass = 0; Pass < Road.ProfileSmoothPasses; ++Pass)
		{
			// Ends held, exactly as the plan smoothing holds them. Every edge
			// meeting at a node has to arrive at the same height there, and a
			// filter that is free to move its own endpoints moves each edge's
			// copy of the node somewhere different -- which leaves a step across
			// the junction where two corridors were graded to heights that no
			// longer agree.
			TArray<float> Smoothed;
			Smoothed.SetNumUninitialized(Path.Num());
			Smoothed[0] = Path[0].Z;
			Smoothed[Path.Num() - 1] = Path.Last().Z;
			for (int32 I = 1; I < Path.Num() - 1; ++I)
			{
				Smoothed[I] = (Path[I - 1].Z + Path[I].Z * 2.0f + Path[I + 1].Z) * 0.25f;
			}
			for (int32 I = 0; I < Path.Num(); ++I)
			{
				Path[I].Z = Smoothed[I];
			}
		}

		Edges.Add(FIntVector(Chunk.X, Chunk.Y, S), Path);

		// A bridged run is not levelled. The deck is there because the ground
		// falls away, so grading the corridor across it would fill in the river
		// the bridge was built to cross.
		FKBVEWorldRoadGraph::FindRiverSpans(Road, Shape, Seed, Path, Spans);

		// How far a run may grade out past an abutment, measured against the span
		// on the other side of it. A fixed reach is fine against a long crossing
		// and hopeless against a short one: two caps of three hundred units either
		// end of a seven-hundred-unit span meet in the middle, fill the channel,
		// and leave the deck buried in the ground that replaced the water. Capped
		// at a quarter of the span so the middle is always left alone.
		auto CapFor = [&](int32 Index)
		{
			const FKBVEWorldRoadSpan& Span = Spans[Index];
			const float Length = FVector::Dist2D(Path[Span.Begin], Path[Span.End]);
			return FMath::Min(Road.BridgeEndReach, FMath::Max(Length * 0.25f, 1.0f));
		};

		int32 Cursor = 0;
		TArray<FVector> Dry;
		for (int32 I = 0; I <= Spans.Num(); ++I)
		{
			const int32 Stop = (I < Spans.Num()) ? Spans[I].Begin : Path.Num() - 1;
			if (Stop > Cursor)
			{
				Dry.Reset();
				Dry.Append(Path.GetData() + Cursor, Stop - Cursor + 1);
				// A run that starts after a span, or stops before one, is
				// meeting a deck rather than continuing into a junction.
				AddPolyline(Dry,
					(I > 0) ? CapFor(I - 1) : Road.CutHalfWidth,
					(I < Spans.Num()) ? CapFor(I) : Road.CutHalfWidth);
			}
			if (I < Spans.Num())
			{
				Cursor = Spans[I].End;
			}
		}
	}
}

void FKBVEWorldRoadField::EnsureCovers(const FVector2D& Min, const FVector2D& Max) const
{
	const float ChunkSize = Road.TilesPerChunk * Road.WorldUnitsPerTile;

	// One chunk of slack each way: an edge is owned by the chunk it starts in but
	// its corridor bows sideways and ends in the next one, so a node outside the
	// box can still put road inside it.
	const int32 MinX = FMath::FloorToInt((Min.X - Road.CutHalfWidth) / ChunkSize) - 1;
	const int32 MaxX = FMath::FloorToInt((Max.X + Road.CutHalfWidth) / ChunkSize) + 1;
	const int32 MinY = FMath::FloorToInt((Min.Y - Road.CutHalfWidth) / ChunkSize) - 1;
	const int32 MaxY = FMath::FloorToInt((Max.Y + Road.CutHalfWidth) / ChunkSize) + 1;

	for (int32 Y = MinY; Y <= MaxY; ++Y)
	{
		for (int32 X = MinX; X <= MaxX; ++X)
		{
			RouteChunk(FIntPoint(X, Y));
		}
	}
}

float FKBVEWorldRoadField::SurfaceWeight(float WorldX, float WorldY) const
{
	if (Segments.Num() == 0)
	{
		return 0.0f;
	}

	const FVector2D P(WorldX, WorldY);
	const int32 Cx = FMath::FloorToInt(WorldX / CellSize);
	const int32 Cy = FMath::FloorToInt(WorldY / CellSize);

	const float Half = Road.RoadWidth * 0.5f;
	const float Feather = FMath::Max(Road.RoadSurfaceFeather, 1.0f);

	float Best = 0.0f;
	for (int32 Y = Cy - 1; Y <= Cy + 1; ++Y)
	{
		for (int32 X = Cx - 1; X <= Cx + 1; ++X)
		{
			const TArray<int32>* Bucket = Buckets.Find(FIntPoint(X, Y));
			if (!Bucket)
			{
				continue;
			}

			for (const int32 Index : *Bucket)
			{
				const FSegment& Segment = Segments[Index];
				float T = 0.0f;
				const float Distance = DistanceToSegment(P, Segment.A, Segment.B, T);
				if (Distance >= Half + Feather)
				{
					continue;
				}

				// Full strength out to the edge of the carriageway, then a short
				// feather so the verge is a margin rather than a cut line.
				const float Ramp = FMath::Clamp((Distance - Half) / Feather, 0.0f, 1.0f);
				Best = FMath::Max(Best, 1.0f - Ramp * Ramp * (3.0f - 2.0f * Ramp));
			}
		}
	}

	return Best;
}

bool FKBVEWorldRoadField::Probe(float WorldX, float WorldY, float& OutDistance, float& OutZ,
	float& OutWeight) const
{
	OutDistance = TNumericLimits<float>::Max();
	OutZ = 0.0f;
	OutWeight = 0.0f;

	const FVector2D P(WorldX, WorldY);
	const int32 Cx = FMath::FloorToInt(WorldX / CellSize);
	const int32 Cy = FMath::FloorToInt(WorldY / CellSize);

	for (int32 Y = Cy - 1; Y <= Cy + 1; ++Y)
	{
		for (int32 X = Cx - 1; X <= Cx + 1; ++X)
		{
			const TArray<int32>* Bucket = Buckets.Find(FIntPoint(X, Y));
			if (!Bucket)
			{
				continue;
			}
			for (const int32 Index : *Bucket)
			{
				const FSegment& Segment = Segments[Index];
				float T = 0.0f;
				const float Distance = CorridorDistance(P, Segment, T);
				if (Distance < OutDistance)
				{
					OutDistance = Distance;
					OutZ = FMath::Lerp(Segment.ZA, Segment.ZB, T);

					const float Flat = FMath::Min(Road.CutFlatHalfWidth, Road.CutHalfWidth);
					const float Ramp = FMath::Clamp((Distance - Flat)
						/ FMath::Max(Road.CutHalfWidth - Flat, 1.0f), 0.0f, 1.0f);
					OutWeight = 1.0f - Ramp * Ramp * (3.0f - 2.0f * Ramp);
				}
			}
		}
	}
	return OutDistance < TNumericLimits<float>::Max();
}

float FKBVEWorldRoadField::Level(float Base, float WorldX, float WorldY) const
{
	if (!Road.bCutTerrain || Segments.Num() == 0)
	{
		return Base;
	}

	const FVector2D P(WorldX, WorldY);
	const int32 Cx = FMath::FloorToInt(WorldX / CellSize);
	const int32 Cy = FMath::FloorToInt(WorldY / CellSize);

	const float Flat = FMath::Min(Road.CutFlatHalfWidth, Road.CutHalfWidth);
	const float Fade = FMath::Max(Road.CutHalfWidth - Flat, 1.0f);

	// Every corridor in reach, weighted, rather than whichever happens to be
	// nearest. Nearest-wins is discontinuous exactly where two corridors compete
	// -- at a junction, and on the inside of a bend where one segment hands over
	// to the next -- and since each corridor grades to its own height, the
	// handover put a step of up to a couple of hundred uu across the road. A
	// weighted blend has no handover to be discontinuous at, and where one road
	// is clearly nearest it still grades to that road alone.
	double WeightedZ = 0.0;
	double TotalWeight = 0.0;
	float Strongest = 0.0f;

	for (int32 Y = Cy - 1; Y <= Cy + 1; ++Y)
	{
		for (int32 X = Cx - 1; X <= Cx + 1; ++X)
		{
			const TArray<int32>* Bucket = Buckets.Find(FIntPoint(X, Y));
			if (!Bucket)
			{
				continue;
			}

			for (const int32 Index : *Bucket)
			{
				const FSegment& Segment = Segments[Index];
				float T = 0.0f;
				const float Distance = CorridorDistance(P, Segment, T);
				if (Distance >= Road.CutHalfWidth)
				{
					continue;
				}

				const float Ramp = FMath::Clamp((Distance - Flat) / Fade, 0.0f, 1.0f);
				const float Falloff = 1.0f - Ramp * Ramp * (3.0f - 2.0f * Ramp);
				const float Weight = Falloff;
				if (Weight <= 0.0f)
				{
					continue;
				}

				// Squared, so the nearest corridor dominates sharply enough that
				// a road's own surface stays flat rather than being dragged by
				// another road half a corridor away.
				const float Bias = Weight * Weight;
				WeightedZ += Bias * FMath::Lerp(Segment.ZA, Segment.ZB, T);
				TotalWeight += Bias;
				Strongest = FMath::Max(Strongest, Weight);
			}
		}
	}

	if (TotalWeight <= 0.0)
	{
		return Base;
	}

	return FMath::Lerp(Base, static_cast<float>(WeightedZ / TotalWeight), Strongest);
}

