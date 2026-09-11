#include "KBVEWorldHeightfieldActor.h"

#include "KBVEWorldPatch.h"

#include "Async/Async.h"
#include "Async/ParallelFor.h"
#include "Containers/Queue.h"
#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRoadField.h"
#include "ProceduralMeshComponent.h"

AKBVEWorldHeightfieldActor::AKBVEWorldHeightfieldActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->bUseAsyncCooking = true;
	// Patches are pooled, so an unbuilt one exists with no geometry. Navigation
	// registers it anyway and warns about the empty bounds every time; nothing
	// here wants a navmesh, so it should never have been a nav-relevant
	// component in the first place.
	Mesh->SetCanEverAffectNavigation(false);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	CollisionMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("CollisionMesh"));
	CollisionMesh->SetupAttachment(Mesh);
	CollisionMesh->bUseAsyncCooking = true;
	CollisionMesh->SetCanEverAffectNavigation(false);
	// Never drawn -- it exists to be traced against and stood on.
	CollisionMesh->SetHiddenInGame(true);
	CollisionMesh->SetVisibility(false);
}

bool AKBVEWorldHeightfieldActor::PlanSection(int32 InStep, bool bCollision,
	FKBVEWorldPatchPlan& Plan) const
{
	Plan = FKBVEWorldPatchPlan();
	Plan.Shape = Shape;
	Plan.TileOrigin = TileOrigin;
	Plan.CellsPerEdge = CellsPerEdge;
	Plan.CellSize = CellSize;
	Plan.WorldSeed = WorldSeed;
	Plan.Step = InStep;
	Plan.SkirtDepth = SkirtDepth;
	Plan.bCollision = bCollision;

	// Routed here, where the field lives, and then copied. Level only reads the
	// corridors, but routing builds them lazily into caches that are not
	// guarded, so the routing has to be finished before the reading is handed
	// anywhere else -- and once it is a look, it cannot be caught mid-route at
	// all.
	if (RoadField)
	{
		const int32 Step = FMath::Clamp(InStep, 1, FMath::Max(1, CellsPerEdge / 4));
		const float VertexSize = CellSize * Step;
		const int32 PadEdge = (CellsPerEdge / Step) + 3;
		const float TileStep = VertexSize / 100.0f;
		const float PadOrigin = -TileStep * 100.0f;

		const FVector2D Min(TileOrigin.X * 100.0f + PadOrigin, TileOrigin.Y * 100.0f + PadOrigin);
		const FVector2D Max = Min + FVector2D(PadEdge * VertexSize, PadEdge * VertexSize);

		RoadField->EnsureCovers(Min, Max);
		Plan.Road = RoadField->LookOver(Min, Max);
		Plan.bHasRoad = true;
	}

	return true;
}

void AKBVEWorldHeightfieldActor::Commit(UProceduralMeshComponent* Target,
	const FKBVEWorldPatchMesh& Patch, bool bCollision)
{
	if (!Target)
	{
		return;
	}

	LastFillMs += Patch.FillMs;
	LastGenerateMs += Patch.GenerateMs;

	const double SectionStart = FPlatformTime::Seconds();
	Target->ClearAllMeshSections();
	Target->CreateMeshSection_LinearColor(0, Patch.Vertices, Patch.Triangles, Patch.Normals,
		Patch.UVs, Patch.Colors, Patch.Tangents, bCollision);
	LastSectionMs += static_cast<float>((FPlatformTime::Seconds() - SectionStart) * 1000.0);

	if (TerrainMaterial && !bCollision)
	{
		Target->SetMaterial(0, TerrainMaterial);
	}
}

void AKBVEWorldHeightfieldActor::BuildSection(UProceduralMeshComponent* Target, int32 InStep,
	bool bCollision)
{
	if (!Target)
	{
		return;
	}

	FKBVEWorldPatchPlan Plan;
	if (!PlanSection(InStep, bCollision, Plan))
	{
		return;
	}

	FKBVEWorldPatchMesh Patch;
	FKBVEWorldPatchPlan::Build(Plan, CachedPadded, bCachedPaddedValid, Patch);
	Commit(Target, Patch, bCollision);
}

namespace
{
	/**
	 * Build patches off the game thread.
	 *
	 * Off by default, and deliberately: what it changes is when a patch appears,
	 * and a patch that appears a frame later is a hole in the ground for a
	 * frame. Whether that is worth the ten milliseconds it takes off the frame
	 * is a thing to look at rather than to assume.
	 */
	TAutoConsoleVariable<int32> GKBVEWorldAsyncPatchCVar(
		TEXT("kbve.World.AsyncPatch"), 0,
		TEXT("Build terrain patches on a worker thread and commit them when they land."),
		ECVF_Default);

