#include "KBVEWorldStreamer.h"

#include "KBVEWorldHeightfield.h"
#include "KBVEWorldRoadField.h"

#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldHeightfieldActor.h"
#include "ProceduralMeshComponent.h"

DEFINE_LOG_CATEGORY(LogKBVEWorldStream);

AKBVEWorldStreamer::AKBVEWorldStreamer()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));

	WaterPlane = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("WaterPlane"));
	WaterPlane->SetupAttachment(GetRootComponent());
	WaterPlane->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	WaterPlane->SetCanEverAffectNavigation(false);
	// A flat sheet at a constant height casts a shadow over everything under it,
	// including ground it is nowhere near.
	WaterPlane->SetCastShadow(false);
}

void AKBVEWorldStreamer::RebuildWaterPlane(const FIntPoint& Centre)
{
	if (!WaterPlane || !WaterMaterial)
	{
		return;
	}

	// One quad over the whole window, recentred as the window moves. Two chunks
	// of margin so the edge is never the thing the player is walking toward.
	const float ChunkSize = ChunkWorldSize();
	const float Reach = (ViewRadiusChunks + 2) * ChunkSize;
	const FVector Origin(Centre.X * ChunkSize, Centre.Y * ChunkSize, Shape.WaterZ);

	const TArray<FVector> Vertices = {
		Origin + FVector(-Reach, -Reach, 0.0f),
		Origin + FVector(Reach, -Reach, 0.0f),
		Origin + FVector(-Reach, Reach, 0.0f),
		Origin + FVector(Reach, Reach, 0.0f),
	};
	const TArray<int32> Triangles = { 0, 2, 3, 0, 3, 1 };
	const TArray<FVector> Normals = {
		FVector::UpVector, FVector::UpVector, FVector::UpVector, FVector::UpVector,
	};
	const float Tiles = (Reach * 2.0f) / 100.0f;
	const TArray<FVector2D> UVs = {
		FVector2D(0.0f, 0.0f),
		FVector2D(Tiles, 0.0f),
		FVector2D(0.0f, Tiles),
		FVector2D(Tiles, Tiles),
	};
	const TArray<FProcMeshTangent> Tangents = {
		FProcMeshTangent(FVector::XAxisVector, false),
		FProcMeshTangent(FVector::XAxisVector, false),
		FProcMeshTangent(FVector::XAxisVector, false),
		FProcMeshTangent(FVector::XAxisVector, false),
	};

	const TArray<FLinearColor> NoColors;
	WaterPlane->ClearAllMeshSections();
	WaterPlane->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, NoColors,
		Tangents, false);
	WaterPlane->SetMaterial(0, WaterMaterial);
}

FIntPoint AKBVEWorldStreamer::ChunkCoordAt(const FVector& WorldLocation) const
{
	const float Size = ChunkWorldSize();
	return FIntPoint(
		FMath::FloorToInt(static_cast<float>(WorldLocation.X) / Size),
		FMath::FloorToInt(static_cast<float>(WorldLocation.Y) / Size));
}

FIntPoint AKBVEWorldStreamer::StableChunkCoordAt(const FVector& WorldLocation) const
{
	const FIntPoint Candidate = ChunkCoordAt(WorldLocation);
	if (Candidate == LastCentre || LastCentre.X == MAX_int32)
	{
		return Candidate;
	}

	// Keep the current centre until the view is a margin clear of its bounds.
	// Otherwise a position sitting on the boundary alternates every frame.
	const float Size = ChunkWorldSize();
	const float Margin = Size * FMath::Max(0.0f, RecentreHysteresis);
	const float MinX = LastCentre.X * Size - Margin;
	const float MaxX = (LastCentre.X + 1) * Size + Margin;
	const float MinY = LastCentre.Y * Size - Margin;
	const float MaxY = (LastCentre.Y + 1) * Size + Margin;

	const bool bStillInside =
		WorldLocation.X >= MinX && WorldLocation.X <= MaxX &&
		WorldLocation.Y >= MinY && WorldLocation.Y <= MaxY;

	return bStillInside ? LastCentre : Candidate;
}

