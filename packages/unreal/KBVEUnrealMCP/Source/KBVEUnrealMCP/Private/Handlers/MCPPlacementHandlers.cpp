#include "Handlers/MCPPlacementHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/StaticMeshActor.h"
#include "Components/SplineComponent.h"
#include "Engine/PointLight.h"
#include "Engine/SpotLight.h"

void FMCPPlacementHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("placement.grid"), &HandlePlaceInGrid);
	Registry.RegisterHandler(TEXT("placement.circle"), &HandlePlaceInCircle);
	Registry.RegisterHandler(TEXT("placement.scatter"), &HandleScatterInArea);
	Registry.RegisterHandler(TEXT("placement.along_spline"), &HandlePlaceAlongSpline);
}

AActor* FMCPPlacementHandlers::SpawnActorByType(UWorld* World, const FString& ActorType, const FVector& Location, const FRotator& Rotation)
{
	UClass* ActorClass = nullptr;

	if (ActorType.Equals(TEXT("StaticMeshActor"), ESearchCase::IgnoreCase))
		ActorClass = AStaticMeshActor::StaticClass();
	else if (ActorType.Equals(TEXT("PointLight"), ESearchCase::IgnoreCase))
		ActorClass = APointLight::StaticClass();
	else if (ActorType.Equals(TEXT("SpotLight"), ESearchCase::IgnoreCase))
		ActorClass = ASpotLight::StaticClass();
	else
	{
		ActorClass = FindObject<UClass>(nullptr, *ActorType);
		if (!ActorClass)
			ActorClass = LoadClass<AActor>(nullptr, *ActorType);
	}

	if (!ActorClass)
		ActorClass = AActor::StaticClass();

	return World->SpawnActor<AActor>(ActorClass, Location, Rotation);
}

