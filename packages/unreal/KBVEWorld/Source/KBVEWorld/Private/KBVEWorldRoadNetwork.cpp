#include "KBVEWorldRoadNetwork.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldFenceMass.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldInstancePool.h"
#include "KBVEWorldStreamer.h"
#include "EngineUtils.h"
#include "MassEntitySubsystem.h"
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

	// The supports collide as the boxes they are drawn from rather than as the
	// section's triangles. A convex hull is what a cook would derive from a box
	// anyway, and a crossing carries twenty of them: cooking them is work spent
	// arriving back at the shape that was passed in.
	void CommitBlocks(UProceduralMeshComponent* Mesh, const TArray<FBox>& Blocks,
		const FVector& Origin)
	{
		Mesh->ClearCollisionConvexMeshes();

		TArray<TArray<FVector>> Hulls;
		Hulls.Reserve(Blocks.Num());

		for (const FBox& Block : Blocks)
		{
			const FVector Min = Block.Min - Origin;
			const FVector Max = Block.Max - Origin;

			TArray<FVector>& Hull = Hulls.AddDefaulted_GetRef();
			Hull.Reserve(8);
			Hull.Add(FVector(Min.X, Min.Y, Min.Z));
			Hull.Add(FVector(Max.X, Min.Y, Min.Z));
			Hull.Add(FVector(Max.X, Max.Y, Min.Z));
			Hull.Add(FVector(Min.X, Max.Y, Min.Z));
			Hull.Add(FVector(Min.X, Min.Y, Max.Z));
			Hull.Add(FVector(Max.X, Min.Y, Max.Z));
			Hull.Add(FVector(Max.X, Max.Y, Max.Z));
			Hull.Add(FVector(Min.X, Max.Y, Max.Z));
		}

		Mesh->SetCollisionConvexMeshes(Hulls);
	}

	// Each box, as the transform that puts the level's cube on it. The scale comes
	// off the mesh's own bounds, so a level is free to assign a cube of any size
	// rather than having to match a number this plugin picked.
	TArray<FTransform> TransformsFor(const TArray<FKBVEWorldBridgePart>& Parts,
		const UStaticMesh* Mesh)
	{
		TArray<FTransform> Out;
		if (!Mesh)
		{
			return Out;
		}

		Out.Reserve(Parts.Num());
		for (const FKBVEWorldBridgePart& Part : Parts)
		{
			Out.Emplace(Part.Rotation, Part.Centre,
				UKBVEWorldInstancePool::BoxScaleFor(Mesh, Part.Size));
		}
		return Out;
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

	// The supports carry convex hulls rather than a cooked section, so there is
	// no complex geometry for a simple query to fall through to. Left on, every
	// trace against a pier would find nothing there.
	Stone->bUseComplexAsSimpleCollision = false;
}

