#include "chuckSpriteNPC.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture2D.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/Material.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"

#if WITH_EDITOR
#include "MaterialEditingLibrary.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionConstant2Vector.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionAppendVector.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Misc/PackageName.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#endif

namespace
{
	const TCHAR* SlimeTexPath = TEXT("/Game/NPC/Slime/T_SlimeCrawl.T_SlimeCrawl");
	const TCHAR* SlimeMatPath = TEXT("/Game/NPC/Slime/M_SlimeSprite");

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
		UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_SlimeSprite"), RF_Public | RF_Standalone);
		M->BlendMode = BLEND_Masked;
		M->TwoSided = true;
		M->SetShadingModel(MSM_Unlit);

		auto Make = [M](UClass* C) { return UMaterialEditingLibrary::CreateMaterialExpression(M, C); };

		UMaterialExpressionTextureCoordinate* UV = Cast<UMaterialExpressionTextureCoordinate>(Make(UMaterialExpressionTextureCoordinate::StaticClass()));

		UMaterialExpressionConstant2Vector* Cell = Cast<UMaterialExpressionConstant2Vector>(Make(UMaterialExpressionConstant2Vector::StaticClass()));
		Cell->R = 1.f / Cols;
		Cell->G = 1.f / Rows;

		UMaterialExpressionMultiply* ScaledUV = Cast<UMaterialExpressionMultiply>(Make(UMaterialExpressionMultiply::StaticClass()));
		ScaledUV->A.Expression = UV;
		ScaledUV->B.Expression = Cell;

		UMaterialExpressionScalarParameter* OffU = Cast<UMaterialExpressionScalarParameter>(Make(UMaterialExpressionScalarParameter::StaticClass()));
		OffU->ParameterName = TEXT("OffU");
		OffU->DefaultValue = 0.f;

		UMaterialExpressionScalarParameter* OffV = Cast<UMaterialExpressionScalarParameter>(Make(UMaterialExpressionScalarParameter::StaticClass()));
		OffV->ParameterName = TEXT("OffV");
		OffV->DefaultValue = 0.f;

		UMaterialExpressionAppendVector* Offset = Cast<UMaterialExpressionAppendVector>(Make(UMaterialExpressionAppendVector::StaticClass()));
		Offset->A.Expression = OffU;
		Offset->B.Expression = OffV;

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
}

AchuckSpriteNPC::AchuckSpriteNPC()
{
	PrimaryActorTick.bCanEverTick = true;

	Quad = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Quad"));
	RootComponent = Quad;
	Quad->SetRelativeRotation(FRotator(90.f, 0.f, 0.f));
	Quad->SetRelativeScale3D(FVector(1.5f));
	Quad->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Quad->SetCastShadow(false);
	Quad->SetRenderCustomDepth(true);
	Quad->SetCustomDepthStencilValue(1);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> PlaneMesh(TEXT("/Engine/BasicShapes/Plane.Plane"));
	if (PlaneMesh.Succeeded())
	{
		Quad->SetStaticMesh(PlaneMesh.Object);
	}
}

void AchuckSpriteNPC::BeginPlay()
{
	Super::BeginPlay();

	UMaterialInterface* Base = GetOrCreateSlimeMaterial(Cols, Rows);
	if (Base)
	{
		MID = UMaterialInstanceDynamic::Create(Base, this);
		Quad->SetMaterial(0, MID);
		ApplyFrame();
	}

	const float HalfHeight = 50.f * Quad->GetRelativeScale3D().Z;
	const FVector Origin = GetActorLocation();
	FHitResult Hit;
	FCollisionQueryParams QueryParams;
	QueryParams.AddIgnoredActor(this);
	if (GetWorld()->LineTraceSingleByChannel(Hit, Origin + FVector(0.f, 0.f, 600.f), Origin - FVector(0.f, 0.f, 4000.f), ECC_WorldStatic, QueryParams))
	{
		SetActorLocation(Hit.ImpactPoint + FVector(0.f, 0.f, HalfHeight));
	}
}

void AchuckSpriteNPC::ApplyFrame()
{
	if (!MID || Cols <= 0 || Rows <= 0)
	{
		return;
	}
	const int32 Col = FrameIndex % Cols;
	const int32 Row = (FrameIndex / Cols) % Rows;
	MID->SetScalarParameterValue(TEXT("OffU"), (float)Col / (float)Cols);
	MID->SetScalarParameterValue(TEXT("OffV"), (float)Row / (float)Rows);
}

void AchuckSpriteNPC::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (FrameCount > 1 && FrameRate > 0.f && MID)
	{
		FrameTime += DeltaSeconds;
		const float Step = 1.f / FrameRate;
		while (FrameTime >= Step)
		{
			FrameTime -= Step;
			FrameIndex = (FrameIndex + 1) % FrameCount;
			ApplyFrame();
		}
	}

	if (!bFaceCamera)
	{
		return;
	}

	APlayerCameraManager* PCM = UGameplayStatics::GetPlayerCameraManager(this, 0);
	if (!PCM)
	{
		return;
	}

	FVector ToCamera = PCM->GetCameraLocation() - GetActorLocation();
	ToCamera.Z = 0.f;
	if (ToCamera.SizeSquared() < 1.f)
	{
		return;
	}
	ToCamera.Normalize();

	const FRotator BillboardRot = FRotationMatrix::MakeFromZY(ToCamera, FVector::DownVector).Rotator();
	Quad->SetWorldRotation(BillboardRot);
}

static FAutoConsoleCommand GchuckSpawnSlimeCmd(
	TEXT("chuck.SpawnSlime"),
	TEXT("Spawn a slime sprite NPC 3m in front of the local player."),
	FConsoleCommandDelegate::CreateLambda([]()
	{
		UWorld* World = (GEngine && GEngine->GameViewport) ? GEngine->GameViewport->GetWorld() : nullptr;
		if (!World)
		{
			return;
		}
		APlayerController* PC = World->GetFirstPlayerController();
		APawn* Pawn = PC ? PC->GetPawn() : nullptr;
		if (!Pawn)
		{
			UE_LOG(LogTemp, Warning, TEXT("[chuck] SpawnSlime: no pawn"));
			return;
		}
		const FVector Loc = Pawn->GetActorLocation() + Pawn->GetActorForwardVector() * 300.f + FVector(0.f, 0.f, 60.f);
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AchuckSpriteNPC* Slime = World->SpawnActor<AchuckSpriteNPC>(AchuckSpriteNPC::StaticClass(), Loc, FRotator::ZeroRotator, Params);
		UE_LOG(LogTemp, Display, TEXT("[chuck] SpawnSlime → %s at (%.0f,%.0f,%.0f)"),
			Slime ? *Slime->GetName() : TEXT("(null)"), Loc.X, Loc.Y, Loc.Z);
	}));
