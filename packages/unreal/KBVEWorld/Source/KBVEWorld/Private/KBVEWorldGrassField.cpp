#include "KBVEWorldGrassField.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldGrassAtlas.h"
#include "KBVEWorldGrassCard.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldNoise.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldStreamer.h"
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"

DEFINE_LOG_CATEGORY(LogKBVEWorldGrass);

namespace
{
	/**
	 * A live multiplier on how much of each tile's budget is filled.
	 *
	 * Density is the knob that gets turned most and the one whose right value is
	 * a judgement rather than a measurement, so it is worth being able to turn it
	 * in front of the thing it changes. Every tile is refilled when it moves, so
	 * a new value reaches the whole window within a few steps.
	 */
	float GGrassDensityScale = 1.0f;
	FAutoConsoleVariableRef CVarGrassDensityScale(
		TEXT("kbve.Grass.DensityScale"), GGrassDensityScale,
		TEXT("Scales how many of each tile's grass slots are filled. 1 is as configured."),
		ECVF_Default);

	/** No tile can sit here, so a slot holding it has never been filled. */
	const FIntPoint UnfilledSlot(MIN_int32, MIN_int32);

	/** Samples per tile edge in the height grid a tile is scattered over. */
	constexpr int32 HeightGridEdge = 9;

	/** How far a clump is pushed into the ground so its cards do not float. */
	constexpr float SinkDepth = 6.0f;

	FTransform HiddenInstance()
	{
		return FTransform(FQuat::Identity, FVector::ZeroVector, FVector::ZeroVector);
	}
}

AKBVEWorldGrassField::AKBVEWorldGrassField()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;

	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void AKBVEWorldGrassField::BeginPlay()
{
	Super::BeginPlay();

	// Nothing on a dedicated server ever asks where a blade of grass is, and a
	// server that builds a ring of them pays a client's whole cost for a field
	// nobody will look at.
	if (GetNetMode() == NM_DedicatedServer)
	{
		SetActorTickEnabled(false);
		return;
	}

	EnsureComponents();
}

const AKBVEWorldStreamer* AKBVEWorldGrassField::FindStreamer() const
{
	if (Streamer.IsValid())
	{
		return Streamer.Get();
	}

	if (UWorld* World = GetWorld())
	{
		TActorIterator<AKBVEWorldStreamer> It(World);
		if (It)
		{
			Streamer = *It;
		}
	}
	return Streamer.Get();
}

namespace
{
	/**
	 * What a pack's clumps have to be multiplied by for its tallest to stand
	 * Height tall.
	 *
	 * Taken off the tallest rather than each clump so the pack keeps its own
	 * range: a seedling authored a third the size of a tuft stays a third the
	 * size of it. A pack whose bounds cannot be read is left alone rather than
	 * guessed at.
	 */
	float NormaliseToHeight(const UKBVEWorldGrassAtlas* Atlas, float Height)
	{
		float Tallest = 0.0f;
		for (const UStaticMesh* Clump : Atlas->Clumps)
		{
			if (Clump)
			{
				Tallest = FMath::Max(Tallest,
					static_cast<float>(Clump->GetBounds().BoxExtent.Z) * 2.0f);
			}
		}
		return Tallest > KINDA_SMALL_NUMBER ? Height / Tallest : 1.0f;
	}
}

