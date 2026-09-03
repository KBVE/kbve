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

namespace
{
	/** How far the ground at a tile sits below the line the road has to stay above. */
	float SubmergedDepth(const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape,
		int32 Seed, const FVector2D& Tile)
	{
		const float H = FKBVEWorldHeightfield::HeightAt(Shape, Seed, Tile.X, Tile.Y);
		return FMath::Max(0.0f, Shape.WaterZ + Road.BridgeFreeboard - H);
	}
}

FVector2D FKBVEWorldRoadGraph::NodeTile(const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FIntPoint& Chunk)
{
	const float Jx = (Unit(HashCoord(Seed, Chunk.X, Chunk.Y, 0x5A17u)) * 2.0f - 1.0f) * Road.NodeJitter;
	const float Jy = (Unit(HashCoord(Seed, Chunk.X, Chunk.Y, 0xB33Fu)) * 2.0f - 1.0f) * Road.NodeJitter;
	const FVector2D Wanted(
		(Chunk.X + 0.5f + Jx) * Road.TilesPerChunk,
		(Chunk.Y + 0.5f + Jy) * Road.TilesPerChunk);

	// Wetness, not channel. A node in a lake is as unusable as one in a river,
	// and the mask says nothing about a basin the channel field never drew.
	auto Wetness = [&](const FVector2D& P)
	{
		return FMath::Max(
			FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed, P.X, P.Y) / FMath::Max(Road.BridgeMaskThreshold, KINDA_SMALL_NUMBER),
			SubmergedDepth(Road, Shape, Seed, P) / FMath::Max(Road.BridgeFreeboard, 1.0f));
	};

	FVector2D Best = Wanted;
	float BestWet = Wetness(Wanted);
	if (BestWet <= 1.0f)
	{
		return Wanted;
	}

	// Widening rings rather than one jump, so a node that only clips the bank
	// moves the least it can and the network keeps the shape the jitter gave it.
	static constexpr int32 Steps = 8;
	for (int32 Ring = 1; Ring <= 3 && BestWet > 1.0f; ++Ring)
	{
		const float Radius = Road.TilesPerChunk * 0.15f * Ring;
		for (int32 Step = 0; Step < Steps; ++Step)
		{
			const float Angle = 2.0f * PI * Step / Steps;
			const FVector2D Candidate = Wanted + FVector2D(FMath::Cos(Angle), FMath::Sin(Angle)) * Radius;
			const float Wet = Wetness(Candidate);
			if (Wet < BestWet)
			{
				BestWet = Wet;
				Best = Candidate;
			}
		}
	}

	return Best;
}

void FKBVEWorldRoadGraph::RouteEdge(const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FIntPoint& A, const FIntPoint& B,
	TArray<FVector>& OutWorld, EKBVEWorldRoadPrune* OutPrune)
{
	OutWorld.Reset();

	auto Prune = [&](EKBVEWorldRoadPrune Reason)
	{
		OutWorld.Reset();
		if (OutPrune)
		{
			*OutPrune = Reason;
		}
	};

	if (OutPrune)
	{
		*OutPrune = EKBVEWorldRoadPrune::None;
	}

	if (!HasEdge(Road, Seed, A, B))
	{
		Prune(EKBVEWorldRoadPrune::NotJoined);
		return;
	}

	const int32 Num = FMath::Max(Road.SamplesPerEdge, 4);
	const int32 Slots = FMath::Max(Road.LateralSlots | 1, 3);
	const int32 Centre = Slots / 2;

	const FVector2D Start = NodeTile(Road, Shape, Seed, A);
	const FVector2D End = NodeTile(Road, Shape, Seed, B);

	// A node the push-out could not get onto dry land is in open water, and a
	// road that starts in a lake is not a road. Both chunks that could own this
	// edge compute the same two nodes, so both drop it.
	if (SubmergedDepth(Road, Shape, Seed, Start) > 0.0f
		|| SubmergedDepth(Road, Shape, Seed, End) > 0.0f)
	{
		Prune(EKBVEWorldRoadPrune::NodeInWater);
		return;
	}
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
		const float Depth = FMath::Max(0.0f, Shape.WaterZ + Road.BridgeFreeboard - Height[J]);
		Cost[J] = (J == Centre)
			? Road.RiverWeight * River[J] + Road.DepthWeight * Depth
			: TNumericLimits<float>::Max();
	}

	for (int32 I = 1; I < Num; ++I)
	{
		for (int32 J = 0; J < Slots; ++J)
		{
			const int32 K = I * Slots + J;
			// Depth comes free off the height already sampled, so water costs the
			// router nothing to see and it can route around a lake rather than
			// through it.
			const float Depth = FMath::Max(0.0f, Shape.WaterZ + Road.BridgeFreeboard - Height[K]);
			const float NodeCost = Road.RiverWeight * River[K] + Road.DepthWeight * Depth;

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

	// A route that still needs a span no bridge would be built at is a road that
	// should not exist. Dropped whole rather than trimmed: half an edge is a stub
	// running into the water, which is worse than no edge at all.
	TArray<FKBVEWorldRoadSpan> Spans;
	FindRiverSpans(Road, Shape, Seed, OutWorld, Spans);

	const float Longest = Road.MaxBridgeSpanTiles * Road.WorldUnitsPerTile;
	int32 Carried = 0;
	for (const FKBVEWorldRoadSpan& Span : Spans)
	{
		if (FVector::Dist2D(OutWorld[Span.Begin], OutWorld[Span.End]) > Longest)
		{
			Prune(EKBVEWorldRoadPrune::SpanTooLong);
			return;
		}
		Carried += Span.Num();
	}

	if (Carried > Road.MaxBridgedFraction * OutWorld.Num())
	{
		Prune(EKBVEWorldRoadPrune::TooMuchDeck);
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
		float Lowest = TNumericLimits<float>::Max();
		for (int32 Step = 0; Step < 2; ++Step)
		{
			// The sample itself, then the midpoint to the next one.
			const FVector Along = (Step == 0)
				? Path[I]
				: (Path[I] + Path[FMath::Min(I + 1, Path.Num() - 1)]) * 0.5f;

			// The route's own height, which is the height the road will be
			// graded to. Not the ground under it: in a dip the road rides an
			// embankment above the terrain, and a causeway standing clear of the
			// water is a road, not a crossing.
			Lowest = FMath::Min(Lowest, Along.Z);

			for (int32 Lane = -2; Lane <= 2; ++Lane)
			{
				const FVector P = Along + Across * (Half * Lane * 0.5f);
				Worst = FMath::Max(Worst, MaskAt(P));
			}
		}

		Wet[I] = Worst > Road.BridgeMaskThreshold
			|| Lowest < Shape.WaterZ + Road.BridgeFreeboard;
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