void FMCPPlacementHandlers::HandlePlaceInGrid(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString ActorType = Params->GetStringField(TEXT("actor_type"));
	if (ActorType.IsEmpty()) ActorType = TEXT("StaticMeshActor");

	const TArray<TSharedPtr<FJsonValue>>* OriginArr;
	FVector Origin = FVector::ZeroVector;
	if (Params->TryGetArrayField(TEXT("origin"), OriginArr) && OriginArr->Num() >= 3)
		Origin = FVector((*OriginArr)[0]->AsNumber(), (*OriginArr)[1]->AsNumber(), (*OriginArr)[2]->AsNumber());

	int32 Rows = (int32)Params->GetNumberField(TEXT("rows"));
	int32 Cols = (int32)Params->GetNumberField(TEXT("columns"));
	if (Rows <= 0) Rows = 3;
	if (Cols <= 0) Cols = 3;

	double SpacingX = Params->GetNumberField(TEXT("spacing_x"));
	double SpacingY = Params->GetNumberField(TEXT("spacing_y"));
	if (SpacingX <= 0) SpacingX = 200.0;
	if (SpacingY <= 0) SpacingY = 200.0;

	FString LabelPrefix = Params->GetStringField(TEXT("label_prefix"));
	if (LabelPrefix.IsEmpty()) LabelPrefix = TEXT("GridActor");

	TArray<TSharedPtr<FJsonValue>> Spawned;
	for (int32 R = 0; R < Rows; R++)
	{
		for (int32 C = 0; C < Cols; C++)
		{
			FVector Loc = Origin + FVector(C * SpacingX, R * SpacingY, 0);
			AActor* Actor = SpawnActorByType(World, ActorType, Loc, FRotator::ZeroRotator);
			if (Actor)
			{
				FString Label = FString::Printf(TEXT("%s_%d_%d"), *LabelPrefix, R, C);
				Actor->SetActorLabel(Label);
				Spawned.Add(MakeShared<FJsonValueString>(Actor->GetName()));
			}
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Spawned);
	Result->SetNumberField(TEXT("count"), Spawned.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPlacementHandlers::HandlePlaceInCircle(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString ActorType = Params->GetStringField(TEXT("actor_type"));
	if (ActorType.IsEmpty()) ActorType = TEXT("StaticMeshActor");

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	FVector Center = FVector::ZeroVector;
	if (Params->TryGetArrayField(TEXT("center"), CenterArr) && CenterArr->Num() >= 3)
		Center = FVector((*CenterArr)[0]->AsNumber(), (*CenterArr)[1]->AsNumber(), (*CenterArr)[2]->AsNumber());

	double Radius = Params->GetNumberField(TEXT("radius"));
	if (Radius <= 0) Radius = 500.0;

	int32 Count = (int32)Params->GetNumberField(TEXT("count"));
	if (Count <= 0) Count = 8;

	bool bFaceCenter = true;
	Params->TryGetBoolField(TEXT("face_center"), bFaceCenter);

	FString LabelPrefix = Params->GetStringField(TEXT("label_prefix"));
	if (LabelPrefix.IsEmpty()) LabelPrefix = TEXT("CircleActor");

	TArray<TSharedPtr<FJsonValue>> Spawned;
	for (int32 i = 0; i < Count; i++)
	{
		float Angle = (2.f * PI * i) / Count;
		FVector Loc = Center + FVector(FMath::Cos(Angle) * Radius, FMath::Sin(Angle) * Radius, 0);
		FRotator Rot = FRotator::ZeroRotator;
		if (bFaceCenter)
		{
			FVector Dir = (Center - Loc).GetSafeNormal();
			Rot = Dir.Rotation();
		}

		AActor* Actor = SpawnActorByType(World, ActorType, Loc, Rot);
		if (Actor)
		{
			Actor->SetActorLabel(FString::Printf(TEXT("%s_%d"), *LabelPrefix, i));
			Spawned.Add(MakeShared<FJsonValueString>(Actor->GetName()));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Spawned);
	Result->SetNumberField(TEXT("count"), Spawned.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPlacementHandlers::HandleScatterInArea(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString ActorType = Params->GetStringField(TEXT("actor_type"));
	if (ActorType.IsEmpty()) ActorType = TEXT("StaticMeshActor");

	const TArray<TSharedPtr<FJsonValue>>* CenterArr;
	FVector Center = FVector::ZeroVector;
	if (Params->TryGetArrayField(TEXT("center"), CenterArr) && CenterArr->Num() >= 3)
		Center = FVector((*CenterArr)[0]->AsNumber(), (*CenterArr)[1]->AsNumber(), (*CenterArr)[2]->AsNumber());

	double Radius = Params->GetNumberField(TEXT("radius"));
	if (Radius <= 0) Radius = 1000.0;

	int32 Count = (int32)Params->GetNumberField(TEXT("count"));
	if (Count <= 0) Count = 20;

	bool bSnapToGround = true;
	Params->TryGetBoolField(TEXT("snap_to_ground"), bSnapToGround);

	bool bRandomYaw = true;
	Params->TryGetBoolField(TEXT("random_yaw"), bRandomYaw);

	double MinScale = 1.0, MaxScale = 1.0;
	Params->TryGetNumberField(TEXT("min_scale"), MinScale);
	Params->TryGetNumberField(TEXT("max_scale"), MaxScale);

	FString LabelPrefix = Params->GetStringField(TEXT("label_prefix"));
	if (LabelPrefix.IsEmpty()) LabelPrefix = TEXT("ScatterActor");

	TArray<TSharedPtr<FJsonValue>> Spawned;
	for (int32 i = 0; i < Count; i++)
	{
		float Angle = FMath::FRandRange(0.f, 2.f * PI);
		float Dist = FMath::FRandRange(0.f, (float)Radius);
		FVector Loc = Center + FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0);

		if (bSnapToGround)
		{
			FHitResult Hit;
			if (World->LineTraceSingleByChannel(Hit, Loc + FVector(0, 0, 10000), Loc - FVector(0, 0, 10000), ECC_WorldStatic))
				Loc = Hit.ImpactPoint;
		}

		float Yaw = bRandomYaw ? FMath::FRandRange(0.f, 360.f) : 0.f;
		AActor* Actor = SpawnActorByType(World, ActorType, Loc, FRotator(0, Yaw, 0));
		if (Actor)
		{
			if (MaxScale > MinScale)
			{
				float S = FMath::FRandRange((float)MinScale, (float)MaxScale);
				Actor->SetActorScale3D(FVector(S));
			}
			Actor->SetActorLabel(FString::Printf(TEXT("%s_%d"), *LabelPrefix, i));
			Spawned.Add(MakeShared<FJsonValueString>(Actor->GetName()));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Spawned);
	Result->SetNumberField(TEXT("count"), Spawned.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPlacementHandlers::HandlePlaceAlongSpline(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString SplineName = Params->GetStringField(TEXT("spline_actor"));
	if (SplineName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'spline_actor' name is required"));
		return;
	}

	AActor* SplineActor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == SplineName || It->GetName() == SplineName) { SplineActor = *It; break; }
	if (!SplineActor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Spline actor not found: %s"), *SplineName)); return; }

	USplineComponent* Spline = SplineActor->FindComponentByClass<USplineComponent>();
	if (!Spline) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_SPLINE"), TEXT("Actor has no spline component")); return; }

	FString ActorType = Params->GetStringField(TEXT("actor_type"));
	if (ActorType.IsEmpty()) ActorType = TEXT("StaticMeshActor");

	int32 Count = (int32)Params->GetNumberField(TEXT("count"));
	if (Count <= 0) Count = 10;

	bool bAlignToSpline = true;
	Params->TryGetBoolField(TEXT("align_to_spline"), bAlignToSpline);

	FString LabelPrefix = Params->GetStringField(TEXT("label_prefix"));
	if (LabelPrefix.IsEmpty()) LabelPrefix = TEXT("SplineActor");

	float SplineLen = Spline->GetSplineLength();

	TArray<TSharedPtr<FJsonValue>> Spawned;
	for (int32 i = 0; i < Count; i++)
	{
		float Dist = (SplineLen * i) / FMath::Max(Count - 1, 1);
		FVector Loc = Spline->GetLocationAtDistanceAlongSpline(Dist, ESplineCoordinateSpace::World);
		FRotator Rot = FRotator::ZeroRotator;
		if (bAlignToSpline)
			Rot = Spline->GetRotationAtDistanceAlongSpline(Dist, ESplineCoordinateSpace::World);

		AActor* Actor = SpawnActorByType(World, ActorType, Loc, Rot);
		if (Actor)
		{
			Actor->SetActorLabel(FString::Printf(TEXT("%s_%d"), *LabelPrefix, i));
			Spawned.Add(MakeShared<FJsonValueString>(Actor->GetName()));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("actors"), Spawned);
	Result->SetNumberField(TEXT("count"), Spawned.Num());
	Result->SetNumberField(TEXT("spline_length"), SplineLen);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
