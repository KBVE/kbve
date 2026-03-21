#include "Handlers/MCPAIHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardData.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Bool.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Float.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Int.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_String.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Object.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Vector.h"
#include "AIController.h"
#include "Editor.h"
#include "EngineUtils.h"

void FMCPAIHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("ai.create_behavior_tree"), &HandleCreateBehaviorTree);
	// add_task requires BT graph node manipulation; kept stubbed
	Registry.RegisterHandler(TEXT("ai.add_task"), MCPProtocolHelpers::MakeStub(TEXT("ai.add_task")));
	Registry.RegisterHandler(TEXT("ai.set_blackboard"), &HandleSetBlackboard);
	Registry.RegisterHandler(TEXT("ai.get_info"), &HandleGetInfo);
}

void FMCPAIHandlers::HandleCreateBehaviorTree(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required")); return; }
	if (Path.IsEmpty()) Path = TEXT("/Game/AI");

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();

	// Create BehaviorTree asset
	UObject* BTAsset = AssetTools.CreateAsset(Name, Path, UBehaviorTree::StaticClass(), nullptr);
	if (!BTAsset)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create behavior tree"));
		return;
	}

	// Optionally create a paired Blackboard
	FString BBName = Params->GetStringField(TEXT("blackboard_name"));
	UBlackboardData* BB = nullptr;
	if (!BBName.IsEmpty())
	{
		UObject* BBAsset = AssetTools.CreateAsset(BBName, Path, UBlackboardData::StaticClass(), nullptr);
		BB = Cast<UBlackboardData>(BBAsset);
		if (BB)
		{
			UBehaviorTree* BT = Cast<UBehaviorTree>(BTAsset);
			if (BT) BT->BlackboardAsset = BB;
		}
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("behavior_tree"), BTAsset->GetName());
	Result->SetStringField(TEXT("path"), BTAsset->GetPathName());
	if (BB) Result->SetStringField(TEXT("blackboard"), BB->GetName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAIHandlers::HandleSetBlackboard(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString BBPath = Params->GetStringField(TEXT("blackboard_path"));
	FString KeyName = Params->GetStringField(TEXT("key_name"));
	FString KeyType = Params->GetStringField(TEXT("key_type"));

	if (BBPath.IsEmpty() || KeyName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'blackboard_path' and 'key_name' are required"));
		return;
	}

	UBlackboardData* BB = LoadObject<UBlackboardData>(nullptr, *BBPath);
	if (!BB)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Blackboard not found: %s"), *BBPath));
		return;
	}

	// Add a new key
	FBlackboardEntry NewEntry;
	NewEntry.EntryName = FName(*KeyName);

	if (KeyType == TEXT("float"))
		NewEntry.KeyType = NewObject<UBlackboardKeyType_Float>(BB);
	else if (KeyType == TEXT("int"))
		NewEntry.KeyType = NewObject<UBlackboardKeyType_Int>(BB);
	else if (KeyType == TEXT("string"))
		NewEntry.KeyType = NewObject<UBlackboardKeyType_String>(BB);
	else if (KeyType == TEXT("vector"))
		NewEntry.KeyType = NewObject<UBlackboardKeyType_Vector>(BB);
	else if (KeyType == TEXT("object"))
		NewEntry.KeyType = NewObject<UBlackboardKeyType_Object>(BB);
	else
		NewEntry.KeyType = NewObject<UBlackboardKeyType_Bool>(BB);

	BB->Keys.Add(NewEntry);
	BB->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("blackboard"), BB->GetName());
	Result->SetStringField(TEXT("key_name"), KeyName);
	Result->SetStringField(TEXT("key_type"), KeyType.IsEmpty() ? TEXT("bool") : KeyType);
	Result->SetNumberField(TEXT("total_keys"), BB->Keys.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAIHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

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
