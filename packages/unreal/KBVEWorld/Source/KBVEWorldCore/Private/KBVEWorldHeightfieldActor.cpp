#include "KBVEWorldHeightfieldActor.h"

#include "KBVEWorldPatch.h"

#include "Async/ParallelFor.h"
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
}

void AKBVEWorldHeightfieldActor::RebuildAsync()
{
	// Planned here, where the road field lives and where routing happens. What
	// crosses to the worker is a plan that owns everything it reads.
	FKBVEWorldPatchPlan Draw;
	const bool bDraw = PlanSection(LODStep, false, Draw);

	FKBVEWorldPatchPlan Collide;
	const bool bCollide = CollisionMesh && bGenerateCollision
		&& PlanSection(FMath::Max(LODStep, CollisionLODStep), true, Collide);

	if (CollisionMesh && !bGenerateCollision)
	{
		CollisionMesh->ClearAllMeshSections();
	}

	if (!bDraw && !bCollide)
	{
		return;
	}

	const uint32 Mine = ++Serial;
	TWeakObjectPtr<AKBVEWorldHeightfieldActor> Held(this);

	Async(EAsyncExecution::ThreadPool, [Held, Mine, Draw, Collide, bDraw, bCollide]()
	{
		// The worker's own scratch. The two sections share it the way the
		// synchronous path does -- the collision proxy asks for heights the
		// drawn surface has usually already computed -- and it belongs to this
		// job alone, so two patches building at once cannot meet in it.
		TArray<float> Padded;
		bool bValid = false;

		TSharedPtr<FKBVEWorldPatchMesh> DrawMesh;
		if (bDraw)
		{
			DrawMesh = MakeShared<FKBVEWorldPatchMesh>();
			FKBVEWorldPatchPlan::Build(Draw, Padded, bValid, *DrawMesh);
		}

		TSharedPtr<FKBVEWorldPatchMesh> CollideMesh;
		if (bCollide)
		{
			CollideMesh = MakeShared<FKBVEWorldPatchMesh>();
			FKBVEWorldPatchPlan::Build(Collide, Padded, bValid, *CollideMesh);
		}

		AsyncTask(ENamedThreads::GameThread, [Held, Mine, DrawMesh, CollideMesh]()
		{
			AKBVEWorldHeightfieldActor* Patch = Held.Get();
			if (!Patch || Patch->Serial != Mine)
			{
				// The patch was recycled to another coordinate while this was in
				// flight. Its ground is somewhere else now and this is the ground
				// it used to be on.
				return;
			}

			if (DrawMesh.IsValid())
			{
				Patch->Commit(Patch->Mesh, *DrawMesh, false);
			}
			if (CollideMesh.IsValid())
			{
				Patch->Commit(Patch->CollisionMesh, *CollideMesh, true);
			}
		});
	});
}

void AKBVEWorldHeightfieldActor::Rebuild()
{
	LastGenerateMs = 0.0f;
	LastSectionMs = 0.0f;
	LastFillMs = 0.0f;

	const double RebuildStart = FPlatformTime::Seconds();

	// A pooled patch arrives with the last coordinate's heights still cached.
	bCachedPaddedValid = false;

	if (GKBVEWorldAsyncPatchCVar.GetValueOnGameThread() != 0)
	{
		RebuildAsync();
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
