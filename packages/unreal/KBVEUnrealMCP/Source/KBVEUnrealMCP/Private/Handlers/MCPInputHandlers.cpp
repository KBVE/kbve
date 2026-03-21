#include "Handlers/MCPInputHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetToolsModule.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "EnhancedInputSubsystems.h"
#include "InputModifiers.h"

void FMCPInputHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("input.create_action"), &HandleCreateAction);
	Registry.RegisterHandler(TEXT("input.create_mapping"), &HandleCreateMapping);
	Registry.RegisterHandler(TEXT("input.bind_action"), &HandleBindAction);
	Registry.RegisterHandler(TEXT("input.get_info"), &HandleGetInfo);
}

void FMCPInputHandlers::HandleCreateAction(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required")); return; }
	if (Path.IsEmpty()) Path = TEXT("/Game/Input");

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UInputAction::StaticClass(), nullptr);

	if (!Asset)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create input action"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Asset->GetName());
	Result->SetStringField(TEXT("path"), Asset->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPInputHandlers::HandleCreateMapping(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required")); return; }
	if (Path.IsEmpty()) Path = TEXT("/Game/Input");

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UInputMappingContext::StaticClass(), nullptr);

	if (!Asset)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create input mapping context"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Asset->GetName());
	Result->SetStringField(TEXT("path"), Asset->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPInputHandlers::HandleBindAction(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString IMCPath = Params->GetStringField(TEXT("mapping_context_path"));
	FString ActionPath = Params->GetStringField(TEXT("action_path"));
	FString KeyName = Params->GetStringField(TEXT("key"));

	if (IMCPath.IsEmpty() || ActionPath.IsEmpty() || KeyName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'mapping_context_path', 'action_path', and 'key' are required"));
		return;
	}

	UInputMappingContext* IMC = LoadObject<UInputMappingContext>(nullptr, *IMCPath);
	if (!IMC)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Mapping context not found: %s"), *IMCPath));
		return;
	}

	UInputAction* Action = LoadObject<UInputAction>(nullptr, *ActionPath);
	if (!Action)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Input action not found: %s"), *ActionPath));
		return;
	}

	FKey Key(*KeyName);
	if (!Key.IsValid())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_KEY"), FString::Printf(TEXT("Invalid key name: %s"), *KeyName));
		return;
	}

	FEnhancedActionKeyMapping& Mapping = IMC->MapKey(Action, Key);

	IMC->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("mapping_context"), IMC->GetName());
	Result->SetStringField(TEXT("action"), Action->GetName());
	Result->SetStringField(TEXT("key"), KeyName);
	Result->SetBoolField(TEXT("bound"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPInputHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	FARFilter Filter;
	Filter.ClassPaths.Add(UInputAction::StaticClass()->GetClassPathName());
	TArray<FAssetData> Actions;
	AssetRegistry.GetAssets(Filter, Actions);

	FARFilter MappingFilter;
	MappingFilter.ClassPaths.Add(UInputMappingContext::StaticClass()->GetClassPathName());
	TArray<FAssetData> Mappings;
	AssetRegistry.GetAssets(MappingFilter, Mappings);

	TArray<TSharedPtr<FJsonValue>> ActionArr;
	for (const FAssetData& A : Actions)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), A.AssetName.ToString());
		Obj->SetStringField(TEXT("path"), A.GetObjectPathString());
		ActionArr.Add(MakeShared<FJsonValueObject>(Obj));
	}

	TArray<TSharedPtr<FJsonValue>> MappingArr;
	for (const FAssetData& M : Mappings)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), M.AssetName.ToString());
		Obj->SetStringField(TEXT("path"), M.GetObjectPathString());
		MappingArr.Add(MakeShared<FJsonValueObject>(Obj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("input_actions"), ActionArr);
	Result->SetArrayField(TEXT("input_mapping_contexts"), MappingArr);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
