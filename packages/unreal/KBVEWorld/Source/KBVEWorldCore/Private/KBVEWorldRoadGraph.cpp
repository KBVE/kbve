#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldHeightfield.h"

namespace
{
	uint32 HashCoord(int32 Seed, int32 X, int32 Y, uint32 Salt)
	{
		uint32 H = static_cast<uint32>(Seed) ^ Salt;
		H ^= static_cast<uint32>(X) * 0x9E3779B9u;
		H = (H ^ (H >> 15)) * 0x85EBCA6Bu;
		H ^= static_cast<uint32>(Y) * 0xC2B2AE35u;
		H = (H ^ (H >> 13)) * 0xC2B2AE35u;
		return H ^ (H >> 16);
	}

	float Unit(uint32 H)
	{
		return static_cast<float>(H & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
	}

	/**
	 * One corner-cutting pass, endpoints held.
	 *
	 * The ends cannot move: they are the nodes other edges arrive at, and an end
	 * that drifts opens a gap in the network that nothing else knows about.
	 */
	void ChaikinPass(TArray<FVector>& Path)
	{
		if (Path.Num() < 3)
		{
			return;
		}

		TArray<FVector> Cut;
		Cut.Reserve(Path.Num() * 2);
		Cut.Add(Path[0]);
		for (int32 I = 0; I < Path.Num() - 1; ++I)
		{
			const FVector& A = Path[I];
			const FVector& B = Path[I + 1];
			Cut.Add(A + (B - A) * 0.25f);
			Cut.Add(A + (B - A) * 0.75f);
		}
		Cut.Add(Path.Last());
		Path = MoveTemp(Cut);
	}
}

bool FKBVEWorldRoadGraph::HasEdge(const FKBVEWorldRoadParams& Road, int32 Seed,
	const FIntPoint& A, const FIntPoint& B)
{
	if (Road.EdgeDensity >= 1.0f)
	{
		return true;
	}

	// Hashed from both endpoints in a fixed order, so the answer does not depend
	// on which of the two chunks is asking.
	const FIntPoint Low = (A.X < B.X || (A.X == B.X && A.Y < B.Y)) ? A : B;
	const FIntPoint High = (Low == A) ? B : A;
	const uint32 H = HashCoord(Seed, Low.X * 73856093 + High.X, Low.Y * 19349663 + High.Y, 0xED9Eu);
	return Unit(H) < Road.EdgeDensity;
}

FVector2D FKBVEWorldRoadGraph::NodeTile(const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FIntPoint& Chunk)
{
	const float Jx = (Unit(HashCoord(Seed, Chunk.X, Chunk.Y, 0x5A17u)) * 2.0f - 1.0f) * Road.NodeJitter;
	const float Jy = (Unit(HashCoord(Seed, Chunk.X, Chunk.Y, 0xB33Fu)) * 2.0f - 1.0f) * Road.NodeJitter;
	const FVector2D Wanted(
		(Chunk.X + 0.5f + Jx) * Road.TilesPerChunk,
		(Chunk.Y + 0.5f + Jy) * Road.TilesPerChunk);

	FVector2D Best = Wanted;
	float BestMask = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, Wanted.X, Wanted.Y);
	if (BestMask <= Road.BridgeMaskThreshold)
	{
		return Wanted;
	}

	// Widening rings rather than one jump, so a node that only clips the bank
	// moves the least it can and the network keeps the shape the jitter gave it.
	static constexpr int32 Steps = 8;
	for (int32 Ring = 1; Ring <= 3 && BestMask > Road.BridgeMaskThreshold; ++Ring)
	{
		const float Radius = Road.TilesPerChunk * 0.15f * Ring;
		for (int32 Step = 0; Step < Steps; ++Step)
		{
			const float Angle = 2.0f * PI * Step / Steps;
			const FVector2D Candidate = Wanted + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Radius;
			const float Mask = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, Candidate.X, Candidate.Y);
			if (Mask < BestMask)
			{
				BestMask = Mask;
				Best = Candidate;
			}
		}
	}

	return Best;
}

