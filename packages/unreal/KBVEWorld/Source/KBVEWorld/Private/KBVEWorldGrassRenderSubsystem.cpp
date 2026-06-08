#include "KBVEWorldGrassRenderSubsystem.h"

#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldGrassShader.h"
#include "KBVEWorldProceduralGrass.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstance.h"
#include "Materials/MaterialInterface.h"

bool UKBVEWorldGrassRenderSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer)) return false;
	const UWorld* W = Cast<UWorld>(Outer);
	if (!W) return false;
	return W->IsGameWorld();
}

void UKBVEWorldGrassRenderSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UKBVEWorldGrassRenderSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	constexpr int32 GrassInstanceBudgetPerTick = 20000;
	TickBuildQueue(GrassInstanceBudgetPerTick);
}

void UKBVEWorldGrassRenderSubsystem::Deinitialize()
{
	if (GlobalBladeHISM)    { GlobalBladeHISM->ClearInstances(); }
	if (GlobalImpostorHISM) { GlobalImpostorHISM->ClearInstances(); }
	if (HostActor)
	{
		HostActor->Destroy();
		HostActor = nullptr;
	}
	GlobalBladeHISM    = nullptr;
	GlobalImpostorHISM = nullptr;
	BladeMesh          = nullptr;
	ImpostorMesh       = nullptr;
	MasterMaterial     = nullptr;
	BladeOwners.Reset();
	ImpostorOwners.Reset();
	PendingBuilds.Reset();
	ActiveChunks.Reset();
	Super::Deinitialize();
}

