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
	// create_system requires Niagara editor graph API — kept stubbed
	Registry.RegisterHandler(TEXT("niagara.create_system"), MCPProtocolHelpers::MakeStub(TEXT("niagara.create_system")));
	Registry.RegisterHandler(TEXT("niagara.set_parameter"), &HandleSetParameter);
	Registry.RegisterHandler(TEXT("niagara.activate"), &HandleActivate);
	Registry.RegisterHandler(TEXT("niagara.deactivate"), &HandleDeactivate);
	Registry.RegisterHandler(TEXT("niagara.get_info"), &HandleGetInfo);
}

void FMCPNiagaraHandlers::HandleSetParameter(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	FString ParamName = Params->GetStringField(TEXT("parameter_name"));
	FString ParamType = Params->GetStringField(TEXT("parameter_type")).ToLower();

	if (ParamName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'parameter_name' is required"));
		return;
	}

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	UNiagaraComponent* NC = Actor->FindComponentByClass<UNiagaraComponent>();
	if (!NC) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_NIAGARA"), TEXT("Actor has no Niagara component")); return; }

	FName FParamName(*ParamName);

	if (ParamType == TEXT("float"))
	{
		double Val = Params->GetNumberField(TEXT("value"));
		NC->SetVariableFloat(FParamName, (float)Val);
	}
	else if (ParamType == TEXT("int"))
	{
		int32 Val = (int32)Params->GetNumberField(TEXT("value"));
		NC->SetVariableInt(FParamName, Val);
	}
	else if (ParamType == TEXT("bool"))
	{
		bool Val = Params->GetBoolField(TEXT("value"));
		NC->SetVariableBool(FParamName, Val);
	}
	else if (ParamType == TEXT("vector"))
	{
		const TArray<TSharedPtr<FJsonValue>>* Arr;
		if (Params->TryGetArrayField(TEXT("value"), Arr) && Arr->Num() >= 3)
		{
			FVector Vec((*Arr)[0]->AsNumber(), (*Arr)[1]->AsNumber(), (*Arr)[2]->AsNumber());
			NC->SetVariableVec3(FParamName, Vec);
		}
	}
	else if (ParamType == TEXT("color") || ParamType == TEXT("linear_color"))
	{
		const TArray<TSharedPtr<FJsonValue>>* Arr;
		if (Params->TryGetArrayField(TEXT("value"), Arr) && Arr->Num() >= 3)
		{
			FLinearColor Color(
				(float)(*Arr)[0]->AsNumber(),
				(float)(*Arr)[1]->AsNumber(),
				(float)(*Arr)[2]->AsNumber(),
				Arr->Num() >= 4 ? (float)(*Arr)[3]->AsNumber() : 1.0f
			);
			NC->SetVariableLinearColor(FParamName, Color);
		}
	}
	else
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("parameter_type must be float, int, bool, vector, or color"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetStringField(TEXT("parameter"), ParamName);
	Result->SetStringField(TEXT("type"), ParamType);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
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
