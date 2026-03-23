#include "Handlers/MCPStreamingHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Editor.h"
#include "Engine/World.h"
#include "Engine/LevelStreaming.h"
#include "Engine/LevelStreamingDynamic.h"
#include "EditorLevelUtils.h"

void FMCPStreamingHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("streaming.list_levels"), &HandleListLevels);
	Registry.RegisterHandler(TEXT("streaming.load_level"), &HandleLoadLevel);
	Registry.RegisterHandler(TEXT("streaming.unload_level"), &HandleUnloadLevel);
	Registry.RegisterHandler(TEXT("streaming.set_visibility"), &HandleSetVisibility);
}

void FMCPStreamingHandlers::HandleListLevels(const TSharedPtr<FJsonObject>& /*Params*/, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	TArray<TSharedPtr<FJsonValue>> Levels;

	// Persistent level
	{
		TSharedPtr<FJsonObject> PL = MakeShared<FJsonObject>();
		PL->SetStringField(TEXT("name"), World->GetMapName());
		PL->SetBoolField(TEXT("persistent"), true);
		PL->SetBoolField(TEXT("loaded"), true);
		PL->SetBoolField(TEXT("visible"), true);
		Levels.Add(MakeShared<FJsonValueObject>(PL));
	}

	// Streaming levels
	const TArray<ULevelStreaming*>& StreamingLevels = World->GetStreamingLevels();
	for (ULevelStreaming* SL : StreamingLevels)
	{
		if (!SL) continue;

		TSharedPtr<FJsonObject> LObj = MakeShared<FJsonObject>();
		LObj->SetStringField(TEXT("name"), SL->GetWorldAssetPackageName());
		LObj->SetBoolField(TEXT("persistent"), false);
		LObj->SetBoolField(TEXT("loaded"), SL->GetLoadedLevel() != nullptr);
		LObj->SetBoolField(TEXT("visible"), SL->GetShouldBeVisibleInEditor());
		LObj->SetStringField(TEXT("package"), SL->GetWorldAssetPackageFName().ToString());
		Levels.Add(MakeShared<FJsonValueObject>(LObj));
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetArrayField(TEXT("levels"), Levels);
	Result->SetNumberField(TEXT("count"), Levels.Num());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPStreamingHandlers::HandleLoadLevel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString LevelPath = Params->GetStringField(TEXT("level"));
	if (LevelPath.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'level' path is required"));
		return;
	}

	ULevelStreaming* StreamingLevel = EditorLevelUtils::AddLevelToWorld(
		World, *LevelPath, ULevelStreamingDynamic::StaticClass());

	if (!StreamingLevel)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("LOAD_FAILED"), FString::Printf(TEXT("Failed to load level: %s"), *LevelPath));
		return;
	}

	StreamingLevel->SetShouldBeVisibleInEditor(true);

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("level"), LevelPath);
	Result->SetBoolField(TEXT("loaded"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPStreamingHandlers::HandleUnloadLevel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString LevelName = Params->GetStringField(TEXT("level"));
	if (LevelName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'level' name is required"));
		return;
	}

	const TArray<ULevelStreaming*>& StreamingLevels = World->GetStreamingLevels();
	ULevelStreaming* Target = nullptr;
	for (ULevelStreaming* SL : StreamingLevels)
	{
		if (SL && (SL->GetWorldAssetPackageName().Contains(LevelName) || SL->GetWorldAssetPackageFName().ToString().Contains(LevelName)))
		{
			Target = SL;
			break;
		}
	}

	if (!Target)
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Streaming level not found: %s"), *LevelName));
		return;
	}

	ULevel* LoadedLevel = Target->GetLoadedLevel();
	if (LoadedLevel)
	{
		EditorLevelUtils::RemoveLevelFromWorld(LoadedLevel);
	}

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("level"), LevelName);
	Result->SetBoolField(TEXT("unloaded"), true);
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPStreamingHandlers::HandleSetVisibility(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	UWorld* World = GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
	if (!World) { MCPProtocolHelpers::Fail(OnComplete, TEXT("NO_WORLD"), TEXT("No editor world available")); return; }

	FString LevelName = Params->GetStringField(TEXT("level"));
	if (LevelName.IsEmpty())
	{
		MCPProtocolHelpers::Fail(OnComplete, TEXT("INVALID_PARAMS"), TEXT("'level' name is required"));
		return;
	}

	bool bVisible = true;
	Params->TryGetBoolField(TEXT("visible"), bVisible);

	const TArray<ULevelStreaming*>& StreamingLevels = World->GetStreamingLevels();
	for (ULevelStreaming* SL : StreamingLevels)
	{
		if (SL && (SL->GetWorldAssetPackageName().Contains(LevelName) || SL->GetWorldAssetPackageFName().ToString().Contains(LevelName)))
		{
			SL->SetShouldBeVisibleInEditor(bVisible);

			TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
			Result->SetStringField(TEXT("level"), LevelName);
			Result->SetBoolField(TEXT("visible"), bVisible);
			MCPProtocolHelpers::Succeed(OnComplete, Result);
			return;
		}
	}

	MCPProtocolHelpers::Fail(OnComplete, TEXT("NOT_FOUND"), FString::Printf(TEXT("Streaming level not found: %s"), *LevelName));
}
