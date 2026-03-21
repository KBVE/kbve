#include "Handlers/MCPLandscapeHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Landscape.h"
#include "LandscapeProxy.h"
#include "LandscapeInfo.h"
#include "EngineUtils.h"

void FMCPLandscapeHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// Sculpt, flatten, smooth, paint_layer require direct height/weight map API
	// which is complex and editor-mode-dependent. Keep stubbed for safety.
	Registry.RegisterHandler(TEXT("landscape.sculpt"), MCPProtocolHelpers::MakeStub(TEXT("landscape.sculpt")));
	Registry.RegisterHandler(TEXT("landscape.flatten"), MCPProtocolHelpers::MakeStub(TEXT("landscape.flatten")));
	Registry.RegisterHandler(TEXT("landscape.smooth"), MCPProtocolHelpers::MakeStub(TEXT("landscape.smooth")));
	Registry.RegisterHandler(TEXT("landscape.paint_layer"), MCPProtocolHelpers::MakeStub(TEXT("landscape.paint_layer")));
	Registry.RegisterHandler(TEXT("landscape.get_info"), &HandleGetInfo);
}

void FMCPLandscapeHandlers::HandleGetInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Landscapes;
	for (TActorIterator<ALandscapeProxy> It(World); It; ++It)
	{
		ALandscapeProxy* Proxy = *It;
		TSharedPtr<FJsonObject> L = MakeShared<FJsonObject>();
		L->SetStringField(TEXT("name"), Proxy->GetName());
		L->SetStringField(TEXT("label"), Proxy->GetActorLabel());
		L->SetStringField(TEXT("class"), Proxy->GetClass()->GetName());

		FVector Origin, Extent;
		Proxy->GetActorBounds(false, Origin, Extent);
		L->SetArrayField(TEXT("origin"), { MakeShared<FJsonValueNumber>(Origin.X), MakeShared<FJsonValueNumber>(Origin.Y), MakeShared<FJsonValueNumber>(Origin.Z) });
		L->SetArrayField(TEXT("extent"), { MakeShared<FJsonValueNumber>(Extent.X), MakeShared<FJsonValueNumber>(Extent.Y), MakeShared<FJsonValueNumber>(Extent.Z) });

		L->SetNumberField(TEXT("component_count"), Proxy->LandscapeComponents.Num());

		Landscapes.Add(MakeShared<FJsonValueObject>(L));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("landscapes"), Landscapes);
	Result->SetNumberField(TEXT("count"), Landscapes.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