void AKBVEWorldRoadChunk::Build(const FBuild& In, FParts& OutParts)
{
	const FKBVEWorldRoadParams& RoadParams = *In.Road;
	const FKBVEWorldHeightfieldParams& Shape = *In.Shape;
	const FKBVEWorldRoadField* Field = In.Field;
	const int32 InSeed = In.Seed;

	Coord = In.Coord;
	bActive = true;
	bDetailed = In.bDetailed;

	const float ChunkSize = RoadParams.TilesPerChunk * RoadParams.WorldUnitsPerTile;
	const FVector Origin((In.Coord.X + 0.5f) * ChunkSize, (In.Coord.Y + 0.5f) * ChunkSize, 0.0f);
	SetActorLocation(Origin);

	FKBVEWorldBridgeMesh Data;

	if (Field)
	{
		const float ChunkSize2 = RoadParams.TilesPerChunk * RoadParams.WorldUnitsPerTile;
		Field->EnsureCovers(FVector2D(Origin) - FVector2D(ChunkSize2, ChunkSize2),
			FVector2D(Origin) + FVector2D(ChunkSize2 * 2.0f, ChunkSize2 * 2.0f));
	}

	const FIntPoint Neighbours[2] = { FIntPoint(1, 0), FIntPoint(0, 1) };

	TArray<FKBVEWorldRoadSpan> Spans;

	ReleaseFenceRuns();
	EdgePaths.SetNum(2);
	Runs.Reset();
	RunEdge.Reset();

	// Only the crossings. The road surface itself is painted into the terrain and
	// graded into it, so there is no strip here to stand off the ground; a bridge
	// is the one part of a road that is meant to.
	for (int32 Step = 0; Step < 2; ++Step)
	{
		TArray<FVector>& Path = EdgePaths[Step];
		const FIntPoint Edge = In.Coord + Neighbours[Step];

		// Taken from the field rather than routed again. EnsureCovers above has
		// already run this exact edge through Viterbi and kept the result, so
		// routing here is a second pass for an answer that is already held -- and
		// it is not even the same answer. The field smooths the route's profile
		// before storing it, and that smoothed height is the one the terrain is
		// graded to, which is what FindRiverSpans says it wants to measure the
		// water against. Routing here got the raw profile instead, so the ground
		// and the crossings could disagree about where a river is.
		if (const TArray<FVector>* Routed = Field ? Field->FindEdge(In.Coord, Step) : nullptr)
		{
			Path = *Routed;
		}
		else
		{
			FKBVEWorldRoadGraph::RouteEdge(RoadParams, Shape, InSeed, In.Coord, Edge, Path);
		}

		if (Path.Num() < 2)
		{
			continue;
		}

		FKBVEWorldRoadGraph::FindRiverSpans(RoadParams, Shape, InSeed, Path, Spans);
		for (const FKBVEWorldRoadSpan& Span : Spans)
		{
			FKBVEWorldBridge::Build(*In.Bridge, In.BridgeLod, RoadParams, Shape, InSeed, Field,
				Path, Span, Data);
		}

		// Where the fences are, which is cheap and touches no ground. What they
		// are made of waits until something is near enough to look at them.
		if (In.Fence)
		{
			TArray<FKBVEWorldFenceRun> EdgeRuns;
			FKBVEWorldFence::FindRuns(*In.Fence, RoadParams, InSeed, In.Coord, Path, Spans,
				EdgeRuns);

			for (const FKBVEWorldFenceRun& Run : EdgeRuns)
			{
				Runs.Add(Run);
				RunEdge.Add(Step);
			}
		}
	}

	SpawnFenceRuns(In);

	FKBVEWorldFenceMesh Fences;
	BuildFenceParts(In, Fences);

	// World space, because the pool holds one component for the whole world and
	// the rebase below is a thing only this chunk's own sections want.
	BridgeParts.Stone = TransformsFor(Data.StoneParts, In.PartMesh);
	BridgeParts.Wood = TransformsFor(Data.WoodParts, In.PartMesh);

	OutParts.Stone = BridgeParts.Stone;
	OutParts.Wood = BridgeParts.Wood;
	OutParts.Stone.Append(TransformsFor(Fences.Stone, In.PartMesh));
	OutParts.Wood.Append(TransformsFor(Fences.Wood, In.PartMesh));

	UMaterialInterface* WoodMaterial = In.WoodMaterial;
	UMaterialInterface* StoneMaterial = In.StoneMaterial;
	const float MaxDrawDistance = In.MaxDrawDistance;

	Rebase(Data.Wood, Origin);
	Rebase(Data.Stone, Origin);

	Commit(Wood, Data.Wood, WoodMaterial, true);
	Commit(Stone, Data.Stone, StoneMaterial, false);

	// The supports collide as blocks whether they were drawn as triangles here or
	// as instances elsewhere, so this does not care which happened.
	CommitBlocks(Stone, Data.Blocks, Origin);

	for (UProceduralMeshComponent* Mesh : { Wood.Get(), Stone.Get() })
	{
		Mesh->SetCullDistance(MaxDrawDistance);
	}

	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
}

