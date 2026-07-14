#include "KBVEWorldTerrainRenderSubsystem.h"

#include "KBVEWorldTerrainShader.h"
#include "Components/SceneComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "ProceduralMeshComponent.h"

namespace KBVETerrainCfg
{
	constexpr int32 RegionSize = 4;
	constexpr int32 RebuildsPerTick = 1;
}

bool UKBVEWorldTerrainRenderSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer)) return false;
	const UWorld* W = Cast<UWorld>(Outer);
	return W && W->IsGameWorld();
}

void UKBVEWorldTerrainRenderSubsystem::Deinitialize()
{
	for (TPair<FIntPoint, FKBVEWorldTerrainRegion>& Pair : Regions)
	{
		if (Pair.Value.Section)
		{
			Pair.Value.Section->ClearAllMeshSections();
		}
	}
	if (HostActor)
	{
		HostActor->Destroy();
		HostActor = nullptr;
	}
	Regions.Reset();
	PendingChunks.Reset();
	DirtyRegions.Reset();
	GroundMaterial = nullptr;
	Super::Deinitialize();
}

void UKBVEWorldTerrainRenderSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (DirtyRegions.Num() == 0) return;
	EnsureHost();
	if (!HostActor) return;

	int32 Budget = KBVETerrainCfg::RebuildsPerTick;
	for (const FIntPoint& Key : DirtyRegions.Array())
	{
		if (Budget-- <= 0) break;
		DirtyRegions.Remove(Key);
		RebuildRegion(Key);
	}
}

FIntPoint UKBVEWorldTerrainRenderSubsystem::RegionKeyFor(FIntPoint ChunkCoord) const
{
	auto FloorDiv = [](int32 A, int32 B)
	{
		return (A >= 0) ? (A / B) : -(((-A) + B - 1) / B);
	};
	return FIntPoint(FloorDiv(ChunkCoord.X, KBVETerrainCfg::RegionSize), FloorDiv(ChunkCoord.Y, KBVETerrainCfg::RegionSize));
}

void UKBVEWorldTerrainRenderSubsystem::RegisterChunkTerrain(FIntPoint ChunkCoord, const FVector& ChunkWorldOrigin, const FKBVEWorldChunkMesh& Mesh)
{
	if (!Mesh.IsValidMesh()) return;

	FKBVEWorldTerrainPendingChunk& P = PendingChunks.FindOrAdd(ChunkCoord);
	P.WorldOrigin = ChunkWorldOrigin;
	P.Mesh = Mesh;

	const FIntPoint Key = RegionKeyFor(ChunkCoord);
	Regions.FindOrAdd(Key).Members.Add(ChunkCoord);
	DirtyRegions.Add(Key);
}

void UKBVEWorldTerrainRenderSubsystem::ReleaseChunkTerrain(FIntPoint ChunkCoord)
{
	if (PendingChunks.Remove(ChunkCoord) == 0) return;

	const FIntPoint Key = RegionKeyFor(ChunkCoord);
	if (FKBVEWorldTerrainRegion* R = Regions.Find(Key))
	{
		R->Members.Remove(ChunkCoord);
		DirtyRegions.Add(Key);
	}
}

void UKBVEWorldTerrainRenderSubsystem::EnsureHost()
{
	if (HostActor) return;
	UWorld* W = GetWorld();
	if (!W) return;

	FActorSpawnParameters Params;
	Params.ObjectFlags |= RF_Transient;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	HostActor = W->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
	if (!HostActor) return;

	USceneComponent* Root = NewObject<USceneComponent>(HostActor, TEXT("TerrainRoot"), RF_Transient);
	HostActor->SetRootComponent(Root);
	Root->RegisterComponent();
}

UProceduralMeshComponent* UKBVEWorldTerrainRenderSubsystem::EnsureRegionSection(FIntPoint RegionKey)
{
	FKBVEWorldTerrainRegion& R = Regions.FindOrAdd(RegionKey);
	if (R.Section) return R.Section;
	if (!HostActor) return nullptr;

	UProceduralMeshComponent* PMC = NewObject<UProceduralMeshComponent>(HostActor, NAME_None, RF_Transient);
	PMC->SetMobility(EComponentMobility::Movable);
	PMC->SetupAttachment(HostActor->GetRootComponent());
	PMC->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	PMC->SetCanEverAffectNavigation(false);
	PMC->RegisterComponent();
	R.Section = PMC;
	return PMC;
}

void UKBVEWorldTerrainRenderSubsystem::RebuildRegion(FIntPoint RegionKey)
{
	FKBVEWorldTerrainRegion* RPtr = Regions.Find(RegionKey);
	if (!RPtr) return;
	FKBVEWorldTerrainRegion& R = *RPtr;

	if (R.Members.Num() == 0)
	{
		if (R.Section)
		{
			R.Section->DestroyComponent();
			R.Section = nullptr;
		}
		Regions.Remove(RegionKey);
		return;
	}

	int32 CellsPerEdge = 32;
	float CellSize = 200.f;
	for (const FIntPoint& C : R.Members)
	{
		if (const FKBVEWorldTerrainPendingChunk* P = PendingChunks.Find(C))
		{
			CellsPerEdge = P->Mesh.CellsPerEdge;
			CellSize = P->Mesh.CellSize;
			break;
		}
	}
	const float RegionWorldSize = CellsPerEdge * CellSize * KBVETerrainCfg::RegionSize;
	R.Origin = FVector(RegionKey.X * RegionWorldSize, RegionKey.Y * RegionWorldSize, 0.f);

	TArray<FVector> Verts;
	TArray<int32> Tris;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FProcMeshTangent> Tangents;

	for (const FIntPoint& C : R.Members)
	{
		const FKBVEWorldTerrainPendingChunk* P = PendingChunks.Find(C);
		if (!P || !P->Mesh.IsValidMesh()) continue;

		const FVector Offset = P->WorldOrigin - R.Origin;
		const int32 Base = Verts.Num();
		const FKBVEWorldChunkMesh& M = P->Mesh;

		Verts.Reserve(Verts.Num() + M.Vertices.Num());
		for (const FVector& V : M.Vertices) Verts.Add(V + Offset);

		Tris.Reserve(Tris.Num() + M.Triangles.Num());
		for (int32 T : M.Triangles) Tris.Add(T + Base);

		Normals.Append(M.Normals);
		UVs.Append(M.UVs);
		Tangents.Append(M.Tangents);
	}

	if (Verts.Num() == 0) return;

	UProceduralMeshComponent* PMC = EnsureRegionSection(RegionKey);
	if (!PMC) return;
	PMC->SetWorldLocation(R.Origin);

	if (!GroundMaterial)
	{
		GroundMaterial = FKBVEWorldTerrainShader::GetOrCreateGroundMaterial(this);
	}

	TArray<FColor> Colors;
	Colors.Init(FColor::White, Verts.Num());

	PMC->ClearAllMeshSections();
	PMC->CreateMeshSection(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);
	if (GroundMaterial) PMC->SetMaterial(0, GroundMaterial);
}
