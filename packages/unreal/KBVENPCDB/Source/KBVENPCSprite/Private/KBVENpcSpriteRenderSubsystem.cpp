#include "KBVENpcSpriteRenderSubsystem.h"
#include "KBVENpcSpriteDef.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture.h"
#include "Engine/World.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "MaterialDomain.h"
#include "UObject/StrongObjectPtr.h"

#if WITH_EDITOR
#include "Materials/MaterialExpressionCustom.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionTextureSampleParameter2D.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "Materials/MaterialExpressionObjectPositionWS.h"
#include "Materials/MaterialExpressionCameraPositionWS.h"
#include "Materials/MaterialExpressionSubtract.h"
#include "Materials/MaterialExpressionTime.h"
#include "Materials/MaterialExpressionPerInstanceCustomData.h"
#include "MaterialEditingLibrary.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Misc/PackageName.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#endif

namespace
{
	static TStrongObjectPtr<UMaterialInterface> CachedBillboard;

#if WITH_EDITOR
	template <typename T>
	T* MakeExpr(UMaterial* M)
	{
		return Cast<T>(UMaterialEditingLibrary::CreateMaterialExpression(M, T::StaticClass()));
	}

	void AddInput(UMaterialExpressionCustom* C, const TCHAR* Name, UMaterialExpression* Expr, int32 OutIdx = 0)
	{
		FCustomInput In;
		In.InputName = FName(Name);
		In.Input.Expression = Expr;
		In.Input.OutputIndex = OutIdx;
		C->Inputs.Add(In);
	}

	UMaterialExpressionScalarParameter* MakeScalar(UMaterial* M, const TCHAR* Name, float Default)
	{
		UMaterialExpressionScalarParameter* S = MakeExpr<UMaterialExpressionScalarParameter>(M);
		S->ParameterName = FName(Name);
		S->DefaultValue = Default;
		return S;
	}
#endif
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

UMaterialInterface* UKBVENpcSpriteRenderSubsystem::GetOrCreateBillboardMaterial()
{
	if (CachedBillboard.IsValid())
	{
		return CachedBillboard.Get();
	}

	static const TCHAR* PkgPath = TEXT("/Game/KBVE/Generated/M_KBVENpcBillboard");
	if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, PkgPath))
	{
		CachedBillboard.Reset(Existing);
		return Existing;
	}