bool AKBVEWorldStreamer::TryGetViewLocation(FVector& Out) const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		Out = GetActorLocation();
		return false;
	}

	// The player wins whenever there is one. ViewLocationsRenderedLastFrame is
	// what makes this work in the editor, but during play-in-editor the editor
	// viewport is also rendering, and its camera can be the entry at index 0 --
	// which builds the world around wherever the editor view was left rather
	// than around the pawn.
	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		// The pawn, not the camera. A third-person camera orbits its pawn by
		// hundreds of units, so streaming from the view point makes the world
		// recentre as a consequence of looking around.
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

void AKBVEWorldStreamer::SetPatchVisible(AKBVEWorldHeightfieldActor* Patch, bool bVisible)
{
	// Component visibility, not SetActorHiddenInGame: the latter does nothing in
	// an editor viewport, so released patches stayed on screen there while the
	// pool believed they were gone.
	Patch->SetActorHiddenInGame(!bVisible);
	if (UProceduralMeshComponent* PatchMesh = Patch->GetMeshComponent())
	{
		PatchMesh->SetVisibility(bVisible, true);
	}
}

int32 AKBVEWorldStreamer::LODStepForRing(int32 Ring) const
{
	const int32 Group = Ring / FMath::Max(1, RingsPerLOD);
	// Capped rather than unbounded: past a quarter of the patch the stride stops
	// describing terrain, and the patch is mostly skirt.
	return FMath::Clamp(1 << FMath::Min(Group, 6), 1, FMath::Max(1, CellsPerChunk / 4));
}

// Out of line, where FKBVEWorldRoadField is a complete type: the header only
// forward-declares it, and a TUniquePtr member cannot be destroyed against a
// declaration.
AKBVEWorldStreamer::~AKBVEWorldStreamer() = default;

const FKBVEWorldRoadField* AKBVEWorldStreamer::GetRoadField() const
{
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(WorldSeed);
	// Rebuilt when the numbers behind it change, so editing the road in the
	// details panel regrades the ground rather than leaving the old cuttings in
	// terrain that no longer has roads there.
	if (!RoadField.IsValid() || !RoadField->Matches(Road, Seed))
	{
		RoadField = MakeUnique<FKBVEWorldRoadField>(Road, Shape, Seed);
	}
	return RoadField.Get();
}

void AKBVEWorldStreamer::ConfigurePatch(AKBVEWorldHeightfieldActor* Patch, const FIntPoint& Coord) const
{
	const float TileStep = CellSize / 100.0f;

	Patch->WorldSeed = WorldSeed;
	Patch->Shape = Shape;
	Patch->CellsPerEdge = CellsPerChunk;
	Patch->CellSize = CellSize;
	Patch->SkirtDepth = SkirtDepth;
	Patch->TerrainMaterial = TerrainMaterial;
	Patch->SetRoadField(GetRoadField());
	// Tile origin follows the chunk coordinate exactly, so the last column of
	// one patch samples the same tile as the first column of the next and the
	// surfaces meet rather than nearly meet.
	Patch->TileOrigin = FVector2D(Coord.X * CellsPerChunk * TileStep, Coord.Y * CellsPerChunk * TileStep);

	// LastCentre is updated before anything is queued, so the ring measured here
	// is the one the patch is being built for.
	const FIntPoint Delta = Coord - LastCentre;
	const int32 Ring = FMath::Max(FMath::Abs(Delta.X), FMath::Abs(Delta.Y));
	Patch->LODStep = LODStepForRing(Ring);
	Patch->bGenerateCollision = WantsCollisionAtRing(Ring);
	// Never finer than the mesh being drawn: a proxy denser than the visual
	// surface costs more to cook and cannot be more accurate than its source.
	Patch->CollisionLODStep = FMath::Max(CollisionLODStep, Patch->LODStep);

	// Set on the component rather than rebuilt into the mesh: shadow casting is
	// a render-state flag, so changing it as a patch moves between rings costs
	// nothing and never needs a rebuild.
	if (UProceduralMeshComponent* PatchMesh = Patch->GetMeshComponent())
	{
		PatchMesh->SetCastShadow(WantsShadowAtRing(Ring));
	}
}