void AKBVEWorldRoadChunk::SpawnFenceRuns(const FBuild& In)
{
	if (Runs.Num() == 0)
	{
		return;
	}

	if (!Mass)
	{
		Mass = UWorld::GetSubsystem<UMassEntitySubsystem>(GetWorld());
	}
	if (!Mass)
	{
		return;
	}

	FMassEntityManager& Manager = Mass->GetMutableEntityManager();

	const FMassArchetypeHandle Archetype = Manager.CreateArchetype(
		TArray<const UScriptStruct*>{
			FKBVEWorldFenceRunFragment::StaticStruct(),
			FKBVEWorldFenceRunTag::StaticStruct() });

	FenceRuns.Reserve(Runs.Num());

	for (int32 I = 0; I < Runs.Num(); ++I)
	{
		const FKBVEWorldFenceRun& Run = Runs[I];
		const TArray<FVector>& Path = EdgePaths[RunEdge[I]];
		if (Path.Num() < 2)
		{
			continue;
		}

		const FMassEntityHandle Entity = Manager.CreateEntity(Archetype);
		FKBVEWorldFenceRunFragment& Fragment =
			Manager.GetFragmentDataChecked<FKBVEWorldFenceRunFragment>(Entity);

		Fragment.Edge = In.Coord;
		Fragment.Side = Run.Side;
		Fragment.Begin = Run.Begin;
		Fragment.End = Run.End;
		Fragment.RunSeed = Run.Seed;
		Fragment.Style = static_cast<uint8>(Run.Style);

		// Where the run is and how far it reaches, so the processor can measure
		// against it without going back to the road for a polyline.
		const FVector Head = FKBVEWorldFence::PointAt(Path, Run.Begin);
		const FVector Tail = FKBVEWorldFence::PointAt(Path, Run.End);
		Fragment.Centre = (Head + Tail) * 0.5f;
		Fragment.Radius = FVector::Dist(Head, Tail) * 0.5f;

		// Built at full detail and told so, rather than left at zero and rebuilt
		// on the first tick for no reason.
		Fragment.Detail = static_cast<uint8>(EKBVEWorldFenceDetail::Full);
		Fragment.WantedDetail = Fragment.Detail;

		FenceRuns.Add(Entity);
	}
}

void AKBVEWorldRoadChunk::ReleaseFenceRuns()
{
	if (FenceRuns.Num() == 0)
	{
		return;
	}

	if (Mass)
	{
		FMassEntityManager& Manager = Mass->GetMutableEntityManager();
		for (const FMassEntityHandle& Entity : FenceRuns)
		{
			if (Manager.IsEntityValid(Entity))
			{
				Manager.DestroyEntity(Entity);
			}
		}
	}

	FenceRuns.Reset();
}

void AKBVEWorldRoadChunk::BuildFenceParts(const FBuild& In, FKBVEWorldFenceMesh& Out)
{
	if (!In.Fence || Runs.Num() == 0)
	{
		return;
	}

	FMassEntityManager* Manager = Mass ? &Mass->GetMutableEntityManager() : nullptr;

	for (int32 I = 0; I < Runs.Num() && I < FenceRuns.Num(); ++I)
	{
		const TArray<FVector>& Path = EdgePaths[RunEdge[I]];
		if (Path.Num() < 2)
		{
			continue;
		}

		EKBVEWorldFenceDetail Detail = EKBVEWorldFenceDetail::Full;
		if (Manager && Manager->IsEntityValid(FenceRuns[I]))
		{
			FKBVEWorldFenceRunFragment& Fragment =
				Manager->GetFragmentDataChecked<FKBVEWorldFenceRunFragment>(FenceRuns[I]);
			Detail = static_cast<EKBVEWorldFenceDetail>(Fragment.WantedDetail);
			Fragment.Detail = Fragment.WantedDetail;
		}

		FKBVEWorldFence::BuildRun(*In.Fence, *In.Road, *In.Shape, In.Seed, In.Field, Path,
			Runs[I], Detail, Out);
	}
}

