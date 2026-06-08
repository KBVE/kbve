#include "KBVEWorldChunkActor.h"

#include "Async/Async.h"
#include "KBVEWorldProceduralGrass.h"
#include "KBVEWorldGrassData.h"
#include "KBVEWorldGrassMass.h"
#include "KBVEWorldGrassRenderSubsystem.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/ObjectLibrary.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "FoliageType_InstancedStaticMesh.h"
#include "KismetProceduralMeshLibrary.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Materials/Material.h"
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"
#include "NavigationSystem.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/BufferArchive.h"
#include "Serialization/MemoryReader.h"
#include "UObject/ConstructorHelpers.h"
#include "UObject/WeakObjectPtrTemplates.h"

AKBVEWorldChunkActor::AKBVEWorldChunkActor()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mesh"));
	Mesh->bUseAsyncCooking = false;
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
	if (PlaneFinder.Succeeded()) Water->SetStaticMesh(PlaneFinder.Object);

	static ConstructorHelpers::FObjectFinder<UMaterialInterface> GroundFinder(TEXT("/Engine/EngineMaterials/WorldGridMaterial.WorldGridMaterial"));
	if (GroundFinder.Succeeded()) GroundMaterial = GroundFinder.Object;
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> WaterFinder(TEXT("/Engine/EngineMaterials/EmissiveTexturedMaterial.EmissiveTexturedMaterial"));
	if (WaterFinder.Succeeded()) WaterMaterial = WaterFinder.Object;

	SetReplicates(false);
}

void AKBVEWorldChunkActor::BeginPlay()
{
	Super::BeginPlay();
}