void AKBVEWorldStreamer::BuildChunk(const FIntPoint& Coord)
{
	const float Size = ChunkWorldSize();
	const FTransform PatchTransform(FRotator::ZeroRotator, FVector(Coord.X * Size, Coord.Y * Size, 0.0f));

	const double AcquireStart = FPlatformTime::Seconds();

	AKBVEWorldHeightfieldActor* Patch = nullptr;
	while (Pool.Num() > 0 && !IsValid(Patch))
	{
		Patch = Pool.Pop().Get();
	}

	if (IsValid(Patch))
	{
		SetPatchVisible(Patch, true);
		Patch->SetActorTransform(PatchTransform);
		ConfigurePatch(Patch, Coord);
		FillSpawnMs += static_cast<float>((FPlatformTime::Seconds() - AcquireStart) * 1000.0);
		BuildAndAccount(Patch);
		Live.Add(Coord, Patch);
		return;
	}

	// Deferred, so the properties are in place before construction runs.
	// SpawnActor calls OnConstruction itself, and OnConstruction rebuilds -- so a
	// plain spawn builds the whole patch once at the class defaults (a 257x257
	// grid at the finest stride) and then throws it away when the real values
	// arrive. That double build measured 11 ms per patch and was 95% of start-up.
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	Patch = World->SpawnActorDeferred<AKBVEWorldHeightfieldActor>(
		AKBVEWorldHeightfieldActor::StaticClass(), PatchTransform,
		const_cast<AKBVEWorldStreamer*>(this), nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (!Patch)
	{
		return;
	}
	++SpawnCount;

	Patch->SetFlags(RF_Transient);
	ConfigurePatch(Patch, Coord);
	FillSpawnMs += static_cast<float>((FPlatformTime::Seconds() - AcquireStart) * 1000.0);

	// FinishSpawning runs OnConstruction, which builds the patch -- once, with
	// the right values.
	const double BuildStart = FPlatformTime::Seconds();
	Patch->FinishSpawning(PatchTransform);
	AccountBuild(Patch, static_cast<float>((FPlatformTime::Seconds() - BuildStart) * 1000.0));

	Live.Add(Coord, Patch);
}

void AKBVEWorldStreamer::BuildAndAccount(AKBVEWorldHeightfieldActor* Patch)
{
	const double Start = FPlatformTime::Seconds();
	Patch->Rebuild();
	AccountBuild(Patch, static_cast<float>((FPlatformTime::Seconds() - Start) * 1000.0));
}

void AKBVEWorldStreamer::AccountBuild(AKBVEWorldHeightfieldActor* Patch, float ElapsedMs)
{
	LastBuildMs = ElapsedMs;
	++BuildCount;
	WorstBuildMs = FMath::Max(WorstBuildMs, LastBuildMs);
	FillBuildMs += LastBuildMs;

	const int32 Slot = FMath::Clamp(FMath::FloorLog2(FMath::Max(1, Patch->LODStep)), 0, MaxTrackedLOD - 1);
	BuildMsByLOD[Slot] += LastBuildMs;
	GenerateMsByLOD[Slot] += Patch->GetLastGenerateMs();
	SectionMsByLOD[Slot] += Patch->GetLastSectionMs();
	++BuildsByLOD[Slot];
}

void AKBVEWorldStreamer::ReleaseOutsideRadius(const FIntPoint& Centre)
{
	// Derived from the centre being moved to, so anything left over from the
	// previous one is answering a question that is no longer being asked.
	Restage.Reset();

	TArray<FIntPoint> Stale;
	for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldHeightfieldActor>>& Pair : Live)
	{
		const FIntPoint Delta = Pair.Key - Centre;
		const int32 Ring = FMath::Max(FMath::Abs(Delta.X), FMath::Abs(Delta.Y));
		if (Ring > ViewRadiusChunks)
		{
			Stale.Add(Pair.Key);
			continue;
		}

		// A patch built coarse when it was far away has to be rebuilt as the
		// viewer closes on it, and so does one that now needs collision. It is
		// rebuilt where it stands rather than released to the pool and queued:
		// pooling it removes the only floor under that coordinate, and the
		// rebuild then waits behind a millisecond budget. A pawn standing on a
		// chunk whose ring changed lost its floor for as long as that took,
		// fell, and was snapped back when the patch returned. A stale stride
		// for a few frames is not visible; a missing floor is.
		if (IsValid(Pair.Value)
			&& (Pair.Value->LODStep != LODStepForRing(Ring)
				|| Pair.Value->bGenerateCollision != WantsCollisionAtRing(Ring)))
		{
			Restage.Add(Pair.Key);
		}
	}

	for (const FIntPoint& Coord : Stale)
	{
		TObjectPtr<AKBVEWorldHeightfieldActor> Patch;
		Live.RemoveAndCopyValue(Coord, Patch);
		if (IsValid(Patch))
		{
			SetPatchVisible(Patch, false);
			Pool.Add(Patch);
		}
	}
}

