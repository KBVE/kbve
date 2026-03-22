#include "Handlers/MCPViewportHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "LevelEditorViewport.h"
#include "EditorViewportClient.h"
#include "SLevelViewport.h"
#include "LevelEditor.h"
#include "Misc/FileHelper.h"
#include "ImageUtils.h"
#include "EngineUtils.h"

void FMCPViewportHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("viewport.get_camera"), &HandleGetCamera);
	Registry.RegisterHandler(TEXT("viewport.set_camera"), &HandleSetCamera);
	Registry.RegisterHandler(TEXT("viewport.take_screenshot"), &HandleTakeScreenshot);
	Registry.RegisterHandler(TEXT("viewport.focus_actor"), &HandleFocusActor);
}

static FEditorViewportClient* GetActiveViewportClient()
{
	FLevelEditorModule& LevelEditor = FModuleManager::GetModuleChecked<FLevelEditorModule>(TEXT("LevelEditor"));
	TSharedPtr<SLevelViewport> ActiveViewport = LevelEditor.GetFirstActiveLevelViewport();
	if (ActiveViewport.IsValid())
	{
		return &ActiveViewport->GetLevelViewportClient();
	}
	return nullptr;
}

void FMCPViewportHandlers::HandleGetCamera(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FEditorViewportClient* Client = GetActiveViewportClient();
	if (!Client)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_VIEWPORT"), TEXT("No active viewport"));
		return;
	}

	FVector Loc = Client->GetViewLocation();
	FRotator Rot = Client->GetViewRotation();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	TArray<TSharedPtr<FJsonValue>> LocArr = { MakeShared<FJsonValueNumber>(Loc.X), MakeShared<FJsonValueNumber>(Loc.Y), MakeShared<FJsonValueNumber>(Loc.Z) };
	TArray<TSharedPtr<FJsonValue>> RotArr = { MakeShared<FJsonValueNumber>(Rot.Pitch), MakeShared<FJsonValueNumber>(Rot.Yaw), MakeShared<FJsonValueNumber>(Rot.Roll) };
	Result->SetArrayField(TEXT("location"), LocArr);
	Result->SetArrayField(TEXT("rotation"), RotArr);
	Result->SetNumberField(TEXT("fov"), Client->ViewFOV);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPViewportHandlers::HandleSetCamera(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FEditorViewportClient* Client = GetActiveViewportClient();
	if (!Client)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_VIEWPORT"), TEXT("No active viewport"));
		return;
	}

	const TArray<TSharedPtr<FJsonValue>>* LocArr;
	if (Params->TryGetArrayField(TEXT("location"), LocArr) && LocArr->Num() >= 3)
	{
		Client->SetViewLocation(FVector((*LocArr)[0]->AsNumber(), (*LocArr)[1]->AsNumber(), (*LocArr)[2]->AsNumber()));
	}

	const TArray<TSharedPtr<FJsonValue>>* RotArr;
	if (Params->TryGetArrayField(TEXT("rotation"), RotArr) && RotArr->Num() >= 3)
	{
		Client->SetViewRotation(FRotator((*RotArr)[0]->AsNumber(), (*RotArr)[1]->AsNumber(), (*RotArr)[2]->AsNumber()));
	}

	double FOV;
	if (Params->TryGetNumberField(TEXT("fov"), FOV))
	{
		Client->ViewFOV = (float)FOV;
	}

	Client->Invalidate();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetBoolField(TEXT("updated"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPViewportHandlers::HandleTakeScreenshot(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString OutputPath = Params->GetStringField(TEXT("output_path"));
	if (OutputPath.IsEmpty())
	{
		OutputPath = FPaths::ProjectSavedDir() / TEXT("Screenshots") / FString::Printf(TEXT("MCP_Screenshot_%s.png"), *FDateTime::Now().ToString(TEXT("%Y%m%d_%H%M%S")));
	}

	FEditorViewportClient* Client = GetActiveViewportClient();
	if (!Client || !Client->Viewport)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_VIEWPORT"), TEXT("No active viewport"));
		return;
	}

	FViewport* Viewport = Client->Viewport;
	TArray<FColor> Bitmap;
	int32 Width = Viewport->GetSizeXY().X;
	int32 Height = Viewport->GetSizeXY().Y;

	if (Width <= 0 || Height <= 0)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_VIEWPORT"), TEXT("Viewport has invalid dimensions"));
		return;
	}

	Viewport->ReadPixels(Bitmap);

	IFileManager::Get().MakeDirectory(*FPaths::GetPath(OutputPath), true);
	FFileHelper::CreateBitmap(*OutputPath, Width, Height, Bitmap.GetData());

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("path"), OutputPath);
	Result->SetNumberField(TEXT("width"), Width);
	Result->SetNumberField(TEXT("height"), Height);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPViewportHandlers::HandleFocusActor(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FString ActorName = Params->GetStringField(TEXT("name"));
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available"));
		return;
	}

	AActor* Actor = nullptr;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		if (It->GetActorLabel() == ActorName || It->GetName() == ActorName)
		{
			Actor = *It;
			break;
		}
	}

	if (!Actor)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Actor not found: %s"), *ActorName));
		return;
	}

	GEditor->MoveViewportCamerasToActor(*Actor, false);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("focused"), Actor->GetActorLabel());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
