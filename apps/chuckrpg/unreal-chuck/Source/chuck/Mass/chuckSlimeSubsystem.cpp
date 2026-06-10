#include "chuckSlimeSubsystem.h"
#include "chuckSlimeTypes.h"

#include "MassEntitySubsystem.h"
#include "MassEntityManager.h"
#include "MassCommonFragments.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Engine/Texture2D.h"

#if WITH_EDITOR
#include "Materials/Material.h"
#include "MaterialEditingLibrary.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionConstant2Vector.h"
#include "Materials/MaterialExpressionFmod.h"
#include "Materials/MaterialExpressionFloor.h"
#include "Materials/MaterialExpressionDivide.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionAppendVector.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Misc/PackageName.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#endif

namespace
{
	const TCHAR* SlimeTexPath = TEXT("/Game/NPC/Slime/T_SlimeCrawl.T_SlimeCrawl");
	const TCHAR* SlimeISMMatPath = TEXT("/Game/NPC/Slime/M_SlimeSpriteISM");

	UMaterialInterface* GetOrCreateSlimeISMMaterial(int32 Cols, int32 Rows)
	{
		if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, SlimeISMMatPath))
		{
			return Existing;
		}
#if WITH_EDITOR
		UTexture2D* Tex = LoadObject<UTexture2D>(nullptr, SlimeTexPath);
		if (!Tex)
		{
			return nullptr;
		}

		UPackage* Pkg = CreatePackage(SlimeISMMatPath);
		UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_SlimeSpriteISM"), RF_Public | RF_Standalone);
		M->BlendMode = BLEND_Masked;
		M->TwoSided = true;
		M->SetShadingModel(MSM_Unlit);
		M->bUsedWithInstancedStaticMeshes = true;

		auto Make = [M](UClass* C) { return UMaterialEditingLibrary::CreateMaterialExpression(M, C); };

		UMaterialExpressionPerInstanceCustomData* PIC = Cast<UMaterialExpressionPerInstanceCustomData>(Make(UMaterialExpressionPerInstanceCustomData::StaticClass()));
		PIC->DataIndex = 0;

		UMaterialExpressionConstant* ColsC = Cast<UMaterialExpressionConstant>(Make(UMaterialExpressionConstant::StaticClass()));
		ColsC->R = (float)Cols;

		UMaterialExpressionFmod* Col = Cast<UMaterialExpressionFmod>(Make(UMaterialExpressionFmod::StaticClass()));
		Col->A.Expression = PIC;
		Col->B.Expression = ColsC;

		UMaterialExpressionDivide* Div = Cast<UMaterialExpressionDivide>(Make(UMaterialExpressionDivide::StaticClass()));
		Div->A.Expression = PIC;
		Div->B.Expression = ColsC;

		UMaterialExpressionFloor* Row = Cast<UMaterialExpressionFloor>(Make(UMaterialExpressionFloor::StaticClass()));
		Row->Input.Expression = Div;

		UMaterialExpressionConstant* InvCols = Cast<UMaterialExpressionConstant>(Make(UMaterialExpressionConstant::StaticClass()));
		InvCols->R = 1.f / Cols;

		UMaterialExpressionConstant* InvRows = Cast<UMaterialExpressionConstant>(Make(UMaterialExpressionConstant::StaticClass()));
		InvRows->R = 1.f / Rows;

		UMaterialExpressionMultiply* OffU = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		OffU->A.Expression = Col;
		OffU->B.Expression = InvCols;

		UMaterialExpressionMultiply* OffV = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		OffV->A.Expression = Row;
		OffV->B.Expression = InvRows;

		UMaterialExpressionAppendVector* Offset = Cast<UMaterialExpressionAppendVector>(Make(UMaterialExpressionAppendVector::StaticClass()));
		Offset->A.Expression = OffU;
		Offset->B.Expression = OffV;

		UMaterialExpressionTextureCoordinate* UV = Cast<UMaterialExpressionTextureCoordinate>(Make(UMaterialExpressionTextureCoordinate::StaticClass()));

		UMaterialExpressionConstant2Vector* Cell = Cast<UMaterialExpressionConstant2Vector>(Make(UMaterialExpressionConstant2Vector::StaticClass()));
		Cell->R = 1.f / Cols;
		Cell->G = 1.f / Rows;

		UMaterialExpressionMultiply* ScaledUV = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		ScaledUV->A.Expression = UV;
		ScaledUV->B.Expression = Cell;

		UMaterialExpressionAdd* FinalUV = Cast<UMaterialExpressionAdd>(Make(UMaterialExpressionAdd::StaticClass()));
		FinalUV->A.Expression = ScaledUV;
		FinalUV->B.Expression = Offset;

		UMaterialExpressionTextureSample* Sample = Cast<UMaterialExpressionTextureSample>(Make(UMaterialExpressionTextureSample::StaticClass()));
		Sample->Texture = Tex;
		Sample->SamplerType = SAMPLERTYPE_Color;
		Sample->Coordinates.Expression = FinalUV;

		UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();
		ED->EmissiveColor.Connect(0, Sample);
		ED->OpacityMask.Connect(4, Sample);

		M->PreEditChange(nullptr);
		M->PostEditChange();
		M->ForceRecompileForRendering();
		FAssetRegistryModule::AssetCreated(M);
		Pkg->MarkPackageDirty();
		const FString File = FPackageName::LongPackageNameToFilename(Pkg->GetName(), FPackageName::GetAssetPackageExtension());
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		UPackage::SavePackage(Pkg, M, *File, Args);
		return M;
