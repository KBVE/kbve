#include "KBVEWorldIvy.h"

#include "KBVEWorldSeed.h"
#include "KBVEWorldWall.h"

namespace
{
	/**
	 * The frame a leaf is instanced in, given the way out of the surface.
	 *
	 * A leaf is the same quad the grass is drawn with -- X across it, Z up it,
	 * and its face looking down -Y -- so standing one against a wall is naming
	 * those three axes and nothing else. Up the surface rather than up the world
	 * so a post that leans takes its ivy with it.
	 */
	FQuat FaceFrame(const FVector& Normal, const FVector& Up)
	{
		return FRotationMatrix::MakeFromZY(Up, -Normal).ToQuat();
	}

	/**
	 * How a sprig sits on the stem it grew from: along it, and tipped out of the
	 * surface.
	 *
	 * Which way each leaf points is the mesh's own arrangement now, so what is
	 * left here is the couple of degrees that stop two sprigs at the same angle
	 * being identical -- and the tip, because ivy holds its leaves flat to what
	 * it climbs and then not quite. A plant whose every leaf is exactly on the
	 * wall is a texture; one standing a few degrees off it catches a different
	 * amount of light and reads as a plant.
	 */
	FQuat LeafHold(FRandomStream& Rng, const FQuat& Along, float Lean)
	{
		const FQuat Spin(FVector::YAxisVector, FMath::DegreesToRadians(Rng.FRandRange(-9.0f, 9.0f)));
		const FQuat Tip(FVector::XAxisVector, FMath::DegreesToRadians(Rng.FRandRange(0.0f, Lean)));
		return Along * Spin * Tip;
	}

	bool Solid(TArrayView<const FKBVEWorldWallPanel> Panels, const FKBVEWorldIvyFace& Face,
		float U, float V)
	{
		if (U < Face.UMin || U > Face.UMax || V < Face.VMin || V > Face.VMax)
		{
			return false;
		}

		// No panels is a face with nothing cut out of it, which is what a fence
		// post is: the whole rectangle is masonry as far as a plant is concerned.
		if (Panels.Num() == 0)
		{
			return true;
		}

		// Below the wall's foot the panels have nothing to say: what is down there
		// is the footing, which is unbroken except where a doorway cut it. Reading
		// the decomposition at the foot instead answers exactly that -- a runner
		// will not crawl down across a doorstep, because the panel above it is not
		// there either.
		const float Height = FMath::Max(V, Face.Base);

		for (const FKBVEWorldWallPanel& Panel : Panels)
		{
			if (U >= Panel.MinU && U <= Panel.MaxU && Height >= Panel.MinV
				&& Height <= Panel.MaxV)
			{
				return true;
			}
		}
		return false;
	}

	/**
	 * The same for a strip of the surface rather than a point on it.
	 *
	 * A stem has width and a leaf is set off to one side of the node it grew
	 * from, so testing the centre line alone puts both of them over the edge of
	 * an opening: the runner passes the reveal and its leaves hang in the glass.
	 */
	bool SolidSpan(TArrayView<const FKBVEWorldWallPanel> Panels, const FKBVEWorldIvyFace& Face,
		float U, float V, float Half)
	{
		return Solid(Panels, Face, U - Half, V) && Solid(Panels, Face, U + Half, V);
	}

	/** One stem in the making, so a side shoot can be queued rather than recursed. */
	struct FStem
	{
		float U = 0.0f;
		float V = 0.0f;
		float Drift = 0.0f;
		float Reach = 0.0f;
		float Vigour = 1.0f;
		int32 Rise = 1;
		bool bShoot = false;
	};
}

