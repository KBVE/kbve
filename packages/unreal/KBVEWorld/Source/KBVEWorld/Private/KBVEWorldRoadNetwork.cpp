#include "KBVEWorldRoadNetwork.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldStreamer.h"
#include "EngineUtils.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldStreamer.h"
#include "ProceduralMeshComponent.h"

namespace
{
	void Commit(UProceduralMeshComponent* Mesh, const FKBVEWorldRibbonMesh& Data,
		UMaterialInterface* Material, bool bCollision)
	{
		Mesh->ClearAllMeshSections();
		if (Data.IsEmpty())
		{
			return;
		}

		const TArray<FLinearColor> NoColors;
		Mesh->CreateMeshSection_LinearColor(0, Data.Vertices, Data.Triangles, Data.Normals,
			Data.UV0, NoColors, Data.Tangents, bCollision);
		if (Material)
		{
			Mesh->SetMaterial(0, Material);
		}
	}

	void Rebase(FKBVEWorldRibbonMesh& Data, const FVector& Origin)
	{
		for (FVector& V : Data.Vertices)
		{
			V -= Origin;
		}
	}
}

AKBVEWorldRoadChunk::AKBVEWorldRoadChunk()
{
	PrimaryActorTick.bCanEverTick = false;

	USceneComponent* SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(SceneRoot);

	Wood = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Wood"));
	Stone = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Stone"));

	for (UProceduralMeshComponent* Mesh : { Wood.Get(), Stone.Get() })
	{
		Mesh->SetupAttachment(SceneRoot);
		Mesh->bUseAsyncCooking = true;
	}

	// A deck is the only thing between a pawn and the river, so unlike the road
	// surface -- which is terrain, and collides as terrain -- it carries its own.
	Wood->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Stone->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
}

void AKBVEWorldRoadChunk::Build(const FIntPoint& InCoord, int32 InSeed,
	const FKBVEWorldRoadParams& RoadParams, const FKBVEWorldBridgeParams& BridgeParams,
	const FKBVEWorldHeightfieldParams& Shape, const FKBVEWorldRoadField* Field,
	UMaterialInterface* WoodMaterial, UMaterialInterface* StoneMaterial)
{
	Coord = InCoord;
	bActive = true;

	const float ChunkSize = RoadParams.TilesPerChunk * RoadParams.WorldUnitsPerTile;
	const FVector Origin((InCoord.X + 0.5f) * ChunkSize, (InCoord.Y + 0.5f) * ChunkSize, 0.0f);
	SetActorLocation(Origin);

	FKBVEWorldRibbonMesh WoodData;
	FKBVEWorldRibbonMesh StoneData;

	if (Field)
	{
		const float ChunkSize2 = RoadParams.TilesPerChunk * RoadParams.WorldUnitsPerTile;
		Field->EnsureCovers(FVector2D(Origin) - FVector2D(ChunkSize2, ChunkSize2),
			FVector2D(Origin) + FVector2D(ChunkSize2 * 2.0f, ChunkSize2 * 2.0f));
	}

	const FIntPoint Neighbours[2] = { FIntPoint(1, 0), FIntPoint(0, 1) };

	TArray<FVector> Path;
	TArray<FKBVEWorldRoadSpan> Spans;

	// Only the crossings. The road surface itself is painted into the terrain and
	// graded into it, so there is no strip here to stand off the ground; a bridge
	// is the one part of a road that is meant to.
	for (const FIntPoint& Step : Neighbours)
	{
		FKBVEWorldRoadGraph::RouteEdge(RoadParams, Shape, InSeed, InCoord, InCoord + Step, Path);
		if (Path.Num() < 2)
		{
			continue;
		}

		FKBVEWorldRoadGraph::FindRiverSpans(RoadParams, Shape, InSeed, Path, Spans);
		for (const FKBVEWorldRoadSpan& Span : Spans)
		{
			FKBVEWorldBridge::Build(BridgeParams, RoadParams, Shape, InSeed, Field, Path, Span,
				WoodData, StoneData);
		}
	}

	Rebase(WoodData, Origin);
	Rebase(StoneData, Origin);

	Commit(Wood, WoodData, WoodMaterial, true);
	Commit(Stone, StoneData, StoneMaterial, true);

	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
}

void AKBVEWorldRoadChunk::Release()
{
	bActive = false;
	Wood->ClearAllMeshSections();
	Stone->ClearAllMeshSections();
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
}

AKBVEWorldRoadNetwork::AKBVEWorldRoadNetwork()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AKBVEWorldRoadNetwork::BeginPlay()
{
	Super::BeginPlay();
	LastCentre = FIntPoint(MAX_int32, MAX_int32);
}

