#include "chuckTerrainChunk.h"

#include "chuckNoise.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "KismetProceduralMeshLibrary.h"
#include "Materials/Material.h"
#include "Materials/MaterialInterface.h"
#include "NavigationSystem.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/BufferArchive.h"
#include "Serialization/MemoryReader.h"
#include "UObject/ConstructorHelpers.h"

AchuckTerrainChunk::AchuckTerrainChunk()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mesh"));
	Mesh->bUseAsyncCooking = true;
	Mesh->SetCollisionProfileName(TEXT("BlockAll"));
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Mesh->SetCanEverAffectNavigation(true);
	RootComponent = Mesh;

	Water = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Water"));
	Water->SetupAttachment(RootComponent);
	Water->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Water->SetCanEverAffectNavigation(false);
	Water->SetCastShadow(false);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> PlaneFinder(TEXT("/Engine/BasicShapes/Plane.Plane"));
	if (PlaneFinder.Succeeded())
	{
		Water->SetStaticMesh(PlaneFinder.Object);
	}

	static ConstructorHelpers::FObjectFinder<UMaterialInterface> GroundFinder(TEXT("/Engine/EngineMaterials/WorldGridMaterial.WorldGridMaterial"));
	if (GroundFinder.Succeeded())
	{
		GroundMaterial = GroundFinder.Object;
	}
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> WaterFinder(TEXT("/Engine/EngineMaterials/EmissiveTexturedMaterial.EmissiveTexturedMaterial"));
	if (WaterFinder.Succeeded())
	{
		WaterMaterial = WaterFinder.Object;
	}

	SetReplicates(false);
}

void AchuckTerrainChunk::BeginPlay()
{
	Super::BeginPlay();
	SetActorHiddenInGame(true);
}

void AchuckTerrainChunk::GenerateMeshData(FchuckChunkMesh& OutMesh) const
{
	const int32 VertsPerEdge = CellsPerEdge + 1;
	const int32 VertCount    = VertsPerEdge * VertsPerEdge;
	OutMesh.CellsPerEdge = CellsPerEdge;
	OutMesh.CellSize     = CellSize;
	OutMesh.Vertices.SetNumUninitialized(VertCount);
	OutMesh.Normals.Init(FVector::UpVector, VertCount);
	OutMesh.UVs.SetNumUninitialized(VertCount);
	OutMesh.Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), VertCount);

	const FVector ChunkOrigin(Coord.X * CellsPerEdge * CellSize, Coord.Y * CellsPerEdge * CellSize, 0.f);
	for (int32 Y = 0; Y < VertsPerEdge; ++Y)
	{
		for (int32 X = 0; X < VertsPerEdge; ++X)
		{
			const int32 Idx = Y * VertsPerEdge + X;
			const float Lx = X * CellSize;
			const float Ly = Y * CellSize;
			const float Wx = ChunkOrigin.X + Lx;
			const float Wy = ChunkOrigin.Y + Ly;
			const float Z  = chuckNoise::Heightmap(Wx, Wy, Seed);
			OutMesh.Vertices[Idx] = FVector(Lx, Ly, Z);
			OutMesh.UVs[Idx]      = FVector2D((float)X / CellsPerEdge, (float)Y / CellsPerEdge);
		}
	}

	OutMesh.Triangles.Reserve(CellsPerEdge * CellsPerEdge * 6);
	for (int32 Y = 0; Y < CellsPerEdge; ++Y)
	{
		for (int32 X = 0; X < CellsPerEdge; ++X)
		{
			const int32 TL = (Y + 0) * VertsPerEdge + (X + 0);
			const int32 TR = (Y + 0) * VertsPerEdge + (X + 1);
			const int32 BL = (Y + 1) * VertsPerEdge + (X + 0);
			const int32 BR = (Y + 1) * VertsPerEdge + (X + 1);
			OutMesh.Triangles.Add(TL); OutMesh.Triangles.Add(BL); OutMesh.Triangles.Add(TR);
			OutMesh.Triangles.Add(TR); OutMesh.Triangles.Add(BL); OutMesh.Triangles.Add(BR);
		}
	}

	UKismetProceduralMeshLibrary::CalculateTangentsForMesh(
		OutMesh.Vertices, OutMesh.Triangles, OutMesh.UVs, OutMesh.Normals, OutMesh.Tangents);
}