void FKBVEWorldIvy::Face(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldIvyFace& Plane,
	TArrayView<const FKBVEWorldWallPanel> Solids, bool bClimb, bool bDrape, int64 Seed,
	TArray<FKBVEWorldIvySprig>& OutLeaves, FKBVEWorldRibbonMesh& OutStems, int32 Leaf)
{
	const float Width = Plane.UMax - Plane.UMin;

	// The masonry's own height, which is what the climb and the drape are
	// fractions of. Measuring from the bottom of the footing instead would make
	// every plant taller by however deep the building happens to be sunk.
	const float Height = Plane.VMax - Plane.Base;

	if (Width <= KINDA_SMALL_NUMBER || Height <= KINDA_SMALL_NUMBER || Ivy.Variants <= 0
		|| (!bClimb && !bDrape))
	{
		return;
	}

	FRandomStream Rng = FKBVEWorldSeed::MakeStream(Seed);
	if (Rng.FRand() >= Ivy.Coverage)
	{
		return;
	}

	// Where on this face the plant took hold, and how far along it spread. One
	// stretch rather than the whole face: a plant is rooted somewhere.
	const float Spread = FMath::Clamp(
		Rng.FRandRange(FMath::Min(Ivy.SpreadMin, Ivy.SpreadMax),
			FMath::Max(Ivy.SpreadMin, Ivy.SpreadMax)), 0.0f, 1.0f);
	const float Half = 0.5f * Spread * Width;
	const float Root = Rng.FRandRange(Plane.UMin + Half, Plane.UMax - Half);

	const int32 Count = FMath::Max(FMath::RoundToInt(2.0f * Half / 100.0f * Ivy.Stems), 1);

	const float Step = FMath::Max(Ivy.Step, 1.0f);

	// How far under its own leaves the stem lies, so a leaf stands off its runner
	// rather than through it.
	const float Lift = 0.5f * FMath::Max(Ivy.Proud, 0.0f);
	const FQuat Frame = FaceFrame(Plane.Norm, Plane.Up);

	// One plant, one leaf. A runner carries the leaf of the thing that grew it,
	// so dealing a different mesh out at every node makes a vine of several
	// species -- which is the tell that gave the first version away. What varies
	// along a stem is age and angle; what varies between plants is the leaf.
	const int32 Wears = Leaf != INDEX_NONE
		? FMath::Clamp(Leaf, 0, Ivy.Variants - 1)
		: Rng.RandRange(0, Ivy.Variants - 1);

	// And one size of leaf. A plant's leaves differ by age along a runner, which
	// is the taper below -- rolling the full range at every node instead makes a
	// wall of odd-sized leaves that happen to be the same shape.
	const float Blade = Rng.FRandRange(Ivy.SizeMin, Ivy.SizeMax);

	TArray<FStem> Stems;
	Stems.Reserve(Count * 2);

	for (int32 I = 0; I < Count; ++I)
	{
		// Which end this one started from. A wall whose ivy reached the roof has
		// growth coming back down over the eaves, and it is the same plant: the
		// share decides how much of it went over the top, not whether a second
		// plant was seeded up there.
		const bool bOver = bDrape && (!bClimb || Rng.FRand() < Ivy.DrapeShare);

		FStem& Stem = Stems.AddDefaulted_GetRef();
		Stem.U = Rng.FRandRange(Root - Half, Root + Half);
		Stem.V = bOver ? Plane.VMax : Plane.VMin;
		Stem.Rise = bOver ? -1 : 1;
		Stem.Vigour = Rng.FRandRange(0.75f, 1.0f);
		// A climber starts under the ground and the wall starts at its foot, so
		// the run up the footing is added to the reach rather than taken out of
		// it: how far up the brick a plant gets should not depend on how deep the
		// house happens to be sunk.
		Stem.Reach = bOver
			? Height * FMath::Max(Ivy.Drape, 0.0f) * Rng.FRandRange(0.55f, 1.0f)
			: (Plane.Base - Plane.VMin)
				+ Height * FMath::Max(Ivy.Climb, 0.0f) * Rng.FRandRange(0.7f, 1.0f);
	}

	// Grown breadth first off one list rather than by recursion: a side shoot is
	// another stem with a shorter reach, and the only thing it may not do is
	// throw shoots of its own.
	for (int32 Index = 0; Index < Stems.Num(); ++Index)
	{
		FStem Stem = Stems[Index];
		if (Stem.Reach <= Step)
		{
			continue;
		}

		float U = Stem.U;
		float V = Stem.V;
		float Grown = 0.0f;
		int32 Node = 0;

		// How far along this runner the next sprig is set. Staggered off zero so
		// that two stems side by side do not set their leaves in a row across the
		// wall, which is the pattern a grid would make and the one thing a plant
		// never does.
		float NextSprig = Rng.FRandRange(0.0f, 0.7f) * Blade;

		// The whole step or none of it. Growing while there is reach left lets the
		// last node land a step past the ceiling, which on a wall whose ivy was
		// meant to stop under the eaves is a leaf on the roof.
		while (Grown + Step <= Stem.Reach)
		{
			// Where the tip is trying to get to. Wandering as it rises is most of
			// what separates a stem from a stripe -- a plant reaching for a hold
			// does not go straight up, it feels its way there.
			Stem.Drift = FMath::Clamp(Stem.Drift + Rng.FRandRange(-Ivy.Wander, Ivy.Wander),
				-2.0f * Ivy.Wander, 2.0f * Ivy.Wander);

			const float Along = Grown + Step;
			const float Taper = FMath::Max(1.0f - 0.55f * (Along / Stem.Reach), 0.25f);
			const float HalfW = 0.5f * Ivy.StemWidth * Taper * (Stem.bShoot ? 0.7f : 1.0f);

			float NextU = U + Stem.Drift;
			const float NextV = V + Step * static_cast<float>(Stem.Rise);

			if (!SolidSpan(Solids, Plane, NextU, NextV, HalfW))
			{
				// An opening in the way. Ivy at a window goes round the reveal
				// rather than over the glass, so the tip is thrown the other way
				// once -- and if that is blocked too, this is where the stem ends.
				Stem.Drift = -Stem.Drift;
				NextU = U + Stem.Drift;
				if (!SolidSpan(Solids, Plane, NextU, NextV, HalfW))
				{
					break;
				}
			}

			// Across the strip first and then along it, which is the winding
			// every other face in this plugin is built with -- the quad takes its
			// normal from the two edges leaving the first corner, so a strip wound
			// up its own length faces into the wall it is lying on and is drawn
			// from behind, which is to say not at all.
			//
			// Across which way depends on which way the stem is going. A runner
			// hanging back down from the eaves travels against the face's own up,
			// so laying its corners out in the order a climbing one uses hands the
			// same cross product the other sign -- and half the plant, the half
			// over the windows, goes invisible.
			const float Across = HalfW * static_cast<float>(Stem.Rise);

			// Each end at its own height's clearance, so the quad that crosses
			// onto the plinth ramps out over the overhang rather than cutting
			// through the corner of it.
			const float From = Plane.StandAt(V) - Lift;
			const float To = Plane.StandAt(NextV) - Lift;

			FKBVEWorldRibbon::AppendQuad(OutStems,
				Plane.At(U - Across, V, From),
				Plane.At(U + Across, V, From),
				Plane.At(NextU + Across, NextV, To),
				Plane.At(NextU - Across, NextV, To),
				FVector2D(0.0f, Grown / Ivy.StemTile),
				FVector2D(1.0f, Grown / Ivy.StemTile),
				FVector2D(1.0f, Along / Ivy.StemTile),
				FVector2D(0.0f, Along / Ivy.StemTile));

			U = NextU;
			V = NextV;
			Grown = Along;
			++Node;

			// Nothing in the earth. The stretch below the wall's foot is the plant
			// arriving out of the ground, which is stem and root -- leaves down
			// there are leaves buried in the terrain.
			if (V >= Plane.Base && Grown >= NextSprig)
			{
				// Smaller towards the tip: the growth at the end of a runner is
				// this year's and has not opened out yet.
				const float Young = FMath::Lerp(1.0f, 0.6f, Along / Stem.Reach);
				const float Size = Blade * Rng.FRandRange(0.9f, 1.0f) * Young * Stem.Vigour;

				// On the stem, and turned to run along it. A sprig's own leaves
				// are set alternately about its length, so aligning the mesh with
				// the growth is the whole of putting them on the runner -- and a
				// stretch coming back down over the eaves gets that arrangement
				// upside down for nothing, because its heading already is.
				FKBVEWorldIvySprig& Sprig = OutLeaves.AddDefaulted_GetRef();
				Sprig.Centre = Plane.At(U, V, Plane.StandAt(V));

				const FVector Heading = (Plane.Right * (NextU - U)
					+ Plane.Up * (NextV - V)).GetSafeNormal();
				const FQuat Along3 = FRotationMatrix::MakeFromZY(Heading, -Plane.Norm).ToQuat();

				Sprig.Rotation = LeafHold(Rng, Along3, Ivy.Lean);
				Sprig.Size = Size;
				Sprig.Variant = Wears;

				// Far enough on that this sprig's own leaves have run out, so the
				// next one carries the runner on rather than landing on top of it.
				NextSprig = Grown + FMath::Max(Ivy.LeafCluster, 1) * Ivy.LeafGap * Size;
			}

			if (!Stem.bShoot && Node > 1 && Rng.FRand() < Ivy.BranchChance)
			{
				FStem& Shoot = Stems.AddDefaulted_GetRef();
				Shoot.U = U;
				Shoot.V = V;
				Shoot.Rise = Stem.Rise;
				Shoot.Drift = -Stem.Drift * 2.0f;
				Shoot.Vigour = Stem.Vigour * 0.8f;
				Shoot.Reach = (Stem.Reach - Grown) * Rng.FRandRange(0.35f, 0.7f);
				Shoot.bShoot = true;
			}
		}
	}
}

