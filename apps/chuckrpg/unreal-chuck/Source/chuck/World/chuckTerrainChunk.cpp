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

void AchuckTerrainChunk::Build(const FIntPoint& InCoord, uint32 InSeed, int32 InCellsPerEdge, float InCellSize, float InWaterZ)
{
	Coord        = InCoord;
	Seed         = InSeed;
	CellsPerEdge = FMath::Max(2, InCellsPerEdge);
	CellSize     = FMath::Max(50.f, InCellSize);
	WaterZ       = InWaterZ;
	bActive      = true;

	const float ChunkSize = CellsPerEdge * CellSize;
	const FVector ChunkOrigin(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f);
	SetActorLocation(ChunkOrigin);
	SetActorHiddenInGame(false);

	const int32 VertsPerEdge = CellsPerEdge + 1;
	const int32 VertCount    = VertsPerEdge * VertsPerEdge;
	TArray<FVector>   Vertices;     Vertices.SetNumUninitialized(VertCount);
	TArray<FVector>   Normals;      Normals.Init(FVector::UpVector, VertCount);
	TArray<FVector2D> UVs;          UVs.SetNumUninitialized(VertCount);
	TArray<FColor>    VertexColors; VertexColors.Init(FColor::White, VertCount);
	TArray<FProcMeshTangent> Tangents; Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), VertCount);

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
			Vertices[Idx] = FVector(Lx, Ly, Z);
			UVs[Idx]      = FVector2D((float)X / CellsPerEdge, (float)Y / CellsPerEdge);
		}
	}

	TArray<int32> Triangles;
	Triangles.Reserve(CellsPerEdge * CellsPerEdge * 6);
	for (int32 Y = 0; Y < CellsPerEdge; ++Y)
	{
		for (int32 X = 0; X < CellsPerEdge; ++X)
		{
			const int32 TL = (Y + 0) * VertsPerEdge + (X + 0);
			const int32 TR = (Y + 0) * VertsPerEdge + (X + 1);
			const int32 BL = (Y + 1) * VertsPerEdge + (X + 0);
			const int32 BR = (Y + 1) * VertsPerEdge + (X + 1);
			Triangles.Add(TL); Triangles.Add(BL); Triangles.Add(TR);
			Triangles.Add(TR); Triangles.Add(BL); Triangles.Add(BR);
		}
	}

	UKismetProceduralMeshLibrary::CalculateTangentsForMesh(Vertices, Triangles, UVs, Normals, Tangents);

	Mesh->ClearAllMeshSections();
	Mesh->CreateMeshSection(0, Vertices, Triangles, Normals, UVs, VertexColors, Tangents, true);
	if (GroundMaterial)
	{
		Mesh->SetMaterial(0, GroundMaterial);
	}

	if (Water)
	{
		Water->SetRelativeLocation(FVector(ChunkSize * 0.5f, ChunkSize * 0.5f, WaterZ));
		Water->SetRelativeScale3D(FVector(ChunkSize / 100.f, ChunkSize / 100.f, 1.f));
		Water->SetVisibility(true);
		if (WaterMaterial)
		{
			Water->SetMaterial(0, WaterMaterial);
		}
	}

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		Nav->UpdateComponentInNavOctree(*Mesh);
	}
}

void AchuckTerrainChunk::Release()
{
	bActive = false;
	SetActorHiddenInGame(true);
	if (Mesh) Mesh->ClearAllMeshSections();
	if (Water) Water->SetVisibility(false);
}