void UKBVEWorldGrassRenderSubsystem::EnsureHost()
{
	if (HostActor && GlobalBladeHISM && GlobalImpostorHISM) return;

	UWorld* W = GetWorld();
	if (!W) return;

	if (!HostActor)
	{
		FActorSpawnParameters Params;
		Params.ObjectFlags |= RF_Transient;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		HostActor = W->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
		if (!HostActor) return;
		HostActor->SetActorHiddenInGame(false);
		HostActor->SetCanBeDamaged(false);
		HostActor->SetActorEnableCollision(false);
		HostActor->PrimaryActorTick.bCanEverTick = false;

		USceneComponent* Root = NewObject<USceneComponent>(HostActor, TEXT("Root"), RF_Transient);
		HostActor->SetRootComponent(Root);
		Root->RegisterComponent();
	}

	auto EnsureMaterialUsedWithHISM = [](UMaterialInterface* MI)
	{
		if (!MI) return;
		UMaterialInterface* Cur = MI;
		while (UMaterialInstance* Inst = Cast<UMaterialInstance>(Cur))
		{
			if (!Inst->Parent) break;
			Cur = Inst->Parent;
		}
		UMaterial* BaseMat = Cast<UMaterial>(Cur);
		UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] EnsureFlag in='%s' walked='%s' base=%s flagBefore=%d"),
			*MI->GetName(),
			Cur ? *Cur->GetName() : TEXT("<null>"),
			BaseMat ? TEXT("UMaterial") : TEXT("<not-UMaterial>"),
			BaseMat ? (BaseMat->bUsedWithInstancedStaticMeshes ? 1 : 0) : -1);
		if (BaseMat)
		{
			bool bChanged = false;
			if (!BaseMat->bUsedWithInstancedStaticMeshes) { BaseMat->bUsedWithInstancedStaticMeshes = true; bChanged = true; }
			if (bChanged)
			{
				BaseMat->PostEditChange();
				BaseMat->ForceRecompileForRendering();
				UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] Flipped usage flags + ForceRecompile on %s"), *BaseMat->GetName());
			}
		}
	};

	if (!BladeMesh)
	{
		static const TCHAR* BladePath = TEXT("/Game/PN_GrassLibrary/Meshes/grassMesh/grass_01_01_mesh.grass_01_01_mesh");
		BladeMesh = LoadObject<UStaticMesh>(nullptr, BladePath);
		if (BladeMesh)
		{
			UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] PN blade mesh loaded: %s slots=%d slot0=%s"),
				*BladeMesh->GetName(),
				BladeMesh->GetStaticMaterials().Num(),
				BladeMesh->GetStaticMaterials().Num() > 0 && BladeMesh->GetMaterial(0)
					? *BladeMesh->GetMaterial(0)->GetName() : TEXT("<null>"));
		}
		else
		{
			UE_LOG(LogTemp, Error, TEXT("[KBVEGrass] FAILED to load PN blade mesh at %s"), BladePath);
		}
	}

	if (!ImpostorMesh)
	{
		static const TCHAR* ImpostorPath = TEXT("/Game/PN_GrassLibrary/Meshes/grassMesh/grass_01_05_mesh.grass_01_05_mesh");
		ImpostorMesh = LoadObject<UStaticMesh>(nullptr, ImpostorPath);
		if (!ImpostorMesh) ImpostorMesh = BladeMesh;
	}

	if (BladeMesh    && BladeMesh->GetStaticMaterials().Num()    > 0) EnsureMaterialUsedWithHISM(BladeMesh->GetMaterial(0));
	if (ImpostorMesh && ImpostorMesh->GetStaticMaterials().Num() > 0) EnsureMaterialUsedWithHISM(ImpostorMesh->GetMaterial(0));

	if (!PNGlobalUpdaterActor && BladeMesh)
	{
		static const TCHAR* UpdaterPath = TEXT("/Game/PN_GrassLibrary/Blueprints/PN_GlobalUpdater.PN_GlobalUpdater_C");
		if (UClass* UpdaterClass = LoadClass<AActor>(nullptr, UpdaterPath))
		{
			FActorSpawnParameters Params;
			Params.ObjectFlags |= RF_Transient;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			PNGlobalUpdaterActor = W->SpawnActor<AActor>(UpdaterClass, FVector::ZeroVector, FRotator::ZeroRotator, Params);
			UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] PN_GlobalUpdater spawned=%s"), PNGlobalUpdaterActor ? *PNGlobalUpdaterActor->GetName() : TEXT("<null>"));
		}
		else
		{
			UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] PN_GlobalUpdater class not found at %s"), UpdaterPath);
		}
	}

	auto ConfigureHISM = [&](UHierarchicalInstancedStaticMeshComponent* H, UStaticMesh* M, bool bUseFallbackMaterial)
	{
		H->SetMobility(EComponentMobility::Movable);
		H->SetupAttachment(HostActor->GetRootComponent());
		H->NumCustomDataFloats              = 0;
		H->InstanceStartCullDistance        = 4000;
		H->InstanceEndCullDistance          = 8000;
		if (M) H->SetStaticMesh(M);
		if (bUseFallbackMaterial && MasterMaterial)
		{
			const int32 SlotCount = M ? M->GetStaticMaterials().Num() : 0;
			for (int32 Slot = 0; Slot < FMath::Max(SlotCount, 1); ++Slot)
			{
				H->SetMaterial(Slot, MasterMaterial);
			}
		}
		const FBoxSphereBounds Bounds = M ? M->GetBounds() : FBoxSphereBounds(ForceInit);
		UMaterialInterface* HISMMat0 = H->GetMaterial(0);
		UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] HISM '%s' mesh=%s mat0=%s fallback=%d boundsSphere=%.1f boundsBox=%s"),
			*H->GetName(),
			M ? *M->GetName() : TEXT("<null>"),
			HISMMat0 ? *HISMMat0->GetName() : TEXT("<null>"),
			bUseFallbackMaterial ? 1 : 0,
			Bounds.SphereRadius,
			*Bounds.GetBox().ToString());
		H->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		H->SetCanEverAffectNavigation(false);
		H->bDisableCollision                = true;
		H->SetCastShadow(false);
		H->bCastDynamicShadow               = false;
		H->bCastStaticShadow                = false;
		H->bCastFarShadow                   = false;
		H->bCastVolumetricTranslucentShadow = false;
		H->bCastContactShadow               = false;
		H->bAffectDistanceFieldLighting     = false;
		H->bAffectDynamicIndirectLighting   = false;
		H->bReceivesDecals                  = false;
		H->bUseAsOccluder                   = false;
		H->RegisterComponent();
	};

	const bool bBladeUsesFallback    = !BladeMesh    || BladeMesh->GetStaticMaterials().Num() == 0    || !BladeMesh->GetMaterial(0);
	const bool bImpostorUsesFallback = !ImpostorMesh || ImpostorMesh->GetStaticMaterials().Num() == 0 || !ImpostorMesh->GetMaterial(0);

	if (!GlobalBladeHISM)
	{
		GlobalBladeHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, TEXT("GlobalBladeHISM"), RF_Transient);
		ConfigureHISM(GlobalBladeHISM, BladeMesh, bBladeUsesFallback);
	}
	if (!GlobalImpostorHISM)
	{
		GlobalImpostorHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, TEXT("GlobalImpostorHISM"), RF_Transient);
		ConfigureHISM(GlobalImpostorHISM, ImpostorMesh, bImpostorUsesFallback);
	}

}

