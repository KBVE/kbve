#include "Handlers/MCPFoliageHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "InstancedFoliageActor.h"
#include "FoliageType.h"
#include "AssetRegistry/AssetRegistryModule.h"

void FMCPFoliageHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("foliage.paint"), &HandlePaint);
	Registry.RegisterHandler(TEXT("foliage.remove"), &HandleRemove);
	Registry.RegisterHandler(TEXT("foliage.get_info"), &HandleGetInfo);
}

void FMCPFoliageHandlers::HandlePaint(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString FoliageTypePath = Params->GetStringField(TEXT("foliage_type"));
	if (FoliageTypePath.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'foliage_type' asset path is required"));
		return;
	}

	UFoliageType* FoliageType = LoadObject<UFoliageType>(nullptr, *FoliageTypePath);
	if (!FoliageType)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Foliage type not found: %s"), *FoliageTypePath));
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 3)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y,z] array is required"));
		return;
	}
	FVector Center((*CenterArr)[0]->AsNumber(), (*CenterArr)[1]->AsNumber(), (*CenterArr)[2]->AsNumber());

	double Radius = Params->GetNumberField(TEXT("radius"));
	if (Radius <= 0) Radius = 500.0;

	int32 Count = (int32)Params->GetNumberField(TEXT("count"));
	if (Count <= 0) Count = 10;

	double MinScale = 1.0, MaxScale = 1.0;
	Params->TryGetNumberField(TEXT("min_scale"), MinScale);
	Params->TryGetNumberField(TEXT("max_scale"), MaxScale);
	if (MaxScale < MinScale) MaxScale = MinScale;

	AInstancedFoliageActor* IFA = AInstancedFoliageActor::GetInstancedFoliageActorForCurrentLevel(World, true);
	if (!IFA)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("FOLIAGE_ERROR"), TEXT("Failed to get InstancedFoliageActor"));
		return;
	}

	FFoliageInfo* FoliageInfo = IFA->FindOrAddMesh(FoliageType);
	if (!FoliageInfo)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("FOLIAGE_ERROR"), TEXT("Failed to create foliage mesh info"));
		return;
	}

	int32 Placed = 0;
	for (int32 i = 0; i < Count; i++)
	{
		float Angle = FMath::FRandRange(0.f, 2.f * PI);
		float Dist = FMath::FRandRange(0.f, (float)Radius);
		FVector Loc = Center + FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0);

		// Raycast down to find ground
		FHitResult Hit;
		FVector Start = Loc + FVector(0, 0, 10000);
		FVector End = Loc - FVector(0, 0, 10000);
		if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_WorldStatic))
		{
			Loc = Hit.ImpactPoint;
		}

		float Scale = FMath::FRandRange((float)MinScale, (float)MaxScale);
		float Yaw = FMath::FRandRange(0.f, 360.f);

		FFoliageInstance Instance;
		Instance.Location = Loc;
		Instance.Rotation = FRotator(0, Yaw, 0);
		Instance.DrawScale3D = FVector3f(Scale);

		FoliageInfo->AddInstance(FoliageType, Instance);
		Placed++;
	}

	IFA->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("placed"), Placed);
	Result->SetStringField(TEXT("foliage_type"), FoliageTypePath);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPFoliageHandlers::HandleRemove(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	if (!Params->TryGetArrayField(TEXT("center"), CenterArr) || CenterArr->Num() < 3)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'center' [x,y,z] array is required"));
		return;
	}
	FVector Center((*CenterArr)[0]->AsNumber(), (*CenterArr)[1]->AsNumber(), (*CenterArr)[2]->AsNumber());

	double Radius = Params->GetNumberField(TEXT("radius"));
	if (Radius <= 0) Radius = 500.0;

	FString FoliageTypeFilter = Params->GetStringField(TEXT("foliage_type"));

	int32 Removed = 0;

	for (TActorIterator<AInstancedFoliageActor> It(World); It; ++It)
	{
		AInstancedFoliageActor* IFA = *It;
		TMap<UFoliageType*, FFoliageInfo*> FoliageInfos = IFA->GetAllInstancesFoliageType();

		for (auto& Pair : FoliageInfos)
		{
			if (!FoliageTypeFilter.IsEmpty() && !Pair.Key->GetPathName().Contains(FoliageTypeFilter))
				continue;

			TArray<int32> InstancesToRemove;
			FSphere Sphere(Center, (float)Radius);
			Pair.Value->GetInstancesInsideSphere(Sphere, InstancesToRemove);

			if (InstancesToRemove.Num() > 0)
			{
				Removed += InstancesToRemove.Num();
				Pair.Value->RemoveInstances(InstancesToRemove, true);
			}
		}

		IFA->MarkPackageDirty();
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("removed"), Removed);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPFoliageHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Types;
	int32 TotalInstances = 0;

	for (TActorIterator<AInstancedFoliageActor> It(World); It; ++It)
	{
		TMap<UFoliageType*, FFoliageInfo*> FoliageInfos = It->GetAllInstancesFoliageType();
		for (auto& Pair : FoliageInfos)
		{
			int32 InstanceCount = Pair.Value->Instances.Num();
			TotalInstances += InstanceCount;

			TSharedPtr<FJsonObject> TypeObj = MakeShared<FJsonObject>();
			TypeObj->SetStringField(TEXT("type"), Pair.Key->GetPathName());
			TypeObj->SetStringField(TEXT("name"), Pair.Key->GetName());
			TypeObj->SetNumberField(TEXT("instance_count"), InstanceCount);
			Types.Add(MakeShared<FJsonValueObject>(TypeObj));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("foliage_types"), Types);
	Result->SetNumberField(TEXT("total_instances"), TotalInstances);
	Result->SetNumberField(TEXT("type_count"), Types.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
