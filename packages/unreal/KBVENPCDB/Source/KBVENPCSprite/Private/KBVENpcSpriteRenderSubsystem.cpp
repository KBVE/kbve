#include "KBVENpcSpriteRenderSubsystem.h"
#include "KBVENpcSpriteDef.h"
#include "KBVENpcSpriteDirection.h"

#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float PlaneUnit = 100.0f;
}

bool UKBVENpcSpriteRenderSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
	{
		return false;
	}
	const UWorld* World = Cast<UWorld>(Outer);
	return World && World->IsGameWorld();
}

void UKBVENpcSpriteRenderSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UKBVENpcSpriteRenderSubsystem::Deinitialize()
{
	Instances.Reset();
	IndexToHandle.Reset();
	DefHISMs.Reset();
	DefMIDs.Reset();
	HostActor = nullptr;
	Super::Deinitialize();
}

void UKBVENpcSpriteRenderSubsystem::EnsureHost()
{
	if (HostActor)
	{
		return;
	}
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FActorSpawnParameters Params;
	Params.ObjectFlags |= RF_Transient;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	HostActor = World->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
	if (!HostActor)
	{
		return;
	}
	HostActor->SetActorEnableCollision(false);
	HostActor->PrimaryActorTick.bCanEverTick = false;

	USceneComponent* Root = NewObject<USceneComponent>(HostActor, TEXT("Root"), RF_Transient);
	HostActor->SetRootComponent(Root);
	Root->RegisterComponent();
}

UStaticMesh* UKBVENpcSpriteRenderSubsystem::GetPlaneMesh()
{
	if (!PlaneMesh)
	{
		PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
	}
	return PlaneMesh;
}

UHierarchicalInstancedStaticMeshComponent* UKBVENpcSpriteRenderSubsystem::GetOrCreateHISM(UKBVENpcSpriteDef* Def)
{
	if (!Def)
	{
		return nullptr;
	}
	if (TObjectPtr<UHierarchicalInstancedStaticMeshComponent>* Found = DefHISMs.Find(Def))
	{
		return *Found;
	}

	EnsureHost();
	UStaticMesh* Mesh = GetPlaneMesh();
	if (!HostActor || !Mesh)
	{
		return nullptr;
	}

	UHierarchicalInstancedStaticMeshComponent* HISM =
		NewObject<UHierarchicalInstancedStaticMeshComponent>(HostActor, NAME_None, RF_Transient);
	HISM->SetMobility(EComponentMobility::Movable);
	HISM->SetupAttachment(HostActor->GetRootComponent());
	HISM->NumCustomDataFloats = 4;
	HISM->SetStaticMesh(Mesh);
	HISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	HISM->SetCanEverAffectNavigation(false);
	HISM->bDisableCollision = true;

	if (Def->SpriteMaterial)
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Def->SpriteMaterial, this);
		if (MID && Def->Atlas)
		{
			MID->SetTextureParameterValue(TEXT("Atlas"), Def->Atlas);
		}
		HISM->SetMaterial(0, MID);
		DefMIDs.Add(Def, MID);
	}

	HISM->RegisterComponent();
	DefHISMs.Add(Def, HISM);
	IndexToHandle.Add(HISM, {});
	return HISM;
}

bool UKBVENpcSpriteRenderSubsystem::GetCameraLocation(FVector& OutLocation) const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return false;
	}
	if (APlayerController* PC = World->GetFirstPlayerController())
	{
		if (PC->PlayerCameraManager)
		{
			OutLocation = PC->PlayerCameraManager->GetCameraLocation();
			return true;
		}
	}
	return false;
}

FKBVENpcSpriteHandle UKBVENpcSpriteRenderSubsystem::SpawnSprite(UKBVENpcSpriteDef* Def, FVector Location, float FacingYawDeg)
{
	FKBVENpcSpriteHandle Handle;
	UHierarchicalInstancedStaticMeshComponent* HISM = GetOrCreateHISM(Def);
	if (!HISM)
	{
		return Handle;
	}

	const int32 Index = HISM->AddInstance(FTransform(Location), true);

	FInstanceRec Rec;
	Rec.Def = Def;
	Rec.Location = Location;
	Rec.FacingYaw = FacingYawDeg;
	Rec.AnimTime = 0.0f;
	Rec.Phase = FMath::FRand() * Def->FramesPerAnim;
	Rec.HISM = HISM;
	Rec.Index = Index;

	Handle.Id = NextHandle++;
	Instances.Add(Handle.Id, Rec);
	IndexToHandle.FindChecked(HISM).Add(Handle.Id);
	return Handle;
}