#if WITH_EDITOR
	UPackage* Pkg = CreatePackage(PkgPath);
	UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_KBVENpcBillboard"), RF_Public | RF_Standalone);
	M->MaterialDomain = MD_Surface;
	M->SetShadingModel(MSM_Unlit);
	M->BlendMode = BLEND_Masked;
	M->TwoSided = true;
	M->SetUsageByFlag(MATUSAGE_InstancedStaticMeshes, true);
	M->OpacityMaskClipValue = 0.5f;

	UMaterialExpressionWorldPosition* WorldP = MakeExpr<UMaterialExpressionWorldPosition>(M);
	UMaterialExpressionObjectPositionWS* ObjP = MakeExpr<UMaterialExpressionObjectPositionWS>(M);
	UMaterialExpressionCameraPositionWS* CamP = MakeExpr<UMaterialExpressionCameraPositionWS>(M);

	UMaterialExpressionSubtract* LocalOffset = MakeExpr<UMaterialExpressionSubtract>(M);
	LocalOffset->A.Expression = WorldP;
	LocalOffset->B.Expression = ObjP;

	UMaterialExpressionScalarParameter* WorldSizeX = MakeScalar(M, TEXT("WorldSizeX"), 150.0f);
	UMaterialExpressionScalarParameter* WorldSizeY = MakeScalar(M, TEXT("WorldSizeY"), 150.0f);
	UMaterialExpressionScalarParameter* PivotZ = MakeScalar(M, TEXT("PivotZ"), 0.0f);

	UMaterialExpressionCustom* WPO = MakeExpr<UMaterialExpressionCustom>(M);
	WPO->OutputType = CMOT_Float3;
	WPO->Inputs.Empty();
	AddInput(WPO, TEXT("L"), LocalOffset);
	AddInput(WPO, TEXT("CamPos"), CamP);
	AddInput(WPO, TEXT("ObjPos"), ObjP);
	AddInput(WPO, TEXT("WorldSizeX"), WorldSizeX);
	AddInput(WPO, TEXT("WorldSizeY"), WorldSizeY);
	AddInput(WPO, TEXT("PivotZ"), PivotZ);
	WPO->Code = TEXT(
		"float3 toCam = CamPos - ObjPos;\n"
		"toCam.z = 0.0;\n"
		"float3 fwd = normalize(toCam + float3(0.0, 0.0001, 0.0));\n"
		"float3 up = float3(0.0, 0.0, 1.0);\n"
		"float3 right = normalize(cross(up, fwd));\n"
		"float sx = WorldSizeX / 100.0;\n"
		"float sy = WorldSizeY / 100.0;\n"
		"float3 desired = right * (L.x * sx) + up * (L.y * sy);\n"
		"desired += up * (50.0 * sy * (1.0 - 2.0 * PivotZ));\n"
		"return desired - L;");

	UMaterialExpressionTextureCoordinate* UV = MakeExpr<UMaterialExpressionTextureCoordinate>(M);
	UV->CoordinateIndex = 0;
	UMaterialExpressionTime* Time = MakeExpr<UMaterialExpressionTime>(M);

	UMaterialExpressionPerInstanceCustomData* MoveYaw = MakeExpr<UMaterialExpressionPerInstanceCustomData>(M);
	MoveYaw->DataIndex = 0;
	UMaterialExpressionPerInstanceCustomData* AnimSeed = MakeExpr<UMaterialExpressionPerInstanceCustomData>(M);
	AnimSeed->DataIndex = 1;

	UMaterialExpressionScalarParameter* Cols = MakeScalar(M, TEXT("Cols"), 5.0f);
	UMaterialExpressionScalarParameter* Rows = MakeScalar(M, TEXT("Rows"), 3.0f);
	UMaterialExpressionScalarParameter* Fps = MakeScalar(M, TEXT("Fps"), 8.0f);
	UMaterialExpressionScalarParameter* Frames = MakeScalar(M, TEXT("Frames"), 5.0f);
	UMaterialExpressionScalarParameter* SwapSide = MakeScalar(M, TEXT("SwapSide"), 1.0f);
	UMaterialExpressionScalarParameter* RowFront = MakeScalar(M, TEXT("RowFront"), 0.0f);
	UMaterialExpressionScalarParameter* RowSide = MakeScalar(M, TEXT("RowSide"), 1.0f);
	UMaterialExpressionScalarParameter* RowBack = MakeScalar(M, TEXT("RowBack"), 2.0f);

	UMaterialExpressionCustom* Cell = MakeExpr<UMaterialExpressionCustom>(M);
	Cell->OutputType = CMOT_Float2;
	Cell->Inputs.Empty();
	AddInput(Cell, TEXT("UV"), UV);
	AddInput(Cell, TEXT("MoveYaw"), MoveYaw);
	AddInput(Cell, TEXT("AnimSeed"), AnimSeed);
	AddInput(Cell, TEXT("CamPos"), CamP);
	AddInput(Cell, TEXT("ObjPos"), ObjP);
	AddInput(Cell, TEXT("T"), Time);
	AddInput(Cell, TEXT("Cols"), Cols);
	AddInput(Cell, TEXT("Rows"), Rows);
	AddInput(Cell, TEXT("Fps"), Fps);
	AddInput(Cell, TEXT("Frames"), Frames);
	AddInput(Cell, TEXT("SwapSide"), SwapSide);
	AddInput(Cell, TEXT("RowFront"), RowFront);
	AddInput(Cell, TEXT("RowSide"), RowSide);
	AddInput(Cell, TEXT("RowBack"), RowBack);
	Cell->Code = TEXT(
		"float3 toCam = CamPos - ObjPos;\n"
		"toCam.z = 0.0;\n"
		"toCam = normalize(toCam + float3(0.0, 0.0001, 0.0));\n"
		"float camYaw = atan2(toCam.y, toCam.x);\n"
		"float d = MoveYaw - camYaw;\n"
		"d = atan2(sin(d), cos(d));\n"
		"float ad = abs(d);\n"
		"float row = RowFront;\n"
		"float flip = 0.0;\n"
		"if (ad >= 2.3562) { row = RowBack; }\n"
		"else if (ad > 0.7854) {\n"
		"  row = RowSide;\n"
		"  float right = (d < 0.0) ? 1.0 : 0.0;\n"
		"  flip = (right != SwapSide) ? 1.0 : 0.0;\n"
		"}\n"
		"float u = lerp(UV.x, 1.0 - UV.x, flip);\n"
		"float v = 1.0 - UV.y;\n"
		"float frame = floor(frac((T * Fps + AnimSeed) / Frames) * Frames);\n"
		"return float2((frame + u) / Cols, (row + v) / Rows);");

	UMaterialExpressionTextureSampleParameter2D* Atlas = MakeExpr<UMaterialExpressionTextureSampleParameter2D>(M);
	Atlas->ParameterName = FName(TEXT("Atlas"));
	Atlas->Texture = LoadObject<UTexture>(nullptr, TEXT("/Engine/EngineResources/DefaultTexture.DefaultTexture"));
	Atlas->SamplerType = SAMPLERTYPE_Color;
	Atlas->Coordinates.Expression = Cell;

	UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();
	ED->WorldPositionOffset.Connect(0, WPO);
	ED->EmissiveColor.Connect(0, Atlas);
	ED->OpacityMask.Connect(4, Atlas);

	M->PreEditChange(nullptr);
	M->PostEditChange();
	M->ForceRecompileForRendering();
	FAssetRegistryModule::AssetCreated(M);
	Pkg->MarkPackageDirty();
	const FString File = FPackageName::LongPackageNameToFilename(Pkg->GetName(), FPackageName::GetAssetPackageExtension());
	FSavePackageArgs Args;
	Args.TopLevelFlags = RF_Public | RF_Standalone;
	UPackage::SavePackage(Pkg, M, *File, Args);
	CachedBillboard.Reset(M);
	return M;