void AKBVEWorldStreamer::QueueInsideRadius(const FIntPoint& Centre)
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

	// Nearest first: what the viewer is standing on matters more than the
	// far corner of the window, and on a boundary crossing both are eligible.
	auto NearestFirst = [&Centre](const FIntPoint& A, const FIntPoint& B)
	{
		const FIntPoint DA = A - Centre;
		const FIntPoint DB = B - Centre;
		return (DA.X * DA.X + DA.Y * DA.Y) < (DB.X * DB.X + DB.Y * DB.Y);
	};
	Pending.Sort(NearestFirst);
	Restage.Sort(NearestFirst);
}

void AKBVEWorldStreamer::RebuildInPlace(const FIntPoint& Coord)
{
	TObjectPtr<AKBVEWorldHeightfieldActor>* Found = Live.Find(Coord);
	if (!Found || !IsValid(*Found))
	{
		return;
	}

	// No transform change and no visibility change: the patch is already where
	// it belongs and already on screen. Only the stride and the collision flag
	// are being restated, then the mesh regenerated to match.
	ConfigurePatch(*Found, Coord);
	BuildAndAccount(*Found);
}

void AKBVEWorldStreamer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

#if WITH_EDITOR
	// While play-in-editor is running there are two worlds, each with its own
	// streamer, and each would build its own full window -- 338 patches for a
	// session that can only ever look at 169 of them. The editor copy stands
	// down for the duration; its patches stay in memory but stop costing time,
	// and the PIE world is the one being looked at.
	if (const UWorld* OwnWorld = GetWorld())
	{
		if (OwnWorld->WorldType == EWorldType::Editor && GEngine)
		{
			for (const FWorldContext& Context : GEngine->GetWorldContexts())
			{
				if (Context.WorldType == EWorldType::PIE)
				{
					return;
				}
			}
		}
	}
