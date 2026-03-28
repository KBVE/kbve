#include "Handlers/MCPNetworkHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "EngineUtils.h"

void FMCPNetworkHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("network.set_replication"), &HandleSetReplication);
	// Session creation requires online subsystem which varies per project
	Registry.RegisterHandler(TEXT("network.create_session"), MCPProtocolHelpers::MakeStub(TEXT("network.create_session")));
	Registry.RegisterHandler(TEXT("network.get_info"), &HandleGetInfo);

	// TODO: ChiR24 — networking systems
	Registry.RegisterHandler(TEXT("network.set_rpc"), MCPProtocolHelpers::MakeStub(TEXT("network.set_rpc")));
	Registry.RegisterHandler(TEXT("network.manage_prediction"), MCPProtocolHelpers::MakeStub(TEXT("network.manage_prediction")));
	Registry.RegisterHandler(TEXT("network.manage_session"), MCPProtocolHelpers::MakeStub(TEXT("network.manage_session")));
}

void FMCPNetworkHandlers::HandleSetReplication(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString Name = Params->GetStringField(TEXT("name"));
	bool bReplicate = Params->GetBoolField(TEXT("replicate"));

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
		if (It->GetActorLabel() == Name || It->GetName() == Name) { Actor = *It; break; }
	if (!Actor) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *Name)); return; }

	Actor->SetReplicates(bReplicate);

	bool bAlwaysRelevant;
	if (Params->TryGetBoolField(TEXT("always_relevant"), bAlwaysRelevant))
		Actor->bAlwaysRelevant = bAlwaysRelevant;

	double NetUpdateFreq;
	if (Params->TryGetNumberField(TEXT("net_update_frequency"), NetUpdateFreq))
		Actor->NetUpdateFrequency = (float)NetUpdateFreq;

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("actor"), Actor->GetActorLabel());
	Result->SetBoolField(TEXT("replicates"), Actor->GetIsReplicated());
	Result->SetBoolField(TEXT("always_relevant"), Actor->bAlwaysRelevant);
	Result->SetNumberField(TEXT("net_update_frequency"), Actor->NetUpdateFrequency);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPNetworkHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> ReplicatedActors;
	int32 TotalActors = 0;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		TotalActors++;
		if (!It->GetIsReplicated()) continue;
		TSharedPtr<FJsonObject> A = MakeShared<FJsonObject>();
		A->SetStringField(TEXT("label"), It->GetActorLabel());
		A->SetStringField(TEXT("class"), It->GetClass()->GetName());
		A->SetBoolField(TEXT("always_relevant"), It->bAlwaysRelevant);
		A->SetNumberField(TEXT("net_update_frequency"), It->NetUpdateFrequency);
		ReplicatedActors.Add(MakeShared<FJsonValueObject>(A));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("total_actors"), TotalActors);
	Result->SetNumberField(TEXT("replicated_actors"), ReplicatedActors.Num());
	Result->SetArrayField(TEXT("replicated"), ReplicatedActors);
	ENetMode NetMode = World->GetNetMode();
	FString NetModeStr = NetMode == NM_Standalone ? TEXT("Standalone") : NetMode == NM_DedicatedServer ? TEXT("DedicatedServer") : NetMode == NM_ListenServer ? TEXT("ListenServer") : TEXT("Client");
	Result->SetStringField(TEXT("net_mode"), NetModeStr);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