bool UKBVEWorldGrassRenderSubsystem::RegisterChunkInstances(FIntPoint ChunkCoord,
	const TArray<FTransform>& BladeTransforms,
	const TArray<FTransform>& ImpostorTransforms)
{
	EnsureHost();
	if (!GlobalBladeHISM || !GlobalImpostorHISM) return false;

	if (ActiveChunks.Contains(ChunkCoord)) return true;

	FKBVEGrassPendingBuild Build;
	Build.ChunkCoord         = ChunkCoord;
	Build.BladeTransforms    = BladeTransforms;
	Build.ImpostorTransforms = ImpostorTransforms;
	PendingBuilds.Add(MoveTemp(Build));
	ActiveChunks.Add(ChunkCoord);
	UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] Register coord=(%d,%d) blades=%d impostors=%d pending=%d"),
		ChunkCoord.X, ChunkCoord.Y, BladeTransforms.Num(), ImpostorTransforms.Num(), PendingBuilds.Num());
	return true;
}

void UKBVEWorldGrassRenderSubsystem::AppendInstancesWithOwners(UHierarchicalInstancedStaticMeshComponent* H,
	TArray<FIntPoint>& Owners,
	const FTransform* Begin,
	int32 Count,
	FIntPoint Coord)
{
	if (!H || Count <= 0) return;
	TArray<FTransform> Slice;
	Slice.Append(Begin, Count);
	H->AddInstances(Slice, false);
	Owners.Reserve(Owners.Num() + Count);
	for (int32 i = 0; i < Count; ++i) Owners.Add(Coord);
}