void AKBVEWorldRoadNetwork::EndPlay(const EEndPlayReason::Type Reason)
{
	for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>>& Pair : Live)
	{
		if (Pair.Value)
		{
			Pair.Value->Destroy();
		}
	}
	Live.Reset();

	for (AKBVEWorldRoadChunk* Chunk : Pool)
	{
		if (Chunk)
		{
			Chunk->Destroy();
		}
	}
	Pool.Reset();
	Pending.Reset();

	Super::EndPlay(Reason);
}

AKBVEWorldStreamer* AKBVEWorldRoadNetwork::FindStreamer()
{
	if (Streamer)
	{
		return Streamer;
	}

	TActorIterator<AKBVEWorldStreamer> It(GetWorld());
	Streamer = It ? *It : nullptr;
	return Streamer;
}

bool AKBVEWorldRoadNetwork::TryGetViewLocation(FVector& Out) const
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

FIntPoint AKBVEWorldRoadNetwork::ChunkCoordAt(const FVector& WorldLocation) const
{
	const float ChunkSize = FMath::Max(Road.TilesPerChunk * Road.WorldUnitsPerTile, 1.0f);
	return FIntPoint(
		FMath::FloorToInt(WorldLocation.X / ChunkSize),
		FMath::FloorToInt(WorldLocation.Y / ChunkSize));
}

void AKBVEWorldRoadNetwork::ReleaseOutsideRadius(const FIntPoint& Centre)
{
	TArray<FIntPoint> Gone;
	for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>>& Pair : Live)
	{
		const FIntPoint Delta = Pair.Key - Centre;
		if (FMath::Abs(Delta.X) > ViewRadiusChunks || FMath::Abs(Delta.Y) > ViewRadiusChunks)
		{
			Gone.Add(Pair.Key);
		}
	}

	for (const FIntPoint& Key : Gone)
	{
		if (AKBVEWorldRoadChunk* Chunk = Live.FindAndRemoveChecked(Key))
		{
			Chunk->Release();
			Pool.Add(Chunk);
		}
	}
}

void AKBVEWorldRoadNetwork::QueueInsideRadius(const FIntPoint& Centre)
{
	Pending.Reset();
	for (int32 Y = -ViewRadiusChunks; Y <= ViewRadiusChunks; ++Y)
	{
		for (int32 X = -ViewRadiusChunks; X <= ViewRadiusChunks; ++X)
		{
			const FIntPoint Coord = Centre + FIntPoint(X, Y);
			if (!Live.Contains(Coord))
			{
				Pending.Add(Coord);
			}
		}
	}

	// Nearest first, so the road under the viewer exists before the one at the
	// edge of the window does.
	Pending.Sort([Centre](const FIntPoint& A, const FIntPoint& B)
	{
		return (A - Centre).SizeSquared() < (B - Centre).SizeSquared();
	});
}

void AKBVEWorldRoadNetwork::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FVector ViewLocation;
	TryGetViewLocation(ViewLocation);
	const FIntPoint Centre = ChunkCoordAt(ViewLocation);

	if (Centre != LastCentre)
	{
		LastCentre = Centre;
		ReleaseOutsideRadius(Centre);
		QueueInsideRadius(Centre);
	}

	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(WorldSeed);
	int32 Built = 0;

	while (Pending.Num() > 0 && Built < MaxBuildsPerTick)
	{
		const FIntPoint Coord = Pending[0];
		Pending.RemoveAt(0, EAllowShrinking::No);

		if (Live.Contains(Coord))
		{
			continue;
		}

		AKBVEWorldRoadChunk* Chunk = nullptr;
		if (Pool.Num() > 0)
		{
			Chunk = Pool.Pop(EAllowShrinking::No);
		}
		else
		{
			FActorSpawnParameters Params;
			Params.ObjectFlags |= RF_Transient;
			Params.Owner = this;
			Chunk = World->SpawnActor<AKBVEWorldRoadChunk>(AKBVEWorldRoadChunk::StaticClass(),
				FTransform::Identity, Params);
		}

		if (!Chunk)
		{
			break;
		}

		const double Start = FPlatformTime::Seconds();
		Chunk->Build(Coord, Seed, Road, Bridge, Shape, Streamer ? Streamer->GetRoadField() : nullptr,
			WoodMaterial, StoneMaterial);
		LastBuildMs = static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0);
		Live.Add(Coord, Chunk);
		++Built;
	}

	if (Built > 0 && Pending.Num() == 0)
	{
		UE_LOG(LogKBVEWorldStream, Display,
			TEXT("road window filled at %d,%d: %d live (%d pooled), last build %.2f ms"),
			Centre.X, Centre.Y, Live.Num(), Pool.Num(), LastBuildMs);
	}
}
