#include "Handlers/MCPWidgetHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetToolsModule.h"
#include "Blueprint/WidgetBlueprintGeneratedClass.h"
#include "WidgetBlueprint.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Blueprint/UserWidget.h"

void FMCPWidgetHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("widget.create"), &HandleCreate);
	// Widget tree editing (add_element, bind_event) requires deep UMG designer API
	// which is tightly coupled to the Widget Editor's visual tree.
	Registry.RegisterHandler(TEXT("widget.add_element"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_element")));
	Registry.RegisterHandler(TEXT("widget.bind_event"), MCPProtocolHelpers::MakeStub(TEXT("widget.bind_event")));
	Registry.RegisterHandler(TEXT("widget.set_property"), &HandleSetProperty);
	// add_to_viewport and remove require a running game instance (PIE);
	// in editor context we can only modify widget assets, not display them.
	Registry.RegisterHandler(TEXT("widget.add_to_viewport"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_to_viewport")));
	Registry.RegisterHandler(TEXT("widget.remove"), MCPProtocolHelpers::MakeStub(TEXT("widget.remove")));
	Registry.RegisterHandler(TEXT("widget.get_info"), &HandleGetInfo);
}

void FMCPWidgetHandlers::HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString Name = Params->GetStringField(TEXT("name"));
	FString Path = Params->GetStringField(TEXT("path"));
	if (Name.IsEmpty()) { MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'name' is required")); return; }
	if (Path.IsEmpty()) Path = TEXT("/Game/UI");

	IAssetTools& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();
	UObject* Asset = AssetTools.CreateAsset(Name, Path, UWidgetBlueprint::StaticClass(), nullptr);

	if (!Asset)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("CREATE_FAILED"), TEXT("Failed to create widget blueprint"));
		return;
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("name"), Asset->GetName());
	Result->SetStringField(TEXT("path"), Asset->GetPathName());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPWidgetHandlers::HandleSetProperty(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString WidgetPath = Params->GetStringField(TEXT("widget_path"));
	FString PropertyName = Params->GetStringField(TEXT("property_name"));
	FString PropertyValue = Params->GetStringField(TEXT("property_value"));

	if (WidgetPath.IsEmpty() || PropertyName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'widget_path' and 'property_name' are required"));
		return;
	}

	UWidgetBlueprint* WidgetBP = LoadObject<UWidgetBlueprint>(nullptr, *WidgetPath);
	if (!WidgetBP)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Widget not found: %s"), *WidgetPath));
		return;
	}

	// Set property on the widget blueprint's generated class CDO
	UClass* GenClass = WidgetBP->GeneratedClass;
	if (!GenClass)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_CLASS"), TEXT("Widget has no generated class"));
		return;
	}

	UObject* CDO = GenClass->GetDefaultObject();
	FProperty* Property = GenClass->FindPropertyByName(*PropertyName);
	if (!Property)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PROPERTY"), FString::Printf(TEXT("Property not found: %s"), *PropertyName));
		return;
	}

	void* ValuePtr = Property->ContainerPtrToValuePtr<void>(CDO);
	if (!Property->ImportText_Direct(*PropertyValue, ValuePtr, CDO, PPF_None))
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("SET_FAILED"), TEXT("Failed to set property value"));
		return;
	}

	WidgetBP->MarkPackageDirty();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("widget"), WidgetBP->GetName());
	Result->SetStringField(TEXT("property"), PropertyName);
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPWidgetHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry").Get();

	FARFilter Filter;
	Filter.ClassPaths.Add(UWidgetBlueprint::StaticClass()->GetClassPathName());
	TArray<FAssetData> Widgets;
	AssetRegistry.GetAssets(Filter, Widgets);

	TArray<TSharedPtr<FJsonValue>> WidgetArr;
	for (const FAssetData& W : Widgets)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), W.AssetName.ToString());
		Obj->SetStringField(TEXT("path"), W.GetObjectPathString());
		WidgetArr.Add(MakeShared<FJsonValueObject>(Obj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("widgets"), WidgetArr);
	Result->SetNumberField(TEXT("count"), WidgetArr.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