#else
		return nullptr;
#endif
	}

	FRotator BillboardRot(const FVector& Pos, const FVector& CamLoc)
	{
		FVector ToCam = CamLoc - Pos;
		ToCam.Z = 0.f;
		if (ToCam.SizeSquared() < 1.f)
		{
			ToCam = FVector::ForwardVector;
		}
		ToCam.Normalize();
		return FRotationMatrix::MakeFromZY(ToCam, FVector::DownVector).Rotator();
	}
}

void UchuckSlimeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UchuckSlimeSubsystem::Deinitialize()
{
	Slimes.Reset();
	ISM = nullptr;
	Super::Deinitialize();
}

TStatId UchuckSlimeSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UchuckSlimeSubsystem, STATGROUP_Tickables);
}

void UchuckSlimeSubsystem::EnsureISM()
{
	if (ISM)
	{
		return;
	}
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	AActor* Holder = World->SpawnActor<AActor>();
	if (!Holder)
	{
		return;
	}

	ISM = NewObject<UInstancedStaticMeshComponent>(Holder);
	Holder->SetRootComponent(ISM);
	ISM->RegisterComponent();
	ISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	ISM->SetCastShadow(false);
	ISM->SetMobility(EComponentMobility::Movable);
	ISM->NumCustomDataFloats = 1;
	ISM->SetRenderCustomDepth(true);
	ISM->SetCustomDepthStencilValue(1);

	if (UStaticMesh* Plane = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")))
	{
		ISM->SetStaticMesh(Plane);
	}
	if (UMaterialInterface* Mat = GetOrCreateSlimeISMMaterial(Cols, Rows))
	{
		ISM->SetMaterial(0, Mat);
	}
}

float UchuckSlimeSubsystem::GroundTraceZ(double X, double Y, float Fallback) const
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return Fallback;
	}
	const FVector Start(X, Y, Fallback + 1000.f);
	const FVector End(X, Y, Fallback - 5000.f);
	FHitResult Hit;
	FCollisionQueryParams Params;
	if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic, Params))
	{
		return (float)Hit.ImpactPoint.Z;
	}
	return Fallback;
}

void UchuckSlimeSubsystem::SpawnSlimes(const FVector& Center, int32 Count, float Radius)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}
	UMassEntitySubsystem* MassSys = World->GetSubsystem<UMassEntitySubsystem>();
	if (!MassSys)
	{
		return;
	}
	EnsureISM();
	if (!ISM)
	{
		return;
	}

	FMassEntityManager& EM = MassSys->GetMutableEntityManager();

	if (!Archetype.IsValid())
	{
		const TArray<const UScriptStruct*> Composition = {
			FTransformFragment::StaticStruct(),
			FchuckSlimeFragment::StaticStruct(),
			FchuckSlimeTag::StaticStruct()
		};
		Archetype = EM.CreateArchetype(Composition);
	}

	for (int32 i = 0; i < Count; ++i)
	{
		const float Angle = (2.f * PI * i) / FMath::Max(1, Count);
		const double X = Center.X + FMath::Cos(Angle) * Radius;
		const double Y = Center.Y + FMath::Sin(Angle) * Radius;
		const float GroundZ = GroundTraceZ(X, Y, (float)Center.Z);

		const FMassEntityHandle E = EM.CreateEntity(Archetype);
		FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(E);
		FchuckSlimeFragment* S = EM.GetFragmentDataPtr<FchuckSlimeFragment>(E);
		if (!T || !S)
		{
			continue;
		}

		const FVector Pos(X, Y, GroundZ + HalfHeight);
		T->GetMutableTransform().SetLocation(Pos);
		T->GetMutableTransform().SetScale3D(FVector(QuadScale));

		S->GroundZ = GroundZ;
		S->TargetLocation = FVector(X, Y, GroundZ);
		S->Speed = FMath::FRandRange(110.f, 170.f);
		S->Frame = i % FrameCount;
		S->FrameTime = FMath::FRand() / FrameRate;
		S->RepathTimer = FMath::FRandRange(0.f, 2.f);

		const FTransform IT(BillboardRot(Pos, Pos + FVector::ForwardVector), Pos, FVector(QuadScale));
		const int32 Idx = ISM->AddInstance(IT, true);
		ISM->SetCustomDataValue(Idx, 0, (float)S->Frame, false);
		Slimes.Add(E);
	}

	ISM->MarkRenderStateDirty();
	UE_LOG(LogTemp, Display, TEXT("[chuck] Mass slimes spawned: %d (total %d)"), Count, Slimes.Num());
}

void UchuckSlimeSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!ISM || Slimes.Num() == 0)
	{
		return;
	}
	UWorld* World = GetWorld();
	UMassEntitySubsystem* MassSys = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
	if (!MassSys)
	{
		return;
	}
	FMassEntityManager& EM = MassSys->GetMutableEntityManager();

	FVector CamLoc = FVector::ZeroVector;
	if (APlayerCameraManager* PCM = UGameplayStatics::GetPlayerCameraManager(World, 0))
	{
		CamLoc = PCM->GetCameraLocation();
	}

	const float Step = 1.f / FrameRate;

	for (int32 i = 0; i < Slimes.Num(); ++i)
	{
		const FMassEntityHandle E = Slimes[i];
		if (!EM.IsEntityValid(E))
		{
			continue;
		}
		FTransformFragment* T = EM.GetFragmentDataPtr<FTransformFragment>(E);
		FchuckSlimeFragment* S = EM.GetFragmentDataPtr<FchuckSlimeFragment>(E);
		if (!T || !S)
		{
			continue;
		}

		FVector Pos = T->GetTransform().GetLocation();

		S->RepathTimer -= DeltaTime;
		const double DistToTarget = FVector::Dist2D(Pos, S->TargetLocation);
		if (S->RepathTimer <= 0.f || DistToTarget < 60.0)
		{
			const float WanderAngle = FMath::FRandRange(0.f, 2.f * PI);
			const float WanderDist = FMath::FRandRange(250.f, 550.f);
			const double NX = Pos.X + FMath::Cos(WanderAngle) * WanderDist;
			const double NY = Pos.Y + FMath::Sin(WanderAngle) * WanderDist;
			S->TargetLocation = FVector(NX, NY, GroundTraceZ(NX, NY, S->GroundZ));
			S->RepathTimer = FMath::FRandRange(2.f, 4.f);
		}

		FVector Dir = S->TargetLocation - Pos;
		Dir.Z = 0.f;
		const double Flat = Dir.Size();
		const bool bMoving = Flat > 15.0;

		if (bMoving)
		{
			Dir /= Flat;
			FVector NewPos = Pos + Dir * S->Speed * DeltaTime;
			S->GroundZ = GroundTraceZ(NewPos.X, NewPos.Y, S->GroundZ);
			S->HopPhase += DeltaTime * 7.f;
			const float Hop = FMath::Abs(FMath::Sin(S->HopPhase)) * 28.f;
			NewPos.Z = S->GroundZ + HalfHeight + Hop;
			T->GetMutableTransform().SetLocation(NewPos);
			Pos = NewPos;
		}
		else
		{
			Pos.Z = S->GroundZ + HalfHeight;
			T->GetMutableTransform().SetLocation(Pos);
		}

		S->FrameTime += DeltaTime;
		while (S->FrameTime >= Step)
		{
			S->FrameTime -= Step;
			S->Frame = (S->Frame + 1) % FrameCount;
		}

		const FTransform IT(BillboardRot(Pos, CamLoc), Pos, FVector(QuadScale));
		ISM->UpdateInstanceTransform(i, IT, true, false, true);
		ISM->SetCustomDataValue(i, 0, (float)S->Frame, false);
	}

	ISM->MarkRenderStateDirty();
}
