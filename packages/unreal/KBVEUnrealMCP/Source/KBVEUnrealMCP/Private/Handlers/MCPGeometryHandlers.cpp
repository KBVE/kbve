#include "Handlers/MCPGeometryHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "Components/StaticMeshComponent.h"
#include "EngineUtils.h"

void FMCPGeometryHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("geometry.create_procedural_mesh"), &HandleCreateProceduralMesh);
	// set_vertices requires ProceduralMeshComponent which is in a separate plugin module
	Registry.RegisterHandler(TEXT("geometry.set_vertices"), MCPProtocolHelpers::MakeStub(TEXT("geometry.set_vertices")));
	Registry.RegisterHandler(TEXT("geometry.get_info"), &HandleGetInfo);

	// TODO: ChiR24 — advanced geometry operations
	Registry.RegisterHandler(TEXT("geometry.create_static_mesh"), MCPProtocolHelpers::MakeStub(TEXT("geometry.create_static_mesh")));
	Registry.RegisterHandler(TEXT("geometry.merge_meshes"), MCPProtocolHelpers::MakeStub(TEXT("geometry.merge_meshes")));
}

void FMCPGeometryHandlers::HandleCreateProceduralMesh(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Shape = Params->GetStringField(TEXT("shape")).ToLower();
	FVector Location = FVector::ZeroVector;
	const TArray<TSharedPtr<FJsonValue>>* LocArr;
	if (Params->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
		Location = FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber());

	// Use built-in engine shapes as a practical alternative to ProceduralMeshComponent
	FString MeshPath;
	if (Shape == TEXT("sphere"))
		MeshPath = TEXT("/Engine/BasicShapes/Sphere.Sphere");
	else if (Shape == TEXT("cylinder"))
		MeshPath = TEXT("/Engine/BasicShapes/Cylinder.Cylinder");
	else if (Shape == TEXT("cone"))
		MeshPath = TEXT("/Engine/BasicShapes/Cone.Cone");
	else if (Shape == TEXT("plane"))
		MeshPath = TEXT("/Engine/BasicShapes/Plane.Plane");
	else
		MeshPath = TEXT("/Engine/BasicShapes/Cube.Cube");

	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *MeshPath);
	if (!Mesh) { MCPProtocolHelpers::Fail(OnComplete, TEXT("LOAD_FAILED"), TEXT("Failed to load basic shape mesh")); return; }

	AActor* Actor = World->SpawnActor<AActor>(AActor::StaticClass(), Location, FRotator::ZeroRotator);
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("SPAWN_FAILED"), TEXT("Failed to spawn actor")); return; }

	FString Label = Params->GetStringField(TEXT("label"));
	if (!Label.IsEmpty()) Actor->SetActorLabel(Label);

	UStaticMeshComponent* MeshComp = NewObject<UStaticMeshComponent>(Actor, TEXT("MeshComponent"));
	MeshComp->SetStaticMesh(Mesh);
	MeshComp->SetupAttachment(Actor->GetRootComponent());
	MeshComp->RegisterComponent();
	Actor->AddInstanceComponent(MeshComp);

	const TArray<TSharedPtr<FJsonValue>>* ScaleArr;
	if (Params->TryGetArrayField(TEXT("scale"), ScaleArr) && ScaleArr->Num() >= 3)
		Actor->SetActorScale3D(FVector((*ScaleArr)[0]->AsNumber(), (*ScaleArr)[1]->AsNumber(), (*ScaleArr)[2]->AsNumber()));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor_name"), Actor->GetName());
	Result->SetStringField(TEXT("actor_label"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("shape"), Shape.IsEmpty() ? TEXT("cube") : Shape);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPGeometryHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Meshes;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		UStaticMeshComponent* SMC = It->FindComponentByClass<UStaticMeshComponent>();
		if (!SMC || !SMC->GetStaticMesh()) continue;
		TSharedPtr<FJsonObject> M = MakeShared<FJsonObject>();
		M->SetStringField(TEXT("actor_label"), It->GetActorLabel());
		M->SetStringField(TEXT("mesh"), SMC->GetStaticMesh()->GetName());
		M->SetNumberField(TEXT("triangle_count"), SMC->GetStaticMesh()->GetNumTriangles(0));
		M->SetNumberField(TEXT("material_count"), SMC->GetNumMaterials());
		Meshes.Add(MakeShared<FJsonValueObject>(M));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("static_meshes"), Meshes);
	Result->SetNumberField(TEXT("count"), Meshes.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