void FKBVEWorldRoadGraph::RouteEdge(const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FIntPoint& A, const FIntPoint& B,
	TArray<FVector>& OutWorld)
{
	OutWorld.Reset();

	if (!HasEdge(Road, Seed, A, B))
	{
		return;
	}

	const int32 Num = FMath::Max(Road.SamplesPerEdge, 4);
	const int32 Slots = FMath::Max(Road.LateralSlots | 1, 3);
	const int32 Centre = Slots / 2;

	const FVector2D Start = NodeTile(Road, Shape, Seed, A);
	const FVector2D End = NodeTile(Road, Shape, Seed, B);
	const FVector2D Along = (End - Start).GetSafeNormal();
	const FVector2D Across(Along.Y, -Along.X);

	TArray<FVector2D> Pos;
	TArray<float> Height;
	TArray<float> River;
	TArray<float> Lateral;
	Pos.SetNumUninitialized(Num * Slots);
	Height.SetNumUninitialized(Num * Slots);
	River.SetNumUninitialized(Num * Slots);
	Lateral.SetNumUninitialized(Num * Slots);

	for (int32 I = 0; I < Num; ++I)
	{
		const float T = static_cast<float>(I) / static_cast<float>(Num - 1);
		const FVector2D Base = FMath::Lerp(Start, End, T);

		// The corridor closes to nothing at both ends. Every edge meeting at a
		// node has to arrive at the node itself, or the network comes apart into
		// unconnected stubs one chunk long.
		const float Taper = FMath::Sin(T * PI);

		for (int32 J = 0; J < Slots; ++J)
		{
			const float Offset = (static_cast<float>(J - Centre) / static_cast<float>(Centre))
				* Road.CorridorTiles * Taper;
			const FVector2D P = Base + Across * Offset;
			const int32 K = I * Slots + J;
			Pos[K] = P;
			Lateral[K] = Offset;
			Height[K] = FKBVEWorldHeightfield::HeightAt(Shape, Seed, P.X, P.Y);
			River[K] = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, P.X, P.Y);
		}
	}

	TArray<float> Cost;
	TArray<int32> From;
	Cost.Init(TNumericLimits<float>::Max(), Num * Slots);
	From.Init(0, Num * Slots);

	for (int32 J = 0; J < Slots; ++J)
	{
		Cost[J] = (J == Centre) ? Road.RiverWeight * River[J] : TNumericLimits<float>::Max();
	}

	for (int32 I = 1; I < Num; ++I)
	{
		for (int32 J = 0; J < Slots; ++J)
		{
			const int32 K = I * Slots + J;
			const float NodeCost = Road.RiverWeight * River[K];

			float Best = TNumericLimits<float>::Max();
			int32 BestFrom = Centre;

			for (int32 P = 0; P < Slots; ++P)
			{
				const int32 Prev = (I - 1) * Slots + P;
				if (Cost[Prev] == TNumericLimits<float>::Max())
				{
					continue;
				}

				const float Run = FVector2D::Distance(Pos[Prev], Pos[K]) * Road.WorldUnitsPerTile;
				const float Climb = FMath::Abs(Height[K] - Height[Prev]);
				const float Sideways = Lateral[K] - Lateral[Prev];
				const float Step = Road.LengthWeight * Run
					+ Road.SlopeWeight * Climb
					+ Road.TurnWeight * FMath::Abs(Sideways) * Road.WorldUnitsPerTile;

				const float Total = Cost[Prev] + Step;
				if (Total < Best)
				{
					Best = Total;
					BestFrom = P;
				}
			}

			if (Best < TNumericLimits<float>::Max())
			{
				Cost[K] = Best + NodeCost;
				From[K] = BestFrom;
			}
		}
	}

	TArray<int32> Chain;
	Chain.SetNumUninitialized(Num);
	Chain[Num - 1] = Centre;
	for (int32 I = Num - 1; I > 0; --I)
	{
		Chain[I - 1] = From[I * Slots + Chain[I]];
	}

	OutWorld.SetNumUninitialized(Num);
	for (int32 I = 0; I < Num; ++I)
	{
		const int32 K = I * Slots + Chain[I];
		OutWorld[I] = FVector(
			Pos[K].X * Road.WorldUnitsPerTile,
			Pos[K].Y * Road.WorldUnitsPerTile,
			Height[K]);
	}

	for (int32 Pass = 0; Pass < Road.SmoothPasses; ++Pass)
	{
		ChaikinPass(OutWorld);
	}

	// Heights are resampled after smoothing, not carried through it. A corner cut
	// across a valley moves the road in XY, and interpolating the old heights
	// there would leave the surface hanging in the air over ground it no longer
	// follows -- including over the river, where that is the difference between
	// finding a crossing and missing it.
	for (FVector& Point : OutWorld)
	{
		Point.Z = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			Point.X / Road.WorldUnitsPerTile, Point.Y / Road.WorldUnitsPerTile);
	}
}