void AKBVEWorldGrassField::AddVariant(UStaticMesh* Mesh, UMaterialInterface* Material,
	const TArray<FTransform>& Empty, float Normalise)
{
	UInstancedStaticMeshComponent* Component =
		NewObject<UInstancedStaticMeshComponent>(this, NAME_None, RF_Transient);
	Component->SetStaticMesh(Mesh);
	Component->SetMaterial(0, Material);
	Component->SetupAttachment(GetRootComponent());

	// Submissions are world space, so the component must not add its own.
	Component->SetAbsolute(true, true, true);

	Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Component->SetCastShadow(bCastShadow);
	Component->bAffectDistanceFieldLighting = false;
	Component->bAffectDynamicIndirectLighting = false;

	// Clamped to what the ring actually holds. A cull distance beyond the window
	// is a promise the builder cannot keep, and it is kept in code rather than
	// only in the config because the two numbers are set in different files and
	// drift apart the moment either is tuned alone.
	const int32 Reach = FMath::TruncToInt(TileRadius * TileSize);
	const int32 End = FMath::Min(CullEnd, Reach);
	const int32 Start = FMath::Min(CullStart, End);
	if (CullEnd > Reach)
	{
		UE_LOG(LogKBVEWorldGrass, Warning,
			TEXT("cull end %d is past the window's %d; using %d"), CullEnd, Reach, End);
	}
	Component->SetCullDistances(Start, End);
	Component->SetWorldPositionOffsetDisableDistance(WindDisableDistance);
	Component->PrimaryComponentTick.bCanEverTick = false;
	Component->RegisterComponent();

	Component->AddInstances(Empty, false, true);

	Variants.Add(Component);
	VariantMeshes.Add(Mesh);
	VariantScales.Add(Normalise);

	const FBoxSphereBounds Bounds = Mesh->GetBounds();
	const float Floor = static_cast<float>(Bounds.Origin.Z - Bounds.BoxExtent.Z);
	VariantFloors.Add(Floor);
	UE_LOG(LogKBVEWorldGrass, Display,
		TEXT("%s: %.1f tall, underside at %.1f, drawn at x%.2f"),
		*Mesh->GetName(), static_cast<float>(Bounds.BoxExtent.Z) * 2.0f, Floor, Normalise);
}