	/**
	 * How many patches may be building at once.
	 *
	 * Not a thread-pool question -- the pool would happily take sixty -- but a
	 * usefulness one. The view moves while patches build, and a job started for
	 * ground the view has since left runs to completion and is thrown away at
	 * the end. Past a handful in flight, extra jobs are mostly work for ground
	 * nobody is going to see, competing for cores with the jobs that are still
	 * wanted.
	 *
	 * At the cap the patch is built the ordinary way instead of queued. That
	 * costs the game thread a patch, which is what the streamer's millisecond
	 * budget exists to notice.
	 */
	TAutoConsoleVariable<int32> GKBVEWorldAsyncPatchJobsCVar(
		TEXT("kbve.World.AsyncPatchJobs"), 4,
		TEXT("How many terrain patches may build on worker threads at once."),
		ECVF_Default);

	/**
	 * Whether the collision proxy goes to the worker with the drawn surface.
	 *
	 * Off, because the two halves fail differently. A drawn surface that lands
	 * late is a hole for a frame or two; a collision proxy that lands late is
	 * ground a player falls through, and they land somewhere the world does not
	 * expect them to be. The proxy is built at a coarse stride and is the
	 * cheaper of the two, so keeping it on the game thread costs little and is
	 * the half worth being conservative about.
	 */
	TAutoConsoleVariable<int32> GKBVEWorldAsyncPatchCollisionCVar(
		TEXT("kbve.World.AsyncPatchCollision"), 0,
		TEXT("Build the collision proxy on the worker too, rather than in place."),
		ECVF_Default);

	/**
	 * Finished patches, from any number of workers to the one game thread.
	 *
	 * Multi-producer single-consumer is exactly the traffic: every worker
	 * enqueues, and only DrainLandings dequeues.
	 */
	TQueue<TSharedPtr<FKBVEWorldPatchLanding>, EQueueMode::Mpsc> GKBVEWorldLandings;

	/** TQueue cannot be counted, and both of these are read for the perf line. */
	FThreadSafeCounter GKBVEWorldLandingsWaiting;
	FThreadSafeCounter GKBVEWorldJobsInFlight;
}

int32 AKBVEWorldHeightfieldActor::LandingsWaiting()
{
	return GKBVEWorldLandingsWaiting.GetValue();
}

int32 AKBVEWorldHeightfieldActor::JobsInFlight()
{
	return GKBVEWorldJobsInFlight.GetValue();
}

namespace
{
	/**
	 * What the threading is doing right now, in a form /exec can read back.
	 *
	 * Both numbers are needed to read the other measurements honestly. Jobs in
	 * flight at the cap means the streamer is falling back to building in place
	 * and the frame times include whole patches; landings waiting means ground
	 * is finished and not yet on screen, so a window that looks filled is not.
	 */
	FAutoConsoleCommandWithOutputDevice GKBVEWorldPatchJobsCommand(
		TEXT("kbve.World.PatchJobs"),
		TEXT("Report terrain patches building on workers and finished ones waiting to land."),
		FConsoleCommandWithOutputDeviceDelegate::CreateLambda([](FOutputDevice& Out)
		{
			Out.Logf(TEXT("patchjobs inflight %d waiting %d cap %d"),
				AKBVEWorldHeightfieldActor::JobsInFlight(),
				AKBVEWorldHeightfieldActor::LandingsWaiting(),
				GKBVEWorldAsyncPatchJobsCVar.GetValueOnGameThread());
		}));
}

int32 AKBVEWorldHeightfieldActor::DrainLandings(float BudgetMs, float& OutSpentMs)
{
	check(IsInGameThread());

	const double Start = FPlatformTime::Seconds();
	int32 Taken = 0;

	TSharedPtr<FKBVEWorldPatchLanding> Landing;
	while (GKBVEWorldLandings.Dequeue(Landing))
	{
		GKBVEWorldLandingsWaiting.Decrement();
		++Taken;

		AKBVEWorldHeightfieldActor* Patch = Landing->Patch.Get();
		// Recycled to another coordinate while this was in flight. Its ground is
		// somewhere else now and this is the ground it used to be on. Dropping it
		// still counts as a landing taken -- the queue moved -- but it costs
		// nothing, so it does not eat the budget.
		if (Patch && Patch->Serial == Landing->Serial)
		{
			if (Landing->Draw.IsValid())
			{
				Patch->Commit(Patch->Mesh, *Landing->Draw, false);
			}
			if (Landing->Collide.IsValid())
			{
				Patch->Commit(Patch->CollisionMesh, *Landing->Collide, true);
			}
		}

		// Released here rather than at the top of the next turn, so the mesh is
		// gone before the clock decides whether to take another.
		Landing.Reset();

		if ((FPlatformTime::Seconds() - Start) * 1000.0 >= BudgetMs)
		{
			break;
		}
	}

	OutSpentMs += static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0);
	return Taken;
}