bool AKBVEWorldRoadChunk::RebuildFences(const FBuild& In, FParts& OutParts)
{
	if (!Mass || FenceRuns.Num() == 0)
	{
		return false;
	}

	FMassEntityManager& Manager = Mass->GetMutableEntityManager();

	bool bStale = false;
	for (const FMassEntityHandle& Entity : FenceRuns)
	{
		if (!Manager.IsEntityValid(Entity))
		{
			continue;
		}
		const FKBVEWorldFenceRunFragment& Fragment =
			Manager.GetFragmentDataChecked<FKBVEWorldFenceRunFragment>(Entity);
		if (Fragment.Detail != Fragment.WantedDetail)
		{
			bStale = true;
			break;
		}
	}

	if (!bStale)
	{
		return false;
	}

	FKBVEWorldFenceMesh Fences;
	BuildFenceParts(In, Fences);

	// The crossings go back too. They share a bucket and a key with the fences,
	// so submitting one without the other is submitting that this chunk's bridges
	// are gone.
	OutParts.Stone = BridgeParts.Stone;
	OutParts.Wood = BridgeParts.Wood;
	OutParts.Stone.Append(TransformsFor(Fences.Stone, In.PartMesh));
	OutParts.Wood.Append(TransformsFor(Fences.Wood, In.PartMesh));
	return true;
}

void AKBVEWorldRoadChunk::Release()
{
	ReleaseFenceRuns();
	bActive = false;
	Wood->ClearAllMeshSections();
	Stone->ClearAllMeshSections();
	Stone->ClearCollisionConvexMeshes();
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
}

AKBVEWorldRoadNetwork::AKBVEWorldRoadNetwork()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));

	Parts = CreateDefaultSubobject<UKBVEWorldInstancePool>(TEXT("Parts"));
	Parts->SetupAttachment(GetRootComponent());
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

AKBVEWorldRoadChunk::FBuild AKBVEWorldRoadNetwork::MakeBuild(const FIntPoint& Coord, int32 Seed,
	bool bDetailed, bool bInstanced, float DrawDistance) const
{
	AKBVEWorldRoadChunk::FBuild In;
	In.Coord = Coord;
	In.Seed = Seed;
	In.bDetailed = bDetailed;
	In.MaxDrawDistance = DrawDistance;

	In.Road = &Road;
	In.Shape = &Shape;
	In.Field = Streamer ? Streamer->GetRoadField() : nullptr;

	In.Bridge = &Bridge;
	In.BridgeLod.CurveSubdivisions = bDetailed ? Bridge.CurveSubdivisions : 1;
	In.BridgeLod.bFrame = bDetailed;
	In.BridgeLod.bInstancedParts = bInstanced;

	// Fences are instanced or they are nothing: a run is hundreds of boxes, and
	// building them into a chunk's own section is the case the pool exists to
	// avoid. Without a mesh to instance, the roads simply have no fences.
	In.Fence = bInstanced ? &Fence : nullptr;

	In.WoodMaterial = WoodMaterial;
	In.StoneMaterial = StoneMaterial;
	In.PartMesh = bInstanced ? PartMesh.Get() : nullptr;
	return In;
}