void FKBVEWorldIvy::Wall(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldWallFrame& Frame,
	TArrayView<const FKBVEWorldWallPanel> Panels, float Height, float Thickness, bool bClimb,
	bool bDrape, int64 Seed, TArray<FKBVEWorldIvySprig>& OutLeaves,
	FKBVEWorldRibbonMesh& OutStems, int32 Leaf, const FKBVEWorldIvyFooting& Footing)
{
	if (Panels.Num() == 0)
	{
		return;
	}

	// The wall's own extent, read off the panels rather than passed in: the
	// decomposition is already in the frame's units and already knows where the
	// wall was clamped to, so a second measure of the same wall is a second
	// chance to disagree with it.
	FKBVEWorldIvyFace Plane;
	Plane.Origin = Frame.Origin;
	Plane.Right = Frame.Right;
	Plane.Up = Frame.Up;
	Plane.Norm = Frame.Norm;
	Plane.UMin = TNumericLimits<float>::Max();
	Plane.UMax = TNumericLimits<float>::Lowest();
	Plane.VMax = Height;
	Plane.Stand = 0.5f * FMath::Max(Thickness, 0.0f) + FMath::Max(Ivy.Proud, 0.0f);

	// The wall's foot, and however far below it this wall has something to crawl
	// down. A plant that begins where the brick begins is a plant somebody hung
	// there; what makes it look grown is the stretch of bare runner going over
	// the plinth and into the earth.
	Plane.Base = 0.0f;
	Plane.VMin = -FMath::Max(Footing.Depth, 0.0f);
	Plane.Lip = FMath::Max(Footing.Lip, 0.0f);
	Plane.LipStand = FMath::Max(Footing.Stand, 0.0f);

	for (const FKBVEWorldWallPanel& Panel : Panels)
	{
		Plane.UMin = FMath::Min(Plane.UMin, Panel.MinU);
		Plane.UMax = FMath::Max(Plane.UMax, Panel.MaxU);
	}

	Face(Ivy, Plane, Panels, bClimb, bDrape, Seed, OutLeaves, OutStems, Leaf);
}