bool AKBVEWorldGrassField::EnsureComponents()
{
	if (Variants.Num() > 0)
	{
		return true;
	}

	// Loaded up front and then held: a variant is bound to its sheet's material
	// for the life of the component, so a soft reference resolved per build
	// would be the same lookup repeated with nothing gained by the indirection.
	LoadedAtlases.Reset();
	for (const TSoftObjectPtr<UKBVEWorldGrassAtlas>& Ref : Atlases)
	{
		UKBVEWorldGrassAtlas* Atlas = Ref.IsValid() ? Ref.Get() : Ref.LoadSynchronous();
		const bool bHasGeometry = Atlas && (Atlas->Clumps.Num() > 0 || Atlas->Cells.Num() > 0);
		if (bHasGeometry && Atlas->Material && Atlas->Weight > 0)
		{
			LoadedAtlases.Add(Atlas);
		}
	}
	if (LoadedAtlases.Num() == 0)
	{
		return false;
	}

	// Weights decide how many variants each sheet gets rather than how often one
	// is picked per clump: a clump is a mesh, and a mesh built from two sheets
	// would need both their materials on one component.
	TArray<int32> SheetForVariant;
	{
		int32 Total = 0;
		for (const UKBVEWorldGrassAtlas* Atlas : LoadedAtlases)
		{
			Total += Atlas->Weight;
		}
		const int32 Wanted = FMath::Max(LoadedAtlases.Num(), VariantCount);
		for (int32 Index = 0; Index < LoadedAtlases.Num(); ++Index)
		{
			// At least one each, so a sheet that is configured is always seen.
			const int32 Share = FMath::Max(1,
				FMath::RoundToInt(Wanted * (static_cast<float>(LoadedAtlases[Index]->Weight) / Total)));
			for (int32 Repeat = 0; Repeat < Share; ++Repeat)
			{
				SheetForVariant.Add(Index);
			}
		}
	}

	const int32 Count = SheetForVariant.Num();
	PerVariant = FMath::Max(1, InstancesPerTile / Count);

	const int32 Edge = 2 * TileRadius + 1;
	const int32 Slots = Edge * Edge;

	TArray<FTransform> Empty;
	Empty.Init(HiddenInstance(), Slots * PerVariant);

	// How many variants each sheet has taken so far, so each draws its own
	// models from its own beginning. Indexing the clumps by the global variant
	// number instead means the first sheet's share is subtracted from where the
	// second one starts reading -- and a pack that leads with its tall models
	// and follows with its small ones then never shows a tall one at all.
	TArray<int32> TakenPerSheet;
	TakenPerSheet.Init(0, LoadedAtlases.Num());

	for (int32 Index = 0; Index < Count; ++Index)
	{
		const int32 SheetIndex = SheetForVariant[Index];
		UKBVEWorldGrassAtlas* Atlas = LoadedAtlases[SheetIndex];

		// A pack that ships models is drawn with them. The card generator stays
		// for sheets that ship nothing but a sheet, which is the case it was
		// written for and the only one it is better than.
		if (Atlas->Clumps.Num() > 0)
		{
			const int32 Pick = TakenPerSheet[SheetIndex]++ % Atlas->Clumps.Num();
			if (UStaticMesh* Authored = Atlas->Clumps[Pick])
			{
				AddVariant(Authored, Atlas->Material, Empty, NormaliseToHeight(Atlas, ClumpHeight));
				continue;
			}
		}

		FKBVEWorldGrassCard::FSpec Spec;
		Spec.Height = ClumpHeight;
		Spec.UniqueId = *FString::Printf(TEXT("KBVEWorld_GrassCard_%s_%d_%d"),
			*Atlas->GetName(), Index, FMath::RoundToInt(ClumpHeight));

		// Each variant takes its own draw of cells, so one clump is several
		// different photographs crossed through each other rather than the same
		// one turned three ways -- which reads as a printed shape from above.
		FRandomStream Rng(GetTypeHash(Spec.UniqueId));
		for (int32 Sheet = 0; Sheet < FMath::Max(1, SheetsPerClump); ++Sheet)
		{
			const FVector4& Cell = Atlas->Cells[Rng.RandRange(0, Atlas->Cells.Num() - 1)];
			Spec.Cells.Emplace(
				static_cast<float>(Cell.X), static_cast<float>(Cell.Y),
				static_cast<float>(Cell.Z), static_cast<float>(Cell.W));
		}

		UStaticMesh* Mesh = FKBVEWorldGrassCard::GetOrCreateClumpMesh(this, Spec, Atlas->Material);
		if (Mesh)
		{
			AddVariant(Mesh, Atlas->Material, Empty, 1.0f);
		}
	}

	if (Variants.Num() == 0)
	{
		return false;
	}

	// Which sheets ended up in the mixture, once. A field drawing from one sheet
	// because the other failed to load looks like a field drawing from one sheet
	// because that is what was asked for.
	{
		TArray<FString> Shares;
		for (int32 Index = 0; Index < LoadedAtlases.Num(); ++Index)
		{
			int32 Taken = 0;
			for (int32 Sheet : SheetForVariant)
			{
				Taken += (Sheet == Index) ? 1 : 0;
			}
			// Which of the two it drew with, because falling back to cards is
			// silent otherwise and looks exactly like a pack that ships none.
			const int32 Models = LoadedAtlases[Index]->Clumps.Num();
			Shares.Add(FString::Printf(TEXT("%s x%d (%s)"), *LoadedAtlases[Index]->GetName(), Taken,
				Models > 0 ? *FString::Printf(TEXT("%d models"), Models) : TEXT("cut cards")));
		}
		UE_LOG(LogKBVEWorldGrass, Display, TEXT("drawing from %d sheets: %s"),
			LoadedAtlases.Num(), *FString::Join(Shares, TEXT(", ")));
	}

	SlotTiles.Init(UnfilledSlot, Slots);
	SlotBands.Init(INDEX_NONE, Slots);
	return true;
}

int32 AKBVEWorldGrassField::SlotOf(const FIntPoint& Tile) const
{
	const int32 Edge = 2 * TileRadius + 1;
	const int32 X = ((Tile.X % Edge) + Edge) % Edge;
	const int32 Y = ((Tile.Y % Edge) + Edge) % Edge;
	return X * Edge + Y;
}

int32 AKBVEWorldGrassField::BandOf(const FIntPoint& Tile) const
{
	const int32 Bands = FMath::Max(1, DensityBands);
	const int32 Reach = FMath::Max(1, TileRadius);
	const int32 Distance = FMath::Max(FMath::Abs(Tile.X - CentreTile.X), FMath::Abs(Tile.Y - CentreTile.Y));
	return FMath::Clamp((Distance * Bands) / Reach, 0, Bands - 1);
}

