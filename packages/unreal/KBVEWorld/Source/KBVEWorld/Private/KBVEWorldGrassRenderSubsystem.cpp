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

namespace KBVEGrassCfg
{
	constexpr double ChunkExtent      = 6400.0;
	constexpr int32  ViewRadius       = 2;
	constexpr int32  EvictRadius      = ViewRadius + 1;
	constexpr float  PNScaleMul       = 5.f;
	constexpr int32  BladeStride      = 4;
	constexpr int32  ImpostorStride   = 16;
	constexpr int32  BudgetPerTick    = 20000;
	constexpr int32  MaxAdmitsPerTick = 1;

	constexpr float  ViewDist         = float(ViewRadius * ChunkExtent);
	constexpr float  BladeCullStart   = ViewDist * 0.35f;
	constexpr float  BladeCullEnd     = ViewDist * 0.55f;
	constexpr float  ImpostorCullStart= ViewDist * 0.45f;
	constexpr float  ImpostorCullEnd  = ViewDist;
}

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
	TickBuildQueue(KBVEGrassCfg::BudgetPerTick);
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
	RegisteredChunks.Reset();
	ResidentChunks.Reset();
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

	auto ConfigureHISM = [&](UHierarchicalInstancedStaticMeshComponent* H, UStaticMesh* M, bool bUseFallbackMaterial, int32 CullStart, int32 CullEnd)
	{
		H->SetMobility(EComponentMobility::Movable);
		H->SetupAttachment(HostActor->GetRootComponent());
		H->NumCustomDataFloats              = 0;
		H->InstanceStartCullDistance        = CullStart;
		H->InstanceEndCullDistance          = CullEnd;
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
		ConfigureHISM(GlobalBladeHISM, BladeMesh, bBladeUsesFallback,
			(int32)KBVEGrassCfg::BladeCullStart, (int32)KBVEGrassCfg::BladeCullEnd);
	}
	if (!GlobalImpostorHISM)
	{
		GlobalImpostorHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, TEXT("GlobalImpostorHISM"), RF_Transient);
		ConfigureHISM(GlobalImpostorHISM, ImpostorMesh, bImpostorUsesFallback,
			(int32)KBVEGrassCfg::ImpostorCullStart, (int32)KBVEGrassCfg::ImpostorCullEnd);
	}

}