void FKBVEWorldIvy::Post(const FKBVEWorldIvyParams& Ivy, const FKBVEWorldPart& Post, int64 Seed,
	TArray<FKBVEWorldIvySprig>& OutLeaves, FKBVEWorldRibbonMesh& OutStems)
{
	if (Post.Size.Z <= KINDA_SMALL_NUMBER || Ivy.Variants <= 0)
	{
		return;
	}

	FRandomStream Rng = FKBVEWorldSeed::MakeStream(Seed);
	if (Rng.FRand() >= Ivy.PostCoverage)
	{
		return;
	}

	const FVector Up = Post.Rotation.GetAxisZ();
	const FVector Foot = Post.Centre - Up * (0.5f * Post.Size.Z);

	// The face the plant came up, and the one beside it. Ivy reaching a post
	// arrives from one side and wraps a little: all four faces evenly is a post
	// somebody planted, and one face alone is a post with a sticker on it.
	const int32 Rooted = Rng.RandRange(0, 3);
	const int32 Wrapped = (Rooted + (Rng.FRand() < 0.5f ? 1 : 3)) % 4;

	// Rolled here rather than per face: what wraps a post is one plant, and a
	// post whose two sides wear different leaves is two of them.
	const int32 Wears = Rng.RandRange(0, Ivy.Variants - 1);

	// A post is a stem's worth of surface, not a wall's, so the plant on it is
	// the same parameters with the counts taken down: one runner up the face it
	// arrived on and a thinner one round the corner.
	FKBVEWorldIvyParams Climber = Ivy;
	Climber.Coverage = 1.0f;
	Climber.SpreadMin = 1.0f;
	Climber.SpreadMax = 1.0f;
	Climber.Stems = FMath::Max(Ivy.Stems * 0.5f, 0.0f);

	for (int32 Side = 0; Side < 4; ++Side)
	{
		if (Side != Rooted && Side != Wrapped)
		{
			continue;
		}

		const bool bAcross = (Side % 2) == 0;
		const FVector Normal = bAcross
			? Post.Rotation.GetAxisX() * (Side == 0 ? 1.0f : -1.0f)
			: Post.Rotation.GetAxisY() * (Side == 1 ? 1.0f : -1.0f);
		const FVector Right = FVector::CrossProduct(Up, Normal).GetSafeNormal();

		const float Width = bAcross ? Post.Size.Y : Post.Size.X;
		const float Depth = bAcross ? Post.Size.X : Post.Size.Y;

		FKBVEWorldIvyFace Plane;
		Plane.Origin = Foot - Right * (0.5f * Width);
		Plane.Right = Right;
		Plane.Up = Up;
		Plane.Norm = Normal;
		Plane.UMin = 0.0f;
		Plane.UMax = Width;
		Plane.VMin = 0.0f;
		Plane.VMax = Post.Size.Z;
		Plane.Stand = 0.5f * Depth + FMath::Max(Ivy.Proud, 0.0f);

		FKBVEWorldIvyParams Runner = Climber;
		if (Side == Wrapped)
		{
			Runner.Stems *= 0.6f;
			Runner.Climb *= 0.7f;
		}

		// A post is climbed and never draped: there is no roof over it to come
		// back down from.
		Face(Runner, Plane, TArrayView<const FKBVEWorldWallPanel>(), true, false,
			FKBVEWorldSeed::DeriveSeed(Seed, { Side }), OutLeaves, OutStems, Wears);
	}
}