void AKBVEWorldChunkActor::GenerateMeshData(FKBVEWorldChunkMesh& OutMesh) const
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
			const float Z  = SampleHeight(Wx, Wy, Seed);
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

	if (EdgeSkirtDepth > 0.f)
	{
		const int32 RingStart = OutMesh.Vertices.Num();
		auto AddSkirtVert = [&](float Lx, float Ly, float Z) -> int32
		{
			const int32 Idx = OutMesh.Vertices.Num();
			OutMesh.Vertices.Add(FVector(Lx, Ly, Z - EdgeSkirtDepth));
			OutMesh.Normals.Add(FVector::UpVector);
			OutMesh.UVs.Add(FVector2D(0.f, 0.f));
			OutMesh.Tangents.Add(FProcMeshTangent(1.f, 0.f, 0.f));
			return Idx;
		};

		const int32 Last = VertsPerEdge - 1;
		auto TopIdx = [&](int32 X, int32 Y) { return Y * VertsPerEdge + X; };

		for (int32 X = 0; X < Last; ++X)
		{
			const int32 T0 = TopIdx(X,     0);
			const int32 T1 = TopIdx(X + 1, 0);
			const int32 S0 = AddSkirtVert(X * CellSize, 0.f, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert((X + 1) * CellSize, 0.f, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S1); OutMesh.Triangles.Add(S0);
		}
		for (int32 X = 0; X < Last; ++X)
		{
			const int32 T0 = TopIdx(X,     Last);
			const int32 T1 = TopIdx(X + 1, Last);
			const int32 S0 = AddSkirtVert(X * CellSize, Last * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert((X + 1) * CellSize, Last * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(T1);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(S1);
		}
		for (int32 Y = 0; Y < Last; ++Y)
		{
			const int32 T0 = TopIdx(0, Y);
			const int32 T1 = TopIdx(0, Y + 1);
			const int32 S0 = AddSkirtVert(0.f, Y * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert(0.f, (Y + 1) * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(T1);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(S1);
		}
		for (int32 Y = 0; Y < Last; ++Y)
		{
			const int32 T0 = TopIdx(Last, Y);
			const int32 T1 = TopIdx(Last, Y + 1);
			const int32 S0 = AddSkirtVert(Last * CellSize, Y * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert(Last * CellSize, (Y + 1) * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S1); OutMesh.Triangles.Add(S0);
		}
	}

	UKismetProceduralMeshLibrary::CalculateTangentsForMesh(
		OutMesh.Vertices, OutMesh.Triangles, OutMesh.UVs, OutMesh.Normals, OutMesh.Tangents);
}

void AKBVEWorldChunkActor::UploadMesh(const FKBVEWorldChunkMesh& MeshData)
{
	if (!Mesh) return;
	const int32 VertCount = MeshData.Vertices.Num();
	TArray<FColor> VertexColors; VertexColors.Init(FColor::White, VertCount);
	Mesh->ClearAllMeshSections();
	Mesh->CreateMeshSection(0, MeshData.Vertices, MeshData.Triangles, MeshData.Normals, MeshData.UVs, VertexColors, MeshData.Tangents, true);

	UMaterialInterface* Apply = GroundMaterialOverride ? GroundMaterialOverride : GroundMaterial;
	if (Apply) Mesh->SetMaterial(0, Apply);

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		Nav->UpdateComponentInNavOctree(*Mesh);
	}
}

void AKBVEWorldChunkActor::PositionWaterAndApplyMaterials(float ChunkSize)
{
	if (!Water) return;
	Water->SetRelativeLocation(FVector(ChunkSize * 0.5f, ChunkSize * 0.5f, WaterZ));
	Water->SetRelativeScale3D(FVector(ChunkSize / 100.f, ChunkSize / 100.f, 1.f));
	Water->SetVisibility(true);
	if (WaterMaterial) Water->SetMaterial(0, WaterMaterial);
}

void AKBVEWorldChunkActor::SerializeCurrentMesh(TArray<uint8>& OutBytes) const
{
	if (!bMeshBuilt) return;
	FBufferArchive Ar;
	const_cast<FKBVEWorldChunkMesh&>(CachedMesh).Serialize(Ar);
	OutBytes = MoveTemp(Ar);
}

void AKBVEWorldChunkActor::Build(const FIntPoint& InCoord, uint32 InSeed, int32 InCellsPerEdge, float InCellSize, float InWaterZ)
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
	ChunkVariantIndices.Reset();

	const float ChunkSize = CellsPerEdge * CellSize;
	SetActorLocation(FVector(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f));
	SetActorHiddenInGame(false);

	CachedMesh = FKBVEWorldChunkMesh();
	GenerateMeshData(CachedMesh);
	UploadMesh(CachedMesh);
	PositionWaterAndApplyMaterials(ChunkSize);
	PopulateFoliage();
	bMeshBuilt = true;

	if (UWorld* W = GetWorld())
	{
		if (UMassEntitySubsystem* Sub = W->GetSubsystem<UMassEntitySubsystem>())
		{
			FMassEntityManager& EM = Sub->GetMutableEntityManager();
			if (!ChunkClusterEntity.IsValid())
			{
				FKBVEGrassClusterFragment Frag;
				const uint32 BiomeId = GrassBucket.BiomeId;
				Frag.ClusterHash    = FKBVEWorldGrassHash::MakeClusterKey(Coord.X, Coord.Y, 0, 0, BiomeId);
				Frag.VisualKey      = FKBVEWorldGrassHash::MakeVisualKey(0, 0, BiomeId, 0, 0);
				Frag.Origin         = FVector3f(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f);
				Frag.Radius         = ChunkSize * 0.5f;
				Frag.WindPhase      = FKBVEWorldGrassHash::MakeBladePhase(Frag.ClusterHash, 0);
				Frag.TypeId         = 0;
				Frag.GroupId        = 0;
				Frag.ColorPaletteId = 0;
				Frag.DensityTier    = 0;
				Frag.WindZoneId     = 0;
				Frag.LODTier        = (uint8)EKBVEGrassLODTier::LOD0_RealBlade;

				ChunkClusterEntity = EM.ReserveEntity();
				FMassArchetypeHandle Archetype = EM.CreateArchetype({
					FKBVEGrassClusterFragment::StaticStruct(),
					FKBVEGrassClusterHISMRefs::StaticStruct(),
					FKBVEGrassClusterTag::StaticStruct(),
				});
				EM.BuildEntity(ChunkClusterEntity, Archetype);
				if (FKBVEGrassClusterFragment* Slot = EM.GetFragmentDataPtr<FKBVEGrassClusterFragment>(ChunkClusterEntity))
				{
					*Slot = Frag;
				}
				RefreshChunkClusterHISMRefs();
			}
		}
	}
}

bool AKBVEWorldChunkActor::BuildFromBlob(const FIntPoint& InCoord, uint32 InSeed, const TArray<uint8>& Blob, float InWaterZ)
{
	if (Blob.Num() == 0) return false;

	FKBVEWorldChunkMesh MeshData;
	FMemoryReader Ar(Blob, true);
	MeshData.Serialize(Ar);
	if (!MeshData.IsValidMesh()) return false;

	Coord        = InCoord;
	Seed         = InSeed;
	CellsPerEdge = MeshData.CellsPerEdge;
	CellSize     = MeshData.CellSize;
	WaterZ       = InWaterZ;
	bActive      = true;
	ChunkVariantIndices.Reset();

	const float ChunkSize = CellsPerEdge * CellSize;
	SetActorLocation(FVector(Coord.X * ChunkSize, Coord.Y * ChunkSize, 0.f));
	SetActorHiddenInGame(false);

	CachedMesh = MoveTemp(MeshData);
	UploadMesh(CachedMesh);
	PositionWaterAndApplyMaterials(ChunkSize);
	PopulateFoliage();
	bMeshBuilt = true;
	return true;
}

void AKBVEWorldChunkActor::SetImpostorVisible(bool bVisible)
{
	bImpostorVisibleCached = bVisible;
}

void AKBVEWorldChunkActor::RefreshChunkClusterHISMRefs()
{
	if (!ChunkClusterEntity.IsValid()) return;
	UWorld* W = GetWorld();
	if (!W) return;
	UMassEntitySubsystem* Sub = W->GetSubsystem<UMassEntitySubsystem>();
	if (!Sub) return;
	FMassEntityManager& EM = Sub->GetMutableEntityManager();
	FKBVEGrassClusterHISMRefs* Refs = EM.GetFragmentDataPtr<FKBVEGrassClusterHISMRefs>(ChunkClusterEntity);
	if (!Refs) return;

	UKBVEWorldGrassRenderSubsystem* Render = W->GetSubsystem<UKBVEWorldGrassRenderSubsystem>();
	Refs->BladeHISM      = Render ? Render->GetBladeHISM()    : nullptr;
	Refs->ImpostorHISM   = Render ? Render->GetImpostorHISM() : nullptr;
	Refs->GroundTintHISM = nullptr;
	Refs->BladeInstanceFirst    = -1;
	Refs->BladeInstanceCount    = 0;
	Refs->ImpostorInstanceFirst = -1;
	Refs->ImpostorInstanceCount = 0;
	Refs->TintInstanceFirst     = -1;
	Refs->TintInstanceCount     = 0;
}

void AKBVEWorldChunkActor::Release()
{
	bActive = false;
	bImpostorVisibleCached = false;
	SetActorHiddenInGame(true);
	if (Water) Water->SetVisibility(false);
	ClearFoliage();

	if (ChunkClusterEntity.IsValid())
	{
		if (UWorld* W = GetWorld())
		{
			if (UMassEntitySubsystem* Sub = W->GetSubsystem<UMassEntitySubsystem>())
			{
				FMassEntityManager& EM = Sub->GetMutableEntityManager();
				EM.DestroyEntity(ChunkClusterEntity);
			}
		}
		ChunkClusterEntity.Reset();
	}
}

static bool KBVEWorld_NameMatchesFilters(const FString& NameLower, const TArray<FString>& Includes, const TArray<FString>& Excludes)
{
	for (const FString& Ex : Excludes)
	{
		if (!Ex.IsEmpty() && NameLower.Contains(Ex.ToLower())) return false;
	}
	if (Includes.Num() > 0)
	{
		for (const FString& In : Includes)
		{
			if (!In.IsEmpty() && NameLower.Contains(In.ToLower())) return true;
		}
		return false;
	}
	return true;
}

void AKBVEWorldChunkActor::LoadBucket(const FKBVEWorldFoliageBucketConfig& Cfg)
{
	const int32 Cap = FMath::Max(1, Cfg.MaxVariants);
	int32 Added = 0;

	if (Cfg.bUseProceduralGrass)
	{
		UMaterialInterface* Mat = Cfg.ProceduralMaterial.IsValid()
			? Cfg.ProceduralMaterial.Get()
			: Cfg.ProceduralMaterial.LoadSynchronous();
		TArray<UStaticMesh*> Built;
		TArray<UStaticMesh*> BuiltImp;
		TArray<UStaticMesh*> BuiltTint;
		FKBVEWorldProceduralGrass::PopulateProceduralBucket(
			this, Mat,
			FMath::Min(Cfg.ProceduralVariantCount, Cap),
			Cfg.ProceduralWidthMin,  Cfg.ProceduralWidthMax,
			Cfg.ProceduralHeightMin, Cfg.ProceduralHeightMax,
			Built, &BuiltImp, &BuiltTint);
		for (int32 i = 0; i < Built.Num(); ++i)
		{
			if (Added >= Cap || !Built[i]) break;
			UFoliageType_InstancedStaticMesh* RuntimeFT = NewObject<UFoliageType_InstancedStaticMesh>(this);
			RuntimeFT->SetStaticMesh(Built[i]);
			FKBVEWorldFoliageMeta M;
			M.Tier = Cfg.Tier;
			FoliageTypes.Add(RuntimeFT);
			FoliageMeshes.Add(Built[i]);
			FoliageImpostorMeshes.Add(BuiltImp.IsValidIndex(i) ? BuiltImp[i] : nullptr);
			FoliageGroundTintMeshes.Add(BuiltTint.IsValidIndex(i) ? BuiltTint[i] : nullptr);
			FoliageMetas.Add(M);
			++Added;
		}
		UE_LOG(LogTemp, Display, TEXT("[KBVEWorld] Chunk bucket %s procedural built %d variants"),
			Cfg.Tier == EKBVEWorldFoliageTier::Grass ? TEXT("Grass") : TEXT("Foliage"), Added);
		return;
	}

	if (Cfg.SourcePath.IsEmpty()) return;

	{
		UObjectLibrary* Lib = UObjectLibrary::CreateLibrary(UFoliageType_InstancedStaticMesh::StaticClass(), false, GIsEditor);
		if (Lib)
		{
			Lib->AddToRoot();
			Lib->bRecursivePaths = true;
			Lib->LoadAssetDataFromPath(Cfg.SourcePath);
			Lib->LoadAssetsFromAssetData();

			TArray<UObject*> Loaded;
			Lib->GetObjects<UObject>(Loaded);
			Loaded.Sort([](const UObject& A, const UObject& B){ return A.GetName() < B.GetName(); });
			for (UObject* Obj : Loaded)
			{
				if (Added >= Cap) break;
				UFoliageType_InstancedStaticMesh* FT = Cast<UFoliageType_InstancedStaticMesh>(Obj);
				if (!FT || !FT->GetStaticMesh()) continue;
				if (!KBVEWorld_NameMatchesFilters(Obj->GetName().ToLower(), Cfg.NameIncludes, Cfg.NameExcludes)) continue;

				FKBVEWorldFoliageMeta M;
				M.ScaleX    = FT->ScaleX;
				M.ScaleY    = FT->ScaleY;
				M.ScaleZ    = FT->ScaleZ;
				M.ZOffset   = FT->ZOffset;
				M.RandomYaw = FT->RandomYaw;
				M.Tier      = Cfg.Tier;
				FoliageTypes.Add(FT);
				FoliageMeshes.Add(FT->GetStaticMesh());
				FoliageMetas.Add(M);
				++Added;
			}
			Lib->RemoveFromRoot();
		}
	}

	if (Added == 0)
	{
		UObjectLibrary* Lib = UObjectLibrary::CreateLibrary(UStaticMesh::StaticClass(), false, GIsEditor);
		if (Lib)
		{
			Lib->AddToRoot();
			Lib->bRecursivePaths = true;
			Lib->LoadAssetDataFromPath(Cfg.SourcePath);
			Lib->LoadAssetsFromAssetData();

			TArray<UObject*> Loaded;
			Lib->GetObjects<UObject>(Loaded);
			Loaded.Sort([](const UObject& A, const UObject& B){ return A.GetName() < B.GetName(); });
			for (UObject* Obj : Loaded)
			{
				if (Added >= Cap) break;
				UStaticMesh* SM = Cast<UStaticMesh>(Obj);
				if (!SM) continue;
				if (!KBVEWorld_NameMatchesFilters(Obj->GetName().ToLower(), Cfg.NameIncludes, Cfg.NameExcludes)) continue;

				UFoliageType_InstancedStaticMesh* RuntimeFT = NewObject<UFoliageType_InstancedStaticMesh>(this);
				RuntimeFT->SetStaticMesh(SM);

				FKBVEWorldFoliageMeta M;
				M.Tier = Cfg.Tier;
				FoliageTypes.Add(RuntimeFT);
				FoliageMeshes.Add(SM);
				FoliageMetas.Add(M);
				++Added;
			}
			Lib->RemoveFromRoot();
		}
	}

	UE_LOG(LogTemp, Display, TEXT("[KBVEWorld] Chunk bucket %s loaded %d variants from %s"),
		Cfg.Tier == EKBVEWorldFoliageTier::Grass ? TEXT("Grass") : TEXT("Foliage"), Added, *Cfg.SourcePath);
}

void AKBVEWorldChunkActor::EnsureFoliageTypesLoaded()
{
	if (FoliageMeshes.Num() > 0) return;
	LoadBucket(GrassBucket);
	LoadBucket(FoliageBucket);
}

void AKBVEWorldChunkActor::EnsureHISMComponents()
{
	EnsureFoliageTypesLoaded();
	if (FoliageMeshes.Num() == 0) return;

	if (ChunkVariantIndices.Num() == 0)
	{
		const int32 Want = FMath::Min(PerChunkVariants, FoliageMeshes.Num());
		const uint32 H = HashCombine(HashCombine(GetTypeHash(Coord), Seed), 0xDEADBEEFu);
		FRandomStream PickRng(static_cast<int32>(H));
		TArray<int32> Pool;
		Pool.Reserve(FoliageMeshes.Num());
		for (int32 i = 0; i < FoliageMeshes.Num(); ++i) Pool.Add(i);
		for (int32 i = 0; i < Want; ++i)
		{
			const int32 SwapIdx = PickRng.RandRange(i, Pool.Num() - 1);
			Pool.Swap(i, SwapIdx);
		}
		ChunkVariantIndices.Reserve(Want);
		for (int32 i = 0; i < Want; ++i) ChunkVariantIndices.Add(Pool[i]);
	}
}

void AKBVEWorldChunkActor::ClearFoliage()
{
	if (UWorld* W = GetWorld())
	{
		if (UKBVEWorldGrassRenderSubsystem* Render = W->GetSubsystem<UKBVEWorldGrassRenderSubsystem>())
		{
			Render->ReleaseChunkInstances(Coord);
		}
	}
}

void AKBVEWorldChunkActor::PopulateFoliage()
{
	EnsureHISMComponents();
	if (FoliageMeshes.Num() == 0) return;

	const int32 LocalToken = ++PopulateToken;

	TArray<FKBVEWorldFoliageMeta> Meta;
	Meta.Reserve(ChunkVariantIndices.Num());
	for (int32 LocalSlot = 0; LocalSlot < ChunkVariantIndices.Num(); ++LocalSlot)
	{
		const int32 TypeIdx = ChunkVariantIndices[LocalSlot];
		Meta.Add(FoliageMetas.IsValidIndex(TypeIdx) ? FoliageMetas[TypeIdx] : FKBVEWorldFoliageMeta());
	}

	const FIntPoint LocalCoord = Coord;
	const uint32    LocalSeed  = Seed;
	const int32     LocalCells = CellsPerEdge;
	const float     LocalCSize = CellSize;
	const float     LocalWaterZ = WaterZ;
	const int32     LocalBlockSize = FMath::Max(1, BlockSize);
	const float     LocalGrassScale   = GrassBucket.ScaleMultiplier;
	const float     LocalFoliageScale = FoliageBucket.ScaleMultiplier;
	const float     LocalGrassDensity = GrassBucket.DensityScale;
	const float     LocalFoliageDensity = FoliageBucket.DensityScale;
	const float     LocalSlopeMax = MaxSlope;

	TArray<uint8>   LocalIsGrass;
	LocalIsGrass.SetNum(ChunkVariantIndices.Num());
	for (int32 s = 0; s < ChunkVariantIndices.Num(); ++s)
	{
		const int32 idx = ChunkVariantIndices[s];
		LocalIsGrass[s] = (FoliageMetas.IsValidIndex(idx) && FoliageMetas[idx].Tier == EKBVEWorldFoliageTier::Grass) ? 1 : 0;
	}

	const int32 LocalPerBlock = FMath::Clamp(FMath::RoundToInt(InstancesPerBlock * FMath::Max(LocalGrassDensity, LocalFoliageDensity)), 0, 4096);
	const float LocalGrassSink   = GrassBucket.SinkDepth;
	const float LocalFoliageSink = FoliageBucket.SinkDepth;
	const uint8 LocalGrassBiome  = GrassBucket.BiomeId;
	const uint8 LocalFoliageBiome= FoliageBucket.BiomeId;
	const int32 LocalCustomFloats= FMath::Max(GrassBucket.NumCustomDataFloats, FoliageBucket.NumCustomDataFloats);
	const TArray<int32> LocalVariantIdx = ChunkVariantIndices;
	TWeakObjectPtr<AKBVEWorldChunkActor> WeakSelf(this);

	struct FNoiseSample
	{
		TWeakObjectPtr<const AKBVEWorldChunkActor> Self;
		uint32 Seed;
		float operator()(float Wx, float Wy) const
		{
			if (const AKBVEWorldChunkActor* S = Self.Get()) return S->SampleHeight(Wx, Wy, Seed);
			return 0.f;
		}
	};
	FNoiseSample Noise{TWeakObjectPtr<const AKBVEWorldChunkActor>(this), LocalSeed};

	Async(EAsyncExecution::ThreadPool,
		[WeakSelf, LocalToken, LocalCoord, LocalSeed, LocalCells, LocalCSize, LocalWaterZ,
		 LocalBlockSize, LocalPerBlock, LocalSlopeMax, LocalGrassScale, LocalFoliageScale,
		 LocalGrassDensity, LocalFoliageDensity, LocalGrassSink, LocalFoliageSink,
		 LocalGrassBiome, LocalFoliageBiome, LocalCustomFloats, Noise,
		 LocalIsGrass = MoveTemp(LocalIsGrass), LocalVariantIdx, Meta = MoveTemp(Meta)]() mutable
	{
		const float ChunkSize = LocalCells * LocalCSize;
		const FVector ChunkOrigin(LocalCoord.X * ChunkSize, LocalCoord.Y * ChunkSize, 0.f);
		const uint32 CellHash = HashCombine(HashCombine(GetTypeHash(LocalCoord), LocalSeed), 0x9E3779B9u);
		FRandomStream Rng(static_cast<int32>(CellHash));

		const int32 BlocksPerEdge = FMath::Max(1, LocalCells / LocalBlockSize);
		const float BlockExtent   = LocalBlockSize * LocalCSize;

		TArray<TArray<FTransform>> Batches;
		TArray<TArray<float>>      CustomBatches;
		Batches.SetNum(LocalVariantIdx.Num());
		CustomBatches.SetNum(LocalVariantIdx.Num());
		for (TArray<FTransform>& B : Batches) B.Reserve(1024);
		for (TArray<float>& C : CustomBatches) C.Reserve(1024 * FMath::Max(LocalCustomFloats, 1));

		for (int32 By = 0; By < BlocksPerEdge; ++By)
		{
			const float By0 = By * BlockExtent;
			const float By1 = By0 + BlockExtent;
			for (int32 Bx = 0; Bx < BlocksPerEdge; ++Bx)
			{
				const float Bx0 = Bx * BlockExtent;
				const float Bx1 = Bx0 + BlockExtent;

				const int32 NumClusters = 1 + Rng.RandRange(0, 2);
				TArray<FVector2D, TInlineAllocator<4>> ClusterCenters;
				for (int32 c = 0; c < NumClusters; ++c)
				{
					ClusterCenters.Emplace(Rng.FRandRange(Bx0, Bx1), Rng.FRandRange(By0, By1));
				}
				const float ClusterRadius = BlockExtent * 0.18f;

				for (int32 i = 0; i < LocalPerBlock; ++i)
				{
					const int32 LocalSlot = Rng.RandRange(0, LocalVariantIdx.Num() - 1);
					const bool bIsGrassSlot = LocalIsGrass.IsValidIndex(LocalSlot) && LocalIsGrass[LocalSlot] != 0;
					const float BucketDensity = bIsGrassSlot ? LocalGrassDensity : LocalFoliageDensity;
					if (Rng.FRand() > BucketDensity) continue;
					const FKBVEWorldFoliageMeta& M = Meta[LocalSlot];

					const FVector2D& Center = ClusterCenters[Rng.RandRange(0, ClusterCenters.Num() - 1)];
					const float Theta = Rng.FRand() * 6.2831853f;
					const float R     = ClusterRadius * FMath::Sqrt(Rng.FRand());
					const float Lx = FMath::Clamp(Center.X + FMath::Cos(Theta) * R, Bx0, Bx1);
					const float Ly = FMath::Clamp(Center.Y + FMath::Sin(Theta) * R, By0, By1);
					const float Wx = ChunkOrigin.X + Lx;
					const float Wy = ChunkOrigin.Y + Ly;

					const int32 CellX = FMath::FloorToInt(Lx / LocalCSize);
					const int32 CellY = FMath::FloorToInt(Ly / LocalCSize);
					const float Fx    = (Lx - CellX * LocalCSize) / LocalCSize;
					const float Fy    = (Ly - CellY * LocalCSize) / LocalCSize;
					const float Wx0 = ChunkOrigin.X + CellX * LocalCSize;
					const float Wy0 = ChunkOrigin.Y + CellY * LocalCSize;
					const float Wx1 = Wx0 + LocalCSize;
					const float Wy1 = Wy0 + LocalCSize;
					const float Z00 = Noise(Wx0, Wy0);
					const float Z10 = Noise(Wx1, Wy0);
					const float Z01 = Noise(Wx0, Wy1);
					const float Z11 = Noise(Wx1, Wy1);
					const float Zlerp0 = FMath::Lerp(Z00, Z10, Fx);
					const float Zlerp1 = FMath::Lerp(Z01, Z11, Fx);
					const float Z      = FMath::Lerp(Zlerp0, Zlerp1, Fy);
					if (Z <= LocalWaterZ + 50.f) continue;

					const FVector Tx(LocalCSize, 0.f, Z10 - Z00);
					const FVector Ty(0.f, LocalCSize, Z01 - Z00);
					const FVector N = FVector::CrossProduct(Tx, Ty).GetSafeNormal();
					const float Slope = 1.f - FMath::Abs(N.Z);
					if (Slope > LocalSlopeMax) continue;

					const float SlotMul = bIsGrassSlot ? LocalGrassScale : LocalFoliageScale;
					const float ScaleX = Rng.FRandRange(M.ScaleX.Min > 0.f ? M.ScaleX.Min : 0.8f, M.ScaleX.Max > 0.f ? M.ScaleX.Max : 1.2f) * SlotMul;
					const float ScaleY = Rng.FRandRange(M.ScaleY.Min > 0.f ? M.ScaleY.Min : 0.8f, M.ScaleY.Max > 0.f ? M.ScaleY.Max : 1.2f) * SlotMul;
					const float ScaleZ = Rng.FRandRange(M.ScaleZ.Min > 0.f ? M.ScaleZ.Min : 0.8f, M.ScaleZ.Max > 0.f ? M.ScaleZ.Max : 1.2f) * SlotMul;

					const FRotator Rot(0.f, M.RandomYaw ? Rng.FRandRange(0.f, 360.f) : 0.f, 0.f);
					const float Sink = bIsGrassSlot ? LocalGrassSink : LocalFoliageSink;
					const FVector  Pos(Lx, Ly, Z + M.ZOffset.Min - Sink);
					const FVector  Scl(ScaleX, ScaleY, ScaleZ);
					Batches[LocalSlot].Emplace(Rot, Pos, Scl);

					if (LocalCustomFloats > 0)
					{
						TArray<float>& C = CustomBatches[LocalSlot];
						const float Rand01    = Rng.FRand();
						const float ScaleVar  = (ScaleX + ScaleY + ScaleZ) * 0.333333f;
						const float WindPhase = Rng.FRand() * 6.2831853f;
						const float BiomeF    = static_cast<float>(bIsGrassSlot ? LocalGrassBiome : LocalFoliageBiome);
						if (LocalCustomFloats > 0) C.Add(Rand01);
						if (LocalCustomFloats > 1) C.Add(ScaleVar);
						if (LocalCustomFloats > 2) C.Add(WindPhase);
						if (LocalCustomFloats > 3) C.Add(BiomeF);
						for (int32 ex = 4; ex < LocalCustomFloats; ++ex) C.Add(0.f);
					}
				}
			}
		}

		AsyncTask(ENamedThreads::GameThread,
			[WeakSelf, LocalToken, LocalCoord, LocalCells, LocalCSize, Batches = MoveTemp(Batches)]() mutable
		{
			AKBVEWorldChunkActor* Self = WeakSelf.Get();
			if (!Self) return;
			if (Self->PopulateToken != LocalToken) return;
			if (Self->Coord != LocalCoord)         return;
			if (!Self->bActive)                    return;

			const float ChunkSize = LocalCells * LocalCSize;
			const FVector ChunkOrigin(LocalCoord.X * ChunkSize, LocalCoord.Y * ChunkSize, 0.f);

			TArray<FTransform> Flattened;
			int32 Total = 0;
			for (const TArray<FTransform>& B : Batches) Total += B.Num();
			Flattened.Reserve(Total);
			for (TArray<FTransform>& B : Batches)
			{
				for (FTransform& T : B)
				{
					T.AddToTranslation(ChunkOrigin);
				}
				Flattened.Append(MoveTemp(B));
			}

			UWorld* W = Self->GetWorld();
			if (!W) return;
			UKBVEWorldGrassRenderSubsystem* Render = W->GetSubsystem<UKBVEWorldGrassRenderSubsystem>();
			if (!Render) return;
			TArray<FTransform> EmptyImpostor;
			Render->RegisterChunkInstances(LocalCoord, Flattened, EmptyImpostor);

			UE_LOG(LogTemp, Verbose,
				TEXT("[KBVEWorld] Chunk foliage(async) coord=(%d,%d) instances=%d"),
				LocalCoord.X, LocalCoord.Y, Flattened.Num());
		});
	});
}