float AKBVEWorldGrassField::BandDensity(int32 Band) const
{
	const int32 Bands = FMath::Max(1, DensityBands);
	if (Bands == 1)
	{
		return FMath::Clamp(GGrassDensityScale, 0.0f, 1.0f);
	}
	const float Falloff = FMath::Lerp(1.0f, EdgeDensity,
		static_cast<float>(Band) / static_cast<float>(Bands - 1));
	return FMath::Clamp(Falloff * GGrassDensityScale, 0.0f, 1.0f);
}

FIntPoint AKBVEWorldGrassField::TileAt(const FVector& WorldLocation) const
{
	const float Size = FMath::Max(TileSize, 1.0f);
	return FIntPoint(
		FMath::FloorToInt(WorldLocation.X / Size),
		FMath::FloorToInt(WorldLocation.Y / Size));
}

bool AKBVEWorldGrassField::TryGetViewLocation(FVector& Out) const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		Out = GetActorLocation();
		return false;
	}

	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		if (const APawn* Pawn = PC->GetPawn())
		{
			Out = Pawn->GetActorLocation();
			return true;
		}

		FVector Location;
		FRotator Rotation;
		PC->GetPlayerViewPoint(Location, Rotation);
		Out = Location;
		return true;
	}

	if (World->ViewLocationsRenderedLastFrame.Num() > 0)
	{
		Out = World->ViewLocationsRenderedLastFrame[0];
		return true;
	}

	Out = GetActorLocation();
	return false;
}

void AKBVEWorldGrassField::ClearTile(const FIntPoint& Tile)
{
	const int32 Slot = SlotOf(Tile);
	TArray<FTransform> Empty;
	Empty.Init(HiddenInstance(), PerVariant);

	for (UInstancedStaticMeshComponent* Component : Variants)
	{
		Component->BatchUpdateInstancesTransforms(Slot * PerVariant, Empty, true, true, true);
	}
	SlotTiles[Slot] = Tile;
}

