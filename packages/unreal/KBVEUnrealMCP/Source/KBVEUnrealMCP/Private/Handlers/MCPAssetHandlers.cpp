#include "Handlers/MCPAssetHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"
#include "Editor.h"

void FMCPAssetHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("asset.search"), &HandleSearch);
	Registry.RegisterHandler(TEXT("asset.get_info"), &HandleGetInfo);
	Registry.RegisterHandler(TEXT("asset.get_references"), &HandleGetReferences);
	Registry.RegisterHandler(TEXT("asset.get_dependents"), &HandleGetDependents);
	Registry.RegisterHandler(TEXT("asset.list"), &HandleList);
	Registry.RegisterHandler(TEXT("asset.validate"), &HandleValidate);

	// TODO: runreal — asset export and advanced search
	Registry.RegisterHandler(TEXT("asset.export_text"), MCPProtocolHelpers::MakeStub(TEXT("asset.export_text")));
	// TODO: AssetToolkit — semantic search and tag filtering
	Registry.RegisterHandler(TEXT("asset.semantic_search"), MCPProtocolHelpers::MakeStub(TEXT("asset.semantic_search")));
	Registry.RegisterHandler(TEXT("asset.filter_by_tag"), MCPProtocolHelpers::MakeStub(TEXT("asset.filter_by_tag")));

	// TODO: ChiR24+runreal — asset management operations
	Registry.RegisterHandler(TEXT("asset.import"), MCPProtocolHelpers::MakeStub(TEXT("asset.import")));
	Registry.RegisterHandler(TEXT("asset.duplicate"), MCPProtocolHelpers::MakeStub(TEXT("asset.duplicate")));
	Registry.RegisterHandler(TEXT("asset.move"), MCPProtocolHelpers::MakeStub(TEXT("asset.move")));
	Registry.RegisterHandler(TEXT("asset.bulk_rename"), MCPProtocolHelpers::MakeStub(TEXT("asset.bulk_rename")));
	Registry.RegisterHandler(TEXT("asset.bulk_delete"), MCPProtocolHelpers::MakeStub(TEXT("asset.bulk_delete")));
	Registry.RegisterHandler(TEXT("asset.fixup_redirectors"), MCPProtocolHelpers::MakeStub(TEXT("asset.fixup_redirectors")));
	Registry.RegisterHandler(TEXT("asset.get_source_control"), MCPProtocolHelpers::MakeStub(TEXT("asset.get_source_control")));
}

void FMCPAssetHandlers::HandleSearch(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Query = Params->GetStringField(TEXT("query"));
	FString ClassFilter = Params->GetStringField(TEXT("class_filter"));
	FString PathFilter = Params->GetStringField(TEXT("path_filter"));
	int32 MaxResults = (int32)Params->GetNumberField(TEXT("max_results"));
	if (MaxResults <= 0) MaxResults = 100;

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	FARFilter Filter;
	if (!PathFilter.IsEmpty())
	{
		Filter.PackagePaths.Add(FName(*PathFilter));
		Filter.bRecursivePaths = true;
	}
	if (!ClassFilter.IsEmpty())
	{
		Filter.ClassPaths.Add(FTopLevelAssetPath(*ClassFilter));
	}

	TArray<FAssetData> Assets;
	AssetRegistry.GetAssets(Filter, Assets);

	TArray<TSharedPtr<FJsonValue>> Results;
	for (const FAssetData& Asset : Assets)
	{
		if (!Query.IsEmpty() && !Asset.AssetName.ToString().Contains(Query))
		{
			continue;
		}

		TSharedPtr<FJsonObject> AssetObj = MakeShared<FJsonObject>();
		AssetObj->SetStringField(TEXT("name"), Asset.AssetName.ToString());
		AssetObj->SetStringField(TEXT("path"), Asset.GetObjectPathString());
		AssetObj->SetStringField(TEXT("class"), Asset.AssetClassPath.ToString());
		AssetObj->SetStringField(TEXT("package"), Asset.PackageName.ToString());
		Results.Add(MakeShared<FJsonValueObject>(AssetObj));

		if (Results.Num() >= MaxResults) break;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("assets"), Results);
	Result->SetNumberField(TEXT("count"), Results.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAssetHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();
	FAssetData AssetData = AssetRegistry.GetAssetByObjectPath(FSoftObjectPath(AssetPath));

	if (!AssetData.IsValid())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Asset not found: %s"), *AssetPath));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), AssetData.AssetName.ToString());
	Result->SetStringField(TEXT("path"), AssetData.GetObjectPathString());
	Result->SetStringField(TEXT("class"), AssetData.AssetClassPath.ToString());
	Result->SetStringField(TEXT("package"), AssetData.PackageName.ToString());
	Result->SetNumberField(TEXT("disk_size"), AssetData.GetPackage() ? AssetData.GetPackage()->GetFileSize() : 0);

	TSharedPtr<FJsonObject> TagsObj = MakeShared<FJsonObject>();
	for (const auto& Tag : AssetData.TagsAndValues)
	{
		TagsObj->SetStringField(Tag.Key.ToString(), Tag.Value.GetValue());
	}
	Result->SetObjectField(TEXT("tags"), TagsObj);

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAssetHandlers::HandleGetReferences(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	TArray<FName> Referencers;
	AssetRegistry.GetReferencers(FName(*AssetPath), Referencers);

	TArray<TSharedPtr<FJsonValue>> RefArray;
	for (const FName& Ref : Referencers)
	{
		RefArray.Add(MakeShared<FJsonValueString>(Ref.ToString()));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("references"), RefArray);
	Result->SetNumberField(TEXT("count"), RefArray.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAssetHandlers::HandleGetDependents(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	TArray<FName> Dependencies;
	AssetRegistry.GetDependencies(FName(*AssetPath), Dependencies);

	TArray<TSharedPtr<FJsonValue>> DepArray;
	for (const FName& Dep : Dependencies)
	{
		DepArray.Add(MakeShared<FJsonValueString>(Dep.ToString()));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("dependents"), DepArray);
	Result->SetNumberField(TEXT("count"), DepArray.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPAssetHandlers::HandleList(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Path = Params->GetStringField(TEXT("path"));
	if (Path.IsEmpty()) Path = TEXT("/Game");

	TSharedPtr<FJsonObject> SearchParams = MakeShared<FJsonObject>();
	SearchParams->SetStringField(TEXT("path_filter"), Path);
	SearchParams->SetNumberField(TEXT("max_results"), Params->GetNumberField(TEXT("max_results")));
	HandleSearch(SearchParams, OnComplete);
}

void FMCPAssetHandlers::HandleValidate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString AssetPath = Params->GetStringField(TEXT("asset_path"));

	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();
	FAssetData AssetData = AssetRegistry.GetAssetByObjectPath(FSoftObjectPath(AssetPath));

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("asset_path"), AssetPath);
	Result->SetBoolField(TEXT("exists"), AssetData.IsValid());

	if (AssetData.IsValid())
	{
		UObject* Asset = AssetData.GetAsset();
		Result->SetBoolField(TEXT("loadable"), Asset != nullptr);
	}

	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
