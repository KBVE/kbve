#include "Handlers/MCPAIHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardData.h"
#include "AIController.h"
#include "Editor.h"
#include "EngineUtils.h"

void FMCPAIHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// BT/Blackboard creation via asset tools requires specific factories;
	// stubbed until properly integrated.
	Registry.RegisterHandler(TEXT("ai.create_behavior_tree"), MCPProtocolHelpers::MakeStub(TEXT("ai.create_behavior_tree")));
	Registry.RegisterHandler(TEXT("ai.add_task"), MCPProtocolHelpers::MakeStub(TEXT("ai.add_task")));
	Registry.RegisterHandler(TEXT("ai.set_blackboard"), MCPProtocolHelpers::MakeStub(TEXT("ai.set_blackboard")));
	Registry.RegisterHandler(TEXT("ai.get_info"), &HandleGetInfo);
}

void FMCPAIHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	// List behavior trees
	FARFilter BTFilter;
	BTFilter.ClassPaths.Add(UBehaviorTree::StaticClass()->GetClassPathName());
	TArray<FAssetData> BTs;
	AssetRegistry.GetAssets(BTFilter, BTs);

	TArray<TSharedPtr<FJsonValue>> BTArr;
	for (const FAssetData& A : BTs)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), A.AssetName.ToString());
		Obj->SetStringField(TEXT("path"), A.GetObjectPathString());
		BTArr.Add(MakeShared<FJsonValueObject>(Obj));
	}

	// List blackboard data
	FARFilter BBFilter;
	BBFilter.ClassPaths.Add(UBlackboardData::StaticClass()->GetClassPathName());
	TArray<FAssetData> BBs;
	AssetRegistry.GetAssets(BBFilter, BBs);

	TArray<TSharedPtr<FJsonValue>> BBArr;
	for (const FAssetData& A : BBs)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), A.AssetName.ToString());
		Obj->SetStringField(TEXT("path"), A.GetObjectPathString());
		BBArr.Add(MakeShared<FJsonValueObject>(Obj));
	}

	// List AI controllers in world
	TArray<TSharedPtr<FJsonValue>> Controllers;
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (World)
	{
		for (TActorIterator<AAIController> It(World); It; ++It)
		{
			TSharedPtr<FJsonObject> C = MakeShared<FJsonObject>();
			C->SetStringField(TEXT("name"), It->GetName());
			C->SetStringField(TEXT("class"), It->GetClass()->GetName());
			APawn* Pawn = It->GetPawn();
			if (Pawn) C->SetStringField(TEXT("pawn"), Pawn->GetActorLabel());
			Controllers.Add(MakeShared<FJsonValueObject>(C));
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("behavior_trees"), BTArr);
	Result->SetArrayField(TEXT("blackboard_data"), BBArr);
	Result->SetArrayField(TEXT("ai_controllers"), Controllers);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