#else
	return nullptr;
#endif
}

UInstancedStaticMeshComponent* UKBVENpcSpriteRenderSubsystem::GetOrCreateHISM(UKBVENpcSpriteDef* Def)
{
	if (!Def)
	{
		return nullptr;
	}
	if (TObjectPtr<UInstancedStaticMeshComponent>* Found = DefHISMs.Find(Def))
	{
		return *Found;
	}

	EnsureHost();
	UStaticMesh* Mesh = GetPlaneMesh();
	if (!HostActor || !Mesh)
	{
		return nullptr;
	}

	UInstancedStaticMeshComponent* HISM =
		NewObject<UInstancedStaticMeshComponent>(HostActor, NAME_None, RF_Transient);
	HISM->SetMobility(EComponentMobility::Movable);
	HISM->SetupAttachment(HostActor->GetRootComponent());
	HISM->NumCustomDataFloats = 2;
	HISM->SetStaticMesh(Mesh);
	HISM->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	HISM->SetCanEverAffectNavigation(false);
	HISM->bDisableCollision = true;
	HISM->SetCastShadow(false);
	HISM->bReceivesDecals = false;
	if (Def->CullDistance > 0.0f)
	{
		HISM->SetCullDistances(static_cast<int32>(Def->CullDistance * 0.85f), static_cast<int32>(Def->CullDistance));
	}

	UMaterialInterface* Base = Def->SpriteMaterial ? Def->SpriteMaterial.Get() : GetOrCreateBillboardMaterial();
	if (Base)
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Base, this);
		if (MID)
		{
			if (Def->Atlas)
			{
				MID->SetTextureParameterValue(TEXT("Atlas"), Def->Atlas.Get());
			}
			MID->SetScalarParameterValue(TEXT("WorldSizeX"), Def->WorldSize.X);
			MID->SetScalarParameterValue(TEXT("WorldSizeY"), Def->WorldSize.Y);
			MID->SetScalarParameterValue(TEXT("PivotZ"), Def->PivotZ);
			MID->SetScalarParameterValue(TEXT("Cols"), Def->Columns);
			MID->SetScalarParameterValue(TEXT("Rows"), Def->Rows);
			MID->SetScalarParameterValue(TEXT("Fps"), Def->Fps);
			MID->SetScalarParameterValue(TEXT("Frames"), Def->FramesPerAnim);
			MID->SetScalarParameterValue(TEXT("SwapSide"), Def->bSwapSide ? 1.0f : 0.0f);
			MID->SetScalarParameterValue(TEXT("RowFront"), Def->RowFront);
			MID->SetScalarParameterValue(TEXT("RowSide"), Def->RowSide);
			MID->SetScalarParameterValue(TEXT("RowBack"), Def->RowBack);
			HISM->SetMaterial(0, MID);
			DefMIDs.Add(Def, MID);
		}
	}

	HISM->RegisterComponent();
	DefHISMs.Add(Def, HISM);
	IndexToHandle.Add(HISM, {});
	return HISM;
}

