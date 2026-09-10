#include "KBVEWorldRoadNetwork.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldChunkDirty.h"
#include "KBVEWorldFenceMass.h"
#include "KBVEWorldGrassAtlas.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldInstancePool.h"
#include "KBVEWorldIvyCard.h"
#include "KBVEWorldVillageMass.h"
#include "KBVEWorldStreamer.h"
#include "EngineUtils.h"
#include "MassEntitySubsystem.h"
#include "KBVEWorldRibbon.h"
#include "KBVEWorldStreamer.h"
#include "KBVEPerf.h"
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

	// The sprigs of both plants, sorted into the buckets they are drawn from.
	//
	// Every array is written whether or not anything landed in it: the pool
	// replaces a key wholesale, so a variant left out is not a variant unchanged,
	// it is that variant's leaves gone from this chunk.
	void GatherIvy(TArrayView<const FKBVEWorldIvySprig> Wall,
		TArrayView<const FKBVEWorldIvySprig> Post, int32 Variants,
		TArray<TArray<FTransform>>& Out)
	{
		Out.Reset();
		if (Variants <= 0)
		{
			return;
		}

		Out.SetNum(Variants);
		for (TArrayView<const FKBVEWorldIvySprig> Source : { Wall, Post })
		{
			for (const FKBVEWorldIvySprig& Sprig : Source)
			{
				// Modulo rather than a clamp: a sheet with fewer cells than the
				// placement drew variants from would otherwise pile every leaf
				// past the end onto the last one.
				const int32 Bucket = ((Sprig.Variant % Variants) + Variants) % Variants;
				Out[Bucket].Emplace(Sprig.Rotation, Sprig.Centre,
					FVector(Sprig.Size / FKBVEWorldIvyCard::SprigHeight));
			}
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
	// Only while a door is moving. A chunk with nothing swinging on it is a
	// chunk with nothing to do every frame, and there are a lot of chunks.
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	USceneComponent* SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(SceneRoot);

	Wood = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Wood"));
	Stone = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Stone"));
	Brick = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Brick"));
	Roof = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Roof"));
	Joinery = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Joinery"));
	Glazing = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Glazing"));
	Plinth = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Plinth"));
	Vines = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Vines"));

	for (UProceduralMeshComponent* Mesh : { Wood.Get(), Stone.Get(), Brick.Get(), Roof.Get(),
		Joinery.Get(), Glazing.Get(), Plinth.Get(), Vines.Get() })
	{
		Mesh->SetupAttachment(SceneRoot);
		Mesh->bUseAsyncCooking = true;

		// Chunks are pooled, so an unbuilt one exists with six empty components
		// on it. Navigation registers each anyway and warns about the bounds
		// every time, which is six lines per chunk across a whole stream; the
		// heightfield patches were taken off navigation for the same reason,
		// and nothing here wants a navmesh either.
		Mesh->SetCanEverAffectNavigation(false);
	}

	// A deck is the only thing between a pawn and the river, so unlike the road
	// surface -- which is terrain, and collides as terrain -- it carries its own.
	Wood->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Stone->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	// The supports carry convex hulls rather than a cooked section, so there is
	// no complex geometry for a simple query to fall through to. Left on, every
	// trace against a pier would find nothing there.
	Stone->bUseComplexAsSimpleCollision = false;

	// A wall is the one thing here a pawn is meant not to walk through, and it is
	// a wall rather than a box: the openings are holes in the section, so a
	// simple hull around it would be a house with a doorway that is bricked up.
	Brick->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	// The roof does not collide. Nothing walks on it, an overhanging eave is the
	// easiest thing in a village to snag a pawn on, and cooking a slope per house
	// is work spent on a surface no query ever wants to find.
	Roof->SetCollisionEnabled(ECollisionEnabled::NoCollision);
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

	Timings = FTimings();
	const double RouteStart = FPlatformTime::Seconds();

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

	Timings.RouteMs = static_cast<float>((FPlatformTime::Seconds() - RouteStart) * 1000.0);

	// Before the fences, not after. The runs an entity carries should already
	// have their gateways cut, and where a gateway goes is only known once a plot
	// has been sited -- a house is moved along the road to find level ground, or
	// refused. Still counted against the masonry, which is whose work it is.
	const double PlotStart = FPlatformTime::Seconds();
	SitePlots(In);
	const double PlotMs = (FPlatformTime::Seconds() - PlotStart) * 1000.0;

	OpenGates(In);
	SpawnFenceRuns(In);

	const double FenceStart = FPlatformTime::Seconds();
	FKBVEWorldFenceMesh Fences;
	BuildFenceParts(In, Fences);
	Timings.FenceMs = static_cast<float>((FPlatformTime::Seconds() - FenceStart) * 1000.0);

	const double MasonryStart = FPlatformTime::Seconds();
	SpawnBuildings(In);

	FKBVEWorldBuildingMesh Structures;
	BuildStructures(In, Structures);
	Timings.MasonryMs =
		static_cast<float>((FPlatformTime::Seconds() - MasonryStart) * 1000.0 + PlotMs);

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
	Rebase(Structures.Masonry, Origin);
	Rebase(Structures.Joinery.Timber, Origin);
	Rebase(Structures.Joinery.Glazing, Origin);
	Rebase(Structures.Plinth, Origin);
	Rebase(Structures.Roof, Origin);

	Commit(Wood, Data.Wood, WoodMaterial, true);
	Commit(Stone, Data.Stone, StoneMaterial, false);
	Commit(Brick, Structures.Masonry, In.BrickMaterial, true);
	Commit(Roof, Structures.Roof, In.RoofMaterial, false);
	// Joinery and glass collide, and the plinth with them. A door leaf that does
	// not is a doorway you walk through with the door shut, which is the one place
	// in a village somebody walks straight at a wall on purpose -- and a pane that
	// does not is the same hole one storey up. Only at the tier they are drawn on,
	// which is the tier anything is close enough to touch them at.
	Commit(Joinery, Structures.Joinery.Timber, In.WoodMaterial, true);
	Commit(Glazing, Structures.Joinery.Glazing, In.GlassMaterial, true);
	Commit(Plinth, Structures.Plinth, In.StoneMaterial, true);
	CommitLeaves(Structures.Joinery, Origin, In.WoodMaterial);

	// World space like the crossings' own parts, and for the same reason: the
	// buckets are the network's and hold the whole world between them.
	WallIvy = MoveTemp(Structures.Ivy);
	PostIvy = MoveTemp(Fences.Ivy);
	GatherIvy(WallIvy, PostIvy, In.IvyVariants, OutParts.Ivy);

	// The stems are this chunk's own triangles, so unlike the leaves they are
	// rebased onto it before they are committed.
	WallVines = MoveTemp(Structures.Vines);
	PostVines = MoveTemp(Fences.Vines);
	Rebase(WallVines, Origin);
	Rebase(PostVines, Origin);
	CommitVines(In.VineMaterial);

	// The supports collide as blocks whether they were drawn as triangles here or
	// as instances elsewhere, so this does not care which happened.
	CommitBlocks(Stone, Data.Blocks, Origin);

	for (UProceduralMeshComponent* Mesh : { Wood.Get(), Stone.Get(), Brick.Get(), Roof.Get(),
		Joinery.Get(), Glazing.Get(), Plinth.Get(), Vines.Get() })
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

	if (!FenceArchetype.IsValid())
	{
		FenceArchetype = Manager.CreateArchetype(
			TArray<const UScriptStruct*>{
				FKBVEWorldFenceRunFragment::StaticStruct(),
				FKBVEWorldFenceRunTag::StaticStruct() });
	}

	TArray<int32, TInlineAllocator<32>> Wanted;
	for (int32 I = 0; I < Runs.Num(); ++I)
	{
		if (EdgePaths[RunEdge[I]].Num() >= 2)
		{
			Wanted.Add(I);
		}
	}

	FenceRuns.Reset(Wanted.Num());
	if (Wanted.Num() == 0)
	{
		return;
	}
	Manager.BatchCreateEntities(FenceArchetype, Wanted.Num(), FenceRuns);

	for (int32 Slot = 0; Slot < Wanted.Num() && Slot < FenceRuns.Num(); ++Slot)
	{
		const int32 I = Wanted[Slot];
		const FKBVEWorldFenceRun& Run = Runs[I];
		const TArray<FVector>& Path = EdgePaths[RunEdge[I]];

		FKBVEWorldFenceRunFragment& Fragment =
			Manager.GetFragmentDataChecked<FKBVEWorldFenceRunFragment>(FenceRuns[Slot]);

		Fragment.Chunk = In.Coord;
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

	if (UWorld* World = GetWorld())
	{
		if (UKBVEWorldChunkDirtySubsystem* Dirty =
			World->GetSubsystem<UKBVEWorldChunkDirtySubsystem>())
		{
			Dirty->Forget(Coord);
		}
	}
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
	KBVEPERF_SCOPE("Road.RebuildFences");

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

	// The walls' ivy with it, unchanged and resubmitted anyway: the two plants
	// share these buckets under this key, so posts alone would strip the village.
	PostIvy = MoveTemp(Fences.Ivy);
	GatherIvy(WallIvy, PostIvy, In.IvyVariants, OutParts.Ivy);

	PostVines = MoveTemp(Fences.Vines);
	Rebase(PostVines, GetActorLocation());
	CommitVines(In.VineMaterial);
	return true;
}

void AKBVEWorldRoadChunk::SitePlots(const FBuild& In)
{
	Plans.Reset();
	PlanEdge.Reset();
	if (!In.Settlement)
	{
		return;
	}

	TArray<FKBVEWorldRoadSpan> Spans;
	TArray<FKBVEWorldPlot> Plots;

	for (int32 Step = 0; Step < EdgePaths.Num(); ++Step)
	{
		const TArray<FVector>& Path = EdgePaths[Step];
		if (Path.Num() < 2)
		{
			continue;
		}

		FKBVEWorldRoadGraph::FindRiverSpans(*In.Road, *In.Shape, In.Seed, Path, Spans);

		// A key per edge rather than per chunk. Both edges hashed off the chunk
		// alone would roll the same settlement twice and lay the same houses at
		// the same distances down each of them, which reads as a copy because it
		// is one.
		const FIntPoint Key(In.Coord.X, In.Coord.Y * 2 + Step);
		FKBVEWorldSettlement::FindPlots(*In.Settlement, *In.Road, In.Seed, Key, Path, Spans,
			Plots);

		for (const FKBVEWorldPlot& Plot : Plots)
		{
			// The plot decides where a house would go and the ground decides
			// whether one can. A refusal is left as a gap rather than flattened
			// into a terrace: the terrain keeps its shape and the settlement
			// grows along the parts of the road that could carry it.
			FKBVEWorldBuildingPlan Plan;
			if (FKBVEWorldSettlement::Site(*In.Settlement, *In.Road, *In.Shape, In.Seed, In.Field,
				Path, Plot, Plan))
			{
				Plans.Add(Plan);
				PlanEdge.Add(Step);
			}
		}
	}
}

void AKBVEWorldRoadChunk::OpenGates(const FBuild& In)
{
	if (!In.Fence || !In.Settlement || Plans.Num() == 0 || Runs.Num() == 0)
	{
		return;
	}

	// Cut per edge. A run and a gateway are both distances along one polyline, so
	// a gate measured on one edge means nothing on the other.
	for (int32 Step = 0; Step < EdgePaths.Num(); ++Step)
	{
		const TArray<FVector>& Path = EdgePaths[Step];
		if (Path.Num() < 2)
		{
			continue;
		}

		TArray<FKBVEWorldFenceGate> Gates;
		for (int32 I = 0; I < Plans.Num(); ++I)
		{
			if (PlanEdge[I] != Step)
			{
				continue;
			}

			FKBVEWorldFenceGate Gate;
			Gate.Side = Plans[I].Side;
			FKBVEWorldSettlement::Gateway(In.Settlement->Building, Plans[I], Path,
				In.Fence->GateClearance, Gate.Begin, Gate.End);
			Gates.Add(Gate);
		}

		if (Gates.Num() == 0)
		{
			continue;
		}

		// Split out and put back rather than cut in place, so the run's edge index
		// travels with it: a run may come back as two and both halves still belong
		// to the edge the whole one did.
		TArray<FKBVEWorldFenceRun> Mine;
		TArray<FKBVEWorldFenceRun> Others;
		TArray<int32> OtherEdge;
		for (int32 I = 0; I < Runs.Num(); ++I)
		{
			if (RunEdge[I] == Step)
			{
				Mine.Add(Runs[I]);
			}
			else
			{
				Others.Add(Runs[I]);
				OtherEdge.Add(RunEdge[I]);
			}
		}

		FKBVEWorldFence::Gates(*In.Fence, Gates, Mine);

		Runs = MoveTemp(Others);
		RunEdge = MoveTemp(OtherEdge);
		for (const FKBVEWorldFenceRun& Run : Mine)
		{
			Runs.Add(Run);
			RunEdge.Add(Step);
		}
	}
}

AKBVEWorldRoadNetwork* AKBVEWorldRoadChunk::Doors() const
{
	return Cast<AKBVEWorldRoadNetwork>(GetOwner());
}

void AKBVEWorldRoadChunk::CommitVines(UMaterialInterface* Material)
{
	// One section for both plants. A wall's runners and a post's are the same
	// strip of the same material, and a chunk that gave each its own component
	// would draw a village's ivy in two calls to say one thing.
	FKBVEWorldRibbonMesh Both = WallVines;
	const int32 Base = Both.Vertices.Num();
	Both.Vertices.Append(PostVines.Vertices);
	Both.Normals.Append(PostVines.Normals);
	Both.UV0.Append(PostVines.UV0);
	Both.Tangents.Append(PostVines.Tangents);
	Both.Triangles.Reserve(Both.Triangles.Num() + PostVines.Triangles.Num());
	for (const int32 Index : PostVines.Triangles)
	{
		Both.Triangles.Add(Base + Index);
	}

	// No collision. A stem is two centimetres of leaf litter on a wall that
	// already collides, and cooking a village's worth of them would be a cook
	// per chunk for a surface nothing can stand on.
	Commit(Vines, Both, Material, false);
}

void AKBVEWorldRoadChunk::CommitLeaves(const FKBVEWorldJoineryMesh& Fittings, const FVector& Origin,
	UMaterialInterface* Material)
{
	const int32 Wanted = Fittings.Leaves.Num();

	// Grown to fit and never shrunk. A village is a handful of doors and a chunk
	// comes back with roughly the same ones, so the components are worth keeping;
	// what is not worth keeping is the geometry in the ones nobody needs.
	while (LeafParts.Num() < Wanted)
	{
		UProceduralMeshComponent* Part = NewObject<UProceduralMeshComponent>(this);
		Part->SetupAttachment(GetRootComponent());
		Part->bUseAsyncCooking = true;
		Part->SetCanEverAffectNavigation(false);
		Part->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		Part->RegisterComponent();
		LeafParts.Add(Part);
	}

	Leaves.SetNum(Wanted);

	for (int32 I = 0; I < LeafParts.Num(); ++I)
	{
		UProceduralMeshComponent* Part = LeafParts[I];
		if (!Part)
		{
			continue;
		}

		if (I >= Wanted)
		{
			Part->ClearAllMeshSections();
			Part->SetVisibility(false);
			Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			continue;
		}

		const FKBVEWorldDoorLeaf& Leaf = Fittings.Leaves[I];

		// The hinge is where the component stands and the leaf is drawn around it,
		// so opening one is a rotation about its own origin rather than a rebuild.
		// X along the leaf and Z up leaves Y pointing away from the street, which
		// is what makes a positive yaw a door swinging inwards.
		// Re-hung, so whatever this leaf was doing a moment ago is gone. A door
		// somebody opened is put back open rather than eased there: the rebuild
		// that lost it is a building changing tier or a chunk coming back, and
		// neither is a reason for a door across the village to swing itself.
		const AKBVEWorldRoadNetwork* Network = Doors();
		const bool bOpen = Network && Network->IsDoorOpen(Leaf.Key);

		Leaves[I].Key = Leaf.Key;
		Leaves[I].Hinge = Leaf.Hinge - Origin;
		Leaves[I].Swing = Leaf.Swing;
		Leaves[I].Angle = bOpen ? Leaf.Swing : 0.0f;
		Leaves[I].Target = Leaves[I].Angle;

		Part->SetVisibility(true);
		Part->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		Leaves[I].Base = FRotationMatrix::MakeFromXZ(Leaf.Along, FVector::UpVector).ToQuat();
		Part->SetRelativeLocationAndRotation(Leaves[I].Hinge,
			FRotator(0.0f, Leaves[I].Angle, 0.0f).Quaternion() * Leaves[I].Base);

		Part->ClearAllMeshSections();
		if (Leaf.Mesh.IsEmpty())
		{
			continue;
		}

		const TArray<FLinearColor> NoColors;
		Part->CreateMeshSection_LinearColor(0, Leaf.Mesh.Vertices, Leaf.Mesh.Triangles,
			Leaf.Mesh.Normals, Leaf.Mesh.UV0, NoColors, Leaf.Mesh.Tangents, true);
		if (Material)
		{
			Part->SetMaterial(0, Material);
		}
	}

	SetActorTickEnabled(false);
}

void AKBVEWorldRoadChunk::OnInteract_Implementation(AActor* Instigator)
{
	if (!Instigator || Leaves.Num() == 0)
	{
		return;
	}

	// The pawn traced and hit the chunk, which is a whole village, so which door
	// was meant is decided here. Nearest hinge to whoever asked: a doorway is a
	// metre across and the houses are twelve apart, so there is nothing to be
	// ambiguous about at the range the trace already had to succeed from.
	const FVector At = Instigator->GetActorLocation() - GetActorLocation();

	int32 Nearest = INDEX_NONE;
	float Closest = FMath::Square(400.0f);
	for (int32 I = 0; I < Leaves.Num(); ++I)
	{
		const float Distance = static_cast<float>(FVector::DistSquared(Leaves[I].Hinge, At));
		if (Distance < Closest)
		{
			Closest = Distance;
			Nearest = I;
		}
	}

	if (Nearest == INDEX_NONE)
	{
		return;
	}

	// Toggled against where it is going rather than where it is, so a door caught
	// halfway through opening shuts again instead of finishing first.
	FLeaf& Leaf = Leaves[Nearest];
	Leaf.Target = Leaf.Target > 0.0f ? 0.0f : Leaf.Swing;

	// Written down where it outlives the geometry, so the door is still open when
	// the village is rebuilt around it.
	if (AKBVEWorldRoadNetwork* Network = Doors())
	{
		Network->SetDoorOpen(Leaf.Key, Leaf.Target > 0.0f);
	}

	SetActorTickEnabled(true);
}

void AKBVEWorldRoadChunk::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Eased towards the target and stopped dead on arrival, which is also what
	// turns the tick back off: a chunk with nothing swinging on it has nothing to
	// do every frame, and a stream holds a great many chunks.
	bool bMoving = false;

	for (int32 I = 0; I < Leaves.Num() && I < LeafParts.Num(); ++I)
	{
		FLeaf& Leaf = Leaves[I];
		if (FMath::IsNearlyEqual(Leaf.Angle, Leaf.Target, 0.01f))
		{
			Leaf.Angle = Leaf.Target;
			continue;
		}

		Leaf.Angle = FMath::FInterpTo(Leaf.Angle, Leaf.Target, DeltaSeconds, 7.0f);
		bMoving = true;

		if (UProceduralMeshComponent* Part = LeafParts[I])
		{
			// Turned about the component rather than rebuilt, so the collision --
			// which is the component's own cooked shape -- comes round with it and
			// an open doorway is one you can walk through.
			//
			// Turned from where it was hung, not set to a bare yaw: the frame that
			// stood the leaf up in its wall is in that rotation, and replacing it
			// would swing every door in the village onto a world axis. The hinge
			// runs up, so a world yaw and a yaw in the leaf's own frame are the
			// same turn either way round.
			Part->SetRelativeRotation(FRotator(0.0f, Leaf.Angle, 0.0f).Quaternion() * Leaf.Base);
		}
	}

	if (!bMoving)
	{
		SetActorTickEnabled(false);
	}
}

void AKBVEWorldRoadChunk::SpawnBuildings(const FBuild& In)
{
	if (Plans.Num() == 0)
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

	if (!BuildingArchetype.IsValid())
	{
		BuildingArchetype = Manager.CreateArchetype(
			TArray<const UScriptStruct*>{
				FKBVEWorldBuildingFragment::StaticStruct(),
				FKBVEWorldBuildingTag::StaticStruct() });
	}

	Buildings.Reset(Plans.Num());
	Manager.BatchCreateEntities(BuildingArchetype, Plans.Num(), Buildings);

	for (int32 I = 0; I < Plans.Num() && I < Buildings.Num(); ++I)
	{
		const FKBVEWorldBuildingPlan& Plan = Plans[I];
		FKBVEWorldBuildingFragment& Fragment =
			Manager.GetFragmentDataChecked<FKBVEWorldBuildingFragment>(Buildings[I]);

		Fragment.Chunk = In.Coord;
		Fragment.Centre = Plan.Centre;
		Fragment.Yaw = Plan.Yaw;
		Fragment.Width = Plan.Width;
		Fragment.Depth = Plan.Depth;
		Fragment.Embed = Plan.Embed;
		Fragment.Storeys = Plan.Storeys;
		Fragment.Seed = Plan.Seed;

		// Half the footprint's diagonal, so the processor can measure to the
		// building rather than to the point its floor was levelled at.
		Fragment.Radius = 0.5f * FMath::Sqrt(Plan.Width * Plan.Width + Plan.Depth * Plan.Depth);

		Fragment.Detail = static_cast<uint8>(In.WallDetail);
		Fragment.WantedDetail = Fragment.Detail;
	}
}

void AKBVEWorldRoadChunk::ReleaseBuildings()
{
	if (Buildings.Num() == 0)
	{
		return;
	}

	if (Mass)
	{
		FMassEntityManager& Manager = Mass->GetMutableEntityManager();
		for (const FMassEntityHandle& Entity : Buildings)
		{
			if (Manager.IsEntityValid(Entity))
			{
				Manager.DestroyEntity(Entity);
			}
		}
	}

	Buildings.Reset();
}

void AKBVEWorldRoadChunk::BuildStructures(const FBuild& In, FKBVEWorldBuildingMesh& Out)
{
	if (!In.Settlement || Plans.Num() == 0)
	{
		return;
	}

	FMassEntityManager* Manager = Mass ? &Mass->GetMutableEntityManager() : nullptr;

	for (int32 I = 0; I < Plans.Num(); ++I)
	{
		EKBVEWorldWallDetail Detail = In.WallDetail;
		if (Manager && I < Buildings.Num() && Manager->IsEntityValid(Buildings[I]))
		{
			FKBVEWorldBuildingFragment& Fragment =
				Manager->GetFragmentDataChecked<FKBVEWorldBuildingFragment>(Buildings[I]);
			Detail = static_cast<EKBVEWorldWallDetail>(Fragment.WantedDetail);
			Fragment.Detail = Fragment.WantedDetail;
		}

		FKBVEWorldBuilding::Build(In.Settlement->Building, Plans[I], Detail, Out);
	}
}

bool AKBVEWorldRoadChunk::RebuildBuildings(const FBuild& In, FParts& OutParts)
{
	KBVEPERF_SCOPE("Road.RebuildBuildings");

	if (!Mass || Buildings.Num() == 0)
	{
		return false;
	}

	FMassEntityManager& Manager = Mass->GetMutableEntityManager();

	bool bStale = false;
	for (const FMassEntityHandle& Entity : Buildings)
	{
		if (!Manager.IsEntityValid(Entity))
		{
			continue;
		}
		const FKBVEWorldBuildingFragment& Fragment =
			Manager.GetFragmentDataChecked<FKBVEWorldBuildingFragment>(Entity);
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

	FKBVEWorldBuildingMesh Structures;
	BuildStructures(In, Structures);

	const FVector Origin = GetActorLocation();
	Rebase(Structures.Masonry, Origin);
	Rebase(Structures.Joinery.Timber, Origin);
	Rebase(Structures.Joinery.Glazing, Origin);
	Rebase(Structures.Plinth, Origin);
	Rebase(Structures.Roof, Origin);
	Commit(Brick, Structures.Masonry, In.BrickMaterial, true);
	Commit(Roof, Structures.Roof, In.RoofMaterial, false);
	Commit(Joinery, Structures.Joinery.Timber, In.WoodMaterial, true);
	Commit(Glazing, Structures.Joinery.Glazing, In.GlassMaterial, true);
	Commit(Plinth, Structures.Plinth, In.StoneMaterial, true);
	CommitLeaves(Structures.Joinery, Origin, In.WoodMaterial);

	WallIvy = MoveTemp(Structures.Ivy);
	GatherIvy(WallIvy, PostIvy, In.IvyVariants, OutParts.Ivy);

	WallVines = MoveTemp(Structures.Vines);
	Rebase(WallVines, Origin);
	CommitVines(In.VineMaterial);
	return true;
}

void AKBVEWorldRoadChunk::Release()
{
	ReleaseFenceRuns();
	ReleaseBuildings();
	WallIvy.Reset();
	PostIvy.Reset();
	WallVines.Reset();
	PostVines.Reset();
	Vines->ClearAllMeshSections();
	bActive = false;
	Wood->ClearAllMeshSections();
	Stone->ClearAllMeshSections();
	Brick->ClearAllMeshSections();
	Roof->ClearAllMeshSections();
	Joinery->ClearAllMeshSections();
	Glazing->ClearAllMeshSections();
	Plinth->ClearAllMeshSections();
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

void AKBVEWorldRoadNetwork::SyncFromStreamer()
{
	const AKBVEWorldStreamer* Found = FindStreamer();
	if (!Found)
	{
		return;
	}

	// Every number here describes ground this actor does not make. The terrain is
	// graded for these roads and the start is planned from these villages, so a
	// road actor holding its own copy lays a surface into a corridor cut
	// somewhere else and builds houses the plan never saw.
	WorldSeed = Found->WorldSeed;
	Shape = Found->Shape;
	Road = Found->Road;
	Settlement = Found->Settlement;
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

	// Buildings are their own section rather than instances, so unlike the fences
	// they do not wait on a mesh being assigned -- what they wait on is a
	// material, without which a village would be raised in default grey.
	In.Settlement = BrickMaterial ? &Settlement : nullptr;
	In.WallDetail = bDetailed ? EKBVEWorldWallDetail::Full : EKBVEWorldWallDetail::Plain;

	In.WoodMaterial = WoodMaterial;
	In.StoneMaterial = StoneMaterial;
	In.BrickMaterial = BrickMaterial;
	In.RoofMaterial = RoofMaterial;
	In.GlassMaterial = GlassMaterial;
	In.VineMaterial = IvyStemMaterial;
	In.PartMesh = bInstanced ? PartMesh.Get() : nullptr;

	// However many buckets there turned out to be, which is however many cells
	// the sheet has. Zero until the first tick that could make them, so a chunk
	// built before the atlas arrived grows nothing and is rebuilt with the ring.
	In.IvyVariants = IvyBuckets.Num();
	return In;
}

void AKBVEWorldRoadNetwork::EnsureIvyBuckets(float DrawDistance)
{
	if (!Parts || !IvyAtlas || IvyBuckets.Num() > 0)
	{
		return;
	}

	// Whichever cells this level said are its plant. Both the fence and the
	// settlement draw from the one sheet, so they are told the same number of
	// variants rather than each keeping its own count.
	const int32 Fallback = FMath::Max(Fence.Ivy.Variants, Settlement.Building.Ivy.Variants);

	TArray<UStaticMesh*> Sprigs;
	FKBVEWorldIvyCard::SprigMeshes(this, IvyAtlas, IvyLeafCells, Fallback,
		FKBVEWorldIvyCard::LeavesPerSprig, Sprigs);
	if (Sprigs.Num() == 0)
	{
		return;
	}

	IvyBuckets.Reserve(Sprigs.Num());
	for (UStaticMesh* Sprig : Sprigs)
	{
		// The material is the sheet's own, and it is already on the mesh: a bucket
		// keyed on both is what keeps one variant from being handed another's.
		IvyBuckets.Add(Parts->EnsureBucket(Sprig, IvyAtlas->Material, DrawDistance));
	}

	Fence.Ivy.Variants = IvyBuckets.Num();
	Settlement.Building.Ivy.Variants = IvyBuckets.Num();

	// How many leaves one of those meshes turned out to carry. The placement
	// spaces its sprigs by it, so a mesh built with more leaves than the walk
	// leaves room for would lay them over each other.
	Fence.Ivy.LeafCluster = FKBVEWorldIvyCard::LeavesPerSprig;
	Settlement.Building.Ivy.LeafCluster = FKBVEWorldIvyCard::LeavesPerSprig;

	UE_LOG(LogKBVEWorldStream, Display, TEXT("ivy sheet %s: %d sprig variants"),
		*IvyAtlas->GetName(), IvyBuckets.Num());
}

void AKBVEWorldRoadNetwork::SubmitIvy(const FIntPoint& Key, AKBVEWorldRoadChunk::FParts& ChunkParts)
{
	if (!Parts)
	{
		return;
	}

	for (const TArray<FTransform>& Variant : ChunkParts.Ivy)
	{
		IvySprigs += Variant.Num();
	}

	// Every bucket, not only the ones with leaves in them. A key left out of a
	// bucket is that key's last submission still standing, which for a chunk that
	// has just lost its ivy is the plant left hanging where the wall used to be.
	for (int32 I = 0; I < IvyBuckets.Num(); ++I)
	{
		TArray<FTransform> Sprigs;
		if (ChunkParts.Ivy.IsValidIndex(I))
		{
			Sprigs = MoveTemp(ChunkParts.Ivy[I]);
		}
		Parts->Submit(IvyBuckets[I], Key, MoveTemp(Sprigs));
	}
}

bool AKBVEWorldRoadNetwork::WantsDetail(const FIntPoint& Centre, const FIntPoint& Coord) const
{
	const FIntPoint Delta = Coord - Centre;
	return FMath::Max(FMath::Abs(Delta.X), FMath::Abs(Delta.Y)) <= DetailRadiusChunks;
}

void AKBVEWorldRoadNetwork::Regrow()
{
	for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>>& Pair : Live)
	{
		if (AKBVEWorldRoadChunk* Chunk = Pair.Value)
		{
			Chunk->Release();
			Pool.Add(Chunk);
		}
	}

	Live.Reset();
	Pending.Reset();

	if (Parts)
	{
		Parts->Empty();
		Parts->Flush();
	}

	// The buckets are made from the sheet's cells on the first tick that can make
	// them, so dropping them is what lets a change to which cells are this plant's
	// leaf take effect. The components they were made against stay and are left
	// empty, which is a handful of empty draws in an editor session and nothing at
	// all in a game: nobody calls this from one.
	IvyBuckets.Reset();
	StoneBucket = INDEX_NONE;
	WoodBucket = INDEX_NONE;

	// Nowhere, so the next tick sees the viewer somewhere else and refills.
	LastCentre = FIntPoint(MAX_int32, MAX_int32);

	UE_LOG(LogKBVEWorldStream, Display, TEXT("road network regrowing from its parameters"));
}

namespace
{
	// Every network in the world, because a level has one of these and typing a
	// name to reach it is worse than telling all of them.
	FAutoConsoleCommandWithWorld GKBVEWorldRegrowCmd(
		TEXT("kbve.Road.Regrow"),
		TEXT("Rebuild every road chunk from the road network's current parameters."),
		FConsoleCommandWithWorldDelegate::CreateLambda([](UWorld* World)
		{
			if (!World)
			{
				return;
			}

			int32 Told = 0;
			for (TActorIterator<AKBVEWorldRoadNetwork> It(World); It; ++It)
			{
				It->Regrow();
				++Told;
			}

			UE_LOG(LogKBVEWorldStream, Display, TEXT("kbve.Road.Regrow: %d network(s)"), Told);
		}));
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

	SyncFromStreamer();

	FVector ViewLocation;
	TryGetViewLocation(ViewLocation);
	const FIntPoint Centre = ChunkCoordAt(ViewLocation);

	if (Centre != LastCentre)
	{
		LastCentre = Centre;
		FillTimings = AKBVEWorldRoadChunk::FTimings();
		IvySprigs = 0;
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

	EnsureIvyBuckets(DrawDistance);

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

		const AKBVEWorldRoadChunk::FTimings& Spent = Chunk->GetTimings();
		FillTimings.RouteMs += Spent.RouteMs;
		FillTimings.FenceMs += Spent.FenceMs;
		FillTimings.MasonryMs += Spent.MasonryMs;

		if (bInstanced)
		{
			Parts->Submit(StoneBucket, Coord, MoveTemp(ChunkParts.Stone));
			Parts->Submit(WoodBucket, Coord, MoveTemp(ChunkParts.Wood));
		}

		SubmitIvy(Coord, ChunkParts);

		Live.Add(Coord, Chunk);
		++Built;
	}

	if (Built == 0)
	{
		UKBVEWorldChunkDirtySubsystem* Dirty =
			GetWorld() ? GetWorld()->GetSubsystem<UKBVEWorldChunkDirtySubsystem>() : nullptr;

		int32 Restood = 0;
		for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>>& Pair : Live)
		{
			if (!Pair.Value || Restood >= MaxBuildsPerTick)
			{
				continue;
			}

			if (Dirty && !Dirty->Take(Pair.Key))
			{
				continue;
			}

			const AKBVEWorldRoadChunk::FBuild In = MakeBuild(Pair.Key, Seed,
				Pair.Value->IsDetailed(), bInstanced, DrawDistance);

			KBVEPERF_SCOPE("Road.RestandChunk");

			AKBVEWorldRoadChunk::FParts FenceParts;
			if (bInstanced && Pair.Value->RebuildFences(In, FenceParts))
			{
				Parts->Submit(StoneBucket, Pair.Key, MoveTemp(FenceParts.Stone));
				Parts->Submit(WoodBucket, Pair.Key, MoveTemp(FenceParts.Wood));
				SubmitIvy(Pair.Key, FenceParts);
				++Restood;
			}

			// Counted against the same budget the fences spend from. Both are
			// rebuilds that a viewer walking causes, and letting them each have a
			// budget means a viewer walking towards a village pays twice.
			AKBVEWorldRoadChunk::FParts WallParts;
			if (Restood < MaxBuildsPerTick && Pair.Value->RebuildBuildings(In, WallParts))
			{
				SubmitIvy(Pair.Key, WallParts);
				++Restood;
			}
		}

		KBVEPERF_COUNT("Road.Restood", Restood);
	}

	// Once per tick rather than per chunk: a bucket is rebuilt from all its keys,
	// so flushing inside the loop would rebuild it once for every chunk built.
	if (Parts)
	{
		KBVEPERF_SCOPE("Road.InstanceFlush");
		Parts->Flush();
	}

	if (Built > 0 && Pending.Num() == 0)
	{
		UE_LOG(LogKBVEWorldStream, Display,
			TEXT("road window filled at %d,%d: %d live (%d pooled), last build %.2f ms; "
				 "routing %.1f ms, fences %.1f ms, masonry %.1f ms, %d ivy sprigs"),
			Centre.X, Centre.Y, Live.Num(), Pool.Num(), LastBuildMs, FillTimings.RouteMs,
			FillTimings.FenceMs, FillTimings.MasonryMs, IvySprigs);
	}
}
