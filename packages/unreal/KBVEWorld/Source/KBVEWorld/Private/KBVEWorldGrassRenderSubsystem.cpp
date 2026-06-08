#include "KBVEWorldGrassRenderSubsystem.h"
#include "KBVEPerf.h"

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
#include "Engine/StaticMesh.h"
#include "KBVEWorldGrassShader.h"
#include "KBVEWorldProceduralGrass.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstance.h"
#include "Materials/MaterialInterface.h"

namespace KBVEGrassCfg
{
	constexpr double ChunkExtent       = 6400.0;
	constexpr int32  ViewRadius        = 2;
	constexpr int32  ImpostorRadius    = 4;
	constexpr int32  RetentionRadius   = ImpostorRadius + 1;
	constexpr int32  MaxResidentChunks = 110;
	constexpr float  PNScaleMul        = 1.f;
	constexpr int32  BladeStride       = 4;
	constexpr int32  ImpostorStride    = 14;
	constexpr float  ImpostorScaleMul  = 1.5f;
	constexpr int32  BudgetPerTick     = 20000;
	constexpr int32  MaxAdmitsPerTick  = 1;
	constexpr int32  MaxEvictsPerTick  = 2;

	constexpr float  ViewDist          = float(ViewRadius * ChunkExtent);
	constexpr float  ImpostorDist      = float(ImpostorRadius * ChunkExtent);
	constexpr float  BladeCullStart    = ViewDist * 0.6f;
	constexpr float  BladeCullEnd      = ViewDist * 0.9f;
	constexpr float  ImpostorCullStart = ImpostorDist * 0.85f;
	constexpr float  ImpostorCullEnd   = ImpostorDist;
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
	if (ImpostorHISM) ImpostorHISM->ClearInstances();
	if (HostActor)
	{
		HostActor->Destroy();
		HostActor = nullptr;
	}
	MasterMaterial = nullptr;
	ImpostorHISM   = nullptr;
	MeshHISMs.Reset();
	TrackedMeshes.Reset();
	MeshOwners.Reset();
	ImpostorOwners.Reset();
	RegisteredChunks.Reset();
	ResidentChunks.Reset();
	BladeResidentChunks.Reset();
	Super::Deinitialize();
}

void UKBVEWorldGrassRenderSubsystem::EnsureMaterialISMFlag(UMaterialInterface* MI)
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
			UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] ISM-flag recompile on material '%s' (synchronous shader compile)"), *BaseMat->GetName());
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
		EnsureMaterialISMFlag(Mesh->GetMaterial(0));
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

int32 UKBVEWorldGrassRenderSubsystem::BladeRenderStride()      { return KBVEGrassCfg::BladeStride; }
float UKBVEWorldGrassRenderSubsystem::RenderScaleMul()         { return KBVEGrassCfg::PNScaleMul; }
int32 UKBVEWorldGrassRenderSubsystem::ImpostorRenderStride()   { return KBVEGrassCfg::ImpostorStride; }
float UKBVEWorldGrassRenderSubsystem::ImpostorRenderScaleMul() { return KBVEGrassCfg::ImpostorScaleMul; }

UHierarchicalInstancedStaticMeshComponent* UKBVEWorldGrassRenderSubsystem::GetOrCreateImpostorHISM()
{
	if (ImpostorHISM) return ImpostorHISM;
	EnsureHost();
	if (!HostActor) return nullptr;

	UMaterialInterface* Mat = FKBVEWorldGrassShader::GetOrCreateCardMaterial(this);
	FKBVEWorldProceduralGrass::FCardSpec Spec;
	Spec.Width     = 40.f;
	Spec.Height    = 80.f;
	Spec.CardCount = 3;
	Spec.UniqueId  = TEXT("KBVEWorld_Grass_ImpostorCross");
	UStaticMesh* CrossMesh = FKBVEWorldProceduralGrass::GetOrCreateImpostorMesh(this, Spec, Mat);
	if (!CrossMesh) return nullptr;

	ImpostorHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, NAME_None, RF_Transient);
	ImpostorHISM->SetMobility(EComponentMobility::Movable);
	ImpostorHISM->SetupAttachment(HostActor->GetRootComponent());
	ImpostorHISM->NumCustomDataFloats       = 0;
	ImpostorHISM->InstanceStartCullDistance = (int32)KBVEGrassCfg::ImpostorCullStart;
	ImpostorHISM->InstanceEndCullDistance   = (int32)KBVEGrassCfg::ImpostorCullEnd;
	ImpostorHISM->SetStaticMesh(CrossMesh);
	if (CrossMesh->GetStaticMaterials().Num() > 0)
	{
		EnsureMaterialISMFlag(CrossMesh->GetMaterial(0));
	}
	ImpostorHISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	ImpostorHISM->SetCanEverAffectNavigation(false);
	ImpostorHISM->bDisableCollision                = true;
	ImpostorHISM->SetCastShadow(false);
	ImpostorHISM->bCastDynamicShadow               = false;
	ImpostorHISM->bCastStaticShadow                = false;
	ImpostorHISM->bAffectDistanceFieldLighting     = false;
	ImpostorHISM->bAffectDynamicIndirectLighting   = false;
	ImpostorHISM->bReceivesDecals                  = false;
	ImpostorHISM->bUseAsOccluder                   = false;
	ImpostorHISM->RegisterComponent();
	return ImpostorHISM;
}