FKBVENpcSpriteHandle UKBVENpcSpriteRenderSubsystem::SpawnSprite(UKBVENpcSpriteDef* Def, FVector Location, float FacingYawDeg)
{
	FKBVENpcSpriteHandle Handle;
	UInstancedStaticMeshComponent* HISM = GetOrCreateHISM(Def);
	if (!HISM)
	{
		return Handle;
	}

	FTransform Xform(FQuat::Identity, Location, FVector::OneVector);
	const int32 Index = HISM->AddInstance(Xform, true);
	HISM->SetCustomDataValue(Index, 0, FMath::DegreesToRadians(FacingYawDeg), false);
	HISM->SetCustomDataValue(Index, 1, FMath::FRand() * FMath::Max(1, Def->FramesPerAnim), false);

	FInstanceRec Rec;
	Rec.Def = Def;
	Rec.Location = Location;
	Rec.FacingYaw = FacingYawDeg;
	Rec.AppliedLocation = Location;
	Rec.AppliedYaw = FacingYawDeg;
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
	UInstancedStaticMeshComponent* HISM = Rec->HISM;
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

		FTransform MovedXform;
		HISM->GetInstanceTransform(Last, MovedXform, true);
		HISM->UpdateInstanceTransform(Slot, MovedXform, true, false, true);
		const int32 Floats = HISM->NumCustomDataFloats;
		if (Floats > 0 && HISM->PerInstanceSMCustomData.Num() >= (Last + 1) * Floats)
		{
			for (int32 c = 0; c < Floats; ++c)
			{
				HISM->SetCustomDataValue(Slot, c, HISM->PerInstanceSMCustomData[Last * Floats + c], false);
			}
		}
	}
	if (Idx->Num() > 0)
	{
		Idx->Pop();
	}
	HISM->RemoveInstance(Last);
	Instances.Remove(Handle.Id);
}

void UKBVENpcSpriteRenderSubsystem::DebugSetCellParams(UKBVENpcSpriteDef* Def, float RowFront, float RowSide, float RowBack, float SwapSide)
{
	TObjectPtr<UInstancedStaticMeshComponent>* Found = Def ? DefHISMs.Find(Def) : nullptr;
	if (!Found || !*Found)
	{
		return;
	}
	UMaterialInstanceDynamic* MID = Cast<UMaterialInstanceDynamic>((*Found)->GetMaterial(0));
	if (!MID)
	{
		return;
	}
	if (RowFront >= 0.f) { MID->SetScalarParameterValue(TEXT("RowFront"), RowFront); }
	if (RowSide  >= 0.f) { MID->SetScalarParameterValue(TEXT("RowSide"),  RowSide); }
	if (RowBack  >= 0.f) { MID->SetScalarParameterValue(TEXT("RowBack"),  RowBack); }
	if (SwapSide >= 0.f) { MID->SetScalarParameterValue(TEXT("SwapSide"), SwapSide); }
}

bool UKBVENpcSpriteRenderSubsystem::DebugStoredYawDeg(FKBVENpcSpriteHandle Handle, float& OutYawDeg) const
{
	const FInstanceRec* Rec = Instances.Find(Handle.Id);
	if (!Rec || !Rec->HISM)
	{
		return false;
	}
	const int32 Floats = Rec->HISM->NumCustomDataFloats;
	if (Floats <= 0 || Rec->HISM->PerInstanceSMCustomData.Num() < (Rec->Index + 1) * Floats)
	{
		return false;
	}
	OutYawDeg = FMath::RadiansToDegrees(Rec->HISM->PerInstanceSMCustomData[Rec->Index * Floats + 0]);
	return true;
}

void UKBVENpcSpriteRenderSubsystem::Tick(float DeltaTime)
{
	if (Instances.Num() == 0)
	{
		return;
	}

	TSet<UInstancedStaticMeshComponent*> Touched;

	for (TPair<int32, FInstanceRec>& Pair : Instances)
	{
		FInstanceRec& Rec = Pair.Value;
		UInstancedStaticMeshComponent* HISM = Rec.HISM;
		if (!HISM)
		{
			continue;
		}

		const bool bMoved = !Rec.Location.Equals(Rec.AppliedLocation, 0.5);
		const bool bTurned = !FMath::IsNearlyEqual(Rec.FacingYaw, Rec.AppliedYaw, 0.5f);
		if (!bMoved && !bTurned)
		{
			continue;
		}

		if (bMoved)
		{
			FTransform Xform(FQuat::Identity, Rec.Location, FVector::OneVector);
			HISM->UpdateInstanceTransform(Rec.Index, Xform, true, false, true);
			Rec.AppliedLocation = Rec.Location;
		}
		if (bTurned)
		{
			HISM->SetCustomDataValue(Rec.Index, 0, FMath::DegreesToRadians(Rec.FacingYaw), false);
			Rec.AppliedYaw = Rec.FacingYaw;
		}
		Touched.Add(HISM);
	}

	for (UInstancedStaticMeshComponent* HISM : Touched)
	{
		HISM->MarkRenderStateDirty();
	}
}