void FKBVEWorldRoadGraph::FindRiverSpans(const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const TArray<FVector>& Path,
	TArray<FKBVEWorldRoadSpan>& OutSpans)
{
	OutSpans.Reset();
	if (Path.Num() < 2)
	{
		return;
	}

	auto MaskAt = [&](const FVector& P)
	{
		return FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
	};

	// The channel is narrower than the gap between route samples, and the road is
	// wider than the centre line the route is made of. Testing one point per
	// sample therefore misses two whole classes of crossing: a channel that fits
	// between two samples, and one the road only clips with its shoulder. Both
	// end with a road draped down a river bank instead of a deck over it.
	const float Half = Road.RoadWidth * 0.5f;

	TArray<bool> Wet;
	Wet.SetNumUninitialized(Path.Num());
	for (int32 I = 0; I < Path.Num(); ++I)
	{
		const FVector& Prev = Path[FMath::Max(I - 1, 0)];
		const FVector& Next = Path[FMath::Min(I + 1, Path.Num() - 1)];
		const FVector T = (Next - Prev).GetSafeNormal();
		const FVector Across = FVector(T.Y, -T.X, 0.0f).GetSafeNormal();

		float Worst = 0.0f;
		for (int32 Step = 0; Step < 2; ++Step)
		{
			// The sample itself, then the midpoint to the next one.
			const FVector Along = (Step == 0)
				? Path[I]
				: (Path[I] + Path[FMath::Min(I + 1, Path.Num() - 1)]) * 0.5f;

			for (int32 Lane = -2; Lane <= 2; ++Lane)
			{
				const FVector P = Along + Across * (Half * Lane * 0.5f);
				Worst = FMath::Max(Worst, MaskAt(P));
			}
		}

		Wet[I] = Worst > Road.BridgeMaskThreshold;
	}

	// The margin is in tiles but has to be applied in samples, and how long a
	// sample is depends on how far apart the two nodes ended up. Measuring it
	// from the path itself is what keeps abutments the same size on a short edge
	// and a long one.
	const float TotalTiles = FVector::Dist2D(Path[0], Path.Last()) / Road.WorldUnitsPerTile;
	const float TilesPerSample = FMath::Max(TotalTiles / FMath::Max(Path.Num() - 1, 1), KINDA_SMALL_NUMBER);
	const int32 Margin = FMath::Clamp(FMath::CeilToInt(Road.BridgeMarginTiles / TilesPerSample), 1, Path.Num() / 3);

	int32 I = 0;
	while (I < Path.Num())
	{
		if (!Wet[I])
		{
			++I;
			continue;
		}

		int32 End = I;
		while (End + 1 < Path.Num() && Wet[End + 1])
		{
			++End;
		}

		FKBVEWorldRoadSpan Span;
		Span.Begin = FMath::Max(I - Margin, 0);
		Span.End = FMath::Min(End + Margin, Path.Num() - 1);

		// Two crossings whose abutments overlap are one bridge, not two decks
		// fighting over the same ground.
		if (OutSpans.Num() > 0 && Span.Begin <= OutSpans.Last().End)
		{
			OutSpans.Last().End = Span.End;
		}
		else
		{
			OutSpans.Add(Span);
		}

		I = End + 1;
	}
}