void UKBVEWorldGrassRenderSubsystem::PrewarmMeshPool(const TArray<UStaticMesh*>& Meshes)
{
	EnsureHost();
	for (UStaticMesh* M : Meshes)
	{
		GetOrCreateMeshHISM(M);
	}
}

bool UKBVEWorldGrassRenderSubsystem::RegisterChunkInstances(FIntPoint ChunkCoord, const TArray<FKBVEGrassMeshBatch>& Batches, const TArray<FTransform>& ImpostorTransforms)
{
	FKBVEGrassPendingBuild Build;
	Build.ChunkCoord         = ChunkCoord;
	Build.Batches            = Batches;
	Build.ImpostorTransforms = ImpostorTransforms;
	for (const FKBVEGrassMeshBatch& B : Build.Batches)
	{
		if (B.Mesh) TrackedMeshes.Add(B.Mesh);
	}
	RegisteredChunks.Add(ChunkCoord, MoveTemp(Build));
	return true;
}

void UKBVEWorldGrassRenderSubsystem::AddBladesForChunk(const FKBVEGrassPendingBuild& Source,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	for (const FKBVEGrassMeshBatch& Batch : Source.Batches)
	{
		if (!Batch.Mesh || Batch.Transforms.Num() == 0) continue;

		UHierarchicalInstancedStaticMeshComponent* H = GetOrCreateMeshHISM(Batch.Mesh);
		if (!H) continue;

		H->AddInstances(Batch.Transforms, false);
		TArray<FIntPoint>& Owners = MeshOwners.FindOrAdd(Batch.Mesh);
		Owners.Reserve(Owners.Num() + Batch.Transforms.Num());
		for (int32 i = 0; i < Batch.Transforms.Num(); ++i) Owners.Add(Source.ChunkCoord);
		OutTouched.Add(H);
	}
	BladeResidentChunks.Add(Source.ChunkCoord);
}

void UKBVEWorldGrassRenderSubsystem::RemoveBladesForChunk(FIntPoint Coord,
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
	BladeResidentChunks.Remove(Coord);
}

void UKBVEWorldGrassRenderSubsystem::AddImpostorForChunk(const FKBVEGrassPendingBuild& Source,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	if (Source.ImpostorTransforms.Num() == 0) return;
	UHierarchicalInstancedStaticMeshComponent* IH = GetOrCreateImpostorHISM();
	if (!IH) return;
	IH->AddInstances(Source.ImpostorTransforms, false);
	ImpostorOwners.Reserve(ImpostorOwners.Num() + Source.ImpostorTransforms.Num());
	for (int32 i = 0; i < Source.ImpostorTransforms.Num(); ++i) ImpostorOwners.Add(Source.ChunkCoord);
	OutTouched.Add(IH);
}

void UKBVEWorldGrassRenderSubsystem::RemoveImpostorForChunk(FIntPoint Coord,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	if (!ImpostorHISM || ImpostorOwners.Num() == 0) return;
	const int32 Before = ImpostorHISM->GetInstanceCount();
	RemoveOwnedInstances(ImpostorHISM, ImpostorOwners, Coord);
	if (ImpostorHISM->GetInstanceCount() != Before) OutTouched.Add(ImpostorHISM);
}

void UKBVEWorldGrassRenderSubsystem::AddChunkToHISMs(const FKBVEGrassPendingBuild& Source,
	bool bAddBlades, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	KBVEPERF_SCOPE("Grass.AddChunk");
	if (bAddBlades) AddBladesForChunk(Source, OutTouched);
	else            AddImpostorForChunk(Source, OutTouched);
}

void UKBVEWorldGrassRenderSubsystem::RemoveChunkFromHISMs(FIntPoint Coord,
	TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched)
{
	RemoveBladesForChunk(Coord, OutTouched);
	RemoveImpostorForChunk(Coord, OutTouched);
}

