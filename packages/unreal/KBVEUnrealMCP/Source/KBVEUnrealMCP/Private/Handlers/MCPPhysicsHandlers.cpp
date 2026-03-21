#include "Handlers/MCPPhysicsHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Components/PrimitiveComponent.h"
#include "EngineUtils.h"

void FMCPPhysicsHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("physics.set_properties"), &HandleSetProperties);
	Registry.RegisterHandler(TEXT("physics.enable_simulation"), &HandleEnableSimulation);
	Registry.RegisterHandler(TEXT("physics.get_info"), &HandleGetInfo);
	Registry.RegisterHandler(TEXT("physics.add_constraint"), MCPProtocolHelpers::MakeStub(TEXT("physics.add_constraint")));
}

void FMCPPhysicsHandlers::HandleSetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UPrimitiveComponent* PrimComp = Cast<UPrimitiveComponent>(Actor->GetComponentByClass(UPrimitiveComponent::StaticClass()));
	if (!PrimComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_COMPONENT"), TEXT("Actor has no primitive component")); return; }

	bool bSimulate;
	if (Params->TryGetBoolField(TEXT("simulate_physics"), bSimulate))
		PrimComp->SetSimulatePhysics(bSimulate);

	bool bGravity;
	if (Params->TryGetBoolField(TEXT("enable_gravity"), bGravity))
		PrimComp->SetEnableGravity(bGravity);

	double Val;
	if (Params->TryGetNumberField(TEXT("mass"), Val))
		PrimComp->SetMassOverrideInKg(NAME_None, (float)Val);

	if (Params->TryGetNumberField(TEXT("linear_damping"), Val))
		PrimComp->SetLinearDamping((float)Val);

	if (Params->TryGetNumberField(TEXT("angular_damping"), Val))
		PrimComp->SetAngularDamping((float)Val);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPhysicsHandlers::HandleEnableSimulation(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	bool bEnable = Params->GetBoolField(TEXT("enable"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UPrimitiveComponent* PrimComp = Cast<UPrimitiveComponent>(Actor->GetComponentByClass(UPrimitiveComponent::StaticClass()));
	if (!PrimComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_COMPONENT"), TEXT("Actor has no primitive component")); return; }

	PrimComp->SetSimulatePhysics(bEnable);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("simulating"), bEnable);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPhysicsHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }

	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UPrimitiveComponent* PrimComp = Cast<UPrimitiveComponent>(Actor->GetComponentByClass(UPrimitiveComponent::StaticClass()));
	if (!PrimComp) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_COMPONENT"), TEXT("Actor has no primitive component")); return; }

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("simulate_physics"), PrimComp->IsSimulatingPhysics());
	Result->SetBoolField(TEXT("gravity_enabled"), PrimComp->IsGravityEnabled());
	Result->SetNumberField(TEXT("mass"), PrimComp->GetMass());
	Result->SetNumberField(TEXT("linear_damping"), PrimComp->GetLinearDamping());
	Result->SetNumberField(TEXT("angular_damping"), PrimComp->GetAngularDamping());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPhysicsHandlers::HandleAddConstraint(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_IMPLEMENTED"), TEXT("physics.add_constraint is not yet implemented"));
}
