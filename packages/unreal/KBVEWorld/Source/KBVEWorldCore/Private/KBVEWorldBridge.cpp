#include "KBVEWorldBridge.h"

#include "KBVEWorldHeightfield.h"

void FKBVEWorldBridge::Build(const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldRoadParams& Road,
	const FKBVEWorldHeightfieldParams& Shape, int32 Seed, const FKBVEWorldRoadField* Field,
	const TArray<FVector>& Path, const FKBVEWorldRoadSpan& Span, FKBVEWorldRibbonMesh& OutWood,
	FKBVEWorldRibbonMesh& OutStone)
{
	const int32 Count = Span.Num();
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

	const float Total = FMath::Max(Run, KINDA_SMALL_NUMBER);

	// How much rise the water under the span demands, measured against the taper
	// that will be carrying it.
	//
	// Only over the channel, and only where the taper is large enough to carry a
	// rise without the divide exploding. Both bounds matter: the margins either
	// end are bank the deck is landing on, not water it has to clear, and a
	// sample at a taper of a tenth turns a 20 uu shortfall into a 200 uu arch.
	float Arch = Bridge.ArchHeight;
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
		if (Mask <= Road.BridgeMaskThreshold)
		{
			continue;
		}

		const float Base = FMath::Lerp(HeadZ, TailZ, T);
		const float Needed = (GroundAt(P) + Bridge.MinClearance - Base) / Taper;
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

	FKBVEWorldRibbonParams DeckParams;
	DeckParams.Width = Bridge.DeckWidth;
	DeckParams.TileLength = Bridge.TileLength;
	DeckParams.Thickness = Bridge.DeckThickness;
	FKBVEWorldRibbon::Append(OutWood, Deck, DeckParams);

	const float RailOffset = Bridge.DeckWidth * 0.5f - Bridge.RailInset - Bridge.RailThickness * 0.5f;
	for (int32 Side = 0; Side < 2; ++Side)
	{
		FKBVEWorldRibbonParams RailParams;
		RailParams.Width = Bridge.RailThickness;
		RailParams.TileLength = Bridge.TileLength;
		RailParams.Thickness = Bridge.RailHeight;
		RailParams.ZOffset = Bridge.RailHeight;
		RailParams.LateralOffset = (Side == 0) ? -RailOffset : RailOffset;
		FKBVEWorldRibbon::Append(OutWood, Deck, RailParams);
	}

	auto AppendSupport = [&](const FVector& At, float Width)
	{
		const float Ground = GroundAt(At);
		const float Top = At.Z - Bridge.DeckThickness;
		if (Top - Ground < Bridge.MinPierHeight)
		{
			return;
		}

		const float Half = Width * 0.5f;
		FKBVEWorldRibbon::AppendBox(OutStone,
			FVector(At.X - Half, At.Y - Half, Ground - Bridge.PierEmbed),
			FVector(At.X + Half, At.Y + Half, Top),
			Bridge.StoneTileLength);
	};

	AppendSupport(Deck[0], Bridge.AbutmentWidth);
	AppendSupport(Deck[Count - 1], Bridge.AbutmentWidth);

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

		int32 I = 1;
		while (I < Count - 1 && Along[I] < Target)
		{
			++I;
		}

		const float Segment = FMath::Max(Along[I] - Along[I - 1], KINDA_SMALL_NUMBER);
		const float Frac = FMath::Clamp((Target - Along[I - 1]) / Segment, 0.0f, 1.0f);
		AppendSupport(FMath::Lerp(Deck[I - 1], Deck[I], Frac), Bridge.PierWidth);
	}
}