void UKBVENpcSpriteRenderSubsystem::UpdateSprite(FKBVENpcSpriteHandle Handle, FVector Location, float FacingYawDeg)
{
	if (FInstanceRec* Rec = Instances.Find(Handle.Id))
	{
		Rec->Location = Location;
		Rec->FacingYaw = FacingYawDeg;
	}
}

void UKBVENpcSpriteRenderSubsystem::DespawnSprite(FKBVENpcSpriteHandle Handle)
{
	FInstanceRec* Rec = Instances.Find(Handle.Id);
	if (!Rec)
	{
		return;
	}
	UHierarchicalInstancedStaticMeshComponent* HISM = Rec->HISM;
	TArray<int32>* Idx = HISM ? IndexToHandle.Find(HISM) : nullptr;
	if (!HISM || !Idx)
	{
		Instances.Remove(Handle.Id);
		return;
	}

	const int32 Slot = Rec->Index;
	const int32 Last = HISM->GetInstanceCount() - 1;
	if (Slot != Last && Idx->IsValidIndex(Last))
	{
		const int32 MovedHandle = (*Idx)[Last];
		if (FInstanceRec* Moved = Instances.Find(MovedHandle))
		{
			Moved->Index = Slot;
		}
		(*Idx)[Slot] = MovedHandle;
	}
	if (Idx->Num() > 0)
	{
		Idx->Pop();
	}
	HISM->RemoveInstance(Last);
	Instances.Remove(Handle.Id);
}

void UKBVENpcSpriteRenderSubsystem::Tick(float DeltaTime)
{
	if (Instances.Num() == 0)
	{
		return;
	}
	FVector CamLoc;
	if (!GetCameraLocation(CamLoc))
	{
		return;
	}

	TSet<UHierarchicalInstancedStaticMeshComponent*> Touched;

	for (TPair<int32, FInstanceRec>& Pair : Instances)
	{
		FInstanceRec& Rec = Pair.Value;
		UKBVENpcSpriteDef* Def = Rec.Def;
		UHierarchicalInstancedStaticMeshComponent* HISM = Rec.HISM;
		if (!Def || !HISM)
		{
			continue;
		}

		Rec.AnimTime += DeltaTime;
		int32 Frame = 0;
		if (Def->Fps > 0.0f && Def->FramesPerAnim > 0)
		{
			Frame = FMath::FloorToInt(Rec.AnimTime * Def->Fps + Rec.Phase) % Def->FramesPerAnim;
		}

		const FKBVENpcSpriteView View = FKBVENpcSpriteDirection::Select(Rec.FacingYaw, Rec.Location, CamLoc, Def->bSwapSide);
		int32 Row = Def->RowFront;
		if (View.Facing == EKBVENpcSpriteFacing::Side)
		{
			Row = Def->RowSide;
		}
		else if (View.Facing == EKBVENpcSpriteFacing::Back)
		{
			Row = Def->RowBack;
		}

		const float InvCols = 1.0f / FMath::Max(1, Def->Columns);
		const float InvRows = 1.0f / FMath::Max(1, Def->Rows);
		float OffU = Frame * InvCols;
		float ScaleU = InvCols;
		if (View.bFlipX)
		{
			OffU = (Frame + 1) * InvCols;
			ScaleU = -InvCols;
		}
		const float OffV = Row * InvRows;
		const float ScaleV = InvRows;

		HISM->SetCustomDataValue(Rec.Index, 0, OffU, false);
		HISM->SetCustomDataValue(Rec.Index, 1, OffV, false);
		HISM->SetCustomDataValue(Rec.Index, 2, ScaleU, false);
		HISM->SetCustomDataValue(Rec.Index, 3, ScaleV, false);

		FVector ToCam = CamLoc - Rec.Location;
		ToCam.Z = 0.0f;
		const FVector Face = ToCam.GetSafeNormal(1e-4f, FVector::ForwardVector);
		const FVector Up = FVector::UpVector;
		const FVector Right = FVector::CrossProduct(Up, Face).GetSafeNormal(1e-4f, FVector::RightVector);

		const FMatrix Basis(Right, Up, Face, FVector::ZeroVector);
		FTransform Transform(Basis);
		Transform.SetScale3D(FVector(Def->WorldSize.X / PlaneUnit, Def->WorldSize.Y / PlaneUnit, 1.0f));

		const float HalfHeight = 0.5f * Def->WorldSize.Y;
		const FVector PivotOffset = Up * (HalfHeight * (1.0f - 2.0f * Def->PivotZ));
		Transform.SetLocation(Rec.Location + PivotOffset);

		HISM->UpdateInstanceTransform(Rec.Index, Transform, true, false, true);
		Touched.Add(HISM);
	}

	for (UHierarchicalInstancedStaticMeshComponent* HISM : Touched)
	{
		HISM->MarkRenderStateDirty();
	}
}
