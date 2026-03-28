#include "Handlers/MCPSplineHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Components/SplineComponent.h"
#include "EngineUtils.h"

void FMCPSplineHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("spline.create"), &HandleCreate);
	Registry.RegisterHandler(TEXT("spline.add_point"), &HandleAddPoint);
	Registry.RegisterHandler(TEXT("spline.set_properties"), &HandleSetProperties);
	Registry.RegisterHandler(TEXT("spline.get_info"), &HandleGetInfo);

	// TODO: ChiR24 — spline mesh deformation
	Registry.RegisterHandler(TEXT("spline.deform_mesh"), MCPProtocolHelpers::MakeStub(TEXT("spline.deform_mesh")));
}

void FMCPSplineHandlers::HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FVector Location = FVector::ZeroVector;
	const TArray<TSharedPtr<FJsonValue>>* LocArr;
	if (Params->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
		Location = FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber());

	AActor* Actor = World->SpawnActor<AActor>(AActor::StaticClass(), Location, FRotator::ZeroRotator);
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn actor")); return; }

	FString Label = Params->GetStringField(TEXT("label"));
	if (!Label.IsEmpty()) Actor->SetActorLabel(Label);

	USplineComponent* Spline = NewObject<USplineComponent>(Actor, TEXT("SplineComponent"));
	Spline->SetupAttachment(Actor->GetRootComponent());
	Spline->RegisterComponent();
	Actor->AddInstanceComponent(Spline);
	Spline->ClearSplinePoints();

	const TArray<TSharedPtr<FJsonValue>>* PointsArr;
	if (Params->TryGetArrayField(TEXT("points"), PointsArr))
	{
		for (const TSharedPtr<FJsonValue>& PtVal : *PointsArr)
		{
			const TArray<TSharedPtr<FJsonValue>>* Pt;
			if (PtVal->TryGetArray(Pt) && Pt->Num() >= 3)
				Spline->AddSplinePoint(FVector((*Pt)[0]->AsNumber(), (*Pt)[1]->AsNumber(), (*Pt)[2]->AsNumber()), ESplineCoordinateSpace::World, true);
		}
	}
	else
	{
		Spline->AddSplinePoint(Location, ESplineCoordinateSpace::World, true);
		Spline->AddSplinePoint(Location + FVector(500, 0, 0), ESplineCoordinateSpace::World, true);
	}
	Spline->UpdateSpline();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), Actor->GetName());
	Result->SetStringField(TEXT("actor_label"), Actor->GetActorLabel());
	Result->SetNumberField(TEXT("point_count"), Spline->GetNumberOfSplinePoints());
	Result->SetNumberField(TEXT("spline_length"), Spline->GetSplineLength());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPSplineHandlers::HandleAddPoint(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	USplineComponent* Spline = Actor->FindComponentByClass<USplineComponent>();
	if (!Spline) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_SPLINE"), TEXT("Actor has no spline component")); return; }

	const TArray<TSharedPtr<FJsonValue>>* PtArr;
	if (!Params->TryGetArrayField(TEXT("point"), PtArr) || PtArr->Num() < 3)
	{ MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'point' [x,y,z] required")); return; }

	Spline->AddSplinePoint(FVector((*PtArr)[0]->AsNumber(), (*PtArr)[1]->AsNumber(), (*PtArr)[2]->AsNumber()), ESplineCoordinateSpace::World, true);
	Spline->UpdateSpline();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("point_index"), Spline->GetNumberOfSplinePoints() - 1);
	Result->SetNumberField(TEXT("total_points"), Spline->GetNumberOfSplinePoints());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPSplineHandlers::HandleSetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	USplineComponent* Spline = Actor->FindComponentByClass<USplineComponent>();
	if (!Spline) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_SPLINE"), TEXT("Actor has no spline component")); return; }

	bool bClosed;
	if (Params->TryGetBoolField(TEXT("closed_loop"), bClosed)) Spline->SetClosedLoop(bClosed);
	Spline->UpdateSpline();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("closed_loop"), Spline->IsClosedLoop());
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPSplineHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	if (Name.IsEmpty())
	{
		TArray<TSharedPtr<FJsonValue>> Splines;
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			USplineComponent* SC = It->FindComponentByClass<USplineComponent>();
			if (!SC) continue;
			TSharedPtr<FJsonObject> S = MakeShared<FJsonObject>();
			S->SetStringField(TEXT("label"), It->GetActorLabel());
			S->SetNumberField(TEXT("point_count"), SC->GetNumberOfSplinePoints());
			S->SetNumberField(TEXT("length"), SC->GetSplineLength());
			S->SetBoolField(TEXT("closed_loop"), SC->IsClosedLoop());
			Splines.Add(MakeShared<FJsonValueObject>(S));
		}
		TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
		Result->SetArrayField(TEXT("splines"), Splines);
		MCPProtocolHelpers::Succeed(OnComplete, Result);
		return;
	}

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	USplineComponent* Spline = Actor->FindComponentByClass<USplineComponent>();
	if (!Spline) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_SPLINE"), TEXT("Actor has no spline component")); return; }

	TArray<TSharedPtr<FJsonValue>> Points;
	for (int32 i = 0; i < Spline->GetNumberOfSplinePoints(); i++)
	{
		FVector P = Spline->GetLocationAtSplinePoint(i, ESplineCoordinateSpace::World);
		Points.Add(MakeShared<FJsonValueArray>(TArray<TSharedPtr<FJsonValue>>{ MakeShared<FJsonValueNumber>(P.X), MakeShared<FJsonValueNumber>(P.Y), MakeShared<FJsonValueNumber>(P.Z) }));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetArrayField(TEXT("points"), Points);
	Result->SetNumberField(TEXT("length"), Spline->GetSplineLength());
	Result->SetBoolField(TEXT("closed_loop"), Spline->IsClosedLoop());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