void AchuckTerrainChunk::UploadMesh(const FchuckChunkMesh& MeshData)
{
	if (!Mesh) return;
	const int32 VertCount = MeshData.Vertices.Num();
	TArray<FColor> VertexColors; VertexColors.Init(FColor::White, VertCount);
	Mesh->ClearAllMeshSections();
	Mesh->CreateMeshSection(
		0,
		MeshData.Vertices, MeshData.Triangles,
		MeshData.Normals, MeshData.UVs, VertexColors, MeshData.Tangents,
		true);
	if (GroundMaterial)
	{
		Mesh->SetMaterial(0, GroundMaterial);
	}

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		Nav->UpdateComponentInNavOctree(*Mesh);
	}
}

void AchuckTerrainChunk::PositionWaterAndApplyMaterials(float ChunkSize)
{
	if (!Water) return;
	Water->SetRelativeLocation(FVector(ChunkSize * 0.5f, ChunkSize * 0.5f, WaterZ));
	Water->SetRelativeScale3D(FVector(ChunkSize / 100.f, ChunkSize / 100.f, 1.f));
	Water->SetVisibility(true);
	if (WaterMaterial)
	{
		Water->SetMaterial(0, WaterMaterial);
	}
}

void AchuckTerrainChunk::SerializeCurrentMesh(TArray<uint8>& OutBytes) const
{
	if (!bMeshBuilt) return;
	FBufferArchive Ar;
	const_cast<FchuckChunkMesh&>(CachedMesh).Serialize(Ar);
	OutBytes = MoveTemp(Ar);
}

void AchuckTerrainChunk::Build(const FIntPoint& InCoord, uint32 InSeed, int32 InCellsPerEdge, float InCellSize, float InWaterZ)
{
	const bool bSameTopology = (CellsPerEdge == InCellsPerEdge) && FMath::IsNearlyEqual(CellSize, InCellSize);
	if (bMeshBuilt && bSameTopology && Coord == InCoord && Seed == InSeed)
	{
		bActive = true;
		WaterZ  = InWaterZ;
		SetActorHiddenInGame(false);
		PositionWaterAndApplyMaterials(CellsPerEdge * CellSize);
		return;
	}

	Coord        = InCoord;
	Seed         = InSeed;
	CellsPerEdge = FMath::Max(2, InCellsPerEdge);
	CellSize     = FMath::Max(50.f, InCellSize);
	WaterZ       = InWaterZ;
	bActive      = true;

	const float ChunkSize = CellsPerEdge * CellSize;
	SetActorLocation(FVector(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f));
	SetActorHiddenInGame(false);

	CachedMesh = FchuckChunkMesh();
	GenerateMeshData(CachedMesh);
	UploadMesh(CachedMesh);
	PositionWaterAndApplyMaterials(ChunkSize);
	bMeshBuilt = true;
}

bool AchuckTerrainChunk::BuildFromBlob(const FIntPoint& InCoord, uint32 InSeed, const TArray<uint8>& Blob, float InWaterZ)
{
	if (Blob.Num() == 0) return false;

	FchuckChunkMesh MeshData;
	FMemoryReader Ar(Blob, true);
	MeshData.Serialize(Ar);
	if (!MeshData.IsValidMesh()) return false;

	Coord        = InCoord;
	Seed         = InSeed;
	CellsPerEdge = MeshData.CellsPerEdge;
	CellSize     = MeshData.CellSize;
	WaterZ       = InWaterZ;
	bActive      = true;

	const float ChunkSize = CellsPerEdge * CellSize;
	SetActorLocation(FVector(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f));
	SetActorHiddenInGame(false);

	CachedMesh = MoveTemp(MeshData);
	UploadMesh(CachedMesh);
	PositionWaterAndApplyMaterials(ChunkSize);
	bMeshBuilt = true;
	return true;
}

void AchuckTerrainChunk::Release()
{
	bActive = false;
	SetActorHiddenInGame(true);
	if (Water) Water->SetVisibility(false);
}