bool AKBVEWorldRoadNetwork::WantsDetail(const FIntPoint& Centre, const FIntPoint& Coord) const
{
	const FIntPoint Delta = Coord - Centre;
	return FMath::Max(FMath::Abs(Delta.X), FMath::Abs(Delta.Y)) <= DetailRadiusChunks;
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
		if (Parts)
		{
			Parts->Release(Key);
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
			const TObjectPtr<AKBVEWorldRoadChunk>* Existing = Live.Find(Coord);

			// A chunk keeps whatever detail it was built at, and the ring it sits
			// in moves with the viewer. Without requeueing on that change a
			// crossing entered from the edge of the window keeps its far level all
			// the way in, and the bridge under the pawn is the one with no frame.
			if (!Existing || !*Existing
				|| (*Existing)->IsDetailed() != WantsDetail(Centre, Coord))
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

	// Measured from the window's own reach, so widening the window widens the
	// cull with it rather than leaving a ring of chunks built and never drawn.
	const float ChunkSize = FMath::Max(Road.TilesPerChunk * Road.WorldUnitsPerTile, 1.0f);
	const float DrawDistance = DrawDistanceMarginChunks > 0.0f
		? (ViewRadiusChunks + DrawDistanceMarginChunks) * ChunkSize
		: 0.0f;

	// Buckets are made on the first tick that has a mesh to make them from, so a
	// level that assigns one later does not need the actor rebuilt.
	if (Parts && PartMesh && StoneBucket == INDEX_NONE)
	{
		StoneBucket = Parts->EnsureBucket(PartMesh, StoneMaterial, DrawDistance);
		WoodBucket = Parts->EnsureBucket(PartMesh, WoodMaterial, DrawDistance);
	}

	const bool bInstanced = Parts && PartMesh && StoneBucket != INDEX_NONE;

	while (Pending.Num() > 0 && Built < MaxBuildsPerTick)
	{
		const FIntPoint Coord = Pending[0];
		Pending.RemoveAt(0, EAllowShrinking::No);

		const bool bDetailed = WantsDetail(Centre, Coord);

		// A live chunk in the queue is one whose ring has changed detail, so it is
		// rebuilt in place rather than skipped. Releasing it first would drop the
		// crossing for as many ticks as the queue is deep.
		AKBVEWorldRoadChunk* Chunk = nullptr;
		if (TObjectPtr<AKBVEWorldRoadChunk>* Existing = Live.Find(Coord))
		{
			if (*Existing && (*Existing)->IsDetailed() == bDetailed)
			{
				continue;
			}
			Chunk = *Existing;
		}

		if (!Chunk && Pool.Num() > 0)
		{
			Chunk = Pool.Pop(EAllowShrinking::No);
		}
		else if (!Chunk)
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

		AKBVEWorldRoadChunk::FParts ChunkParts;
		const AKBVEWorldRoadChunk::FBuild In = MakeBuild(Coord, Seed, bDetailed, bInstanced,
			DrawDistance);

		const double Start = FPlatformTime::Seconds();
		Chunk->Build(In, ChunkParts);
		LastBuildMs = static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0);

		if (bInstanced)
		{
			Parts->Submit(StoneBucket, Coord, MoveTemp(ChunkParts.Stone));
			Parts->Submit(WoodBucket, Coord, MoveTemp(ChunkParts.Wood));
		}

		Live.Add(Coord, Chunk);
		++Built;
	}

	// Whatever the fence processor decided since the last tick. It writes a tier
	// and stops there -- standing the posts up is a component's business, and a
	// Mass processor has none with components.
	if (bInstanced && Built == 0)
	{
		int32 Restood = 0;
		for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>>& Pair : Live)
		{
			if (!Pair.Value || Restood >= MaxBuildsPerTick)
			{
				continue;
			}

			AKBVEWorldRoadChunk::FParts FenceParts;
			const AKBVEWorldRoadChunk::FBuild In = MakeBuild(Pair.Key, Seed,
				Pair.Value->IsDetailed(), bInstanced, DrawDistance);

			if (Pair.Value->RebuildFences(In, FenceParts))
			{
				Parts->Submit(StoneBucket, Pair.Key, MoveTemp(FenceParts.Stone));
				Parts->Submit(WoodBucket, Pair.Key, MoveTemp(FenceParts.Wood));
				++Restood;
			}
		}
	}

	// Once per tick rather than per chunk: a bucket is rebuilt from all its keys,
	// so flushing inside the loop would rebuild it once for every chunk built.
	if (Parts)
	{
		Parts->Flush();
	}

	if (Built > 0 && Pending.Num() == 0)
	{
		UE_LOG(LogKBVEWorldStream, Display,
			TEXT("road window filled at %d,%d: %d live (%d pooled), last build %.2f ms"),
			Centre.X, Centre.Y, Live.Num(), Pool.Num(), LastBuildMs);
	}
}