bool UKBVEWorldGrassRenderSubsystem::RegisterChunkInstances(FIntPoint ChunkCoord,
	const TArray<FTransform>& BladeTransforms,
	const TArray<FTransform>& ImpostorTransforms)
{
	EnsureHost();
	if (!GlobalBladeHISM || !GlobalImpostorHISM) return false;

	FKBVEGrassPendingBuild Build;
	Build.ChunkCoord         = ChunkCoord;
	Build.BladeTransforms    = BladeTransforms;
	Build.ImpostorTransforms = ImpostorTransforms;
	RegisteredChunks.Add(ChunkCoord, MoveTemp(Build));
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

void UKBVEWorldGrassRenderSubsystem::AddChunkToHISM(const FKBVEGrassPendingBuild& Source)
{
	using namespace KBVEGrassCfg;

	auto Subsample = [](const TArray<FTransform>& In, int32 Stride)
	{
		TArray<FTransform> Out;
		if (Stride > 1 && In.Num() > Stride)
		{
			Out.Reserve(In.Num() / Stride + 1);
			for (int32 i = 0; i < In.Num(); i += Stride) Out.Add(In[i]);
		}
		else
		{
			Out = In;
		}
		for (FTransform& T : Out) T.MultiplyScale3D(FVector(PNScaleMul));
		return Out;
	};

	TArray<FTransform> Blades    = Subsample(Source.BladeTransforms, BladeStride);
	TArray<FTransform> Impostors = Source.ImpostorTransforms.Num() > 0
		? Subsample(Source.ImpostorTransforms, BladeStride)
		: Subsample(Source.BladeTransforms, ImpostorStride);

	if (Blades.Num() > 0)
	{
		GlobalBladeHISM->AddInstances(Blades, false);
		BladeOwners.Reserve(BladeOwners.Num() + Blades.Num());
		for (int32 i = 0; i < Blades.Num(); ++i) BladeOwners.Add(Source.ChunkCoord);
	}
	if (Impostors.Num() > 0)
	{
		GlobalImpostorHISM->AddInstances(Impostors, false);
		ImpostorOwners.Reserve(ImpostorOwners.Num() + Impostors.Num());
		for (int32 i = 0; i < Impostors.Num(); ++i) ImpostorOwners.Add(Source.ChunkCoord);
	}
}

void UKBVEWorldGrassRenderSubsystem::TickBuildQueue(int32 InstanceBudget)
{
	if (RegisteredChunks.Num() == 0 && ResidentChunks.Num() == 0) return;
	EnsureHost();
	if (!GlobalBladeHISM || !GlobalImpostorHISM) return;

	using namespace KBVEGrassCfg;

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

	auto Cheb = [&CamChunk](FIntPoint C)
	{
		return FMath::Max(FMath::Abs(C.X - CamChunk.X), FMath::Abs(C.Y - CamChunk.Y));
	};

	bool bChanged = false;

	int32 Evicted = 0;
	for (auto It = ResidentChunks.CreateIterator(); It && Evicted < MaxAdmitsPerTick; ++It)
	{
		if (Cheb(*It) > EvictRadius)
		{
			RemoveOwnedInstances(GlobalBladeHISM,    BladeOwners,    *It);
			RemoveOwnedInstances(GlobalImpostorHISM, ImpostorOwners, *It);
			It.RemoveCurrent();
			bChanged = true;
			++Evicted;
		}
	}

	int32 Spent = 0;
	int32 Admitted = 0;
	while (Spent < InstanceBudget && Admitted < MaxAdmitsPerTick)
	{
		FIntPoint BestCoord;
		double BestSq = TNumericLimits<double>::Max();
		bool bFound = false;
		for (const TPair<FIntPoint, FKBVEGrassPendingBuild>& Pair : RegisteredChunks)
		{
			if (ResidentChunks.Contains(Pair.Key)) continue;
			if (Cheb(Pair.Key) > ViewRadius) continue;
			const FVector Center(Pair.Key.X * ChunkExtent + ChunkExtent * 0.5,
				Pair.Key.Y * ChunkExtent + ChunkExtent * 0.5, CamLoc.Z);
			const double DSq = FVector::DistSquared(Center, CamLoc);
			if (DSq < BestSq) { BestSq = DSq; BestCoord = Pair.Key; bFound = true; }
		}
		if (!bFound) break;

		const FKBVEGrassPendingBuild& Build = RegisteredChunks[BestCoord];
		AddChunkToHISM(Build);
		ResidentChunks.Add(BestCoord);
		Spent += Build.BladeTransforms.Num() + Build.ImpostorTransforms.Num();
		++Admitted;
		bChanged = true;
	}

	if (bChanged)
	{
		GlobalBladeHISM->BuildTreeIfOutdated(true, false);
		GlobalBladeHISM->MarkRenderStateDirty();
		GlobalImpostorHISM->BuildTreeIfOutdated(true, false);
		GlobalImpostorHISM->MarkRenderStateDirty();
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
	RegisteredChunks.Remove(ChunkCoord);

	if (ResidentChunks.Remove(ChunkCoord) > 0)
	{
		RemoveOwnedInstances(GlobalBladeHISM,    BladeOwners,    ChunkCoord);
		RemoveOwnedInstances(GlobalImpostorHISM, ImpostorOwners, ChunkCoord);
		if (GlobalBladeHISM)    { GlobalBladeHISM->BuildTreeIfOutdated(true, false);    GlobalBladeHISM->MarkRenderStateDirty(); }
		if (GlobalImpostorHISM) { GlobalImpostorHISM->BuildTreeIfOutdated(true, false); GlobalImpostorHISM->MarkRenderStateDirty(); }
	}
}