bool AKBVEWorldHeightfieldActor::RebuildAsync()
{
	const int32 Cap = FMath::Max(1, GKBVEWorldAsyncPatchJobsCVar.GetValueOnGameThread());
	if (GKBVEWorldJobsInFlight.GetValue() >= Cap)
	{
		return false;
	}

	// Planned here, where the road field lives and where routing happens. What
	// crosses to the worker is a plan that owns everything it reads.
	FKBVEWorldPatchPlan Draw;
	if (!PlanSection(LODStep, false, Draw))
	{
		return false;
	}

	const bool bWantsCollision = CollisionMesh && bGenerateCollision;
	const bool bAsyncCollision = bWantsCollision
		&& GKBVEWorldAsyncPatchCollisionCVar.GetValueOnGameThread() != 0;

	FKBVEWorldPatchPlan Collide;
	const bool bCollide = bAsyncCollision
		&& PlanSection(FMath::Max(LODStep, CollisionLODStep), true, Collide);

	if (CollisionMesh && !bGenerateCollision)
	{
		CollisionMesh->ClearAllMeshSections();
	}

	// In place, and before the job is launched: something has to be standable
	// the moment the patch is at this coordinate, and the drawn surface arriving
	// late is survivable where the floor arriving late is not.
	//
	// It samples its own heights rather than sharing the drawn surface's, which
	// the synchronous path does share. That sharing is gone by construction once
	// the drawn surface is built somewhere else, and the proxy is the coarse one
	// of the two, so it is the cheaper end of the trade.
	if (bWantsCollision && !bAsyncCollision)
	{
		BuildSection(CollisionMesh, FMath::Max(LODStep, CollisionLODStep), true);
	}

	const uint32 Mine = ++Serial;
	TWeakObjectPtr<AKBVEWorldHeightfieldActor> Held(this);

	GKBVEWorldJobsInFlight.Increment();

	Async(EAsyncExecution::ThreadPool, [Held, Mine, Draw, Collide, bCollide]()
	{
		// The worker's own scratch. The two sections share it the way the
		// synchronous path does -- the collision proxy asks for heights the
		// drawn surface has usually already computed -- and it belongs to this
		// job alone, so two patches building at once cannot meet in it.
		TArray<float> Padded;
		bool bValid = false;

		TSharedPtr<FKBVEWorldPatchLanding> Landing = MakeShared<FKBVEWorldPatchLanding>();
		Landing->Patch = Held;
		Landing->Serial = Mine;

		Landing->Draw = MakeShared<FKBVEWorldPatchMesh>();
		FKBVEWorldPatchPlan::Build(Draw, Padded, bValid, *Landing->Draw);

		if (bCollide)
		{
			Landing->Collide = MakeShared<FKBVEWorldPatchMesh>();
			FKBVEWorldPatchPlan::Build(Collide, Padded, bValid, *Landing->Collide);
		}

		// Counted up before the queue, not after: a landing that is waiting is
		// not still in flight, and a reader that saw neither would think the
		// patch had vanished.
		GKBVEWorldLandingsWaiting.Increment();
		GKBVEWorldJobsInFlight.Decrement();
		GKBVEWorldLandings.Enqueue(MoveTemp(Landing));
	});

	return true;
}

void AKBVEWorldHeightfieldActor::Rebuild()
{
	LastGenerateMs = 0.0f;
	LastSectionMs = 0.0f;
	LastFillMs = 0.0f;

	const double RebuildStart = FPlatformTime::Seconds();

	// A pooled patch arrives with the last coordinate's heights still cached.
	bCachedPaddedValid = false;

	if (GKBVEWorldAsyncPatchCVar.GetValueOnGameThread() != 0 && RebuildAsync())
	{
		LastRebuildMs = static_cast<float>((FPlatformTime::Seconds() - RebuildStart) * 1000.0);
		return;
	}

	++Serial;

	BuildSection(Mesh, LODStep, false);

	if (CollisionMesh)
	{
		// Only the visual half of a collisionless patch is worth building, and
		// clearing rather than leaving the old proxy matters: a pooled patch
		// recycled to a new coordinate would otherwise keep collision from
		// wherever it used to be.
		if (bGenerateCollision)
		{
			BuildSection(CollisionMesh, FMath::Max(LODStep, CollisionLODStep), true);
		}
		else
		{
			CollisionMesh->ClearAllMeshSections();
		}
	}

	LastRebuildMs = static_cast<float>((FPlatformTime::Seconds() - RebuildStart) * 1000.0);
}

void AKBVEWorldHeightfieldActor::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Rebuild();
}

void AKBVEWorldHeightfieldActor::BeginPlay()
{
	Super::BeginPlay();
	// Not redundant with OnConstruction. Procedural mesh sections are runtime
	// data and never serialise into the map, and a cooked build does not rerun
	// construction for a placed actor -- so without this the terrain is present
	// in the editor and missing in the packaged game.
	Rebuild();
}

#if WITH_EDITOR
void AKBVEWorldHeightfieldActor::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
	Super::PostEditChangeProperty(PropertyChangedEvent);
	Rebuild();
}
#endif