int32 AKBVEWorldGrassField::BuildTile(const FIntPoint& Tile)
{
	const AKBVEWorldStreamer* Owner = FindStreamer();
	if (!Owner)
	{
		ClearTile(Tile);
		return 0;
	}

	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(Owner->WorldSeed);
	const FKBVEWorldRoadField* Field = Owner->GetRoadField();

	const float Size = FMath::Max(TileSize, 1.0f);
	const FVector2D Min(Tile.X * Size, Tile.Y * Size);
	const FVector2D Max(Min.X + Size, Min.Y + Size);

	// Routing is lazy and its caches are not thread safe, so the corridors over
	// this tile are asked for here, on the game thread, before anything reads
	// them. Everything below is a read.
	if (Field)
	{
		Field->EnsureCovers(Min, Max);
	}

	// One grid for the tile rather than a height per candidate: the sampler
	// builds its noise generators per call, which is the cost that matters once
	// there are a couple of hundred candidates in a tile.
	const float TilesPerCell = Size / 100.0f / static_cast<float>(HeightGridEdge - 1);
	TArray<float> Heights;
	Heights.SetNumUninitialized(HeightGridEdge * HeightGridEdge);
	FKBVEWorldHeightfield::FillGrid(Owner->Shape, Seed, Min.X / 100.0f, Min.Y / 100.0f,
		TilesPerCell, HeightGridEdge, Heights);

	const float CellWorld = Size / static_cast<float>(HeightGridEdge - 1);

	auto SampleHeight = [&Heights](float Fx, float Fy) -> float
	{
		const int32 X0 = FMath::Clamp(FMath::FloorToInt(Fx), 0, HeightGridEdge - 2);
		const int32 Y0 = FMath::Clamp(FMath::FloorToInt(Fy), 0, HeightGridEdge - 2);
		const float Tx = FMath::Clamp(Fx - X0, 0.0f, 1.0f);
		const float Ty = FMath::Clamp(Fy - Y0, 0.0f, 1.0f);

		const float H00 = Heights[Y0 * HeightGridEdge + X0];
		const float H10 = Heights[Y0 * HeightGridEdge + X0 + 1];
		const float H01 = Heights[(Y0 + 1) * HeightGridEdge + X0];
		const float H11 = Heights[(Y0 + 1) * HeightGridEdge + X0 + 1];

		return FMath::Lerp(FMath::Lerp(H00, H10, Tx), FMath::Lerp(H01, H11, Tx), Ty);
	};

	const float WaterLine = FKBVEWorldHeightfield::WaterZ + ShoreClearance;

	FRandomStream Rng(static_cast<int32>(HashCombine(GetTypeHash(Tile), static_cast<uint32>(Seed))));

	const int32 Slot = SlotOf(Tile);
	const int32 Band = BandOf(Tile);
	const int32 Shown = FMath::Clamp(
		FMath::RoundToInt(PerVariant * BandDensity(Band)), 0, PerVariant);

	TArray<FTransform> Batch;
	Batch.SetNumUninitialized(PerVariant);
	int32 Placed = 0;

	for (int32 Variant = 0; Variant < Variants.Num(); ++Variant)
	{
		UInstancedStaticMeshComponent* Component = Variants[Variant];
		const float Normalise = VariantScales[Variant];
		const float Floor = VariantFloors[Variant];

		for (int32 Index = 0; Index < PerVariant; ++Index)
		{
			if (Index >= Shown)
			{
				Batch[Index] = HiddenInstance();
				continue;
			}

			const float LocalX = Rng.FRand() * Size;
			const float LocalY = Rng.FRand() * Size;
			const float WorldX = Min.X + LocalX;
			const float WorldY = Min.Y + LocalY;

			// Thick here, bare there. Tested before the ground is sampled at
			// all, so the points this turns away cost a noise lookup rather
			// than a heightfield fill and two road queries.
			if (PatchThreshold > 0.0f)
			{
				FKBVENoiseSettings Patches;
				Patches.NoiseType = EKBVENoiseType::OpenSimplex2;
				Patches.FractalType = EKBVEFractalType::FBm;
				Patches.Frequency = 1.0f / FMath::Max(PatchSize, 1.0f);
				Patches.Octaves = 3;

				// Its own seed, not the world's. Sharing one would tie where the
				// grass grows to where the hills are, and a stand of it would
				// creep up every slope in the world the same way.
				const float Fertility = FKBVEWorldNoise::Sample2DNormalized(
					WorldX, WorldY, Seed ^ 0x6772'6173, Patches);

				const float Takes = FMath::SmoothStep(
					PatchThreshold - PatchSoftness, PatchThreshold + PatchSoftness, Fertility);
				if (Rng.FRand() > Takes)
				{
					++WindowRejected.Bare;
					Batch[Index] = HiddenInstance();
					continue;
				}
			}

			const float Fx = LocalX / CellWorld;
			const float Fy = LocalY / CellWorld;
			const float Base = SampleHeight(Fx, Fy);

			// The rendered ground is the levelled one. Grass placed on the raw
			// heightfield stands in the air over every road cutting.
			const float Ground = Field ? Field->Level(Base, WorldX, WorldY) : Base;

			const float SlopeX = (SampleHeight(Fx + 1.0f, Fy) - SampleHeight(Fx - 1.0f, Fy))
				/ (2.0f * CellWorld);
			const float SlopeY = (SampleHeight(Fx, Fy + 1.0f) - SampleHeight(Fx, Fy - 1.0f))
				/ (2.0f * CellWorld);
			const float Slope = FMath::Sqrt(SlopeX * SlopeX + SlopeY * SlopeY);

			const float River = FKBVEWorldHeightfield::RiverMaskAt(Owner->Shape, Seed,
				WorldX / 100.0f, WorldY / 100.0f);

			const bool bDrowned = Ground < WaterLine;
			const bool bSteep = Slope > MaxSlope;
			const bool bRiver = River > 0.2f;
			const bool bRoad = Field && Field->SurfaceWeight(WorldX, WorldY) > MaxRoadWeight;

			// Where a road meets a river there is a deck over this ground, and
			// the weight painted on the terrain knows nothing about it.
			bool bBridge = false;
			if (Field && River > 0.02f && BridgeClearance > 0.0f)
			{
				float Distance = 0.0f;
				float CorridorZ = 0.0f;
				float Weight = 0.0f;
				bBridge = Field->Probe(WorldX, WorldY, Distance, CorridorZ, Weight)
					&& Distance < BridgeClearance;
			}

			if (bDrowned || bSteep || bRiver || bRoad || bBridge)
			{
				// Counted in priority order rather than summed, so the totals
				// add up to the rejections and a point failing three tests does
				// not read as three points.
				WindowRejected.Drowned += bDrowned ? 1 : 0;
				WindowRejected.Steep += (!bDrowned && bSteep) ? 1 : 0;
				WindowRejected.River += (!bDrowned && !bSteep && bRiver) ? 1 : 0;
				WindowRejected.Road += (!bDrowned && !bSteep && !bRiver && bRoad) ? 1 : 0;
				WindowRejected.Bridge += (!bDrowned && !bSteep && !bRiver && !bRoad && bBridge) ? 1 : 0;

				Batch[Index] = HiddenInstance();
				continue;
			}

			++Placed;
			const float Scale = Rng.FRandRange(ClumpScale.Min, ClumpScale.Max) * Normalise;
			Batch[Index] = FTransform(
				FRotator(0.0f, Rng.FRand() * 360.0f, 0.0f),
				FVector(WorldX, WorldY, Ground - SinkDepth - Floor * Scale),
				FVector(Scale));
		}

		Component->BatchUpdateInstancesTransforms(Slot * PerVariant, Batch, true, true, true);
	}

	SlotTiles[Slot] = Tile;
	SlotBands[Slot] = Band;
	return Placed;
}

void AKBVEWorldGrassField::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!EnsureComponents())
	{
		return;
	}

	FVector View;
	TryGetViewLocation(View);
	const FIntPoint Centre = TileAt(View);

	if (!bCentred || Centre != CentreTile)
	{
		CentreTile = Centre;
		bCentred = true;

		// Nearest first, because the tiles that matter are the ones being walked
		// into. Filling the window in index order fills a corner of it while the
		// ground ahead is still bare.
		Pending.Reset();
		for (int32 Y = -TileRadius; Y <= TileRadius; ++Y)
		{
			for (int32 X = -TileRadius; X <= TileRadius; ++X)
			{
				const FIntPoint Tile(Centre.X + X, Centre.Y + Y);
				const int32 Slot = SlotOf(Tile);
				if (SlotTiles[Slot] != Tile || SlotBands[Slot] != BandOf(Tile))
				{
					Pending.Add(Tile);
				}
			}
		}
		Pending.Sort([Centre](const FIntPoint& A, const FIntPoint& B)
		{
			const int32 DistA = FMath::Square(A.X - Centre.X) + FMath::Square(A.Y - Centre.Y);
			const int32 DistB = FMath::Square(B.X - Centre.X) + FMath::Square(B.Y - Centre.Y);
			return DistA < DistB;
		});
	}

	const int32 Budget = FMath::Min(FMath::Max(1, MaxTilesPerTick), Pending.Num());
	for (int32 Index = 0; Index < Budget; ++Index)
	{
		WindowPlaced += BuildTile(Pending[Index]);
	}
	if (Budget > 0)
	{
		Pending.RemoveAt(0, Budget, EAllowShrinking::No);
	}

	// Once per window rather than per tile: what is worth knowing is how much of
	// the reserved space the ground actually took. All of it means the budget is
	// the limit and the field is thinner than it was asked for; none of it means
	// the masks rejected everything, which looks the same on screen as a field
	// that never loaded its material.
	if (bPendingWasNonEmpty && Pending.Num() == 0)
	{
		const int32 Slots = SlotTiles.Num() * PerVariant * Variants.Num();
		UE_LOG(LogKBVEWorldGrass, Display,
			TEXT("window around tile %d,%d: %d clumps in %d slots over %d tiles (%d variants)"),
			CentreTile.X, CentreTile.Y, WindowPlaced, Slots, SlotTiles.Num(), Variants.Num());
		UE_LOG(LogKBVEWorldGrass, Display,
			TEXT("turned away: %d bare, %d drowned, %d steep, %d river, %d road, %d bridge"),
			WindowRejected.Bare, WindowRejected.Drowned, WindowRejected.Steep,
			WindowRejected.River, WindowRejected.Road, WindowRejected.Bridge);
		WindowPlaced = 0;
		WindowRejected = FRejections();
	}
	bPendingWasNonEmpty = Pending.Num() > 0;
}
