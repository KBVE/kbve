#include "KBVEWorldBridge.h"

#include "KBVEWorldHeightfield.h"

void FKBVEWorldBridge::Build(const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldBridgeLod& Lod,
	const FKBVEWorldRoadParams& Road, const FKBVEWorldHeightfieldParams& Shape, int32 Seed,
	const FKBVEWorldRoadField* Field, const TArray<FVector>& Path, const FKBVEWorldRoadSpan& Span,
	FKBVEWorldRibbonMesh& OutWood, FKBVEWorldRibbonMesh& OutStone, TArray<FBox>& OutBlocks)
{
	int32 Count = Span.Num();
	if (Count < 2 || Span.End >= Path.Num())
	{
		return;
	}

	// The graded surface, which is what the road actually is. Supports land on it
	// too -- it is the ground that gets drawn.
	auto GroundAt = [&](const FVector& P)
	{
		const float Base = FKBVEWorldHeightfield::HeightAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);
		return Field ? Field->Level(Base, P.X, P.Y) : Base;
	};

	const FVector& Head = Path[Span.Begin];
	const FVector& Tail = Path[Span.End];
	const float HeadZ = GroundAt(Head);
	const float TailZ = GroundAt(Tail);

	// The deck keeps the road's XY exactly and takes over only its Z. Following
	// the route through the crossing rather than cutting a straight chord is what
	// lets the road approach at an angle without a kink at the abutment.
	TArray<FVector> Deck;
	Deck.SetNumUninitialized(Count);

	float Run = 0.0f;
	TArray<float> Along;
	Along.SetNumUninitialized(Count);
	Along[0] = 0.0f;
	for (int32 I = 1; I < Count; ++I)
	{
		Run += FVector::Dist2D(Path[Span.Begin + I - 1], Path[Span.Begin + I]);
		Along[I] = Run;
	}

	float Total = FMath::Max(Run, KINDA_SMALL_NUMBER);

	// How much rise the water under the span demands, measured against the taper
	// that will be carrying it.
	//
	// Only over the channel, and only where the taper is large enough to carry a
	// rise without the divide exploding. Both bounds matter: the margins either
	// end are bank the deck is landing on, not water it has to clear, and a
	// sample at a taper of a tenth turns a 20 uu shortfall into a 200 uu arch.
	// Floored against the span before clearance is considered at all. Clearance
	// is measured off a bed that sits well below the banks the road crosses at,
	// so it asks for nothing on almost every crossing and the fixed rise is what
	// the deck ends up with -- which over a long span is no rise worth seeing.
	float Arch = FMath::Max(Bridge.ArchHeight, Total * Bridge.ArchSpanRatio);
	for (int32 I = 0; I < Count; ++I)
	{
		const float T = Along[I] / Total;
		const float Taper = FMath::Sin(T * PI);
		if (Taper < 0.35f)
		{
			continue;
		}

		const FVector& P = Path[Span.Begin + I];
		const float Mask = FKBVEWorldHeightfield::RiverMaskAt(Shape, Seed,
			P.X / Road.WorldUnitsPerTile, P.Y / Road.WorldUnitsPerTile);

		// Every sample, not only the wet ones. Water decides how much room the
		// deck needs over the ground, not whether it needs any: a span is entered
		// where the road comes within a freeboard of the water line, and the
		// ground in the middle of one of those can stand higher than either bank.
		// Skipping the dry samples left the deck at the chord between the banks
		// and buried in the rise between them, with nothing to stand a support
		// on. A deck clears what it spans, wet or dry.
		const float Under = GroundAt(P);
		const bool bOverWater = Mask > Road.BridgeMaskThreshold || Under < Shape.WaterZ;
		const float Required = bOverWater ? Bridge.MinClearance : Bridge.MinPierHeight;

		// Measured to the underside, which is where the clearance actually is.
		// Solving to the deck top and asking for nothing on dry ground put the
		// top exactly level with the ground it crossed -- so the underside sat a
		// deck's thickness inside the hill, every support came out at zero or
		// less, and the crossing was built with nothing under it at all. That is
		// the whole of the bare-crossing case: burial was 44 uu on all of them,
		// which is DeckThickness to the unit.
		const float Base = FMath::Lerp(HeadZ, TailZ, T);
		const float Needed = (Under + Required + Bridge.DeckThickness - Base) / Taper;
		Arch = FMath::Max(Arch, Needed);
	}
	Arch = FMath::Min(Arch, Bridge.MaxArchHeight);

	for (int32 I = 0; I < Count; ++I)
	{
		const float T = Along[I] / Total;
		const FVector& P = Path[Span.Begin + I];
		const float Base = FMath::Lerp(HeadZ, TailZ, T);
		Deck[I] = FVector(P.X, P.Y, Base + Arch * FMath::Sin(T * PI));
	}

	// Refined through a Catmull-Rom before anything is swept along it.
	//
	// The route's samples are a few hundred units apart, which is as fine as a
	// road needs to describe where it goes and far too coarse to be a handrail:
	// swept raw, every joint is a corner and a curve arrives as a row of flats.
	// The spline passes through the original samples, so the ends stay pinned
	// where the join depends on them being.
	//
	// Refined at the shape's own rate whatever level is being built. The route's
	// length is what the abutment march walks and what the pier bays divide, so a
	// level that refined less would arrive at a different length and stand its
	// masonry somewhere else -- the supports would shift and appear as the ring
	// changed, which is the one thing an LOD may not do. Detail is taken out of
	// the swept surface below instead, after everything has been solved.
	if (Bridge.CurveSubdivisions > 1 && Count > 2)
	{
		TArray<FVector> Curve;
		Curve.Reserve(Count * Bridge.CurveSubdivisions);

		for (int32 I = 0; I + 1 < Count; ++I)
		{
			const FVector& P0 = Deck[FMath::Max(I - 1, 0)];
			const FVector& P1 = Deck[I];
			const FVector& P2 = Deck[I + 1];
			const FVector& P3 = Deck[FMath::Min(I + 2, Count - 1)];

			for (int32 S = 0; S < Bridge.CurveSubdivisions; ++S)
			{
				const float T = static_cast<float>(S) / static_cast<float>(Bridge.CurveSubdivisions);
				Curve.Add(0.5f * ((2.0f * P1)
					+ (P2 - P0) * T
					+ (2.0f * P0 - 5.0f * P1 + 4.0f * P2 - P3) * (T * T)
					+ (3.0f * P1 - P0 - 3.0f * P2 + P3) * (T * T * T)));
			}
		}
		Curve.Add(Deck.Last());

		Deck = MoveTemp(Curve);
		Count = Deck.Num();

		// Everything downstream steps by distance, so the table it steps through
		// has to describe the line that was actually built.
		Along.SetNumUninitialized(Count);
		Along[0] = 0.0f;
		for (int32 I = 1; I < Count; ++I)
		{
			Along[I] = Along[I - 1] + FVector::Dist2D(Deck[I - 1], Deck[I]);
		}
		Total = FMath::Max(Along.Last(), KINDA_SMALL_NUMBER);
	}

	// The line the deck and its rails are swept along, which is the refined one
	// thinned rather than a coarser one solved. Both ends are kept, so the join
	// at the abutment is the same geometry at every level and only the middle of
	// the curve loses samples.
	const int32 Stride = FMath::Max(
		Bridge.CurveSubdivisions / FMath::Max(Lod.CurveSubdivisions, 1), 1);

	TArray<FVector> Thinned;
	if (Stride > 1)
	{
		Thinned.Reserve(Count / Stride + 2);
		for (int32 I = 0; I < Count; I += Stride)
		{
			Thinned.Add(Deck[I]);
		}
		if (Thinned.Last() != Deck.Last())
		{
			Thinned.Add(Deck.Last());
		}
	}

	const TArray<FVector>& Swept = Stride > 1 ? Thinned : Deck;

	FKBVEWorldRibbonParams DeckParams;
	DeckParams.Width = Bridge.DeckWidth;
	DeckParams.TileLength = Bridge.TileLength;
	DeckParams.Thickness = Bridge.DeckThickness;
	FKBVEWorldRibbon::Append(OutWood, Swept, DeckParams);

	const float RailOffset = Bridge.DeckWidth * 0.5f - Bridge.RailInset - Bridge.RailThickness * 0.5f;
	for (int32 Side = 0; Side < 2; ++Side)
	{
		FKBVEWorldRibbonParams RailParams;
		RailParams.Width = Bridge.RailThickness;
		RailParams.TileLength = Bridge.TileLength;
		RailParams.Thickness = Bridge.RailHeight;
		RailParams.ZOffset = Bridge.RailHeight;
		RailParams.LateralOffset = (Side == 0) ? -RailOffset : RailOffset;
		FKBVEWorldRibbon::Append(OutWood, Swept, RailParams);
	}

	// Girders and cross beams under the deck, over the stretch that has the room
	// for them. Built only where the deck stands clear: a frame carried out to
	// the abutments would be inside the bank the deck lands on, which is the same
	// mistake the supports used to make at the anchors.
	const float FrameNeeds = Bridge.GirderDepth + Bridge.CrossBeamDepth;
	int32 FrameBegin = -1;
	int32 FrameEnd = -1;
	for (int32 I = 0; I < Count; ++I)
	{
		if (Deck[I].Z - Bridge.DeckThickness - GroundAt(Deck[I]) >= FrameNeeds)
		{
			FrameBegin = (FrameBegin < 0) ? I : FrameBegin;
			FrameEnd = I;
		}
	}

	const float GirderOffset = FMath::Max(Bridge.DeckWidth * 0.5f - Bridge.GirderInset, 0.0f);

	// Declared before the helpers that read it, and empty to begin with. The
	// abutments are laid first and must not duck under a frame whose extent is
	// not decided yet -- it is decided from where they finish.
	bool bHasFrame = false;
	float FrameFrom = 0.0f;
	float FrameTo = 0.0f;

	auto SampleDeck = [&](float Distance)
	{
		int32 I = 1;
		while (I < Count - 1 && Along[I] < Distance)
		{
			++I;
		}
		const float Segment = FMath::Max(Along[I] - Along[I - 1], KINDA_SMALL_NUMBER);
		const float Frac = FMath::Clamp((Distance - Along[I - 1]) / Segment, 0.0f, 1.0f);
		return FMath::Lerp(Deck[I - 1], Deck[I], Frac);
	};

	// What a support may rise to, which is not the deck.
	//
	// Two ways the old answer was wrong, and both of them showed. It stopped at
	// the deck's underside, so every pier ran straight up through the girders and
	// beams hanging below it -- stone through timber the length of the bridge.
	// And it took the deck height at the block's centre while the block is square
	// and the deck is sloping, so the corner nearest the crown stood proud of the
	// floor it was meant to be holding up. Measured across the block's own
	// footprint now, and stopping under the frame wherever the frame is there.
	auto SupportTop = [&](float Distance, float Half)
	{
		// A square block turned against the deck reaches a corner's worth
		// further along it than its half width.
		const float Extent = Half * UE_SQRT_2;
		float Top = TNumericLimits<float>::Max();

		for (int32 Step = -3; Step <= 3; ++Step)
		{
			const float D = FMath::Clamp(Distance + Extent * Step / 3.0f, 0.0f, Total);
			const FVector P = SampleDeck(D);
			const float Under = P.Z - Bridge.DeckThickness;
			const bool bFramed = bHasFrame && Lod.bFrame && D >= FrameFrom && D <= FrameTo;
			Top = FMath::Min(Top, Under - (bFramed ? FrameNeeds : 0.0f));
		}

		return Top;
	};

	auto AppendBlock = [&](float Distance, float Width)
	{
		const FVector At = SampleDeck(Distance);
		const float Ground = GroundAt(At);
		const float Top = SupportTop(Distance, Width * 0.5f);
		if (Top <= Ground)
		{
			return false;
		}

		const float Half = Width * 0.5f;
		const FVector Min(At.X - Half, At.Y - Half, Ground - Bridge.PierEmbed);
		const FVector Max(At.X + Half, At.Y + Half, Top);
		FKBVEWorldRibbon::AppendBox(OutStone, Min, Max, Bridge.StoneTileLength);
		OutBlocks.Emplace(Min, Max);
		return Top - Ground >= Bridge.MinPierHeight;
	};

	// Abutments are built up from the ground rather than dropped at the anchor.
	//
	// The deck's last sample sits at the road surface by construction -- that is
	// what makes the join seamless -- so a support asked for there has its top
	// below the ground it would stand on, and was declined every single time.
	// Both ends of every bridge in the world had no abutment at all, and the ramp
	// between the anchor and the first pier's worth of clearance was open air
	// under a plank.
	//
	// So march inboard from the anchor laying masonry under everything the deck
	// has risen clear of, and stop at the first block tall enough to be a pier.
	// Marched by distance rather than by sample, and closer together than a block
	// is wide, because the route samples are a few hundred units apart and square
	// blocks that far apart on a diagonal do not touch -- which would have traded
	// open air for a row of separate pillars.
	// Returns the distance it reached, which is where the masonry ends and the
	// frame may begin. Ordering, not arithmetic: the girders used to be built
	// first and the abutments fitted around whatever was already there, so the
	// two met wherever they happened to meet. A margin measured from the ends of
	// the span does not help -- an abutment marches inboard until it finds ground
	// worth standing on, and on a steep bank that is a long way in.
	auto AppendAbutment = [&](float FromDistance, float Direction)
	{
		const float Stride = FMath::Max(Bridge.AbutmentWidth * 0.4f, 1.0f);
		const float Reach = Total * Bridge.AbutmentReach;
		float Reached = FromDistance;

		for (float Walked = 0.0f; Walked <= Reach; Walked += Stride)
		{
			const float Target = FMath::Clamp(FromDistance + Direction * Walked, 0.0f, Total);
			Reached = Target;
			if (AppendBlock(Target, Bridge.AbutmentWidth))
			{
				break;
			}
		}
		return Reached;
	};

	const float AbutFrom = AppendAbutment(0.0f, 1.0f);
	const float AbutTo = AppendAbutment(Total, -1.0f);

	// Held inside the abutments, so the first girder does not start in the block
	// that carries the deck onto the bank. The frame gives up a little length at
	// each end, where it is closest to the ground and least seen; the abutment
	// keeps its full height, being the thing actually landing the deck.
	{
		// A block's half diagonal, and then some. Three quarters of its width was
		// not enough: a square three hundred units across reaches two hundred and
		// twelve to its corner, so the girders stopped thirteen units from the
		// masonry -- clear of it, and close enough that any slope in the deck put
		// them back in contact. The frame loses a little length at each end for a
		// gap wide enough to see through.
		const float Margin = Bridge.AbutmentWidth * 1.25f;
		while (FrameBegin >= 0 && FrameBegin < FrameEnd && Along[FrameBegin] < AbutFrom + Margin)
		{
			++FrameBegin;
		}
		while (FrameEnd > 0 && FrameEnd > FrameBegin && Along[FrameEnd] > AbutTo - Margin)
		{
			--FrameEnd;
		}
	}

	bHasFrame = FrameBegin >= 0 && FrameEnd > FrameBegin;

	// Where the frame is, as a stretch rather than a test.
	//
	// The girders are swept over one contiguous run from the first station with
	// room to the last, so a dip in the middle of that run has frame over it
	// whether or not it has the clearance for one. Asking the clearance question
	// again per support therefore answered "no frame here" at exactly those
	// stations, and the block was built up to the deck -- straight through the
	// girders beside it, by the depth of the frame.
	FrameFrom = bHasFrame ? Along[FrameBegin] : 0.0f;
	FrameTo = bHasFrame ? Along[FrameEnd] : 0.0f;

	if (bHasFrame && Lod.bFrame)
	{
		TArray<FVector> Spine;
		Spine.Append(Deck.GetData() + FrameBegin, FrameEnd - FrameBegin + 1);

		for (int32 Side = 0; Side < 2; ++Side)
		{
			FKBVEWorldRibbonParams Girder;
			Girder.Width = Bridge.GirderWidth;
			Girder.TileLength = Bridge.TileLength;
			Girder.Thickness = Bridge.GirderDepth;
			Girder.ZOffset = -Bridge.DeckThickness;
			Girder.LateralOffset = (Side == 0) ? -GirderOffset : GirderOffset;
			FKBVEWorldRibbon::Append(OutWood, Spine, Girder);
		}

		// Stepped by distance for the same reason the piers are: the route's
		// samples are spaced to describe where the road goes, not how often a
		// beam should appear under it.
		const float FrameRun = Along[FrameEnd] - Along[FrameBegin];
		const int32 Bays = FMath::Max(FMath::RoundToInt(FrameRun / Bridge.CrossBeamSpacing), 1);
		const float Reach = GirderOffset + Bridge.GirderWidth * 0.5f;

		for (int32 Bay = 0; Bay <= Bays; ++Bay)
		{
			const float Target = Along[FrameBegin]
				+ FrameRun * static_cast<float>(Bay) / static_cast<float>(Bays);

			int32 I = FrameBegin + 1;
			while (I < FrameEnd && Along[I] < Target)
			{
				++I;
			}
			const float Segment = FMath::Max(Along[I] - Along[I - 1], KINDA_SMALL_NUMBER);
			const float Frac = FMath::Clamp((Target - Along[I - 1]) / Segment, 0.0f, 1.0f);
			const FVector At = FMath::Lerp(Deck[I - 1], Deck[I], Frac);
			const FVector Tangent = (Deck[I] - Deck[I - 1]).GetSafeNormal();
			const FVector Across(Tangent.Y, -Tangent.X, 0.0f);

			TArray<FVector> Beam;
			Beam.Add(At - Across * Reach);
			Beam.Add(At + Across * Reach);

			FKBVEWorldRibbonParams Cross;
			Cross.Width = Bridge.CrossBeamWidth;
			Cross.TileLength = Bridge.TileLength;
			Cross.Thickness = Bridge.CrossBeamDepth;
			Cross.ZOffset = -(Bridge.DeckThickness + Bridge.GirderDepth);
			FKBVEWorldRibbon::Append(OutWood, Beam, Cross);
		}
	}

	// Piers are stepped by distance along the deck, not by sample index: the
	// samples are evenly spaced along the whole edge, not along this span, so
	// counting them would space piers differently on every crossing.
	const float Spacing = FMath::Max(Bridge.PierSpacing, 1.0f);
	// At least two bays, which is at least one pier, and it lands at midspan --
	// over the channel, where the deck is furthest from anything holding it up.
	// A short crossing rounding down to a single bay is exactly the case that
	// leaves a plank floating over the water with nothing under it.
	const int32 Bays = FMath::Max(FMath::RoundToInt(Total / Spacing), 2);
	for (int32 Bay = 1; Bay < Bays; ++Bay)
	{
		const float Target = Total * static_cast<float>(Bay) / static_cast<float>(Bays);

		// Piers stand under the frame, and only under it. They are stepped across
		// the whole span while the frame is held inside the abutments, so a bay
		// can land in the gap between the two -- where the support tops out at
		// the deck's underside because there is no frame at that station, and
		// runs straight up through the girder that starts alongside it. Out
		// there the abutment masonry is what carries the deck anyway.
		if (bHasFrame && (Target < FrameFrom || Target > FrameTo))
		{
			continue;
		}

		AppendBlock(Target, Bridge.PierWidth);
	}
}
