#include "Handlers/MCPNiagaraHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"
#include "EngineUtils.h"

void FMCPNiagaraHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// create_system and set_parameter require deep Niagara editor API;
	// activate/deactivate/get_info work on existing Niagara components in the level.
	Registry.RegisterHandler(TEXT("niagara.create_system"), MCPProtocolHelpers::MakeStub(TEXT("niagara.create_system")));
	Registry.RegisterHandler(TEXT("niagara.set_parameter"), MCPProtocolHelpers::MakeStub(TEXT("niagara.set_parameter")));
	Registry.RegisterHandler(TEXT("niagara.activate"), &HandleActivate);
	Registry.RegisterHandler(TEXT("niagara.deactivate"), &HandleDeactivate);
	Registry.RegisterHandler(TEXT("niagara.get_info"), &HandleGetInfo);
}

void FMCPNiagaraHandlers::HandleActivate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UNiagaraComponent* NC = Actor->FindComponentByClass<UNiagaraComponent>();
	if (!NC) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_NIAGARA"), TEXT("Actor has no Niagara component")); return; }

	NC->Activate(true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("activated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPNiagaraHandlers::HandleDeactivate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UNiagaraComponent* NC = Actor->FindComponentByClass<UNiagaraComponent>();
	if (!NC) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_NIAGARA"), TEXT("Actor has no Niagara component")); return; }

	NC->Deactivate();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("deactivated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPNiagaraHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Systems;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		UNiagaraComponent* NC = It->FindComponentByClass<UNiagaraComponent>();
		if (!NC) continue;
		TSharedPtr<FJsonObject> S = MakeShared<FJsonObject>();
		S->SetStringField(TEXT("actor_label"), It->GetActorLabel());
		S->SetStringField(TEXT("actor_name"), It->GetName());
		S->SetBoolField(TEXT("active"), NC->IsActive());
		S->SetStringField(TEXT("system"), NC->GetAsset() ? NC->GetAsset()->GetName() : TEXT("none"));
		Systems.Add(MakeShared<FJsonValueObject>(S));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("niagara_systems"), Systems);
	Result->SetNumberField(TEXT("count"), Systems.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
