#include "KBVEWorldGrassField.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldGrassCard.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldStreamer.h"
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"

DEFINE_LOG_CATEGORY(LogKBVEWorldGrass);

namespace
{
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

	// Measured off grass_bermuda_01, whose clumps are laid out to fill the sheet
	// rather than to fill a lattice. Replaced wholesale by whatever sheet the
	// project points at; they are defaults, not a description of every atlas.
	const float Boxes[12][4] = {
		{ 364.f, 28.f, 484.f, 320.f },
		{ 548.f, 32.f, 680.f, 236.f },
		{ 696.f, 112.f, 972.f, 244.f },
		{ 44.f, 160.f, 320.f, 296.f },
		{ 52.f, 428.f, 192.f, 556.f },
		{ 284.f, 412.f, 472.f, 552.f },
		{ 552.f, 368.f, 736.f, 560.f },
		{ 796.f, 328.f, 960.f, 564.f },
		{ 48.f, 696.f, 176.f, 1012.f },
		{ 236.f, 644.f, 396.f, 1012.f },
		{ 432.f, 700.f, 632.f, 1016.f },
		{ 712.f, 680.f, 888.f, 1016.f }
	};
	AtlasCells.Reserve(UE_ARRAY_COUNT(Boxes));
	for (const float* Box : Boxes)
	{
		AtlasCells.Emplace(Box[0] / 1024.0, Box[1] / 1024.0, Box[2] / 1024.0, Box[3] / 1024.0);
	}
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

bool AKBVEWorldGrassField::EnsureComponents()
{
	if (Variants.Num() > 0)
	{
		return true;
	}

	if (AtlasCells.Num() == 0)
	{
		return false;
	}

	LoadedMaterial = CardMaterial.IsValid() ? CardMaterial.Get() : CardMaterial.LoadSynchronous();
	if (!LoadedMaterial)
	{
		return false;
	}

	const int32 Count = FMath::Max(1, VariantCount);
	PerVariant = FMath::Max(1, InstancesPerTile / Count);

	const int32 Edge = 2 * TileRadius + 1;
	const int32 Slots = Edge * Edge;

	TArray<FTransform> Empty;
	Empty.Init(HiddenInstance(), Slots * PerVariant);

	for (int32 Index = 0; Index < Count; ++Index)
	{
		FKBVEWorldGrassCard::FSpec Spec;
		Spec.Height = ClumpHeight;
		Spec.UniqueId = *FString::Printf(TEXT("KBVEWorld_GrassCard_%d_%d_%d"),
			Index, FMath::RoundToInt(ClumpHeight), AtlasCells.Num());

		// Each variant takes its own draw of cells, so one clump is several
		// different photographs crossed through each other rather than the same
		// one turned three ways -- which reads as a printed shape from above.
		FRandomStream Rng(GetTypeHash(Spec.UniqueId));
		for (int32 Sheet = 0; Sheet < FMath::Max(1, SheetsPerClump); ++Sheet)
		{
			const FVector4& Cell = AtlasCells[Rng.RandRange(0, AtlasCells.Num() - 1)];
			Spec.Cells.Emplace(
				static_cast<float>(Cell.X), static_cast<float>(Cell.Y),
				static_cast<float>(Cell.Z), static_cast<float>(Cell.W));
		}

		UStaticMesh* Mesh = FKBVEWorldGrassCard::GetOrCreateClumpMesh(this, Spec, LoadedMaterial);
		if (!Mesh)
		{
			continue;
		}

		UInstancedStaticMeshComponent* Component =
			NewObject<UInstancedStaticMeshComponent>(this, NAME_None, RF_Transient);
		Component->SetStaticMesh(Mesh);
		Component->SetMaterial(0, LoadedMaterial);
		Component->SetupAttachment(GetRootComponent());

		// Submissions are world space, so the component must not add its own.
		Component->SetAbsolute(true, true, true);

		Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Component->SetCastShadow(bCastShadow);
		Component->bAffectDistanceFieldLighting = false;
		Component->bAffectDynamicIndirectLighting = false;
		Component->SetCullDistances(CullStart, CullEnd);
		Component->PrimaryComponentTick.bCanEverTick = false;
		Component->RegisterComponent();

		Component->AddInstances(Empty, false, true);

		Variants.Add(Component);
		VariantMeshes.Add(Mesh);
	}

	if (Variants.Num() == 0)
	{
		return false;
	}

	SlotTiles.Init(UnfilledSlot, Slots);
	return true;
}

int32 AKBVEWorldGrassField::SlotOf(const FIntPoint& Tile) const
{
	const int32 Edge = 2 * TileRadius + 1;
	const int32 X = ((Tile.X % Edge) + Edge) % Edge;
	const int32 Y = ((Tile.Y % Edge) + Edge) % Edge;
	return X * Edge + Y;
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
	TArray<FTransform> Batch;
	Batch.SetNumUninitialized(PerVariant);
	int32 Placed = 0;

	for (UInstancedStaticMeshComponent* Component : Variants)
	{
		for (int32 Index = 0; Index < PerVariant; ++Index)
		{
			const float LocalX = Rng.FRand() * Size;
			const float LocalY = Rng.FRand() * Size;
			const float WorldX = Min.X + LocalX;
			const float WorldY = Min.Y + LocalY;

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

			const bool bDrowned = Ground < WaterLine;
			const bool bSteep = Slope > MaxSlope;
			const bool bRiver = FKBVEWorldHeightfield::RiverMaskAt(Owner->Shape, Seed,
				WorldX / 100.0f, WorldY / 100.0f) > 0.2f;
			const bool bRoad = Field && Field->SurfaceWeight(WorldX, WorldY) > MaxRoadWeight;

			if (bDrowned || bSteep || bRiver || bRoad)
			{
				Batch[Index] = HiddenInstance();
				continue;
			}

			++Placed;
			const float Scale = Rng.FRandRange(ClumpScale.Min, ClumpScale.Max);
			Batch[Index] = FTransform(
				FRotator(0.0f, Rng.FRand() * 360.0f, 0.0f),
				FVector(WorldX, WorldY, Ground - SinkDepth),
				FVector(Scale));
		}

		Component->BatchUpdateInstancesTransforms(Slot * PerVariant, Batch, true, true, true);
	}

	SlotTiles[Slot] = Tile;
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
				if (SlotTiles[SlotOf(Tile)] != Tile)
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
		WindowPlaced = 0;
	}
	bPendingWasNonEmpty = Pending.Num() > 0;
}
