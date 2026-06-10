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
#include "NavigationSystem.h"
#include "NavigationPath.h"
#include "NavigationData.h"

#if WITH_EDITOR
#include "Materials/Material.h"
#include "MaterialEditingLibrary.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionOneMinus.h"
#include "Materials/MaterialExpressionLinearInterpolate.h"
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
	const TCHAR* SlimeMatPath = TEXT("/Game/NPC/Slime/M_SlimeDir");

	// Sprite Animation Layout 1: 3 rows = front / side-left / back, 5-col walk cycle.
	// Per-instance custom data: 0 = column (walk frame), 1 = row (facing), 2 = flip (mirror U).
	UMaterialInterface* GetOrCreateSlimeMaterial(int32 Cols, int32 Rows)
	{
		if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, SlimeMatPath))
		{
			return Existing;
		}
#if WITH_EDITOR
		UTexture2D* Tex = LoadObject<UTexture2D>(nullptr, SlimeTexPath);
		if (!Tex)
		{
			return nullptr;
		}

		UPackage* Pkg = CreatePackage(SlimeMatPath);
		UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_SlimeDir"), RF_Public | RF_Standalone);
		M->BlendMode = BLEND_Masked;
		M->TwoSided = true;
		M->SetShadingModel(MSM_Unlit);
		M->bUsedWithInstancedStaticMeshes = true;

		auto Make = [M](UClass* C) { return UMaterialEditingLibrary::CreateMaterialExpression(M, C); };

		UMaterialExpressionPerInstanceCustomData* Col = Cast<UMaterialExpressionPerInstanceCustomData>(Make(UMaterialExpressionPerInstanceCustomData::StaticClass()));
		Col->DataIndex = 0;
		UMaterialExpressionPerInstanceCustomData* Row = Cast<UMaterialExpressionPerInstanceCustomData>(Make(UMaterialExpressionPerInstanceCustomData::StaticClass()));
		Row->DataIndex = 1;
		UMaterialExpressionPerInstanceCustomData* Flip = Cast<UMaterialExpressionPerInstanceCustomData>(Make(UMaterialExpressionPerInstanceCustomData::StaticClass()));
		Flip->DataIndex = 2;

		UMaterialExpressionTextureCoordinate* UV = Cast<UMaterialExpressionTextureCoordinate>(Make(UMaterialExpressionTextureCoordinate::StaticClass()));

		UMaterialExpressionComponentMask* LocalU = Cast<UMaterialExpressionComponentMask>(Make(UMaterialExpressionComponentMask::StaticClass()));
		LocalU->R = true; LocalU->G = false; LocalU->B = false; LocalU->A = false;
		LocalU->Input.Expression = UV;

		UMaterialExpressionComponentMask* LocalV = Cast<UMaterialExpressionComponentMask>(Make(UMaterialExpressionComponentMask::StaticClass()));
		LocalV->R = false; LocalV->G = true; LocalV->B = false; LocalV->A = false;
		LocalV->Input.Expression = UV;

		UMaterialExpressionOneMinus* OneMinusU = Cast<UMaterialExpressionOneMinus>(Make(UMaterialExpressionOneMinus::StaticClass()));
		OneMinusU->Input.Expression = LocalU;

		UMaterialExpressionLinearInterpolate* FlipU = Cast<UMaterialExpressionLinearInterpolate>(Make(UMaterialExpressionLinearInterpolate::StaticClass()));
		FlipU->A.Expression = LocalU;
		FlipU->B.Expression = OneMinusU;
		FlipU->Alpha.Expression = Flip;

		UMaterialExpressionAdd* ColPlus = Cast<UMaterialExpressionAdd>(Make(UMaterialExpressionAdd::StaticClass()));
		ColPlus->A.Expression = Col;
		ColPlus->B.Expression = FlipU;

		UMaterialExpressionConstant* InvCols = Cast<UMaterialExpressionConstant>(Make(UMaterialExpressionConstant::StaticClass()));
		InvCols->R = 1.f / Cols;

		UMaterialExpressionMultiply* CellU = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		CellU->A.Expression = ColPlus;
		CellU->B.Expression = InvCols;

		UMaterialExpressionAdd* RowPlus = Cast<UMaterialExpressionAdd>(Make(UMaterialExpressionAdd::StaticClass()));
		RowPlus->A.Expression = Row;
		RowPlus->B.Expression = LocalV;

		UMaterialExpressionConstant* InvRows = Cast<UMaterialExpressionConstant>(Make(UMaterialExpressionConstant::StaticClass()));
		InvRows->R = 1.f / Rows;

		UMaterialExpressionMultiply* CellV = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		CellV->A.Expression = RowPlus;
		CellV->B.Expression = InvRows;

		UMaterialExpressionAppendVector* FinalUV = Cast<UMaterialExpressionAppendVector>(Make(UMaterialExpressionAppendVector::StaticClass()));
		FinalUV->A.Expression = CellU;
		FinalUV->B.Expression = CellV;

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

	// Returns row (0 front / 1 side / 2 back) and flip (mirror U) for a move
	// direction relative to the camera. Side row authored looking left → flip when moving right.
	void FacingFromMove(const FVector& MoveDir, const FVector& ToCam, const FVector& CamRight, int32& OutRow, float& OutFlip)
	{
		const float TowardPlayer = FVector::DotProduct(MoveDir, ToCam);
		const float ScreenRight = FVector::DotProduct(MoveDir, CamRight);
		if (FMath::Abs(TowardPlayer) >= FMath::Abs(ScreenRight))
		{
			OutRow = (TowardPlayer > 0.f) ? 0 : 2;
			OutFlip = 0.f;
		}
		else
		{
			OutRow = 1;
			OutFlip = (ScreenRight > 0.f) ? 1.f : 0.f;
		}
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
	ISM->NumCustomDataFloats = 3;
	ISM->SetRenderCustomDepth(true);
	ISM->SetCustomDepthStencilValue(2);

	if (UStaticMesh* Plane = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")))
	{
		ISM->SetStaticMesh(Plane);
	}
	if (UMaterialInterface* Mat = GetOrCreateSlimeMaterial(Cols, Rows))
	{
		ISM->SetMaterial(0, Mat);
	}
}

void UchuckSlimeSubsystem::Repath(int32 SlimeIndex, const FVector& From)
{
	if (!Paths.IsValidIndex(SlimeIndex))
	{
		return;
	}
	TArray<FVector>& P = Paths[SlimeIndex];
	P.Reset();

	UWorld* World = GetWorld();
	const float WanderAngle = FMath::FRandRange(0.f, 2.f * PI);
	const float WanderDist = FMath::FRandRange(300.f, 700.f);
	FVector Target = From + FVector(FMath::Cos(WanderAngle) * WanderDist, FMath::Sin(WanderAngle) * WanderDist, 0.f);

	if (UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(World))
	{
		FNavLocation Proj;
		if (Nav->ProjectPointToNavigation(Target, Proj, FVector(400.f, 400.f, 800.f)))
		{
			Target = Proj.Location;
		}
		if (UNavigationPath* Path = Nav->FindPathToLocationSynchronously(World, From, Target))
		{
			if (Path->IsValid() && Path->PathPoints.Num() > 1)
			{
				for (const FVector& Pt : Path->PathPoints)
				{
					P.Add(Pt);
				}
			}
		}
	}

	if (P.Num() == 0)
	{
		P.Add(Target);
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
		S->Frame = 0;
		S->FrameTime = FMath::FRand() / FrameRate;
		S->RepathTimer = FMath::FRandRange(0.f, 2.f);

		const FTransform IT(BillboardRot(Pos, Pos + FVector::ForwardVector), Pos, FVector(QuadScale));
		const int32 Idx = ISM->AddInstance(IT, true);
		ISM->SetCustomDataValue(Idx, 0, 0.f, false);
		ISM->SetCustomDataValue(Idx, 1, 0.f, false);
		ISM->SetCustomDataValue(Idx, 2, 0.f, false);
		Slimes.Add(E);
		Paths.Add(TArray<FVector>());
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
	FVector CamRight = FVector::RightVector;
	if (APlayerCameraManager* PCM = UGameplayStatics::GetPlayerCameraManager(World, 0))
	{
		CamLoc = PCM->GetCameraLocation();
		CamRight = FRotationMatrix(PCM->GetCameraRotation()).GetUnitAxis(EAxis::Y);
		CamRight.Z = 0.f;
		CamRight.Normalize();
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
		TArray<FVector>& P = Paths[i];
		if (P.Num() == 0 || S->PathIndex >= P.Num() || S->RepathTimer <= 0.f)
		{
			Repath(i, Pos);
			S->PathIndex = (P.Num() > 1) ? 1 : 0;
			S->RepathTimer = FMath::FRandRange(3.f, 6.f);
		}

		FVector Waypoint = P.IsValidIndex(S->PathIndex) ? P[S->PathIndex] : Pos;
		FVector Dir = Waypoint - Pos;
		Dir.Z = 0.f;
		double Flat = Dir.Size();
		if (Flat < 50.0 && S->PathIndex < P.Num())
		{
			++S->PathIndex;
			Waypoint = P.IsValidIndex(S->PathIndex) ? P[S->PathIndex] : Pos;
			Dir = Waypoint - Pos;
			Dir.Z = 0.f;
			Flat = Dir.Size();
		}
		const bool bMoving = Flat > 20.0 && S->PathIndex < P.Num();

		int32 RowVal = 0;
		float FlipVal = 0.f;

		if (bMoving)
		{
			Dir /= Flat;
			FVector NewPos = Pos + Dir * S->Speed * DeltaTime;
			S->GroundZ = GroundTraceZ(NewPos.X, NewPos.Y, S->GroundZ);
			S->HopPhase += DeltaTime * 7.f;
			const float Hop = FMath::Abs(FMath::Sin(S->HopPhase)) * 28.f;
			NewPos.Z = S->GroundZ + HalfHeight + Hop;
			T->GetMutableTransform().SetLocation(NewPos);

			FVector ToCam = CamLoc - NewPos;
			ToCam.Z = 0.f;
			ToCam.Normalize();
			FacingFromMove(Dir, ToCam, CamRight, RowVal, FlipVal);

			S->FrameTime += DeltaTime;
			while (S->FrameTime >= Step)
			{
				S->FrameTime -= Step;
				S->Frame = (S->Frame + 1) % Cols;
			}
			Pos = NewPos;
		}
		else
		{
			Pos.Z = S->GroundZ + HalfHeight;
			T->GetMutableTransform().SetLocation(Pos);
			S->Frame = 0;
			RowVal = 0;
			FlipVal = 0.f;
		}

		const FTransform IT(BillboardRot(Pos, CamLoc), Pos, FVector(QuadScale));
		ISM->UpdateInstanceTransform(i, IT, true, false, true);
		ISM->SetCustomDataValue(i, 0, (float)S->Frame, false);
		ISM->SetCustomDataValue(i, 1, (float)RowVal, false);
		ISM->SetCustomDataValue(i, 2, FlipVal, false);
	}

	ISM->MarkRenderStateDirty();
}
