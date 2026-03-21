#include "Handlers/MCPWidgetHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "AssetToolsModule.h"
#include "Blueprint/WidgetBlueprintGeneratedClass.h"
#include "WidgetBlueprint.h"

void FMCPWidgetHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("widget.create"), &HandleCreate);
	// UMG widget manipulation requires complex Slate tree editing;
	// these remain stubbed until the Widget editor API is wrapped.
	Registry.RegisterHandler(TEXT("widget.add_element"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_element")));
	Registry.RegisterHandler(TEXT("widget.bind_event"), MCPProtocolHelpers::MakeStub(TEXT("widget.bind_event")));
	Registry.RegisterHandler(TEXT("widget.set_property"), MCPProtocolHelpers::MakeStub(TEXT("widget.set_property")));
	Registry.RegisterHandler(TEXT("widget.add_to_viewport"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_to_viewport")));
	Registry.RegisterHandler(TEXT("widget.remove"), MCPProtocolHelpers::MakeStub(TEXT("widget.remove")));
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
