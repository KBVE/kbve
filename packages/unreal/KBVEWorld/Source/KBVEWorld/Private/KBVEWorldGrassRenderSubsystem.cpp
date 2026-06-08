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
	constexpr float  PNScaleMul       = 1.f;
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
	for (const TPair<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>>& Pair : MeshHISMs)
	{
		if (Pair.Value) Pair.Value->ClearInstances();
	}
	if (HostActor)
	{
		HostActor->Destroy();
		HostActor = nullptr;
	}
	MasterMaterial = nullptr;
	MeshHISMs.Reset();
	TrackedMeshes.Reset();
	MeshOwners.Reset();
	RegisteredChunks.Reset();
	ResidentChunks.Reset();
	Super::Deinitialize();
}

static void KBVEGrass_EnsureMaterialISMFlag(UMaterialInterface* MI)
{
	if (!MI) return;
	UMaterialInterface* Cur = MI;
	while (UMaterialInstance* Inst = Cast<UMaterialInstance>(Cur))
	{
		if (!Inst->Parent) break;
		Cur = Inst->Parent;
	}
	if (UMaterial* BaseMat = Cast<UMaterial>(Cur))
	{
		if (!BaseMat->bUsedWithInstancedStaticMeshes)
		{
			BaseMat->bUsedWithInstancedStaticMeshes = true;
#if WITH_EDITOR
			BaseMat->PostEditChange();
			BaseMat->ForceRecompileForRendering();
#endif
		}
	}
}

void UKBVEWorldGrassRenderSubsystem::EnsureHost()
{
	if (HostActor) return;

	UWorld* W = GetWorld();
	if (!W) return;

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

	if (!PNGlobalUpdaterActor)
	{
		static const TCHAR* UpdaterPath = TEXT("/Game/PN_GrassLibrary/Blueprints/PN_GlobalUpdater.PN_GlobalUpdater_C");
		if (UClass* UpdaterClass = LoadClass<AActor>(nullptr, UpdaterPath))
		{
			PNGlobalUpdaterActor = W->SpawnActor<AActor>(UpdaterClass, FVector::ZeroVector, FRotator::ZeroRotator, Params);
		}
	}
}

UHierarchicalInstancedStaticMeshComponent* UKBVEWorldGrassRenderSubsystem::GetOrCreateMeshHISM(UStaticMesh* Mesh)
{
	if (!Mesh) return nullptr;
	if (TObjectPtr<UHierarchicalInstancedStaticMeshComponent>* Found = MeshHISMs.Find(Mesh))
	{
		return *Found;
	}
	EnsureHost();
	if (!HostActor) return nullptr;

	UHierarchicalInstancedStaticMeshComponent* H =
		NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, NAME_None, RF_Transient);
	H->SetMobility(EComponentMobility::Movable);
	H->SetupAttachment(HostActor->GetRootComponent());
	H->NumCustomDataFloats       = 0;
	H->InstanceStartCullDistance = (int32)KBVEGrassCfg::BladeCullStart;
	H->InstanceEndCullDistance   = (int32)KBVEGrassCfg::BladeCullEnd;
	H->SetStaticMesh(Mesh);
	if (Mesh->GetStaticMaterials().Num() > 0)
	{
		KBVEGrass_EnsureMaterialISMFlag(Mesh->GetMaterial(0));
	}
	else if (MasterMaterial)
	{
		H->SetMaterial(0, MasterMaterial);
	}
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

	MeshHISMs.Add(Mesh, H);
	MeshOwners.Add(Mesh, {});
	return H;
}

bool UKBVEWorldGrassRenderSubsystem::RegisterChunkInstances(FIntPoint ChunkCoord, const TArray<FKBVEGrassMeshBatch>& Batches)
{
	FKBVEGrassPendingBuild Build;
	Build.ChunkCoord = ChunkCoord;
	Build.Batches    = Batches;
	for (const FKBVEGrassMeshBatch& B : Build.Batches)
	{
		if (B.Mesh) TrackedMeshes.Add(B.Mesh);
	}
	RegisteredChunks.Add(ChunkCoord, MoveTemp(Build));
	return true;
}

void UKBVEWorldGrassRenderSubsystem::AddChunkToHISMs(const FKBVEGrassPendingBuild& Source,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	using namespace KBVEGrassCfg;

	for (const FKBVEGrassMeshBatch& Batch : Source.Batches)
	{
		if (!Batch.Mesh || Batch.Transforms.Num() == 0) continue;

		UHierarchicalInstancedStaticMeshComponent* H = GetOrCreateMeshHISM(Batch.Mesh);
		if (!H) continue;

		TArray<FTransform> Out;
		Out.Reserve(Batch.Transforms.Num() / BladeStride + 1);
		for (int32 i = 0; i < Batch.Transforms.Num(); i += BladeStride)
		{
			FTransform T = Batch.Transforms[i];
			T.MultiplyScale3D(FVector(PNScaleMul));
			Out.Add(T);
		}
		if (Out.Num() == 0) continue;

		H->AddInstances(Out, false);
		TArray<FIntPoint>& Owners = MeshOwners.FindOrAdd(Batch.Mesh);
		Owners.Reserve(Owners.Num() + Out.Num());
		for (int32 i = 0; i < Out.Num(); ++i) Owners.Add(Source.ChunkCoord);
		OutTouched.Add(H);
	}
}

void UKBVEWorldGrassRenderSubsystem::RemoveChunkFromHISMs(FIntPoint Coord,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	for (TPair<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>>& Pair : MeshHISMs)
	{
		UHierarchicalInstancedStaticMeshComponent* H = Pair.Value;
		if (!H) continue;
		TArray<FIntPoint>* Owners = MeshOwners.Find(Pair.Key.Get());
		if (!Owners || Owners->Num() == 0) continue;
		const int32 Before = H->GetInstanceCount();
		RemoveOwnedInstances(H, *Owners, Coord);
		if (H->GetInstanceCount() != Before) OutTouched.Add(H);
	}
}

void UKBVEWorldGrassRenderSubsystem::TickBuildQueue(int32 InstanceBudget)
{
	if (RegisteredChunks.Num() == 0 && ResidentChunks.Num() == 0) return;

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

	TSet<UHierarchicalInstancedStaticMeshComponent*> Touched;

	int32 Evicted = 0;
	for (auto It = ResidentChunks.CreateIterator(); It && Evicted < MaxAdmitsPerTick; ++It)
	{
		if (Cheb(*It) > EvictRadius)
		{
			RemoveChunkFromHISMs(*It, Touched);
			It.RemoveCurrent();
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
		AddChunkToHISMs(Build, Touched);
		ResidentChunks.Add(BestCoord);
		for (const FKBVEGrassMeshBatch& B : Build.Batches) Spent += B.Transforms.Num();
		++Admitted;
	}

	for (UHierarchicalInstancedStaticMeshComponent* H : Touched)
	{
		H->BuildTreeIfOutdated(true, false);
		H->MarkRenderStateDirty();
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
		TSet<UHierarchicalInstancedStaticMeshComponent*> Touched;
		RemoveChunkFromHISMs(ChunkCoord, Touched);
		for (UHierarchicalInstancedStaticMeshComponent* H : Touched)
		{
			H->BuildTreeIfOutdated(true, false);
			H->MarkRenderStateDirty();
		}
	}
}