#endif

	FVector ViewLocation;
	TryGetViewLocation(ViewLocation);
	const FIntPoint Centre = StableChunkCoordAt(ViewLocation);

	if (Centre != LastCentre)
	{
		const FIntPoint Previous = LastCentre;
		LastCentre = Centre;
		ReleaseOutsideRadius(Centre);
		QueueInsideRadius(Centre);
		RebuildWaterPlane(Centre);

		FillStartSeconds = FPlatformTime::Seconds();
		FillTicks = 0;
		FillBuildMs = 0.0f;
		FillSpawnMs = 0.0f;
		WorstBuildMs = 0.0f;
		FMemory::Memzero(BuildMsByLOD);
		FMemory::Memzero(GenerateMsByLOD);
		FMemory::Memzero(SectionMsByLOD);
		FMemory::Memzero(BuildsByLOD);

		// Display, not Verbose: a centre change is rare by design, so if these
		// appear while standing still or turning on the spot, the streamer is
		// reacting to something it should not and that is worth seeing.
		UE_LOG(LogKBVEWorldStream, Display,
			TEXT("centre %d,%d -> %d,%d (view %.0f,%.0f): %d live, %d queued, %d restaged, %d pooled"),
			Previous.X, Previous.Y, Centre.X, Centre.Y, ViewLocation.X, ViewLocation.Y,
			Live.Num(), Pending.Num(), Restage.Num(), Pool.Num());
	}

	int32 Built = 0;
	const double TickStart = FPlatformTime::Seconds();
	if (Pending.Num() > 0 || Restage.Num() > 0)
	{
		++FillTicks;
	}
	while (Pending.Num() > 0 && Built < MaxBuildsPerTick)
	{
		BuildChunk(Pending[0]);
		Pending.RemoveAt(0, EAllowShrinking::No);
		++Built;

		// Checked after the first build, never before: a budget smaller than a
		// single patch would otherwise queue work and never run any of it.
		const double SpentMs = (FPlatformTime::Seconds() - TickStart) * 1000.0;
		if (SpentMs >= MaxBuildMillisecondsPerTick)
		{
			break;
		}
	}

	// Same budget, and after the coordinates that have no patch at all: a
	// restaged patch is standing there being drawn and stood on the whole time,
	// so it can wait, where an empty coordinate is a hole in the world.
	//
	// Checked before the loop as well as inside it. Both loops used to check
	// only after building, each one entitled to overrun on its own, so a tick
	// that had already spent thirty milliseconds filling a hole would go on to
	// restage a patch and spend thirty more. The after-check is there so a
	// budget smaller than one patch still makes progress; that argument applies
	// once per tick, not once per queue.
	const bool bBudgetLeft =
		(FPlatformTime::Seconds() - TickStart) * 1000.0 < MaxBuildMillisecondsPerTick;

	while (bBudgetLeft && Restage.Num() > 0 && Built < MaxBuildsPerTick)
	{
		RebuildInPlace(Restage[0]);
		Restage.RemoveAt(0, EAllowShrinking::No);
		++Built;

		const double SpentMs = (FPlatformTime::Seconds() - TickStart) * 1000.0;
		if (SpentMs >= MaxBuildMillisecondsPerTick)
		{
			break;
		}
	}

	// One line when the window finishes filling, rather than per patch. The
	// interesting numbers are what the whole window cost and which ring it went
	// to, not each of its 169 parts.
	if (Built > 0 && Pending.Num() == 0 && Restage.Num() == 0)
	{
		FString ByLOD;
		for (int32 I = 0; I < MaxTrackedLOD; ++I)
		{
			if (BuildsByLOD[I] > 0)
			{
				ByLOD += FString::Printf(TEXT(" stride%d=%dx%.1fms(gen %.1f, section %.1f)"),
					1 << I, BuildsByLOD[I], BuildMsByLOD[I] / BuildsByLOD[I],
					GenerateMsByLOD[I] / BuildsByLOD[I], SectionMsByLOD[I] / BuildsByLOD[I]);
			}
		}

		UE_LOG(LogKBVEWorldStream, Display,
			TEXT("window filled at %d,%d: %d live (%d pooled) over %d ticks, "
				"%.0f ms building + %.0f ms acquiring, %.2f s wall, worst %.2f ms,%s "
				"[lifetime: %d builds, %d spawns]"),
			Centre.X, Centre.Y, Live.Num(), Pool.Num(), FillTicks,
			FillBuildMs, FillSpawnMs, FPlatformTime::Seconds() - FillStartSeconds,
			WorstBuildMs, *ByLOD, BuildCount, SpawnCount);
	}
}

void AKBVEWorldStreamer::BeginPlay()
{
	Super::BeginPlay();
	LastCentre = FIntPoint(MAX_int32, MAX_int32);
}

void AKBVEWorldStreamer::EndPlay(const EEndPlayReason::Type Reason)
{
	for (const TPair<FIntPoint, TObjectPtr<AKBVEWorldHeightfieldActor>>& Pair : Live)
	{
		if (IsValid(Pair.Value))
		{
			Pair.Value->Destroy();
		}
	}
	Live.Reset();

	for (const TObjectPtr<AKBVEWorldHeightfieldActor>& Patch : Pool)
	{
		if (IsValid(Patch))
		{
			Patch->Destroy();
		}
	}
	Pool.Reset();

	Super::EndPlay(Reason);
}
