#include "KBVEWorldHeightfieldActor.h"

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

void AKBVEWorldHeightfieldActor::BuildSection(UProceduralMeshComponent* Target, int32 InStep, bool bCollision)
{
	if (!Target)
	{
		return;
	}

	// Stride never divides the patch into fewer than four quads; past that the
	// patch stops describing the ground at all and the skirt does the work.
	const double GenerateStart = FPlatformTime::Seconds();
	const int32 Step = FMath::Clamp(InStep, 1, FMath::Max(1, CellsPerEdge / 4));
	const int32 Quads = CellsPerEdge / Step;
	const int32 Edge = Quads + 1;
	const int32 GridCount = Edge * Edge;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(WorldSeed);
	const float VertexSize = CellSize * Step;
	const float TileStep = VertexSize / 100.0f;

	// Sampled one ring wider than the patch. Normals come from central
	// differences, so an edge vertex needs the height of its neighbour in the
	// next patch over -- without that ring the difference is clamped at the
	// border and adjacent patches disagree about the surface, which shows up as
	// a lit seam along every chunk boundary.
	const int32 PadEdge = Edge + 2;

	// Generated once per stride and kept. The collision proxy asks for the same
	// stride as the drawn surface on every patch that carries collision, and the
	// heights it wants are the heights already computed -- it differs in its
	// skirts and its vertex colours, not in its ground.
	if (CachedPaddedStep != Step || CachedPadded.Num() != PadEdge * PadEdge)
	{
		CachedPadded.SetNumUninitialized(PadEdge * PadEdge);
		FKBVEWorldHeightfield::FillGrid(Shape, Seed,
			TileOrigin.X - TileStep, TileOrigin.Y - TileStep, TileStep, PadEdge, CachedPadded);

		// Applied over the padded grid, before normals are taken from it, so the
		// cutting is lit as the shape it is rather than as the ground it replaced --
		// and so the ring shared with the next patch is levelled identically on both
		// sides and no seam opens along a road that crosses a chunk boundary.
		if (RoadField)
		{
			const float PadOrigin = -TileStep * 100.0f;
			const FVector2D Min(TileOrigin.X * 100.0f + PadOrigin, TileOrigin.Y * 100.0f + PadOrigin);
			const FVector2D Max = Min + FVector2D(PadEdge * VertexSize, PadEdge * VertexSize);
			// Routed first, on this thread. Level only reads the corridors, but
			// EnsureCovers builds them lazily into caches that are not guarded --
			// so the routing has to be finished before any of this is spread out.
			RoadField->EnsureCovers(Min, Max);

			const FKBVEWorldRoadField* Field = RoadField;
			float* const Heights = CachedPadded.GetData();

			ParallelFor(PadEdge, [Field, Heights, Min, VertexSize, PadEdge](int32 Y)
			{
				const float Wy = Min.Y + Y * VertexSize;
				float* Row = Heights + Y * PadEdge;
				for (int32 X = 0; X < PadEdge; ++X)
				{
					Row[X] = Field->Level(Row[X], Min.X + X * VertexSize, Wy);
				}
			}, PadEdge >= 64 ? EParallelForFlags::None : EParallelForFlags::ForceSingleThread);
		}

		CachedPaddedStep = Step;
		LastFillMs += static_cast<float>((FPlatformTime::Seconds() - GenerateStart) * 1000.0);
	}

	const TArray<float>& Padded = CachedPadded;

	auto PaddedAt = [&Padded, PadEdge](int32 X, int32 Y) -> float
	{
		return Padded[(Y + 1) * PadEdge + (X + 1)];
	};

	// Skirts hide LOD cracks visually. As collision they are 400 uu walls at
	// every chunk boundary -- invisible geometry a capsule snags on and a camera
	// probe collides with -- so the proxy gets the surface and nothing else.
	const bool bSkirt = !bCollision && SkirtDepth > KINDA_SMALL_NUMBER;
	const int32 SkirtCount = bSkirt ? 4 * Quads : 0;
	const int32 VertCount = GridCount + SkirtCount;

	TArray<FVector> Vertices;
	TArray<FVector2D> UVs;
	TArray<FVector> Normals;
	TArray<FLinearColor> Colors;
	Vertices.SetNumUninitialized(VertCount);
	UVs.SetNumUninitialized(VertCount);
	Normals.SetNumUninitialized(VertCount);
	Colors.SetNumUninitialized(VertCount);

	const FVector2D PatchOrigin = TileOrigin * 100.0f;
	const float Road2Width = RoadField ? RoadField->GetSurfaceHalfWidth() : 0.0f;

	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const int32 I = Y * Edge + X;
			Vertices[I] = FVector(X * VertexSize, Y * VertexSize, PaddedAt(X, Y));
			UVs[I] = FVector2D(static_cast<float>(X * Step), static_cast<float>(Y * Step));

			// Red is road. The material blends the road surface in against it,
			// so the road is these triangles rather than a second set above them.
			float Road = 0.0f;
			if (RoadField)
			{
				const float Wx = PatchOrigin.X + X * VertexSize;
				const float Wy = PatchOrigin.Y + Y * VertexSize;

				// Sampled across the vertex's own cell, not just at the point.
				// A distant patch has vertices further apart than the road is
				// wide, and a road that passes between two of them would be
				// painted onto neither -- so it would fade out with distance
				// while the cutting it sits in stayed.
				const float Reach = VertexSize * 0.4f;
				Road = RoadField->SurfaceWeight(Wx, Wy);

				// Only where the vertices are further apart than the road is
				// wide. A near patch samples finely enough that one query per
				// vertex already resolves the road, and these are the patches
				// with the vertices to spare -- paying five queries each there
				// was most of the cost of painting.
				if (VertexSize > Road2Width)
				{
					Road = FMath::Max(Road, RoadField->SurfaceWeight(Wx - Reach, Wy));
					Road = FMath::Max(Road, RoadField->SurfaceWeight(Wx + Reach, Wy));
					Road = FMath::Max(Road, RoadField->SurfaceWeight(Wx, Wy - Reach));
					Road = FMath::Max(Road, RoadField->SurfaceWeight(Wx, Wy + Reach));
				}
			}
			Colors[I] = FLinearColor(Road, 0.0f, 0.0f, 1.0f);
		}
	}

	// Central differences over the height grid rather than accumulating face
	// normals: the grid is regular, so the analytic normal is both cheaper and
	// free of the artefacts averaged face normals leave at patch edges.
	const float TwoSamples = 2.0f * VertexSize;
	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const float DX = (PaddedAt(X + 1, Y) - PaddedAt(X - 1, Y)) / TwoSamples;
			const float DY = (PaddedAt(X, Y + 1) - PaddedAt(X, Y - 1)) / TwoSamples;
			Normals[Y * Edge + X] = FVector(-DX, -DY, 1.0f).GetSafeNormal();
		}
	}

	TArray<int32> Triangles;
	Triangles.Reserve(Quads * Quads * 6 + SkirtCount * 6);
	for (int32 Y = 0; Y < Quads; ++Y)
	{
		for (int32 X = 0; X < Quads; ++X)
		{
			const int32 I = Y * Edge + X;
			Triangles.Add(I);
			Triangles.Add(I + Edge);
			Triangles.Add(I + Edge + 1);
			Triangles.Add(I);
			Triangles.Add(I + Edge + 1);
			Triangles.Add(I + 1);
		}
	}

	if (bSkirt)
	{
		// One dropped vertex per border edge start, walked as four runs so the
		// wall is continuous around the patch. Each run emits its quad against
		// the next border vertex, which the run's own ordering keeps wound
		// outward.
		int32 Next = GridCount;
		auto AddSkirtRun = [&](TFunctionRef<int32(int32)> BorderIndex, bool bFlip)
		{
			for (int32 K = 0; K < Quads; ++K)
			{
				const int32 A = BorderIndex(K);
				const int32 B = BorderIndex(K + 1);
				const int32 DownA = Next++;
				Vertices[DownA] = Vertices[A] - FVector(0.0f, 0.0f, SkirtDepth);
				UVs[DownA] = UVs[A];
				Normals[DownA] = Normals[A];
				Colors[DownA] = Colors[A];

				// The second dropped vertex is shared with the next iteration's
				// A only at the run's end, so emit it per quad and let the
				// duplicate cost stand -- it is 4 * Quads vertices, not a mesh.
				const int32 DownB = Next++;
				Vertices[DownB] = Vertices[B] - FVector(0.0f, 0.0f, SkirtDepth);
				UVs[DownB] = UVs[B];
				Normals[DownB] = Normals[B];
				Colors[DownB] = Colors[B];

				if (bFlip)
				{
					Triangles.Add(A); Triangles.Add(DownB); Triangles.Add(DownA);
					Triangles.Add(A); Triangles.Add(B); Triangles.Add(DownB);
				}
				else
				{
					Triangles.Add(A); Triangles.Add(DownA); Triangles.Add(DownB);
					Triangles.Add(A); Triangles.Add(DownB); Triangles.Add(B);
				}
			}
		};

		// Each run consumes two vertices per quad, so the four runs together
		// need 8 * Quads slots; size the array to match before writing.
		Vertices.SetNumUninitialized(GridCount + 8 * Quads);
		UVs.SetNumUninitialized(GridCount + 8 * Quads);
		Normals.SetNumUninitialized(GridCount + 8 * Quads);
		Colors.SetNumUninitialized(GridCount + 8 * Quads);

		AddSkirtRun([Edge](int32 K) { return K; }, false);                          // Y = 0
		AddSkirtRun([Edge, Quads](int32 K) { return Quads * Edge + K; }, true);     // Y = max
		AddSkirtRun([Edge](int32 K) { return K * Edge; }, true);                    // X = 0
		AddSkirtRun([Edge, Quads](int32 K) { return K * Edge + Quads; }, false);    // X = max
	}

	// The ground material samples by world XY, so the tangent that matches how
	// the normal map is actually being read is world +X projected onto the
	// surface. Leaving tangents empty leaves the normal map with no basis at
	// all, which is what makes lit detail invert as the camera swings around.
	TArray<FProcMeshTangent> Tangents;
	Tangents.SetNumUninitialized(Vertices.Num());
	for (int32 I = 0; I < Vertices.Num(); ++I)
	{
		const FVector& N = Normals[I];
		const FVector Tangent = (FVector::XAxisVector - N * (N | FVector::XAxisVector)).GetSafeNormal();
		Tangents[I] = FProcMeshTangent(Tangent, false);
	}

	LastGenerateMs += static_cast<float>((FPlatformTime::Seconds() - GenerateStart) * 1000.0);

	const double SectionStart = FPlatformTime::Seconds();
	Target->ClearAllMeshSections();
	Target->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents,
		bCollision);
	LastSectionMs += static_cast<float>((FPlatformTime::Seconds() - SectionStart) * 1000.0);

	if (TerrainMaterial && !bCollision)
	{
		Target->SetMaterial(0, TerrainMaterial);
	}
}

void AKBVEWorldHeightfieldActor::Rebuild()
{
	LastGenerateMs = 0.0f;
	LastSectionMs = 0.0f;
	LastFillMs = 0.0f;

	const double RebuildStart = FPlatformTime::Seconds();

	// A pooled patch arrives with the last coordinate's heights still cached.
	CachedPaddedStep = 0;

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