void UKBVEWorldGrassRenderSubsystem::TickBuildQueue(int32 InstanceBudget)
{
	if (RegisteredChunks.Num() == 0 && ResidentChunks.Num() == 0) return;

	KBVEPERF_SCOPE("Grass.TickBuildQueue");
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

	const bool bOverCap = ResidentChunks.Num() > MaxResidentChunks;
	if (bOverCap || ResidentChunks.Num() > 0)
	{
		TArray<FIntPoint> Victims;
		for (const FIntPoint& C : ResidentChunks)
		{
			if (Cheb(C) > RetentionRadius) Victims.Add(C);
		}

		if (ResidentChunks.Num() - Victims.Num() > MaxResidentChunks)
		{
			TArray<FIntPoint> Spill;
			for (const FIntPoint& C : ResidentChunks)
			{
				if (Cheb(C) <= RetentionRadius) Spill.Add(C);
			}
			Spill.Sort([&Cheb](const FIntPoint& A, const FIntPoint& B) { return Cheb(A) > Cheb(B); });
			const int32 NeedDrop = (ResidentChunks.Num() - Victims.Num()) - MaxResidentChunks;
			for (int32 i = 0; i < NeedDrop && i < Spill.Num(); ++i) Victims.Add(Spill[i]);
		}

		Victims.Sort([&Cheb](const FIntPoint& A, const FIntPoint& B) { return Cheb(A) > Cheb(B); });
		const int32 EvictCap = bOverCap ? (MaxEvictsPerTick * 2) : MaxEvictsPerTick;
		const int32 EvictThisTick = FMath::Min(Victims.Num(), EvictCap);
		for (int32 i = 0; i < EvictThisTick; ++i)
		{
			RemoveChunkFromHISMs(Victims[i], Touched);
			ResidentChunks.Remove(Victims[i]);
		}
	}

	int32 Transitioned = 0;
	for (const FIntPoint& C : ResidentChunks)
	{
		if (Transitioned >= MaxAdmitsPerTick) break;
		const bool bWantBlades = Cheb(C) <= ViewRadius;
		const bool bHasBlades  = BladeResidentChunks.Contains(C);
		if (bWantBlades == bHasBlades) continue;

		if (bWantBlades)
		{
			if (const FKBVEGrassPendingBuild* B = RegisteredChunks.Find(C))
			{
				AddBladesForChunk(*B, Touched);
				RemoveImpostorForChunk(C, Touched);
				++Transitioned;
			}
		}
		else
		{
			RemoveBladesForChunk(C, Touched);
			if (const FKBVEGrassPendingBuild* B = RegisteredChunks.Find(C))
			{
				AddImpostorForChunk(*B, Touched);
			}
			++Transitioned;
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
			if (Cheb(Pair.Key) > ImpostorRadius) continue;
			const FVector Center(Pair.Key.X * ChunkExtent + ChunkExtent * 0.5,
				Pair.Key.Y * ChunkExtent + ChunkExtent * 0.5, CamLoc.Z);
			const double DSq = FVector::DistSquared(Center, CamLoc);
			if (DSq < BestSq) { BestSq = DSq; BestCoord = Pair.Key; bFound = true; }
		}
		if (!bFound) break;

		const FKBVEGrassPendingBuild& Build = RegisteredChunks[BestCoord];
		const bool bAddBlades = Cheb(BestCoord) <= ViewRadius;
		AddChunkToHISMs(Build, bAddBlades, Touched);
		ResidentChunks.Add(BestCoord);
		for (const FKBVEGrassMeshBatch& B : Build.Batches) Spent += B.Transforms.Num();
		Spent += Build.ImpostorTransforms.Num();
		++Admitted;
	}

	for (UHierarchicalInstancedStaticMeshComponent* H : Touched)
	{
		H->BuildTreeIfOutdated(true, false);
	}

#if KBVEPERF_ENABLED
	if (FKBVEPerf::IsEnabled())
	{
		int32 TotalInstances = ImpostorHISM ? ImpostorHISM->GetInstanceCount() : 0;
		for (const TPair<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>>& Pair : MeshHISMs)
		{
			if (Pair.Value) TotalInstances += Pair.Value->GetInstanceCount();
		}
		KBVEPERF_COUNT("Grass.ResidentChunks", ResidentChunks.Num());
		KBVEPERF_COUNT("Grass.RegisteredChunks", RegisteredChunks.Num());
		KBVEPERF_COUNT("Grass.BladeResidentChunks", BladeResidentChunks.Num());
		KBVEPERF_COUNT("Grass.HISMs", MeshHISMs.Num() + (ImpostorHISM ? 1 : 0));
		KBVEPERF_COUNT("Grass.Instances", TotalInstances);
	}
#endif
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
		}
	}
}