void UKBVEWorldGrassRenderSubsystem::TickBuildQueue(int32 InstanceBudget)
{
	if (PendingBuilds.Num() == 0) return;
	EnsureHost();
	if (!GlobalBladeHISM || !GlobalImpostorHISM) return;

	constexpr double ChunkExtent = 6400.0;
	constexpr int32  GrassRenderRadius = 1;

	FVector CamLoc = FVector::ZeroVector;
	if (UWorld* W = GetWorld())
	{
		if (APlayerController* PC = W->GetFirstPlayerController())
		{
			if (APawn* Pawn = PC->GetPawn())                 CamLoc = Pawn->GetActorLocation();
			else if (PC->PlayerCameraManager)                CamLoc = PC->PlayerCameraManager->GetCameraLocation();
		}
	}

	const FIntPoint CamChunk(
		FMath::FloorToInt(CamLoc.X / ChunkExtent),
		FMath::FloorToInt(CamLoc.Y / ChunkExtent));

	int32 Spent = 0;
	while (PendingBuilds.Num() > 0 && Spent < InstanceBudget)
	{
		int32 NearestIdx = 0;
		double NearestSq = TNumericLimits<double>::Max();
		for (int32 i = 0; i < PendingBuilds.Num(); ++i)
		{
			const FVector Center(PendingBuilds[i].ChunkCoord.X * ChunkExtent + ChunkExtent * 0.5,
				PendingBuilds[i].ChunkCoord.Y * ChunkExtent + ChunkExtent * 0.5, CamLoc.Z);
			const double DSq = FVector::DistSquared(Center, CamLoc);
			if (DSq < NearestSq) { NearestSq = DSq; NearestIdx = i; }
		}

		const FIntPoint NearestCoord = PendingBuilds[NearestIdx].ChunkCoord;
		const int32 Cheb = FMath::Max(FMath::Abs(NearestCoord.X - CamChunk.X), FMath::Abs(NearestCoord.Y - CamChunk.Y));
		if (Cheb > GrassRenderRadius) break;

		FKBVEGrassPendingBuild Build = MoveTemp(PendingBuilds[NearestIdx]);
		PendingBuilds.RemoveAt(NearestIdx);

		constexpr int32 GrassDensityStride = 4;
		if (GrassDensityStride > 1 && Build.BladeTransforms.Num() > GrassDensityStride)
		{
			TArray<FTransform> Kept;
			Kept.Reserve(Build.BladeTransforms.Num() / GrassDensityStride + 1);
			for (int32 i = 0; i < Build.BladeTransforms.Num(); i += GrassDensityStride) Kept.Add(Build.BladeTransforms[i]);
			Build.BladeTransforms = MoveTemp(Kept);
		}

		constexpr float PNScaleMul = 5.f;
		for (FTransform& T : Build.BladeTransforms)    T.MultiplyScale3D(FVector(PNScaleMul));
		for (FTransform& T : Build.ImpostorTransforms) T.MultiplyScale3D(FVector(PNScaleMul));

		if (Build.BladeTransforms.Num() > 0)
		{
			GlobalBladeHISM->AddInstances(Build.BladeTransforms, false);
			BladeOwners.Reserve(BladeOwners.Num() + Build.BladeTransforms.Num());
			for (int32 i = 0; i < Build.BladeTransforms.Num(); ++i) BladeOwners.Add(Build.ChunkCoord);
			GlobalBladeHISM->BuildTreeIfOutdated(false, true);
			GlobalBladeHISM->MarkRenderStateDirty();
		}
		if (Build.ImpostorTransforms.Num() > 0)
		{
			GlobalImpostorHISM->AddInstances(Build.ImpostorTransforms, false);
			ImpostorOwners.Reserve(ImpostorOwners.Num() + Build.ImpostorTransforms.Num());
			for (int32 i = 0; i < Build.ImpostorTransforms.Num(); ++i) ImpostorOwners.Add(Build.ChunkCoord);
			GlobalImpostorHISM->BuildTreeIfOutdated(false, true);
			GlobalImpostorHISM->MarkRenderStateDirty();
		}

		Spent += Build.BladeTransforms.Num() + Build.ImpostorTransforms.Num();

		UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] Drained chunk=(%d,%d) blades=%d pending=%d totalInst=%d firstInst=%s"),
			Build.ChunkCoord.X, Build.ChunkCoord.Y,
			Build.BladeTransforms.Num(),
			PendingBuilds.Num(),
			GlobalBladeHISM->GetInstanceCount(),
			Build.BladeTransforms.Num() > 0 ? *Build.BladeTransforms[0].GetLocation().ToString() : TEXT("none"));
	}
}

void UKBVEWorldGrassRenderSubsystem::RemoveOwnedInstances(UHierarchicalInstancedStaticMeshComponent* H,
	TArray<FIntPoint>& Owners,
	FIntPoint Coord)
{
	if (!H || Owners.Num() == 0) return;

	TArray<int32> ToRemove;
	ToRemove.Reserve(64);
	for (int32 i = 0; i < Owners.Num(); ++i)
	{
		if (Owners[i] == Coord) ToRemove.Add(i);
	}
	if (ToRemove.Num() == 0) return;

	ToRemove.Sort([](int32 A, int32 B) { return A > B; });
	H->RemoveInstances(ToRemove);

	for (int32 Idx : ToRemove)
	{
		const int32 Last = Owners.Num() - 1;
		if (Idx != Last) Owners[Idx] = Owners[Last];
		Owners.Pop(EAllowShrinking::No);
	}
}

void UKBVEWorldGrassRenderSubsystem::ReleaseChunkInstances(FIntPoint ChunkCoord)
{
	if (!ActiveChunks.Contains(ChunkCoord)) return;
	ActiveChunks.Remove(ChunkCoord);

	for (int32 i = PendingBuilds.Num() - 1; i >= 0; --i)
	{
		if (PendingBuilds[i].ChunkCoord == ChunkCoord)
		{
			PendingBuilds.RemoveAt(i);
		}
	}

	RemoveOwnedInstances(GlobalBladeHISM,    BladeOwners,    ChunkCoord);
	RemoveOwnedInstances(GlobalImpostorHISM, ImpostorOwners, ChunkCoord);
}
